/*
 * mob — our own posting platform. Posts R2 clips to YouTube Shorts, Instagram Reels and TikTok from many
 * connected accounts, and tracks Whop Content Rewards campaigns and submissions.
 * Standalone Worker: deploying it never touches Kerberos. See tools/mob/README.md.
 */
import { db, migrate } from "./db.mjs";
import { isAdmin, isBearer, makeSessionCookie, safeEqual } from "./auth.mjs";
import { base, redirectUri } from "./platforms/common.mjs";
import * as C from "./core.mjs";
import { page, loginPage, esc, chip, badge, athens, mb, postRow } from "./ui.mjs";
import { TITLE_MAX } from "./platforms/youtube.mjs";
import { CAPTION_MAX as IG_MAX } from "./platforms/instagram.mjs";
import { TITLE_MAX_UTF16 as TT_MAX } from "./platforms/tiktok.mjs";

export const BUILD = "mob-2";
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
const arr = (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]);

export default {
  async fetch(req, env, ctx) {
    try { return await route(req, env, ctx); } catch (e) {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/api/")) return apiErr(500, "internal", String(e.message || e));
      return html(page("Something broke", "", `<div class="bad">${esc(e.message || e)}</div>`, { build: BUILD }), 500);
    }
  },
  async scheduled(event, env, ctx) {
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

  const P = (title, active, body, toast) => html(page(title, active, body, { build: BUILD, toast }));
  const msg = url.searchParams.get("msg");
  let m;

  if (path === "/admin/migrate") { await migrate(env); return P("Database", "", `<div class="ok">Tables are ready.</div>`); }
  if (path === "/") return dashboard(env, P, msg);
  if (path === "/accounts" && M === "GET") return accountsPage(env, P, msg);
  if ((m = path.match(/^\/connect\/(youtube|instagram|tiktok)$/))) {
    const p = m[1];
    if (!C.hasSecrets(env, p)) return redirect(`/settings?msg=${encodeURIComponent(`Add the ${C.PLATFORM_NAMES[p]} keys first.`)}`);
    const state = crypto.randomUUID();
    await db(env).q(`DELETE FROM mob_oauth_state WHERE created_at < now() - interval '15 minutes'`);
    await db(env).q(`INSERT INTO mob_oauth_state (state, platform) VALUES ($1,$2)`, [state, p]);
    return redirect(C.PLATFORMS[p].authorizeUrl(env, state));
  }
  if ((m = path.match(/^\/oauth\/(youtube|instagram|tiktok)\/callback$/))) {
    const p = m[1];
    const state = url.searchParams.get("state") || "";
    const row = await db(env).one(`DELETE FROM mob_oauth_state WHERE state=$1 AND platform=$2 RETURNING created_at`, [state, p]);
    if (!row || Date.now() - new Date(row.created_at).getTime() > 15 * 60000) return html(page("Connect", "/accounts", `<div class="bad">That sign-in link expired. Press Connect again.</div>`, { build: BUILD }), 400);
    const code = url.searchParams.get("code");
    if (!code) return redirect(`/accounts?msg=${encodeURIComponent(`${C.PLATFORM_NAMES[p]} said: ${url.searchParams.get("error_description") || url.searchParams.get("error") || "no code"}`)}`);
    try {
      const a = await C.PLATFORMS[p].exchange(env, code);
      const saved = await C.upsertAccount(env, p, a);
      return redirect(`/accounts?msg=${encodeURIComponent(`Connected @${saved.handle}.`)}`);
    } catch (e) {
      return redirect(`/accounts?msg=${encodeURIComponent(`${C.PLATFORM_NAMES[p]} said: ${e.message}`)}`);
    }
  }
  if ((m = path.match(/^\/accounts\/(\d+)\/(disable|delete|enable)$/)) && M === "POST") {
    if (m[2] === "delete") await db(env).q(`DELETE FROM mob_accounts WHERE id=$1`, [m[1]]);
    else await db(env).q(`UPDATE mob_accounts SET status=$2 WHERE id=$1`, [m[1], m[2] === "disable" ? "disabled" : "connected"]);
    return redirect("/accounts");
  }
  if (path === "/clips" && M === "GET") return clipsPage(env, P, url);
  if (path === "/clips/upload" && M === "POST") {
    const f = await req.formData();
    const file = f.get("file");
    if (!file || typeof file === "string") return redirect("/clips?msg=Pick+a+video+file.");
    const slug = (file.name || "clip").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "clip";
    const key = `mob-upload-${Date.now()}-${slug}.mp4`;
    // Pass the File itself: R2 on Workers rejects a ReadableStream of unknown length, and File.stream() has none.
    await env.MEDIA.put(key, file, { httpMetadata: { contentType: "video/mp4" } });
    await db(env).q(`INSERT INTO mob_clips (key, title, size_bytes, source) VALUES ($1,$2,$3,'upload')`, [key, file.name || slug, file.size]);
    return redirect("/clips?msg=Uploaded.");
  }
  if (path === "/schedule" && M === "GET") return schedulePage(env, P, url);
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
  if (path === "/posts") return postsPage(env, P, url);
  if (path === "/campaigns" && M === "GET") return campaignsPage(env, P, msg);
  if (path === "/campaigns" && M === "POST") {
    const f = await readForm(req);
    const r = await createCampaign(env, { ...f, platforms: arr(f.platforms) });
    if (r.error) return redirect(`/campaigns?msg=${encodeURIComponent(r.error)}`);
    return redirect(`/campaigns/${r.id}`);
  }
  if ((m = path.match(/^\/campaigns\/(\d+)$/))) return campaignPage(env, P, Number(m[1]), msg);
  if ((m = path.match(/^\/campaigns\/(\d+)\/submissions$/)) && M === "POST") {
    const f = await readForm(req);
    const r = await addSubmission(env, { ...f, campaign_id: Number(m[1]) });
    return redirect(`/campaigns/${m[1]}?msg=${encodeURIComponent(r.error || "Saved.")}`);
  }
  if (path === "/settings" && M === "GET") return settingsPage(env, P, msg);
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
    const p = saved.some((n) => n.startsWith("GOOGLE")) ? "YouTube" : saved.some((n) => n.startsWith("IG")) ? "Instagram" : saved.some((n) => n.startsWith("TIKTOK")) ? "TikTok" : null;
    return redirect(`/settings?msg=${encodeURIComponent(p ? `Saved. ${p} is ready to connect.` : "Nothing to save.")}`);
  }
  return html(page("Not found", "", `<div class="card">No page here. <a href="/">Dashboard</a></div>`, { build: BUILD }), 404);
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

async function createCampaign(env, f) {
  if (!f.name || !String(f.name).trim()) return { error: "Campaign needs a name." };
  const plats = arr(f.platforms).filter((p) => C.PLATFORMS[p]);
  const cpm = f.cpm_usd === "" || f.cpm_usd == null ? null : Number(f.cpm_usd);
  if (cpm != null && isNaN(cpm)) return { error: "cpm_usd must be a number." };
  return db(env).one(`INSERT INTO mob_campaigns (name, url, rules, platforms, cpm_usd) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [String(f.name).trim(), f.url || null, f.rules || null, plats, cpm]);
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
  if (!isBearer(req, env)) return apiErr(401, "unauthorized", "Bearer MOB_API_TOKEN required");
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
  return apiErr(404, "not_found", "No such endpoint");
}

/* ---------------- pages ---------------- */
async function dashboard(env, P, msg) {
  const d = db(env);
  const stats = await d.one(`SELECT
    count(*) FILTER (WHERE status='scheduled' AND scheduled_at < date_trunc('day', now()) + interval '1 day')::int queued,
    count(*) FILTER (WHERE status='posted' AND updated_at >= date_trunc('day', now()))::int posted,
    count(*) FILTER (WHERE status='failed' AND updated_at >= date_trunc('day', now()))::int failed FROM mob_posts`);
  const quota = await d.q(`SELECT a.platform, count(*)::int n FROM mob_posts p JOIN mob_accounts a ON a.id=p.account_id
    WHERE p.status IN ('posted','processing') AND p.updated_at >= date_trunc('day', now()) GROUP BY a.platform`);
  const next = await d.q(`${POST_SELECT} WHERE p.status IN ('scheduled','publishing','processing') ORDER BY p.scheduled_at LIMIT 10`);
  const posted = await d.q(`${POST_SELECT} WHERE p.status='posted' ORDER BY p.updated_at DESC LIMIT 20`);
  const failed = await d.q(`${POST_SELECT} WHERE p.status IN ('failed','skipped') ORDER BY p.updated_at DESC LIMIT 20`);
  const q = (p) => quota.find((x) => x.platform === p)?.n || 0;
  const rows = (list) => list.map((p) => postRow(p, C.clipUrl(env, p.clip_key))).join("");
  const body = `<div class="stats"><div class="card stat"><div class="lbl">Today queued</div><div class="n">${stats.queued}</div></div>
<div class="card stat"><div class="lbl">Posted today</div><div class="n">${stats.posted}</div></div><div class="card stat"><div class="lbl">Failed</div><div class="n">${stats.failed}</div></div></div>
<div class="lbl">Used today: ${chip("youtube")}<span class="mono">${q("youtube")} / 100</span> &nbsp; ${chip("instagram")}<span class="mono">${q("instagram")}</span> &nbsp; ${chip("tiktok")}<span class="mono">${q("tiktok")}</span></div>
<h2>Today</h2><div class="card">${next.length ? rows(next) : `Nothing queued today. <a class="btn" href="/schedule" style="margin-left:12px">Schedule a clip</a>`}</div>
<h2>Posted</h2><div class="card">${posted.length ? rows(posted) : `<span class="lbl">No posts yet.</span>`}</div>
${failed.length ? `<h2>Failed</h2><div class="card">${rows(failed)}</div>` : ""}<p><a href="/posts">All posts</a> · <a href="/logout">Sign out</a></p>`;
  return P("Dashboard", "/", body, msg);
}

async function accountsPage(env, P, msg) {
  const accts = await C.listAccounts(env);
  const sec = (p) => {
    const ready = C.hasSecrets(env, p);
    const list = accts.filter((a) => a.platform === p);
    const rows = list.map((a) => `<div class="row"><span class="grow"><b>@${esc(a.handle)}</b> ${a.last_error ? `<div class="lbl">${esc(a.last_error)}</div>` : ""}</span>${badge(a.status)}
<a class="btn sec" href="/connect/${p}">Reconnect</a>
<form method="post" action="/accounts/${a.id}/${a.status === "disabled" ? "enable" : "disable"}"><button class="btn ghost">${a.status === "disabled" ? "Turn on" : "Turn off"}</button></form>
<form method="post" action="/accounts/${a.id}/delete" onsubmit="return confirm('Remove @${esc(a.handle)}?')"><button class="btn ghost">Remove</button></form></div>`).join("");
    const tiktokLine = p === "tiktok" ? `<p class="lbl">Posts go out as soon as the account is connected. Earnings start at the follower count the campaign asks for. Until TikTok approves the app, posts go out as private (only you see them).</p>` : "";
    return `<div class="card ${ready ? "" : "grey"}"><div class="row"><span class="grow">${chip(p)}</span>${ready ? `<a class="btn" href="/connect/${p}">Connect</a>` : ""}</div>
${ready ? "" : `<p>Add the ${C.PLATFORM_NAMES[p]} keys in Settings first. <a href="/settings">Open Settings</a></p>`}${tiktokLine}${rows}</div>`;
  };
  const body = (accts.length ? "" : `<p class="lbl">No accounts yet. Connect one to start posting.</p>`) + ["youtube", "instagram", "tiktok"].map(sec).join("");
  return P("Accounts", "/accounts", body, msg);
}

async function clipsPage(env, P, url) {
  const r = await C.listClips(env, url.searchParams.get("cursor"));
  const used = await db(env).q(`SELECT clip_key, count(DISTINCT account_id)::int n FROM mob_posts WHERE status='posted' GROUP BY clip_key`);
  const n = (k) => used.find((u) => u.clip_key === k)?.n || 0;
  const qs = (url.searchParams.get("q") || "").toLowerCase(), filt = url.searchParams.get("f") || "all";
  const clips = r.clips.filter((c) => (!qs || c.key.toLowerCase().includes(qs)) && (filt === "all" || (filt === "unused" ? n(c.key) === 0 : n(c.key) > 0)));
  const cards = clips.map((c) => `<div class="clip"><video src="${esc(c.url)}#t=0.5" preload="metadata"></video>
<div class="mono one" title="${esc(c.key)}">${esc(c.key)}</div><div class="lbl"><span class="mono">${mb(c.size)}</span> · used on <span class="mono">${n(c.key)}</span> accounts</div>
<a href="/schedule?clip=${encodeURIComponent(c.key)}">Schedule this</a></div>`).join("");
  const pill = (f, t) => `<a class="badge ${filt === f ? "b-info" : "b-neutral"}" href="/clips?f=${f}">${t}</a>`;
  const body = `<form class="inline" method="get" action="/clips">${pill("all", "All")} ${pill("unused", "Unused")} ${pill("posted", "Posted")}<input name="q" placeholder="Search by name" value="${esc(qs)}" style="max-width:260px"></form>
<form class="card inline" method="post" action="/clips/upload" enctype="multipart/form-data" style="margin-top:12px"><input type="file" name="file" accept="video/mp4" required><button class="btn sec">Upload</button><span class="lbl">MP4, up to 100 MB</span></form>
${clips.length ? `<div class="grid">${cards}</div>` : `<p class="lbl">No clips yet. New clips land here on their own.</p>`}
${r.cursor ? `<p><a href="/clips?cursor=${encodeURIComponent(r.cursor)}">More clips</a></p>` : ""}`;
  return P("Library", "/clips", body, url.searchParams.get("msg"));
}

async function schedulePage(env, P, url) {
  const [{ clips }, accts, camps] = [await C.listClips(env), await C.listAccounts(env), await db(env).q(`SELECT id, name FROM mob_campaigns WHERE status='active' ORDER BY id DESC`)];
  const pick = url.searchParams.get("clip");
  const clipOpts = clips.map((c) => `<label class="clip"><input class="pick" type="radio" name="clip_key" value="${esc(c.key)}" ${c.key === pick ? "checked" : ""} required><video src="${esc(c.url)}#t=0.5" preload="metadata"></video><div class="mono one">${esc(c.key)}</div></label>`).join("");
  const group = (p) => {
    const live = accts.filter((a) => a.platform === p && a.status === "connected");
    return `<div class="row">${chip(p)}${live.length ? live.map((a) => `<label class="inline"><input type="checkbox" name="account_ids" value="${a.id}"> @${esc(a.handle)}</label>`).join("") : `<span class="lbl">Not connected, skipped</span>`}</div>`;
  };
  const body = `<div class="steps"><span class="cur">1 Clip</span><span>2 Accounts</span><span>3 Time</span><span>4 Caption</span></div>
<form method="post" action="/schedule"><div class="card"><h2 style="margin-top:0">1 · Clip</h2>${clips.length ? `<div class="grid">${clipOpts}</div>` : `<p class="lbl">No clips yet.</p>`}</div>
<div class="card"><h2 style="margin-top:0">2 · Accounts</h2>${["youtube", "instagram", "tiktok"].map(group).join("")}</div>
<div class="card"><h2 style="margin-top:0">3 · Time</h2><label class="inline"><input type="radio" name="when" value="now" checked> Now</label>
<label class="inline"><input type="radio" name="when" value="at" id="when-at"> At <input type="datetime-local" name="at" style="max-width:240px" oninput="document.getElementById('when-at').checked=!!this.value"> <span class="lbl">Athens time</span></label>
<label class="inline"><input type="checkbox" name="spread" value="1"> Space posts 10 min apart</label></div>
<div class="card"><h2 style="margin-top:0">4 · Caption</h2><label>YouTube title <span class="lbl mono">max ${TITLE_MAX}</span></label><input name="title" maxlength="${TITLE_MAX}">
<label>Caption and hashtags</label><textarea id="caption" name="caption" rows="4"></textarea>
<div class="lbl">${chip("instagram")}<span class="mono" data-limit="${IG_MAX}"></span> ${chip("tiktok")}<span class="mono" data-limit="${TT_MAX}"></span> ${chip("youtube")}<span class="mono" data-limit="5000"></span></div>
<label>Campaign</label><select name="campaign_id"><option value="">None</option>${camps.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>
<div class="sticky"><button class="btn">Queue posts</button></div></form>`;
  return P("Schedule", "/schedule", body, url.searchParams.get("msg"));
}

async function postsPage(env, P, url) {
  const st = url.searchParams.get("status") || null, pl = url.searchParams.get("platform") || null;
  const rows = await db(env).q(`${POST_SELECT} WHERE ($1::text IS NULL OR p.status=$1) AND ($2::text IS NULL OR a.platform=$2) ORDER BY p.scheduled_at DESC LIMIT 200`, [st, pl]);
  return P("Posts", "/", `<div class="card">${rows.length ? rows.map((p) => postRow(p, C.clipUrl(env, p.clip_key))).join("") : `<span class="lbl">No posts.</span>`}</div>`, url.searchParams.get("msg"));
}

async function campaignsPage(env, P, msg) {
  const rows = await db(env).q(`SELECT c.*, (SELECT count(*)::int FROM mob_submissions s WHERE s.campaign_id=c.id) subs FROM mob_campaigns c ORDER BY id DESC`);
  const body = `${rows.length ? `<div class="card"><table><thead><tr><th>Name</th><th>Per 1K views</th><th>Platforms</th><th>Submissions</th><th>Status</th></tr></thead><tbody>
${rows.map((c) => `<tr><td><a href="/campaigns/${c.id}">${esc(c.name)}</a></td><td class="mono">${c.cpm_usd != null ? "$" + esc(c.cpm_usd) : "—"}</td><td>${(c.platforms || []).map(chip).join("")}</td><td class="mono">${c.subs}</td><td>${badge(c.status)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="lbl">No campaigns yet. Add one from Content Rewards.</p>`}
<form class="card" method="post" action="/campaigns"><h2 style="margin-top:0">Add campaign</h2><label>Name</label><input name="name" required><label>Link (Content Rewards / Whop)</label><input name="url" type="url">
<label>Rules (required tags, minimum length, follower minimum)</label><textarea name="rules" rows="3"></textarea>
<label>Platforms</label><div class="inline">${["youtube", "instagram", "tiktok"].map((p) => `<label class="inline"><input type="checkbox" name="platforms" value="${p}" checked>${chip(p)}</label>`).join("")}</div>
<label>Rate per 1K views (USD)</label><input name="cpm_usd" inputmode="decimal" class="mono" style="max-width:160px"><div style="margin-top:12px"><button class="btn">Add campaign</button></div></form>`;
  return P("Campaigns", "/campaigns", body, msg);
}

async function campaignPage(env, P, id, msg) {
  const c = await db(env).one(`SELECT * FROM mob_campaigns WHERE id=$1`, [id]);
  if (!c) return P("Campaign", "/campaigns", `<div class="bad">No such campaign.</div>`);
  const subs = await db(env).q(`SELECT s.*, a.handle FROM mob_submissions s LEFT JOIN mob_posts p ON p.id=s.post_id LEFT JOIN mob_accounts a ON a.id=p.account_id WHERE s.campaign_id=$1 ORDER BY s.submitted_at DESC`, [id]);
  const todo = await db(env).q(`SELECT p.id, p.remote_url, a.platform, a.handle FROM mob_posts p JOIN mob_accounts a ON a.id=p.account_id
    WHERE p.campaign_id=$1 AND p.status='posted' AND p.remote_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mob_submissions s WHERE s.campaign_id=$1 AND s.posted_url=p.remote_url)`, [id]);
  const body = `<div class="card"><div class="lbl">Link</div>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a>` : "—"}
<div class="lbl" style="margin-top:8px">Rules</div><div style="white-space:pre-wrap">${esc(c.rules || "—")}</div><div style="margin-top:8px">${(c.platforms || []).map(chip).join("")} <span class="mono">${c.cpm_usd != null ? "$" + esc(c.cpm_usd) + " / 1K" : ""}</span></div></div>
<h2>To submit</h2><div class="card">${todo.length ? todo.map((t) => `<div class="row">${chip(t.platform)}<span class="mono">@${esc(t.handle)}</span><a class="grow one" href="${esc(t.remote_url)}" target="_blank" rel="noopener">${esc(t.remote_url)}</a>
<form method="post" action="/campaigns/${id}/submissions"><input type="hidden" name="post_id" value="${t.id}"><button class="btn sec">Mark submitted</button></form></div>`).join("") : `<span class="lbl">Nothing waiting.</span>`}</div>
<h2>Submissions</h2><div class="card"><table><thead><tr><th>Post</th><th>Account</th><th>Views</th><th>Status</th><th>Submitted</th></tr></thead><tbody>
${subs.map((s) => `<tr><td><a href="${esc(s.posted_url)}" target="_blank" rel="noopener">Open</a></td><td class="mono">${s.handle ? "@" + esc(s.handle) : "—"}</td><td class="mono">${s.views ?? "—"}</td><td>${badge(s.status)}</td><td class="mono">${athens(s.submitted_at)}</td></tr>`).join("")}</tbody></table>
<form method="post" action="/campaigns/${id}/submissions" class="inline" style="margin-top:12px"><input name="posted_url" placeholder="Posted link" required><select name="status" style="max-width:140px"><option value="submitted">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="paid">Paid</option></select><input name="views" placeholder="Views" class="mono" style="max-width:110px"><button class="btn sec">Save</button></form></div>`;
  return P(c.name, "/campaigns", body, msg);
}

function settingsPage(env, P, msg) {
  const copy = (v) => `<div class="copy"><input readonly value="${esc(v)}"><button type="button" class="btn sec" data-copy="${esc(v)}">Copy</button></div>`;
  const card = (p, title, steps, fields) => {
    const set = fields.every(([n]) => !!env[n]);
    return `<form class="card" method="post" action="/settings/secret"><div class="row"><b class="grow">${title}</b>${badge(set ? "set" : "unset")}</div><ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
${fields.map(([n, label]) => `<label>${label} ${copy(n)}</label><input name="${n}" type="password" autocomplete="off" placeholder="${env[n] ? "Saved. Paste to replace" : "Paste here"}">`).join("")}
<div style="margin-top:12px"><button class="btn">Save</button></div></form>`;
  };
  const yt = card("youtube", "YouTube", [
    `Open <a href="https://console.cloud.google.com" target="_blank" rel="noopener">console.cloud.google.com</a> and sign in.`, `Create a project called "mob".`,
    `APIs &amp; Services → Library → turn on "YouTube Data API v3".`, `OAuth consent screen → External → add your Google email as a test user, then press "Publish app" so the sign-in does not lapse.`,
    `Credentials → Create credentials → OAuth client ID → Web application.`, `Under Authorized redirect URIs paste this address: ${copy(redirectUri(env, "youtube"))}`,
    `Copy the Client ID and Client secret into the two boxes below and press Save.`,
  ], [["GOOGLE_CLIENT_ID", "Client ID"], ["GOOGLE_CLIENT_SECRET", "Client secret"]]);
  const ig = card("instagram", "Instagram", [
    `In the Instagram app switch each account to Professional (Creator or Business).`, `Open <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> → Create app → Business.`,
    `Add the product "Instagram" → "API setup with Instagram login".`, `Under Business login settings paste this redirect address: ${copy(redirectUri(env, "instagram"))}`,
    `App roles → Roles → add each Instagram account as Instagram Tester, then accept the invite in Instagram (Settings → Website permissions → Apps and websites).`,
    `Copy the Instagram app ID and Instagram app secret into the boxes below and press Save.`,
  ], [["IG_APP_ID", "Instagram app ID"], ["IG_APP_SECRET", "Instagram app secret"]]);
  const tt = card("tiktok", "TikTok", [
    `Open <a href="https://developers.tiktok.com/apps" target="_blank" rel="noopener">developers.tiktok.com</a> → Manage apps → Connect an app.`, `Add products Login Kit and Content Posting API, and turn on Direct Post.`,
    `Scopes: user.info.basic and video.publish.`, `Login Kit → Redirect URI → paste this address: ${copy(redirectUri(env, "tiktok"))}`,
    `URL properties → verify the domain blackreaper.us (Claude adds the DNS record for you).`, `Copy the Client key and Client secret into the boxes below and press Save.`,
    `When it works, press Submit for review. Until TikTok approves it, posts go out as private.`,
  ], [["TIKTOK_CLIENT_KEY", "Client key"], ["TIKTOK_CLIENT_SECRET", "Client secret"]]);
  return P("Settings", "/settings", yt + ig + tt + `<p class="lbl">Saved keys go live on the server within a minute. Base address: <span class="mono">${esc(base(env))}</span></p>`, msg);
}
