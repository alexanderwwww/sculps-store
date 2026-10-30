#!/usr/bin/env node
// Replay chartRead v1 over cached 1-minute candles (data/pools.json: [{pool, name, cs:[{t,o,h,l,c,v}]}]) and report, never assert:
// entries per hour, win rate and net EV per trade after the 2.9% round trip, against the break-even win rate p* = 0.65.
// Candles carry no buy/sell counts, so flow (s4) and sell exhaustion (s5) are proxied by green vs red volume over the last 5 bars.
// Each minute is walked as four looks (open, the near extreme, the far extreme, close), 15 s apart.
//   node tools/autotrader/scripts/replay-chart.mjs [pools.json] [--scoreMin 5]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { chartRead, chartExit, CR, FEE, P_STAR } from "../src/lib/chart.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), file = args.find((a) => !a.startsWith("--")) || path.join(HERE, "../data/pools.json");
const scoreMin = Number(args[args.indexOf("--scoreMin") + 1]) || CR.scoreMin;
const cfg = { ...CR, scoreMin };
const pools = JSON.parse(fs.readFileSync(file, "utf8")).filter((p) => Array.isArray(p.cs) && p.cs.length >= 40);
const looks = (k) => (k.c >= k.o ? [k.o, k.l, k.h, k.c] : [k.o, k.h, k.l, k.c]);
const flowOf = (bars) => { let b = 0, s = 0; for (const k of bars) { if (k.c >= k.o) b += k.v || 0; else s += k.v || 0; } return { b, s }; };

const trades = []; let minT = Infinity, maxT = -Infinity, poolHours = 0; const why = new Map();
for (const p of pools) {
  const cs = p.cs; poolHours += (cs[cs.length - 1].t - cs[0].t + 60000) / 3600000; minT = Math.min(minT, cs[0].t); maxT = Math.max(maxT, cs[cs.length - 1].t + 60000);
  const cache = { cs1: null, dead: new Set() }, ring = [];
  let i = 30;
  while (i < cs.length - 1) {
    const now = cs[i].t + 5000, P = cs[i].o, hist = cs.slice(Math.max(0, i - 240), i);
    const f = flowOf(cs.slice(Math.max(0, i - 5), i)); ring.push({ t: now, b: f.b, s: f.s, p: P }); if (ring.length > 40) ring.shift();
    const ticks = cs.slice(Math.max(0, i - 3), i).map((k) => [k.t + 59000, k.c]).concat([[now, P]]);
    cache.cs1 = hist;
    const r = chartRead(cache, P, { liqUsd: p.liqUsd ?? 60000, buys5: f.b, sells5: f.s }, ring, cfg, { now, ticks });
    if (!r.ok) { const k = r.why.replace(/[\d.]+/g, "#"); why.set(k, (why.get(k) || 0) + 1); i++; continue; }
    // walk the exit
    const st = { sl: r.sl, tp2: r.tp2, trail: r.trail, deepPx: r.deepPx, H: r.H, t0: now }; let part = null, out = null, kind = null, j = i;
    for (; j < cs.length && out == null; j++) {
      const lk = looks(cs[j]);
      for (let q = 0; q < 4 && out == null; q++) {
        const px = lk[q], rr = px / P - 1, t = cs[j].t + q * 15000 + (j === i ? 5000 : 0);
        const d = chartExit(st, { r: rr, rStop: rr, real: false, t, px, close1m: j > i ? cs[j - 1].c : null, Rs: null }, cfg);
        if (d?.action === "part") { st.tp1Done = true; part = rr; }
        else if (d) { out = d.kind === "stop" ? Math.min(rr, d.trig) : rr; kind = d.kind; }
      }
    }
    if (out == null) { out = cs[cs.length - 1].c / P - 1; kind = "end"; }
    const gross = part != null ? 0.5 * part + 0.5 * out : out;
    trades.push({ name: p.name, t: now, score: r.score, r: +r.r.toFixed(3), ret: +(gross - FEE).toFixed(4), kind, mins: j - i });
    i = j + 2;     // cooldown: two minutes before the same coin again
  }
}
const hours = Math.max(1 / 60, (maxT - minT) / 3600000), n = trades.length, wins = trades.filter((t) => t.ret > 0).length;
const ev = n ? trades.reduce((a, t) => a + t.ret, 0) / n : null;
const byKind = trades.reduce((m, t) => ((m[t.kind] = (m[t.kind] || 0) + 1), m), {});
console.log(JSON.stringify({
  pools: pools.length, hours: +hours.toFixed(2), scoreMin, entries: n, perHour: +(n / hours).toFixed(2), per150PoolsHour: +(n / Math.max(1e-9, poolHours) * 150).toFixed(2), poolHours: +poolHours.toFixed(1),
  winRate: n ? +(wins / n).toFixed(3) : null, pStar: P_STAR, evNet: ev == null ? null : +ev.toFixed(4), fee: FEE,
  verdict: n < 20 ? "too few trades to judge" : wins / n >= P_STAR ? "above break-even" : "below break-even",
  exits: byKind, topSkips: Object.fromEntries([...why].sort((a, b) => b[1] - a[1]).slice(0, 8)), last: trades.slice(-5),
}, null, 1));
