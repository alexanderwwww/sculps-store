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
    one("pain (24 h)", "mob_aq_brain", `SELECT count(*) n FROM mob_aq_brain WHERE kind = 'pain' AND at > now() - interval '24 hours'`),
    one("pain (total)", "mob_aq_brain", `SELECT count(*) n FROM mob_aq_brain WHERE kind = 'pain'`),
    one("scars (lessons that changed a rule)", "mob_aq_brain", `SELECT count(*) n FROM mob_aq_brain WHERE kind = 'tournament'`),
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
  const [live, lanes, market, missed, right, gta, recent, src, rst, wal] = await Promise.all([
    d.one(`SELECT v, at FROM mob_aq_sym_stats WHERE k = 'live'`).catch(() => null),
    d.q(`SELECT lane, count(*) n, count(*) FILTER (WHERE net_pct > 0) wins, COALESCE(sum((proceeds_sol - cost_sol) * CASE WHEN cost_sol > 0 THEN 1 / cost_sol ELSE 0 END), 0) pnl_sol, avg(net_pct) avg_pct FROM mob_aq_sym_trades GROUP BY lane`).catch(() => []),
    d.one(`SELECT count(*) FILTER (WHERE (lanes->'market'->>'bought')::boolean) bought, count(*) total, (SELECT count(*) FROM mob_aq_sym_coins WHERE (lanes->'market'->>'bought')::boolean) bought_all, avg(((lanes->'market'->>'peakX')::float8)) FILTER (WHERE done) peak_x, avg(ctrl_pct) FILTER (WHERE done) net FROM mob_aq_sym_coins WHERE created_at > now() - interval '24 hours'`).catch(() => null),
    d.q(`SELECT reason, count(*) n FROM mob_aq_sym_missed GROUP BY reason ORDER BY n DESC LIMIT 6`).catch(() => []),
    d.q(`SELECT mint, symbol, lane, status, gain_pct, flagged_at, checks->'failed' failed FROM mob_aq_sym_right ORDER BY flagged_at DESC LIMIT 30`).catch(() => []),
    d.q(`SELECT c.mint, c.symbol, c.name, c.created_at, c.last, c.hi, c.px0, c.done, c.end_reason, (SELECT count(*) FROM mob_aq_sym_gta g WHERE g.mint = c.mint) minutes FROM mob_aq_sym_coins c WHERE c.gta ORDER BY c.created_at DESC LIMIT 40`).catch(() => []),
    d.q(`SELECT mint, symbol, lane, net_pct, exit, entry_at, exit_at FROM mob_aq_sym_trades ORDER BY id DESC LIMIT 12`).catch(() => []),
    sources(d),
    // 6) what happened AFTER each right call: from the curve price at the flag to the coin's latest price (not the trades that made it)
    d.one(`SELECT count(*) n, count(*) FILTER (WHERE ret > 0) wins, avg(ret) avg, sum(ret) tot FROM (SELECT (c.last / nullif((r.checks->>'flagPx')::float8, 0) - 1) * 100 ret
      FROM mob_aq_sym_right r JOIN mob_aq_sym_coins c ON c.mint = r.mint WHERE r.status IN ('candidate', 'expired') AND (r.checks->>'flagPx') IS NOT NULL AND c.last IS NOT NULL) x`).catch(() => null),
    d.q(`SELECT k, v FROM mob_aq_sym_stats WHERE k LIKE 'wallet:%'`).catch(() => []),
  ]);
  // 5) wallets from the running totals (old trades may be pruned; the totals are not)
  const L = Object.fromEntries(Object.keys(LANES).map((l) => { const r = lanes.find((x) => x.lane === l), w = wal.find((x) => x.k === "wallet:" + l)?.v; return [l, { walletSol: WALLET_SOL + (w ? Number(w.pnl) : 0), trades: w ? Number(w.n) : 0, wins: w ? Number(w.wins) : 0, avgPct: r ? n(r.avg_pct) : null }]; }));
  const v = live?.v || null, ageS = live ? (Date.now() - new Date(live.at).getTime()) / 1000 : null;
  return { rightStats: rst && n(rst.n) ? { trades: n(rst.n), winRate: n(rst.wins) / n(rst.n) * 100, avgPct: n(rst.avg), totalPct: n(rst.tot) } : null, market: market && { boughtAll: n(market.bought_all), bought: n(market.bought), total: n(market.total), avgPeakX: n(market.peak_x), avgNetPct: n(market.net) }, paper: true, running: ageS != null && ageS < 30, updatedAt: live?.at || null, live: v, lanes: L, missedReasons: missed.map((r) => ({ reason: r.reason, n: n(r.n) })),
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
