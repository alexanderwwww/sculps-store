/*
 * mob — our own posting platform. Posts R2 clips to YouTube Shorts, Instagram Reels and TikTok from many
 * connected accounts, and tracks Whop Content Rewards campaigns and submissions.
 * Standalone Worker: deploying it never touches Kerberos. See tools/mob/README.md.
 */
import { db, migrate } from "./db.mjs";
import { isAdmin, isBearer, makeSessionCookie, safeEqual } from "./auth.mjs";
import { base, redirectUri } from "./platforms/common.mjs";
import * as C from "./core.mjs";
import { shell, loginPage, appScript } from "./ui.mjs";
import * as S from "./stats.mjs";
import { uiData, uiAct } from "./uiapi.mjs";
import { cityRoute, incomeApi, newsApi } from "./city.mjs";
import { aqPage, aqApi } from "./aq/routes.mjs";
import { tick as aqTick } from "./aq/engine.mjs";
import { arenaTick } from "./aq/arena.mjs";

export const BUILD = "mob-4";
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const apiErr = (status, code, message) => json({ error: { code, message } }, status);
const html = (s, status = 200, headers = {}) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers } });
const redirect = (to, headers = {}) => new Response(null, { status: 302, headers: { location: to, ...headers } });

// Secrets Alex may set from /settings. Anything else is refused.
export const SETTABLE = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "IG_APP_ID", "IG_APP_SECRET", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"];

async function readForm(req) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) return req.json();
  const f = await req.formData();
  const o = {};
  for (const [k, v] of f.entries()) { if (k in o) o[k] = [].concat(o[k], v); else o[k] = v; }
  return o;
}
export const LOGIN_MAX_FAILS = 5;
// Admin routes served by the client app (history.pushState; data comes from /ui/data/*).
export const SPA_ROUTES = [/^\/$/, /^\/welcome$/, /^\/channels(\/\d+)?$/, /^\/accounts$/, /^\/clips$/, /^\/posts$/, /^\/calendar$/, /^\/schedule$/,
  /^\/analytics(\/live)?$/, /^\/campaigns(\/\d+)?$/, /^\/earnings$/, /^\/settings$/];
const arr = (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]);

export default {
  async fetch(req, env, ctx) {
    try { return await route(req, env, ctx); } catch (e) {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/api/")) return apiErr(500, "internal", String(e.message || e));
      if (url.pathname.startsWith("/ui/")) return json({ error: { code: "internal", message: String(e.message || e) } }, 500);
      return html(shell({ build: BUILD, route: "/", boot: `Something broke: ${e.message || e}` }), 500);
    }
  },
  async scheduled(event, env, ctx) {
    // Aquarius paper tick runs every minute ("* * * * *"); mob's own tick keeps its */5 schedule.
    if (event?.cron === "* * * * *") { ctx.waitUntil(C.ensureMigrated(env).then(() => aqTick(env)).then((r) => console.log("aq", JSON.stringify(r))).catch((e) => console.log("aq error", e.message || e))
      // the training arena runs after the main tick, on its own tables; whatever happens in it, the main tick has already finished
      .then(() => arenaTick(env)).then((r) => { if (!r.off) console.log("arena", JSON.stringify(r)); }).catch((e) => console.log("arena error", e.message || e))); return; }
    ctx.waitUntil(C.runTick(env).then((r) => console.log("tick", JSON.stringify(r))));
  },
};

async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const M = req.method;

  if (path === "/healthz") {
    let up = "down";
    try { await db(env).q("SELECT 1"); up = "up"; } catch {}
    return json({ ok: up === "up", db: up, build: BUILD });
  }
  // Public policy pages: required by the Google app publish and the Chrome Web Store listing.
  if (path === "/privacy" || path === "/terms") return new Response(policyPage(path), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
  if (path === "/static/app.js") return new Response(appScript(), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300" } });
  await C.ensureMigrated(env);
  if (path.startsWith("/api/")) return api(req, env, url, path, M);

  if (path === "/login" && M === "GET") return html(loginPage(null, BUILD));
  if (path === "/login" && M === "POST") {
    const ip = req.headers.get("cf-connecting-ip") || "unknown";
    const d = db(env);
    const { n } = await d.one(`SELECT count(*)::int n FROM mob_login_fail WHERE ip=$1 AND at > now() - interval '15 minutes'`, [ip]);
    if (n >= LOGIN_MAX_FAILS) return html(loginPage("Too many tries. Wait 15 minutes.", BUILD), 429);
    const f = await readForm(req);
    if (!env.ADMIN_PASSWORD || !safeEqual(f.password, env.ADMIN_PASSWORD)) {
      await d.q(`INSERT INTO mob_login_fail (ip) VALUES ($1)`, [ip]);
      await d.q(`DELETE FROM mob_login_fail WHERE at < now() - interval '1 day'`);
      return html(loginPage("Wrong password.", BUILD), 401);
    }
    await d.q(`DELETE FROM mob_login_fail WHERE ip=$1`, [ip]);
    return redirect("/", { "set-cookie": await makeSessionCookie(env) });
  }
  if (!(await isAdmin(req, env))) return redirect("/login");
  if (path === "/logout") return redirect("/login", { "set-cookie": "mob_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" });

  if (path === "/aq" || path.startsWith("/aq/")) return aqPage(req, env, path, { json, html });
  if (path === "/city" || path.startsWith("/city/")) return cityRoute(req, env, path, { json, html });
  const msg = url.searchParams.get("msg");
  let m;
  const SH = (route, boot = "", status = 200) => html(shell({ build: BUILD, route, boot }), status);

  if (path.startsWith("/ui/")) {
    if (M === "GET") return uiData(req, env, url, path);
    return uiAct(req, env, url, path);
  }
  if (path === "/admin/migrate") { await migrate(env); return SH("/", "Tables are ready."); }
  if ((m = path.match(/^\/connect\/(youtube|instagram|tiktok)$/))) {
    const p = m[1];
    if (!C.hasSecrets(env, p)) {
      // No developer app yet: never a dead end to Settings. Show the onboarding card for this platform.
      const st = (await C.setupState(env))[p];
      return SH("/welcome", `${st.state === "setting_up" || st.state === "activating" ? "Claude is setting up" : "Claude will set up"} ${C.PLATFORM_NAMES[p]}.${st.note ? " " + st.note : ""}`);
    }
    const state = crypto.randomUUID() + (url.searchParams.get("from") === "welcome" ? ".w" : "");
    await db(env).q(`DELETE FROM mob_oauth_state WHERE created_at < now() - interval '15 minutes'`);
    await db(env).q(`INSERT INTO mob_oauth_state (state, platform) VALUES ($1,$2)`, [state, p]);
    return redirect(C.PLATFORMS[p].authorizeUrl(env, state));
  }
  if ((m = path.match(/^\/oauth\/(youtube|instagram|tiktok)\/callback$/))) {
    const p = m[1];
    const state = url.searchParams.get("state") || "";
    const back = state.endsWith(".w") ? "/welcome" : "/channels";
    const row = await db(env).one(`DELETE FROM mob_oauth_state WHERE state=$1 AND platform=$2 RETURNING created_at`, [state, p]);
    if (!row || Date.now() - new Date(row.created_at).getTime() > 15 * 60000) return SH("/channels", "That sign-in link expired. Press Connect again.", 400);
    const code = url.searchParams.get("code");
    if (!code) return redirect(`${back}?msg=${encodeURIComponent(`Sign in to ${C.PLATFORM_NAMES[p]} again.`)}`);
    try {
      const a = await C.PLATFORMS[p].exchange(env, code);
      const saved = await C.upsertAccount(env, p, a);
      try { await S.pullStats(env, C.STATS_DEPS, { accountId: saved.id, force: true, limit: 1 }); } catch {}
      return redirect(`${back}?connected=${p}&account=${saved.id}&msg=${encodeURIComponent(`Connected @${saved.handle}.`)}`);
    } catch (e) {
      return redirect(`${back}?msg=${encodeURIComponent(`Sign in to ${C.PLATFORM_NAMES[p]} again. (${e.message})`)}`);
    }
  }
  if ((m = path.match(/^\/accounts\/(\d+)\/(disable|delete|enable)$/)) && M === "POST") {
    if (m[2] === "delete") await db(env).q(`DELETE FROM mob_accounts WHERE id=$1`, [m[1]]);
    else await db(env).q(`UPDATE mob_accounts SET status=$2 WHERE id=$1`, [m[1], m[2] === "disable" ? "disabled" : "connected"]);
    return redirect("/channels");
  }
  if (path === "/clips/upload" && M === "POST") {
    const f = await req.formData();
    const file = f.get("file");
    if (!file || typeof file === "string") return redirect("/clips?msg=Pick+a+video+file.");
    const slug = (file.name || "clip").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "clip";
    const key = `mob-upload-${Date.now()}-${slug}.mp4`;
    // Pass the File itself: R2 on Workers rejects a ReadableStream of unknown length, and File.stream() has none.
    await env.MEDIA.put(key, file, { httpMetadata: { contentType: "video/mp4" } });
    await db(env).q(`INSERT INTO mob_clips (key, title, size_bytes, source) VALUES ($1,$2,$3,'upload')`, [key, file.name || slug, file.size]);
    if ((req.headers.get("accept") || "").includes("application/json")) return json({ key, url: C.clipUrl(env, key), size: file.size });
    return redirect("/clips?msg=Uploaded.");
  }
  if (path === "/schedule" && M === "POST") {
    const f = await readForm(req);
    // A filled "At" box is the choice, whichever radio is ticked (typing a time and forgetting the radio
    // used to post everything at once).
    const tzWhen = f.at ? athensToUtc(f.at) : null;
    if (f.at && !tzWhen) return redirect(`/schedule?msg=${encodeURIComponent("That time is not a valid date.")}`);
    if (tzWhen && new Date(tzWhen).getTime() < Date.now() - 60000) return redirect(`/schedule?msg=${encodeURIComponent("That time is in the past.")}`);
    const r = await C.createPosts(env, {
      clip_key: f.clip_key, account_ids: arr(f.account_ids), title: f.title, caption: f.caption, scheduled_at: tzWhen,
      campaign_id: f.campaign_id || null, spread_minutes: f.spread ? 10 : 0, created_by: "admin",
    });
    if (r.errors) return redirect(`/schedule?msg=${encodeURIComponent(r.errors.join(". "))}`);
    return redirect(`/?msg=${encodeURIComponent(`Queued. ${r.posts.length} posts.`)}`);
  }
  if ((m = path.match(/^\/posts\/(\d+)\/(cancel|retry)$/)) && M === "POST") {
    const back = req.headers.get("referer") || "/posts";
    if (m[2] === "cancel") { await C.cancelPost(env, Number(m[1])); return redirect(back); }
    const f = await readForm(req).catch(() => ({}));
    const r = await C.retryPost(env, Number(m[1]), { confirm: f.confirm === "1" });
    if (r?.needs_confirm) return redirect(`/posts?msg=${encodeURIComponent("This post may already be live. Check the account, then press Retry anyway.")}`);
    return redirect(back);
  }
  if (path === "/campaigns" && M === "POST") {
    const f = await readForm(req);
    const r = await createCampaign(env, { ...f, platforms: arr(f.platforms) });
    if (r.error) return redirect(`/campaigns?msg=${encodeURIComponent(r.error)}`);
    return redirect(`/campaigns/${r.id}`);
  }
  if ((m = path.match(/^\/campaigns\/(\d+)\/submissions$/)) && M === "POST") {
    const f = await readForm(req);
    const r = await addSubmission(env, { ...f, campaign_id: Number(m[1]) });
    return redirect(`/campaigns/${m[1]}?msg=${encodeURIComponent(r.error || "Saved.")}`);
  }
  if (path === "/settings/secret" && M === "POST") {
    const f = await readForm(req);
    const saved = [];
    for (const name of SETTABLE) {
      const v = typeof f[name] === "string" ? f[name].trim() : "";
      if (!v) continue;
      const r = await putSecret(env, name, v);
      if (!r.ok) return redirect(`/settings?msg=${encodeURIComponent(`Cloudflare said: ${r.error}`)}`);
      saved.push(name);
    }
    if (f.name && !SETTABLE.includes(f.name)) return redirect(`/settings?msg=${encodeURIComponent(`${f.name} can't be set here.`)}`);
    for (const pl of Object.keys(C.PLATFORMS)) if (C.PLATFORMS[pl].secrets.some((n) => saved.includes(n))) await C.setStage(env, pl, { stage: "keys_set", by: "alex" });
    const p = saved.some((n) => n.startsWith("GOOGLE")) ? "YouTube" : saved.some((n) => n.startsWith("IG")) ? "Instagram" : saved.some((n) => n.startsWith("TIKTOK")) ? "TikTok" : null;
    return redirect(`/settings?msg=${encodeURIComponent(p ? `Saved. ${p} is ready to connect.` : "Nothing to save.")}`);
  }
  if (M === "GET" && SPA_ROUTES.some((r) => r.test(path))) return SH(path, msg || "");
  return SH("/404", "No page here.", 404);
}

// "2026-11-14T18:30" typed in Athens time -> UTC ISO.
export function athensToUtc(local) {
  const guess = new Date(local + "Z");
  if (isNaN(guess)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Athens", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess).map((p) => [p.type, p.value]));
  const asAthens = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess.getTime() - (asAthens - guess.getTime())).toISOString();
}

// Cloudflare API: PUT /accounts/{account_id}/workers/scripts/{script_name}/secrets {name,text,type:"secret_text"}
// https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/update/
export async function putSecret(env, name, value) {
  if (!SETTABLE.includes(name)) return { ok: false, error: `${name} is not allowed` };
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { ok: false, error: "CF_API_TOKEN / CF_ACCOUNT_ID missing on the worker" };
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${env.MOB_SCRIPT_NAME || "mob"}/secrets`, {
    method: "PUT", headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ name, text: value, type: "secret_text" }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) return { ok: false, error: `${res.status} ${(j.errors || []).map((e) => `${e.code}: ${e.message}`).join("; ")}` };
  return { ok: true };
}

/* ---------------- shared data ---------------- */
const POST_SELECT = `SELECT p.*, a.platform, a.handle FROM mob_posts p LEFT JOIN mob_accounts a ON a.id=p.account_id`;

const MONEY_FIELDS = ["cpm_usd", "min_payout_usd", "max_payout_usd", "budget_usd", "paid_out_usd"];
function moneyFields(f) {
  const out = {};
  for (const k of MONEY_FIELDS) {
    if (!(k in f)) continue;
    const v = f[k] === "" || f[k] == null ? null : Number(f[k]);
    if (v != null && (isNaN(v) || v < 0)) return { error: `${k} must be a number.` };
    out[k] = v;
  }
  return out;
}
// Campaign links come from pages Claude reads (untrusted): only a real https URL is stored, never javascript: & co.
export function badCampaignUrl(u) {
  if (u == null || u === "") return null;
  try { if (new URL(String(u)).protocol === "https:") return null; } catch { }
  return "Campaign link must be an https:// address.";
}
export async function createCampaign(env, f) {
  const bu = badCampaignUrl(f.url); if (bu) return { error: bu };
  if (!f.name || !String(f.name).trim()) return { error: "Campaign needs a name." };
  const plats = arr(f.platforms).filter((p) => C.PLATFORMS[p]);
  const mf = moneyFields(f);
  if (mf.error) return mf;
  return db(env).one(`INSERT INTO mob_campaigns (name, url, rules, platforms, cpm_usd, min_payout_usd, max_payout_usd, budget_usd, paid_out_usd) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [String(f.name).trim(), f.url || null, f.rules || null, plats, mf.cpm_usd ?? null, mf.min_payout_usd ?? null, mf.max_payout_usd ?? null, mf.budget_usd ?? null, mf.paid_out_usd ?? null]);
}
export async function updateCampaign(env, id, f) {
  const bu = badCampaignUrl(f.url); if (bu) return { error: bu };
  const mf = moneyFields(f);
  if (mf.error) return mf;
  const sets = [], vals = [id];
  const add = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  if (f.name != null) { if (!String(f.name).trim()) return { error: "Campaign needs a name." }; add("name", String(f.name).trim()); }
  for (const k of ["url", "rules"]) if (k in f) add(k, f[k] || null);
  if ("platforms" in f) add("platforms", arr(f.platforms).filter((p) => C.PLATFORMS[p]));
  if ("status" in f && ["active", "ended"].includes(f.status)) add("status", f.status);
  for (const [k, v] of Object.entries(mf)) add(k, v);
  if (!sets.length) return db(env).one(`SELECT * FROM mob_campaigns WHERE id=$1`, [id]);
  return (await db(env).one(`UPDATE mob_campaigns SET ${sets.join(", ")} WHERE id=$1 RETURNING *`, vals)) || { error: "No such campaign." };
}

// Platform developer-app keys (Claude reads them off the console and posts them here). Shape-checked, written as
// Worker secrets through putSecret, never echoed, never logged.
export async function setPlatformKeys(env, b) {
  const p = b?.platform;
  if (!C.PLATFORMS[p]) return { status: 400, error: "platform must be youtube, instagram or tiktok" };
  const id = b.client_id ?? b.id, secret = b.client_secret ?? b.secret;
  for (const v of [id, secret]) if (typeof v !== "string" || !v || /\s/.test(v) || v.length > 512) return { status: 400, error: "id and secret must be non-empty with no spaces" };
  const [nId, nSecret] = C.PLATFORMS[p].secrets;
  for (const [n, v] of [[nId, id], [nSecret, secret]]) {
    const r = await putSecret(env, n, v);
    if (!r.ok) return { status: 502, error: `Cloudflare said: ${r.error}` };
  }
  await C.setStage(env, p, { stage: "keys_set", client_id_hint: id.slice(-4), by: b.by || "claude" });
  return { platform: p, state: C.hasSecrets(env, p) ? "ready" : "activating", live: C.hasSecrets(env, p) };
}

async function addSubmission(env, f) {
  let posted = f.posted_url;
  const postId = f.post_id ? Number(f.post_id) : null;
  if (!posted && postId) posted = (await db(env).one(`SELECT remote_url FROM mob_posts WHERE id=$1`, [postId]))?.remote_url;
  if (!posted) return { error: "posted_url or a posted post_id is required." };
  if (!(await db(env).one(`SELECT id FROM mob_campaigns WHERE id=$1`, [f.campaign_id]))) return { error: "No such campaign." };
  const status = ["submitted", "approved", "rejected", "paid"].includes(f.status) ? f.status : "submitted";
  return db(env).one(
    `INSERT INTO mob_submissions (campaign_id, post_id, posted_url, status, views, payout_usd, note) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (campaign_id, posted_url) DO UPDATE SET status=EXCLUDED.status, views=COALESCE(EXCLUDED.views, mob_submissions.views),
       payout_usd=COALESCE(EXCLUDED.payout_usd, mob_submissions.payout_usd), note=COALESCE(EXCLUDED.note, mob_submissions.note),
       post_id=COALESCE(EXCLUDED.post_id, mob_submissions.post_id)
     RETURNING *`,
    [f.campaign_id, postId, posted, status, f.views === "" || f.views == null ? null : Number(f.views), f.payout_usd === "" || f.payout_usd == null ? null : Number(f.payout_usd), f.note || null],
  );
}

/* ---------------- JSON API ---------------- */
async function api(req, env, url, path, M) {
  if (path.startsWith("/api/aquarius/")) return aquarius(req, env, url, path, M);
  if (path.startsWith("/api/aq/")) return aqApi(req, env, url, path, { json, apiErr, admin: await isAdmin(req, env), bearer: isBearer(req, env),
    keyOk: !!env.AQUARIUS_KEY && safeEqual(url.searchParams.get("key") || req.headers.get("x-aquarius-key") || "", env.AQUARIUS_KEY) });
  if (path === "/api/news") return newsApi(req, env, M, { json, apiErr, ok: isBearer(req, env) || (await isAdmin(req, env)) });
  if (path === "/api/income") return incomeApi(req, env, M, { json, apiErr, ok: isBearer(req, env) || (await isAdmin(req, env)) });
  if (!isBearer(req, env)) return apiErr(401, "unauthorized", "Bearer MOB_API_TOKEN required");
  try { await C.setSetting(env, "claude_seen", new Date().toISOString()); } catch {}
  let m;
  const body = async () => { try { return await req.json(); } catch { return null; } };
  if (path === "/api/accounts" && M === "GET") return json((await C.listAccounts(env)).map(({ id, platform, handle, status }) => ({ id, platform, handle, status })));
  if (path === "/api/clips" && M === "GET") {
    const r = await C.listClips(env, url.searchParams.get("cursor"));
    return json({ clips: r.clips.map(({ key, url, size, uploaded }) => ({ key, url, size, uploaded })), cursor: r.cursor });
  }
  if (path === "/api/posts" && M === "POST") {
    const b = await body();
    if (!b) return apiErr(400, "bad_json", "Body must be JSON");
    if (b.account_ids != null && !Array.isArray(b.account_ids)) return apiErr(400, "validation", "account_ids must be an array");
    if (b.platforms != null && !Array.isArray(b.platforms)) return apiErr(400, "validation", "platforms must be an array");
    const r = await C.createPosts(env, { ...b, created_by: "api" });
    if (r.errors) return apiErr(400, "validation", r.errors.join("; "));
    return json({ posts: r.posts, skipped: r.skipped }, 201);
  }
  if (path === "/api/posts" && M === "GET") {
    const st = url.searchParams.get("status"), since = url.searchParams.get("since");
    if (since && isNaN(new Date(since))) return apiErr(400, "validation", "since must be an ISO date");
    return json(await db(env).q(`${POST_SELECT} WHERE ($1::text IS NULL OR p.status=$1) AND ($2::timestamptz IS NULL OR p.updated_at >= $2) ORDER BY p.scheduled_at DESC LIMIT 200`, [st, since]));
  }
  if ((m = path.match(/^\/api\/posts\/(\d+)$/)) && M === "GET") {
    const p = await db(env).one(`${POST_SELECT} WHERE p.id=$1`, [m[1]]);
    return p ? json(p) : apiErr(404, "not_found", "No such post");
  }
  if ((m = path.match(/^\/api\/posts\/(\d+)\/cancel$/)) && M === "POST") {
    const p = await C.cancelPost(env, Number(m[1]));
    return p ? json(p) : apiErr(409, "not_cancelable", "Post is not scheduled or failed");
  }
  if (path === "/api/campaigns" && M === "GET") return json(await db(env).q(`SELECT * FROM mob_campaigns ORDER BY id DESC`));
  if (path === "/api/campaigns" && M === "POST") {
    const b = await body();
    const r = b ? await createCampaign(env, b) : { error: "Body must be JSON" };
    return r.error ? apiErr(400, "validation", r.error) : json(r, 201);
  }
  if (path === "/api/submissions" && M === "POST") {
    const b = await body();
    if (!b?.campaign_id) return apiErr(400, "validation", "campaign_id is required");
    const r = await addSubmission(env, b);
    return r.error ? apiErr(400, "validation", r.error) : json(r, 201);
  }
  if (path === "/api/submissions" && M === "GET") {
    const c = url.searchParams.get("campaign_id");
    if (c && !/^\d+$/.test(c)) return apiErr(400, "validation", "campaign_id must be a whole number");
    return json(await db(env).q(`SELECT * FROM mob_submissions WHERE ($1::int IS NULL OR campaign_id=$1) ORDER BY submitted_at DESC`, [c ? Number(c) : null]));
  }
  if ((m = path.match(/^\/api\/posts\/(\d+)\/retry$/)) && M === "POST") {
    const b = (await body()) || {};
    const r = await C.retryPost(env, Number(m[1]), { confirm: b.confirm === true });
    if (!r) return apiErr(409, "not_retryable", "Post is not failed, skipped or canceled");
    if (r.needs_confirm) return apiErr(409, "may_be_live", "Upload may already be live on the account. Check it, then send {\"confirm\":true}");
    return json(r);
  }
  if (path === "/api/run" && M === "POST") return json(await C.runTick(env));
  // ---- setup: Claude reports progress, reads redirect URIs and scopes, and sets keys ----
  if ((path === "/api/setup" || path === "/api/platform-keys") && M === "GET") {
    const st = await C.setupState(env);
    if (path === "/api/platform-keys") return json(Object.fromEntries(Object.entries(st).map(([p, s]) => [p, { state: s.state, live: s.live }])));
    const asked = (await C.getSetting(env, "asked", {})) || {};
    for (const p of Object.keys(st)) st[p].asked_at = asked[p] || null;
    return json(st);
  }
  if ((m = path.match(/^\/api\/setup(?:\/(youtube|instagram|tiktok))?$/)) && M === "POST") {
    const b = (await body()) || {};
    const p = m[1] || b.platform;
    if (!C.PLATFORMS[p]) return apiErr(400, "validation", "platform must be youtube, instagram or tiktok");
    const alias = { setting_up: "claude_working", not_set_up: "none" };
    const stage = b.stage ?? (b.state ? alias[b.state] || b.state : undefined);
    if (stage != null && !C.STAGES.includes(stage)) return apiErr(400, "validation", `stage must be one of ${C.STAGES.join(", ")}`);
    if (b.review_status != null && !C.REVIEW.includes(b.review_status)) return apiErr(400, "validation", `review_status must be one of ${C.REVIEW.join(", ")}`);
    await C.setStage(env, p, { stage, stage_note: b.stage_note ?? b.note, review_status: b.review_status, by: "claude" });
    return json((await C.setupState(env))[p]);
  }
  if ((path === "/api/platform-keys" || path === "/api/settings/keys") && M === "POST") {
    const r = await setPlatformKeys(env, await body());
    return r.error ? apiErr(r.status, "validation", r.error) : json({ ok: true, ...r });
  }
  // ---- stats and money ----
  if (path === "/api/stats" && M === "GET") {
    const range = url.searchParams.get("range") || "30d";
    if (!S.RANGES[range]) return apiErr(400, "validation", `range must be one of ${Object.keys(S.RANGES).join(", ")}`);
    const o = await S.overview(env, range);
    const acc = url.searchParams.get("account");
    if (acc) o.accounts = o.accounts.filter((a) => String(a.id) === acc);
    return json(o);
  }
  if (path === "/api/stats/pull" && M === "POST") {
    const b = (await body()) || {};
    return json(await S.pullStats(env, C.STATS_DEPS, { accountId: b.account_id ? Number(b.account_id) : null, force: true, limit: b.account_id ? 1 : 50 }));
  }
  if (path === "/api/earnings" && M === "GET") {
    const c = url.searchParams.get("campaign");
    if (c && !/^\d+$/.test(c)) return apiErr(400, "validation", "campaign must be a whole number");
    return json(await S.earnings(env, { campaignId: c ? Number(c) : null }));
  }
  // Claude reads a Content Rewards page (through Cursor Clipper) and posts the fields; upsert by link.
  if (path === "/api/campaigns/parse" && M === "POST") {
    const b = await body();
    if (!b?.url) return apiErr(400, "validation", "url is required");
    if (badCampaignUrl(b.url)) return apiErr(400, "validation", badCampaignUrl(b.url));
    const ex = await db(env).one(`SELECT id FROM mob_campaigns WHERE url=$1`, [b.url]);
    const r = ex ? await updateCampaign(env, ex.id, b) : await createCampaign(env, b);
    return r.error ? apiErr(400, "validation", r.error) : json(r, ex ? 200 : 201);
  }
  if ((m = path.match(/^\/api\/campaigns\/(\d+)$/)) && M === "POST") {
    const r = await updateCampaign(env, Number(m[1]), (await body()) || {});
    return r.error ? apiErr(400, "validation", r.error) : json(r);
  }
  return apiErr(404, "not_found", "No such endpoint");
}


/*
 * Aquarius — the genie on Alex's screen. A tiny mailbox:
 *   POST /api/aquarius/say {text, face?, suit?, to_chat?} bearer MOB_API_TOKEN   -> he types it
 *   GET  /api/aquarius/feed?key=AQUARIUS_KEY                             -> last 20 messages (the app polls this)
 *   POST /api/aquarius/heard?key=AQUARIUS_KEY {text}                     -> a voice command Alex said ("Aquarius, ...")
 *   GET  /api/aquarius/inbox                      bearer MOB_API_TOKEN   -> commands not yet taken, marked taken
 * The key is baked into the app; it can only read his own speech bubbles and drop commands in the inbox.
 */
export const AQUARIUS_FACES = ["happy", "focused", "smug", "worried", "talking"];
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, x-aquarius-key" };
const cors = (r) => { for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v); return r; };
async function aquarius(req, env, url, path, M) {
  if (M === "OPTIONS") return cors(new Response(null, { status: 204 }));
  const keyOk = () => !!env.AQUARIUS_KEY && safeEqual(url.searchParams.get("key") || req.headers.get("x-aquarius-key") || "", env.AQUARIUS_KEY);
  const d = db(env);
  const body = async () => { try { return await req.json(); } catch { return null; } };
  const cleanText = (t) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim() : "");
  if (path === "/api/aquarius/feed" && M === "GET") {
    if (!keyOk()) return cors(apiErr(401, "unauthorized", "key required"));
    const rows = await d.q(`SELECT id, text, face, suit, to_chat, created_at FROM mob_aquarius WHERE kind='say' ORDER BY id DESC LIMIT 20`);
    return cors(json({ messages: rows.reverse().map((r) => ({ id: r.id, text: r.text, face: r.face, suit: r.suit, to_chat: r.to_chat, at: r.created_at })) }));
  }
  if (path === "/api/aquarius/heard" && M === "POST") {
    if (!keyOk()) return cors(apiErr(401, "unauthorized", "key required"));
    const b = await body();
    const text = cleanText(b?.text);
    if (!text || text.length > 500) return cors(apiErr(400, "validation", "text must be 1-500 characters"));
    const { n } = await d.one(`SELECT count(*)::int n FROM mob_aquarius WHERE kind='heard' AND created_at > now() - interval '1 hour'`);
    if (n >= 120) return cors(apiErr(429, "too_many", "Too many commands this hour"));
    const r = await d.one(`INSERT INTO mob_aquarius (kind, text) VALUES ('heard', $1) RETURNING id, created_at`, [text]);
    return cors(json({ id: r.id, at: r.created_at }, 201));
  }
  let lm;
  if ((lm = path.match(/^\/api\/aquarius\/link\/([^/]+)\/(mcp|next|result|status)$/))) {
    if (!env.AQ_LINK_KEY || !safeEqual(lm[1], env.AQ_LINK_KEY)) return new Response("Not found", { status: 404 });
    return cors(await aquariusLink(req, env, lm[2], M));
  }
  if (!isBearer(req, env)) return apiErr(401, "unauthorized", "Bearer MOB_API_TOKEN required");
  if (path === "/api/aquarius/brain" && M === "GET") {
    const biz = url.searchParams.get("business"), lim = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));
    return json({ rows: await d.q(`SELECT * FROM mob_aquarius_brain WHERE ($1::text IS NULL OR business=$1) ORDER BY id DESC LIMIT $2`, [biz, lim]) });
  }
  if ((path === "/api/aquarius/brain" || /^\/api\/aquarius\/brain\/\d+$/.test(path)) && M === "POST") {
    const b = await body();
    if (!b || typeof b !== "object") return apiErr(400, "bad_json", "Body must be JSON");
    const v = brainFields(b);
    if (v.error) return apiErr(400, "validation", v.error);
    const id = path.split("/")[4];
    if (!id) {
      if (!v.set.idea) return apiErr(400, "validation", "idea is required");
      const cols = Object.keys(v.set);
      const r = await d.one(`INSERT INTO mob_aquarius_brain (${cols.join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`, Object.values(v.set));
      return json(r, 201);
    }
    const cols = Object.keys(v.set);
    if (!cols.length) return apiErr(400, "validation", "nothing to change");
    const r = await d.one(`UPDATE mob_aquarius_brain SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(",")}, updated_at=now() WHERE id=$1 RETURNING *`, [Number(id), ...Object.values(v.set)]);
    return r ? json(r) : apiErr(404, "not_found", "No such brain row");
  }
  if (path === "/api/aquarius/say" && M === "POST") {
    const b = await body();
    if (!b) return apiErr(400, "bad_json", "Body must be JSON");
    const text = cleanText(b.text);
    if (!text || text.length > 500) return apiErr(400, "validation", "text must be 1-500 characters");
    if (b.face != null && !AQUARIUS_FACES.includes(b.face)) return apiErr(400, "validation", `face must be one of ${AQUARIUS_FACES.join(", ")}`);
    if (b.suit != null && typeof b.suit !== "boolean") return apiErr(400, "validation", "suit must be true or false");
    if (b.to_chat != null && typeof b.to_chat !== "boolean") return apiErr(400, "validation", "to_chat must be true or false");
    const r = await d.one(`INSERT INTO mob_aquarius (kind, text, face, suit, to_chat) VALUES ('say', $1, $2, $3, $4) RETURNING id, created_at`, [text, b.face ?? null, b.suit ?? null, b.to_chat === true]);
    return json({ id: r.id, at: r.created_at }, 201);
  }
  if (path === "/api/aquarius/inbox" && M === "GET") {
    const rows = await d.q(`UPDATE mob_aquarius SET taken_at=now() WHERE id IN (SELECT id FROM mob_aquarius WHERE kind='heard' AND taken_at IS NULL ORDER BY id FOR UPDATE SKIP LOCKED) RETURNING id, text, created_at`);
    rows.sort((a, b) => a.id - b.id);
    return json({ commands: rows.map((r) => ({ id: r.id, text: r.text, at: r.created_at })) });
  }
  return apiErr(404, "not_found", "No such endpoint");
}

// The brain: every gem run writes what it tried and what paid, and reads the history back before choosing.
const BRAIN_TEXT = ["idea", "business", "result", "source"], BRAIN_NUM = ["cost", "expected_return", "score"];
function brainFields(b) {
  const set = {};
  for (const k of BRAIN_TEXT) if (b[k] != null) { if (typeof b[k] !== "string" || b[k].length > 4000) return { error: `${k} must be text` }; set[k] = b[k].trim(); }
  for (const k of BRAIN_NUM) if (b[k] != null) { const n = Number(b[k]); if (!Number.isFinite(n)) return { error: `${k} must be a number` }; set[k] = n; }
  if (b.kill_date != null) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.kill_date)) || isNaN(new Date(b.kill_date))) return { error: "kill_date must be YYYY-MM-DD" }; set.kill_date = b.kill_date; }
  return { set };
}

/*
 * Aquarius's hands: a mailbox between Claude (MCP) and the agent in his own Chrome on Alex's Mac.
 *   POST /api/aquarius/link/<AQ_LINK_KEY>/mcp     JSON-RPC: aquarius_status, aquarius_act, aquarius_result
 *   GET  .../next     the app takes the oldest queued command
 *   POST .../result   the app answers {id, text, image?}
 *   POST .../status   the app's heartbeat
 */
const LINK_ACTIONS = ["look", "find", "read_text", "click", "type", "select", "press", "scroll", "navigate", "screenshot", "wait", "close", "done"];
const LINK_TOOLS = [
  { name: "aquarius_status", description: "Is Aquarius on (on Alex's Mac), is his Chrome up, and what page is it on? Call first.", inputSchema: { type: "object", properties: {} } },
  { name: "aquarius_act", description: [
    "Do ONE step in Aquarius's own Chrome on Alex's Mac (any site; he sparkles where he types and clicks).",
    "Fast: answers with the url and title only. Pass look:true, or call action look, to get the accessibility snapshot with refs like [ref=e17].",
    "action: look {full?} | find {text} | read_text {ref?} | click {ref, why, final?} | type {ref, text, why, clear?, enter?} | select {ref, option} |",
    "press {key} | scroll {direction, amount?} | navigate {url, why} | screenshot {} | wait {seconds} | close {} (closes his tab) | done {summary}.",
    "final on click: none|publish|send|buy|delete|price|other. Anything to do with payments, checkout, orders, billing or settings shows Alex an",
    "Approve/Deny card first; if he takes longer than ~40 s you get an id for aquarius_result. Password and card fields are never typed.",
  ].join(" "), inputSchema: { type: "object", properties: {
    action: { type: "string", enum: LINK_ACTIONS }, ref: { type: "string" }, text: { type: "string" }, why: { type: "string" },
    final: { type: "string", enum: ["none", "publish", "send", "buy", "delete", "price", "other"] }, clear: { type: "boolean" }, enter: { type: "boolean" },
    option: { type: "string" }, key: { type: "string" }, url: { type: "string" }, direction: { type: "string", enum: ["down", "up"] },
    amount: { type: "string", enum: ["small", "page"] }, full: { type: "boolean" }, look: { type: "boolean" }, seconds: { type: "number" }, summary: { type: "string" },
  }, required: ["action"] } },
  { name: "aquarius_result", description: "The answer to an aquarius_act that was still waiting (usually for Alex's card). Waits up to ~40 s.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
];
export const LINK_WAIT_MS = { v: 40000 };
async function linkWait(env, id) {
  const end = Date.now() + LINK_WAIT_MS.v;
  for (;;) {
    const r = await db(env).one(`SELECT result FROM mob_aquarius_link WHERE id=$1 AND state='done'`, [id]);
    if (r) return r.result;
    if (Date.now() > end) return null;
    await new Promise((ok) => setTimeout(ok, 700));
  }
}
const linkContent = (r, id) => {
  if (!r) return [{ type: "text", text: `Still running (most likely waiting for Alex's card). Call aquarius_result with id "${id}".` }];
  const out = [{ type: "text", text: String(r.text || "") }];
  if (r.image) out.push({ type: "image", data: r.image, mimeType: "image/jpeg" });
  return out;
};
async function linkStatus(env) { const s = await db(env).one(`SELECT value FROM mob_settings WHERE key='aquarius_link_status'`); return s ? s.value : null; }
async function linkTool(env, name, args) {
  if (name === "aquarius_status") {
    const s = await linkStatus(env);
    if (!s) return [{ type: "text", text: "Aquarius has never connected. Alex needs to open the app." }];
    const age = Math.round((Date.now() - (s.at || 0)) / 1000);
    return [{ type: "text", text: `${age < 30 ? "connected" : `NOT connected (last seen ${age} s ago)`}\n${JSON.stringify(s, null, 1)}` }];
  }
  if (name === "aquarius_act") {
    const action = String(args.action || "");
    if (!LINK_ACTIONS.includes(action)) return [{ type: "text", text: `action must be one of ${LINK_ACTIONS.join(", ")}` }];
    const s = await linkStatus(env);
    if (!s || Date.now() - (s.at || 0) > 30000) return [{ type: "text", text: "Aquarius is not on right now (Alex must open the app). Nothing was queued." }];
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const { action: _, ...input } = args;
    await db(env).q(`INSERT INTO mob_aquarius_link (id, action, input) VALUES ($1,$2,$3)`, [id, action, JSON.stringify(input)]);
    return linkContent(await linkWait(env, id), id);
  }
  if (name === "aquarius_result") { const id = String(args.id || "").replace(/[^a-z0-9]/gi, ""); return linkContent(await linkWait(env, id), id); }
  return [{ type: "text", text: `no such tool: ${name}` }];
}
async function linkRpc(env, b) {
  const id = b && b.id !== undefined ? b.id : null, m = b && b.method;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  if (m === "initialize") return reply({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "aquarius", title: "Aquarius", version: "1.0.0" } });
  if (m === "notifications/initialized") return null;
  if (m === "tools/list") return reply({ tools: LINK_TOOLS });
  if (m === "tools/call") return reply({ content: await linkTool(env, b.params?.name || "", b.params?.arguments || {}) });
  if (m === "ping") return reply({});
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } };
}
async function aquariusLink(req, env, what, M) {
  const d = db(env);
  if (what === "mcp") {
    if (M === "GET") return json({ ok: true, server: "aquarius", tools: LINK_TOOLS.map((t) => t.name) });
    let b; try { b = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400); }
    const out = Array.isArray(b) ? (await Promise.all(b.map((x) => linkRpc(env, x)))).filter(Boolean) : await linkRpc(env, b);
    return out && (!Array.isArray(out) || out.length) ? json(out) : new Response(null, { status: 202 });
  }
  if (what === "next" && M === "GET") {
    const r = await d.one(`UPDATE mob_aquarius_link SET state='running', taken_at=now() WHERE id=(SELECT id FROM mob_aquarius_link WHERE state='queued' ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id, action, input`);
    return json(r ? { id: r.id, action: r.action, input: r.input } : null);
  }
  if (what === "result" && M === "POST") {
    let b; try { b = await req.json(); } catch { b = null; }
    if (!b || !b.id) return json({ ok: false }, 400);
    await d.q(`UPDATE mob_aquarius_link SET state='done', done_at=now(), result=$2 WHERE id=$1`, [String(b.id), JSON.stringify({ text: String(b.text || ""), image: b.image || null })]);
    await d.q(`DELETE FROM mob_aquarius_link WHERE created_at < now() - interval '2 days'`);
    return json({ ok: true });
  }
  if (what === "status" && M === "POST") {
    let b; try { b = await req.json(); } catch { b = {}; }
    await d.q(`INSERT INTO mob_settings (key, value, updated_at) VALUES ('aquarius_link_status', $1, now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify({ ...b, at: Date.now() })]);
    return json({ ok: true });
  }
  if (what === "status") return json(await linkStatus(env));
  return new Response("Not found", { status: 404 });
}

function policyPage(path) {
  const privacy = path === "/privacy";
  const body = privacy
    ? `<h1>Privacy policy</h1><p>Updated 15 November 2026.</p>
<p>mob is a private posting tool used by its owner to publish their own videos to their own YouTube, Instagram and TikTok accounts, and to read those accounts' public statistics.</p>
<h2>What we access</h2><p>When the owner connects an account, the platform gives mob an access token. mob uses it only to upload the owner's videos, set their titles and captions, and read view counts and channel statistics. Tokens are stored encrypted on our server and are never shared or sold.</p>
<h2>Aquarius browser extension</h2><p>The extension shows an assistant on claude.ai. If the owner turns listening on, Chrome's built-in speech recognition transcribes speech; only the words said after the name "Aquarius" are sent, to the owner's own mob server. The extension does not collect browsing history, sell data, or load remote code.</p>
<h2>Removal</h2><p>The owner can disconnect any account at any time in mob or in the platform's own settings, and the tokens are deleted. Google users can also revoke access at myaccount.google.com/permissions.</p>
<h2>Contact</h2><p>Questions: reply through the store listing's support contact.</p>`
    : `<h1>Terms of service</h1><p>Updated 15 November 2026.</p>
<p>mob is a private tool operated for its owner. Access is limited to the owner and accounts the owner connects. You may use it only to post content you have the rights to, in line with each platform's own terms. The service is provided as is, without warranty. Access can be withdrawn at any time.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mob · ${privacy ? "Privacy" : "Terms"}</title>
<style>body{font:16px/1.6 -apple-system,Helvetica,Arial,sans-serif;max-width:680px;margin:40px auto;padding:0 16px;color:#1a1a1a}h1{font-size:28px}h2{font-size:18px;margin-top:28px}</style></head><body>${body}</body></html>`;
}
