// Analytics: the cron pull (one daily snapshot per account + per video, upserted hourly) and the
// read-side summaries the dashboard and /api/stats use. Platform calls live in src/platforms/*.stats().
import { db } from "./db.mjs";
import { estPayout, payoutInfo, heldNote } from "./money.mjs";
import { PlatformError } from "./platforms/common.mjs";

export const PULL_EVERY_MIN = 60;
export const PULL_PER_TICK = 3;
const DAY = 86400000;
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

// Scopes the platform actually granted (scopes column: Google space-separated, IG/TikTok comma-separated).
export const grantedScopes = (acct) => String(acct.scopes || "").split(/[\s,]+/).filter(Boolean);
export function missingStatsScopes(P, acct) {
  const g = grantedScopes(acct);
  return (P[acct.platform].STATS_SCOPES || []).filter((s) => !g.includes(s));
}

async function setMeta(env, id, patch) {
  await db(env).q(`UPDATE mob_accounts SET meta = meta || $2::jsonb WHERE id=$1`, [id, JSON.stringify(patch)]);
}

// Accounts due a pull: connected, and last snapshot older than PULL_EVERY_MIN (or none).
export async function dueAccounts(env, { accountId = null, limit = PULL_PER_TICK, force = false } = {}) {
  return db(env).q(
    `SELECT a.id FROM mob_accounts a
      LEFT JOIN LATERAL (SELECT max(taken_at) t FROM mob_account_stats s WHERE s.account_id=a.id) s ON true
     WHERE a.status='connected' AND ($1::int IS NULL OR a.id=$1)
       AND ($3::boolean OR s.t IS NULL OR s.t < now() - ($4 * interval '1 minute'))
     ORDER BY s.t NULLS FIRST, a.id LIMIT $2`, [accountId, limit, force, PULL_EVERY_MIN]);
}

// One account: returns "ok" | "reconnect" | "error:<msg>". `withAuth` and `load` come from core (no import cycle).
export async function pullAccount(env, { P, load, withAuth }, id) {
  const acct = await load(env, id);
  if (!acct) return "gone";
  const miss = missingStatsScopes(P, acct);
  if (miss.length) { await setMeta(env, id, { stats_status: "reconnect", stats_missing: miss }); return "reconnect"; }
  let r;
  // Remote ids of posts mob published on this account: YouTube reads their current counts from videos.list.
  const postedIds = (await db(env).q(`SELECT DISTINCT COALESCE(published_id, remote_id) rid FROM mob_posts WHERE account_id=$1 AND status='posted' AND COALESCE(published_id, remote_id) IS NOT NULL ORDER BY 1 LIMIT 50`, [id])).map((x) => x.rid);
  try { r = await withAuth(env, acct, (a) => P[a.platform].stats(env, a, { postedIds })); } catch (e) {
    const msg = String(e.message || e);
    if (e instanceof PlatformError && (e.status === 403 || e.code === "needs_reconnect")) { await setMeta(env, id, { stats_status: "reconnect", stats_error: msg }); return "reconnect"; }
    await setMeta(env, id, { stats_error: msg });
    return `error:${msg}`;
  }
  await saveSnapshot(env, acct, r);
  await setMeta(env, id, { stats_status: "ok", stats_error: null, avatar: r.channel.avatar || null, display: r.channel.title || null });
  await recomputeEstimates(env, id);
  return "ok";
}

export async function saveSnapshot(env, acct, { channel, videos }, when = new Date()) {
  const d = db(env), day = isoDay(when);
  await d.q(`INSERT INTO mob_account_stats (account_id, day, taken_at, views_total, followers, videos, likes_total, raw) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    ON CONFLICT (account_id, day) DO UPDATE SET taken_at=EXCLUDED.taken_at, views_total=EXCLUDED.views_total, followers=EXCLUDED.followers, videos=EXCLUDED.videos, likes_total=EXCLUDED.likes_total, raw=EXCLUDED.raw`,
  [acct.id, day, when.toISOString(), channel.views_total, channel.followers, channel.videos, channel.likes_total, JSON.stringify({ avatar: channel.avatar || null })]);
  for (const v of videos) {
    await d.q(`INSERT INTO mob_post_stats (account_id, post_id, remote_id, day, taken_at, title, url, views, likes, comments, shares, saves)
      VALUES ($1,(SELECT id FROM mob_posts WHERE account_id=$1 AND (remote_id=$2 OR published_id=$2) ORDER BY id DESC LIMIT 1),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (account_id, remote_id, day) DO UPDATE SET post_id=COALESCE(EXCLUDED.post_id, mob_post_stats.post_id), taken_at=EXCLUDED.taken_at, title=COALESCE(EXCLUDED.title, mob_post_stats.title),
        url=COALESCE(EXCLUDED.url, mob_post_stats.url), views=EXCLUDED.views, likes=EXCLUDED.likes, comments=EXCLUDED.comments, shares=EXCLUDED.shares, saves=EXCLUDED.saves`,
    [acct.id, v.remote_id, day, when.toISOString(), v.title, v.url, v.views, v.likes, v.comments, v.shares, v.saves]);
  }
}

// Submissions linked to this account's posts get views + est_payout_usd from the latest snapshot.
export async function recomputeEstimates(env, accountId) {
  const rows = await db(env).q(`SELECT s.id, c.cpm_usd, c.min_payout_usd, c.max_payout_usd,
      (SELECT ps.views FROM mob_post_stats ps WHERE ps.post_id=p.id ORDER BY ps.day DESC LIMIT 1) views
    FROM mob_submissions s JOIN mob_posts p ON p.id=s.post_id JOIN mob_campaigns c ON c.id=s.campaign_id WHERE p.account_id=$1`, [accountId]);
  for (const r of rows) if (r.views != null) await db(env).q(`UPDATE mob_submissions SET views=$2, est_payout_usd=$3, views_at=now() WHERE id=$1`, [r.id, Number(r.views), estPayout(r.views, r)]);
  return rows.length;
}

export async function pullStats(env, deps, opts = {}) {
  const out = { pulled: 0, reconnect: 0, errors: [] };
  for (const { id } of await dueAccounts(env, opts)) {
    const r = await pullAccount(env, deps, id);
    if (r === "ok") out.pulled++; else if (r === "reconnect") out.reconnect++; else if (r.startsWith("error:")) out.errors.push(`account ${id}: ${r.slice(6)}`);
  }
  return out;
}

/* ---------------- read side ---------------- */
export const RANGES = { today: 1, "7d": 7, "30d": 30, all: 365 };
const n = (v) => (v == null ? null : Number(v));

// Daily views per account from consecutive snapshots (views_total deltas; first day counts 0).
function dailyDeltas(snaps) {
  const out = new Map();
  let prev = null;
  for (const s of snaps) {
    if (prev && s.views_total != null && prev.views_total != null) out.set(s.day, Math.max(0, s.views_total - prev.views_total));
    else out.set(s.day, 0);
    prev = s;
  }
  return out;
}

export async function overview(env, range = "30d", now = new Date()) {
  const days = RANGES[range] || 30;
  const d = db(env);
  const accts = await d.q(`SELECT id, platform, handle, status, scopes, meta FROM mob_accounts ORDER BY platform, id`);
  const snapsAll = (await d.q(`SELECT account_id, to_char(day,'YYYY-MM-DD') AS day, views_total, followers, videos, taken_at FROM mob_account_stats ORDER BY day`))
    .map((s) => ({ ...s, views_total: n(s.views_total), followers: n(s.followers) }));
  const camps = await d.q(`SELECT * FROM mob_campaigns ORDER BY id DESC`);
  const postViews = await d.q(`SELECT DISTINCT ON (ps.account_id, ps.remote_id) ps.account_id, ps.remote_id, ps.post_id, ps.views, ps.title, ps.url, p.campaign_id, p.clip_key
      FROM mob_post_stats ps LEFT JOIN mob_posts p ON p.id=ps.post_id ORDER BY ps.account_id, ps.remote_id, ps.day DESC`);
  const campById = new Map(camps.map((c) => [c.id, c]));
  const estOf = (pv) => (pv.campaign_id && campById.get(pv.campaign_id) ? estPayout(pv.views, campById.get(pv.campaign_id)) : 0);

  const dayList = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(isoDay(now.getTime() - i * DAY));
  const prevList = dayList.map((x) => isoDay(new Date(x).getTime() - days * DAY));
  const today = isoDay(now);

  const series = { all: dayList.map(() => 0), youtube: dayList.map(() => 0), instagram: dayList.map(() => 0), tiktok: dayList.map(() => 0) };
  const prevAll = prevList.map(() => 0);
  const accounts = accts.map((a) => {
    const snaps = snapsAll.filter((s) => s.account_id === a.id);
    const delta = dailyDeltas(snaps);
    const last = snaps[snaps.length - 1] || null;
    dayList.forEach((x, i) => { const v = delta.get(x) || 0; series.all[i] += v; series[a.platform][i] += v; });
    prevList.forEach((x, i) => { prevAll[i] += delta.get(x) || 0; });
    const spark = dayList.slice(-28).map((x) => delta.get(x) || 0);
    const est = postViews.filter((p) => p.account_id === a.id).reduce((s, p) => s + estOf(p), 0);
    const meta = a.meta || {};
    return {
      id: a.id, platform: a.platform, handle: a.handle, status: a.status, avatar: meta.avatar || null,
      stats_status: meta.stats_status || (last ? "ok" : "waiting"),
      followers: last?.followers ?? null, views: last?.views_total ?? null, views_today: delta.get(today) || 0,
      views28d: spark.reduce((s, v) => s + v, 0), posts: last?.videos ?? null, est_usd: round2(est), spark, updated_at: last?.taken_at || null,
    };
  });
  const counts = await d.one(`SELECT count(*) FILTER (WHERE status='posted')::int live, count(*) FILTER (WHERE status='scheduled')::int queued,
      count(*) FILTER (WHERE status IN ('publishing','processing'))::int posting, count(*) FILTER (WHERE status='failed')::int failed FROM mob_posts`);
  const top = postViews.filter((p) => p.views != null).sort((a, b) => Number(b.views) - Number(a.views)).slice(0, 5)
    .map((p) => ({ remote_id: p.remote_id, title: p.title, url: p.url, views: Number(p.views), clip_key: p.clip_key, platform: accts.find((a) => a.id === p.account_id)?.platform, est_usd: estOf(p),
      note: p.campaign_id && campById.get(p.campaign_id) ? heldNote(payoutInfo(p.views, campById.get(p.campaign_id))) : null }));
  const sum = (arr) => arr.reduce((s, v) => s + v, 0);
  const totalViews = accounts.reduce((s, a) => s + (a.views || 0), 0);
  const est = round2(accounts.reduce((s, a) => s + a.est_usd, 0));
  const lastTaken = snapsAll.reduce((m, s) => (!m || s.taken_at > m ? s.taken_at : m), null);
  return {
    range, days: dayList,
    kpis: { views_total: totalViews, views_range: sum(series.all), views_prev: sum(prevAll), views_today: accounts.reduce((s, a) => s + a.views_today, 0), est_usd: est, posts: counts },
    series: { ...series, prev: prevAll }, accounts, top, updated_at: lastTaken,
    earnings: await earnings(env, { now, days }),
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

// Estimated earnings per campaign / per day. Daily est = est(views at end of day) - est(previous day) per post.
export async function earnings(env, { campaignId = null, now = new Date(), days = 30 } = {}) {
  const d = db(env);
  const camps = await d.q(`SELECT c.*, (SELECT count(*)::int FROM mob_posts p WHERE p.campaign_id=c.id AND p.status='posted') clips,
      (SELECT count(*)::int FROM mob_submissions s WHERE s.campaign_id=c.id) submitted,
      (SELECT COALESCE(sum(payout_usd),0) FROM mob_submissions s WHERE s.campaign_id=c.id AND s.status='paid') paid
    FROM mob_campaigns c WHERE ($1::int IS NULL OR c.id=$1) ORDER BY c.id DESC`, [campaignId]);
  const rows = await d.q(`SELECT ps.post_id, to_char(ps.day,'YYYY-MM-DD') AS day, ps.views, p.campaign_id FROM mob_post_stats ps JOIN mob_posts p ON p.id=ps.post_id
    WHERE p.campaign_id IS NOT NULL AND ($1::int IS NULL OR p.campaign_id=$1) ORDER BY ps.post_id, ps.day`, [campaignId]);
  const byCamp = new Map(camps.map((c) => [c.id, { ...c, views: 0, est: 0, held: 0 }]));
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(isoDay(now.getTime() - i * DAY));
  const daily = new Map(dayList.map((x) => [x, { est: 0, views: 0 }]));
  let cur = null, prevEst = 0, prevViews = 0, lastViews = 0;
  const flush = () => { if (cur == null) return; const c = byCamp.get(cur.campaign_id); if (c) { c.views += lastViews; c.est += prevEst; if (payoutInfo(lastViews, c).held) c.held++; } };
  for (const r of rows) {
    if (!cur || cur.post_id !== r.post_id) { flush(); cur = r; prevEst = 0; prevViews = 0; }
    const c = byCamp.get(r.campaign_id);
    const v = Number(r.views || 0), e = c ? estPayout(v, c) : 0;
    const slot = daily.get(r.day);
    if (slot) { slot.est += e - prevEst; slot.views += Math.max(0, v - prevViews); }
    prevEst = e; prevViews = v; lastViews = v;
  }
  flush();
  const campaigns = [...byCamp.values()].map((c) => ({
    id: c.id, name: c.name, url: c.url, status: c.status, platforms: c.platforms, cpm_usd: n(c.cpm_usd), min_payout_usd: n(c.min_payout_usd), max_payout_usd: n(c.max_payout_usd),
    budget_usd: n(c.budget_usd), paid_out_usd: n(c.paid_out_usd), clips: c.clips, submitted: c.submitted, waiting: Math.max(0, c.clips - c.submitted),
    views: c.views, est_usd: round2(c.est), held: c.held, held_note: c.held ? `${c.held} clip${c.held > 1 ? "s" : ""} below $${n(c.min_payout_usd)} minimum` : null, paid_usd: round2(Number(c.paid)), pending_usd: round2(Math.max(0, c.est - Number(c.paid))),
  }));
  const month = isoDay(now).slice(0, 7);
  const totals = {
    est_all: round2(campaigns.reduce((s, c) => s + c.est_usd, 0)), paid: round2(campaigns.reduce((s, c) => s + c.paid_usd, 0)),
    est_month: round2(dayList.filter((x) => x.startsWith(month)).reduce((s, x) => s + daily.get(x).est, 0)),
  };
  totals.pending = round2(Math.max(0, totals.est_all - totals.paid));
  return { campaigns, totals, days: dayList, daily: dayList.map((x) => ({ day: x, est: round2(daily.get(x).est), views: daily.get(x).views })) };
}
