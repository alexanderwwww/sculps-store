// Admin session cookie (HMAC-SHA256 signed with ADMIN_PASSWORD) and the bearer check for the JSON API.
// Token encryption at rest: AES-GCM, key = SHA-256(MOB_ENC_KEY), so a DB leak alone hands over no account.
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export function safeEqual(a, b) {
  a = String(a ?? ""); b = String(b ?? "");
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

const COOKIE = "mob_session";
const DAYS30 = 30 * 86400;

export async function makeSessionCookie(env, now = Date.now()) {
  const exp = Math.floor(now / 1000) + DAYS30;
  const sig = await hmac(env.ADMIN_PASSWORD, `admin.${exp}`);
  return `${COOKIE}=admin.${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS30}`;
}

export async function isAdmin(req, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)mob_session=([^;]+)/);
  if (!m) return false;
  const [who, exp, sig] = m[1].split(".");
  if (who !== "admin" || !exp || !sig) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(env.ADMIN_PASSWORD, `admin.${exp}`));
}

export function isBearer(req, env) {
  const h = req.headers.get("authorization") || "";
  return !!env.MOB_API_TOKEN && h.startsWith("Bearer ") && safeEqual(h.slice(7), env.MOB_API_TOKEN);
}

async function aesKey(env) {
  if (!env.MOB_ENC_KEY) throw new Error("MOB_ENC_KEY is not set");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(env.MOB_ENC_KEY));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function seal(env, text) {
  if (text == null) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(String(text)));
  return `v1.${b64u(iv)}.${b64u(ct)}`;
}
export async function unseal(env, blob) {
  if (!blob) return null;
  const [v, iv, ct] = blob.split(".");
  if (v !== "v1") throw new Error("token blob has unknown format");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, await aesKey(env), unb64u(ct));
  return new TextDecoder().decode(pt);
}
