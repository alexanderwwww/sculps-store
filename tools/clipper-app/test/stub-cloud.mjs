/*
 * The control plane, in-process: the same routes and behaviour as
 * app/routes/research.$.tsx (GET hunt/order/runtime/skills; order is
 * read-once; POST status/log/report). Every call is recorded. The test
 * drives it directly (stub.set("hunt", …)) and serves runtime files from
 * /files/<name>.
 */
import http from "node:http";

export const KEY = "TESTKEY";

export function startStub() {
  const slots = { hunt: null, order: null, runtime: null, skills: null };
  const calls = [];
  const statuses = [];
  const logs = [];
  const reports = [];
  const files = {};
  let concurrentLogPosts = 0, maxConcurrentLogPosts = 0, logPosts = 0, maxLinesPerPost = 0;

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const json = (v, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
    if (u.pathname.startsWith("/files/")) {
      const name = decodeURIComponent(u.pathname.slice(7));
      if (!(name in files)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end(files[name]);
    }
    const m = new RegExp(`^/research/${KEY}/([a-z]+)$`).exec(u.pathname);
    if (!m) { res.writeHead(404); return res.end("no"); }
    const what = m[1];
    let body = "";
    for await (const c of req) body += c;
    calls.push({ method: req.method, what, at: Date.now() });
    if (req.method === "GET") {
      if (!(what in slots)) return json(null);
      const v = slots[what];
      if (what === "order" && v) slots.order = null;
      return json(v ?? null);
    }
    let b = {};
    try { b = JSON.parse(body || "{}"); } catch { return json({ ok: false }, 400); }
    if (what === "status") { statuses.push({ at: Date.now(), ...b }); return json({ ok: true }); }
    if (what === "log") {
      concurrentLogPosts++; logPosts++;
      maxConcurrentLogPosts = Math.max(maxConcurrentLogPosts, concurrentLogPosts);
      const lines = Array.isArray(b.lines) ? b.lines : [];
      maxLinesPerPost = Math.max(maxLinesPerPost, lines.length);
      await new Promise((r) => setTimeout(r, 40)); // a read-modify-write takes time
      logs.push(...lines);
      concurrentLogPosts--;
      return json({ ok: true });
    }
    if (what === "report") { reports.push({ at: Date.now(), ...b }); return json({ ok: true }); }
    json({ ok: false }, 404);
  });

  return {
    server,
    set: (slot, v) => { slots[slot] = v; },
    files,
    calls, statuses, logs, reports,
    get logStats() { return { posts: logPosts, maxConcurrent: maxConcurrentLogPosts, maxLines: maxLinesPerPost }; },
  };
}
