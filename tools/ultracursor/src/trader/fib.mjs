/*
 * The gmgn-fib plan as pure numbers (.claude/skills/gmgn-fib/SKILL.md).
 * No I/O here: everything is testable with plain arrays.
 *
 * Candles are {t (ms open time), o, h, l, c, v}. GMGN's candles are market-cap
 * candles, not price candles; every level here is a ratio of the swing, so the
 * same code works for either (market cap = price x fixed supply).
 */

export const PHI = 1.618;
export const PLAN = {
  entryRetrace: 0.618,      // buy at the 0.618 retracement of the last impulse
  stopRetrace: 0.786,       // stop just under the 0.786 retracement
  stopBuffer: 0.01,         // "under": 1% below the 0.786 level
  tp: [1, 1.272, 1.618],    // swing high, 1.272 and 1.618 extensions
  tpSell: [0.382, 0.382, 0.236],
  timeStopMs: 21 * 60_000,  // no TP1 within 21 minutes -> sell
  costRoundTrip: 0.06,      // 6% round trip, charged half on entry, half on exit
  f0: 0.236, fMin: 0.146, fMax: 0.382,
  dayTarget: 0.618, dayStop: -0.382,
  maxOpen: 3,               // Alex 2026-10-19: up to 3 open at once (was 2)
  maxExposure: 0.618,       // sum of open position sizes <= 61.8% of the wallet
  minImpulse: 1.5,          // swing high must be >= 1.5x the swing low to count as an impulse
  lookback: 90,             // candles searched for the swing
  confirmBars: 2,           // the high needs this many closed candles after it
  setupTtlMs: 21 * 60_000,  // an unfilled entry order is dropped after 21 minutes
};

/** Fibonacci levels of the impulse low -> high. */
export function levels(low, high, plan = PLAN) {
  if (!(high > low && low > 0)) throw new Error(`bad swing ${low} -> ${high}`);
  const r = high - low;
  const at = (x) => high - x * r;            // retracement
  const ext = (x) => low + x * r;            // extension
  return {
    low, high,
    entry: at(plan.entryRetrace),
    r786: at(plan.stopRetrace),
    stop: at(plan.stopRetrace) * (1 - plan.stopBuffer),
    tps: plan.tp.map(ext),
  };
}

/** Percent moves from the entry, for the report and the skill table. */
export function movesFromEntry(lv) {
  const pct = (x) => x / lv.entry - 1;
  return { stop: pct(lv.stop), tps: lv.tps.map(pct) };
}

/**
 * The last impulse swing in closed candles: the highest high in the lookback
 * (confirmed by `confirmBars` candles after it that did not exceed it), and the
 * lowest low before it. Returns null when there is no impulse worth trading.
 */
export function findSwing(candles, plan = PLAN) {
  const cs = candles.slice(-plan.lookback);
  if (cs.length < plan.confirmBars + 3) return null;
  let hi = -1;
  for (let i = 0; i < cs.length; i++) if (hi < 0 || cs[i].h > cs[hi].h) hi = i;
  if (cs.length - 1 - hi < plan.confirmBars) return null;      // high not confirmed yet
  let lo = -1;
  for (let i = 0; i < hi; i++) if (lo < 0 || cs[i].l < cs[lo].l) lo = i;
  if (lo < 0) return null;
  const low = cs[lo].l, high = cs[hi].h;
  if (!(low > 0) || high / low < plan.minImpulse) return null;
  // already through the stop level after the high -> the swing is broken
  const lv = levels(low, high, plan);
  for (let i = hi + 1; i < cs.length; i++) if (cs[i].l <= lv.stop) return null;
  return { low, high, lowT: cs[lo].t, highT: cs[hi].t, ...lv };
}

/** Golden-ratio sizing: next fraction of equity after a result. */
export function nextFraction(f, won, plan = PLAN) {
  const n = won ? f * PHI : f / PHI;
  return Math.min(plan.fMax, Math.max(plan.fMin, n));
}

/** Expected value per $1 risked-notional, given win rate p and the average win/loss (fractions, after costs). */
export function ev(p, avgWin, avgLoss) {
  return p * avgWin - (1 - p) * avgLoss;
}
/** Win rate at which ev = 0. */
export function breakEven(avgWin, avgLoss) {
  return avgLoss / (avgWin + avgLoss);
}

/** Day state: 'target' / 'stop' / null for equity vs the day's opening equity. */
export function dayStop(startEquity, equity, plan = PLAN) {
  const r = equity / startEquity - 1;
  if (r >= plan.dayTarget - 1e-12) return "target";
  if (r <= plan.dayStop + 1e-12) return "stop";
  return null;
}

/** The skill's 10-day table: start x 1.618^green x 0.618^red. */
export function daysProjection(start, green, red, plan = PLAN) {
  return start * Math.pow(1 + plan.dayTarget, green) * Math.pow(1 + plan.dayStop, red);
}

/**
 * Size of a new entry: f x equity, cut down so the open total stays within
 * maxExposure x equity; skipped when what fits is under the fMin floor.
 */
export function sizeEntry({ f, equity, cash, openNotional, plan = PLAN }) {
  const want = f * equity;
  // equity after this entry's own 3% cost: open + n <= cap x (equity - n x cost/2)
  const room = (plan.maxExposure * equity - openNotional) / (1 + plan.maxExposure * plan.costRoundTrip / 2);
  const n = Math.min(want, room, cash);
  if (n < plan.fMin * equity - 1e-9) return { ok: false, notional: 0, reason: `exposure cap: only ${(Math.max(0, n) / equity * 100).toFixed(1)}% fits under ${plan.maxExposure * 100}%, below the ${plan.fMin * 100}% floor` };
  return { ok: true, notional: n, capped: n < want - 1e-9 };
}
