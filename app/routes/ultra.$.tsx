/**
 * Ultra's link: the trader on Alex's Mac says what it is doing, and takes orders back.
 *
 *   POST /ultra/<key>/status   Ultra, every 10 s: running, wallet, open, closed, why-not, events, errors
 *   GET  /ultra/<key>/status   what Claude reads
 *   POST /ultra/<key>/order    Claude: {cmd:"pause"|"resume"|"flatten"} or {cmd:"set", cfg:{...safe keys}}
 *   GET  /ultra/<key>/order    Ultra asking; an order is read once and cleared
 *   POST /ultra/<key>/log      Ultra's buffered lines;  GET /ultra/<key>/log  reads them
 *   GET  /ultra/<key>/runtime  the newest published program files (live updates); never writable through this route
 *
 * The key in the path is the whole of the authentication (same as /research). Nothing secret is ever sent: no keys, no
 * wallet secrets. Orders cannot raise any money limit; "set" only touches the strategy numbers listed below.
 */
import type { Route } from "./+types/ultra.$";

const KEY = "YFu9uEm3fUwr928Yn70Qov73wVWbEZj";
const FILES = { status: "ul-status.json", order: "ul-order.json", log: "ul-log.json", runtime: "ul-runtime.json" } as const;   // runtime: read-only here, written only with Cloudflare credentials (live updates)
type Slot = keyof typeof FILES;
type Env = { MEDIA: R2Bucket };
const CMDS = ["start", "pause", "resume", "flatten", "set"];
const SAFE = ["smart", "fibLo", "fibHi", "fibDeep", "fibMinRun", "fibMinTp", "pullback", "pullMin", "pullMax", "liveMinFlow", "strongVol5", "entryMinLiq", "partAt", "partFrac", "whaleUsd", "loserCoolMin", "liveMinLiq", "lockFrom", "lockAt", "liveMinVol5", "liveBuyRatio", "momSecs", "momMin", "momMax", "staleMin", "staleRet", "nearHigh", "minAgeMin", "maxAgeMin", "breakoutLookback", "volSpike", "minGreen", "minLiqUsd", "sl", "tp", "trailFrom", "trail", "maxHoldMin", "cooldownMin", "maxChase", "minBuyShare", "edgeMinN", "edgeFloor"];

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });
async function read(env: Env, slot: Slot) { const o = await env.MEDIA?.get(FILES[slot]); if (!o) return null; try { return JSON.parse(await o.text()); } catch { return null; } }
async function write(env: Env, slot: Slot, v: unknown) { await env.MEDIA?.put(FILES[slot], JSON.stringify(v), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } }); }


// Relay (2026-11-07): Alex's network answers jup.ag / rugcheck.xyz with a wrong TLS certificate, but reaches this worker.
// Only these read/build paths pass; Jupiter returns an UNSIGNED transaction, so no key ever comes through here.
const RPC_OK = new Set(["getBalance", "getLatestBlockhash", "getBlockHeight", "sendTransaction", "getSignatureStatuses", "getAccountInfo", "getTokenAccountsByOwner", "getTransaction", "getSignaturesForAddress", "getTokenAccountBalance", "simulateTransaction"]);
const RELAY_HOST = { jup: "https://lite-api.jup.ag", rug: "https://api.rugcheck.xyz" } as const;
const RELAY_OK = { jup: /^\/(swap\/v1\/(quote|swap)|tokens\/v2\/)/, rug: /^\/v1\/tokens\/[1-9A-HJ-NP-Za-km-z]{32,44}\/report(\/summary)?$/ } as const;
async function relay(parts: string[], request: Request): Promise<Response | null> {
  if (parts[1] === "rpc" && request.method === "POST") {
    // Solana RPC relay (2026-11-07): publicnode now refuses getTokenAccountsByOwner without a paid token, and the Mac's network
    // breaks TLS to mainnet-beta, so sells could not find the tokens. Read and send methods only; the transaction is already signed on the Mac.
    const body = await request.text(); let m = ""; try { m = String((JSON.parse(body) as { method?: string }).method || ""); } catch { /* bad json */ }
    if (!RPC_OK.has(m)) return new Response("no", { status: 404 });
    let r: Response | null = null;
    for (const u of ["https://api.mainnet.solana.com", "https://api.mainnet-beta.solana.com"]) {
      try { r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body }); const t = await r.clone().text(); if (r.ok && !/blocked|Too Many|upgrade/i.test(t.slice(0, 300))) break; } catch { r = null; }
    }
    if (!r) return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "relay: no RPC answered" } }), { status: 502 });
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  const kind = parts[1] as keyof typeof RELAY_HOST; if (kind !== "jup" && kind !== "rug") return null;
  const path = "/" + parts.slice(2).join("/"); if (!RELAY_OK[kind].test(path)) return new Response("no", { status: 404 });
  const u = new URL(request.url);
  const r = await fetch(RELAY_HOST[kind] + path + u.search, { method: request.method, headers: { "content-type": request.headers.get("content-type") || "application/json", accept: "application/json" }, body: request.method === "POST" ? await request.text() : undefined });
  return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const parts = (params["*"] ?? "").split("/").filter(Boolean);
  if (parts[0] !== KEY) return new Response("no", { status: 404 });
  { const rr = await relay(parts, request); if (rr) return rr; }
  const env = context.cloudflare.env as unknown as Env;
  const what = parts[1] ?? "";
  if (!Object.hasOwn(FILES, what)) return new Response("no", { status: 404 });
  const value = await read(env, what as Slot);
  if (what === "order" && value) await write(env, "order", null);
  return json(value ?? null);
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const parts = (params["*"] ?? "").split("/").filter(Boolean);
  if (parts[0] !== KEY) return new Response("no", { status: 404 });
  const env = context.cloudflare.env as unknown as Env;
  const what = parts[1] ?? "";
  if (request.method === "OPTIONS") return json({ ok: true });
  { const rr = await relay(parts, request); if (rr) return rr; }
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  if (what === "status") { await write(env, "status", { ...body, receivedAt: Date.now() }); return json({ ok: true }); }
  if (what === "log") {
    const cur = ((await read(env, "log")) as { lines?: unknown[] } | null)?.lines ?? [];
    const add = Array.isArray(body.lines) ? body.lines.slice(-50) : [];
    await write(env, "log", { lines: [...cur, ...add].slice(-400) });
    return json({ ok: true });
  }
  if (what === "order") {
    const cmd = String(body.cmd ?? "");
    if (!CMDS.includes(cmd)) return json({ ok: false, error: `orders are: ${CMDS.join(", ")}` }, 400);
    let cfg: Record<string, number> | undefined;
    if (cmd === "set") {
      cfg = {};
      for (const [k, v] of Object.entries((body.cfg ?? {}) as Record<string, unknown>)) {
        if (!SAFE.includes(k) || typeof v !== "number" || !Number.isFinite(v)) return json({ ok: false, error: `not allowed: ${k}` }, 400);
        cfg[k] = v;
      }
    }
    await write(env, "order", { cmd, cfg, at: Date.now() });
    return json({ ok: true });
  }
  return new Response("no", { status: 404 });
}
