/**
 * The runner signal (build 48, Alex 2026-10-21: "when symbiot sees a coin moving like Kimchi,
 * real money goes in"). Pure.
 *
 * A pick (scalp.mjs onPick: {row, cs, ...}) is a runner when ALL of these hold:
 *   - market cap >= minMc (100k USD): row.mc / market_cap / usd_market_cap when GMGN sent one,
 *     else the last close of the 1m candles (GMGN's token_mcap_candles are market-cap candles)
 *   - the last 5 one-minute candles moved >= move5m (+30%): last close over the open 5 candles back
 *   - the last candle is green (close > open)
 *   - its volume is >= 2x the average volume of the 10 candles before it
 * R2 real.json can only make it stricter: runnerMinMc and runnerMove5m are floored at the defaults.
 */
export const RUNNER = Object.freeze({ minMc: 100_000, move5m: 0.30, volX: 2, volN: 10, moveN: 5 });

const num = (x) => (x === null || x === undefined || x === "" ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const pc = (x) => Math.round(x * 100);

/** The market cap of a pick: the row's own number first, else the mcap candles' last close. */
export function mcOf(row, cs) {
  for (const k of ["mc", "market_cap", "usd_market_cap", "mcap", "marketCap"]) { const v = num(row && row[k]); if (v > 0) return { mc: v, from: `row.${k}` }; }
  const L = Array.isArray(cs) && cs.length ? cs[cs.length - 1] : null;
  const c = L ? num(L.c) : null;
  return c > 0 ? { mc: c, from: "candles" } : { mc: null, from: null };
}

/** Thresholds after R2: never looser than RUNNER. */
export function runnerCfg(cfg = {}) {
  const c = cfg && !cfg.error ? cfg : {};
  return {
    minMc: Math.max(RUNNER.minMc, num(c.runnerMinMc) || 0),
    move5m: Math.max(RUNNER.move5m, num(c.runnerMove5m) || 0),
    volX: RUNNER.volX,
  };
}

/** pick -> {ok, why, mc, move5, volX}. why always says which test failed or what the run is. */
export function runnerSignal(pick, cfg = {}) {
  const k = runnerCfg(cfg);
  const no = (why, x = {}) => ({ ok: false, why, ...x });
  const cs = pick && Array.isArray(pick.cs) ? pick.cs : null;
  if (!cs || cs.length < RUNNER.volN + 1) return no(`only ${cs ? cs.length : 0} candles`);   // 10 before + the last
  const { mc, from } = mcOf(pick.row, cs);
  if (!(mc >= k.minMc)) return no(mc ? `mc $${Math.round(mc / 1000)}k under $${Math.round(k.minMc / 1000)}k` : "market cap unknown", { mc });
  const L = cs[cs.length - 1], first = cs[cs.length - RUNNER.moveN];
  const o5 = num(first.o) > 0 ? num(first.o) : num(first.c), lc = num(L.c), lo = num(L.o);
  if (!(o5 > 0) || !(lc > 0) || !(lo > 0)) return no("bad candles", { mc });
  const move5 = lc / o5 - 1;
  if (!(move5 >= k.move5m - 1e-12)) return no(`5 min move +${pc(move5)}% under +${pc(k.move5m)}%`, { mc, move5 });
  if (!(lc > lo)) return no("the last candle is not green", { mc, move5 });
  const prev = cs.slice(-1 - RUNNER.volN, -1).map((x) => num(x.v) || 0);
  const avg = prev.reduce((s, v) => s + v, 0) / prev.length;
  const lv = num(L.v) || 0;
  const volX = avg > 0 ? lv / avg : lv > 0 ? Infinity : 0;
  if (!(avg > 0) || !(volX >= k.volX - 1e-12)) return no(`last volume ${Number.isFinite(volX) ? volX.toFixed(1) : "?"}x the 10 before, needs ${k.volX}x`, { mc, move5, volX });
  return { ok: true, mc, mcFrom: from, move5, volX, why: `runner: mc $${Math.round(mc / 1000)}k, +${pc(move5)}% in 5 min, volume ${volX.toFixed(1)}x` };
}
