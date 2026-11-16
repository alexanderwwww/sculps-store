// The ONE rule the desk trades: breakout over the last N bars' high on volume, ATR stop, R-multiple target, time stop.
// The Setup agent reads it at the last completed bar; the Skeptic replays it over the symbol's own history, with costs.
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export function atrAt(c, i, n) {
  if (i < n) return null; let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += Math.max(c[k].h - c[k].l, Math.abs(c[k].h - c[k - 1].c), Math.abs(c[k].l - c[k - 1].c));
  return s / n;
}
export function signalAt(c, i, p) {
  if (i < Math.max(p.lookback, p.atrN) + 1) return { ok: false, why: "not enough history" };
  const prior = c.slice(i - p.lookback, i);
  const hi = Math.max(...prior.map((x) => x.h));
  const vAvg = mean(prior.map((x) => x.v));
  const atr = atrAt(c, i, p.atrN);
  if (!(c[i].c > hi)) return { ok: false, why: `no breakout (close ${c[i].c} <= ${p.lookback}-bar high ${hi})` };
  if (!(vAvg > 0) || c[i].v < p.volMult * vAvg) return { ok: false, why: `volume ${(vAvg ? c[i].v / vAvg : 0).toFixed(2)}x < ${p.volMult}x` };
  return { ok: true, atr, hi, relVol: c[i].v / vAvg, why: `closed over ${p.lookback}-bar high ${hi.toPrecision(5)} on ${(c[i].v / vAvg).toFixed(1)}x volume` };
}
/** Walk forward from entry bar i. Stop is checked before target inside a bar (conservative). Returns the exit and net R. */
export function simulateTrade(c, i, p, cost, entryRef = c[i].c, atr = atrAt(c, i, p.atrN)) {
  const fill = entryRef * (1 + cost.slip);
  const stop = fill - p.atrStop * atr, risk = fill - stop, target = fill + p.rr * risk;
  if (!(risk > 0) || stop <= 0) return null;
  let j = i, px, why;
  for (j = i + 1; j < c.length && j <= i + p.maxHoldBars; j++) {
    const b = c[j];
    if (b.l <= stop) { px = Math.min(b.o, stop); why = "stop"; break; }
    if (b.h >= target) { px = Math.max(b.o, target); why = "target"; break; }
    if (j === i + p.maxHoldBars) { px = b.c; why = "time"; break; }
  }
  if (!why) return null;                                  // history ended before the trade resolved: not counted
  const out = px * (1 - cost.slip);
  const net = out * (1 - cost.fee) - fill * (1 + cost.fee);
  return { i, j, why, fill, stop, target, exit: out, net, r: net / risk, ret: net / fill };
}
export function runBacktest(c, p, cost) {
  const trades = [];
  for (let i = Math.max(p.lookback, p.atrN) + 1; i < c.length - 1; ) {
    const s = signalAt(c, i, p);
    const t = s.ok && simulateTrade(c, i, p, cost, c[i].c, s.atr);
    if (t) { trades.push({ ...t, t: c[i].t }); i = t.j + 1; } else i++;
  }
  return trades;
}
export function summarize(trades) {
  const rs = trades.map((t) => t.r), n = rs.length;
  const wins = rs.filter((r) => r > 0), losses = rs.filter((r) => r <= 0);
  const gw = wins.reduce((s, x) => s + x, 0), gl = -losses.reduce((s, x) => s + x, 0);
  const m = mean(rs), sd = n > 1 ? Math.sqrt(rs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) : 0;
  const half = Math.floor(n / 2);
  return { n, winRate: n ? wins.length / n : 0, expectancyR: m, profitFactor: gl > 0 ? gw / gl : gw > 0 ? Infinity : 0,
    stderrR: n > 1 ? sd / Math.sqrt(n) : Infinity, lowerBoundR: n > 1 ? m - sd / Math.sqrt(n) : -Infinity,
    firstHalfR: mean(rs.slice(0, half)), secondHalfR: mean(rs.slice(half)) };
}
