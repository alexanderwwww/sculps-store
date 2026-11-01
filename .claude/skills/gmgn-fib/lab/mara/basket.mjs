// Slow-breakout (best Oct config) trades dumped per pool, then: OOS bootstrap, and basket-vs-single wallet paths. cost = 2*(1.5%slip+1%fee)=5% per strategy.mjs (stricter than 4%).
import fs from "node:fs";
import { entrySignal, managePosition } from "../../../../../tools/autotrader/src/lib/strategy.mjs";
const D = "/home/user/sculps-store/tools/autotrader/data/";
const top = JSON.parse(fs.readFileSync(D + "tune-top.json", "utf8")); const cfg0 = top[0].c;
const pools = JSON.parse(fs.readFileSync(D + "pools.json", "utf8")), nov = JSON.parse(fs.readFileSync(D + "pools-nov.json", "utf8"));
function trades(ps, cfg, costAdj = 0) { const out = [];
  for (const m of ps) { let next = 0;
    for (let i = 0; i < m.cs.length - 3; i++) { if (m.cs[i].t < next) continue;
      const ok = entrySignal(m.cs, i, cfg, { created: m.created, liqUsd: m.liqUsd }); if (!ok || ok.ok === false) continue;
      const x = managePosition(m.cs, i, cfg); if (x.open) continue; out.push({ pool: m.pool, t: m.cs[i].t, tx: m.cs[x.j].t, ret: x.ret + costAdj, why: x.why }); next = m.cs[x.j].t + cfg.cooldownMin * 60000; } }
  return out; }
const st = (a) => { const n = a.length, m = a.reduce((s, x) => s + x, 0) / (n || 1), sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1)); return { n, mean: m, se: sd / Math.sqrt(n || 1), win: a.filter((x) => x > 0).length / (n || 1) }; };
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const octTest = pools.filter((_, i) => i % 2 === 1), octTrain = pools.filter((_, i) => i % 2 === 0);
const res = { cfg: cfg0 };
for (const [name, adj] of [["cost5pct(strategy.mjs)", 0], ["cost4pct", 0.01], ["cost3pct", 0.02]]) {
  const oos = [...trades(octTest, cfg0, adj), ...trades(nov, cfg0, adj)]; const r = oos.map((t) => t.ret);
  const b = []; for (let k = 0; k < 4000; k++) { let s = 0; for (let j = 0; j < r.length; j++) s += r[(rnd() * r.length) | 0]; b.push(s / r.length); } b.sort((x, y) => x - y);
  res[name] = { train: st(trades(octTrain, cfg0, adj).map((t) => t.ret)), oct_test: st(trades(octTest, cfg0, adj).map((t) => t.ret)), nov: st(trades(nov, cfg0, adj).map((t) => t.ret)), oos: st(r), boot95: [b[100], b[3900]], pPos: b.filter((x) => x > 0).length / b.length };
}
const oos4 = [...trades(octTest, cfg0, 0.01), ...trades(nov, cfg0, 0.01)];
res.exits = {}; for (const t of oos4) (res.exits[t.why] ||= []).push(t.ret); for (const k in res.exits) res.exits[k] = { n: res.exits[k].length, mean: st(res.exits[k]).mean };
// wallet paths: resample trades, k concurrent baskets (stake = wallet/k each trade), 60 trades, start 0.01
function path(r, k, nT) { let w = 0.01; for (let i = 0; i < nT; i += k) { let g = 0; for (let j = 0; j < k && i + j < nT; j++) g += r[(rnd() * r.length) | 0]; w *= 1 + g / k; } return w; }
const r4 = oos4.map((t) => t.ret); res.paths = {};
for (const k of [1, 3, 8]) { const ends = []; for (let q = 0; q < 4000; q++) ends.push(path(r4, k, 96)); ends.sort((a, b) => a - b); res.paths["k" + k] = { median: ends[2000], p10: ends[400], p90: ends[3600], pLoss: ends.filter((x) => x < 0.01).length / 4000, pHalf: ends.filter((x) => x < 0.005).length / 4000 }; }
fs.writeFileSync("data/basket.json", JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
