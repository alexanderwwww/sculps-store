// Data operations and the cron loop. Everything here is shared by the admin pages and the JSON API.
import { db, migrate } from "./db.mjs";
import { seal, unseal } from "./auth.mjs";
import { PlatformError } from "./platforms/common.mjs";
import * as youtube from "./platforms/youtube.mjs";
import * as instagram from "./platforms/instagram.mjs";
import * as tiktok from "./platforms/tiktok.mjs";

export const PLATFORMS = { youtube, instagram, tiktok };
export const PLATFORM_NAMES = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
export const MAX_ATTEMPTS = 3;
export const CLAIM_BATCH = 5;
export const mediaBase = (env) => (env.PUBLIC_MEDIA_BASE || "https://blackreaper.us/media").replace(/\/$/, "");
export const clipUrl = (env, key) => `${mediaBase(env)}/${key.split("/").map(encodeURIComponent).join("/")}`;
export const hasSecrets = (env, p) => PLATFORMS[p].secrets.every((n) => !!env[n]);

/* ---------- accounts ---------- */
export async function upsertAccount(env, platform, a) {
  return db(env).one(
    `INSERT INTO mob_accounts (platform, external_id, handle, access_token, refresh_token, token_expires_at, refresh_expires_at, scopes, meta, status, last_error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'connected',NULL)
     ON CONFLICT (platform, external_id) DO UPDATE SET handle=EXCLUDED.handle, access_token=EXCLUDED.access_token,
       refresh_token=COALESCE(EXCLUDED.refresh_token, mob_accounts.refresh_token), token_expires_at=EXCLUDED.token_expires_at,
       refresh_expires_at=EXCLUDED.refresh_expires_at, scopes=EXCLUDED.scopes, meta=mob_accounts.meta || EXCLUDED.meta,
       status='connected', last_error=NULL
     RETURNING id, platform, handle, status`,
    [platform, a.external_id, a.handle, await seal(env, a.access_token), await seal(env, a.refresh_token), a.token_expires_at, a.refresh_expires_at, a.scopes, JSON.stringify(a.meta || {})],
  );
}

export async function loadAccount(env, id) {
  const a = await db(env).one(`SELECT * FROM mob_accounts WHERE id=$1`, [id]);
  if (!a) return null;
  a.access_token = await unseal(env, a.access_token);
  a.refresh_token = await unseal(env, a.refresh_token);
  return a;
}

export async function listAccounts(env) {
  return db(env).q(`SELECT id, platform, external_id, handle, status, last_error, token_expires_at, meta, created_at FROM mob_accounts ORDER BY platform, id`);
}

export async function saveTokens(env, acct, t) {
  // TikTok rotates refresh tokens: the new one is written in this same statement or the account dies.
  await db(env).q(
    `UPDATE mob_accounts SET access_token=$2, refresh_token=COALESCE($3, refresh_token), token_expires_at=COALESCE($4, token_expires_at),
       refresh_expires_at=COALESCE($5, refresh_expires_at), meta=meta || $6::jsonb, status='connected', last_error=NULL WHERE id=$1`,
    [acct.id, await seal(env, t.access_token), t.refresh_token ? await seal(env, t.refresh_token) : null, t.token_expires_at || null, t.refresh_expires_at || null, JSON.stringify(t.meta || {})],
  );
  Object.assign(acct, { access_token: t.access_token, refresh_token: t.refresh_token || acct.refresh_token, meta: { ...(acct.meta || {}), ...(t.meta || {}) } });
}

async function markReconnect(env, acct, err) {
  await db(env).q(`UPDATE mob_accounts SET status='needs_reconnect', last_error=$2 WHERE id=$1`, [acct.id, String(err.message || err)]);
}

// A refresh failure only signs the account out when the token endpoint really refused the grant
// (invalid_grant / 400 / 401, not retryable). A 5xx, a 429 or a network failure is a blip: the account
// stays connected and the next tick tries again.
export function isAuthRefusal(e) {
  return e instanceof PlatformError && !e.retryable && (e.status === 400 || e.status === 401 || e.code === "invalid_grant");
}

// Returns "ok" | "signed_out" | "blip"
export async function refreshAccount(env, acct) {
  try {
    await saveTokens(env, acct, await PLATFORMS[acct.platform].refresh(env, acct));
    return "ok";
  } catch (e) {
    if (isAuthRefusal(e)) { await markReconnect(env, acct, e); return "signed_out"; }
    acct._refreshError = e;
    return "blip";
  }
}

// Run fn(acct); on an auth error refresh once and retry once.
async function withAuth(env, acct, fn) {
  try { return await fn(acct); } catch (e) {
    if (!(e instanceof PlatformError) || !e.auth) throw e;
    const r = await refreshAccount(env, acct);
    if (r === "blip") throw new PlatformError(acct._refreshError?.status || 503, "refresh_retry", `${PLATFORM_NAMES[acct.platform]} token refresh did not answer, trying again next tick. (${acct._refreshError?.message || acct._refreshError})`, { retryable: true, auth: false });
    if (r !== "ok") throw new PlatformError(e.status, "needs_reconnect", `${PLATFORM_NAMES[acct.platform]} sign-in expired. Reconnect the account. (${e.message})`, { retryable: false, auth: false });
    return fn(acct);
  }
}

/* ---------- clips ---------- */
export async function clipInfo(env, key) {
  const head = await env.MEDIA.head(key);
  if (!head) return null;
  return {
    key, size: head.size, url: clipUrl(env, key),
    stream: async (range) => {
      const o = await env.MEDIA.get(key, range ? { range } : undefined);
      if (!o) throw new PlatformError(404, "clip_missing", `Clip ${key} is gone from storage`, { retryable: false });
      return o.body;
    },
  };
}

export async function listClips(env, cursor) {
  const r = await env.MEDIA.list({ prefix: "oraktys-", cursor: cursor || undefined, limit: 100 });
  const clips = r.objects.filter((o) => /\.mp4$/i.test(o.key)).map((o) => ({ key: o.key, url: clipUrl(env, o.key), size: o.size, uploaded: o.uploaded }));
  if (!cursor) {
    const ups = await db(env).q(`SELECT key, size_bytes, created_at FROM mob_clips ORDER BY created_at DESC LIMIT 200`);
    clips.unshift(...ups.map((u) => ({ key: u.key, url: clipUrl(env, u.key), size: Number(u.size_bytes), uploaded: u.created_at })));
  }
  return { clips, cursor: r.truncated ? r.cursor : null };
}

/* ---------- posts ---------- */
export async function createPosts(env, { clip_key, account_ids, platforms, title, caption, scheduled_at, campaign_id, spread_minutes, created_by }) {
  const errors = [];
  if (!clip_key || typeof clip_key !== "string") errors.push("clip_key is required");
  if (!account_ids?.length && !platforms?.length) errors.push("account_ids or platforms is required");
  const when = scheduled_at ? new Date(scheduled_at) : new Date();
  if (isNaN(when)) errors.push("scheduled_at is not a valid date");
  if (errors.length) return { errors };
  if (!(await env.MEDIA.head(clip_key))) return { errors: ["clip_key not found in storage"] };
  const all = await listAccounts(env);
  const skipped = [];
  let chosen = [];
  if (account_ids?.length) {
    for (const id of account_ids.map(Number)) {
      const a = all.find((x) => x.id === id);
      if (!a) skipped.push({ account_id: id, reason: "no such account" });
      else if (a.status !== "connected") skipped.push({ account_id: id, platform: a.platform, reason: `account ${a.status}` });
      else chosen.push(a);
    }
  }
  for (const p of platforms || []) {
    if (!PLATFORMS[p]) { skipped.push({ platform: p, reason: "unknown platform" }); continue; }
    const live = all.filter((a) => a.platform === p && a.status === "connected");
    if (!live.length) skipped.push({ platform: p, reason: "not connected" });
    chosen.push(...live.filter((a) => !chosen.some((c) => c.id === a.id)));
  }
  const posts = [];
  for (const [i, a] of chosen.entries()) {
    const at = new Date(when.getTime() + i * (Number(spread_minutes) || 0) * 60000).toISOString();
    posts.push(await db(env).one(
      `INSERT INTO mob_posts (account_id, clip_key, title, caption, scheduled_at, campaign_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [a.id, clip_key, title || null, caption || null, at, campaign_id || null, created_by || "api"],
    ));
  }
  return { posts, skipped };
}

export const cancelPost = (env, id) => db(env).one(`UPDATE mob_posts SET status='canceled', updated_at=now() WHERE id=$1 AND status IN ('scheduled','failed') RETURNING *`, [id]);
// A post whose upload may already have landed (upload started, or reaped mid-run) can be live on the
// account. Requeueing it would post a duplicate, which Content Rewards rejects. Those need confirm=true.
export const MAYBE_LIVE = "Worker interrupted. The post may already be live: check the account before Retry";
export const mayBeLive = (p) => !!p && p.status === "failed" && (!!p.upload_started_at || p.error === MAYBE_LIVE);
export async function retryPost(env, id, { confirm = false } = {}) {
  const p = await db(env).one(`SELECT * FROM mob_posts WHERE id=$1`, [id]);
  if (!p) return null;
  if (mayBeLive(p) && !confirm) return { needs_confirm: true, post: p };
  return db(env).one(`UPDATE mob_posts SET status='scheduled', scheduled_at=now(), attempts=0, error=NULL, remote_id=NULL, upload_started_at=NULL, published_id=NULL, updated_at=now() WHERE id=$1 AND status IN ('failed','skipped','canceled') RETURNING *`, [id]);
}

/* ---------- cron ---------- */
let migrated = false;
// Every entry point (cron, admin pages, API) makes sure the tables exist once per isolate.
export async function ensureMigrated(env) {
  if (migrated) return;
  await migrate(env);
  migrated = true;
}

export async function claimDue(env, limit = CLAIM_BATCH) {
  return db(env).q(
    `UPDATE mob_posts SET status='publishing', attempts=attempts+1, updated_at=now()
     WHERE id IN (SELECT id FROM mob_posts WHERE status='scheduled' AND scheduled_at<=now() ORDER BY scheduled_at LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`, [limit]);
}

async function setPost(env, id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
  await db(env).q(`UPDATE mob_posts SET ${sets}, updated_at=now() WHERE id=$1`, [id, ...keys.map((k) => fields[k])]);
}

async function quotaBlock(env, acct) {
  if (acct.platform === "youtube") {
    const r = await db(env).one(`SELECT count(*)::int n FROM mob_posts p JOIN mob_accounts a ON a.id=p.account_id
      WHERE a.platform='youtube' AND p.status IN ('posted','processing') AND p.updated_at >= date_trunc('day', now())`);
    if (r.n >= youtube.DAILY_UPLOAD_CAP) return { reason: `YouTube daily upload limit (${youtube.DAILY_UPLOAD_CAP}) reached`, next: "date_trunc('day', now()) + interval '1 day 5 minutes'" };
  }
  if (acct.platform === "instagram") {
    const r = await db(env).one(`SELECT count(*)::int n FROM mob_posts WHERE account_id=$1 AND status IN ('posted','processing') AND updated_at > now() - interval '24 hours'`, [acct.id]);
    if (r.n >= instagram.DAILY_CAP) return { reason: `Instagram limit of ${instagram.DAILY_CAP} posts per 24h reached on this account`, next: "now() + interval '1 hour'" };
  }
  return null;
}

export async function processPost(env, post) {
  const acct = post.account_id ? await loadAccount(env, post.account_id) : null;
  if (!acct) return setPost(env, post.id, { status: "skipped", error: "Account is gone" });
  if (acct.status !== "connected") return setPost(env, post.id, { status: "skipped", error: `Account is ${acct.status === "needs_reconnect" ? "signed out. Reconnect it" : acct.status}` });
  const q = await quotaBlock(env, acct);
  if (q) {
    await db(env).q(`UPDATE mob_posts SET status='scheduled', attempts=attempts-1, scheduled_at=${q.next}, error=$2, updated_at=now() WHERE id=$1`, [post.id, q.reason]);
    return;
  }
  const clip = await clipInfo(env, post.clip_key);
  if (!clip) return setPost(env, post.id, { status: "failed", error: `Clip ${post.clip_key} is not in storage` });
  const head = await fetch(clip.url, { method: "HEAD" });
  if (head.status !== 200) {
    const e = new PlatformError(head.status, "clip_url", `Public clip link answered ${head.status}`, { retryable: head.status >= 500 });
    return failOrRetry(env, post, e);
  }
  try {
    const save = (fields) => { Object.assign(post, fields); return setPost(env, post.id, fields); };
    const r = await withAuth(env, acct, (a) => PLATFORMS[a.platform].publish(env, a, post, clip, save));
    await applyResult(env, post, r);
  } catch (e) {
    await failOrRetry(env, post, e);
  }
}

async function applyResult(env, post, r) {
  if (!r) return;
  if (r.status === "posted") return setPost(env, post.id, { status: "posted", remote_id: r.remote_id || post.remote_id, remote_url: r.url || null, error: null });
  if (r.status === "processing") return setPost(env, post.id, { status: "processing", remote_id: r.remote_id, ...(r.privacy ? { privacy: r.privacy } : {}), error: null });
  if (r.status === "failed") return setPost(env, post.id, { status: "failed", error: r.error });
}

async function failOrRetry(env, post, e) {
  const msg = String(e?.message || e);
  // Once the bytes may have reached the platform, never requeue on our own: that is how duplicates happen.
  if (e instanceof PlatformError && e.retryable && post.attempts < MAX_ATTEMPTS && !post.upload_started_at) {
    await db(env).q(`UPDATE mob_posts SET status='scheduled', scheduled_at=now() + ($2 * interval '10 minutes'), error=$3, updated_at=now() WHERE id=$1`, [post.id, post.attempts, msg]);
  } else {
    await setPost(env, post.id, { status: "failed", error: msg });
  }
}

export async function refreshDue(env) {
  const rows = await db(env).q(`SELECT id FROM mob_accounts WHERE status='connected' AND (
      (platform IN ('youtube','tiktok') AND refresh_token IS NOT NULL AND token_expires_at < now() + interval '30 minutes')
   OR (platform='instagram' AND COALESCE((meta->>'token_issued_at')::timestamptz, created_at) < now() - interval '7 days'))`);
  let n = 0;
  for (const { id } of rows) { const a = await loadAccount(env, id); if ((await refreshAccount(env, a)) === "ok") n++; }
  return n;
}

export async function pollProcessing(env) {
  await db(env).q(`UPDATE mob_posts SET status='failed', error='Timed out processing', updated_at=now() WHERE status='processing' AND updated_at < now() - interval '60 minutes'`);
  const rows = await db(env).q(`SELECT * FROM mob_posts WHERE status='processing' ORDER BY updated_at LIMIT 20`);
  for (const post of rows) {
    try {
      const acct = await loadAccount(env, post.account_id);
      if (!acct) { await setPost(env, post.id, { status: "failed", error: "Account is gone" }); continue; }
      const save = (fields) => { Object.assign(post, fields); return setPost(env, post.id, fields); };
      await applyResult(env, post, await withAuth(env, acct, (a) => PLATFORMS[a.platform].poll(env, a, post, save)));
    } catch (e) {
      if (!(e instanceof PlatformError && e.retryable)) await setPost(env, post.id, { status: "failed", error: String(e.message || e) });
    }
  }
  return rows.length;
}

export async function runTick(env) {
  const out = { refreshed: 0, claimed: 0, polled: 0, reaped: 0, errors: [] };
  await ensureMigrated(env);
  try { out.refreshed = await refreshDue(env); } catch (e) { out.errors.push(`refresh: ${e.message}`); }
  try {
    const due = await claimDue(env);
    out.claimed = due.length;
    for (const post of due) {
      try { await processPost(env, post); } catch (e) {
        out.errors.push(`post ${post.id}: ${e.message}`);
        try { await setPost(env, post.id, { status: "failed", error: String(e.message || e) }); } catch {}
      }
    }
  } catch (e) { out.errors.push(`claim: ${e.message}`); }
  try { out.polled = await pollProcessing(env); } catch (e) { out.errors.push(`poll: ${e.message}`); }
  try {
    const r = await db(env).q(`UPDATE mob_posts SET status='failed', error=$1, updated_at=now() WHERE status='publishing' AND updated_at < now() - interval '15 minutes' RETURNING id`, [MAYBE_LIVE]);
    out.reaped = r.length;
  } catch (e) { out.errors.push(`reap: ${e.message}`); }
  return out;
}
export const _resetMigrated = () => { migrated = false; };
