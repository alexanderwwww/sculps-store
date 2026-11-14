export const DEFAULT_BASE = "https://mob.gardenbuddystore.workers.dev";
export const base = (env) => (env.MOB_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
export const redirectUri = (env, platform) => `${base(env)}/oauth/${platform}/callback`;

// One error type for every platform. message keeps the platform's own words verbatim:
// "{http status} {platform error code}: {message}".
export class PlatformError extends Error {
  constructor(status, code, message, { retryable, auth } = {}) {
    super(`${status} ${code || "error"}: ${message || ""}`.trim());
    this.status = status;
    this.code = code;
    this.retryable = retryable ?? (status === 429 || status >= 500);
    this.auth = auth ?? status === 401;
  }
}

export async function readBody(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _text: text }; }
}

export const form = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v != null)).toString();
export const inSeconds = (s) => (s ? new Date(Date.now() + Number(s) * 1000).toISOString() : null);
