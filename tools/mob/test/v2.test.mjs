// mob v2: money, stats pulls (mocked platform HTTP), setup/keys API, stats/earnings API, cron step, app actions.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mock, resetMocks, calls, res, makeEnv, dropEnv, reqOf, login } from "./helpers.mjs";
import * as C from "../src/core.mjs";
import * as S from "../src/stats.mjs";
import { db } from "../src/db.mjs";
import { estPayout, payoutInfo } from "../src/money.mjs";
import * as yt from "../src/platforms/youtube.mjs";
import * as ig from "../src/platforms/instagram.mjs";
import * as tt from "../src/platforms/tiktok.mjs";

let env, R, cookie;
before(async () => { env = await makeEnv(); R = reqOf(env); cookie = await login(env); });
after(async () => { await dropEnv(env); });
beforeEach(async () => {
  resetMocks();
  await db(env).q(`TRUNCATE mob_submissions, mob_posts, mob_campaigns, mob_accounts, mob_oauth_state, mob_clips, mob_platform_apps, mob_account_stats, mob_post_stats, mob_settings RESTART IDENTITY CASCADE`);
});
const FULL = { youtube: yt.SCOPES.join(" "), instagram: ig.SCOPES.join(","), tiktok: tt.SCOPES.join(",") };
const acct = (platform, ext, scopes = FULL[platform]) => C.upsertAccount(env, platform, { external_id: ext, handle: ext, access_token: "AT", refresh_token: "RT", scopes, meta: {} });
const B = { bearer: "tok-test" };

function mockYT({ views = 5000, subs = 120 } = {}) {
  mock("GET", "https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&mine=true", (r) => { assert.match(r.headers.authorization, /^Bearer (AT|NEW)$/); return { items: [{ id: "UC1", snippet: { title: "Leo", thumbnails: { default: { url: "https://i/a.jpg" } } }, statistics: { viewCount: String(views), subscriberCount: String(subs), hiddenSubscriberCount: false, videoCount: "3" } }] }; });
  mock("GET", "https://youtubeanalytics.googleapis.com/v2/reports", (r, u) => {
    assert.equal(u.searchParams.get("ids"), "channel==MINE"); assert.equal(u.searchParams.get("dimensions"), "video"); assert.equal(u.searchParams.get("sort"), "-views");
    assert.equal(u.searchParams.get("maxResults"), "200"); assert.equal(u.searchParams.get("metrics"), "views,likes,comments,shares");
    return { columnHeaders: [{ name: "video" }, { name: "views" }, { name: "likes" }, { name: "comments" }, { name: "shares" }], rows: [["vid1", 4000, 10, 2, 1], ["vid2", 1000, 3, 0, 0]] };
  });
  mock("GET", "https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet", () => ({ items: [{ id: "vid1", snippet: { title: "Clip one" }, statistics: { viewCount: "4000", likeCount: "10", commentCount: "2" } }] }));
}

test("money: below min pays 0, between min and max is linear, above max is capped, null min/max uncapped", () => {
  const c = { cpm_usd: 2, min_payout_usd: 5, max_payout_usd: 50 };
  assert.equal(estPayout(1000, c), 0);          // $2 < $5 min
  assert.equal(estPayout(10000, c), 20);
  assert.equal(estPayout(1_000_000, c), 50);    // capped
  assert.equal(estPayout(1_000_000, { cpm_usd: 2 }), 2000);
  assert.equal(estPayout(1500, { cpm_usd: "1.5", min_payout_usd: null, max_payout_usd: "" }), 2.25);
  assert.equal(estPayout(null, c), 0); assert.equal(estPayout(1000, {}), 0);
});

test("YouTube stats: channel statistics + analytics top videos + titles", async () => {
  mockYT();
  const r = await yt.stats(env, { access_token: "AT" });
  assert.deepEqual(r.channel, { views_total: 5000, followers: 120, videos: 3, likes_total: null, avatar: "https://i/a.jpg", title: "Leo" });
  assert.equal(r.videos.length, 2); assert.equal(r.videos[0].title, "Clip one"); assert.equal(r.videos[0].url, "https://www.youtube.com/shorts/vid1");
});

test("Instagram stats: empty insights are null (never 0), followers from /me", async () => {
  mock("GET", "https://graph.instagram.com/v27.0/me?", () => ({ user_id: "IG1", username: "ora", followers_count: 900, media_count: 2, profile_picture_url: "https://p" }));
  mock("GET", "https://graph.instagram.com/v27.0/IG1/media?", () => ({ data: [{ id: "m1", media_type: "VIDEO", permalink: "https://ig/m1", like_count: 4 }, { id: "m2", media_type: "VIDEO" }, { id: "p1", media_type: "IMAGE" }] }));
  mock("GET", "https://graph.instagram.com/v27.0/m1/insights?", (r, u) => { assert.equal(u.searchParams.get("metric"), "views,likes,comments,shares,saved"); return { data: [{ name: "views", values: [{ value: 700 }] }, { name: "saved", values: [{ value: 3 }] }] }; });
  mock("GET", "https://graph.instagram.com/v27.0/m2/insights?", () => ({ data: [] }));
  const r = await ig.stats(env, { access_token: "AT", external_id: "IG1" });
  assert.equal(r.channel.followers, 900); assert.equal(r.channel.views_total, 700);
  assert.equal(r.videos.length, 2);
  assert.equal(r.videos[0].views, 700); assert.equal(r.videos[0].likes, 4); assert.equal(r.videos[0].saves, 3);
  assert.equal(r.videos[1].views, null); assert.equal(r.videos[1].shares, null);
});

test("TikTok stats: user/info + video/list paging while has_more", async () => {
  mock("GET", "https://open.tiktokapis.com/v2/user/info/", (r, u) => { assert.match(u.searchParams.get("fields"), /follower_count/); return { data: { user: { follower_count: 50, likes_count: 9, video_count: 3, display_name: "T" } }, error: { code: "ok" } }; });
  let page = 0;
  mock("POST", "https://open.tiktokapis.com/v2/video/list/", (r) => {
    const b = JSON.parse(r.body); page++;
    if (page === 1) { assert.deepEqual(b, { max_count: 20 }); return { data: { videos: [{ id: "1", view_count: 100 }, { id: "2", view_count: 50 }], cursor: 777, has_more: true }, error: { code: "ok" } }; }
    assert.deepEqual(b, { cursor: 777, max_count: 20 });
    return { data: { videos: [{ id: "3", view_count: 5, share_url: "https://t/3" }], cursor: 1, has_more: false }, error: { code: "ok" } };
  });
  const r = await tt.stats(env, { access_token: "AT" });
  assert.equal(page, 2); assert.equal(r.videos.length, 3); assert.equal(r.channel.views_total, 155); assert.equal(r.channel.followers, 50);
});

test("pullStats: snapshots + per-video rows, links posts, recomputes estimates; missing scope -> reconnect, not error", async () => {
  const a = await acct("youtube", "UC1");
  const old = await acct("tiktok", "T1", "user.info.basic,video.publish");
  const camp = await db(env).one(`INSERT INTO mob_campaigns (name, cpm_usd, min_payout_usd, max_payout_usd) VALUES ('C', 2, 1, 5) RETURNING id`);
  const p = await db(env).one(`INSERT INTO mob_posts (account_id, clip_key, scheduled_at, status, remote_id, remote_url, campaign_id) VALUES ($1,'oraktys-a.mp4',now(),'posted','vid1','https://www.youtube.com/shorts/vid1',$2) RETURNING id`, [a.id, camp.id]);
  await db(env).q(`INSERT INTO mob_submissions (campaign_id, post_id, posted_url) VALUES ($1,$2,'https://www.youtube.com/shorts/vid1')`, [camp.id, p.id]);
  mockYT();
  const out = await S.pullStats(env, C.STATS_DEPS);
  assert.deepEqual(out, { pulled: 1, reconnect: 1, errors: [] });
  assert.ok(!calls.some((c) => c.url.includes("tiktokapis")), "no call for an account missing the stats scopes");
  const tA = (await C.listAccounts(env)).find((x) => x.id === old.id);
  assert.equal(tA.meta.stats_status, "reconnect"); assert.equal(tA.status, "connected");
  const ps = await db(env).one(`SELECT * FROM mob_post_stats WHERE remote_id='vid1'`);
  assert.equal(ps.post_id, p.id); assert.equal(Number(ps.views), 4000);
  const sub = await db(env).one(`SELECT * FROM mob_submissions`);
  assert.equal(sub.views, 4000); assert.equal(Number(sub.est_payout_usd), 5); // 4000/1000*2 = 8 -> max 5
  // second pull in the same hour is skipped; same day upserts, never duplicates
  assert.deepEqual(await S.pullStats(env, C.STATS_DEPS), { pulled: 0, reconnect: 1, errors: [] });
  await S.pullStats(env, C.STATS_DEPS, { force: true });
  assert.equal((await db(env).one(`SELECT count(*)::int n FROM mob_post_stats WHERE remote_id='vid1'`)).n, 1);
  // overview reads it back
  const o = await S.overview(env, "7d");
  assert.equal(o.kpis.views_total, 5000); assert.equal(o.kpis.est_usd, 5);
  assert.equal(o.accounts.find((x) => x.id === a.id).followers, 120);
  assert.equal(o.top[0].remote_id, "vid1");
});

test("cron: pullStats runs inside the tick, at most 3 accounts, then waits 60 minutes", async () => {
  for (let i = 1; i <= 4; i++) await acct("youtube", `UC${i}`);
  mockYT();
  const r1 = await C.runTick(env);
  assert.equal(r1.stats, 3); assert.deepEqual(r1.errors, []);
  assert.equal((await C.runTick(env)).stats, 1);
  assert.equal((await C.runTick(env)).stats, 0);
  await db(env).q(`UPDATE mob_account_stats SET taken_at = now() - interval '61 minutes'`);
  assert.equal((await C.runTick(env)).stats, 3);
});

test("a 401 during stats refreshes the token once and retries", async () => {
  const a = await acct("youtube", "UC1");
  let n = 0;
  mock("GET", "https://www.googleapis.com/youtube/v3/channels?part=statistics", (r) => { if (n++ === 0) return res({ error: { code: 401, message: "expired" } }, 401); assert.equal(r.headers.authorization, "Bearer NEW"); return undefined; });
  mock("POST", "https://oauth2.googleapis.com/token", () => ({ access_token: "NEW", expires_in: 3600 }));
  mockYT();
  assert.equal(await S.pullAccount(env, C.STATS_DEPS, a.id), "ok");
  assert.ok(calls.some((c) => c.url === "https://oauth2.googleapis.com/token"));
});

test("setup API: bearer only, Claude flips stages, keys go to putSecret and never come back, live only with secrets", async () => {
  assert.equal((await R("GET", "/api/setup")).status, 401);
  assert.equal((await R("POST", "/api/settings/keys", { body: { platform: "youtube", client_id: "a", client_secret: "b" } })).status, 401);
  const env2 = { ...env, GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined };
  const R2 = reqOf(env2);
  let st = await (await R2("GET", "/api/setup", B)).json();
  assert.equal(st.youtube.state, "not_set_up"); assert.equal(st.youtube.redirect_uri, "https://mob.gardenbuddystore.workers.dev/oauth/youtube/callback");
  assert.ok(st.youtube.scopes_required.includes("https://www.googleapis.com/auth/yt-analytics.readonly"));
  const s1 = await (await R2("POST", "/api/setup/youtube", { ...B, body: { stage: "claude_working", stage_note: "Enabling YouTube Analytics" } })).json();
  assert.equal(s1.state, "setting_up"); assert.equal(s1.note, "Enabling YouTube Analytics");
  assert.equal((await R2("POST", "/api/setup", { ...B, body: { platform: "youtube", state: "setting_up" } })).status, 200);
  assert.equal((await R2("POST", "/api/setup/youtube", { ...B, body: { stage: "bogus" } })).status, 400);
  // keys
  const seen = [];
  mock("PUT", "https://api.cloudflare.com/client/v4/accounts/acct1/workers/scripts/mob/secrets", (r) => { seen.push(JSON.parse(r.body)); return { success: true }; });
  assert.equal((await R2("POST", "/api/settings/keys", { ...B, body: { platform: "youtube", client_id: "has space", client_secret: "x" } })).status, 400);
  assert.equal((await R2("POST", "/api/settings/keys", { ...B, body: { platform: "nope", client_id: "a", client_secret: "b" } })).status, 400);
  const k = await R2("POST", "/api/settings/keys", { ...B, body: { platform: "youtube", client_id: "123-abcd.apps.googleusercontent.com", client_secret: "GOCSPX-supersecret" } });
  const kt = await k.text();
  assert.equal(k.status, 200); assert.doesNotMatch(kt, /supersecret/); assert.deepEqual(JSON.parse(kt), { ok: true, platform: "youtube", state: "activating", live: false });
  assert.deepEqual(seen.map((x) => x.name), ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
  st = await (await R2("GET", "/api/setup", B)).json();
  assert.equal(st.youtube.state, "activating"); assert.equal(st.youtube.client_id_hint, ".com"); assert.doesNotMatch(JSON.stringify(st), /supersecret/);
  // the Worker now has the secrets (Cloudflare redeployed them): the same row becomes live, Ready
  st = await (await R("GET", "/api/setup", B)).json();
  assert.equal(st.youtube.state, "ready"); assert.equal(st.youtube.stage, "live");
  // /api/platform-keys twin: POST flips to ready when the secrets are present
  const pk = await (await R("POST", "/api/platform-keys", { ...B, body: { platform: "tiktok", id: "awkey", secret: "sec" } })).json();
  assert.equal(pk.state, "ready");
  assert.deepEqual(await (await R("GET", "/api/platform-keys", B)).json(), { youtube: { state: "ready", live: true }, instagram: { state: "ready", live: true }, tiktok: { state: "ready", live: true } });
  // the Settings modal (cookie) uses the same path
  const ui = await R("POST", "/ui/act/keys", { cookie, body: { platform: "instagram", id: "111", secret: "222" } });
  assert.equal(ui.status, 200);
  assert.equal((await db(env).one(`SELECT updated_by FROM mob_platform_apps WHERE platform='instagram'`)).updated_by, "alex");
});

test("connect from onboarding -> platform sign-in -> callback back to /welcome?connected, with a first stats pull", async () => {
  const r = await R("GET", "/connect/youtube?from=welcome", { cookie });
  const loc = new URL(r.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.match(loc.searchParams.get("scope"), /yt-analytics\.readonly/);
  mock("POST", "https://oauth2.googleapis.com/token", () => ({ access_token: "AT", refresh_token: "RT", expires_in: 3599, scope: FULL.youtube }));
  mock("GET", "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", () => ({ items: [{ id: "UC9", snippet: { title: "Leo", customUrl: "@leo" } }] }));
  mockYT();
  const cb = await R("GET", `/oauth/youtube/callback?code=C&state=${loc.searchParams.get("state")}`, { cookie });
  assert.equal(cb.status, 302);
  const back = new URL(cb.headers.get("location"), "https://x");
  assert.equal(back.pathname, "/welcome"); assert.equal(back.searchParams.get("connected"), "youtube");
  const st = await (await R("GET", "/ui/data/setup", { cookie })).json();
  assert.equal(st.youtube.state, "connected");
  const o = await (await R("GET", "/api/stats?range=today", B)).json();
  assert.equal(o.accounts[0].followers, 120);
  // denied consent: back to the same place with one fix
  const r2 = await R("GET", "/connect/youtube", { cookie });
  const cb2 = await R("GET", `/oauth/youtube/callback?error=access_denied&state=${new URL(r2.headers.get("location")).searchParams.get("state")}`, { cookie });
  assert.match(decodeURIComponent(cb2.headers.get("location")), /^\/channels\?msg=Sign in to YouTube again\./);
});

test("stats, earnings, campaigns/parse APIs", async () => {
  assert.equal((await R("GET", "/api/stats?range=year", B)).status, 400);
  const p1 = await (await R("POST", "/api/campaigns/parse", { ...B, body: { url: "https://contentrewards.com/c/x", name: "X", cpm_usd: 1.5, min_payout_usd: 5, max_payout_usd: 500, budget_usd: 20000, platforms: ["youtube", "tiktok"] } })).json();
  assert.equal(Number(p1.max_payout_usd), 500);
  const p2 = await R("POST", "/api/campaigns/parse", { ...B, body: { url: "https://contentrewards.com/c/x", cpm_usd: 2 } });
  assert.equal(p2.status, 200); assert.equal((await p2.json()).id, p1.id);
  assert.equal((await R("POST", "/api/campaigns/parse", { ...B, body: { url: "u", cpm_usd: "abc", name: "n" } })).status, 400);
  const a = await acct("youtube", "UC1");
  const post = await db(env).one(`INSERT INTO mob_posts (account_id, clip_key, scheduled_at, status, remote_id, campaign_id) VALUES ($1,'k',now(),'posted','vid1',$2) RETURNING id`, [a.id, p1.id]);
  await db(env).q(`INSERT INTO mob_post_stats (account_id, post_id, remote_id, day, views) VALUES ($1,$2,'vid1',current_date - 1, 1000),($1,$2,'vid1',current_date, 10000)`, [a.id, post.id]);
  await db(env).q(`INSERT INTO mob_submissions (campaign_id, post_id, posted_url, status, payout_usd) VALUES ($1,$2,'u','paid',4)`, [p1.id, post.id]);
  const e = await (await R("GET", "/api/earnings", B)).json();
  const c = e.campaigns[0];
  assert.equal(c.views, 10000); assert.equal(c.est_usd, 20); assert.equal(c.paid_usd, 4); assert.equal(c.pending_usd, 16);
  assert.equal(e.totals.est_all, 20); assert.equal(e.totals.pending, 16);
  const last2 = e.daily.slice(-2).map((x) => x.est);
  assert.deepEqual(last2, [0, 20]); // 1000 views = $2 < $5 min -> 0, then 10000 views = $20
  assert.equal((await R("GET", "/api/earnings?campaign=x", B)).status, 400);
  assert.equal((await (await R("POST", "/api/stats/pull", { ...B, body: {} })).json()).pulled, 0);
});

test("app actions: schedule in Athens time, move snaps, retry asks when maybe live, pause stops claiming, ask Claude", async () => {
  const a = await acct("youtube", "UC1");
  const s = await (await R("POST", "/ui/act/schedule", { cookie, body: { clip_key: "oraktys-a.mp4", account_ids: [a.id], at: "2030-01-02T18:30", title: "t" } })).json();
  assert.equal(new Date(s.posts[0].scheduled_at).toISOString(), "2030-01-02T16:30:00.000Z");
  assert.equal((await R("POST", "/ui/act/schedule", { cookie, body: { clip_key: "oraktys-a.mp4", account_ids: [a.id], at: "2001-01-01T10:00" } })).status, 400);
  const mv = await (await R("POST", `/ui/act/posts/${s.posts[0].id}/move`, { cookie, body: { at: "2030-01-03T19:15" } })).json();
  assert.equal(new Date(mv.scheduled_at).toISOString(), "2030-01-03T17:15:00.000Z");
  await db(env).q(`UPDATE mob_posts SET status='failed', upload_started_at=now() WHERE id=$1`, [s.posts[0].id]);
  const rt = await R("POST", `/ui/act/posts/${s.posts[0].id}/retry`, { cookie, body: {} });
  assert.equal(rt.status, 409); assert.equal((await rt.json()).needs_confirm, true);
  assert.equal((await R("POST", `/ui/act/posts/${s.posts[0].id}/retry`, { cookie, body: { confirm: true } })).status, 200);
  await db(env).q(`UPDATE mob_posts SET scheduled_at=now() - interval '1 minute'`);
  await R("POST", "/ui/act/settings", { cookie, body: { paused: true, spread: 15 } });
  assert.deepEqual(await C.claimDue(env), []);
  await R("POST", "/ui/act/settings", { cookie, body: { paused: false } });
  assert.equal((await C.claimDue(env)).length, 1);
  assert.equal((await R("POST", "/ui/act/settings", { cookie, body: { spread: 7 } })).status, 400);
  await R("POST", "/ui/act/ask", { cookie, body: { platform: "tiktok" } });
  assert.ok((await (await R("GET", "/api/setup", B)).json()).tiktok.asked_at);
  const boot = await (await R("GET", "/ui/data/boot", { cookie })).json();
  assert.equal(boot.spread, 15); assert.ok(boot.claude_seen);
});

test("no banned words in what Alex sees", async () => {
  const { appScript, shell } = await import("../src/ui.mjs");
  const visible = (appScript() + shell({ build: "x" })).replace(/\/ui\/(data|act)\/[a-z/]+|api\(|PN\[|secret:|"secret"|data-[a-z]+|ksec|\.secrets/gi, "");
  for (const w of [/\bOAuth\b/i, /client id/i, /\bwebhook\b/i, /error code/i, /\bscope\b/i]) assert.doesNotMatch(visible, w, String(w));
});

/* ---- review fixes 2026-11-14 ---- */
test("money: a clip held below the minimum says why (never a bare $0)", () => {
  const i = payoutInfo(1000, { cpm_usd: 2, min_payout_usd: 5 });
  assert.equal(i.est, 0); assert.equal(i.held, true); assert.equal(i.raw, 2); assert.equal(i.min, 5);
  assert.equal(payoutInfo(10000, { cpm_usd: 2, min_payout_usd: 5 }).held, false);
});

test("YouTube stats: posted Shorts use live videos.list counts over lagging Analytics, and missing ones are added", async () => {
  mock("GET", "https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&mine=true", () => ({ items: [{ id: "UC1", snippet: { title: "Leo" }, statistics: { viewCount: "9", subscriberCount: "1", videoCount: "3" } }] }));
  mock("GET", "https://youtubeanalytics.googleapis.com/v2/reports", () => ({ columnHeaders: [{ name: "video" }, { name: "views" }, { name: "likes" }, { name: "comments" }, { name: "shares" }], rows: [["old", 50, 1, 0, 0], ["vid1", 10, 0, 0, 0]] }));
  mock("GET", "https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet", (r, u) => {
    const ids = u.searchParams.get("id").split(","); assert.ok(ids.includes("new1") && ids.includes("vid1") && ids.includes("old"));
    return { items: [{ id: "vid1", snippet: { title: "A" }, statistics: { viewCount: "777" } }, { id: "new1", snippet: { title: "B" }, statistics: { viewCount: "321", likeCount: "5" } }, { id: "old", snippet: { title: "C" }, statistics: { viewCount: "99" } }] };
  });
  const r = await yt.stats(env, { access_token: "AT" }, { postedIds: ["vid1", "new1"] });
  const by = Object.fromEntries(r.videos.map((v) => [v.remote_id, v]));
  assert.equal(by.vid1.views, 777); assert.equal(by.new1.views, 321); assert.equal(by.new1.likes, 5);
  assert.equal(by.old.views, 50, "a video mob did not post keeps its Analytics row");
});

test("Instagram exchange: permissions as the doc's comma STRING are stored as granted; declined insights -> Reconnect", async () => {
  // Sample shape from https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
  mock("POST", "https://api.instagram.com/oauth/access_token", () => ({ data: [{ access_token: "SHORT", user_id: "1020", permissions: "instagram_business_basic,instagram_business_content_publish" }] }));
  mock("GET", "https://graph.instagram.com/access_token", () => ({ access_token: "LONG", token_type: "bearer", expires_in: 5183944 }));
  mock("GET", "https://graph.instagram.com/v27.0/me?", () => ({ data: [{ user_id: "1020", username: "ora" }] }));
  const a = await ig.exchange(env, "C");
  assert.equal(a.scopes, "instagram_business_basic,instagram_business_content_publish");
  assert.deepEqual(S.missingStatsScopes(C.PLATFORMS, { platform: "instagram", scopes: a.scopes }), ["instagram_business_manage_insights"]);
  const none = await (async () => { resetMocks();
    mock("POST", "https://api.instagram.com/oauth/access_token", () => ({ data: [{ access_token: "S", user_id: "1" }] }));
    mock("GET", "https://graph.instagram.com/access_token", () => ({ access_token: "L", expires_in: 10 }));
    mock("GET", "https://graph.instagram.com/v27.0/me?", () => ({ user_id: "1", username: "x" }));
    return ig.exchange(env, "C"); })();
  assert.equal(none.scopes, "", "no permissions field -> nothing recorded as granted, never the requested SCOPES");
});

test("Instagram stats: insights permission error (code 10) -> account shows Reconnect, not blank views", async () => {
  const a = await acct("instagram", "IG1");
  mock("GET", "https://graph.instagram.com/v27.0/me?", () => ({ user_id: "IG1", username: "ora", followers_count: 1 }));
  mock("GET", "https://graph.instagram.com/v27.0/IG1/media?", () => ({ data: [{ id: "m1", media_type: "VIDEO" }] }));
  mock("GET", "https://graph.instagram.com/v27.0/m1/insights?", () => res({ error: { message: "(#10) Application does not have permission for this action", type: "OAuthException", code: 10 } }, 400));
  await assert.rejects(ig.stats(env, { access_token: "AT", external_id: "IG1" }), (e) => e.status === 403 && e.code === "needs_reconnect");
  const out = await S.pullStats(env, C.STATS_DEPS);
  assert.equal(out.reconnect, 1);
  assert.equal((await C.listAccounts(env)).find((x) => x.id === a.id).meta.stats_status, "reconnect");
});

test("TikTok stats: no view counts -> views_total null; more than STATS_PAGES pages -> views_partial", async () => {
  mock("GET", "https://open.tiktokapis.com/v2/user/info/", () => ({ data: { user: { follower_count: 1 } }, error: { code: "ok" } }));
  mock("POST", "https://open.tiktokapis.com/v2/video/list/", () => ({ data: { videos: [], has_more: false }, error: { code: "ok" } }));
  const r0 = await tt.stats(env, { access_token: "AT" });
  assert.equal(r0.channel.views_total, null); assert.equal(r0.channel.views_partial, false);
  resetMocks();
  mock("GET", "https://open.tiktokapis.com/v2/user/info/", () => ({ data: { user: {} }, error: { code: "ok" } }));
  let pages = 0;
  mock("POST", "https://open.tiktokapis.com/v2/video/list/", () => { pages++; return { data: { videos: [{ id: String(pages), view_count: 10 }], cursor: pages, has_more: true }, error: { code: "ok" } }; });
  const r = await tt.stats(env, { access_token: "AT" });
  assert.equal(pages, tt.STATS_PAGES); assert.equal(r.channel.views_total, 10 * tt.STATS_PAGES); assert.equal(r.channel.views_partial, true);
});

test("campaigns: a javascript: link is refused (400) on parse, update and the admin form", async () => {
  const bad = await R("POST", "/api/campaigns/parse", { ...B, body: { url: "javascript:alert(1)", name: "X" } });
  assert.equal(bad.status, 400); assert.equal((await bad.json()).error.code, "validation");
  const ok = await (await R("POST", "/api/campaigns/parse", { ...B, body: { url: "https://contentrewards.com/c/ok", name: "OK" } })).json();
  const up = await R("POST", `/api/campaigns/${ok.id}`, { ...B, body: { url: "javascript:fetch('/ui')" } });
  assert.equal(up.status, 400);
  assert.equal((await db(env).one(`SELECT url FROM mob_campaigns WHERE id=$1`, [ok.id])).url, "https://contentrewards.com/c/ok");
  const ui = await R("POST", "/ui/act/campaigns", { cookie, body: { url: "data:text/html,x", name: "D" } });
  assert.equal(ui.status, 400);
});
