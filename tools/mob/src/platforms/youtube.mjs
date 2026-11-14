/*
 * YouTube Shorts via YouTube Data API v3. Docs read 2026-11-14:
 *   OAuth web-server flow:  https://developers.google.com/identity/protocols/oauth2/web-server
 *   videos.insert:          https://developers.google.com/youtube/v3/docs/videos/insert
 *     "quota cost of 1 unit in the Video Uploads quota bucket", 100 calls/day; MIME video/* ; max 256GB
 *   video resource limits:  https://developers.google.com/youtube/v3/docs/videos
 *     snippet.title max 100 characters, snippet.description max 5000 bytes, neither may contain < or >
 *   resumable upload:       https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
 *     step 1 POST ...?uploadType=resumable&part=... -> 200 + Location; step 2 PUT bytes -> 201 + video resource
 *   channels.list mine=true: https://developers.google.com/youtube/v3/docs/channels/list
 */
import { PlatformError, readBody, form, inSeconds, redirectUri } from "./common.mjs";

export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
export const DAILY_UPLOAD_CAP = 100;
export const TITLE_MAX = 100;
export const DESC_MAX_BYTES = 5000;
export const secrets = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];

export function authorizeUrl(env, state) {
  const u = new URL(AUTH_URL);
  u.search = form({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(env, "youtube"), response_type: "code",
    scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return u.toString();
}

async function tokenCall(body) {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form(body) });
  const j = await readBody(res);
  if (!res.ok) throw new PlatformError(res.status, j.error, j.error_description || j._text, { auth: res.status === 400 || res.status === 401, retryable: res.status >= 500 });
  return j;
}

export async function exchange(env, code) {
  const t = await tokenCall({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(env, "youtube"), grant_type: "authorization_code" });
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${t.access_token}` } });
  const j = await readBody(res);
  if (!res.ok) throw new PlatformError(res.status, j.error?.errors?.[0]?.reason, j.error?.message);
  const ch = j.items?.[0];
  if (!ch) throw new PlatformError(400, "no_channel", "This Google account has no YouTube channel");
  return {
    external_id: ch.id, handle: ch.snippet?.customUrl || ch.snippet?.title || ch.id,
    access_token: t.access_token, refresh_token: t.refresh_token || null, token_expires_at: inSeconds(t.expires_in),
    refresh_expires_at: null, scopes: t.scope || SCOPES.join(" "), meta: { title: ch.snippet?.title },
  };
}

// Refresh: POST token endpoint with client_id, client_secret, grant_type=refresh_token, refresh_token.
// Response: access_token, expires_in, scope, token_type (no new refresh_token).
export async function refresh(env, acct) {
  const t = await tokenCall({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: acct.refresh_token });
  return { access_token: t.access_token, token_expires_at: inSeconds(t.expires_in) };
}

const clean = (s) => String(s || "").replace(/[<>]/g, "");
export function buildMetadata(post) {
  const title = [...clean(post.title || post.caption || "New short")].slice(0, TITLE_MAX).join("");
  let description = clean(post.caption || "");
  if (!/#shorts\b/i.test(description)) description = (description ? description + "\n\n" : "") + "#Shorts";
  const bytes = new TextEncoder().encode(description);
  if (bytes.length > DESC_MAX_BYTES) description = new TextDecoder().decode(bytes.slice(0, DESC_MAX_BYTES)).replace(/�$/, "");
  return { snippet: { title, description, categoryId: "20" }, status: { privacyStatus: post.privacy || "public", selfDeclaredMadeForKids: false } };
}

function ytError(res, j) {
  const e = j.error || {};
  return new PlatformError(res.status, e.errors?.[0]?.reason || e.status, e.message || j._text, { retryable: res.status === 429 || res.status >= 500 });
}

const noSave = async () => {};
export async function publish(env, acct, post, clip, save = noSave) {
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${acct.access_token}`, "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(clip.size), "x-upload-content-type": "video/mp4",
    },
    body: JSON.stringify(buildMetadata(post)),
  });
  if (!init.ok) throw ytError(init, await readBody(init));
  const session = init.headers.get("location");
  if (!session) throw new PlatformError(init.status, "no_location", "YouTube did not return an upload session");
  // From here the bytes may reach YouTube even if we never read the answer: mark it so no automatic
  // retry can upload a duplicate.
  await save({ upload_started_at: new Date().toISOString() });
  const body = await clip.stream();
  const up = await fetch(session, {
    method: "PUT", headers: { authorization: `Bearer ${acct.access_token}`, "content-type": "video/mp4", "content-length": String(clip.size) },
    body, duplex: "half",
  });
  const j = await readBody(up);
  if (!up.ok) throw ytError(up, j);
  if (!j.id) throw new PlatformError(up.status, "no_id", "YouTube accepted the upload but returned no video id");
  return { status: "posted", remote_id: j.id, url: `https://www.youtube.com/shorts/${j.id}` };
}

export async function poll() { return null; }
