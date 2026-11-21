// The model's inputs, computed from closed 1-minute bars. Used by the training script and by the
// extension, so both see the same numbers. Everything is scale-free (divided by the coin's own
// recent volatility) so one model can read BTC and a $0.08 coin alike.
import { retStd, rsi, emaLast, blocks, atr, vwap, hiLo } from "./indicators.js";

export const LOOKBACK = 600;          // closed 1m bars needed before the last one (Kraken REST gives 719)
export const FEATURES = [
  "z1", "z5", "z15", "z60", "z240", "volRegime", "rsi1", "rsi5", "rsi15", "atr5", "vwap60", "vwap240",
  "volSpike", "pos60", "pos240", "ema60", "ema240", "todSin", "todCos",
];
const clip = (x, a = 5) => (x > a ? a : x < -a ? -a : Number.isFinite(x) ? x : 0);

export function columns(bars) {
  const n = bars.length, t = new Float64Array(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n), v = new Float64Array(n);
  bars.forEach((b, i) => { t[i] = b.t; o[i] = b.o; h[i] = b.h; l[i] = b.l; c[i] = b.c; v[i] = b.v; });
  return { t, o, h, l, c, v, n };
}

// sigma: std of 1m log returns over the last 60 minutes (floored so dead coins do not divide by ~0)
export function sigma1(c, end) { return Math.max(retStd(c, end, 60), 2e-5); }

// Returns { x: Float64Array(FEATURES.length), s, extra } or null when there is not enough history.
export function features(col, end) {
  const { t, o, h, l, c, v } = col;
  if (end < LOOKBACK) return null;
  const s = sigma1(c, end), sLong = Math.max(retStd(c, end, LOOKBACK), 2e-5);
  const p = c[end], r = (k) => Math.log(p / c[end - k]) / (s * Math.sqrt(k));
  const win = (arr, k) => Array.prototype.slice.call(arr, end - k + 1, end + 1);
  const b5 = blocks(o, h, l, c, v, end, 5, 20), b15 = blocks(o, h, l, c, v, end, 15, 20);
  const [h60, l60] = hiLo(h, l, end, 60), [h240, l240] = hiLo(h, l, end, 240);
  let vs5 = 0; for (let i = end - 4; i <= end; i++) vs5 += v[i];
  let vsAll = 0; for (let i = end - LOOKBACK + 1; i <= end; i++) vsAll += v[i];
  const vAvg5 = vsAll / LOOKBACK * 5;
  const pos = (hi, lo) => (hi > lo ? (p - lo) / (hi - lo) - 0.5 : 0);
  const from = end - LOOKBACK + 1;
  const tod = ((t[end] + 60) % 86400) / 86400 * 2 * Math.PI; // close time of the last bar, UTC
  const a5 = atr(b5, 14);
  const x = [
    clip(Math.log(p / c[end - 1]) / s), clip(r(5)), clip(r(15)), clip(r(60)), clip(r(240)),
    clip(Math.log(s / sLong)),
    (rsi(win(c, 15), 14) - 50) / 50, (rsi(b5.map((b) => b.c), 14) - 50) / 50, (rsi(b15.map((b) => b.c), 14) - 50) / 50,
    clip(a5 / p / (s * Math.sqrt(5)), 10) - 1,
    clip(Math.log(p / vwap(h, l, c, v, end, 60)) / (s * Math.sqrt(60))), clip(Math.log(p / vwap(h, l, c, v, end, 240)) / (s * Math.sqrt(240))),
    clip(Math.log((vs5 + 1e-12) / (vAvg5 + 1e-12)), 4),
    pos(h60, l60), pos(h240, l240),
    clip(Math.log(p / emaLast(c, from, end + 1, 60)) / (s * Math.sqrt(60))), clip(Math.log(p / emaLast(c, from, end + 1, 240)) / (s * Math.sqrt(240))),
    Math.sin(tod), Math.cos(tod),
  ];
  return { x, s, atr5: a5, price: p, hi60: h60, lo60: l60, hi240: h240, lo240: l240, tClose: t[end] + 60 };
}

// What kind of setup the bars show, in words. Used to label movers; never by itself a reason to trade.
export function setupTags(f) {
  const [z1, z5, z15, , , , , , , , , , volSpike, pos60, pos240] = f.x;
  const tags = [];
  if (volSpike > 1.0) tags.push("volume spike");
  if (pos240 < -0.35 && z5 > 0.3) tags.push("bounce from low");
  if (pos240 > 0.35 && z5 < -0.3) tags.push("rejection from high");
  if (z15 > 1.5 || (pos60 > 0.4 && z5 > 1)) tags.push("extended up");
  if (z15 < -1.5 || (pos60 < -0.4 && z5 < -1)) tags.push("extended down");
  return tags;
}
