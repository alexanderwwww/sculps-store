import fs from "node:fs";
const pools = JSON.parse(fs.readFileSync("data/pools-oct28.json", "utf8"));
const COST = 0.04;                                  // round trip: slippage + fees + priority (measured ~3.5% live, 5% in tune.mjs)
const train = pools.filter((_, i) => i % 2 === 0), test = pools.filter((_, i) => i % 2 === 1);
const sigs = {
  mom2: (cs, i) => cs[i].c / cs[i].o - 1 >= 0.02 && cs[i].v > 0,
  mom4: (cs, i) => cs[i].c / cs[i].o - 1 >= 0.04,
  pull: (cs, i) => { if (i < 5) return false; const run = cs[i - 2].c / cs[i - 5].c - 1; const red = cs[i - 1].c < cs[i - 1].o; const back = 1 - cs[i - 1].c / Math.max(cs[i - 2].h, cs[i - 3].h); return run >= 0.08 && red && back >= 0.03 && back <= 0.15 && cs[i].c > cs[i].o; },
  volburst: (cs, i) => { if (i < 11) return false; const avg = cs.slice(i - 10, i).reduce((a, k) => a + k.v, 0) / 10; return cs[i].v >= 3 * avg && cs[i].c > cs[i].o && cs[i].c / cs[i].o - 1 < 0.15; },
  green3: (cs, i) => i >= 3 && cs[i].c > cs[i].o && cs[i - 1].c > cs[i - 1].o && cs[i - 2].c > cs[i - 2].o && cs[i].c / cs[i - 2].o - 1 >= 0.03 && cs[i].c / cs[i - 2].o - 1 <= 0.12,
};
function run(ps, sig, tp, sl, hold) {
  const r = [];
  for (const m of ps) { const cs = m.cs; let next = 0;
    for (let i = 12; i < cs.length - hold - 1; i++) { if (cs[i].t < next) continue; if (!sigs[sig](cs, i)) continue;
      const entry = cs[i].c * 1.01; let out = null;                       // buy at the close of the signal candle (+1% slip)
      for (let j = i + 1; j <= i + hold; j++) { if (cs[j].l <= entry * (1 + sl)) { out = sl; break; } if (cs[j].h >= entry * (1 + tp)) { out = tp; break; } }
      if (out === null) out = cs[i + hold].c / entry - 1;
      r.push(out - COST * 0.5); next = cs[i + hold].t; } }
  const n = r.length, avg = n ? r.reduce((a, b) => a + b, 0) / n : 0, w = r.filter((x) => x > 0).length / (n || 1), sd = Math.sqrt(r.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, n - 1));
  return { n, avg, w, se: sd / Math.sqrt(Math.max(1, n)) };
}
const rows = [];
for (const sig of Object.keys(sigs)) for (const tp of [0.03, 0.06, 0.12, 0.25]) for (const sl of [-0.03, -0.06, -0.12]) for (const hold of [2, 4, 8, 15]) {
  const a = run(train, sig, tp, sl, hold), b = run(test, sig, tp, sl, hold); if (a.n >= 30) rows.push({ sig, tp, sl, hold, a, b }); }
rows.sort((x, y) => y.a.avg - x.a.avg);
const f = (r) => `n=${String(r.n).padStart(4)} win=${(r.w * 100).toFixed(0).padStart(3)}% avg=${(r.avg * 100).toFixed(2).padStart(6)}% ±${(r.se * 100).toFixed(2)}`;
console.log("pools", pools.length, "cost per round trip", COST);
for (const r of rows.slice(0, 14)) console.log(r.sig.padEnd(8), "tp", r.tp, "sl", r.sl, "h", r.hold, "| train", f(r.a), "| test", f(r.b));
console.log("best by TEST among those positive on train:");
for (const r of rows.filter((x) => x.a.avg > 0).sort((x, y) => y.b.avg - x.b.avg).slice(0, 8)) console.log(r.sig.padEnd(8), "tp", r.tp, "sl", r.sl, "h", r.hold, "| train", f(r.a), "| test", f(r.b));
const all = rows.filter((x) => x.a.avg > 0), pos = all.filter((x) => x.b.avg > 0); console.log(`positive on train: ${all.length}, still positive on test: ${pos.length}`);
