// Indicators on plain arrays. Every one uses a fixed look-back so the extension (live Kraken bars)
// and the training script (months of history) compute the exact same number for the same bars.

export function fillGaps(bars, step = 60) {
  // bars: [{t,o,h,l,c,v}] ascending by t (seconds, bar start). Missing minutes become flat bars, volume 0.
  const out = [];
  for (const b of bars) {
    const prev = out[out.length - 1];
    if (prev) {
      if (b.t <= prev.t) continue;
      for (let t = prev.t + step; t < b.t; t += step) out.push({ t, o: prev.c, h: prev.c, l: prev.c, c: prev.c, v: 0 });
    }
    out.push(b);
  }
  return out;
}

export function mean(a, from, to) { let s = 0; for (let i = from; i < to; i++) s += a[i]; return s / Math.max(1, to - from); }

// sample std of 1-minute log returns over closes[end-n .. end] (n returns)
export function retStd(c, end, n) {
  let s = 0, s2 = 0;
  for (let i = end - n + 1; i <= end; i++) { const r = Math.log(c[i] / c[i - 1]); s += r; s2 += r * r; }
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m) * n / Math.max(1, n - 1));
}

// RSI as the simple average of the last n changes (Cutler). Fixed window, no warm-up drift. 0..100
export function rsi(closes, n = 14) {
  const L = closes.length; if (L < n + 1) return 50;
  let up = 0, dn = 0;
  for (let i = L - n; i < L; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) up += d; else dn -= d; }
  if (up + dn === 0) return 50;
  return 100 * up / (up + dn);
}

// EMA seeded with the first value of the window
export function emaLast(a, from, to, n) {
  const k = 2 / (n + 1); let e = a[from];
  for (let i = from + 1; i < to; i++) e = a[i] * k + e * (1 - k);
  return e;
}

// Blocks of m bars ending exactly at index end (inclusive), newest last. Not clock aligned, on purpose:
// the same bars give the same blocks whether it is 10:03 or 10:05.
export function blocks(o, h, l, c, v, end, m, count) {
  const out = [];
  for (let k = count - 1; k >= 0; k--) {
    const last = end - k * m, first = last - m + 1;
    if (first < 0) continue;
    let hi = -Infinity, lo = Infinity, vol = 0;
    for (let i = first; i <= last; i++) { if (h[i] > hi) hi = h[i]; if (l[i] < lo) lo = l[i]; vol += v[i]; }
    out.push({ o: o[first], h: hi, l: lo, c: c[last], v: vol });
  }
  return out;
}

// ATR as the simple mean of the last n true ranges of the given blocks
export function atr(bl, n = 14) {
  const L = bl.length; if (L < 2) return 0;
  let s = 0, k = 0;
  for (let i = Math.max(1, L - n); i < L; i++) {
    const b = bl[i], pc = bl[i - 1].c;
    s += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); k++;
  }
  return s / k;
}

export function vwap(h, l, c, v, end, n) {
  let pv = 0, vs = 0;
  for (let i = end - n + 1; i <= end; i++) { const tp = (h[i] + l[i] + c[i]) / 3; pv += tp * v[i]; vs += v[i]; }
  return vs > 0 ? pv / vs : c[end];
}

export function hiLo(h, l, end, n) {
  let hi = -Infinity, lo = Infinity;
  for (let i = end - n + 1; i <= end; i++) { if (h[i] > hi) hi = h[i]; if (l[i] < lo) lo = l[i]; }
  return [hi, lo];
}
