// Builds the shipped model from months of real 1-minute candles (Coinbase USD pairs, fetched by fetch.py).
//   node model/train.mjs <dataDir> <out model.json>
// Time split, never shuffled: TRAIN (first 50%) fits the weights, VALID (next 20%) picks the trade-plan
// settings and flags bands, TEST (last 30%, never touched while fitting) gives every number shown to Alex.
// A band is marked "edge" only if it is above 50% with 95% confidence on VALID and again on TEST,
// and its trade plan made money after fees on both.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fillGaps } from "../src/lib/indicators.js";
import { FEATURES, LOOKBACK, columns, features } from "../src/lib/features.js";
import { chasing, stopPct } from "../src/lib/plan.js";

const [dir, outFile] = process.argv.slice(2);
const HORIZONS = [5, 15], STEP = 3, EMBARGO = 86400, FEE = 0.0004;
const BAND_EDGES = [0.5, 0.52, 0.54, 0.57, 0.6, 1.01];
const coins = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).map((f) => f.replace(".json", ""));

// ---------- load + features ----------
const series = {}; const rows = [];
let tMin = Infinity, tMax = -Infinity;
for (const coin of coins) {
  const raw = JSON.parse(readFileSync(join(dir, `${coin}.json`), "utf8"));
  const bars = fillGaps(raw.map(([t, o, h, l, c, v]) => ({ t, o: +o, h: +h, l: +l, c: +c, v: +v })));
  const col = columns(bars); series[coin] = col;
  for (let end = LOOKBACK; end < col.n - 46; end += STEP) {
    const f = features(col, end); if (!f) continue;
    const y = {}, ret = {}, hiE = {}, loE = {};
    for (const h of HORIZONS) {
      const sd = f.s * Math.sqrt(h); let hi = -Infinity, lo = Infinity;
      for (let i = end + 1; i <= end + h; i++) { if (col.h[i] > hi) hi = col.h[i]; if (col.l[i] < lo) lo = col.l[i]; }
      const r = Math.log(col.c[end + h] / col.c[end]);
      y[h] = r > 0 ? 1 : r < 0 ? 0 : -1; ret[h] = r / sd; hiE[h] = Math.log(hi / f.price) / sd; loE[h] = Math.log(f.price / lo) / sd;
    }
    rows.push({ coin, end, t: f.tClose, x: f.x, f, y, ret, hiE, loE });
    if (f.tClose < tMin) tMin = f.tClose; if (f.tClose > tMax) tMax = f.tClose;
  }
  console.log(`  ${coin}: ${col.n} bars, ${new Date(col.t[0] * 1000).toISOString().slice(0, 10)} -> ${new Date(col.t[col.n - 1] * 1000).toISOString().slice(0, 16)}`);
}
const cut1 = tMin + 0.5 * (tMax - tMin), cut2 = tMin + 0.7 * (tMax - tMin);
const part = (r) => (r.t < cut1 - EMBARGO / 2 ? "train" : r.t >= cut1 + EMBARGO / 2 && r.t < cut2 - EMBARGO / 2 ? "valid" : r.t >= cut2 + EMBARGO / 2 ? "test" : null);
for (const r of rows) r.part = part(r);
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";

// ---------- logistic regression, IRLS with a small L2 ----------
function fitLogit(X, y, lambda = 1) {
  const n = X.length, d = X[0].length + 1; let w = new Float64Array(d);
  for (let it = 0; it < 25; it++) {
    const H = Array.from({ length: d }, () => new Float64Array(d)), g = new Float64Array(d);
    for (let i = 0; i < n; i++) {
      const xi = X[i]; let z = w[0]; for (let j = 1; j < d; j++) z += w[j] * xi[j - 1];
      const p = 1 / (1 + Math.exp(-z)), e = y[i] - p, ww = p * (1 - p);
      g[0] += e; for (let j = 1; j < d; j++) g[j] += e * xi[j - 1];
      H[0][0] += ww; for (let j = 1; j < d; j++) { const a = ww * xi[j - 1]; H[0][j] += a; for (let k = j; k < d; k++) H[j][k] += a * xi[k - 1]; }
    }
    for (let j = 1; j < d; j++) { g[j] -= lambda * w[j]; H[j][j] += lambda; }
    for (let j = 0; j < d; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j];
    const step = solve(H, g); let mx = 0;
    for (let j = 0; j < d; j++) { w[j] += step[j]; mx = Math.max(mx, Math.abs(step[j])); }
    if (mx < 1e-7) break;
  }
  return w;
}
function solve(A, b) { // Gaussian elimination with partial pivoting
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j]; x[r] = s / M[r][r]; }
  return x;
}
const wilsonLow = (k, n) => { if (!n) return 0; const z = 1.96, p = k / n; return (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n); };
const quantile = (a, q) => { const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

// ---------- trade-plan replay on real bars (stop first if a bar touches both) ----------
function replay(sig, h, pp) {
  const byCoin = {}; for (const r of sig) (byCoin[r.coin] ||= []).push(r);
  const res = [];
  for (const [coin, list] of Object.entries(byCoin)) {
    const col = series[coin]; let busyUntil = -1;
    for (const r of list.sort((a, b) => a.end - b.end)) {
      if (r.end <= busyUntil) continue;
      if ((Math.exp(r.f.s * Math.sqrt(h)) - 1) < pp.minSdPct) continue; // too quiet to pay the fees
      const dir = r.p >= 0.5 ? 1 : -1;
      if (chasing(r.f, dir > 0 ? "up" : "down")) continue;
      const entry = col.c[r.end], sp = stopPct(pp, r.f, h);
      const stop = entry * (1 - dir * sp), tp = entry * (1 + dir * sp * pp.rr);
      let exit = null, i = r.end + 1, last = Math.min(col.n - 1, r.end + pp.hold);
      for (; i <= last; i++) {
        const lo = col.l[i], hi = col.h[i];
        if (dir > 0 ? lo <= stop : hi >= stop) { exit = stop; break; }
        if (dir > 0 ? hi >= tp : lo <= tp) { exit = tp; break; }
      }
      if (exit === null) { exit = col.c[last]; i = last; }
      const gross = dir * (exit - entry) / entry, net = gross - FEE * (1 + exit / entry);
      const riskPct = sp + FEE * (2 - dir * sp);
      res.push({ net, R: net / riskPct, win: net > 0 }); busyUntil = i;
    }
  }
  const n = res.length, mean = (k) => (n ? res.reduce((s, x) => s + x[k], 0) / n : 0);
  return { trades: n, netPct: mean("net") * 100, R: mean("R"), win: n ? res.filter((x) => x.win).length / n : 0 };
}

// ---------- fit + evaluate each horizon ----------
const out = { build: null, made: new Date().toISOString(), source: "Coinbase Exchange public 1-minute candles, USD pairs (Kraken's public OHLC only returns the last 720 bars)",
  coins, from: iso(tMin), to: iso(tMax), split: { trainUntil: iso(cut1), validUntil: iso(cut2), testFrom: iso(cut2) }, features: FEATURES, feePerSide: FEE, horizons: {} };
for (const h of HORIZONS) {
  const ok = (r) => r.y[h] >= 0;
  const tr = rows.filter((r) => r.part === "train" && ok(r)), va = rows.filter((r) => r.part === "valid" && ok(r)), te = rows.filter((r) => r.part === "test" && ok(r));
  const d = FEATURES.length, mu = new Array(d).fill(0), sd = new Array(d).fill(0);
  for (const r of tr) for (let j = 0; j < d; j++) mu[j] += r.x[j] / tr.length;
  for (const r of tr) for (let j = 0; j < d; j++) sd[j] += (r.x[j] - mu[j]) ** 2 / tr.length;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const Z = (r) => r.x.map((v, j) => (v - mu[j]) / sd[j]);
  const w = fitLogit(tr.map(Z), tr.map((r) => r.y[h]), 50);
  const prob = (r) => { let z = w[0]; const x = Z(r); for (let j = 0; j < d; j++) z += w[j + 1] * x[j]; return 1 / (1 + Math.exp(-z)); };
  for (const r of [...tr, ...va, ...te]) r.p = prob(r);
  const hits = (set) => set.filter((r) => (r.p >= 0.5) === (r.y[h] === 1)).length;
  const upRate = (set) => set.filter((r) => r.y[h] === 1).length / set.length;

  // range: 80% of the time the high / low of the next h minutes stays inside (fit on TRAIN)
  // both edges at the same quantile q, q raised until the high AND the low stay inside 80% of the time on TRAIN
  const cover = (set, rg = range) => set.filter((r) => r.hiE[h] <= rg.hi && r.loE[h] <= rg.lo).length / set.length;
  let range = null;
  for (let q = 0.8; q < 0.995; q += 0.005) { range = { hi: quantile(tr.map((r) => r.hiE[h]), q), lo: quantile(tr.map((r) => r.loE[h]), q), q: +q.toFixed(3) }; if (cover(tr, range) >= 0.8) break; }
  // drift: expected normalised return per unit of (p - 0.5), least squares on TRAIN
  let sxy = 0, sxx = 0; for (const r of tr) { const q = r.p - 0.5; sxy += q * r.ret[h]; sxx += q * q; }
  const drift = sxx ? sxy / sxx : 0;

  // plan settings chosen on VALID (all calls from 52%+), then fixed
  const pick = va.filter((r) => Math.max(r.p, 1 - r.p) >= 0.52);
  let best = null;
  for (const stopZ of [1, 1.5, 2, 2.5]) for (const rr of [1, 1.5, 2, 3]) for (const hold of [h, 2 * h, 4 * h]) for (const minSdPct of [0, 0.003, 0.006]) {
    const pp = { stopZ, rr, hold, minStopPct: 0.002, entryPull: 0.25, minSdPct }, res = replay(pick, h, pp);
    if (res.trades >= 200 && (!best || res.netPct > best.res.netPct)) best = { pp, res };
  }
  const pp = best ? best.pp : { stopZ: 1.5, rr: 1.5, hold: 2 * h, minStopPct: 0.002, entryPull: 0.25, minSdPct: 0 };

  const bands = [];
  for (let k = 0; k < BAND_EDGES.length - 1; k++) {
    const lo = BAND_EDGES[k], hi = BAND_EDGES[k + 1], inB = (r) => { const c = Math.max(r.p, 1 - r.p); return c >= lo && c < hi; };
    // naive = always calling the side that was more common in this band and period (a hindsight baseline, so beating it is a real bar)
    const stat = (set) => { const s = set.filter(inB), k2 = hits(s), up = s.filter((r) => r.y[h] === 1).length;
      return { n: s.length, hit: s.length ? k2 / s.length : 0, ciLow: wilsonLow(k2, s.length), naive: s.length ? Math.max(up, s.length - up) / s.length : 0, plan: replay(s, h, pp) }; };
    const v = stat(va), t = stat(te);
    const dirEdge = v.n >= 1000 && t.n >= 1000 && v.ciLow > Math.max(0.5, v.naive) && t.ciLow > Math.max(0.5, t.naive);
    const edge = dirEdge && v.plan.trades >= 100 && t.plan.trades >= 100 && v.plan.netPct > 0 && t.plan.netPct > 0;
    bands.push({ lo, hi, dirEdge, edge, valid: v, test: t });
  }
  out.horizons[h] = { mu, sd, w: Array.from(w.slice(1)), b: w[0], range, drift, plan: pp, bands,
    overall: { train: { n: tr.length, hit: hits(tr) / tr.length, up: upRate(tr) }, valid: { n: va.length, hit: hits(va) / va.length, up: upRate(va) },
      test: { n: te.length, hit: hits(te) / te.length, up: upRate(te), rangeCover: cover(te) }, planValid: best?.res ?? null, planTest: replay(te.filter((r) => Math.max(r.p, 1 - r.p) >= 0.52), h, pp) } };
  console.log(`\n== ${h}m  train ${tr.length}  valid ${va.length}  test ${te.length}`);
  console.log(`  test hit ${(hits(te) / te.length * 100).toFixed(2)}%  (up-rate ${(upRate(te) * 100).toFixed(1)}%)  range cover ${(cover(te) * 100).toFixed(1)}%  plan`, JSON.stringify(pp));
  for (const b of bands) console.log(`  ${(b.lo * 100).toFixed(0)}-${(Math.min(b.hi, 1) * 100).toFixed(0)}%  valid n=${b.valid.n} hit=${(b.valid.hit * 100).toFixed(2)} | test n=${b.test.n} hit=${(b.test.hit * 100).toFixed(2)} ciLow=${(b.test.ciLow * 100).toFixed(2)} naive=${(b.test.naive * 100).toFixed(1)} | plan test ${b.test.plan.trades} trades net ${b.test.plan.netPct.toFixed(3)}%/trade R ${b.test.plan.R.toFixed(3)} win ${(b.test.plan.win * 100).toFixed(1)}%  ${b.edge ? "TRADE EDGE" : b.dirEdge ? "direction edge only" : "no edge"}`);
}
writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(`\nwrote ${outFile}`);
