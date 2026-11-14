import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mock, resetMocks, calls, res, makeEnv, dropEnv } from "./helpers.mjs";
import * as C from "../src/core.mjs";
import { MAYBE_LIVE } from "../src/core.mjs";
import { db } from "../src/db.mjs";

let env;
before(async () => { env = await makeEnv(); });
after(async () => { await dropEnv(env); });
beforeEach(async () => {
  resetMocks();
  await db(env).q(`TRUNCATE mob_submissions, mob_posts, mob_campaigns, mob_accounts RESTART IDENTITY CASCADE`);
  mock("HEAD", "https://blackreaper.us/media/", () => res("", 200));
});

const future = (min) => new Date(Date.now() + min * 60000).toISOString();
const acct = (platform, ext, extra = {}) => C.upsertAccount(env, platform, { external_id: ext, handle: ext, access_token: "AT-" + ext, refresh_token: "RT-" + ext, token_expires_at: future(120), scopes: "x", meta: {}, ...extra });
const post = async (account_id, extra = {}) => db(env).one(`INSERT INTO mob_posts (account_id, clip_key, caption, scheduled_at, created_by) VALUES ($1,$2,$3,now() - interval '1 minute','api') RETURNING *`, [account_id, extra.clip_key || "oraktys-a.mp4", extra.caption || "cap"]);
const get = (id) => db(env).one(`SELECT * FROM mob_posts WHERE id=$1`, [id]);
const ytOk = (id = "vid1") => {
  mock("POST", "https://www.googleapis.com/upload/youtube/v3/videos", () => res("", 200, { location: "https://up.example/s" }));
  mock("PUT", "https://up.example/s", () => res({ id }, 201));
};

test("YouTube post goes out on a tick; tokens are stored encrypted", async () => {
  const a = await acct("youtube", "UC1");
  const raw = await db(env).one(`SELECT access_token FROM mob_accounts WHERE id=$1`, [a.id]);
  assert.match(raw.access_token, /^v1\./); assert.ok(!raw.access_token.includes("AT-UC1"));
  const p = await post(a.id);
  ytOk();
  const r = await C.runTick(env);
  assert.equal(r.claimed, 1);
  const g = await get(p.id);
  assert.equal(g.status, "posted"); assert.equal(g.remote_url, "https://www.youtube.com/shorts/vid1"); assert.equal(g.attempts, 1);
  assert.equal(calls.find((c) => c.method === "POST").headers.authorization, "Bearer AT-UC1");
});

test("unconnected/disabled accounts are skipped; a throwing post does not stop the others", async () => {
  const a = await acct("youtube", "UC1");
  const off = await acct("instagram", "IG1");
  await db(env).q(`UPDATE mob_accounts SET status='disabled' WHERE id=$1`, [off.id]);
  const p1 = await post(off.id);
  const p2 = await post(a.id, { clip_key: "oraktys-missing.mp4" });
  const p3 = await post(a.id);
  const orphan = await db(env).one(`INSERT INTO mob_posts (account_id, clip_key, scheduled_at) VALUES (NULL,'oraktys-a.mp4',now()) RETURNING id`);
  ytOk();
  const r = await C.runTick(env);
  assert.equal(r.claimed, 4); assert.deepEqual(r.errors, []);
  assert.equal((await get(p1.id)).status, "skipped");
  assert.equal((await get(p2.id)).status, "failed"); assert.match((await get(p2.id)).error, /not in storage/);
  assert.equal((await get(p3.id)).status, "posted");
  assert.equal((await get(orphan.id)).status, "skipped");
});

test("a platform module that throws a plain Error fails only that post", async () => {
  const a = await acct("youtube", "UC1");
  const b = await acct("tiktok", "tt1");
  const p1 = await post(a.id), p2 = await post(b.id);
  ytOk();
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", () => { throw new Error("socket hang up"); });
  await C.runTick(env);
  assert.equal((await get(p1.id)).status, "posted");
  assert.equal((await get(p2.id)).status, "failed"); assert.match((await get(p2.id)).error, /socket hang up/);
});

test("401 -> refresh -> retry once succeeds", async () => {
  const a = await acct("youtube", "UC1");
  const p = await post(a.id);
  let n = 0;
  mock("POST", "https://www.googleapis.com/upload/youtube/v3/videos", (r) => (r.headers.authorization === "Bearer NEW" ? res("", 200, { location: "https://up.example/s" }) : (n++, res({ error: { message: "Invalid Credentials", errors: [{ reason: "authError" }] } }, 401))));
  mock("PUT", "https://up.example/s", () => res({ id: "v2" }, 201));
  mock("POST", "https://oauth2.googleapis.com/token", (r) => { assert.equal(new URLSearchParams(r.body).get("refresh_token"), "RT-UC1"); return { access_token: "NEW", expires_in: 3599 }; });
  await C.runTick(env);
  assert.equal(n, 1);
  assert.equal((await get(p.id)).status, "posted");
  assert.equal((await C.loadAccount(env, a.id)).access_token, "NEW");
});

test("401 and refresh fails -> account needs_reconnect, post failed, later posts skipped", async () => {
  const a = await acct("youtube", "UC1");
  const p = await post(a.id);
  mock("POST", "https://www.googleapis.com/upload/youtube/v3/videos", () => res({ error: { message: "Invalid Credentials", errors: [{ reason: "authError" }] } }, 401));
  mock("POST", "https://oauth2.googleapis.com/token", () => res({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400));
  await C.runTick(env);
  const g = await get(p.id);
  assert.equal(g.status, "failed"); assert.match(g.error, /Reconnect/);
  const acc = await C.loadAccount(env, a.id);
  assert.equal(acc.status, "needs_reconnect"); assert.match(acc.last_error, /invalid_grant: Token has been expired or revoked/);
  const p2 = await post(a.id);
  await C.runTick(env);
  assert.equal((await get(p2.id)).status, "skipped");
});

test("5xx is rescheduled with backoff; the 3rd attempt fails for good", async () => {
  const a = await acct("youtube", "UC1");
  const p = await post(a.id);
  mock("POST", "https://www.googleapis.com/upload/youtube/v3/videos", () => res({ error: { message: "Backend Error", errors: [{ reason: "backendError" }] } }, 503));
  await C.runTick(env);
  let g = await get(p.id);
  assert.equal(g.status, "scheduled"); assert.equal(g.attempts, 1); assert.equal(g.error, "503 backendError: Backend Error");
  const delay = (new Date(g.scheduled_at) - Date.now()) / 60000;
  assert.ok(delay > 8 && delay <= 10.5, `delay ${delay}`);
  for (let i = 2; i <= 3; i++) {
    await db(env).q(`UPDATE mob_posts SET scheduled_at=now() - interval '1 second' WHERE id=$1`, [p.id]);
    await C.runTick(env);
  }
  g = await get(p.id);
  assert.equal(g.status, "failed"); assert.equal(g.attempts, 3);
});

test("Instagram: processing on first tick, posted on a later tick", async () => {
  const a = await acct("instagram", "17841");
  const p = await post(a.id);
  mock("POST", /\/17841\/media$/, () => ({ id: "C1" }));
  let st = "IN_PROGRESS";
  mock("GET", "https://graph.instagram.com/v27.0/C1", () => ({ status_code: st }));
  mock("POST", /\/media_publish$/, () => ({ id: "M1" }));
  mock("GET", "https://graph.instagram.com/v27.0/M1", () => ({ permalink: "https://www.instagram.com/reel/x/" }));
  await C.runTick(env);
  assert.equal((await get(p.id)).status, "processing");
  st = "FINISHED";
  await C.runTick(env);
  const g = await get(p.id);
  assert.equal(g.status, "posted"); assert.equal(g.remote_url, "https://www.instagram.com/reel/x/"); assert.equal(g.remote_id, "M1");
});

test("TikTok: unaudited error is stored verbatim and not retried", async () => {
  const a = await acct("tiktok", "tt1");
  const p = await post(a.id);
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", () => ({ data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } }));
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/video/init/", () => res({ error: { code: "unaudited_client_can_only_post_to_private_accounts", message: "Please review our integration guidelines" } }, 403));
  await C.runTick(env);
  const g = await get(p.id);
  assert.equal(g.status, "failed"); assert.equal(g.error, "403 unaudited_client_can_only_post_to_private_accounts: Please review our integration guidelines");
});

test("TikTok: processing -> posted, privacy recorded", async () => {
  const a = await acct("tiktok", "tt1");
  const p = await post(a.id);
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", () => ({ data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } }));
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/video/init/", () => ({ data: { publish_id: "pub1" }, error: { code: "ok" } }));
  let s = { status: "PROCESSING_DOWNLOAD" };
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/status/fetch/", () => ({ data: s, error: { code: "ok" } }));
  await C.runTick(env);
  let g = await get(p.id);
  assert.equal(g.status, "processing"); assert.equal(g.privacy, "SELF_ONLY"); assert.equal(g.remote_id, "pub1");
  s = { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["7301"] };
  await C.runTick(env);
  g = await get(p.id);
  assert.equal(g.status, "posted"); assert.equal(g.remote_url, "https://www.tiktok.com/@tt1/video/7301");
});

test("two concurrent ticks never post the same row twice (SKIP LOCKED)", async () => {
  const a = await acct("youtube", "UC1");
  const ids = [];
  for (let i = 0; i < 8; i++) ids.push((await post(a.id)).id);
  let uploads = 0;
  mock("POST", "https://www.googleapis.com/upload/youtube/v3/videos", () => res("", 200, { location: "https://up.example/s" }));
  mock("PUT", "https://up.example/s", () => res({ id: "v" + ++uploads }, 201));
  const [r1, r2] = await Promise.all([C.runTick(env), C.runTick(env)]);
  assert.ok(r1.claimed + r2.claimed <= 8);
  await C.runTick(env); await C.runTick(env);
  const rows = await db(env).q(`SELECT status, attempts FROM mob_posts`);
  assert.ok(rows.every((r) => r.status === "posted" && r.attempts === 1), JSON.stringify(rows));
  assert.equal(uploads, 8);
});

test("stale publishing reaped; processing > 60 min times out", async () => {
  const a = await acct("youtube", "UC1");
  const p1 = await db(env).one(`INSERT INTO mob_posts (account_id, clip_key, scheduled_at, status, updated_at) VALUES ($1,'k',now(),'publishing',now() - interval '20 minutes') RETURNING id`, [a.id]);
  const p2 = await db(env).one(`INSERT INTO mob_posts (account_id, clip_key, scheduled_at, status, remote_id, updated_at) VALUES ($1,'k',now(),'processing','x',now() - interval '61 minutes') RETURNING id`, [a.id]);
  const r = await C.runTick(env);
  assert.equal(r.reaped, 1);
  assert.equal((await get(p1.id)).error, MAYBE_LIVE);
  assert.equal((await get(p2.id)).error, "Timed out processing");
});

test("YouTube daily cap: the 101st upload is not attempted and moves to tomorrow", async () => {
  const a = await acct("youtube", "UC1");
  await db(env).q(`INSERT INTO mob_posts (account_id, clip_key, scheduled_at, status, updated_at) SELECT $1,'k',now(),'posted',now() FROM generate_series(1,100)`, [a.id]);
  const p = await post(a.id);
  ytOk();
  await C.runTick(env);
  assert.equal(calls.filter((c) => c.url.includes("googleapis")).length, 0);
  const g = await get(p.id);
  assert.equal(g.status, "scheduled"); assert.equal(g.attempts, 0); assert.match(g.error, /daily upload limit/);
  assert.ok(new Date(g.scheduled_at) > new Date());
});

test("cron refreshes expiring TikTok tokens and saves the rotated refresh token", async () => {
  const a = await acct("tiktok", "tt1", { token_expires_at: future(5) });
  mock("POST", "https://open.tiktokapis.com/v2/oauth/token/", (r) => { assert.equal(new URLSearchParams(r.body).get("refresh_token"), "RT-tt1"); return { access_token: "AT2", expires_in: 86400, refresh_token: "RT2", refresh_expires_in: 15552000, open_id: "tt1" }; });
  const r = await C.runTick(env);
  assert.equal(r.refreshed, 1);
  const g = await C.loadAccount(env, a.id);
  assert.equal(g.access_token, "AT2"); assert.equal(g.refresh_token, "RT2");
});

test("createPosts: platforms with nothing connected are listed as skipped", async () => {
  const a = await acct("youtube", "UC1");
  await acct("instagram", "IG1");
  const r = await C.createPosts(env, { clip_key: "oraktys-a.mp4", platforms: ["youtube", "instagram", "tiktok", "myspace"], spread_minutes: 10 });
  assert.equal(r.posts.length, 2);
  assert.deepEqual(r.skipped.map((s) => s.platform), ["tiktok", "myspace"]);
  assert.equal(new Date(r.posts[1].scheduled_at) - new Date(r.posts[0].scheduled_at), 600000);
  assert.ok(a.id);
});

test("a 5xx / 429 / network failure on refresh keeps the account connected and reschedules the post", async () => {
  const a = await acct("youtube", "UCb", { token_expires_at: future(-5) });
  for (const failure of [() => res({ error: "backend" }, 503), () => res({ error: "rate" }, 429), () => { throw new TypeError("fetch failed"); }]) {
    resetMocks();
    mock("HEAD", "https://blackreaper.us/media/", () => res("", 200));
    mock("POST", "https://oauth2.googleapis.com/token", failure);
    await C.refreshDue(env);
    assert.equal((await db(env).one(`SELECT status FROM mob_accounts WHERE id=$1`, [a.id])).status, "connected");
  }
  // withAuth path: upload 401, refresh 503 -> post rescheduled, account connected
  resetMocks();
  mock("HEAD", "https://blackreaper.us/media/", () => res("", 200));
  mock("POST", "https://www.googleapis.com/upload/youtube/v3/videos", () => res({ error: { message: "bad creds", errors: [{ reason: "authError" }] } }, 401));
  mock("POST", "https://oauth2.googleapis.com/token", () => res({ error: "backend" }, 503));
  const p = await post(a.id);
  const [claimed] = await C.claimDue(env);
  await C.processPost(env, claimed);
  assert.equal((await get(p.id)).status, "scheduled");
  assert.equal((await db(env).one(`SELECT status FROM mob_accounts WHERE id=$1`, [a.id])).status, "connected");
  // invalid_grant does sign it out
  resetMocks();
  mock("POST", "https://oauth2.googleapis.com/token", () => res({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400));
  await C.refreshDue(env);
  assert.equal((await db(env).one(`SELECT status FROM mob_accounts WHERE id=$1`, [a.id])).status, "needs_reconnect");
});

test("after the upload started, a retryable error fails the post instead of requeueing; retry then needs confirm", async () => {
  const a = await acct("youtube", "UCd");
  const p = await post(a.id);
  mock("POST", "https://www.googleapis.com/upload/youtube/v3/videos", () => res("", 200, { location: "https://up.example/s" }));
  mock("PUT", "https://up.example/s", () => res("gateway", 502));
  const [claimed] = await C.claimDue(env);
  await C.processPost(env, claimed);
  const after = await get(p.id);
  assert.equal(after.status, "failed"); assert.ok(after.upload_started_at);
  assert.equal((await C.retryPost(env, p.id)).needs_confirm, true);
  assert.equal((await get(p.id)).status, "failed");
  const r = await C.retryPost(env, p.id, { confirm: true });
  assert.equal(r.status, "scheduled"); assert.equal(r.upload_started_at, null);
});

test("createPosts refuses a clip_key that is not in storage", async () => {
  const a = await acct("youtube", "UCe");
  const r = await C.createPosts(env, { clip_key: "oraktys-typo.mp4", account_ids: [a.id] });
  assert.deepEqual(r.errors, ["clip_key not found in storage"]);
});
