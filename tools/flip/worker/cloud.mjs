/**
 * The wire to Claude, reached over HTTP and nothing else.
 *
 * This is why the app needs no key. The thinking is not done here: the app
 * posts what it sees on Depop, Claude reads that from the other side and
 * posts the written work back, and the app shows it. The laptop never holds a
 * credential of any kind — the key in the URL is the whole of the auth, and it
 * reaches nothing but this app's own four slots.
 *
 * Every call has a deadline, because a hang never rejects and a hung poll is
 * an app that looks alive and does nothing.
 */
export const DEFAULT_BASE =
  "https://kerberos.gardenbuddystore.workers.dev/flip/aes7lzINLJbOC490K8GDwLCe";

export function connectCloud(base = process.env.FLIP_CLOUD || DEFAULT_BASE, { timeoutMs = 10000 } = {}) {
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
    /** What is on the shop floor, as the app just read it.
     *  `items`, because that is the word the back end reads. It used to send
     *  `jobs`, which the route ignored — so the board arrived empty every
     *  time and nothing said so. */
    board: (items) => post("/board", { items }),
    /** What it is doing, for anyone who asks from outside. */
    status: (state) => post("/status", state),
    /**
     * Xcoder: the look, as numbers, pushed from the chat.
     *
     * The orb is drawn by AppKit, so there is no page to push HTML into — what
     * travels is the values the glass is made of. `build` only ever goes up,
     * and the worker ignores anything that is not higher than what it already
     * applied, so a stale read can never undo a change and a push can be
     * rolled back by sending a higher build carrying the old numbers.
     */
    ui: () => get("/ui"),
    /**
     * The written work, if Claude has posted any.
     *
     * Reading drains the tray, so the same reply can never be typed twice —
     * a duplicate message to a buyer is worse than a late one.
     */
    work: () => get("/work"),
    /** Say what actually arrived. Only these leave the tray. */
    ack: (ids) => post("/ack", { ids }),
    /** The playbook, as markdown, so Claude reads it before writing anything. */
    knowledge: (files) => post("/knowledge", { files }),
    /** A line for the record. */
    log: (lines) => post("/log", { lines }),
  };
}
