// Unbiased forward test: pools from the "new pools" list at snapshot time, candles pulled ~100 min later. Slow breakout (best Oct config) + birth-buy baselines.
import fs from "node:fs";
import { entrySignal, managePosition } from "../../../../../tools/autotrader/src/lib/strategy.mjs";
const cfg = JSON.parse(fs.readFileSync("/home/user/sculps-store/tools/autotrader/data/tune-top.json", "utf8"))[0].c;
const ps = JSON.parse(fs.readFileSync("data/fwd_interim.json", "utf8")).filter((m) => m.cs && m.cs.length >= 30);
const st = (a) => { const n = a.length, m = a.reduce((s, x) => s + x, 0) / (n || 1), sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1)); return `n=${n} mean=${(m * 100).toFixed(2)}% se=${(sd / Math.sqrt(n || 1) * 100).toFixed(2)} win=${(a.filter((x) => x > 0).length / (n || 1) * 100).toFixed(0)}%`; };
console.log("pools with >=30 candles:", ps.length, "of snapshot; with liq>=2500:", ps.filter((m) => m.liqUsd >= 2500).length);
const rets = [];
for (const m of ps) { let next = 0; for (let i = 0; i < m.cs.length - 3; i++) { if (m.cs[i].t < next) continue; const ok = entrySignal(m.cs, i, cfg, { created: m.created, liqUsd: m.liqUsd }); if (!ok || ok.ok === false) continue; const x = managePosition(m.cs, i, cfg); if (x.open) continue; rets.push(x.ret); next = m.cs[x.j].t + cfg.cooldownMin * 60000; } }
console.log("SLOW BREAKOUT on unbiased new pools (cost 5%):", st(rets), " | at 4%:", st(rets.map((r) => r + 0.01)));
for (const [d, h] of [[3, 15], [3, 60], [10, 30], [10, 60]]) { const r = []; for (const m of ps) { const c = m.cs; if (c.length > d + h && c[d].c > 0) r.push(c[d + h].c / c[d].c - 1 - 0.04); } console.log(`buy minute ${d} after first candle, hold ${h} min (4%):`, st(r)); }
