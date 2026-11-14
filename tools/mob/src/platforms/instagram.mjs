/*
 * Instagram Reels via the Instagram API with Instagram Login (no Facebook Page needed). Docs read 2026-11-14:
 *   Business Login:   https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
 *     authorize https://www.instagram.com/oauth/authorize ; short token POST https://api.instagram.com/oauth/access_token
 *     -> {"data":[{access_token,user_id,permissions}]} ; long-lived GET https://graph.instagram.com/access_token
 *     grant_type=ig_exchange_token -> {access_token,token_type,expires_in} ; refresh GET /refresh_access_token
 *     grant_type=ig_refresh_token (token must be >=24h old and unexpired)
 *   Get started (GET /me?fields=user_id,username -> {"data":[{user_id,username}]}):
 *     https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
 *   Content publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/
 *     POST /<IG_ID>/media media_type=REELS video_url ; GET /<container>?fields=status_code
 *     (EXPIRED|ERROR|FINISHED|IN_PROGRESS|PUBLISHED, poll once a minute <=5 min) ; POST /<IG_ID>/media_publish creation_id
 *     "100 API-published posts within a 24-hour moving period" (carousel section says 50; we cap at 50)
 *   IG User Media reference (Reels spec, API version v27.0 shown as latest):
 *     https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
 *     MP4/MOV, H264/HEVC, 23-60 fps, 3 s - 15 min, max 300MB, caption max 2200 chars / 30 hashtags / 20 @ tags
 */
import { PlatformError, readBody, form, inSeconds, redirectUri } from "./common.mjs";

export const API_VERSION = "v27.0";
export const G = `https://graph.instagram.com/${API_VERSION}`;
export const SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
export const CAPTION_MAX = 2200;
export const HASHTAGS_MAX = 30;
export const MENTIONS_MAX = 20;
export const MAX_BYTES = 300 * 1024 * 1024;
export const DAILY_CAP = 50;
export const secrets = ["IG_APP_ID", "IG_APP_SECRET"];

export function authorizeUrl(env, state) {
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.search = form({ client_id: env.IG_APP_ID, redirect_uri: redirectUri(env, "instagram"), response_type: "code", scope: SCOPES.join(","), state });
  return u.toString();
}

function igError(res, j) {
  const e = j.error || {};
  const code = e.code != null ? String(e.code) + (e.error_subcode ? `/${e.error_subcode}` : "") : e.type;
  return new PlatformError(res.status, code, e.error_user_msg || e.message || j.error_message || j._text, { auth: res.status === 401 || e.code === 190 });
}
async function call(url, init) {
  const res = await fetch(url, init);
  const j = await readBody(res);
  if (!res.ok || j.error) throw igError(res, j);
  return j;
}

export async function exchange(env, code) {
  const s = await call("https://api.instagram.com/oauth/access_token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ client_id: env.IG_APP_ID, client_secret: env.IG_APP_SECRET, grant_type: "authorization_code", redirect_uri: redirectUri(env, "instagram"), code }),
  });
  const short = Array.isArray(s.data) ? s.data[0] : s;
  const l = await call(`https://graph.instagram.com/access_token?${form({ grant_type: "ig_exchange_token", client_secret: env.IG_APP_SECRET, access_token: short.access_token })}`);
  const me = await call(`${G}/me?${form({ fields: "user_id,username", access_token: l.access_token })}`);
  const p = Array.isArray(me.data) ? me.data[0] : me;
  return {
    external_id: String(p.user_id || short.user_id), handle: p.username || String(short.user_id),
    access_token: l.access_token, refresh_token: null, token_expires_at: inSeconds(l.expires_in), refresh_expires_at: null,
    scopes: Array.isArray(short.permissions) ? short.permissions.join(",") : SCOPES.join(","), meta: { token_issued_at: new Date().toISOString() },
  };
}

export async function refresh(env, acct) {
  const r = await call(`https://graph.instagram.com/refresh_access_token?${form({ grant_type: "ig_refresh_token", access_token: acct.access_token })}`);
  return { access_token: r.access_token, token_expires_at: inSeconds(r.expires_in), meta: { token_issued_at: new Date().toISOString() } };
}

export function checkCaption(caption = "") {
  if ([...caption].length > CAPTION_MAX) return `Instagram captions max ${CAPTION_MAX} characters`;
  if ((caption.match(/#[\p{L}\p{N}_]+/gu) || []).length > HASHTAGS_MAX) return `Instagram allows ${HASHTAGS_MAX} hashtags`;
  if ((caption.match(/@[\w.]+/g) || []).length > MENTIONS_MAX) return `Instagram allows ${MENTIONS_MAX} @ tags`;
  return null;
}

const noSave = async () => {};
export async function publish(env, acct, post, clip, save = noSave) {
  const bad = checkCaption(post.caption || "");
  if (bad) throw new PlatformError(400, "caption", bad, { retryable: false });
  if (clip.size > MAX_BYTES) throw new PlatformError(400, "too_big", "Instagram takes Reels up to 300MB", { retryable: false });
  const c = await call(`${G}/${acct.external_id}/media`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ media_type: "REELS", video_url: clip.url, caption: post.caption || "", share_to_feed: "true", access_token: acct.access_token }),
  });
  await save({ remote_id: String(c.id), upload_started_at: new Date().toISOString() });
  return { status: "processing", remote_id: String(c.id) };
}

// Called on later cron ticks with post.remote_id = container id.
// media_publish is called at most once per container: its media id is saved (published_id) before anything
// else, a PUBLISHED container is never published again, and a failed permalink read still counts as posted.
async function permalink(acct, mediaId) {
  try { return (await call(`${G}/${mediaId}?${form({ fields: "permalink", access_token: acct.access_token })}`)).permalink || null; } catch { return null; }
}
export async function poll(env, acct, post, save = noSave) {
  if (post.published_id) return { status: "posted", remote_id: post.published_id, url: await permalink(acct, post.published_id) };
  const s = await call(`${G}/${post.remote_id}?${form({ fields: "status_code", access_token: acct.access_token })}`);
  if (s.status_code === "IN_PROGRESS") return null;
  if (s.status_code === "ERROR" || s.status_code === "EXPIRED") return { status: "failed", error: `Instagram container ${s.status_code}` };
  if (s.status_code === "PUBLISHED") return { status: "posted", remote_id: post.remote_id, url: null };
  if (s.status_code !== "FINISHED") return null;
  const pub = await call(`${G}/${acct.external_id}/media_publish`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ creation_id: post.remote_id, access_token: acct.access_token }),
  });
  await save({ published_id: String(pub.id) });
  return { status: "posted", remote_id: String(pub.id), url: await permalink(acct, pub.id) };
}
