// JSON endpoints for the admin app (cookie session; checked in worker.route before we get here).
// GET /ui/data/* reads, POST /ui/act/* writes. Words shown to Alex never mention keys, scopes or APIs.
import { db } from "./db.mjs";
import * as C from "./core.mjs";
import * as S from "./stats.mjs";
import { estPayout } from "./money.mjs";
import { BUILD, athensToUtc, createCampaign, updateCampaign, setPlatformKeys } from "./worker.mjs";

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const bad = (message, status = 400) => json({ error: { message } }, status);
const POSTS = `SELECT p.*, a.platform, a.handle,
  (SELECT ps.views FROM mob_post_stats ps WHERE ps.post_id=p.id ORDER BY ps.day DESC LIMIT 1) views,
  c.name campaign_name, c.cpm_usd, c.min_payout_usd, c.max_payout_usd
  FROM mob_posts p LEFT JOIN mob_accounts a ON a.id=p.account_id LEFT JOIN mob_campaigns c ON c.id=p.campaign_id`;
const shapePost = (env, p) => ({
  id: p.id, account_id: p.account_id, platform: p.platform, handle: p.handle, clip_key: p.clip_key, clip_url: C.clipUrl(env, p.clip_key),
  title: p.title, caption: p.caption, status: p.status, scheduled_at: p.scheduled_at, updated_at: p.updated_at, created_at: p.created_at,
  upload_started_at: p.upload_started_at, remote_url: p.remote_url, error: p.error, campaign_id: p.campaign_id, campaign_name: p.campaign_name,
  may_be_live: C.mayBeLive(p), views: p.views == null ? null : Number(p.views), est_usd: p.campaign_id ? estPayout(p.views, p) : 0, privacy: p.privacy,
});

export async function uiData(req, env, url, path) {
  const d = db(env);
  const q = (k) => url.searchParams.get(k);
  let m;
  if (path === "/ui/data/boot") {
    const setup = await C.setupState(env);
    const accts = await C.listAccounts(env);
    const views = await d.q(`SELECT DISTINCT ON (account_id) account_id, views_total FROM mob_account_stats ORDER BY account_id, day DESC`);
    const counts = await d.one(`SELECT count(*) FILTER (WHERE status='failed')::int failed, count(*) FILTER (WHERE status='scheduled')::int queued FROM mob_posts`);
    return json({
      build: BUILD, setup, counts,
      accounts: accts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, status: a.status, avatar: a.meta?.avatar || null, stats_status: a.meta?.stats_status || null, views: Number(views.find((v) => v.account_id === a.id)?.views_total ?? 0) })),
      paused: !!(await C.getSetting(env, "paused", false)), spread: Number(await C.getSetting(env, "spread", 0)) || 0,
      claude_seen: await C.getSetting(env, "claude_seen", null), welcomed: !!(await C.getSetting(env, "welcomed", false)), asked: await C.getSetting(env, "asked", {}),
    });
  }
  if (path === "/ui/data/setup") return json(await C.setupState(env));
  if (path === "/ui/data/overview") return json(await S.overview(env, S.RANGES[q("range")] ? q("range") : "30d"));
  if (path === "/ui/data/clips") {
    const r = await C.listClips(env, q("cursor"));
    const used = await d.q(`SELECT p.clip_key, array_agg(DISTINCT a.platform) plats, max(p.campaign_id) campaign_id FROM mob_posts p JOIN mob_accounts a ON a.id=p.account_id WHERE p.status IN ('posted','processing','scheduled','publishing') GROUP BY p.clip_key`);
    const titles = await d.q(`SELECT key, title FROM mob_clips`);
    return json({ cursor: r.cursor, clips: r.clips.map((c) => {
      const u = used.find((x) => x.clip_key === c.key);
      return { ...c, title: titles.find((t) => t.key === c.key)?.title || c.key.replace(/^(oraktys-|mob-upload-\d+-)/, "").replace(/\.mp4$/i, "").replace(/[-_]+/g, " "), platforms: u?.plats || [], campaign_id: u?.campaign_id || null };
    }) });
  }
  if (path === "/ui/data/posts") {
    const st = q("status");
    const map = { live: ["posted"], queued: ["scheduled"], posting: ["publishing", "processing"], failed: ["failed", "skipped"] };
    const rows = await d.q(`${POSTS} WHERE ($1::text[] IS NULL OR p.status = ANY($1)) ORDER BY p.scheduled_at DESC LIMIT 300`, [map[st] || null]);
    const counts = await d.one(`SELECT count(*)::int "all", count(*) FILTER (WHERE status='posted')::int live, count(*) FILTER (WHERE status='scheduled')::int queued,
      count(*) FILTER (WHERE status IN ('publishing','processing'))::int posting, count(*) FILTER (WHERE status IN ('failed','skipped'))::int failed FROM mob_posts`);
    return json({ posts: rows.map((p) => shapePost(env, p)), counts });
  }
  if ((m = path.match(/^\/ui\/data\/posts\/(\d+)$/))) {
    const p = await d.one(`${POSTS} WHERE p.id=$1`, [m[1]]);
    if (!p) return bad("No such post.", 404);
    const ev = [["Created", p.created_at], ["Scheduled for", p.scheduled_at], p.upload_started_at && ["Upload started", p.upload_started_at],
      p.status === "posted" && ["Live", p.updated_at], p.status === "failed" && ["Failed", p.updated_at], p.status === "canceled" && ["Cancelled", p.updated_at]].filter(Boolean);
    return json({ ...shapePost(env, p), events: ev.map(([label, at]) => ({ label, at })) });
  }
  if (path === "/ui/data/calendar") {
    const from = q("from"), to = q("to");
    if (isNaN(new Date(from)) || isNaN(new Date(to))) return bad("from and to must be dates.");
    const rows = await d.q(`${POSTS} WHERE p.scheduled_at >= $1 AND p.scheduled_at < $2 AND p.status <> 'canceled' ORDER BY p.scheduled_at LIMIT 500`, [from, to]);
    return json({ posts: rows.map((p) => shapePost(env, p)) });
  }
  if (path === "/ui/data/campaigns" || path === "/ui/data/earnings") return json(await S.earnings(env, { days: Number(q("days")) || 30 }));
  if ((m = path.match(/^\/ui\/data\/campaigns\/(\d+)$/))) {
    const e = await S.earnings(env, { campaignId: Number(m[1]) });
    if (!e.campaigns.length) return bad("No such campaign.", 404);
    const rows = await d.q(`${POSTS} WHERE p.campaign_id=$1 AND p.status IN ('posted','processing') ORDER BY p.scheduled_at DESC`, [m[1]]);
    const subs = await d.q(`SELECT post_id, posted_url, status, payout_usd FROM mob_submissions WHERE campaign_id=$1`, [m[1]]);
    const c = await d.one(`SELECT rules FROM mob_campaigns WHERE id=$1`, [m[1]]);
    return json({ ...e, campaign: { ...e.campaigns[0], rules: c.rules }, clips: rows.map((p) => {
      const s = subs.find((x) => x.post_id === p.id || (p.remote_url && x.posted_url === p.remote_url));
      return { ...shapePost(env, p), submitted: s?.status || null, paid_usd: s?.payout_usd == null ? null : Number(s.payout_usd) };
    }) });
  }
  if ((m = path.match(/^\/ui\/data\/channels\/(\d+)$/))) {
    const o = await S.overview(env, "30d");
    const a = o.accounts.find((x) => String(x.id) === m[1]);
    if (!a) return bad("No such channel.", 404);
    const posts = await d.q(`${POSTS} WHERE p.account_id=$1 ORDER BY p.scheduled_at DESC LIMIT 100`, [m[1]]);
    const vids = await d.q(`SELECT DISTINCT ON (remote_id) remote_id, title, url, views, likes, comments, shares FROM mob_post_stats WHERE account_id=$1 ORDER BY remote_id, day DESC`, [m[1]]);
    return json({ account: a, days: o.days, posts: posts.map((p) => shapePost(env, p)), videos: vids.map((v) => ({ ...v, views: v.views == null ? null : Number(v.views) })).sort((x, y) => (y.views || 0) - (x.views || 0)).slice(0, 50) });
  }
  return bad("Not found.", 404);
}

async function readJson(req) { try { return (await req.json()) || {}; } catch { return {}; } }

export async function uiAct(req, env, url, path) {
  const b = await readJson(req);
  const d = db(env);
  let m;
  if (path === "/ui/act/schedule") {
    let when = null;
    if (b.at) { when = athensToUtc(b.at); if (!when) return bad("Pick a valid time."); if (new Date(when).getTime() < Date.now() - 60000) return bad("That time has passed. Pick a later one."); }
    const r = await C.createPosts(env, { clip_key: b.clip_key, account_ids: (b.account_ids || []).map(Number), title: b.title, caption: b.caption, scheduled_at: when, campaign_id: b.campaign_id || null, spread_minutes: Number(b.spread_minutes) || 0, created_by: "admin" });
    if (r.errors) return bad(r.errors.join(". "));
    return json(r);
  }
  if ((m = path.match(/^\/ui\/act\/posts\/(\d+)\/(cancel|retry|move)$/))) {
    const id = Number(m[1]);
    if (m[2] === "cancel") { const p = await C.cancelPost(env, id); return p ? json(p) : bad("This post can't be cancelled now.", 409); }
    if (m[2] === "retry") {
      const r = await C.retryPost(env, id, { confirm: b.confirm === true });
      if (!r) return bad("This post can't be retried now.", 409);
      if (r.needs_confirm) return json({ needs_confirm: true, handle: r.post.handle }, 409);
      return json(r);
    }
    const when = athensToUtc(b.at || "");
    if (!when) return bad("Pick a valid time.");
    const p = await d.one(`UPDATE mob_posts SET scheduled_at=$2, updated_at=now() WHERE id=$1 AND status='scheduled' RETURNING id, scheduled_at`, [id, when]);
    return p ? json(p) : bad("Only queued posts can be moved.", 409);
  }
  if ((m = path.match(/^\/ui\/act\/accounts\/(\d+)\/(enable|disable|delete)$/))) {
    if (m[2] === "delete") await d.q(`DELETE FROM mob_accounts WHERE id=$1`, [m[1]]);
    else await d.q(`UPDATE mob_accounts SET status=$2 WHERE id=$1`, [m[1], m[2] === "disable" ? "disabled" : "connected"]);
    return json({ ok: true });
  }
  if (path === "/ui/act/campaigns") { const r = await createCampaign(env, b); return r.error ? bad(r.error) : json(r, 201); }
  if ((m = path.match(/^\/ui\/act\/campaigns\/(\d+)$/))) { const r = await updateCampaign(env, Number(m[1]), b); return r.error ? bad(r.error) : json(r); }
  if (path === "/ui/act/settings") {
    if ("paused" in b) await C.setSetting(env, "paused", !!b.paused);
    if ("spread" in b) { const s = Number(b.spread); if (![0, 15, 30, 60].includes(s)) return bad("Spread is 0, 15, 30 or 60 minutes."); await C.setSetting(env, "spread", s); }
    if ("welcomed" in b) await C.setSetting(env, "welcomed", !!b.welcomed);
    return json({ ok: true });
  }
  if (path === "/ui/act/keys") { const r = await setPlatformKeys(env, { ...b, by: "alex" }); return r.error ? bad(r.error, r.status) : json(r); }
  if (path === "/ui/act/ask") {
    if (!C.PLATFORMS[b.platform]) return bad("Pick YouTube, Instagram or TikTok.");
    const asked = (await C.getSetting(env, "asked", {})) || {};
    asked[b.platform] = new Date().toISOString();
    await C.setSetting(env, "asked", asked);
    return json({ ok: true, asked_at: asked[b.platform] });
  }
  if (path === "/ui/act/clips/delete") {
    const keys = (b.keys || []).filter((k) => typeof k === "string" && k.startsWith("mob-upload-"));
    for (const k of keys) { await env.MEDIA.delete?.(k); await d.q(`DELETE FROM mob_clips WHERE key=$1`, [k]); }
    return json({ deleted: keys.length, kept: (b.keys || []).length - keys.length });
  }
  if (path === "/ui/act/stats/pull") return json(await S.pullStats(env, C.STATS_DEPS, { accountId: b.account_id ? Number(b.account_id) : null, force: true, limit: b.account_id ? 1 : 10 }));
  return bad("Not found.", 404);
}
