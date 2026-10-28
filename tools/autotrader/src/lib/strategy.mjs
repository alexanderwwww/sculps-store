// The brain. Everything it knows at minute i is in candles[0..i]; nothing from the future.
export const DEFAULTS = {
  minAgeMin: 8, maxAgeMin: 90,      // never the first seconds (snipers own those), never old and stale
  breakoutLookback: 10, volSpike: 3, minGreen: 0.6, // breakout above the last 15 highs, volume 3x, buyers dominate
  minLiqUsd: 4000,
  sl: -0.15, tp: 0.45, trailFrom: 0.22, trail: 0.10, maxHoldMin: 30,
  slippage: 0.015, fee: 0.01,       // each side: 1.5% slip + 1% fee, so a round trip costs ~5%
  stakeFrac: 0.12, maxOpen: 3, cooldownMin: 10,
  edgeMinN: 12, edgeFloor: -0.02,   // live buys pause when the last 20 paper signals average worse than -2% each
};
export function entrySignal(cs, i, cfg = DEFAULTS, meta = {}) {
  const ageMin = (cs[i].t - (meta.created ?? cs[0].t)) / 60000;
  if (ageMin < cfg.minAgeMin) return { ok: false, why: `age ${ageMin.toFixed(0)}m < ${cfg.minAgeMin}` };
  if (ageMin > cfg.maxAgeMin) return { ok: false, why: `age ${ageMin.toFixed(0)}m too old` };
  if (meta.liqUsd != null && meta.liqUsd < cfg.minLiqUsd) return { ok: false, why: `liquidity $${Math.round(meta.liqUsd)}` };
  const L = cfg.breakoutLookback;
  if (i < L + 3) return { ok: false, why: "not enough candles" };
  const prior = cs.slice(i - L - 3, i - 3);
  const hi = Math.max(...prior.map((c) => c.h));
  const vAvg = prior.reduce((s, c) => s + c.v, 0) / prior.length || 1e-9;
  const last3 = cs.slice(i - 2, i + 1);
  const v3 = last3.reduce((s, c) => s + c.v, 0) / 3;
  const green = last3.filter((c) => c.c >= c.o).length / 3;
  if (!(cs[i].c > hi)) return { ok: false, why: "no breakout" };
  if (v3 < cfg.volSpike * vAvg) return { ok: false, why: `volume ${(v3 / vAvg).toFixed(1)}x` };
  if (green < cfg.minGreen) return { ok: false, why: "sellers on the tape" };
  return { ok: true, why: `breakout over ${L}m high, volume ${(v3 / vAvg).toFixed(1)}x, ${Math.round(green * 100)}% green` };
}
/** Walk candles forward from entry; the first rule that fires wins. Conservative intra-candle order: stop before target. */
export function managePosition(cs, i0, cfg = DEFAULTS) {
  const entry = cs[i0].c * (1 + cfg.slippage);
  let peak = entry;
  for (let j = i0 + 1; j < cs.length; j++) {
    const c = cs[j];
    if (c.l <= entry * (1 + cfg.sl)) return exit(j, entry * (1 + cfg.sl), `stop ${cfg.sl * 100}%`);
    if (peak >= entry * (1 + cfg.trailFrom) && c.l <= peak * (1 - cfg.trail)) return exit(j, peak * (1 - cfg.trail), `trailing stop from +${Math.round((peak / entry - 1) * 100)}%`);
    if (c.h >= entry * (1 + cfg.tp)) return exit(j, entry * (1 + cfg.tp), `take profit +${cfg.tp * 100}%`);
    peak = Math.max(peak, c.h);
    if ((c.t - cs[i0].t) / 60000 >= cfg.maxHoldMin) return exit(j, c.c, "time stop");
  }
  const j = cs.length - 1;
  return { ...exit(j, cs[j].c, "end of data"), open: true };      // no rule has fired yet
  function exit(j, px, why) {
    const out = px * (1 - cfg.slippage);
    return { j, exitPx: out, entryPx: entry, ret: out / entry - 1 - 2 * cfg.fee, why, peak };
  }
}
