// Replay the chart trader's own code (chart.mjs entrySetup + manage) minute by minute on downloaded candles.
// Same entries for every variant; exits: CURRENT (no fast target) vs FAST at several %.
import fs from "node:fs";
import { entrySetup, manage, planOf, FIB } from "../src/aq/chart.mjs";
const { data } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const COSTS = [0.25, 0.5, 1.0], FAST = [0, 1, 1.5, 2, 2.5, 3];
function trade(cs, i0, s, fastPct) { // returns gross % on the whole position, minutes held, outcome
  const t0 = cs[i0].t + 60; let plan = planOf(s, t0, fastPct ? { fastPct } : {}), half = null;
  for (let i = i0 + 1; i < cs.length; i++) { const now = cs[i].t + 60, win = cs.slice(Math.max(0, i - 400), i + 1), m = manage(plan, win, now), px = cs[i].c, leg = (px / s.entry - 1) * 100;
    if (m.action === "hold") { if (m.patch) plan = { ...plan, ...m.patch }; continue; }
    if (m.action === "sell_half") { half = leg; plan = { ...plan, ...m.patch }; continue; }
    return { gross: half != null ? (half + leg) / 2 : leg, min: (now - t0) / 60, out: m.reason.split(":")[0], half: half != null, end: i }; }
  return null; // still open when the data ends: left out of every variant
}
const res = {}; let entries = 0, open = 0; const perCoin = {};
for (const coin of data) { const cs = coin.candles; let busyUntil = -1; const legs = new Set();
  for (let i = 150; i < cs.length - 1; i++) { if (i <= busyUntil) continue; const now = cs[i].t + 60;
    const s = entrySetup(cs.slice(Math.max(0, i - 400), i + 1), now); if (!s.signal || legs.has(s.leg.highT)) continue;
    const rows = FAST.map((f) => trade(cs, i, s, f)); if (rows.some((r) => !r)) { open++; legs.add(s.leg.highT); continue; }
    legs.add(s.leg.highT); entries++; perCoin[coin.symbol] = (perCoin[coin.symbol] || 0) + 1; busyUntil = Math.max(...rows.map((r) => r.end)); // one position per coin at a time
    const reward = (s.t1 / s.entry - 1) * 100, stopPct = (1 - s.stop / s.entry) * 100;
    FAST.forEach((f, k) => { (res[f] ||= []).push({ ...rows[k], reward, stopPct, sym: coin.symbol }); }); } }
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0), med = (xs) => { const y = [...xs].sort((a, b) => a - b); return y.length ? y[Math.floor(y.length / 2)] : 0; };
const boot = (xs) => { const m = []; for (let k = 0; k < 2000; k++) { let t = 0; for (let j = 0; j < xs.length; j++) t += xs[Math.floor(Math.random() * xs.length)]; m.push(t / xs.length); } m.sort((a, b) => a - b); return [m[50], m[1949]]; };
console.log(`coins ${data.length}, entries ${entries} (still open at the end of data, left out: ${open}); per coin: ${Object.entries(perCoin).map(([k, v]) => k + ":" + v).join(" ")}`);
console.log(`median stop distance ${med(res[0].map((r) => r.stopPct)).toFixed(2)}%, median distance to target 1 ${med(res[0].map((r) => r.reward)).toFixed(2)}%`);
for (const cost of COSTS) { console.log(`\n== round trip ${cost}% (only entries whose target 1 is >= 3x it, as the live gate demands)`);
  for (const f of FAST) { const rows = res[f].filter((r) => r.reward >= 3 * cost && (!f || f >= 2 * cost)); if (!rows.length) { console.log(`  fast ${f}%: not allowed (under 2x the cost) or no trades`); continue; }
    const net = rows.map((r) => r.gross - cost), ci = boot(net), by = {}; rows.forEach((r) => { by[r.out] = (by[r.out] || 0) + 1; });
    console.log(`  ${f ? "FAST +" + f + "%" : "CURRENT   "}: n ${rows.length}  avg net ${mean(net).toFixed(3)}% [95%: ${ci[0].toFixed(2)}, ${ci[1].toFixed(2)}]  median ${med(net).toFixed(2)}%  won ${(100 * net.filter((x) => x > 0).length / net.length).toFixed(0)}%  half sold ${(100 * rows.filter((r) => r.half).length / rows.length).toFixed(0)}%  median hold ${med(rows.map((r) => r.min)).toFixed(0)} min  worst ${Math.min(...net).toFixed(1)}%  | ${Object.entries(by).map(([k, v]) => k + " " + v).join(", ")}`); } }
