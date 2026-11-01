// The Oct-28-chosen configs, run on pools they never saw (data/pools-nov.json), plus the top-12 grid and the baselines.
import fs from "node:fs";
import { DEFAULTS, entrySignal, managePosition } from "./src/lib/strategy.mjs";
const nov = JSON.parse(fs.readFileSync("data/pools-nov.json", "utf8"));
console.log(`nov pools ${nov.length}, candles ${nov.reduce((a, m) => a + m.cs.length, 0)}, oldest candle ${new Date(Math.min(...nov.map((m) => m.cs[0].t))).toISOString()}`);
function run(ps, cfg, random = false) {
  const rets = [];
  for (const m of ps) { let next = 0;
    for (let i = 0; i < m.cs.length - 3; i++) { if (m.cs[i].t < next) continue;
      const ok = random ? (i >= 15 && (m.cs[i].t - m.created) / 60000 >= cfg.minAgeMin && (m.cs[i].t - m.created) / 60000 <= cfg.maxAgeMin && (i * 7919 + m.pool.length) % 23 === 0) : entrySignal(m.cs, i, cfg, { created: m.created, liqUsd: m.liqUsd });
      if (!ok || (ok.ok === false)) continue;
      const x = managePosition(m.cs, i, cfg); if (x.open) continue; rets.push(x.ret); next = m.cs[x.j].t + cfg.cooldownMin * 60000; } }
  const n = rets.length, avg = n ? rets.reduce((a, b) => a + b, 0) / n : 0, w = rets.filter((r) => r > 0).length / (n || 1), sd = n > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - avg) ** 2, 0) / (n - 1)) : 0;
  return { n, avg, w, se: sd / Math.sqrt(Math.max(1, n)) };
}
const f = (r) => `n=${String(r.n).padStart(4)} win=${(r.w * 100).toFixed(0).padStart(3)}% avg=${(r.avg * 100).toFixed(2).padStart(6)}% ±${(r.se * 100).toFixed(2)}`;
console.log("current defaults  ", f(run(nov, DEFAULTS)));
console.log("random entries    ", f(run(nov, DEFAULTS, true)));
const top = JSON.parse(fs.readFileSync("data/tune-top.json", "utf8"));
for (const { c, train, test } of top) console.log(`L${c.breakoutLookback} v${c.volSpike} g${c.minGreen} tp${c.tp} sl${c.sl} h${c.maxHoldMin} age${c.minAgeMin}-${c.maxAgeMin} | oct train ${f(train)} | oct test ${f(test)} | NOV ${f(run(nov, c))}`);
