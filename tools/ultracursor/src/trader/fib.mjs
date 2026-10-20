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

/* ======================================================================
 * Brain v2: Fibonacci at every scale (knowledge-base.md section 7).
 * ====================================================================== */

export const V2 = {
  // entry ladder: share of the position at each retracement of the impulse
  entryLadder: [{ at: 0.5, share: 0.382 }, { at: 0.618, share: 0.382 }, { at: 0.705, share: 0.236 }],
  // exits: 38.2% at T1 (swing high), 38.2% at 1.272, the last 23.6% trails toward 1.618 -> 2.618
  exits: [{ ext: 1, share: 0.382 }, { ext: 1.272, share: 0.382 }],
  trail: [1.618, 2.618],
  checkpointsMin: [3, 5, 8, 13, 21],
  timeframes: [1, 3, 5, 13, 21],     // minutes
  confluenceMin: 2,                   // of the 5 timeframes
  tiers: { watch: 3, ready: 5, fire: 8 },
  pWindows: [13, 21, 34],
  sizeLadder: [0.146, 0.236, 0.382],
  slippageCap: 0.0236,                // a quote losing more than 2.36% to price impact is skipped
  narrativeMin: 61.8,
  sourceAgree: 38.2,                  // each of the two sources must be at least this
  costRule: 3,                        // W >= 3|Λ| after real costs
  regimeDrop: 0.0382,                 // SOL down more than 3.82% over 13 x 5m = stand aside (assumption: a Fibonacci ratio, not set by Alex)
};

/** 1m candles -> n-minute candles aligned to n-minute boundaries. The last bucket may be partial. */
export function resample(candles, n) {
  if (n === 1) return candles.slice();
  const out = [];
  const W = n * 60_000;
  for (const c of candles) {
    const t = Math.floor(c.t / W) * W;
    const b = out[out.length - 1];
    if (b && b.t === t) { b.h = Math.max(b.h, c.h); b.l = Math.min(b.l, c.l); b.c = c.c; b.v += c.v; b.n++; }
    else out.push({ t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, n: 1 });
  }
  return out;
}

/**
 * One timeframe agrees when its own last impulse (low -> high, the high
 * confirmed by one bar) is intact (no close under the 0.786 stop) and price
 * sits in the pullback zone, between the 0.382 and 0.786 retracements.
 * Too few bars = no opinion = does not agree (missing data is a NO).
 */
export function timeframeAgrees(cs) {
  if (cs.length < 4) return { ok: false, why: `only ${cs.length} bars` };
  let hi = 0;
  for (let i = 0; i < cs.length; i++) if (cs[i].h > cs[hi].h) hi = i;
  if (hi === cs.length - 1) return { ok: false, why: "still making the high" };
  let lo = -1;
  for (let i = 0; i < hi; i++) if (lo < 0 || cs[i].l < cs[lo].l) lo = i;
  if (lo < 0) return { ok: false, why: "no low before the high" };
  const low = cs[lo].l, high = cs[hi].h, r = high - low;
  if (!(low > 0 && r > 0)) return { ok: false, why: "flat" };
  const last = cs[cs.length - 1].c;
  const retr = (high - last) / r;
  for (let i = hi + 1; i < cs.length; i++) if (cs[i].c < high - 0.786 * r) return { ok: false, why: "closed under 0.786" };
  const ok = retr >= 0.382 && retr <= 0.786;
  return { ok, why: `retraced ${retr.toFixed(3)}`, retr };
}

/** Multi-timeframe confluence from 1m candles: how many of 1/3/5/13/21m agree. */
export function confluence(c1m, tfs = V2.timeframes) {
  const each = tfs.map((n) => ({ tf: n, ...timeframeAgrees(resample(c1m, n).slice(-89)) }));
  const agree = each.filter((e) => e.ok).length;
  return { agree, of: tfs.length, ok: agree >= V2.confluenceMin, each };
}

/** Entry ladder prices and shares for a swing, plus the stop and the targets. */
export function ladderLevels(low, high, plan = PLAN) {
  const r = high - low;
  return {
    parts: V2.entryLadder.map((p) => ({ price: high - p.at * r, share: p.share, at: p.at })),
    stop: (high - plan.stopRetrace * r) * (1 - plan.stopBuffer),
    t1: low + 1 * r, t2: low + 1.272 * r, trail: V2.trail.map((x) => low + x * r),
  };
}

/** Average entry price of the full ladder (notional-weighted: units = share/price). */
export function ladderAvg(parts) {
  const units = parts.reduce((s, p) => s + p.share / p.price, 0);
  return parts.reduce((s, p) => s + p.share, 0) / units;
}

/**
 * The payoff equation after costs for a swing, on the full ladder:
 *   W = 0.382(T1/E-1) + 0.382(T2/E-1) + 0.236(T3/E-1) - c,  Λ = (S/E-1) - c
 * c = round-trip cost fraction (both sides). ok = W >= 3|Λ|.
 */
export function payoff(low, high, c) {
  const L = ladderLevels(low, high);
  const E = ladderAvg(L.parts);
  const W = 0.382 * (L.t1 / E - 1) + 0.382 * (L.t2 / E - 1) + 0.236 * (L.trail[0] / E - 1) - c;
  const Lam = (L.stop / E - 1) - c;
  return { E, W, Lam, ok: W >= V2.costRule * Math.abs(Lam), need: V2.costRule * Math.abs(Lam) };
}

/** Positions allowed open at once: 1 -> 2 -> 3 by win streak. */
export const positionsAllowed = (winStreak) => Math.min(3, 1 + Math.max(0, winStreak | 0));

/** Candidate tier from the count of signals that hold (watch 3 / ready 5 / fire 8, and fire needs all). */
export function tierOf(signals) {
  const n = Object.values(signals).filter((v) => v === true).length;
  const all = Object.values(signals).every((v) => v === true);
  if (all && n >= V2.tiers.fire) return { tier: "fire", n };
  if (n >= V2.tiers.ready) return { tier: "ready", n };
  if (n >= V2.tiers.watch) return { tier: "watch", n };
  return { tier: "none", n };
}

/** Win rate over the last 13, 21 and 34 trades (null where there are not enough). */
export function pWindows(trades, wins = (t) => t.won) {
  const out = {};
  for (const w of V2.pWindows) {
    const last = trades.slice(-w);
    out[`p${w}`] = last.length >= w ? last.filter(wins).length / w : null;
  }
  return out;
}

/** SOL regime: stand aside when SOL fell more than regimeDrop over the last 13 5m candles. Missing = NO. */
export function regimeOk(sol5m) {
  if (!sol5m || sol5m.length < 13) return { ok: false, why: "SOL candles missing" };
  const last = sol5m.slice(-13);
  const ch = last[last.length - 1].c / last[0].o - 1;
  return { ok: ch > -V2.regimeDrop, why: `SOL ${(ch * 100).toFixed(2)}% over 65 min`, change: ch };
}
