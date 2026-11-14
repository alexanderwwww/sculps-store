import { test } from "node:test";
import assert from "node:assert/strict";
import { mock, resetMocks, calls, res } from "./helpers.mjs";
import * as yt from "../src/platforms/youtube.mjs";
import * as ig from "../src/platforms/instagram.mjs";
import * as tt from "../src/platforms/tiktok.mjs";
import { SCHEMA } from "../src/schema.mjs";
import { readFileSync } from "node:fs";

const env = { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec", IG_APP_ID: "igid", IG_APP_SECRET: "igsec", TIKTOK_CLIENT_KEY: "tkey", TIKTOK_CLIENT_SECRET: "tsec" };
const form = (b) => Object.fromEntries(new URLSearchParams(b));
const clip = (size = 1000) => ({ key: "oraktys-a.mp4", url: "https://blackreaper.us/media/oraktys-a.mp4", size, stream: async (r) => new Response(new Uint8Array(r ? r.length : size)).body });

test("schema.sql matches the schema the worker runs", () => {
  assert.equal(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"), SCHEMA + ";\n");
});

test("authorize URLs carry exactly the documented params", () => {
  const g = new URL(yt.authorizeUrl(env, "S1"));
  assert.equal(g.origin + g.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.deepEqual(Object.fromEntries(g.searchParams), {
    client_id: "gid", redirect_uri: "https://mob.gardenbuddystore.workers.dev/oauth/youtube/callback", response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly", access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: "S1",
  });
  const i = new URL(ig.authorizeUrl(env, "S2"));
  assert.equal(i.origin + i.pathname, "https://www.instagram.com/oauth/authorize");
  assert.deepEqual(Object.fromEntries(i.searchParams), { client_id: "igid", redirect_uri: "https://mob.gardenbuddystore.workers.dev/oauth/instagram/callback", response_type: "code", scope: "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights", state: "S2" });
  const t = new URL(tt.authorizeUrl(env, "S3"));
  assert.equal(t.origin + t.pathname, "https://www.tiktok.com/v2/auth/authorize/");
  assert.deepEqual(Object.fromEntries(t.searchParams), { client_key: "tkey", response_type: "code", scope: "user.info.basic,video.publish,user.info.stats,video.list", redirect_uri: "https://mob.gardenbuddystore.workers.dev/oauth/tiktok/callback", state: "S3" });
});

test("YouTube exchange + refresh bodies", async () => {
  resetMocks();
  mock("POST", "https://oauth2.googleapis.com/token", () => ({ access_token: "A", refresh_token: "R", expires_in: 3599, scope: "s" }));
  mock("GET", "https://www.googleapis.com/youtube/v3/channels", (r) => { assert.equal(r.headers.authorization, "Bearer A"); return { items: [{ id: "UC1", snippet: { title: "Leonida", customUrl: "@leonida" } }] }; });
  const a = await yt.exchange(env, "CODE");
  assert.equal(a.external_id, "UC1"); assert.equal(a.handle, "@leonida"); assert.equal(a.refresh_token, "R");
  assert.deepEqual(form(calls[0].body), { code: "CODE", client_id: "gid", client_secret: "gsec", redirect_uri: "https://mob.gardenbuddystore.workers.dev/oauth/youtube/callback", grant_type: "authorization_code" });
  assert.equal(calls[0].headers["content-type"], "application/x-www-form-urlencoded");
  const r = await yt.refresh(env, { refresh_token: "R" });
  assert.equal(r.access_token, "A");
  assert.deepEqual(form(calls[2].body), { client_id: "gid", client_secret: "gsec", grant_type: "refresh_token", refresh_token: "R" });
});

test("YouTube resumable upload: init -> Location -> PUT bytes -> shorts URL", async () => {
  resetMocks();
  mock("POST", "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", () => res("", 200, { location: "https://upload.example/session1" }));
  mock("PUT", "https://upload.example/session1", () => res({ id: "vid123" }, 201));
  const out = await yt.publish(env, { access_token: "A" }, { title: "<b>Big</b> " + "x".repeat(200), caption: "fire clip" }, clip(1000));
  assert.deepEqual(out, { status: "posted", remote_id: "vid123", url: "https://www.youtube.com/shorts/vid123" });
  const init = calls[0];
  assert.equal(init.headers["x-upload-content-length"], "1000"); assert.equal(init.headers["x-upload-content-type"], "video/mp4");
  const meta = JSON.parse(init.body);
  assert.equal([...meta.snippet.title].length, 100); assert.ok(!/[<>]/.test(meta.snippet.title));
  assert.match(meta.snippet.description, /#Shorts$/); assert.equal(meta.status.privacyStatus, "public"); assert.equal(meta.status.selfDeclaredMadeForKids, false);
  assert.equal(calls[1].body.length, 1000); assert.equal(calls[1].headers["content-length"], "1000");
});

test("YouTube errors keep the platform's words and retry flags", async () => {
  resetMocks();
  mock("POST", "https://www.googleapis.com/upload/", () => res({ error: { code: 403, message: "The request cannot be completed because you have exceeded your quota.", errors: [{ reason: "quotaExceeded" }] } }, 403));
  await assert.rejects(yt.publish(env, { access_token: "A" }, { title: "t" }, clip()), (e) => e.message === "403 quotaExceeded: The request cannot be completed because you have exceeded your quota." && !e.retryable);
  resetMocks();
  mock("POST", "https://www.googleapis.com/upload/", () => res({ error: { message: "Backend Error", errors: [{ reason: "backendError" }] } }, 503));
  await assert.rejects(yt.publish(env, { access_token: "A" }, { title: "t" }, clip()), (e) => e.retryable && e.status === 503);
});

test("Instagram exchange: short (data[] shape) -> long-lived -> /me", async () => {
  resetMocks();
  mock("POST", "https://api.instagram.com/oauth/access_token", () => ({ data: [{ access_token: "SHORT", user_id: "1020", permissions: ["instagram_business_basic", "instagram_business_content_publish"] }] }));
  mock("GET", "https://graph.instagram.com/access_token", (r, u) => { assert.equal(u.searchParams.get("grant_type"), "ig_exchange_token"); assert.equal(u.searchParams.get("access_token"), "SHORT"); assert.equal(u.searchParams.get("client_secret"), "igsec"); return { access_token: "LONG", token_type: "bearer", expires_in: 5183944 }; });
  mock("GET", "https://graph.instagram.com/v27.0/me", (r, u) => { assert.equal(u.searchParams.get("fields"), "user_id,username"); return { data: [{ user_id: "17841", username: "oraktys.clips" }] }; });
  const a = await ig.exchange(env, "C");
  assert.equal(a.access_token, "LONG"); assert.equal(a.external_id, "17841"); assert.equal(a.handle, "oraktys.clips");
  assert.deepEqual(form(calls[0].body), { client_id: "igid", client_secret: "igsec", grant_type: "authorization_code", redirect_uri: "https://mob.gardenbuddystore.workers.dev/oauth/instagram/callback", code: "C" });
  resetMocks();
  mock("GET", "https://graph.instagram.com/refresh_access_token", (r, u) => { assert.equal(u.searchParams.get("grant_type"), "ig_refresh_token"); return { access_token: "LONG2", expires_in: 5183944 }; });
  assert.equal((await ig.refresh(env, { access_token: "LONG" })).access_token, "LONG2");
});

test("Instagram reel: container -> IN_PROGRESS -> FINISHED -> media_publish -> permalink; ERROR fails", async () => {
  resetMocks();
  mock("POST", /\/v27\.0\/17841\/media$/, (r) => { const f = form(r.body); assert.equal(f.media_type, "REELS"); assert.equal(f.video_url, "https://blackreaper.us/media/oraktys-a.mp4"); assert.equal(f.share_to_feed, "true"); return { id: "C1" }; });
  const acct = { external_id: "17841", access_token: "LONG" };
  assert.deepEqual(await ig.publish(env, acct, { caption: "hi" }, clip()), { status: "processing", remote_id: "C1" });
  let st = "IN_PROGRESS";
  mock("GET", "https://graph.instagram.com/v27.0/C1", () => ({ status_code: st, id: "C1" }));
  assert.equal(await ig.poll(env, acct, { remote_id: "C1" }), null);
  st = "FINISHED";
  mock("POST", "https://graph.instagram.com/v27.0/17841/media_publish", (r) => { assert.equal(form(r.body).creation_id, "C1"); return { id: "M9" }; });
  mock("GET", "https://graph.instagram.com/v27.0/M9", () => ({ permalink: "https://www.instagram.com/reel/abc/" }));
  assert.deepEqual(await ig.poll(env, acct, { remote_id: "C1" }), { status: "posted", remote_id: "M9", url: "https://www.instagram.com/reel/abc/" });
  st = "ERROR";
  assert.equal((await ig.poll(env, acct, { remote_id: "C1" })).status, "failed");
  await assert.rejects(ig.publish(env, acct, { caption: "#a ".repeat(31) }, clip()), /30 hashtags/);
});

test("TikTok exchange + refresh rotate the refresh token", async () => {
  resetMocks();
  let n = 0;
  mock("POST", "https://open.tiktokapis.com/v2/oauth/token/", () => ({ access_token: "TA" + n, expires_in: 86400, refresh_token: "TR" + ++n, refresh_expires_in: 15552000, open_id: "oid", scope: "user.info.basic,video.publish", token_type: "Bearer" }));
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", () => ({ data: { creator_username: "oraktys" }, error: { code: "ok" } }));
  const a = await tt.exchange(env, "C");
  assert.equal(a.handle, "oraktys"); assert.equal(a.external_id, "oid"); assert.equal(a.refresh_token, "TR1");
  assert.deepEqual(form(calls[0].body), { client_key: "tkey", client_secret: "tsec", code: "C", grant_type: "authorization_code", redirect_uri: "https://mob.gardenbuddystore.workers.dev/oauth/tiktok/callback" });
  const r = await tt.refresh(env, { refresh_token: "TR1" });
  assert.equal(r.refresh_token, "TR2");
  assert.deepEqual(form(calls[2].body), { client_key: "tkey", client_secret: "tsec", grant_type: "refresh_token", refresh_token: "TR1" });
});

test("TikTok chunk math per the media transfer guide", () => {
  const MB = 1048576;
  assert.deepEqual(tt.chunkPlan(4 * MB), { video_size: 4 * MB, chunk_size: 4 * MB, total_chunk_count: 1 });
  const p70 = tt.chunkPlan(70 * MB + 123);
  assert.equal(p70.total_chunk_count, 7); assert.equal(p70.chunk_size, 10 * MB);
  const r70 = tt.chunkRanges(p70);
  assert.equal(r70.at(-1).last, 70 * MB + 122); assert.equal(r70.reduce((s, r) => s + r.length, 0), 70 * MB + 123);
  const p200 = tt.chunkPlan(200 * MB);
  assert.equal(p200.total_chunk_count, 20);
  for (const r of tt.chunkRanges(p200)) assert.ok(r.length >= 5 * MB && r.length <= 128 * MB);
});

test("TikTok direct post: PULL_FROM_URL, picks PUBLIC if offered else SELF_ONLY, status -> URL", async () => {
  resetMocks();
  let opts = ["PUBLIC_TO_EVERYONE", "SELF_ONLY"];
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", () => ({ data: { privacy_level_options: opts, max_video_post_duration_sec: 600 }, error: { code: "ok" } }));
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/video/init/", () => ({ data: { publish_id: "v_pub_1" }, error: { code: "ok" } }));
  const acct = { access_token: "TA", handle: "oraktys" };
  let out = await tt.publish(env, acct, { caption: "cap" }, clip());
  assert.deepEqual(out, { status: "processing", remote_id: "v_pub_1", privacy: "PUBLIC_TO_EVERYONE" });
  const body = JSON.parse(calls[1].body);
  assert.deepEqual(body.source_info, { source: "PULL_FROM_URL", video_url: "https://blackreaper.us/media/oraktys-a.mp4" });
  assert.deepEqual(body.post_info, { title: "cap", privacy_level: "PUBLIC_TO_EVERYONE", disable_duet: false, disable_comment: false, disable_stitch: false, is_aigc: false });
  assert.equal(calls[1].headers["content-type"], "application/json; charset=UTF-8");
  opts = ["FOLLOWER_OF_CREATOR", "SELF_ONLY"];
  out = await tt.publish(env, acct, { caption: "cap" }, clip());
  assert.equal(out.privacy, "SELF_ONLY");
  let s = { status: "PROCESSING_DOWNLOAD" };
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/status/fetch/", (r) => { assert.deepEqual(JSON.parse(r.body), { publish_id: "v_pub_1" }); return { data: s, error: { code: "ok" } }; });
  assert.equal(await tt.poll(env, acct, { remote_id: "v_pub_1" }), null);
  s = { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [7300000000000000001n.toString()] };
  assert.deepEqual(await tt.poll(env, acct, { remote_id: "v_pub_1" }), { status: "posted", remote_id: "v_pub_1", url: "https://www.tiktok.com/@oraktys/video/7300000000000000001" });
  s = { status: "PUBLISH_COMPLETE" };
  assert.deepEqual(await tt.poll(env, acct, { remote_id: "v_pub_1" }), { status: "posted", remote_id: "v_pub_1", url: null });
  s = { status: "FAILED", fail_reason: "file_format_check_failed" };
  assert.equal((await tt.poll(env, acct, { remote_id: "v_pub_1" })).error, "TikTok FAILED: file_format_check_failed");
});

test("TikTok: unaudited error is recorded verbatim; url_ownership_unverified falls back to FILE_UPLOAD", async () => {
  resetMocks();
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", () => ({ data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } }));
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/video/init/", () => res({ error: { code: "unaudited_client_can_only_post_to_private_accounts", message: "Please review our integration guidelines", log_id: "x" } }, 403));
  await assert.rejects(tt.publish(env, { access_token: "TA" }, {}, clip()), (e) => e.message === "403 unaudited_client_can_only_post_to_private_accounts: Please review our integration guidelines" && !e.retryable);

  resetMocks();
  const MB = 1048576, size = 70 * MB + 5;
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", () => ({ data: { privacy_level_options: ["PUBLIC_TO_EVERYONE"] }, error: { code: "ok" } }));
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/video/init/", (r) => {
    const b = JSON.parse(r.body);
    if (b.source_info.source === "PULL_FROM_URL") return res({ error: { code: "url_ownership_unverified", message: "verify" } }, 403);
    assert.deepEqual(b.source_info, { source: "FILE_UPLOAD", video_size: size, chunk_size: 10 * MB, total_chunk_count: 7 });
    return { data: { publish_id: "p2", upload_url: "https://open-upload.tiktokapis.com/upload/?token=z" }, error: { code: "ok" } };
  });
  const ranges = [];
  mock("PUT", "https://open-upload.tiktokapis.com/upload/", (r) => { ranges.push(r.headers["content-range"]); assert.equal(Number(r.headers["content-length"]), r.body.length); return res("", ranges.length < 7 ? 206 : 201); });
  const out = await tt.publish(env, { access_token: "TA" }, {}, clip(size));
  assert.equal(out.remote_id, "p2"); assert.equal(ranges.length, 7);
  assert.equal(ranges[0], `bytes 0-${10 * MB - 1}/${size}`); assert.equal(ranges[6], `bytes ${60 * MB}-${size - 1}/${size}`);
});

test("TikTok creator_info 200-with-error is treated as a failure", async () => {
  resetMocks();
  mock("POST", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", () => ({ data: {}, error: { code: "spam_risk_too_many_posts", message: "daily cap" } }));
  await assert.rejects(tt.publish(env, { access_token: "TA" }, {}, clip()), /200 spam_risk_too_many_posts: daily cap/);
});

test("Instagram never calls media_publish twice: PUBLISHED or saved published_id only reads the permalink; permalink failure still counts as posted", async () => {
  resetMocks();
  const acct = { external_id: "17841", access_token: "LONG" };
  let publishes = 0;
  mock("POST", "https://graph.instagram.com/v27.0/17841/media_publish", () => { publishes++; return { id: "M9" }; });
  mock("GET", "https://graph.instagram.com/v27.0/M9", () => res({ error: { code: 2, message: "temporary" } }, 500));
  let st = "FINISHED";
  mock("GET", "https://graph.instagram.com/v27.0/C1", () => ({ status_code: st }));
  const saved = {};
  const r = await ig.poll(env, acct, { remote_id: "C1" }, async (f) => Object.assign(saved, f));
  assert.deepEqual(r, { status: "posted", remote_id: "M9", url: null });
  assert.equal(saved.published_id, "M9");
  assert.equal(publishes, 1);
  // a later tick with the id saved: no publish
  assert.equal((await ig.poll(env, acct, { remote_id: "C1", published_id: "M9" })).status, "posted");
  st = "PUBLISHED";
  assert.deepEqual(await ig.poll(env, acct, { remote_id: "C1" }), { status: "posted", remote_id: "C1", url: null });
  assert.equal(publishes, 1);
});

test("YouTube marks upload_started_at before sending bytes", async () => {
  resetMocks();
  const order = [];
  mock("POST", "https://www.googleapis.com/upload/youtube/v3/videos", () => res("", 200, { location: "https://up.example/s" }));
  mock("PUT", "https://up.example/s", () => { order.push("put"); return res({ id: "v1" }, 201); });
  await yt.publish(env, { access_token: "a" }, { title: "t" }, clip(), async (f) => { if (f.upload_started_at) order.push("saved"); });
  assert.deepEqual(order, ["saved", "put"]);
});
