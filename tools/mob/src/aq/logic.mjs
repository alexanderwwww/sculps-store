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

export function round(x, d) { if (x == null || !Number.isFinite(x)) return null; const f = 10 ** d; return Math.round(x * f) / f; }

// Survival: the island lives on the paper wallet. health = equity / start as 0-100.
export function survival(equity, start) {
  const r = start > 0 ? equity / start : 0, health = Math.max(0, Math.min(100, Math.round(r * 100)));
  const stage = r <= 0.1 ? "destroyed" : r < 0.5 ? "critical" : r < 0.9 ? "hurt" : r < 1.1 ? "healthy" : "thriving";
  // risk tightens as health drops: critical = half size and one position; hurt = 3/4 size and two positions
  const limits = { thriving: [1, 3], healthy: [1, 3], hurt: [0.75, 2], critical: [0.5, 1], destroyed: [0, 0] }[stage];
  return { health, stage, ratio: round(r, 4), sizeMult: limits[0], maxOpen: limits[1] };
}
