// node tune.mjs  -> grid search over data/pools.json, judged on pools the search never saw, against a random-entry baseline.
import fs from "node:fs";
import { DEFAULTS, entrySignal, managePosition } from "./src/lib/strategy.mjs";
const pools = JSON.parse(fs.readFileSync("data/pools.json", "utf8"));
console.log(`pools ${pools.length}, candles ${pools.reduce((a, m) => a + m.cs.length, 0)}`);
const train = pools.filter((_, i) => i % 2 === 0), test = pools.filter((_, i) => i % 2 === 1);
function run(ps, cfg, random = false) {
  const rets = [];
  for (const m of ps) {
    let next = 0;
    for (let i = 0; i < m.cs.length - 3; i++) {
      if (m.cs[i].t < next) continue;
      const ok = random ? (i >= 15 && (m.cs[i].t - m.created) / 60000 >= cfg.minAgeMin && (m.cs[i].t - m.created) / 60000 <= cfg.maxAgeMin && (i * 7919 + m.pool.length) % 23 === 0) : entrySignal(m.cs, i, cfg, { created: m.created, liqUsd: 1e9 }).ok;
      if (!ok) continue;
      const x = managePosition(m.cs, i, cfg);
      if (x.open) continue;
      rets.push(x.ret); next = m.cs[x.j].t + cfg.cooldownMin * 60000;
    }
  }
  const n = rets.length, w = rets.filter((r) => r > 0).length, avg = n ? rets.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - avg) ** 2, 0) / (n - 1)) : 0;
  return { n, win: n ? w / n : 0, avg, se: n > 1 ? sd / Math.sqrt(n) : 0 };
}
const fmt = (r) => `n=${String(r.n).padStart(4)} win=${(r.win * 100).toFixed(0).padStart(3)}% avg=${(r.avg * 100).toFixed(2).padStart(6)}% ±${(r.se * 100).toFixed(2)}`;
console.log("current defaults   train", fmt(run(train, DEFAULTS)), "| test", fmt(run(test, DEFAULTS)));
console.log("random entries     train", fmt(run(train, DEFAULTS, true)), "| test", fmt(run(test, DEFAULTS, true)));
const grid = [];
for (const breakoutLookback of [5, 10, 20]) for (const volSpike of [1.5, 2, 3]) for (const minGreen of [0.34, 0.67]) for (const tp of [0.25, 0.45, 0.9]) for (const sl of [-0.1, -0.15, -0.25]) for (const maxHoldMin of [30, 60]) for (const minAgeMin of [4, 8]) for (const maxAgeMin of [90, 240]) for (const maxChase of [0.8, 3])
  grid.push({ ...DEFAULTS, breakoutLookback, volSpike, minGreen, tp, sl, maxHoldMin, minAgeMin, maxAgeMin, maxChase });
const scored = grid.map((c) => ({ c, tr: run(train, c) })).filter((x) => x.tr.n >= 20).sort((a, b) => b.tr.avg - a.tr.avg).slice(0, 12);
console.log(`\ngrid ${grid.length}; top by TRAIN expectancy, then judged on TEST (pools never used to pick them):`);
for (const { c, tr } of scored) { const te = run(test, c); console.log(`L${c.breakoutLookback} v${c.volSpike} g${c.minGreen} tp${c.tp} sl${c.sl} h${c.maxHoldMin} age${c.minAgeMin}-${c.maxAgeMin} chase${c.maxChase}  train ${fmt(tr)} | test ${fmt(te)}`); }
fs.writeFileSync("data/tune-top.json", JSON.stringify(scored.map((x) => ({ c: x.c, train: x.tr, test: run(test, x.c) })), null, 1));
