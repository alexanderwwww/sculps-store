/*
 * TikTok via Login Kit + Content Posting API (Direct Post). Docs read 2026-11-14:
 *   Login Kit (web):      https://developers.tiktok.com/doc/login-kit-web  (authorize https://www.tiktok.com/v2/auth/authorize/)
 *   Get user token:       https://developers.tiktok.com/doc/oauth-get-a-user-access-token
 *     POST https://open.tiktokapis.com/v2/oauth/token/ form client_key,client_secret,code,grant_type=authorization_code,redirect_uri
 *     -> access_token, expires_in, refresh_token, refresh_expires_in, open_id, scope, token_type ; error -> {error,error_description,log_id}
 *   Refresh:              https://developers.tiktok.com/doc/oauth-refresh-a-user-access-token
 *     same URL, grant_type=refresh_token ; "A refresh request will return a different refresh_token" -> always save the new one
 *   Creator info:         https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info
 *     POST /v2/post/publish/creator_info/query/ -> creator_username, privacy_level_options, max_video_post_duration_sec
 *     errors come back as HTTP 200 with error.code != "ok" (spam_risk_too_many_posts, ...)
 *   Direct post init:     https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 *     POST /v2/post/publish/video/init/ {post_info:{title<=2200 UTF-16, privacy_level,...}, source_info:{source,video_url|video_size,chunk_size,total_chunk_count}}
 *     -> data.publish_id, data.upload_url ; 403 unaudited_client_can_only_post_to_private_accounts, 403 url_ownership_unverified
 *   Media transfer:       https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
 *     chunks 5-64MB, last chunk up to 128MB, count = floor(size/chunk), 1..1000; files <5MB one chunk = whole file;
 *     files >64MB must be chunked; sequential PUT, 206 = more, 201 = done
 *   Status:               https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status
 *     POST /v2/post/publish/status/fetch/ {publish_id} -> status, fail_reason, publicaly_available_post_id (sic)
 * Unaudited apps can post only to private accounts, and content stays private (SELF_ONLY) until TikTok audits the app.
 */
import { PlatformError, readBody, form, inSeconds, redirectUri } from "./common.mjs";

export const API = "https://open.tiktokapis.com";
export const SCOPES = ["user.info.basic", "video.publish"];
export const TITLE_MAX_UTF16 = 2200;
export const secrets = ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"];
const MB = 1024 * 1024;

export function authorizeUrl(env, state) {
  const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
  u.search = form({ client_key: env.TIKTOK_CLIENT_KEY, response_type: "code", scope: SCOPES.join(","), redirect_uri: redirectUri(env, "tiktok"), state });
  return u.toString();
}

async function token(body) {
  const res = await fetch(`${API}/v2/oauth/token/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" }, body: form(body) });
  const j = await readBody(res);
  if (!res.ok || j.error || !j.access_token) {
    const code = typeof j.error === "string" ? j.error : j.error?.code;
    throw new PlatformError(res.status, code, j.error_description || j.error?.message || j._text, { auth: true, retryable: res.status >= 500 });
  }
  return j;
}

function tokFields(t) {
  return {
    access_token: t.access_token, refresh_token: t.refresh_token, token_expires_at: inSeconds(t.expires_in),
    refresh_expires_at: inSeconds(t.refresh_expires_in), scopes: t.scope,
  };
}

async function api(acct, path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST", headers: { authorization: `Bearer ${acct.access_token}`, "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify(body || {}),
  });
  const j = await readBody(res);
  const code = j.error?.code;
  if (!res.ok || (code && code !== "ok")) throw new PlatformError(res.status, code, j.error?.message || j._text, { retryable: res.status === 429 || res.status >= 500 });
  return j.data || {};
}

export async function exchange(env, code) {
  const t = await token({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: "authorization_code", redirect_uri: redirectUri(env, "tiktok") });
  let handle = t.open_id;
  try { handle = (await api({ access_token: t.access_token }, "/v2/post/publish/creator_info/query/")).creator_username || handle; } catch { /* handle stays open_id */ }
  return { external_id: t.open_id, handle, ...tokFields(t), meta: {} };
}

export async function refresh(env, acct) {
  const t = await token({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: acct.refresh_token });
  return tokFields(t);
}

export function chunkPlan(size) {
  if (size <= 64 * MB) return { video_size: size, chunk_size: size, total_chunk_count: 1 };
  const chunk = 10 * MB;
  const total = Math.floor(size / chunk);
  if (total > 1000) throw new PlatformError(400, "too_big", "Clip too large for TikTok chunk limits", { retryable: false });
  return { video_size: size, chunk_size: chunk, total_chunk_count: total };
}
export function chunkRanges(plan) {
  const out = [];
  for (let i = 0; i < plan.total_chunk_count; i++) {
    const first = i * plan.chunk_size;
    const last = i === plan.total_chunk_count - 1 ? plan.video_size - 1 : first + plan.chunk_size - 1;
    out.push({ first, last, length: last - first + 1 });
  }
  return out;
}

const utf16len = (s) => String(s || "").length;

const noSave = async () => {};
export async function publish(env, acct, post, clip, save = noSave) {
  const info = await api(acct, "/v2/post/publish/creator_info/query/");
  const opts = info.privacy_level_options || [];
  const privacy = opts.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY";
  if (info.max_video_post_duration_sec && clip.duration && clip.duration > info.max_video_post_duration_sec)
    throw new PlatformError(400, "too_long", `TikTok allows ${info.max_video_post_duration_sec}s on this account`, { retryable: false });
  let title = post.caption || post.title || "";
  if (utf16len(title) > TITLE_MAX_UTF16) title = title.slice(0, TITLE_MAX_UTF16);
  const post_info = { title, privacy_level: privacy, disable_duet: false, disable_comment: false, disable_stitch: false, is_aigc: false };
  let data;
  try {
    data = await api(acct, "/v2/post/publish/video/init/", { post_info, source_info: { source: "PULL_FROM_URL", video_url: clip.url } });
    await save({ remote_id: data.publish_id, upload_started_at: new Date().toISOString() });
  } catch (e) {
    if (e.code !== "url_ownership_unverified") throw e;
    const plan = chunkPlan(clip.size);
    data = await api(acct, "/v2/post/publish/video/init/", { post_info, source_info: { source: "FILE_UPLOAD", ...plan } });
    await save({ remote_id: data.publish_id, upload_started_at: new Date().toISOString() });
    for (const r of chunkRanges(plan)) {
      const res = await fetch(data.upload_url, {
        method: "PUT",
        headers: { "content-type": "video/mp4", "content-length": String(r.length), "content-range": `bytes ${r.first}-${r.last}/${plan.video_size}` },
        body: await clip.stream({ offset: r.first, length: r.length }), duplex: "half",
      });
      if (res.status !== 206 && res.status !== 201) {
        const j = await readBody(res);
        throw new PlatformError(res.status, j.error?.code, j.error?.message || j._text);
      }
    }
  }
  return { status: "processing", remote_id: data.publish_id, privacy };
}

export async function poll(env, acct, post) {
  const d = await api(acct, "/v2/post/publish/status/fetch/", { publish_id: post.remote_id });
  if (d.status === "FAILED") return { status: "failed", error: `TikTok FAILED: ${d.fail_reason || "no reason given"}` };
  if (d.status !== "PUBLISH_COMPLETE") return null;
  const id = Array.isArray(d.publicaly_available_post_id) ? d.publicaly_available_post_id[0] : d.publicaly_available_post_id;
  return { status: "posted", remote_id: post.remote_id, url: id ? `https://www.tiktok.com/@${acct.handle}/video/${id}` : null };
}
