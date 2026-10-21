/**
 * REAL follows symbiot (build 48, Alex 2026-10-21: "when symbiot sees a coin moving like Kimchi,
 * real money goes in"). Pure.
 *
 * Symbiot (scalp.mjs) holds a fake position in nearly every new coin and reprices each one every
 * few seconds; each reprice reaches the real trader as onMove({row, cs, sim: {entry, last, move},
 * nowMs}). The real trader follows a sim position into the same coin when ALL of these hold:
 *   - the sim position is up >= minMove (+30%) since symbiot's own entry
 *   - the coin's market cap >= minMc (100k USD): row.mc / market_cap / usd_market_cap when GMGN
 *     sent one, else the last close of the 1m candles (GMGN's token_mcap_candles are market cap)
 *   - still rising: the last candle is green (close > open)
 * R2 real.json can only make it stricter: runnerMove and runnerMinMc are floored at the defaults.
 */
export const FOLLOW = Object.freeze({ minMc: 100_000, minMove: 0.30 });

const num = (x) => (x === null || x === undefined || x === "" ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const pc = (x) => Math.round(x * 100);

/** The market cap of a coin: the row's own number first, else the mcap candles' last close. */
export function mcOf(row, cs) {
  for (const k of ["mc", "market_cap", "usd_market_cap", "mcap", "marketCap"]) { const v = num(row && row[k]); if (v > 0) return { mc: v, from: `row.${k}` }; }
  const L = Array.isArray(cs) && cs.length ? cs[cs.length - 1] : null;
  const c = L ? num(L.c) : null;
  return c > 0 ? { mc: c, from: "candles" } : { mc: null, from: null };
}

/** Thresholds after R2: never looser than FOLLOW. */
export function followCfg(cfg = {}) {
  const c = cfg && !cfg.error ? cfg : {};
  return { minMc: Math.max(FOLLOW.minMc, num(c.runnerMinMc) || 0), minMove: Math.max(FOLLOW.minMove, num(c.runnerMove) || 0) };
}

/** onMove event -> {ok, why, mc, move, symbol}. why names the failed test, or the follow line. */
export function followSignal(ev, cfg = {}) {
  const k = followCfg(cfg);
  const no = (why, x = {}) => ({ ok: false, why, ...x });
  const sim = ev && ev.sim, cs = ev && Array.isArray(ev.cs) ? ev.cs : null, sym = ev && ev.row ? ev.row.s : "?";
  if (!sim || !(num(sim.entry) > 0) || !(num(sim.last) > 0)) return no("no sim position");
  if (!cs || !cs.length) return no("no candles");
  const move = sim.last / sim.entry - 1;
  if (!(move >= k.minMove - 1e-12)) return no(`sim +${pc(move)}% under +${pc(k.minMove)}%`, { move });
  const { mc, from } = mcOf(ev.row, cs);
  if (!(mc >= k.minMc)) return no(mc ? `mc $${Math.round(mc / 1000)}k under $${Math.round(k.minMc / 1000)}k` : "market cap unknown", { move, mc });
  const L = cs[cs.length - 1];
  if (!(num(L.c) > num(L.o))) return no("not rising on the last candle", { move, mc });
  return { ok: true, move, mc, mcFrom: from, symbol: sym, why: `REAL follows symbiot · ${sym} +${pc(move)}% in sim · mc $${Math.round(mc / 1000)}k` };
}

/** At the click: the coin is still at or above the market-cap floor. */
export function stillRunning(cs, cfg = {}) {
  const k = followCfg(cfg);
  const L = Array.isArray(cs) && cs.length ? cs[cs.length - 1] : null;
  const c = L ? num(L.c) : null;
  return c >= k.minMc ? { ok: true } : { ok: false, why: c ? `mc $${Math.round(c / 1000)}k under $${Math.round(k.minMc / 1000)}k` : "no price" };
}
