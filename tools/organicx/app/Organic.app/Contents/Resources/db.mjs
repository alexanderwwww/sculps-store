/**
 * Its memory — reached through the Worker, never directly.
 *
 * This used to open Neon from the Mac, which meant the app needed the
 * database URL on the machine: a hand-made .env file it refused to start
 * without, and a live credential for every store's data sitting in a folder
 * on a laptop. An app that drives a browser has no business holding a
 * database password, and a setup step that says "put this file here" is a
 * step somebody gets wrong.
 *
 * So every function here is one HTTP call to the control plane, which holds
 * the URL and runs the query. The names and the results are exactly what they
 * were, so nothing else in the app changed. There is no DATABASE_URL anywhere
 * on the Mac now, and nothing to set up.
 */

let base = null;

/** Point it at the control plane. The key in the URL is the whole of the auth. */
export function connect(controlPlaneBase) {
  if (!controlPlaneBase) throw new Error("connect() needs the control plane's URL");
  base = controlPlaneBase.replace(/\/$/, "");
}

async function call(op, args = {}) {
  if (!base) throw new Error("connect() first");
  const res = await fetch(base + "/db", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, args }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => null);
  if (!body?.ok) throw new Error(`${op}: ${body?.error ?? `HTTP ${res.status}`}`);
  return body.result;
}

/* -------------------------------------------------------------- accounts */
export const accounts = () => call("accounts");
export const accountFor = (platform, handle) => call("accountFor", { platform, handle });
export const markConnected = (platform, handle, profile) => call("markConnected", { platform, handle, profile });
export const park = (accountId, why) => call("park", { accountId, why });
export const isParked = (accountId) => call("isParked", { accountId });
export const seen = (accountId) => call("seen", { accountId });
export const warmedToday = (accountId) => call("warmedToday", { accountId });

/* -------------------------------------------------------------- personas */
export const personaFor = (accountId) => call("personaFor", { accountId });
export const savePersona = (accountId, persona) => call("savePersona", { accountId, persona });

/* --------------------------------------------------------------- actions */
export const act = (accountId, kind, extra = {}) => call("act", { accountId, kind, ...extra });
export const todayCounts = (accountId) => call("todayCounts", { accountId });

/* ----------------------------------------------------------------- clips */
export const knownClip = (sourceUrl) => call("knownClip", { sourceUrl });
export const saveClip = (clip) => call("saveClip", { clip });

/* ------------------------------------------------------------ the memory */
export const learn = (scope, dimension, value, won) => call("learn", { scope, dimension, value, won });
export const weights = (scope, dimension) => call("weights", { scope, dimension });
export const remember = (scope, lesson, evidence, confidence = 0.5) =>
  call("remember", { scope, lesson, evidence, confidence });
export const lessons = (scope, limit = 20) => call("lessons", { scope, limit });

/* ------------------------------------------------------------- the tasks */
export const addTask = (kind, payload, notBefore = null) => call("addTask", { kind, payload, notBefore });
export const nextTask = () => call("nextTask");
export const finishTask = (id, error = null) => call("finishTask", { id, error });
