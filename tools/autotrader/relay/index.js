// ultra-relay: forwards Ultra's read/build calls to Jupiter and RugCheck when Alex's network breaks TLS to them.
// No keys pass through here: Jupiter returns an UNSIGNED transaction; Ultra signs it on the Mac.
const HOSTS = { jup: "https://lite-api.jup.ag", rug: "https://api.rugcheck.xyz" };
const ALLOW = { jup: /^\/(swap\/v1\/(quote|swap)|tokens\/v2\/)/, rug: /^\/v1\/tokens\/[1-9A-HJ-NP-Za-km-z]{32,44}\/report(\/summary)?$/ };
export default {
  async fetch(req) {
    const u = new URL(req.url); const m = u.pathname.match(/^\/(jup|rug)(\/.*)$/);
    if (!m || !ALLOW[m[1]].test(m[2]) || !["GET", "POST"].includes(req.method)) return new Response("no", { status: 404 });
    const r = await fetch(HOSTS[m[1]] + m[2] + u.search, { method: req.method, headers: { "content-type": req.headers.get("content-type") || "application/json", accept: "application/json" }, body: req.method === "POST" ? await req.text() : undefined });
    return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
  },
};
