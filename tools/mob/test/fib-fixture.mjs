// Synthetic 1-minute charts for the chart trader (no network). Every candle {t, o, h, l, c, v}; the last one closed a minute before `now`.
// The standard picture: 2 hours flat around 100, a 30-minute leg to ~130 on rising volume, a pullback into the golden pocket on
// light volume, then whatever `tail` adds (a bounce, a knife, a break...).
// default tail: ten green minutes climbing inside the pocket, so whatever the clock, a CLOSED 5-minute bar closes up inside it
export const rise = (a, b, n = 10, v = 9) => Array.from({ length: n }, (_, i) => [a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n, v]);
export function chart(nowSec, { tail = rise(113.9, 114.6), legTo = 30, legVol = 2, pull = 16, pullVol = 8, flat = 120 } = {}) {
  const rows = [];
  for (let i = 0; i < flat; i++) { const p = 100 + Math.sin(i) * 0.3; rows.push([p, p, 10]); }
  for (let i = 1; i <= legTo; i++) rows.push([100 + i - 1, 100 + i, 10 + i * legVol]);
  for (let i = 1; i <= pull; i++) rows.push([100 + legTo - i + 1, 100 + legTo - i, pullVol]);
  for (const r of tail) rows.push(r);
  return place(nowSec, rows);
}
// rows [open, close, volume] -> candles ending one minute before now; high/low a hair outside the body
export function place(nowSec, rows, startSec = null) {
  const end = Math.floor(nowSec / 60) * 60 - 60, t0 = startSec ?? end - (rows.length - 1) * 60;
  return rows.map(([o, c, v], i) => ({ t: t0 + i * 60, o, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, c, v }));
}
// the API shape Jupiter's chart endpoint answers with (datapi v2: {candles:[{time, open, high, low, close, volume}]})
export const asJup = (cs) => ({ candles: cs.map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v })) });
