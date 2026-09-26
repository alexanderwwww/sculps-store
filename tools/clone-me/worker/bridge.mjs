/**
 * The wire between the brain and the phone.
 *
 * The app is one window with one web view in it, and the Swift shell is a
 * piece of wire: everything the page says arrives here, everything said here
 * arrives in the page. So this module is both halves of that conversation —
 * an HTTP server that hands the shell the crew's code, a WebSocket it talks
 * over, and a small promise-shaped API for the brain: `do(act, args)` goes
 * out, `{t:"done", id}` comes back, and nothing waits forever.
 *
 * Bound to 127.0.0.1. The launcher passes the port in ORGANIC_PORT and reads
 * "PORT n" from stdout — the first and only line stdout ever carries.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WebSocketServer } from "ws";

/** Everything the brain may ask the page to do. Anything else is refused. */
export const ACTS = new Set([
  "goto", "scroll", "tap", "type", "dwell", "read", "say", "cursor", "panel", "stop",
  // the supplier desk
  "send", "openThread",
]);

/** Everything the page may say back. */
const FROM_PAGE = new Set(["hello", "done", "tick", "asked", "trouble"]);

let nextId = 1;

export async function startBridge({ dir, port = Number(process.env.CLONE_PORT) || 0, onMessage }) {
  const agentPath = join(dir, "agent.built.js");

  const server = http.createServer(async (req, res) => {
    if (req.method !== "GET") return res.writeHead(405).end();
    const path = (req.url || "/").split("?")[0];
    if (path === "/agent.js") {
      try {
        const source = await readFile(agentPath, "utf8");
        res.writeHead(200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" });
        return res.end(source);
      } catch (error) {
        res.writeHead(500, { "content-type": "text/plain" });
        return res.end(`the crew's code is missing: ${error.message}`);
      }
    }
    if (path === "/alive") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("yes");
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("no");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const bound = server.address().port;

  const wss = new WebSocketServer({ server, path: "/ws" });
  let socket = null;
  const waiting = new Map();   // id → { resolve, timer }
  const outbox = [];           // what the phone missed while it was away

  const send = (msg) => {
    const text = JSON.stringify(msg);
    if (socket && socket.readyState === 1) { socket.send(text); return true; }
    outbox.push(text);
    while (outbox.length > 200) outbox.shift();
    return false;
  };

  wss.on("connection", (ws) => {
    socket = ws;
    while (outbox.length && ws.readyState === 1) ws.send(outbox.shift());
    ws.on("message", (raw) => {
      let m;
      try { m = JSON.parse(String(raw)); } catch { return; }
      if (!m || typeof m !== "object" || !FROM_PAGE.has(m.t)) return;
      if (m.t === "done") {
        const held = waiting.get(m.id);
        if (held) { waiting.delete(m.id); clearTimeout(held.timer); held.resolve(m); }
        return;
      }
      onMessage?.(m);
    });
    ws.on("close", () => { if (socket === ws) socket = null; });
    ws.on("error", () => { if (socket === ws) socket = null; });
  });

  /**
   * Ask the page to do one thing.
   *
   * Always settles: a phone that is closed, asleep or busy answers nothing,
   * and a brain that waits forever is a brain that has stopped. The caller
   * gets `{ok:false, error}` and decides.
   */
  function ask(act, args = {}, { ms = 20000 } = {}) {
    if (!ACTS.has(act)) return Promise.resolve({ ok: false, error: `not an act: ${act}` });
    const id = nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        resolve({ ok: false, error: "the phone did not answer" });
      }, ms);
      timer.unref?.();
      waiting.set(id, { resolve, timer });
      if (!send({ t: "do", id, act, ...args })) {
        // Queued rather than sent: the phone is not there yet. The timeout
        // still applies, so this cannot hang.
      }
    });
  }

  return {
    port: bound,
    ask,
    /** Tell the window itself to do something — Swift handles these. */
    window: (what, extra = {}) => send({ t: "window", do: what, ...extra }),
    /** Replace the crew's code in the live page, no download. */
    reload: (source) => send({ t: "agent", source }),
    connected: () => Boolean(socket && socket.readyState === 1),
    close: async () => {
      for (const { resolve, timer } of waiting.values()) { clearTimeout(timer); resolve({ ok: false, error: "closing" }); }
      waiting.clear();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
    },
  };
}
