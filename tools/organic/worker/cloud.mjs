/**
 * The control plane, reached over HTTP and nothing else.
 *
 * Nothing on the Mac holds a database credential; the key in the URL is the
 * whole of the auth. Every call has a ten-second deadline, because a stalled
 * connection with no deadline once blocked the whole app for undici's
 * five-minute default — .catch() handles a rejection, a hang never rejects.
 */

export const DEFAULT_BASE =
  "https://kerberos.gardenbuddystore.workers.dev/organic/6pT0ha8Y_4_VdVyzThF96kJw2rXmcVU7";

export function connectCloud(base = process.env.ORGANIC_CLOUD || DEFAULT_BASE, { timeoutMs = 10000 } = {}) {
  const root = String(base).replace(/\/$/, "");

  async function post(path, body) {
    const res = await fetch(root + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  async function get(path) {
    const res = await fetch(root + path, { signal: AbortSignal.timeout(timeoutMs) });
    return res.json().catch(() => null);
  }

  /** One database op. Throws with the op's name when the plane says no. */
  async function call(op, args = {}) {
    const { status, body } = await post("/db", { op, args });
    if (!body?.ok) throw new Error(`${op}: ${body?.error ?? `HTTP ${status}`}`);
    return body.result;
  }

  const db = {
    call,
    accounts: () => call("accounts"),
    accountFor: (platform, handle) => call("accountFor", { platform, handle }),
    markConnected: (platform, handle) => call("markConnected", { platform, handle }),
    disconnect: (platform, handle) => call("disconnect", { platform, handle }),
    park: (accountId, why) => call("park", { accountId, why }),
    isParked: (accountId) => call("isParked", { accountId }),
    seen: (accountId) => call("seen", { accountId }),
    warmedToday: (accountId) => call("warmedToday", { accountId }),
    personaFor: (accountId) => call("personaFor", { accountId }),
    savePersona: (accountId, persona) => call("savePersona", { accountId, persona }),
    act: (accountId, kind, extra = {}) => call("act", { accountId, kind, ...extra }),
    todayCounts: (accountId) => call("todayCounts", { accountId }),
    knownClip: (sourceUrl) => call("knownClip", { sourceUrl }),
    saveClip: (clip) => call("saveClip", { clip }),
    saveFinding: (finding) => call("saveFinding", { finding }),
    findings: (product, kind, limit = 50) => call("findings", { product, kind, limit }),
    learn: (scope, dimension, value, won) => call("learn", { scope, dimension, value, won }),
    weights: (scope, dimension) => call("weights", { scope, dimension }),
    remember: (scope, lesson, evidence, confidence = 0.5) => call("remember", { scope, lesson, evidence, confidence }),
    lessons: (scope, limit = 20) => call("lessons", { scope, limit }),
    addTask: (kind, payload, notBefore = null) => call("addTask", { kind, payload, notBefore }),
    nextTask: () => call("nextTask"),
    finishTask: (id, error = null) => call("finishTask", { id, error }),
  };

  return {
    base: root,
    /** Heartbeat: state, what is being done, the build, the ticker tail. */
    status: (body) => post("/status", body).then((r) => r.body),
    /** One ticker line, kept by the plane. */
    log: (who, what) => post("/log", { who, what, at: Date.now() }).then((r) => r.body),
    /** The standing instruction; null until Claude sets one. */
    brief: () => get("/brief"),
    /** A pending order ({cmd}) or nothing. */
    order: () => get("/order"),
    /** The runtime slot: { build, files } — read only; pushing is organic_push. */
    runtime: () => get("/runtime"),
    db,
  };
}
