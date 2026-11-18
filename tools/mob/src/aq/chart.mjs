// THE CHART TRADER (Alex, 2026-11-18: "you are a replica simulation of a real life human trader, you trade as them just with
// no emotion. You trade the chart, you Fibonacci it, with validations and data.")
// Pure functions: candles in, a decision out. No network, no database, no clock that decides a trade. The ONLY use of time
// is technical: data whose last candle is old blocks a NEW entry (it never forces an exit).
//
// UNPROVEN: the training arena tested fixed holds, never these chart exits. Lessons that still apply: never chase (entries
// only on pullbacks, lesson 1), cost first (lessons 2, 3), exact mint, a stop wide enough to let the trade breathe (lesson 4).
// Fibonacci pullbacks were a LEAD on new pairs (lesson 14) and weak on established coins on 1-minute data; this trades the
// 5-minute leg on established coins, which nobody has measured yet. The paper mirror (live.mjs paperTick) measures it.
export const FIB = {
  legBars: 36,       // the leg is looked for in the last 3 hours of 5-minute bars
  minLegAtr: 3,      // a leg at least 3x the 5-minute ATR tall
  atrBars: 14,       // ATR over the last 14 five-minute bars
  zoneHi: 0.5, zoneLo: 0.618, // the golden pocket: 50% to 61.8% of the leg given back (38.2 is too shallow)
  broken: 0.786,     // a 5-minute close below 78.6% breaks the leg
  stopBufAtr: 0.25,  // the stop sits 0.25 ATR under the 78.6% level
  t2: 1.272, t3: 1.618,
  staleSec: 240,     // a last candle older than 240 s: no NEW entry (technical, never an exit)
  maxRtPct: 1,       // measured round trip under 1%
  minRewardRt: 3,    // entry -> target 1 at least 3x the round trip
  liqDropPct: 30,    // the pool lost 30% of its liquidity since entry: out
};
const r6 = (x) => (Number.isFinite(x) ? Number(x.toPrecision(8)) : x);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// 1-minute candles {t (sec), o, h, l, c, v} -> COMPLETE 5-minute bars only (a bucket still forming is left out)
export function bars5(c1, nowSec) {
  const by = new Map();
  for (const c of c1) { const k = c.t - (c.t % 300); const b = by.get(k);
    if (!b) { by.set(k, { t: k, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v || 0, first: c.t, last: c.t }); continue; }
    b.h = Math.max(b.h, c.h); b.l = Math.min(b.l, c.l); b.v += c.v || 0;
    if (c.t > b.last) { b.c = c.c; b.last = c.t; } if (c.t < b.first) { b.o = c.o; b.first = c.t; } }
  return [...by.values()].sort((a, b) => a.t - b.t).filter((b) => b.t + 300 <= nowSec).map(({ t, o, h, l, c, v }) => ({ t, o, h, l, c, v }));
}
export function atrAbs(b) {
  const xs = b.slice(-FIB.atrBars - 1), tr = [];
  for (let i = 1; i < xs.length; i++) tr.push(Math.max(xs[i].h - xs[i].l, Math.abs(xs[i].h - xs[i - 1].c), Math.abs(xs[i].l - xs[i - 1].c)));
  return tr.length >= 5 ? mean(tr) : null;
}
export const levels = (L, H, atr) => { const R = H - L, at = (x) => H - x * R, ext = (x) => L + x * R;
  return { z50: r6(at(0.5)), z618: r6(at(0.618)), z786: r6(at(FIB.broken)), stop: r6(at(FIB.broken) - FIB.stopBufAtr * atr), t1: r6(H), t2: r6(ext(FIB.t2)), t3: r6(ext(FIB.t3)) }; };

// 1. THE LEG: the highest high of the window (with at least one bar after it), the lowest low before it; tall enough,
// the high made on rising volume, and no 5-minute close since then under 78.6%.
export function findLeg(b) {
  if (b.length < 20) return { ok: false, why: `only ${b.length} five-minute bars` };
  const atr = atrAbs(b); if (!(atr > 0)) return { ok: false, why: "no ATR" };
  const w = b.slice(-FIB.legBars), off = b.length - w.length;
  let iH = 0; for (let i = 1; i < w.length - 1; i++) if (w[i].h > w[iH].h) iH = i;
  if (iH === 0) return { ok: false, why: "no up-leg: the high is the first bar of the window" };
  let iL = 0; for (let i = 1; i < iH; i++) if (w[i].l < w[iL].l) iL = i;
  const L = w[iL].l, H = w[iH].h;
  if (!(H > L)) return { ok: false, why: "no up-leg" };
  if (H - L < FIB.minLegAtr * atr) return { ok: false, why: `leg too small: ${r6((H - L) / atr)}x ATR, needs ${FIB.minLegAtr}x`, atr };
  const leg = w.slice(iL, iH + 1), half = Math.max(1, Math.floor(leg.length / 2));
  const volUp = leg.length >= 3 ? mean(leg.slice(half).map((x) => x.v)) > mean(leg.slice(0, half).map((x) => x.v)) : leg[leg.length - 1].v > leg[0].v;
  if (!volUp) return { ok: false, why: "the high was not made on rising volume" };
  const lv = levels(L, H, atr), after = w.slice(iH + 1);
  if (after.some((x) => x.c < lv.z786)) return { ok: false, why: "leg broken: a 5-minute close under 78.6%", broken: true };
  const buyVol = mean(leg.slice(1).filter((x) => x.c >= x.o).map((x) => x.v)), sells = after.filter((x) => x.c < x.o);
  return { ok: true, atr: r6(atr), low: L, high: H, lowT: w[iL].t, highT: w[iH].t, bars: iH - iL, levels: lv, buyVol, sellVol: sells.length ? mean(sells.map((x) => x.v)) : 0, idx: off + iH };
}

// 2 + 3. THE ENTRY: price came back into the golden pocket and the last closed bar CLOSES BACK UP inside it.
export function entrySetup(c1, nowSec) {
  const done = c1.filter((c) => c.t + 60 <= nowSec), last = done[done.length - 1];
  if (!last) return { signal: false, why: "no candles" };
  if (nowSec - (last.t + 60) > FIB.staleSec) return { signal: false, why: "stale data: the last candle is old", stale: true };
  const leg = findLeg(bars5(done, nowSec));
  if (!leg.ok) return { signal: false, why: leg.why, leg: null };
  const lv = leg.levels, sinceHigh = done.filter((c) => c.t >= leg.highT + 300);
  if (!sinceHigh.length) return { signal: false, why: "no pullback yet", leg };
  const pullLow = Math.min(...sinceHigh.map((c) => c.l)), base = { leg, levels: lv, pullLow, price: last.c };
  if (pullLow > lv.z50) return { ...base, signal: false, why: "waiting for the pullback into 50-61.8%" };
  if (last.c > lv.z50) return { ...base, signal: false, why: "price is back above 50%: too late, never chase" };
  if (last.c < lv.z618) return { ...base, signal: false, why: "price is under 61.8%: not inside the pocket" };
  const bounce = last.c > last.o;
  if (!bounce) return { ...base, signal: false, why: "no bounce candle yet: a falling knife is not bought" };
  if (!(leg.sellVol < leg.buyVol)) return { ...base, signal: false, why: "selling on the pullback is heavier than buying on the leg" };
  return { ...base, signal: true, why: `golden pocket bounce: ${r6(((leg.high - last.c) / (leg.high - leg.low)) * 100)}% retrace, leg ${r6((leg.high - leg.low) / leg.atr)}x ATR`,
    entry: last.c, stop: lv.stop, t1: lv.t1, t2: lv.t2, t3: lv.t3, validations: { leg: true, risingVolume: true, pocket: true, bounceClose: true, pullbackVolumeLower: true } };
}
// The plan stored with a position: everything the exits need, plus what the brain learns from.
export const planOf = (s, nowSec, extra = {}) => ({ kind: "fib", leg: { low: s.leg.low, high: s.leg.high, lowT: s.leg.lowT, highT: s.leg.highT, atr: s.leg.atr }, levels: s.levels,
  entry: s.entry, entryT: nowSec, pullLow: s.pullLow, stop: s.stop, t1: s.t1, t2: s.t2, t3: s.t3, phase: 0, since: nowSec, validations: s.validations, ...extra });

// 4 - 7. MANAGING A POSITION. Returns {action:"hold"|"sell_half"|"sell_all", reason, patch}. Nothing here looks at how long
// the trade has been open: only bars, levels, liquidity and vetoes.
export function manage(plan, c1, nowSec, { liqNow = null, vetoed = false } = {}) {
  if (vetoed) return { action: "sell_all", reason: "veto: Grok vetoed this coin" };
  if (liqNow != null && plan.liq > 0 && liqNow < plan.liq * (1 - FIB.liqDropPct / 100)) return { action: "sell_all", reason: `invalidation: the pool lost ${FIB.liqDropPct}% of its liquidity` };
  const done = c1.filter((c) => c.t + 60 <= nowSec), last = done[done.length - 1];
  if (!last) return { action: "hold", reason: "no data: holding (data never forces an exit)" };
  const b = bars5(done, nowSec), since = b.filter((x) => x.t >= plan.since), afterEntry = b.filter((x) => x.t >= plan.entryT);
  const stop = plan.phase === 2 ? Math.max(plan.stop, plan.trailStop ?? -Infinity) : plan.stop;
  const closeUnder = since.find((x) => x.c < stop);
  if (closeUnder) return { action: "sell_all", reason: plan.phase === 0 ? "stop: a 5-minute close under the 78.6% stop" : plan.phase === 1 ? "stop at entry after target 1" : "trail: a higher low broke" };
  if (plan.phase === 0 && afterEntry.some((x) => x.l < plan.pullLow)) return { action: "sell_all", reason: "invalidation: a lower low after entry" };
  const px = last.c;
  if (plan.phase === 0 && px >= plan.t1) return { action: "sell_half", reason: "target 1: the leg's high (sold half, stop to entry)", patch: { phase: 1, stop: plan.entry, since: last.t - (last.t % 300) + 300, t1At: last.t } };
  if (plan.phase === 1 && px >= plan.t2) {
    const lb = b[b.length - 1], pb = b[b.length - 2], strong = lb && pb && lb.c > plan.t2 && lb.v > pb.v;
    if (!strong) return { action: "sell_all", reason: "target 2: the 1.272 extension" };
    return { action: "hold", reason: "momentum above 1.272: trailing under each higher low", patch: { phase: 2, trailStop: Math.max(plan.entry, lb.l), since: lb.t + 300, t2At: last.t } };
  }
  if (plan.phase === 2) {
    if (px >= plan.t3) return { action: "sell_all", reason: "target 3: the 1.618 extension" };
    const lb = b[b.length - 1], pb = b[b.length - 2];
    if (lb && pb && lb.l > pb.l && lb.l > (plan.trailStop ?? -Infinity) && lb.t >= plan.since - 300) return { action: "hold", reason: "trail raised to the new higher low", patch: { trailStop: lb.l } };
  }
  return { action: "hold", reason: "holding: no stop, target or invalidation" };
}
