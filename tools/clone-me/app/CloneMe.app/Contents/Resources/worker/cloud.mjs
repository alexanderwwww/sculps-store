/**
 * The wire to Claude, reached over HTTP and nothing else.
 *
 * This is why the app needs no key. The thinking is not done here: the app
 * posts what it sees on Fiverr, Claude reads that from the other side and
 * posts the written work back, and the app shows it. The laptop never holds a
 * credential of any kind — the key in the URL is the whole of the auth, and it
 * reaches nothing but this app's own four slots.
 *
 * Every call has a deadline, because a hang never rejects and a hung poll is
 * an app that looks alive and does nothing.
 */
export const DEFAULT_BASE =
  "https://kerberos.gardenbuddystore.workers.dev/clone/FZ0PJ4hdbfoGJQlG5e6KtFANAx6sKziq";

export function connectCloud(base = process.env.CLONE_CLOUD || DEFAULT_BASE, { timeoutMs = 10000 } = {}) {
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
    /** What is waiting on Fiverr, as the app just read it. */
    board: (jobs) => post("/board", { jobs }),
    /** What it is doing, for anyone who asks from outside. */
    status: (state) => post("/status", state),
    /**
     * The written work, if Claude has posted any.
     *
     * Reading drains the tray, so the same reply can never be typed twice —
     * a duplicate message to a buyer is worse than a late one.
     */
    work: () => get("/work"),
    /** A line for the record. */
    log: (lines) => post("/log", { lines }),
  };
}
