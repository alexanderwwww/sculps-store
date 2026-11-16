// Aquarius pure logic: setups, safety, costs, sizing, stats, replay. No I/O here, so every rule is unit-testable.

const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
export { num };

// GeckoTerminal ohlcv_list rows [t, o, h, l, c, v] (newest first) -> ascending objects.
export function candlesFromGT(list) {
  if (!Array.isArray(list)) return [];
  return list.map((r) => ({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]) }))
    .filter((c) => [c.t, c.o, c.h, c.l, c.c].every(Number.isFinite)).sort((a, b) => a.t - b.t);
}

// Fibonacci pullback on the last hour of 1m candles (gmgn-fib / recipe R3).
export function fibSetup(candles, p, nowSec) {
  const n = candles.length;
  if (n < 15) return { signal: false, why: "too few candles", number: n };
  const last = candles[n - 1];
  const staleSec = Math.round(nowSec - (last.t + 60));
  let iH = 0;
  for (let i = 1; i < n; i++) if (candles[i].h > candles[iH].h) iH = i;
  const H = candles[iH].h;
  let L = Infinity;
  for (let i = 0; i <= iH; i++) L = Math.min(L, candles[i].l);
  const R = H - L, impulsePct = L > 0 ? (R / L) * 100 : 0;
  const base = { staleSec, high: H, low: L, impulsePct: round(impulsePct, 2) };
  if (iH > n - 3) return { ...base, signal: false, why: "no pullback yet (high is the last candle)", number: n - 1 - iH };
  if (impulsePct < p.minImpulsePct) return { ...base, signal: false, why: `impulse too small (< ${p.minImpulsePct}%)`, number: round(impulsePct, 2) };
  let lowAfter = Infinity;
  for (let i = iH + 1; i < n; i++) lowAfter = Math.min(lowAfter, candles[i].l);
  const lvl = (r) => H - r * R;
  const stopLvl = lvl(p.stopLevel);
  if (lowAfter < stopLvl) return { ...base, signal: false, why: `structure broken below ${p.stopLevel}`, number: round(lowAfter, 12) };
  const P = last.c, retrace = (H - P) / R;
  const stopPrice = stopLvl * (1 - p.stopBufferPct / 100), targetPrice = H;
  const out = { ...base, price: P, retrace: round(retrace, 3), stopPrice, targetPrice, extPrice: L + p.ext * R,
    stopPct: round(((P - stopPrice) / P) * 100, 3), targetPct: round(((targetPrice - P) / P) * 100, 3) };
  if (retrace < p.zoneLo || retrace > p.zoneHi) return { ...out, signal: false, why: `price outside the ${p.zoneLo}-${p.zoneHi} zone`, number: out.retrace };
  if (!(last.c > last.o)) return { ...out, signal: false, why: "no bounce candle", number: out.retrace };
  return { ...out, signal: true, why: "golden zone with a bounce", number: out.retrace };
}

// RugCheck full report -> the few fields we judge (kept small for the cache).
export function slimRug(r) {
  if (!r || typeof r !== "object") return null;
  const marketKeys = new Set((r.markets || []).map((m) => m.pubkey));
  const known = new Set(Object.keys(r.knownAccounts || {}));
  const holders = (r.topHolders || []).filter((h) => !marketKeys.has(h.owner) && !marketKeys.has(h.address) && !known.has(h.owner) && !known.has(h.address));
  const pcts = holders.map((h) => Number(h.pct) || 0).sort((a, b) => b - a);
  let lq = 0, lqLocked = 0;
  for (const m of r.markets || []) { const q = Number(m.lp?.quoteUSD) || 0; lq += q; lqLocked += q * ((Number(m.lp?.lpLockedPct) || 0) / 100); }
  return {
    mintAuthority: r.mintAuthority ?? null, freezeAuthority: r.freezeAuthority ?? null, rugged: !!r.rugged,
    danger: (r.risks || []).filter((x) => x.level === "danger").map((x) => x.name),
    topHolderPct: round(pcts[0] || 0, 2), top10Pct: round(pcts.slice(0, 10).reduce((a, b) => a + b, 0), 2),
    lpLockedPct: lq > 0 ? round((lqLocked / lq) * 100, 2) : null, decimals: num(r.token?.decimals), creator: r.creator || null, insiders: (r.topHolders || []).filter((h) => h.insider).map((h) => h.owner).slice(0, 50),
  };
}
export function safety(s, p) {
  if (!s) return { ok: false, reason: "missing data: safety report", number: null };
  if (s.rugged) return { ok: false, reason: "safety: rugged", number: 1 };
  if (s.mintAuthority) return { ok: false, reason: "safety: mint authority enabled", number: 1 };
  if (s.freezeAuthority) return { ok: false, reason: "safety: freeze authority enabled", number: 1 };
  if (s.danger.length) return { ok: false, reason: `safety: ${s.danger[0]}`, number: s.danger.length };
  if (s.topHolderPct > p.topHolderMax) return { ok: false, reason: `safety: top holder over ${p.topHolderMax}%`, number: s.topHolderPct };
  if (s.top10Pct > p.top10Max) return { ok: false, reason: `safety: top 10 over ${p.top10Max}%`, number: s.top10Pct };
  if (s.lpLockedPct == null || s.lpLockedPct < p.lpLockedMin) return { ok: false, reason: `safety: LP locked under ${p.lpLockedMin}%`, number: s.lpLockedPct };
  if (s.decimals == null) return { ok: false, reason: "missing data: token decimals", number: null };
  return { ok: true, reason: "safety pass", number: s.top10Pct };
}

// Measured round trip in % of size: what comes back from the sell quote, minus two network fees.
export const roundTripPct = (sizeSol, backSol, feeSol) => round(((sizeSol - backSol + 2 * feeSol) / sizeSol) * 100, 3);

// Stressed-stop sizing: stressed loss (stressMult x stop + round trip) <= riskPct of equity.
export function sizeFor(equity, cash, stopPct, rtPct, p) {
  const stressed = p.stressMult * stopPct + rtPct;
  const raw = (equity * p.riskPct) / stressed;
  return { sizeSol: round(Math.max(0, Math.min(raw, p.maxSizeSol, cash)), 6), stressedPct: round(stressed, 3), raw: round(raw, 6) };
}

const T = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086, 25: 2.06, 30: 2.042, 40: 2.021, 60: 2.0, 120: 1.98 };
export function tCrit(df) { let best = 1.96; for (const k of Object.keys(T).map(Number).sort((a, b) => b - a)) if (df <= k) best = T[k]; return df > 120 ? 1.96 : best; }
export function stats(pcts) {
  const n = pcts.length, wins = pcts.filter((x) => x > 0).length;
  if (!n) return { n: 0, wins: 0, winRate: null, expectancyPct: null, ci95: null, evidence: "NO EVIDENCE yet" };
  const mean = pcts.reduce((a, b) => a + b, 0) / n;
  let ci95 = null;
  if (n >= 2) { const sd = Math.sqrt(pcts.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)); const h = tCrit(n - 1) * sd / Math.sqrt(n); ci95 = [round(mean - h, 3), round(mean + h, 3)]; }
  const evidence = n < 100 ? "NO EVIDENCE yet" : ci95[0] > 0 ? "EDGE" : "NO EDGE";
  return { n, wins, winRate: round(wins / n, 4), expectancyPct: round(mean, 3), ci95, evidence };
}

// Time Machine for R3: walk stored candles, take every signal, exit on stop / target / time stop (stop first when both
// fall in one candle: conservative), minus the round-trip cost. Signals do not overlap within one pool.
export function replay(candlesByPool, p, costPct) {
  const res = [];
  for (const cs of Object.values(candlesByPool)) {
    let i = 30;
    while (i < cs.length - 1) {
      const win = cs.slice(Math.max(0, i - 59), i + 1);
      const s = fibSetup(win, p, cs[i].t + 60);
      if (!s.signal || s.stopPct >= s.targetPct) { i++; continue; }
      let j = i + 1, exit = null;
      for (; j < cs.length && j <= i + p.timeStopMin; j++) {
        if (cs[j].l <= s.stopPrice) { exit = s.stopPrice; break; }
        if (cs[j].h >= s.targetPrice) { exit = s.targetPrice; break; }
      }
      if (exit == null) { if (j > i + p.timeStopMin) { j = i + p.timeStopMin; exit = cs[j].c; } else break; }
      res.push(round(((exit - s.price) / s.price) * 100 - costPct, 3));
      i = j + 1;
    }
  }
  return { ...stats(res), costPct, trades: res.length };
}

// Replay any setup function on stored candles: net result per signal and how many bars the winners needed to reach target.
export function replaySetup(candlesByPool, setupFn, p, costPct, maxBars = 90) {
  const res = [], toTarget = [];
  for (const cs of Object.values(candlesByPool)) {
    let i = 30;
    while (i < cs.length - 1) {
      const s = setupFn(cs.slice(Math.max(0, i - 59), i + 1), p, cs[i].t + 60);
      if (!s.signal || s.stopPct >= s.targetPct) { i++; continue; }
      let j = i + 1, exit = null, hit = false;
      for (; j < cs.length && j <= i + maxBars; j++) {
        if (cs[j].l <= s.stopPrice) { exit = s.stopPrice; break; }
        if (cs[j].h >= s.targetPrice) { exit = s.targetPrice; hit = true; break; }
      }
      if (exit == null) { if (j > i + maxBars) { j = i + maxBars; exit = cs[j].c; } else break; }
      if (hit) toTarget.push(j - i);
      res.push(round(((exit - s.price) / s.price) * 100 - costPct, 3));
      i = j + 1;
    }
  }
  toTarget.sort((a, b) => a - b);
  return { ...stats(res), costPct, trades: res.length, targetsHit: toTarget.length, medianBarsToTarget: toTarget.length ? toTarget[Math.floor(toTarget.length / 2)] : null };
}
export function round(x, d) { if (x == null || !Number.isFinite(x)) return null; const f = 10 ** d; return Math.round(x * f) / f; }

// Survival: the island lives on the paper wallet. health = equity / start as 0-100.
export function survival(equity, start) {
  const r = start > 0 ? equity / start : 0, health = Math.max(0, Math.min(100, Math.round(r * 100)));
  const stage = r <= 0.1 ? "destroyed" : r < 0.5 ? "critical" : r < 0.9 ? "hurt" : r < 1.1 ? "healthy" : "thriving";
  // risk tightens as health drops: critical = half size and one position; hurt = 3/4 size and two positions
  const limits = { thriving: [1, 5], healthy: [1, 5], hurt: [0.75, 3], critical: [0.5, 1], destroyed: [0, 0] }[stage];
  return { health, stage, ratio: round(r, 4), sizeMult: limits[0], maxOpen: limits[1] };
}

// R5 whale-follow setup. No pullback is waited for: the whales are the trigger. With bars: stop just under the lowest low of
// the last p.stopLookback minutes, never tighter than p.minStopPct, refused when wider than p.maxStopPct. Without bars: the
// fixed p.fixedStopPct. Target = p.rr x the stop distance, so the stop is never larger than the target.
export function whaleSetup(candles, p, nowSec, price) {
  const n = candles?.length || 0;
  if (n >= 5) {
    const last = candles[n - 1], P = last.c, staleSec = Math.round(nowSec - (last.t + 60));
    let low = Infinity;
    for (const c of candles.slice(-p.stopLookback)) low = Math.min(low, c.l);
    let stopPct = ((P - low * (1 - p.stopBufferPct / 100)) / P) * 100;
    if (stopPct < p.minStopPct) stopPct = p.minStopPct;
    const base = { staleSec, price: P, stopPct: round(stopPct, 3), targetPct: round(stopPct * p.rr, 3), stopPrice: P * (1 - stopPct / 100), targetPrice: P * (1 + (stopPct * p.rr) / 100), bars: n, structure: "swing" };
    if (stopPct > p.maxStopPct) return { ...base, signal: false, why: `whale signal but the swing stop is wider than ${p.maxStopPct}%`, number: base.stopPct };
    return { ...base, signal: true, why: "whale signal, stop under the recent swing low", number: base.stopPct };
  }
  if (price == null) return { signal: false, why: "whale signal but no price", number: null, staleSec: 0 };
  const stopPct = p.fixedStopPct;
  return { staleSec: 0, price, stopPct, targetPct: stopPct * p.rr, stopPrice: price * (1 - stopPct / 100), targetPrice: price * (1 + (stopPct * p.rr) / 100), bars: n, structure: "fixed", signal: true, why: `whale signal, fixed ${stopPct}% stop (no bars yet)`, number: stopPct };
}

// ---------------------------------------------------------------- ALWAYS TRADING (aquarius-trader skill, 2026-11-16)
// Hard blocks are never traded. Soft rules only move the score and the size. Tiers decide which soft rules apply.
export const COUNCIL = {
  hardMinLiq: 20000, passScore: 70, exploreEveryMin: 3, maxOpen: 5, riskPct: 1, costMultiple: 6, staleSec: 120,
  maxSizeSol: 0.05, minSizeSol: 0.005, stressMult: 1.5, exploreSize: 0.75, lpLockedMin: 50, top10Max: 25, topHolderMax: 20,
  // sizes stay close to the 0.05 SOL cap on purpose: the network fee is a fixed amount, so a tiny position cannot clear the 6x cost gate
  tiers: { A: { liq: 500000, ageDays: 7, size: 1, bonus: 10 }, B: { liq: 100000, ageDays: 1, size: 0.85, bonus: 5 }, C: { size: 0.6, bonus: 0 } },
};
export const SOFT_RULES = ["lp_locked", "top10", "top_holder", "danger_risk", "young", "boosted", "copycat", "no_whale", "fear"];
export function ageDays(createdAt, nowMs) { const t = createdAt ? Date.parse(createdAt) : NaN; return Number.isFinite(t) ? (nowMs - t) / 86400000 : null; }
export function tierOf(liqUsd, createdAt, nowMs) {
  const a = ageDays(createdAt, nowMs), T = COUNCIL.tiers;
  if (liqUsd >= T.A.liq && a != null && a > T.A.ageDays) return "A";
  if (liqUsd >= T.B.liq && a != null && a > T.B.ageDays) return "B";
  return "C";
}
// The part of the RugCheck report that can never be traded past.
export function hardSafety(s) {
  if (!s) return { ok: false, reason: "missing data: safety report", number: null };
  if (s.rugged) return { ok: false, reason: "safety: rugged", number: 1 };
  if (s.mintAuthority) return { ok: false, reason: "safety: mint authority enabled", number: 1 };
  if (s.freezeAuthority) return { ok: false, reason: "safety: freeze authority enabled", number: 1 };
  if (s.decimals == null) return { ok: false, reason: "missing data: token decimals", number: null };
  return { ok: true, reason: "hard safety pass", number: null };
}
// Soft rules that object to this coin. Tier A (established) is not judged on LP lock or holder concentration.
export function softObjections({ tier, rug, createdAt, boosted, copycat, whale, fng, nowMs }) {
  const o = [];
  if (tier !== "A") {
    if (rug.lpLockedPct == null || rug.lpLockedPct < COUNCIL.lpLockedMin) o.push("lp_locked");
    if (rug.top10Pct > COUNCIL.top10Max) o.push("top10");
    if (rug.topHolderPct > COUNCIL.topHolderMax) o.push("top_holder");
  }
  if (rug.danger?.length) o.push("danger_risk");
  const a = ageDays(createdAt, nowMs);
  if (a == null || a < 1) o.push("young");
  if (boosted) o.push("boosted");
  if (copycat) o.push("copycat");
  if (!whale) o.push("no_whale");
  if (fng != null && fng < 25) o.push("fear");
  return o;
}
export function scoreOf(objections, weights, tier, whale) {
  const w = objections.reduce((a, n) => a + (weights[n] ?? 1), 0);
  return { score: round(100 - 10 * w + (whale ? 15 : 0) + COUNCIL.tiers[tier].bonus, 1), sizeMult: round(Math.max(0.7, 1 - 0.1 * w), 3) };
}
const clampStop = (pct, p) => (pct < p.minStopPct ? p.minStopPct : pct);
function levels(P, stopPct, rr, extra) { return { price: P, stopPct: round(stopPct, 3), targetPct: round(stopPct * rr, 3), stopPrice: P * (1 - stopPct / 100), targetPrice: P * (1 + (stopPct * rr) / 100), ...extra }; }
// Volatility of THIS coin: average true range of 5-minute bars (built from the 1m bars), in % of price. Signals, stops and
// targets are sized in these units, so a quiet coin and a wild coin are judged on their own scale.
export function atr5Pct(candles) {
  const five = [];
  for (let i = candles.length % 5; i + 5 <= candles.length; i += 5) { const g = candles.slice(i, i + 5); five.push({ h: Math.max(...g.map((c) => c.h)), l: Math.min(...g.map((c) => c.l)), c: g[4].c }); }
  if (five.length < 3) return null;
  let sum = 0, n = 0;
  for (let i = 1; i < five.length; i++) { sum += Math.max(five[i].h - five[i].l, Math.abs(five[i].h - five[i - 1].c), Math.abs(five[i].l - five[i - 1].c)); n++; }
  const P = candles[candles.length - 1].c;
  return P > 0 ? round((sum / n / P) * 100, 3) : null;
}
// R6 momentum breakout (tier A/B): the last bar closes above the high of the previous N bars (N adaptive, p.maxN down to
// p.minN), not red, with volume at or above the recent average when volume is known. Stop p.atrStop x ATR5, target rr x stop.
export function momentumSetup(candles, p, nowSec) {
  const n = candles.length, atr = n >= 20 ? atr5Pct(candles) : null;
  if (n < p.maxN + 2 || atr == null) return { signal: false, why: "too few candles", number: n };
  const last = candles[n - 1], staleSec = Math.round(nowSec - (last.t + 60)), P = last.c;
  const stopPct = Math.max(p.minStopPct, p.atrStop * atr), out = { staleSec, atrPct: atr, ...levels(P, stopPct, p.rr, {}) };
  let N = 0, hi = null;
  for (let k = p.maxN; k >= p.minN; k--) { const h = Math.max(...candles.slice(n - 1 - k, n - 1).map((c) => c.h)); if (hi == null) hi = h; if (P > h) { N = k; hi = h; break; } hi = h; }
  out.marginAtr = round(((P / hi - 1) * 100) / atr, 3); // how far over (or under) the breakout level, in the coin's own ATR
  if (!N) return { ...out, signal: false, why: `no breakout (close under the ${p.minN}-bar high)`, number: round((P / hi - 1) * 100, 3) };
  if (!(last.c >= last.o)) return { ...out, signal: false, why: "breakout bar is red", number: 0 };
  // the first 9 paper R6 trades all bought closes 0.001-0.1% over the high on coins that then moved under 2% in 30 minutes:
  // a breakout has to clear the high by a real fraction of the coin's own ATR, or it is noise
  const margin = ((P / hi - 1) * 100) / atr;
  if (margin < p.minBreakAtr) return { ...out, signal: false, why: `breakout too small (${round(margin, 2)}x ATR over the high, needs ${p.minBreakAtr}x)`, number: round(margin, 2) };
  const vols = candles.slice(n - 1 - p.minN, n - 1).map((c) => c.v || 0), avg = vols.reduce((a, b) => a + b, 0) / vols.length;
  if (avg > 0 && (last.v || 0) < avg) return { ...out, signal: false, why: "breakout without a volume uptick", number: round((last.v || 0) / avg, 2) };
  if (stopPct > p.maxStopPct) return { ...out, signal: false, why: `breakout but the stop is wider than ${p.maxStopPct}%`, number: out.stopPct };
  return { ...out, signal: true, bars: N, why: `breakout above the ${N}-bar high (ATR ${atr}%)`, number: round((P / hi - 1) * 100, 3) };
}
export function rsi(closes, len = 14) {
  if (closes.length < len + 1) return null;
  let g = 0, l = 0;
  for (let i = closes.length - len; i < closes.length; i++) { const ch = closes[i] - closes[i - 1]; if (ch > 0) g += ch; else l -= ch; }
  return l === 0 ? 100 : round(100 - 100 / (1 + g / l), 2);
}
// R7 oversold bounce (tier A): price fell at least p.dropAtr x ATR5 from the window high, RSI(14) went under p.rsiMax in the
// last 5 bars, and the last bar is green and closes above the previous close. Stop p.atrStop x ATR5, target rr x stop.
export function bounceSetup(candles, p, nowSec) {
  const n = candles.length, atr = n >= 30 ? atr5Pct(candles) : null;
  if (n < 30 || atr == null) return { signal: false, why: "too few candles", number: n };
  const last = candles[n - 1], prev = candles[n - 2], staleSec = Math.round(nowSec - (last.t + 60)), closes = candles.map((c) => c.c);
  let H = -Infinity, minRsi = Infinity;
  for (const c of candles) H = Math.max(H, c.h);
  for (let k = 0; k < 5; k++) { const r = rsi(closes.slice(0, n - k)); if (r != null) minRsi = Math.min(minRsi, r); }
  const P = last.c, drop = ((H - P) / H) * 100, need = round(Math.max(p.minDropPct, p.dropAtr * atr), 2), stopPct = Math.max(p.minStopPct, p.atrStop * atr);
  const out = { staleSec, atrPct: atr, ...levels(P, stopPct, p.rr, { dropPct: round(drop, 2), rsi: minRsi, needPct: need }) };
  if (drop < need) return { ...out, signal: false, why: `not oversold (down ${round(drop, 2)}% from the high, needs ${need}% = ${p.dropAtr}x ATR)`, number: round(drop, 2) };
  if (!(minRsi < p.rsiMax)) return { ...out, signal: false, why: `RSI ${minRsi} not under ${p.rsiMax}`, number: minRsi };
  if (!(last.c > last.o && last.c > prev.c)) return { ...out, signal: false, why: "oversold but no bounce bar yet", number: minRsi };
  if (stopPct > p.maxStopPct) return { ...out, signal: false, why: `bounce but the stop is wider than ${p.maxStopPct}%`, number: out.stopPct };
  return { ...out, signal: true, why: `oversold bounce (down ${round(drop, 2)}% = ${round(drop / atr, 1)}x ATR, RSI ${minRsi})`, number: minRsi };
}

// Continuous signal STRENGTH (0 = nothing there, 1 = the full rule is met). On paper EXPLORE ranks candidates by it instead
// of waiting for pass/fail; it is stored on every trade so Review can chart result against strength and find the real cut-off.
const c01 = (v) => Math.max(0, Math.min(1, v));
export function strengthOf(sid, t, p, whale) {
  if (!t || t.stopPrice == null || t.targetPrice == null || !(t.stopPct < t.targetPct)) return 0;
  if (sid === "R5") return t.signal ? round(1 + Math.max(0, (whale?.independent || 2) - 2) * 0.25, 2) : 0;
  if (t.signal) return 1;
  if (sid === "R6") return t.marginAtr == null ? 0 : round(Math.min(0.95, c01((t.marginAtr + 1) / (p.minBreakAtr + 1))), 3);
  if (sid === "R3" || sid === "R4") { if (t.retrace == null) return 0; const dz = t.retrace < p.zoneLo ? p.zoneLo - t.retrace : t.retrace > p.zoneHi ? t.retrace - p.zoneHi : 0; return round(c01(0.9 - dz / 0.382), 3); }
  if (sid === "R7") return t.dropPct == null || t.rsi == null || !Number.isFinite(t.rsi) ? 0 : round(Math.min(0.95, 0.6 * c01(t.dropPct / t.needPct) + 0.4 * c01((60 - t.rsi) / 25)), 3);
  return 0;
}
export const STRENGTH_BUCKETS = [[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1], [1, 9]];
