// Classic chart patterns on 5-minute blocks built from closed 1-minute bars only (no look-ahead: a swing
// point needs two closed blocks after it). Each returns dir +1 (bullish) / -1 (bearish) and the lines to draw.
// Whether a pattern may touch the call is decided by the training script on unseen data, not here.
import { blocks, atr, rsi, vwap } from "./indicators.js";

export const PATTERNS = ["doubleBottom", "doubleTop", "higherLow", "lowerHigh", "breakout", "breakdown", "bullEngulf", "bearEngulf",
  "hammer", "shootingStar", "bullDiv", "bearDiv", "vwapReclaim", "vwapLoss", "fibUp", "fibDown"];
export const LABEL = { doubleBottom: "double bottom", doubleTop: "double top", higherLow: "higher low after sell-off", lowerHigh: "lower high after rally",
  breakout: "range breakout on volume", breakdown: "range breakdown on volume", bullEngulf: "bullish engulfing at support", bearEngulf: "bearish engulfing at resistance",
  hammer: "hammer at support", shootingStar: "shooting star at resistance", bullDiv: "bullish RSI divergence", bearDiv: "bearish RSI divergence",
  vwapReclaim: "VWAP reclaim", vwapLoss: "VWAP rejection", fibUp: "Fib pullback in up-leg", fibDown: "Fib pullback in down-leg" };
export const DIR = { doubleBottom: 1, doubleTop: -1, higherLow: 1, lowerHigh: -1, breakout: 1, breakdown: -1, bullEngulf: 1, bearEngulf: -1, hammer: 1, shootingStar: -1,
  bullDiv: 1, bearDiv: -1, vwapReclaim: 1, vwapLoss: -1, fibUp: 1, fibDown: -1 };

function swings(b, k = 2) {
  const hi = [], lo = [];
  for (let i = k; i < b.length - k; i++) {
    let isH = true, isL = true;
    for (let j = i - k; j <= i + k; j++) { if (j === i) continue; // ties go to the first of the equal blocks
      if (j < i ? b[j].h >= b[i].h : b[j].h > b[i].h) isH = false; if (j < i ? b[j].l <= b[i].l : b[j].l < b[i].l) isL = false; }
    if (isH) hi.push(i); if (isL) lo.push(i);
  }
  return { hi, lo };
}

// col: columns(); end: index of the last closed 1m bar. Returns { hits: {name: lines[]}, x: number[] (one per PATTERN, -1/0/+1) }
export function detect(col, end) {
  const { o, h, l, c, v } = col;
  const b = blocks(o, h, l, c, v, end, 5, 72); // 6 hours of 5-minute blocks
  const n = b.length, out = {};
  if (n < 40) return { hits: out, x: PATTERNS.map(() => 0) };
  const A = atr(b, 14) || b[n - 1].c * 1e-3, last = b[n - 1], prev = b[n - 2], p = last.c;
  const { hi: sh, lo: sl } = swings(b);
  const recent = (arr, from) => arr.filter((i) => i >= from);
  // support / resistance: extremes of the 30 blocks before the last two
  let sup = Infinity, res = -Infinity; for (let i = n - 32; i < n - 2; i++) { sup = Math.min(sup, b[i].l); res = Math.max(res, b[i].h); }
  const vAvg = b.slice(n - 31, n - 1).reduce((s, x) => s + x.v, 0) / 30;

  // double bottom / top: two swing points within 0.4 ATR, 5+ blocks apart, 1.5 ATR pullback between, price now off the second
  const lows = recent(sl, n - 48);
  for (let a = lows.length - 2; a >= 0 && !out.doubleBottom; a--) {
    const i = lows[a], j = lows[lows.length - 1]; if (j - i < 5) continue;
    let peak = -Infinity; for (let k = i; k <= j; k++) peak = Math.max(peak, b[k].h);
    if (Math.abs(b[i].l - b[j].l) <= 0.4 * A && peak - Math.max(b[i].l, b[j].l) >= 1.5 * A && p > b[j].l && p < peak && n - 1 - j <= 8)
      out.doubleBottom = [{ price: Math.min(b[i].l, b[j].l), label: "double bottom" }, { price: peak, label: "neckline" }];
  }
  const highs = recent(sh, n - 48);
  for (let a = highs.length - 2; a >= 0 && !out.doubleTop; a--) {
    const i = highs[a], j = highs[highs.length - 1]; if (j - i < 5) continue;
    let trough = Infinity; for (let k = i; k <= j; k++) trough = Math.min(trough, b[k].l);
    if (Math.abs(b[i].h - b[j].h) <= 0.4 * A && Math.min(b[i].h, b[j].h) - trough >= 1.5 * A && p < b[j].h && p > trough && n - 1 - j <= 8)
      out.doubleTop = [{ price: Math.max(b[i].h, b[j].h), label: "double top" }, { price: trough, label: "neckline" }];
  }
  // higher low after a sell-off (3+ ATR drop into the first low), lower high after a rally
  if (lows.length >= 2) {
    const i = lows[lows.length - 2], j = lows[lows.length - 1];
    let top = -Infinity; for (let k = Math.max(0, i - 24); k < i; k++) top = Math.max(top, b[k].h);
    if (top - b[i].l >= 3 * A && b[j].l > b[i].l + 0.3 * A && p > b[j].l && n - 1 - j <= 8) out.higherLow = [{ price: b[i].l, label: "low" }, { price: b[j].l, label: "higher low" }];
  }
  if (highs.length >= 2) {
    const i = highs[highs.length - 2], j = highs[highs.length - 1];
    let bot = Infinity; for (let k = Math.max(0, i - 24); k < i; k++) bot = Math.min(bot, b[k].l);
    if (b[i].h - bot >= 3 * A && b[j].h < b[i].h - 0.3 * A && p < b[j].h && n - 1 - j <= 8) out.lowerHigh = [{ price: b[i].h, label: "high" }, { price: b[j].h, label: "lower high" }];
  }
  // range break with volume: a range no wider than 6 ATR, last block closes outside on 1.5x volume
  if (res - sup <= 6 * A && last.v >= 1.5 * vAvg) {
    if (last.c > res && prev.c <= res) out.breakout = [{ price: res, label: "resistance" }, { price: sup, label: "support" }];
    if (last.c < sup && prev.c >= sup) out.breakdown = [{ price: sup, label: "support" }, { price: res, label: "resistance" }];
  }
  // candles at support / resistance
  const body = Math.abs(last.c - last.o), up = last.h - Math.max(last.o, last.c), dn = Math.min(last.o, last.c) - last.l;
  const nearSup = last.l - sup <= 0.5 * A, nearRes = res - last.h <= 0.5 * A;
  if (nearSup && prev.c < prev.o && last.c > last.o && last.c >= prev.o && last.o <= prev.c) out.bullEngulf = [{ price: sup, label: "support" }];
  if (nearRes && prev.c > prev.o && last.c < last.o && last.c <= prev.o && last.o >= prev.c) out.bearEngulf = [{ price: res, label: "resistance" }];
  if (nearSup && body > 0 && dn >= 2 * body && up <= body) out.hammer = [{ price: sup, label: "support" }];
  if (nearRes && body > 0 && up >= 2 * body && dn <= body) out.shootingStar = [{ price: res, label: "resistance" }];
  // RSI divergence between the last two swing lows / highs (RSI on block closes up to that block)
  const rsiAt = (i) => rsi(b.slice(Math.max(0, i - 14), i + 1).map((x) => x.c), 14);
  if (lows.length >= 2) { const i = lows[lows.length - 2], j = lows[lows.length - 1]; if (b[j].l < b[i].l && rsiAt(j) > rsiAt(i) + 3 && n - 1 - j <= 6) out.bullDiv = [{ price: b[j].l, label: "divergence" }]; }
  if (highs.length >= 2) { const i = highs[highs.length - 2], j = highs[highs.length - 1]; if (b[j].h > b[i].h && rsiAt(j) < rsiAt(i) - 3 && n - 1 - j <= 6) out.bearDiv = [{ price: b[j].h, label: "divergence" }]; }
  // VWAP (4 h) reclaim / loss on the last block
  const vw = vwap(h, l, c, v, end, 240), vwPrev = vwap(h, l, c, v, end - 5, 240);
  if (prev.c < vwPrev && last.c > vw) out.vwapReclaim = [{ price: vw, label: "VWAP" }];
  if (prev.c > vwPrev && last.c < vw) out.vwapLoss = [{ price: vw, label: "VWAP" }];
  // Fibonacci: the last leg between the highest high and lowest low of 48 blocks; price touching 38.2 / 50 / 61.8
  let iH = n - 48, iL = n - 48; for (let k = n - 48; k < n; k++) { if (b[k].h > b[iH].h) iH = k; if (b[k].l < b[iL].l) iL = k; }
  const H = b[iH].h, L = b[iL].l, R = H - L;
  if (R >= 4 * A) for (const f of [0.382, 0.5, 0.618]) {
    if (iL < iH && Math.abs(p - (H - f * R)) <= 0.03 * R && n - 1 - iH >= 2) { out.fibUp = [{ price: H - f * R, label: `fib ${(f * 100).toFixed(1)}` }, { price: H, label: "leg high" }]; break; }
    if (iH < iL && Math.abs(p - (L + f * R)) <= 0.03 * R && n - 1 - iL >= 2) { out.fibDown = [{ price: L + f * R, label: `fib ${(f * 100).toFixed(1)}` }, { price: L, label: "leg low" }]; break; }
  }
  return { hits: out, x: PATTERNS.map((k) => (out[k] ? DIR[k] : 0)) };
}
