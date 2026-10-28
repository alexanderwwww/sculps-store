// node backtest.mjs [--pages 3] [--noRug] [--cache data/pools.json]
// Replays the strategy over real minute candles of real Solana pools. Every trade carries its reason.
import fs from "node:fs";
import { trendingPools, newPools, candles, } from "./src/lib/gecko.mjs";
import { getJson } from "./src/lib/net.mjs";
import { rugCheck } from "./src/lib/rug.mjs";
import { DEFAULTS, entrySignal, managePosition } from "./src/lib/strategy.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : (process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] == null ? true : process.argv[i + 1]); };
const pages = Number(arg("pages", 3)), useRug = !arg("noRug", false), cacheFile = arg("cache", "data/pools.json");

async function collect() {
  if (fs.existsSync(cacheFile) && !arg("fresh", false)) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  const seen = new Map();
  for (let p = 1; p <= pages; p++) for (const x of await trendingPools(p)) seen.set(x.pool, x);
  for (let p = 1; p <= pages; p++) {
    try {
      const j = await getJson(`https://api.geckoterminal.com/api/v2/networks/solana/pools?page=${p}&sort=h24_volume_usd_desc`);
      for (const x of j.data) { const a = x.attributes; seen.set(a.address, { pool: a.address, name: a.name, mint: x.relationships.base_token.data.id.replace(/^solana_/, ""), dex: x.relationships.dex.data.id, created: Date.parse(a.pool_created_at), liqUsd: Number(a.reserve_in_usd) }); }
    } catch (e) { console.error("pools page", p, e.message); }
  }
  const out = [];
  for (const m of seen.values()) {
    if (!m.created || Date.now() - m.created > 72 * 3600e3) continue;                // only young tokens: that is the game
    try { const cs = await candles(m.pool, { limit: 1000 }); if (cs.length > 60) out.push({ ...m, cs }); } catch (e) { console.error("candles", m.name, e.message.slice(0, 60)); }
  }
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

const cfg = DEFAULTS;
const pools = await collect();
console.log(`pools with history: ${pools.length}`);
const trades = [];
const rugCache = new Map();
for (const m of pools) {
  let nextOk = 0;
  for (let i = 0; i < m.cs.length - 2; i++) {
    if (m.cs[i].t < nextOk) continue;
    const s = entrySignal(m.cs, i, cfg, m);
    if (!s.ok) continue;
    if (useRug) {
      if (!rugCache.has(m.mint)) rugCache.set(m.mint, await rugCheck(m.mint));
      const r = rugCache.get(m.mint);
      if (!r.pass) { trades.push({ name: m.name, at: m.cs[i].t, skipped: true, why: `rug check: ${r.reason}` }); nextOk = m.cs[i].t + 3600e3; continue; }
    }
    const x = managePosition(m.cs, i, cfg);
    trades.push({ name: m.name, mint: m.mint, at: m.cs[i].t, until: m.cs[x.j].t, ret: x.ret, enter: s.why, exit: x.why });
    nextOk = m.cs[x.j].t + cfg.cooldownMin * 60e3;
  }
}
const real = trades.filter((t) => !t.skipped).sort((a, b) => a.at - b.at);
// portfolio: a fraction of CURRENT equity per trade, at most maxOpen at once
let eq = 100, peak = 100, maxDd = 0, open = [], taken = 0, curve = [];
for (const t of real) {
  open = open.filter((o) => o.until > t.at);
  while (open.length && false) {}
  for (const o of open) if (o.until <= t.at) {}
  if (open.length >= cfg.maxOpen) { t.sized = "skipped: maxOpen"; continue; }
  const stake = eq * cfg.stakeFrac;
  // equity is marked at close; stake locked is approximated by sizing off equity at entry
  t.pnl = stake * t.ret; t.sized = stake; open.push(t); taken++;
}
for (const t of real.filter((x) => x.pnl != null).sort((a, b) => a.until - b.until)) { eq += t.pnl; peak = Math.max(peak, eq); maxDd = Math.max(maxDd, 1 - eq / peak); curve.push(eq); }
const took = real.filter((t) => t.pnl != null);
const wins = took.filter((t) => t.ret > 0);
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const summary = {
  pools: pools.length, signals: real.length, skippedByRug: trades.filter((t) => t.skipped).length, tradesTaken: took.length,
  winRate: took.length ? +(wins.length / took.length).toFixed(3) : null,
  avgWin: +avg(wins.map((t) => t.ret)).toFixed(3), avgLoss: +avg(took.filter((t) => t.ret <= 0).map((t) => t.ret)).toFixed(3),
  expectancyPerTrade: +avg(took.map((t) => t.ret)).toFixed(4), startEq: 100, endEq: +eq.toFixed(2), maxDrawdown: +maxDd.toFixed(3),
  costsAssumed: `${cfg.slippage * 100}% slip + ${cfg.fee * 100}% fee each side`,
};
console.log(JSON.stringify(summary, null, 1));
const exits = {}; for (const t of took) { const k = t.exit.replace(/[\d.+-]+%?/g, "#"); exits[k] = (exits[k] || 0) + 1; }
console.log("exits:", exits);
fs.writeFileSync("data/last-backtest.json", JSON.stringify({ summary, trades: real }, null, 1));
