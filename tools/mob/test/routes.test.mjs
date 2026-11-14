import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mock, resetMocks, calls, res, makeEnv, dropEnv, reqOf, login } from "./helpers.mjs";
import * as C from "../src/core.mjs";
import { db } from "../src/db.mjs";
import { athensToUtc } from "../src/worker.mjs";

let env, R, cookie;
before(async () => { env = await makeEnv(); R = reqOf(env); cookie = await login(env); });
after(async () => { await dropEnv(env); });
beforeEach(async () => {
  resetMocks();
  await db(env).q(`TRUNCATE mob_submissions, mob_posts, mob_campaigns, mob_accounts, mob_oauth_state, mob_clips RESTART IDENTITY CASCADE`);
});
const acct = (platform, ext) => C.upsertAccount(env, platform, { external_id: ext, handle: ext, access_token: "a", refresh_token: "r", scopes: "", meta: {} });

test("healthz is public and reports db + build", async () => {
  const r = await R("GET", "/healthz");
  assert.deepEqual(await r.json(), { ok: true, db: "up", build: "mob-3" });
  const bad = await reqOf({ ...env, __db: undefined, DATABASE_URL: "postgresql://u:p@nope.invalid/db" })("GET", "/healthz");
  assert.equal((await bad.json()).db, "down");
});

test("admin auth: wrong password 401, pages redirect to /login, tampered cookie rejected", async () => {
  assert.equal((await R("POST", "/login", { form: { password: "nope" } })).status, 401);
  for (const p of ["/", "/accounts", "/clips", "/schedule", "/campaigns", "/settings", "/posts", "/admin/migrate", "/connect/youtube", "/oauth/youtube/callback"]) {
    const r = await R("GET", p);
    assert.equal(r.status, 302, p); assert.equal(r.headers.get("location"), "/login");
  }
  const [name, val] = cookie.split("=");
  const parts = val.split(".");
  const tampered = `${name}=admin.${Number(parts[1]) + 999}.${parts[2]}`;
  assert.equal((await R("GET", "/", { cookie: tampered })).status, 302);
  const setc = (await R("POST", "/login", { form: { password: "pw-test" } })).headers.get("set-cookie");
  assert.match(setc, /HttpOnly/); assert.match(setc, /Secure/); assert.match(setc, /SameSite=Lax/); assert.match(setc, /Max-Age=2592000/);
  assert.equal((await R("GET", "/login")).status, 200);
});

test("every admin route serves the app shell with the build number; data endpoints answer", async () => {
  const a = await acct("youtube", "UC1");
  const c = await db(env).one(`INSERT INTO mob_campaigns (name, platforms) VALUES ('Oraktys', '{youtube}') RETURNING id`);
  const p = await db(env).one(`INSERT INTO mob_posts (account_id, clip_key, scheduled_at, status, error, campaign_id, remote_url) VALUES ($1,'oraktys-a.mp4',now(),'failed','403 x: y',$2,NULL),($1,'oraktys-a.mp4',now(),'posted',NULL,$2,'https://www.youtube.com/shorts/v') RETURNING id`, [a.id, c.id]);
  for (const path of ["/", "/welcome", "/channels", `/channels/${a.id}`, "/accounts", "/clips", "/posts", "/calendar", "/schedule", "/analytics", "/analytics/live", "/campaigns", `/campaigns/${c.id}`, "/earnings", "/settings", "/admin/migrate"]) {
    const r = await R("GET", path, { cookie });
    const t = await r.text();
    assert.equal(r.status, 200, path); assert.match(t, /data-build="mob-3"/, path); assert.match(t, /\/static\/app\.js/, path);
  }
  assert.equal((await R("GET", "/nope", { cookie })).status, 404);
  const js = await R("GET", "/static/app.js");
  assert.equal(js.status, 200); assert.match(js.headers.get("content-type"), /javascript/);
  new Function(await js.text()); // parses as a classic script
  const get = async (u) => { const r = await R("GET", u, { cookie }); const j = await r.json(); assert.equal(r.status, 200, u + " " + JSON.stringify(j)); return j; };
  const boot = await get("/ui/data/boot");
  assert.equal(boot.build, "mob-3"); assert.equal(boot.accounts.length, 1); assert.equal(boot.counts.failed, 1);
  assert.equal((await get("/ui/data/posts?status=failed")).posts[0].error, "403 x: y");
  assert.equal((await get("/ui/data/posts")).counts.all, 2);
  assert.ok((await get(`/ui/data/posts/${p.id}`)).events.length >= 2);
  assert.ok((await get("/ui/data/clips")).clips.some((x) => x.key === "oraktys-a.mp4" && x.platforms.includes("youtube")));
  assert.equal((await get(`/ui/data/campaigns/${c.id}`)).clips.length, 1);
  assert.equal((await get(`/ui/data/channels/${a.id}`)).account.handle, "UC1");
  assert.equal((await get("/ui/data/overview?range=7d")).days.length, 7);
  const cal = await get(`/ui/data/calendar?from=${new Date(Date.now() - 864e5).toISOString()}&to=${new Date(Date.now() + 864e5).toISOString()}`);
  assert.equal(cal.posts.length, 2);
  assert.equal((await R("GET", "/ui/data/boot")).status, 302); // no cookie
});

test("/connect with no keys shows the onboarding card, never a dead end in Settings", async () => {
  const env2 = { ...env, GOOGLE_CLIENT_SECRET: undefined };
  const R2 = reqOf(env2);
  await C.setStage(env2, "youtube", { stage: "claude_working", stage_note: "Creating the project" });
  const r = await R2("GET", "/connect/youtube", { cookie });
  assert.equal(r.status, 200);
  const t = await r.text();
  assert.match(t, /data-route="\/welcome"/); assert.match(t, /Claude is setting up YouTube\. Creating the project/);
  const st = await (await R2("GET", "/ui/data/setup", { cookie })).json();
  assert.equal(st.youtube.state, "setting_up"); assert.equal(st.instagram.state, "ready");
  await db(env).q(`DELETE FROM mob_platform_apps`);
});

test("OAuth connect -> callback stores the account; bad/expired state rejected", async () => {
  const r = await R("GET", "/connect/tiktok", { cookie });
  const loc = new URL(r.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, "https://www.tiktok.com/v2/auth/authorize/");
  const state = loc.searchParams.get("state");
  mock("POST", "https://open.tiktokapis.com/v2/oauth/token/", () => ({ access_token: "TA", expires_in: 86400, refresh_token: "TR", refresh_expires_in: 1, open_id: "oid9", scope: "video.publish" }));
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", () => ({ data: { creator_username: "oraktys" }, error: { code: "ok" } }));
  const bad = await R("GET", `/oauth/tiktok/callback?code=C&state=wrong`, { cookie });
  assert.equal(bad.status, 400);
  const cb = await R("GET", `/oauth/tiktok/callback?code=C&state=${state}`, { cookie });
  assert.equal(cb.status, 302); assert.match(decodeURIComponent(cb.headers.get("location")), /Connected @oraktys/);
  const replay = await R("GET", `/oauth/tiktok/callback?code=C&state=${state}`, { cookie });
  assert.equal(replay.status, 400);
  await db(env).q(`INSERT INTO mob_oauth_state (state, platform, created_at) VALUES ('old','youtube', now() - interval '16 minutes')`);
  assert.equal((await R("GET", `/oauth/youtube/callback?code=C&state=old`, { cookie })).status, 400);
  const accts = await C.listAccounts(env);
  assert.equal(accts.length, 1); assert.equal(accts[0].handle, "oraktys");
  // reconnect upserts, no duplicate
  const r2 = await R("GET", "/connect/tiktok", { cookie });
  await R("GET", `/oauth/tiktok/callback?code=C&state=${new URL(r2.headers.get("location")).searchParams.get("state")}`, { cookie });
  assert.equal((await C.listAccounts(env)).length, 1);
});

test("account disable/delete", async () => {
  const a = await acct("youtube", "UC1");
  await R("POST", `/accounts/${a.id}/disable`, { cookie });
  assert.equal((await C.listAccounts(env))[0].status, "disabled");
  await R("POST", `/accounts/${a.id}/delete`, { cookie });
  assert.equal((await C.listAccounts(env)).length, 0);
});

test("schedule form creates one post per account, Athens time stored as UTC, spread 10 min", async () => {
  const a = await acct("youtube", "UC1"), b = await acct("instagram", "IG1");
  const body = new URLSearchParams([["clip_key", "oraktys-a.mp4"], ["account_ids", String(a.id)], ["account_ids", String(b.id)], ["when", "at"], ["at", "2026-12-01T18:30"], ["spread", "1"], ["caption", "c"]]);
  const r = await R("POST", "/schedule", { cookie, body, headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.match(decodeURIComponent(r.headers.get("location")), /Queued\. 2 posts\./);
  const rows = await db(env).q(`SELECT scheduled_at FROM mob_posts ORDER BY scheduled_at`);
  assert.equal(new Date(rows[0].scheduled_at).toISOString(), "2026-12-01T16:30:00.000Z");
  assert.equal(new Date(rows[1].scheduled_at).toISOString(), "2026-12-01T16:40:00.000Z");
  assert.equal(athensToUtc("2026-07-01T12:00"), "2026-07-01T09:00:00.000Z");
});

test("post cancel and retry", async () => {
  const a = await acct("youtube", "UC1");
  const p = await db(env).one(`INSERT INTO mob_posts (account_id, clip_key, scheduled_at) VALUES ($1,'k',now() + interval '1 day') RETURNING id`, [a.id]);
  await R("POST", `/posts/${p.id}/cancel`, { cookie });
  assert.equal((await db(env).one(`SELECT status FROM mob_posts WHERE id=$1`, [p.id])).status, "canceled");
  await R("POST", `/posts/${p.id}/retry`, { cookie });
  assert.equal((await db(env).one(`SELECT status FROM mob_posts WHERE id=$1`, [p.id])).status, "scheduled");
});

test("clip upload goes to R2 and appears in the library", async () => {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(321)], "My Clip!.mp4", { type: "video/mp4" }));
  const r = await R("POST", "/clips/upload", { cookie, body: fd });
  assert.equal(r.status, 302);
  const key = [...env.MEDIA.store.keys()].find((k) => k.startsWith("mob-upload-"));
  assert.match(key, /^mob-upload-\d+-my-clip\.mp4$/); assert.equal(env.MEDIA.store.get(key).length, 321);
  const api = await (await R("GET", "/api/clips", { bearer: "tok-test" })).json();
  assert.ok(api.clips.some((c) => c.key === key && c.size === 321));
});

test("campaigns + submissions through admin forms", async () => {
  const r = await R("POST", "/campaigns", { cookie, form: { name: "ORAKTYS", url: "https://contentrewards.com/x", rules: "#oraktys", cpm_usd: "1.5" } });
  const id = r.headers.get("location").split("/").pop();
  await R("POST", `/campaigns/${id}/submissions`, { cookie, form: { posted_url: "https://youtube.com/shorts/a", status: "approved", views: "1200" } });
  const s = await db(env).one(`SELECT * FROM mob_submissions`);
  assert.equal(s.status, "approved"); assert.equal(s.views, 1200);
  const bad = await R("POST", "/campaigns", { cookie, form: { name: "" } });
  assert.match(decodeURIComponent(bad.headers.get("location")), /needs a name/);
});

test("settings saves secrets through the Cloudflare API, never other names", async () => {
  mock("PUT", "https://api.cloudflare.com/client/v4/accounts/acct1/workers/scripts/mob/secrets", (r) => { assert.equal(r.headers.authorization, "Bearer cf"); return { success: true, result: {} }; });
  const r = await R("POST", "/settings/secret", { cookie, form: { GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", ADMIN_PASSWORD: "hack" } });
  assert.match(decodeURIComponent(r.headers.get("location")), /Saved\. YouTube is ready to connect\./);
  const bodies = calls.map((c) => JSON.parse(c.body));
  assert.deepEqual(bodies, [{ name: "GOOGLE_CLIENT_ID", text: "x", type: "secret_text" }, { name: "GOOGLE_CLIENT_SECRET", text: "y", type: "secret_text" }]);
  const page = await (await R("GET", "/settings", { cookie })).text();
  assert.doesNotMatch(page, /gsec|igsec|tsec/);
  const st = await (await R("GET", "/ui/data/setup", { cookie })).json();
  assert.equal(st.youtube.redirect_uri, "https://mob.gardenbuddystore.workers.dev/oauth/youtube/callback");
  assert.doesNotMatch(JSON.stringify(st), /gsec|igsec|tsec/);
  resetMocks();
  mock("PUT", "https://api.cloudflare.com/", () => res({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }, 403));
  const f = await R("POST", "/settings/secret", { cookie, form: { IG_APP_ID: "z" } });
  assert.match(decodeURIComponent(f.headers.get("location")), /Cloudflare said: 403 10000: Authentication error/);
});

test("JSON API: bearer required, posts with unconnected platform skipped, validation", async () => {
  assert.equal((await R("GET", "/api/accounts")).status, 401);
  assert.equal((await R("GET", "/api/accounts", { bearer: "wrong" })).status, 401);
  assert.deepEqual(await (await R("GET", "/api/accounts", { bearer: "tok-test" })).json(), []);
  const a = await acct("youtube", "UC1");
  await acct("instagram", "IG1");
  const r = await R("POST", "/api/posts", { bearer: "tok-test", body: { clip_key: "oraktys-a.mp4", platforms: ["youtube", "instagram", "tiktok"], caption: "x" } });
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.equal(j.posts.length, 2); assert.deepEqual(j.skipped, [{ platform: "tiktok", reason: "not connected" }]);
  const v = await R("POST", "/api/posts", { bearer: "tok-test", body: { platforms: ["youtube"] } });
  assert.equal(v.status, 400); assert.equal((await v.json()).error.code, "validation");
  assert.equal((await R("POST", "/api/posts", { bearer: "tok-test", body: { clip_key: "k", account_ids: 5 } })).status, 400);
  assert.equal((await R("POST", "/api/posts", { bearer: "tok-test", body: { clip_key: "k", account_ids: [a.id], scheduled_at: "garbage" } })).status, 400);
  const list = await (await R("GET", "/api/posts?status=scheduled", { bearer: "tok-test" })).json();
  assert.equal(list.length, 2);
  const one = await (await R("GET", `/api/posts/${list[0].id}`, { bearer: "tok-test" })).json();
  assert.equal(one.id, list[0].id);
  assert.equal((await R("GET", "/api/posts/99999", { bearer: "tok-test" })).status, 404);
  assert.equal((await (await R("POST", `/api/posts/${one.id}/cancel`, { bearer: "tok-test" })).json()).status, "canceled");
  assert.equal((await R("POST", `/api/posts/${one.id}/cancel`, { bearer: "tok-test" })).status, 409);
  const clips = await (await R("GET", "/api/clips", { bearer: "tok-test" })).json();
  assert.deepEqual(clips.clips.map((c) => c.key), ["oraktys-a.mp4", "oraktys-b.mp4"]);
  assert.equal(clips.clips[0].url, "https://blackreaper.us/media/oraktys-a.mp4");
  assert.equal((await R("GET", "/api/nope", { bearer: "tok-test" })).status, 404);
});

test("JSON API: campaigns, submissions by post_id, run", async () => {
  const c = await (await R("POST", "/api/campaigns", { bearer: "tok-test", body: { name: "ORAKTYS", platforms: ["youtube", "bogus"], cpm_usd: 2 } })).json();
  assert.deepEqual(c.platforms, ["youtube"]);
  assert.equal((await R("POST", "/api/campaigns", { bearer: "tok-test", body: { name: "" } })).status, 400);
  const a = await acct("youtube", "UC1");
  const p = await db(env).one(`INSERT INTO mob_posts (account_id, clip_key, scheduled_at, status, remote_url, campaign_id) VALUES ($1,'k',now(),'posted','https://www.youtube.com/shorts/z',$2) RETURNING id`, [a.id, c.id]);
  const s = await R("POST", "/api/submissions", { bearer: "tok-test", body: { campaign_id: c.id, post_id: p.id } });
  assert.equal(s.status, 201); assert.equal((await s.json()).posted_url, "https://www.youtube.com/shorts/z");
  const again = await R("POST", "/api/submissions", { bearer: "tok-test", body: { campaign_id: c.id, post_id: p.id, status: "paid", payout_usd: 3.2 } });
  assert.equal((await again.json()).status, "paid");
  assert.equal((await (await R("GET", `/api/submissions?campaign_id=${c.id}`, { bearer: "tok-test" })).json()).length, 1);
  assert.equal((await R("POST", "/api/submissions", { bearer: "tok-test", body: { campaign_id: c.id } })).status, 400);
  assert.equal((await (await R("GET", "/api/campaigns", { bearer: "tok-test" })).json()).length, 1);
  const run = await (await R("POST", "/api/run", { bearer: "tok-test" })).json();
  assert.deepEqual(run.errors, []);
});

test("scheduled() handler runs a tick", async () => {
  const { default: worker } = await import("../src/worker.mjs");
  let p;
  await worker.scheduled({}, env, { waitUntil: (x) => { p = x; } });
  await p;
});

test("upload passes the File itself to R2 (R2 rejects a stream of unknown length)", async () => {
  const realPut = env.MEDIA.put;
  env.MEDIA.put = async (k, v, o) => {
    if (v && typeof v.getReader === "function") throw new TypeError("Provided readable stream must have a known length (request/response body or readable half of FixedLengthStream)");
    return realPut.call(env.MEDIA, k, v, o);
  };
  try {
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array(64)], "My Clip.mp4", { type: "video/mp4" }));
    const r = await R("POST", "/clips/upload", { cookie, body: fd });
    assert.equal(r.status, 302); assert.match(r.headers.get("location"), /Uploaded/);
    assert.ok([...env.MEDIA.store.keys()].some((k) => /^mob-upload-\d+-my-clip\.mp4$/.test(k)));
  } finally { env.MEDIA.put = realPut; }
});

test("schedule: a typed time is used even with Now ticked; past time refused", async () => {
  const a = await acct("youtube", "UCs");
  const r = await R("POST", "/schedule", { cookie, form: { clip_key: "oraktys-a.mp4", account_ids: String(a.id), when: "now", at: "2099-01-01T12:00" } });
  assert.equal(r.status, 302);
  const p = await db(env).one(`SELECT scheduled_at FROM mob_posts`);
  assert.equal(new Date(p.scheduled_at).toISOString(), "2099-01-01T10:00:00.000Z");
  const r2 = await R("POST", "/schedule", { cookie, form: { clip_key: "oraktys-a.mp4", account_ids: String(a.id), when: "at", at: "2020-01-01T12:00" } });
  assert.match(decodeURIComponent(r2.headers.get("location")), /in the past/);
});

test("API: bad since / campaign_id give 400, unknown clip_key gives 400", async () => {
  let r = await R("GET", "/api/posts?since=garbage", { bearer: "tok-test" });
  assert.equal(r.status, 400); assert.equal((await r.json()).error.code, "validation");
  r = await R("GET", "/api/submissions?campaign_id=abc", { bearer: "tok-test" });
  assert.equal(r.status, 400);
  const a = await acct("youtube", "UCv");
  r = await R("POST", "/api/posts", { bearer: "tok-test", body: { clip_key: "nope.mp4", account_ids: [a.id] } });
  assert.equal(r.status, 400); assert.match((await r.json()).error.message, /not found in storage/);
});

test("login locks out after 5 failures from one IP, other IPs unaffected", async () => {
  const hit = (pw, ip) => R("POST", "/login", { form: { password: pw }, headers: { "cf-connecting-ip": ip } });
  for (let i = 0; i < 5; i++) assert.equal((await hit("wrong", "9.9.9.9")).status, 401);
  assert.equal((await hit("pw-test", "9.9.9.9")).status, 429);
  assert.equal((await hit("pw-test", "8.8.8.8")).status, 302);
  await db(env).q(`TRUNCATE mob_login_fail`);
});
