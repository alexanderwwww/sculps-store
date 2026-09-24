/** A control plane for the sourcing desk: a job, decisions, and what it was told. */
import http from "node:http";

export async function deskCloud({ job = () => null, decisions = () => [] } = {}) {
  const got = { shortlist: [], queue: [], answers: [], statuses: [], logs: [] };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      const path = req.url.split("?")[0];
      const json = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o ?? {})); };
      let data = null; try { data = body ? JSON.parse(body) : null; } catch { /* none */ }
      if (path.endsWith("/sourcing")) return json(job());
      if (path.endsWith("/decisions")) return json({ decisions: decisions() });
      if (path.endsWith("/shortlist")) { got.shortlist.push(data); return json({ ok: true }); }
      if (path.endsWith("/queue")) { got.queue.push(data); return json({ ok: true }); }
      if (path.endsWith("/answers")) { got.answers.push(data); return json({ ok: true }); }
      if (path.endsWith("/status")) { got.statuses.push(data); return json({ ok: true }); }
      if (path.endsWith("/log")) { got.logs.push(data); return json({ ok: true }); }
      if (path.endsWith("/order") || path.endsWith("/hunt") || path.endsWith("/runtime")) return json({});
      res.writeHead(404); res.end("nope");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}/research/test`, got, close: () => new Promise((r) => server.close(r)) };
}
