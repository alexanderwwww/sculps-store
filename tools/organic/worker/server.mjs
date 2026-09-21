/**
 * The window's side of the worker: one HTTP page and one WebSocket.
 *
 * Bound to 127.0.0.1 only. The launcher hands the port in ORGANIC_PORT and
 * reads "PORT n" from stdout — the first and only line stdout ever carries;
 * everything else goes to stderr. Without ORGANIC_PORT a free port is taken.
 *
 * The page is ui/index.html and nothing else is served. Messages from the
 * window are checked for shape before they reach anything that touches a
 * page: an unknown type, an unknown screen id or a non-finite number is
 * dropped, not forwarded.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { IDS } from "./screens.mjs";

const TYPES = new Set(["focus", "mouse", "key", "ok", "connect", "stop", "pause", "resume"]);
const MOUSE = new Set(["move", "down", "up", "wheel"]);
const KEY = new Set(["down", "up", "char"]);
const PLATFORMS = new Set(["instagram", "tiktok", "youtube"]);

const num = (v, lo = -Infinity, hi = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};

/** The message as the worker will act on it, or null. */
export function validate(raw) {
  let m;
  try { m = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
  if (!m || typeof m !== "object" || !TYPES.has(m.t)) return null;
  switch (m.t) {
    case "focus":
      if (m.id != null && !IDS.includes(m.id)) return null;
      return { t: "focus", id: m.id == null ? null : m.id };
    case "mouse": {
      if (!IDS.includes(m.id) || !MOUSE.has(m.kind)) return null;
      const x = num(m.x, 0, 1), y = num(m.y, 0, 1);
      if (x === null || y === null) return null;
      return {
        t: "mouse", id: m.id, kind: m.kind, x, y,
        button: num(m.button, 0, 2) ?? 0, buttons: num(m.buttons, 0, 31) ?? 0, clicks: num(m.clicks, 1, 3) ?? 1,
        dx: num(m.dx, -4000, 4000) ?? 0, dy: num(m.dy, -4000, 4000) ?? 0, modifiers: num(m.modifiers, 0, 15) ?? 0,
      };
    }
    case "key": {
      if (!IDS.includes(m.id) || !KEY.has(m.kind)) return null;
      const key = typeof m.key === "string" ? m.key.slice(0, 32) : "";
      const code = typeof m.code === "string" ? m.code.slice(0, 32) : "";
      const text = typeof m.text === "string" ? m.text.slice(0, 8) : "";
      return { t: "key", id: m.id, kind: m.kind, key, code, text, modifiers: num(m.modifiers, 0, 15) ?? 0 };
    }
    case "connect":
      return PLATFORMS.has(m.platform) ? { t: "connect", platform: m.platform } : null;
    default:
      return { t: m.t };
  }
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => { server.off("error", reject); resolve(server.address().port); });
  });
}

/**
 * Start it. `onMessage(msg, ws)` gets every valid client message; `state()`
 * returns the current state message for a window that just connected.
 */
export async function startServer({ dir, port = process.env.ORGANIC_PORT, onMessage = () => {}, state = () => null, recent = () => [], hello = () => [] } = {}) {
  const uiPath = join(dir, "ui", "index.html");
  const server = http.createServer(async (req, res) => {
    const path = (req.url || "/").split("?")[0];
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      try {
        const html = await readFile(uiPath);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(html);
      } catch (e) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("ui/index.html is missing: " + e.message);
      }
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not here");
  });

  const wanted = port != null && String(port).trim() !== "" ? Number(port) : null;
  if (wanted !== null && (!Number.isInteger(wanted) || wanted < 1 || wanted > 65535)) throw new Error(`ORGANIC_PORT is not a port: ${port}`);
  let bound = null;
  if (wanted) {
    // After an exit-75 restart the old worker may still be letting go of it.
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < 10000) {
      try { bound = await listen(server, wanted, "127.0.0.1"); break; } catch (e) { last = e; await new Promise((r) => setTimeout(r, 250)); }
    }
    if (bound === null) throw new Error(`port ${wanted} stayed busy: ${last?.message ?? "unknown"}`);
  } else {
    bound = await listen(server, 0, "127.0.0.1");
  }
  // The one line stdout carries. The launcher reads it.
  process.stdout.write(`PORT ${bound}\n`);

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    if ((req.url || "").split("?")[0] !== "/ws") { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  const clients = new Set();
  const send = (ws, obj) => {
    if (ws.readyState !== ws.OPEN) return false;
    try { ws.send(typeof obj === "string" ? obj : JSON.stringify(obj)); return true; } catch { return false; }
  };
  const broadcast = (obj) => {
    const text = typeof obj === "string" ? obj : JSON.stringify(obj);
    let n = 0;
    for (const ws of clients) if (send(ws, text)) n++;
    return n;
  };

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
    ws.on("message", (data) => {
      const msg = validate(String(data));
      if (!msg) return;
      try {
        const r = onMessage(msg, ws);
        if (r && typeof r.catch === "function") r.catch(() => {});
      } catch { /* a handler's problem */ }
    });
    const st = state();
    if (st) send(ws, st);
    for (const line of recent()) send(ws, line);
    for (const extra of hello()) if (extra) send(ws, extra);
  });

  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (ws.__dead) { ws.terminate(); clients.delete(ws); continue; }
      ws.__dead = true;
      ws.ping?.(() => {});
    }
  }, 15000);
  wss.on("connection", (ws) => ws.on("pong", () => { ws.__dead = false; }));

  return {
    port: bound,
    broadcast,
    send,
    clients: () => clients.size,
    /** Frames are large; only send them when a window is open. */
    hasClients: () => clients.size > 0,
    async close() {
      clearInterval(heartbeat);
      for (const ws of clients) { try { ws.close(); } catch { /* gone */ } }
      await new Promise((r) => wss.close(() => r()));
      await new Promise((r) => server.close(() => r()));
    },
  };
}
