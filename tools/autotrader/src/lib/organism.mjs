// The living organism (build 52+): Ultra measures its own win rate p, average win W, average loss L (REAL fills, exit gap
// included) and fees for every band of entry signal, and re-fits which band to buy, how big, and its own stop/take levels to
// maximise EV per minute. Pure functions, no I/O: the engine calls them, the server saves `org` to config.json.
//
// Hard limits it can never cross: size multiplier is 0.618 or 1 (never above the existing size), exits stay inside CLAMP,
// and it never stops trading (idlePick enters the least-bad candidate at 0.618 after 97 s without an entry).
export const PHI = 1.618, INV = 0.618;
export const LAMBDA = Math.pow(INV, 1 / 21);              // decay per close: half-life about 29.6 closes
export const IDLE_MS = 97000;                             // 1.618 min
export const IDLE_FRESH_MS = 97000;                      // the whole idle window: any candidate seen in it may be picked (it is re-gated live first)
export const PART_FRAC = 0.382;                          // same default the engine sells at (engine.mjs partFrac ?? 0.382)
export const SIZE_MIN_N = 13;                            // closes a band needs behind it before full size
export const COLD = { W: 0.05, L: 0.06, fee: 0.004, gS: -0.04, gT: 0 };   // lesson 39: real W ~5%, L ~6% after the exit gap; stops filled 1.5-10 pts past the level
export const CLAMP = { sl: [-0.08, -0.04],   // the stop may tighten, never widen past the live -8% (lesson 3: -8% filled at -19%)
  partAt: [0.03, 0.08], tp: [0.06, 0.2] };
const EDGES = { rise: [0.05, 0.1, 0.15, 0.25], ratio: [1.3, 2], vol5: [15000, 50000], liq: [50000, 100000] };
export const DIMS = ["rise", "ratio", "vol5", "liq", "path"];
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const B = () => ({ n: 0, w: 0, l: 0, sW: 0, sL: 0, sHold: 0, sFee: 0 });

/** bucket index for one dimension (null when the value is unknown) */
export function bucket(dim, v) {
  if (dim === "path") return v === "breakout" || v === "whale" ? v : "mom";
  const e = EDGES[dim]; if (!e || !fin(v)) return null;
  let i = 0; while (i < e.length && v >= e[i]) i++;
  return String(i);
}
export function newOrg() {
  return { v: 1, g: B(), b: Object.fromEntries(DIMS.map((d) => [d, {}])), gS: { all: COLD.gS }, gT: { all: COLD.gT }, book: [], closes: 0, idleFires: 0, idle: { since: null, best: null } };
}
/** an org read back from disk, or anything broken -> a usable org */
export function sane(o) {
  if (!o || typeof o !== "object" || !o.g || !o.b) return newOrg();
  const n = newOrg();
  return { ...n, ...o, b: { ...n.b, ...o.b }, gS: { ...n.gS, ...(o.gS || {}) }, gT: { ...n.gT, ...(o.gT || {}) }, book: Array.isArray(o.book) ? o.book : [], idle: { since: null, best: null } };
}
const decay = (b, k) => { for (const f of ["n", "w", "l", "sW", "sL", "sHold", "sFee"]) b[f] *= k; };
const add = (b, win, net, holdS, f, wt) => { b.n += wt; if (win) { b.w += wt; b.sW += wt * net; } else { b.l += wt; b.sL += wt * -net; } b.sHold += wt * holdS; b.sFee += wt * f; };
export function sigBuckets(sig = {}) {
  const out = {}; for (const d of DIMS) { const k = bucket(d, sig[d]); if (k != null) out[d] = k; } return out;
}
/** one close in. rec: {sig, ret, holdS, stake, feeLamports, exitKind, gap, trig, peak, low, tPeak, tLow, restRet} */
export function update(org, rec, { weight = 1 } = {}) {
  const ret = Number(rec.ret);
  if (!fin(ret)) return org;
  const stake = Number(rec.stake), fl = Number(rec.feeLamports);
  const f = fin(fl) && stake > 0 ? fl / (stake * 1e9) : COLD.fee;
  const net = ret - f, win = net > 0, holdKnown = fin(rec.holdS), holdS = holdKnown ? rec.holdS : 60;
  decay(org.g, LAMBDA); for (const d of DIMS) for (const b of Object.values(org.b[d])) decay(b, LAMBDA);
  add(org.g, win, net, holdS, f, weight);
  const bk = sigBuckets(rec.sig);
  for (const [d, k] of Object.entries(bk)) add((org.b[d][k] ??= B()), win, net, holdS, f, weight);
  // exit gap per liquidity bucket (what a stop / a take REALLY filled at, against the level that fired)
  if (fin(rec.gap) && (rec.exitKind === "stop" || rec.exitKind === "take")) {
    const m = rec.exitKind === "stop" ? org.gS : org.gT, lk = bk.liq ?? "all";
    for (const k of new Set([lk, "all"])) m[k] = LAMBDA * (fin(m[k]) ? m[k] : rec.exitKind === "stop" ? COLD.gS : COLD.gT) + (1 - LAMBDA) * rec.gap;
  }
  org.book.push({ sig: rec.sig || null, liqB: bk.liq ?? null, ret, f, holdS: holdKnown ? holdS : null, peak: rec.peak ?? null, low: rec.low ?? null, tPeak: rec.tPeak ?? null, tLow: rec.tLow ?? null, restRet: rec.restRet ?? ret, exitKind: rec.exitKind || null });
  if (org.book.length > 89) org.book.splice(0, org.book.length - 89);
  org.closes++;
  return org;
}
function globals(org) {
  const g = org.g, pG = (g.w + 1) / (g.n + 2);
  const WG = (g.sW + 3 * COLD.W) / (g.w + 3), LG = (g.sL + 3 * COLD.L) / (g.l + 3);
  const fG = (g.sFee + 3 * COLD.fee) / (g.n + 3);
  return { pG, WG, LG, fG, a0: 1 + 5 * pG, b0: 1 + 5 * (1 - pG), EV: pG * WG - (1 - pG) * LG - fG };
}
function bandEV(b, G, rng) {
  const p = rng ? betaSample(b.w + G.a0, b.l + G.b0, rng) : (b.w + G.a0) / (b.n + G.a0 + G.b0);
  const W = (b.sW + 3 * G.WG) / (b.w + 3), L = (b.sL + 3 * G.LG) / (b.l + 3), f = (b.sFee + 3 * COLD.fee) / (b.n + 3);
  return { p, W, L, f, EV: p * W - (1 - p) * L - f };
}
/** expected net return of buying this signal. sample: Thompson draw (explore), else posterior mean. */
export function score(org, sig, { sample = false, rng = Math.random } = {}) {
  try {
    const G = globals(org);
    let ev = G.EV;
    for (const [d, k] of Object.entries(sigBuckets(sig))) {
      const b = org.b[d]?.[k]; if (!b || !(b.n > 0)) continue;
      ev += (bandEV(b, G, sample ? rng : null).EV - G.EV) * (b.n / (b.n + 8));
    }
    return fin(ev) ? ev : COLD.W * 0.5 - COLD.L * 0.5 - COLD.fee;
  } catch { return 0; }
}
/** 1 when the band is positive on the posterior mean and there are >= 13 closes; else 0.618. Never above 1. */
export function sizeMul(org, sig) {
  try {
    const bk = Object.entries(sigBuckets(sig)); if (!bk.length) return INV;
    // every band this coin falls into must have its own 13 closes: an untested band never inherits full size from the global average
    if (!bk.every(([d, k]) => (org.b[d]?.[k]?.n ?? 0) >= SIZE_MIN_N)) return INV;
    const s = score(org, sig); return fin(s) && s > 0 ? 1 : INV;
  } catch { return INV; }
}
/** true once there are 3+ closes to choose on (before that the engine explores at 0.618) */
export function measured(org) { return !!(org?.g?.n >= 3); }
/** a candidate that passed every hard filter but scored <= 0: remember the best one of this window */
export function noteIdle(org, sig, s, cand, now) {
  const b = org.idle.best;
  if (!b || now - b.at > IDLE_FRESH_MS || s > b.s) org.idle.best = { s, sig, cand, at: now };
}
export function noteEntry(org, now) { org.idle.since = now; org.idle.best = null; }
/** after 97 s with no entry: the best-scored fresh candidate (it must still pass `stillOk`), entered at 0.618 */
export function idlePick(org, now, stillOk = () => true) {
  if (org.idle.since == null) { org.idle.since = now; return null; }
  if (now - org.idle.since < IDLE_MS) return null;
  const b = org.idle.best;
  if (!b || now - b.at > IDLE_FRESH_MS || !stillOk(b.cand)) return null;
  org.idle.best = null; org.idleFires++;
  return { ...b, m: INV };
}
// -------------------------------------------------------------- exits
const clamp = (k, v) => Math.min(CLAMP[k][1], Math.max(CLAMP[k][0], v));
/** one book row replayed under exit set s -> return on the whole stake */
export function replayRow(org, r, s) {
  const gS = fin(org.gS[r.liqB]) ? org.gS[r.liqB] : fin(org.gS.all) ? org.gS.all : COLD.gS;
  const gT = fin(org.gT[r.liqB]) ? org.gT[r.liqB] : fin(org.gT.all) ? org.gT.all : COLD.gT;
  const pf = s.partFrac ?? PART_FRAC;
  // the dip came first (or partAt was never reached): all of it at the stop. Peak first and past partAt: the part is
  // banked below, and the rest is the real rest return (the +0.5% lock fires long before the stop on the way down).
  if (r.low <= s.sl && (r.peak < s.partAt || r.tLow < r.tPeak)) return s.sl + gS;
  const part = r.peak >= s.partAt ? pf * (s.partAt + gT) : 0, restF = r.peak >= s.partAt ? 1 - pf : 1;
  return part + restF * (r.peak >= s.tp ? s.tp + gT : r.restRet);
}
function objective(org, rows, s) {
  let sr = 0, sm = 0; for (const r of rows) { sr += replayRow(org, r, s) - r.f; sm += Math.max(0.1, r.holdS / 60); }
  return { perMin: sr / sm, perTrade: sr / rows.length };
}
/** every 5 closes once 8 rows carry tPeak/tLow: one golden step per setting at most, inside CLAMP. Returns the new exits or null. */
export function refitExits(org, cfg) {
  const rows0 = org.book.filter((r) => [r.peak, r.low, r.tPeak, r.tLow, r.restRet, r.f, r.holdS].every(fin));
  if (rows0.length < 8 || org.closes % 5 !== 0) return null;
  const rows = rows0.slice(-34);
  const cur = { sl: clamp("sl", cfg.sl), partAt: clamp("partAt", cfg.partAt ?? 0.05), tp: clamp("tp", cfg.tp), partFrac: cfg.partFrac ?? PART_FRAC };
  const out = {}; let moved = false;
  for (const k of ["sl", "partAt", "tp"]) {
    const base = objective(org, rows, cur);
    let best = { v: cur[k], o: base };
    for (const mul of [INV, PHI]) {
      const v = +clamp(k, cur[k] * mul).toFixed(4);
      if (v === cur[k]) continue;
      if (k === "sl" && v > cur[k] && !((org.gS.all ?? COLD.gS) >= -0.02)) continue;   // a tighter stop only when stops fill near the level
      const o = objective(org, rows, { ...cur, [k]: v });
      if (o.perMin > best.o.perMin && o.perTrade - base.perTrade > 0.005) best = { v, o };
    }
    if (best.v !== cur[k]) { cur[k] = best.v; moved = true; }
    out[k] = cur[k];
  }
  return moved ? out : null;
}
/** update + refit when due */
export function step(org, rec, cfg) { update(org, rec); return { exits: cfg ? refitExits(org, cfg) : null }; }
// -------------------------------------------------------------- old journal -> org
/** parse the old `enter` text of closes ("rising 8.3% in 30s, $7606 volume in 5m, 711 buys vs 335 sells") at half weight */
export function parseEnter(s = "") {
  const rise = /ris(?:e|ing) ([\d.]+)%/.exec(s) || /ran ([\d.]+)%/.exec(s), vol = /\$([\d.]+)(k?) volume/.exec(s), bs = /(\d+) buys vs (\d+) sells/.exec(s);
  const sig = { path: /ULTRA INSTINCT/.test(s) ? "whale" : /breakout/.test(s) ? "breakout" : "mom" };
  if (rise) sig.rise = +rise[1] / 100;
  if (vol) sig.vol5 = +vol[1] * (vol[2] ? 1000 : 1);
  if (bs) { sig.buys = +bs[1]; sig.sells = +bs[2]; sig.ratio = sig.buys / Math.max(1, sig.sells); }
  return sig;
}
export function rebuild(closed = []) {
  const org = newOrg();
  for (const c of closed) {
    if (!fin(c?.ret)) continue;
    const sig = c.sig && typeof c.sig === "object" ? c.sig : parseEnter(c.enter || "");
    update(org, { ...c, sig, holdS: c.holdS ?? (c.at && c.t0 ? (c.at - c.t0) / 1000 : null) }, { weight: c.sig ? 1 : 0.5 });
  }
  return org;
}
// -------------------------------------------------------------- what /status shows
export function summary(org) {
  const G = globals(org), r = (x) => +x.toFixed(4);
  const bands = [];
  for (const d of DIMS) for (const [k, b] of Object.entries(org.b[d] || {})) if (b.n >= 0.5) { const e = bandEV(b, G); bands.push({ dim: d, band: k, n: +b.n.toFixed(1), p: r(e.p), EV: r(e.EV) }); }
  bands.sort((a, b) => b.EV - a.EV);
  return { g: { n: +org.g.n.toFixed(1), p: r(G.pG), W: r(G.WG), L: r(G.LG), EV: r(G.EV) }, top3: bands.slice(0, 3), bottom3: bands.slice(-3).reverse(), gS: org.gS, gT: org.gT, idleFires: org.idleFires, closes: org.closes };
}
/** for saving: the idle window holds live candidate objects, never written to disk */
export function persistable(org) { const { idle, ...rest } = org; return rest; }
// -------------------------------------------------------------- Beta draws (Marsaglia-Tsang)
function normal(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function gamma(a, rng) {
  if (a < 1) return gamma(a + 1, rng) * Math.pow(rng() || 1e-12, 1 / a);
  const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = normal(rng); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rng(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
export function betaSample(a, b, rng = Math.random) {
  if (!(a > 0) || !(b > 0)) return 0.5;
  const x = gamma(a, rng), y = gamma(b, rng); return x / (x + y);
}
