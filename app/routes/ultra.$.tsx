/**
 * Ultra's link: the trader on Alex's Mac says what it is doing, and takes orders back.
 *
 *   POST /ultra/<key>/status   Ultra, every 10 s: running, wallet, open, closed, why-not, events, errors
 *   GET  /ultra/<key>/status   what Claude reads
 *   POST /ultra/<key>/order    Claude: {cmd:"pause"|"resume"|"flatten"} or {cmd:"set", cfg:{...safe keys}}
 *   GET  /ultra/<key>/order    Ultra asking; an order is read once and cleared
 *   POST /ultra/<key>/log      Ultra's buffered lines;  GET /ultra/<key>/log  reads them
 *
 * The key in the path is the whole of the authentication (same as /research). Nothing secret is ever sent: no keys, no
 * wallet secrets. Orders cannot raise any money limit; "set" only touches the strategy numbers listed below.
 */
import type { Route } from "./+types/ultra.$";

const KEY = "YFu9uEm3fUwr928Yn70Qov73wVWbEZj";
const FILES = { status: "ul-status.json", order: "ul-order.json", log: "ul-log.json" } as const;
type Slot = keyof typeof FILES;
type Env = { MEDIA: R2Bucket };
const CMDS = ["pause", "resume", "flatten", "set"];
const SAFE = ["minAgeMin", "maxAgeMin", "breakoutLookback", "volSpike", "minGreen", "minLiqUsd", "sl", "tp", "trailFrom", "trail", "maxHoldMin", "cooldownMin", "maxChase", "minBuyShare", "edgeMinN", "edgeFloor"];

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });
async function read(env: Env, slot: Slot) { const o = await env.MEDIA?.get(FILES[slot]); if (!o) return null; try { return JSON.parse(await o.text()); } catch { return null; } }
async function write(env: Env, slot: Slot, v: unknown) { await env.MEDIA?.put(FILES[slot], JSON.stringify(v), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } }); }

export async function loader({ params, context }: Route.LoaderArgs) {
  const parts = (params["*"] ?? "").split("/").filter(Boolean);
  if (parts[0] !== KEY) return new Response("no", { status: 404 });
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
