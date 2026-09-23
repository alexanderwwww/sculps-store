/**
 * The control plane, reached over HTTP and nothing else.
 *
 * Its own key, its own slots, nothing shared with the organic app — a different app
 * doing a different job, and neither can read the other's anything. The key
 * in the URL is the whole of the auth, so nothing on the Mac holds a database
 * credential. Every call has a deadline, because a hang never rejects.
 */

export const DEFAULT_BASE =
  "https://kerberos.gardenbuddystore.workers.dev/research/SUSwMWKlnnu0jiEOVkEJuF1smRni9Lvk";

export function connectCloud(base = process.env.RESEARCH_CLOUD || DEFAULT_BASE, { timeoutMs = 10000 } = {}) {
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

  return {
    base: root,
    /** What the app is doing, for anyone who asks from outside. */
    status: (state) => post("/status", state),
    /** The next thing Alex wants done, or nothing. */
    order: () => get("/order"),
    /** What he asked to be found, in his own words. */
    hunt: () => get("/hunt"),
    /** A finished report, published where he can open it. */
    publish: (report) => post("/report", report),
    /** A line for the record. */
    log: (lines) => post("/log", { lines }),
    /** New code for this app, pushed without him downloading anything. */
    runtime: () => get("/runtime"),
  };
}
