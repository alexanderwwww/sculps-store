/** A control plane with nothing behind it: answers every endpoint, records db ops. */
import http from "node:http";

export async function cloudStub({ order = () => null, runtime = () => ({ build: 0 }), brief = () => null, signedIn = {} } = {}) {
  const calls = [];
  const logs = [];
  const statuses = [];
  const accounts = new Map();
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      const path = req.url.split("?")[0];
      const json = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      let data = null; try { data = body ? JSON.parse(body) : null; } catch { /* none */ }
      if (path.endsWith("/status")) { statuses.push(data); return json({ ok: true }); }
      if (path.endsWith("/log")) { logs.push(data); return json({ ok: true }); }
      if (path.endsWith("/brief")) return json(brief());
      if (path.endsWith("/order")) return json(order() ?? {});
      if (path.endsWith("/runtime")) return json(runtime());
      if (path.endsWith("/db")) {
        calls.push(data);
        const { op, args } = data ?? {};
        let result = null;
        if (op === "markConnected") { const id = "acc-" + args.platform; accounts.set(id, { id, platform: args.platform, handle: args.handle, connected: true, warmed_days: 0 }); result = accounts.get(id); }
        if (op === "accounts") result = [...accounts.values()];
        if (op === "accountFor") result = [...accounts.values()].find((a) => a.platform === args.platform) ?? null;
        if (op === "personaFor") result = null;
        if (op === "isParked" || op === "knownClip") result = false;
        if (op === "remember" || op === "savePersona" || op === "saveFinding" || op === "saveClip" || op === "act" || op === "seen" || op === "warmedToday" || op === "park") result = { ok: true };
        return json({ ok: true, result });
      }
      res.writeHead(404); res.end("nope");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  return { base: `http://127.0.0.1:${port}/organic/test`, calls, logs, statuses, close: () => new Promise((r) => server.close(r)) };
}
