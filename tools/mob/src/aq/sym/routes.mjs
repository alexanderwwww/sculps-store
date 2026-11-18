// SYMBIOTE routes (/api/aq/sym/*). Admin session or bearer MOB_API_TOKEN for everything; the probe also takes the header
// x-sym-probe-key when the Worker has SYM_PROBE_KEY (set only on a preview version, never in production).
// Reads come from the database, so the screen works whether the Durable Object is up or not. PAPER only.
import { db } from "../../db.mjs";
import { safeEqual } from "../../auth.mjs";
import { probe, planEvidence } from "./probe.mjs";
import { LANES, WALLET_SOL, HEALTH } from "./rules.mjs";

const n = (v) => (v == null ? null : Number(v));
export const symStub = (env) => env.SYMBIOTE.get(env.SYMBIOTE.idFromName("main"));

// every count is a real count(*) or sum from its own table; the label names the table it came from
export async function sources(d) {
  const one = async (label, table, sql) => { try { const r = await d.one(sql); return { label, table, n: n(r?.n) }; } catch (e) { return { label, table, n: null, error: String(e.message || e).slice(0, 120) }; } };
  return Promise.all([
    one("brain records (all)", "mob_aq_brain", `SELECT count(*) n FROM mob_aq_brain`),
    one("symbiote lessons", "mob_aq_brain", `SELECT count(*) n FROM mob_aq_brain WHERE dept = 'symbiote'`),
    one("launches seen", "mob_aq_sym_coins", `SELECT count(*) n FROM mob_aq_sym_coins`),
    one("symbiote paper trades", "mob_aq_sym_trades", `SELECT count(*) n FROM mob_aq_sym_trades`),
    one("missed coins (with reason)", "mob_aq_sym_missed", `SELECT count(*) n FROM mob_aq_sym_missed`),
    one("right calls", "mob_aq_sym_right", `SELECT count(*) n FROM mob_aq_sym_right WHERE status = 'candidate'`),
    one("fake pumps", "mob_aq_sym_right", `SELECT count(*) n FROM mob_aq_sym_right WHERE status = 'fake_pump'`),
    one("GTA price minutes", "mob_aq_sym_gta", `SELECT count(*) n FROM mob_aq_sym_gta`),
    one("main paper book trades", "mob_aq_trades", `SELECT count(*) n FROM mob_aq_trades`),
    one("training arena trades", "mob_aq_arena_agg", `SELECT COALESCE(sum(n), 0) n FROM mob_aq_arena_agg`),
    one("chart paper trades", "mob_aq_chart_paper", `SELECT count(*) n FROM mob_aq_chart_paper`),
    one("council votes", "mob_aq_votes", `SELECT count(*) n FROM mob_aq_votes`),
    one("live orders (real)", "mob_aq_live_orders", `SELECT count(*) n FROM mob_aq_live_orders`),
  ]);
}

export async function symState(env) {
  const d = db(env);
  const [live, lanes, missed, right, gta, recent, src] = await Promise.all([
    d.one(`SELECT v, at FROM mob_aq_sym_stats WHERE k = 'live'`).catch(() => null),
    d.q(`SELECT lane, count(*) n, count(*) FILTER (WHERE net_pct > 0) wins, COALESCE(sum((proceeds_sol - cost_sol) * CASE WHEN cost_sol > 0 THEN 1 / cost_sol ELSE 0 END), 0) pnl_sol, avg(net_pct) avg_pct FROM mob_aq_sym_trades GROUP BY lane`).catch(() => []),
    d.q(`SELECT reason, count(*) n FROM mob_aq_sym_missed GROUP BY reason ORDER BY n DESC LIMIT 6`).catch(() => []),
    d.q(`SELECT mint, symbol, lane, status, gain_pct, flagged_at, checks->'failed' failed FROM mob_aq_sym_right ORDER BY flagged_at DESC LIMIT 30`).catch(() => []),
    d.q(`SELECT c.mint, c.symbol, c.name, c.created_at, c.last, c.hi, c.px0, c.done, c.end_reason, (SELECT count(*) FROM mob_aq_sym_gta g WHERE g.mint = c.mint) minutes FROM mob_aq_sym_coins c WHERE c.gta ORDER BY c.created_at DESC LIMIT 40`).catch(() => []),
    d.q(`SELECT mint, symbol, lane, net_pct, exit, exit_at FROM mob_aq_sym_trades ORDER BY id DESC LIMIT 20`).catch(() => []),
    sources(d),
  ]);
  const L = Object.fromEntries(Object.keys(LANES).map((l) => { const r = lanes.find((x) => x.lane === l); return [l, { walletSol: WALLET_SOL + (r ? n(r.pnl_sol) : 0), trades: r ? n(r.n) : 0, wins: r ? n(r.wins) : 0, avgPct: r ? n(r.avg_pct) : null }]; }));
  const v = live?.v || null, ageS = live ? (Date.now() - new Date(live.at).getTime()) / 1000 : null;
  return { paper: true, running: ageS != null && ageS < 30, updatedAt: live?.at || null, live: v, lanes: L, missedReasons: missed.map((r) => ({ reason: r.reason, n: n(r.n) })),
    right: right.map((r) => ({ ...r, gain_pct: n(r.gain_pct) })), gta, recent, sources: src, health: HEALTH };
}

export async function symApi(req, env, url, path, { json, apiErr, admin, bearer }) {
  const M = req.method;
  if (path === "/api/aq/sym/probe") {
    const pk = req.headers.get("x-sym-probe-key") || "";
    if (!(admin || bearer || (env.SYM_PROBE_KEY && pk && safeEqual(pk, env.SYM_PROBE_KEY)))) return apiErr(401, "unauthorized", "Admin session or bearer MOB_API_TOKEN required");
    if (url.searchParams.get("src") === "plan") return json(await planEvidence(env));
    const srcs = (url.searchParams.get("src") || "helius").split(",").filter((s) => ["helius", "public", "program"].includes(s));
    return json(await probe(env, { secs: url.searchParams.get("secs"), sources: srcs.length ? srcs : ["helius"] }));
  }
  if (!(admin || bearer)) return apiErr(401, "unauthorized", "Admin session or bearer MOB_API_TOKEN required");
  if (path === "/api/aq/sym/state" && M === "GET") return json(await symState(env));
  if (path === "/api/aq/sym/sources" && M === "GET") return json({ sources: await sources(db(env)) });
  if (path === "/api/aq/sym/brain" && M === "GET") {
    const after = Number(url.searchParams.get("after") || 0) || 0;
    const rows = await db(env).q(after ? `SELECT id, at, dept, kind, text, data FROM mob_aq_brain WHERE id > $1 ORDER BY id ASC LIMIT 40` : `SELECT * FROM (SELECT id, at, dept, kind, text, data FROM mob_aq_brain ORDER BY id DESC LIMIT 12) x ORDER BY id ASC`, after ? [after] : []);
    return json({ rows });
  }
  if (path === "/api/aq/sym/source" && M === "POST") {
    if (!admin && !bearer) return apiErr(401, "unauthorized", "admin");
    if (!env.SYMBIOTE) return apiErr(503, "unavailable", "the symbiote Durable Object is not bound on this Worker");
    const b = await req.json().catch(() => ({}));
    const r = await symStub(env).fetch("https://symbiote/config", { method: "POST", body: JSON.stringify({ source: b.source }) });
    return json(await r.json(), r.status);
  }
  if (path === "/api/aq/sym/status" && M === "GET") {
    if (!env.SYMBIOTE) return apiErr(503, "unavailable", "the symbiote Durable Object is not bound on this Worker");
    return json(await (await symStub(env).fetch("https://symbiote/status")).json());
  }
  return apiErr(404, "not_found", "unknown symbiote route");
}

// the minute timer keeps the object alive and connected (it reconnects itself; this only wakes it after an eviction)
export async function symWake(env) { if (!env.SYMBIOTE) return { off: "no binding" }; const r = await symStub(env).fetch("https://symbiote/ensure"); const s = await r.json(); return { coverage: s.coverage?.pct ?? null, perSec: s.perSec }; }
