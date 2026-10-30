// chartRead v1 (2026-10-30): read the chart the way a trader draws it, then buy only the deep retrace (0.5-0.786) of an intact
// swing, after the sellers are spent, and take small profits fast. Pure functions: everything here is driven by fake candles in
// test/chart.test.mjs. Lesson 47 (Alex): "a hunter hunts with instinct and logic, act differently based on experience, so data":
// every score point carries a weight learned from Ultra's own closes, and the score bar moves with the realised win rate.

export const CR = {
  fibLo: 0.5, fibHi: 0.786, fibDeep: 0.886, fibMinRun: 0.06, scoreMin: 5, atrMaxPct: 0.015, confAtr: 0.6, flowRatio: 1.15,
  exhSellDrop: 0.8, exhRatioMin: 0.5, exhRatioRise: 0.05, exhVolDry: 0.6, wickMin: 0.5, wickBody: 1.5, tp1: 0.05, beAfterTp1: 0.015,
  trailAtr: 1.2, trailMin: 0.025, stallSec: 120, timeStopMin: 10, candleTtl: 60, crSl: -0.02, crLiq: 15000,
};
const K = (cfg, k) => (cfg && typeof cfg[k] === "number" ? cfg[k] : CR[k]);
export const FEE = 0.029;                      // a round trip on 0.016 SOL (lesson "Build 60")
export const P_STAR = 0.65;                    // break-even win rate: a loss is -4.9%, a win averages +2.6%
const POINTS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"];

/** 1-minute candles -> n-minute candles (o first, h max, l min, c last, v sum), bucketed on floor(t / n min). */
export function resample(cs, n) {
  const out = [], w = n * 60000;
  for (const k of cs) {
    const b = Math.floor(k.t / w) * w, o = out[out.length - 1];
    if (o && o.t === b) { o.h = Math.max(o.h, k.h); o.l = Math.min(o.l, k.l); o.c = k.c; o.v += k.v || 0; }
    else out.push({ t: b, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v || 0 });
  }
  return out;
}
/** Average true range over the last n bars. */
export function atr(cs, n = 14) {
  if (!cs.length) return 0;
  if (cs.length < 2) return cs[0].h - cs[0].l;
  const tr = [];
  for (let i = 1; i < cs.length; i++) { const a = cs[i], p = cs[i - 1].c; tr.push(Math.max(a.h - a.l, Math.abs(a.h - p), Math.abs(a.l - p))); }
  const s = tr.slice(-n); return s.reduce((x, y) => x + y, 0) / s.length;
}
/** Raw k-bar pivots (the last k bars are unconfirmed, so never pivots). */
export function rawPivots(cs, k = 2) {
  const out = [];
  for (let i = k; i < cs.length - k; i++) {
    let hi = true, lo = true;
    for (let j = i - k; j <= i + k; j++) { if (j === i) continue; if (!(cs[i].h > cs[j].h)) hi = false; if (!(cs[i].l < cs[j].l)) lo = false; }
    if (hi) out.push({ i, t: cs[i].t, type: "H", price: cs[i].h });
    if (lo) out.push({ i, t: cs[i].t, type: "L", price: cs[i].l });
  }
  return out;
}
/** Zigzag pivots: alternating, the more extreme of two in a row, legs under 1.5 ATR dropped. */
export function pivots(cs, k = 2, a = atr(cs)) {
  const z = [];
  for (const p of rawPivots(cs, k)) {
    const last = z[z.length - 1];
    if (!last) { z.push(p); continue; }
    if (last.type === p.type) { if ((p.type === "H" && p.price > last.price) || (p.type === "L" && p.price < last.price)) z[z.length - 1] = p; continue; }
    if (Math.abs(p.price - last.price) < 1.5 * a) continue;
    z.push(p);
  }
  return z;
}
const key = (L, H) => `${+L.toPrecision(8)}:${+H.toPrecision(8)}`;
/** The 1-minute bar that holds a pivot's extreme inside its n-minute bucket (so "since H" is measured to the minute). */
function at1(cs1, p, n) {
  const inB = cs1.filter((k) => k.t >= p.t && k.t < p.t + n * 60000);
  const f = inB.find((k) => (p.type === "H" ? k.h === p.price : k.l === p.price)) || inB[0];
  return f ? f.t : p.t;
}
/** The dominant intact swing L -> H: 15-minute pivots, 5-minute when 15 has fewer than 4, 1-minute when 5 has fewer too. */
export function dominant(cs1, cfg = CR, dead = new Set(), P = null) {
  const tfs = [15, 5, 1];
  let tf = null;
  for (const n of tfs) {
    const cs = n === 1 ? cs1 : resample(cs1, n), piv = pivots(cs, 2, atr(cs));
    if (piv.length < 4 && n !== 1) continue;
    const legs = [];
    for (let a = 0; a < piv.length; a++) {
      if (piv[a].type !== "L") continue;
      for (let b = a + 1; b < piv.length; b++) {
        if (piv[b].type !== "H") continue;
        const L = piv[a].price, H = piv[b].price, tL = at1(cs1, piv[a], n), tH = at1(cs1, piv[b], n);
        const after = cs1.filter((k) => k.t > tH), afterL = cs1.filter((k) => k.t > tL);
        if (after.some((k) => k.c > H) || (P != null && P > H)) continue;          // a close above H: the swing is still running
        if (afterL.some((k) => k.c < L) || (P != null && P < L)) continue;         // a close below L: the swing is gone
        const run = H / L - 1;
        legs.push({ L, H, tL, tH, run, tf: n, dead: dead.has(key(L, H)) });
      }
    }
    tf ??= { n, piv: piv.length };
    const ok = legs.filter((g) => g.run >= K(cfg, "fibMinRun"));
    if (!ok.length) { if (legs.length) tf.small = Math.max(...legs.map((g) => g.run)); continue; }
    const live = ok.filter((g) => !g.dead);
    if (!live.length) return { why: "swing dead (broke 0.786)", dead: true };
    live.sort((x, y) => y.run - x.run);
    return { ...live[0], piv: piv.length, cs: n === 1 ? cs1 : resample(cs1, n) };
  }
  return { why: tf?.small != null ? `no swing: run ${(tf.small * 100).toFixed(1)}% under ${(K(cfg, "fibMinRun") * 100).toFixed(0)}%` : "no swing on the chart" };
}
/** Point of control: the price bin over [L, H] where the most volume traded (20 bins), at its centre. */
export function poc(cs, L, H, bins = 20) {
  if (!(H > L)) return null;
  const v = new Array(bins).fill(0), w = (H - L) / bins;
  for (const k of cs) { const mid = (k.h + k.l) / 2; if (mid < L || mid > H) continue; v[Math.min(bins - 1, Math.floor((mid - L) / w))] += k.v || 0; }
  const i = v.indexOf(Math.max(...v)); return v[i] > 0 ? L + (i + 0.5) * w : null;
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
/** Learned weight of each score point (lesson 47): win rate with the point on / win rate overall, from >= 20 closes, 0.5-1.5. */
export function weights(guard) {
  const w = {}; const all = guard?.closes || [], base = all.length ? all.filter((c) => c.ret > 0).length / all.length : null;
  for (const s of POINTS) {
    const on = all.filter((c) => c.feat?.[s]);
    w[s] = on.length >= 20 && base > 0 ? Math.min(1.5, Math.max(0.5, on.filter((c) => c.ret > 0).length / on.length / base)) : 1;
  }
  return w;
}
/** Tick-only fib (the fallback when the chart cannot be read): the swing in the last 2 min of live prices, deep zone 0.5-0.786. */
export function tickFib(ticks, P, cfg = CR) {
  if (ticks.length < 8) return { ok: false, why: "fib: watching its price first" };
  let hi = 0, hiAt = 0; ticks.forEach(([, v], i) => { if (v > hi) { hi = v; hiAt = i; } });
  const lo = Math.min(...ticks.slice(0, hiAt + 1).map(([, v]) => v)), run = hi / lo - 1, r = (hi - P) / Math.max(1e-18, hi - lo), after = ticks.slice(hiAt + 1).map(([, v]) => v);
  if (run < (cfg.tickMinRun ?? 0.04)) return { ok: false, why: "fib (ticks): no swing to read" };
  if (r < K(cfg, "fibLo") - 1e-6) return { ok: false, why: "fib (ticks): above the zone, waiting for the pullback" };
  if (r > K(cfg, "fibHi") + 1e-6) return { ok: false, why: "fib (ticks): below 0.786, swing failed" };
  if (!after.length) return { ok: false, why: "fib (ticks): in the zone, waiting for the bounce" };
  const minSince = Math.min(...after), minAt = after.lastIndexOf(minSince);
  if ((hi - minSince) / Math.max(1e-18, hi - lo) > K(cfg, "fibDeep")) return { ok: false, why: "fib (ticks): dipped past 0.886, swing dead" };
  if (!(P > minSince * 1.005 && minAt <= after.length - 3)) return { ok: false, why: "fib (ticks): in the zone, waiting for the bounce" };
  const H = hi, L = lo, tp2 = Math.max(0.08, Math.min(H * 0.995 / P - 1, 0.12));
  return { ok: true, fallback: true, r, run, H, L, score: null, sl: K(cfg, "crSl"), deepPx: H - K(cfg, "fibDeep") * (H - L), tp2, trail: K(cfg, "trailMin"), atrPct: null, feat: { r: +r.toFixed(3), run: +run.toFixed(4), fallback: 1 }, why: `fib buy (ticks): swing +${(run * 100).toFixed(1)}%, at the ${r.toFixed(3)} retrace and bouncing` };
}

/**
 * The chart read. cache: { cs1, dead:Set } for the pool; P the live price; lv the live quote (liqUsd, buys5, sells5);
 * flow: the ring [{t,b,s,p}]; x: { ticks:[[t,p]], now, whale:{buy,sell,at}, guard, certainty }.
 * -> { ok:false, why } or { ok:true, why, r, run, H, L, score, sl, deepPx, tp2, trail, atrPct, feat }
 */
export function chartRead(cache, P, lv, flow, cfg = CR, x = {}) {
  const now = x.now ?? Date.now(), ticks = x.ticks || [];
  if ((lv?.liqUsd ?? 0) < K(cfg, "crLiq")) return { ok: false, why: "live: pool too thin to get out of" };
  const w = x.whale; if (w && now - w.at < 60000 && w.sell >= (cfg.whaleUsd ?? 1500) && w.sell >= 2 * w.buy) return { ok: false, why: "chart: whales selling" };
  const cs0 = cache?.cs1;
  if (!cs0 || cs0.length < 20) {
    const t = tickFib(ticks, P, cfg);
    if (t.ok && !((lv.buys5 || 0) >= (lv.sells5 || 0) * K(cfg, "flowRatio"))) return { ok: false, why: "fib (ticks): sellers in control" };
    return t;
  }
  // patch the minute in progress from the live ticks
  const cs1 = cs0.slice(), minute = Math.floor(now / 60000) * 60000, last = cs1[cs1.length - 1];
  const tk = ticks.filter(([t]) => t >= minute).map(([, v]) => v);
  if (last.t >= minute) cs1[cs1.length - 1] = { ...last, c: P, h: Math.max(last.h, P, ...tk), l: Math.min(last.l, P, ...tk) };
  else cs1.push({ t: minute, o: last.c, h: Math.max(last.c, P, ...tk), l: Math.min(last.c, P, ...tk), c: P, v: 0 });
  const a1 = atr(cs1, 14), atrPct = a1 / P;
  const d = dominant(cs1, cfg, cache.dead || new Set(), P);
  if (!d.H) return { ok: false, why: `chart: ${d.why}` };
  const { L, H, tH } = d, span = H - L, fib = (q) => H - q * span, r = (H - P) / span;
  const since = cs1.filter((k) => k.t > tH);
  // dead swing: a 1m close past 0.786 or a wick past 0.886, remembered for this pair
  if (since.some((k) => k.t < minute && (H - k.c) / span > K(cfg, "fibHi")) || since.some((k) => (H - k.l) / span > K(cfg, "fibDeep"))) {
    (cache.dead ??= new Set()).add(key(L, H));
    return { ok: false, why: "chart: swing dead (broke 0.786)" };
  }
  if (r < K(cfg, "fibLo") - 1e-6) return { ok: false, why: `chart: above the zone (r ${r.toFixed(2)}), waiting for the deep retrace` };
  if (r > K(cfg, "fibHi") + 1e-6) return { ok: false, why: `chart: under the zone (r ${r.toFixed(2)})` };
  const lowSince = Math.min(...since.map((k) => k.l), P);
  // G3: no lower low on the 1-minute chart since the high
  const pl = rawPivots(since.length ? cs1.filter((k) => k.t >= tH - 2 * 60000) : [], 2).filter((p) => p.type === "L" && p.t > tH);
  const pls = pl.map((p) => p.price);
  if (pls.length >= 2 && pls[pls.length - 1] < pls[pls.length - 2]) return { ok: false, why: "chart: lower low on the 1m, still falling" };
  // the stop must have room: a pullback low within 0.5% of the entry is noise, not a structure
  if ((P - lowSince) / P < 0.005) return { ok: false, why: "chart: stop too tight (low within 0.5% of entry)" };
  // G4: bounced off the low, and the last 3 ticks made no new low
  const tv = ticks.filter(([t]) => t > tH).map(([, v]) => v);
  const mAt = tv.length ? tv.lastIndexOf(Math.min(...tv)) : -1;
  if (!(P > lowSince * 1.004) || tv.length < 3 || mAt > tv.length - 3) return { ok: false, why: "chart: in the zone, waiting for the bounce" };
  if (atrPct > K(cfg, "atrMaxPct")) return { ok: false, why: `chart: too wild (1m ATR ${(atrPct * 100).toFixed(1)}%)` };
  // ---- score points
  const f = {};
  const prevClose = cs1.length >= 2 ? cs1[cs1.length - 2].c : P;
  { const pl2 = pls[pls.length - 1], pl1 = pls[pls.length - 2];
    const phAfter = pl.length ? rawPivots(cs1, 2).filter((p) => p.type === "H" && p.t > pl[pl.length - 1].t).map((p) => p.price) : [];
    f.s1 = pls.length >= 2 && pl2 > pl1 && ((phAfter.length && P > phAfter[phAfter.length - 1]) || (P > pl2 * 1.005 && P > prevClose)) ? 1 : 0; }
  { const cs5 = resample(cs1, 5), l5 = rawPivots(cs5, 2).filter((p) => p.type === "L").map((p) => p.price), rl = (H - lowSince) / span;
    f.s2 = (l5.length >= 2 && l5[l5.length - 1] >= l5[l5.length - 2]) || (rl >= K(cfg, "fibLo") && rl <= K(cfg, "fibHi")) ? 1 : 0; }
  { const S = [...rawPivots(resample(cs1, 5), 2), ...rawPivots(resample(cs1, 15), 2)].filter((p) => p.t < tH).map((p) => p.price);
    const pc = poc(cs1.filter((k) => k.t >= d.tL && k.t <= tH), L, H); if (pc != null) S.push(pc);
    const tol = K(cfg, "confAtr") * a1;
    f.s3 = [fib(0.618), fib(0.786)].some((lvl) => Math.abs(lowSince - lvl) <= tol && S.some((s) => Math.abs(s - lvl) <= tol)) ? 1 : 0; }
  f.s4 = (lv.buys5 || 0) >= K(cfg, "flowRatio") * (lv.sells5 || 0) && (lv.buys5 || 0) > 0 ? 1 : 0;
  { const ring = flow || [];
    if (ring.length < 4) f.s5 = 0;
    else {
      const S1 = mean(ring.filter((q) => now - q.t <= 60000).map((q) => q.s)), S2 = mean(ring.filter((q) => now - q.t > 60000 && now - q.t <= 180000).map((q) => q.s));
      const R = (q) => q.b / Math.max(1, q.b + q.s), cur = ring[ring.length - 1], old = ring.filter((q) => now - q.t >= 120000).pop() || ring[0];
      f.s5 = (S1 != null && S2 != null && S2 > 0 && S1 <= K(cfg, "exhSellDrop") * S2) || (R(cur) - R(old) >= K(cfg, "exhRatioRise") && R(cur) >= K(cfg, "exhRatioMin")) ? 1 : 0;
    } }
  { const closed = since.filter((k) => k.t < minute), red = closed.filter((k) => k.c < k.o), vMax = red.length ? Math.max(...red.map((k) => k.v || 0)) : 0, two = closed.slice(-2);
    f.s6 = vMax > 0 && two.length === 2 && two.every((k) => (k.v || 0) <= K(cfg, "exhVolDry") * vMax) ? 1 : 0; }
  { const iLow = cs1.findIndex((k) => k.t > tH && k.l === lowSince);
    const hammer = (k) => { if (!k) return false; if (k.t >= minute && now - minute < 40000) return false; const rg = k.h - k.l, lw = Math.min(k.o, k.c) - k.l; return rg > 0 && lw >= K(cfg, "wickMin") * rg && lw >= K(cfg, "wickBody") * Math.abs(k.c - k.o); };
    f.s7 = iLow >= 0 && (hammer(cs1[iLow]) || hammer(cs1[iLow + 1])) ? 1 : 0; }
  const wt = weights(x.guard), score = +POINTS.reduce((s, k) => s + f[k] * wt[k], 0).toFixed(2), need = x.guard?.scoreMin ?? K(cfg, "scoreMin");
  const feat = { r: +r.toFixed(3), run: +d.run.toFixed(4), L, H, atrPct: +atrPct.toFixed(4), score, ...f, buys5: lv.buys5 || 0, sells5: lv.sells5 || 0, R: +((lv.buys5 || 0) / Math.max(1, (lv.buys5 || 0) + (lv.sells5 || 0))).toFixed(3), tf: d.tf };
  if (score < need) return { ok: false, why: `chart: score ${score} of 7 (needs ${need})`, feat };
  // ---- ticket
  const c = x.certainty ?? 0;
  let sl = K(cfg, "crSl");
  if (c >= 0.7) sl = Math.max((1 + sl) * (1 - 0.02 * c), (fib(K(cfg, "fibDeep")) - 0.3 * a1) / P) - 1;
  const tp2 = Math.max(0.08, Math.min(fib(0.236) / P - 1, H * 0.995 / P - 1, 0.12));
  const trail = Math.max(K(cfg, "trailAtr") * atrPct, K(cfg, "trailMin"));
  return { ok: true, r, run: d.run, H, L, score, sl: +sl.toFixed(4), deepPx: fib(K(cfg, "fibDeep")), tp2: +tp2.toFixed(4), trail: +trail.toFixed(4), atrPct, feat,
    why: `chart buy: ${d.tf}m swing +${(d.run * 100).toFixed(1)}%, at the ${r.toFixed(3)} retrace, score ${score}/7 (${POINTS.filter((k) => f[k]).join(" ")}), take half +${(K(cfg, "tp1") * 100).toFixed(0)}%, rest +${(tp2 * 100).toFixed(1)}%` };
}

/**
 * One look at an open chartRead position. st (the ticket, kept on the position): { sl, tp2, trail, deepPx, H, t0, tp1Done, hiR, hiT, lowR }.
 * x: { r (vs entry), rStop (vs the first real quote), real, t, px (chart price), close1m (last closed 1m close), Rs (last 2 flow ratios) }.
 * Order: stop, structure, TP1, TP2, trail, flow, stall, time. -> null | { action: "part" } | { action: "close", kind, why, trig }
 */
export function chartExit(st, x, cfg = CR) {
  st.t0 ??= x.t; st.hiT ??= x.t;
  if (x.r > (st.hiR ?? 0)) { st.hiR = x.r; st.hiT = x.t; }
  st.hiR ??= 0;
  const sl = st.sl ?? K(cfg, "crSl");
  if (!st.tp1Done && x.rStop <= sl * (x.real ? 0.8 : 1)) return { action: "close", kind: "stop", why: `stop ${(sl * 100).toFixed(1)}%`, trig: sl };
  if (st.tp1Done && x.r <= K(cfg, "beAfterTp1")) return { action: "close", kind: "lock", why: `half banked, rest out at +${(K(cfg, "beAfterTp1") * 100).toFixed(1)}%`, trig: K(cfg, "beAfterTp1") };
  if (st.deepPx && x.close1m != null && x.close1m < st.deepPx) return { action: "close", kind: "struct", why: "structure: 1m close under the 0.886", trig: x.r };
  if (!st.tp1Done && x.r >= K(cfg, "tp1")) return { action: "part" };
  if (x.r >= (st.tp2 ?? 0.08)) return { action: "close", kind: "take", why: `take +${((st.tp2 ?? 0.08) * 100).toFixed(1)}%`, trig: st.tp2 ?? 0.08 };
  if (st.tp1Done) {
    const tr = st.trail ?? K(cfg, "trailMin"), lvl = (1 + st.hiR) * (1 - tr) - 1;
    if (x.r <= lvl) return { action: "close", kind: "trail", why: `trail ${(tr * 100).toFixed(1)}% from +${(st.hiR * 100).toFixed(1)}%`, trig: lvl };
    if (x.Rs?.length >= 2 && x.Rs.slice(-2).every((R) => R < 0.45)) return { action: "close", kind: "flow", why: "sellers took over (buy share under 45% twice)", trig: x.r };
  }
  if (st.H && x.px >= st.H * 0.99 && x.t - st.hiT >= K(cfg, "stallSec") * 1000) return { action: "close", kind: "stall", why: "stalled at the old high", trig: x.r };
  if (!st.tp1Done && x.t - st.t0 >= K(cfg, "timeStopMin") * 60000) return { action: "close", kind: "time", why: `no +${(K(cfg, "tp1") * 100).toFixed(0)}% in ${K(cfg, "timeStopMin")} min`, trig: x.r };
  return null;
}

/** The self-guard (spec section 5) and the memory the weights learn from. Every 25 chartRead closes, n >= 50: w < p* -> scoreMin+1
 *  (max 7); w > p*+0.1 -> scoreMin-1 (min 4). It never pauses trading. */
export function newGuard(cfg = CR) { return { scoreMin: K(cfg, "scoreMin"), n: 0, closes: [], last: null }; }
export function guardStep(g, close) {
  g.n++; g.closes.push({ ret: close.ret, feat: close.feat || null }); if (g.closes.length > 400) g.closes.shift();
  if (g.n % 25 === 0) {
    const last = g.closes.slice(-50), w = last.filter((c) => c.ret > 0).length / last.length, ev = mean(last.map((c) => c.ret));
    g.last = { n: g.n, w: +w.toFixed(3), ev: +ev.toFixed(4), pStar: P_STAR };
    if (g.n >= 50 && w < P_STAR) g.scoreMin = Math.min(7, g.scoreMin + 1);
    else if (g.n >= 50 && w > P_STAR + 0.1) g.scoreMin = Math.max(4, g.scoreMin - 1);
  }
  return g;
}
