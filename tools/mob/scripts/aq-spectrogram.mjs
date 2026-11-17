// The giant spectrogram of the training run (Alex, 2026-11-17: "one giant spectrogram of what happened exactly, and we're gonna measure it").
//   node tools/mob/scripts/aq-spectrogram.mjs <export.json.gz> <out.html>
// Reads the frozen export only. Time runs left to right in Athens time, one column per 5 minutes; one row per entry rule.
// Colour = that rule's average result per trade MINUS the coin-flip entry's average in the same 5 minutes (points of % per trade).
import { gunzipSync } from "node:zlib"; import { readFileSync, writeFileSync } from "node:fs";
const [inp, out] = process.argv.slice(2);
if (!inp || !out) { console.error("usage: aq-spectrogram.mjs <export.json.gz> <out.html>"); process.exit(1); }
const d = JSON.parse(gunzipSync(readFileSync(inp)));
const BUCKET = 5, mins = d.brain.filter((r) => r.kind === "arena-lesson" && r.data && Array.isArray(r.data.rows)).map((r) => ({ m: Math.floor(new Date(r.at).getTime() / 60000), rows: r.data.rows }));
const m0 = Math.min(...mins.map((x) => x.m)), m1 = Math.max(...mins.map((x) => x.m)), nb = Math.floor((m1 - m0) / BUCKET) + 1;
const cell = {}; // rule -> bucket -> {n, s, w}
for (const x of mins) { const b = Math.floor((x.m - m0) / BUCKET); for (const r of x.rows) { const c = ((cell[r.e] ||= {})[b] ||= { n: 0, s: 0, w: 0 }); c.n += r.n; c.s += r.n * r.mean; c.w += (r.n * r.win) / 100; } }
// overall order: fresh-minute totals from the agg table, best to worst against random
const fam = {}; for (const r of d.agg) { const e = r.variant.split("|")[0], f = (fam[e] ||= { n: 0, w: 0, p: 0 }); f.n += r.n; f.w += r.wins; f.p += r.pnl_sol; }
const avg = (f) => (f.p / f.n) * 100, rnd = avg(fam.random);
const rules = Object.keys(fam).filter((e) => fam[e].n >= 500 && cell[e]).sort((a, b) => avg(fam[b]) - avg(fam[a]));
const NAME = { random: "COIN FLIP (baseline)", rev1: "Dip 1x", rev15: "Dip 1.5x", rev2: "Dip 2x", rev3: "Dip 3x", revup: "Dip in up-trend", fib382: "Fib 38.2%", fib50: "Fib 50%", fib618: "Fib 61.8%", fib786: "Fib 78.6%", brkpb: "Breakout pullback", brk: "Breakout", mom1: "Momentum 1x", mom2: "Momentum 2x", volspike: "Volume spike", r3: "Recipe Fibonacci", r6: "Recipe breakout", r7: "Recipe bounce", grok_heat: "Grok X heat" };
const grid = rules.map((e) => Array.from({ length: nb }, (_, b) => { const c = cell[e][b], r = cell.random?.[b]; return c && c.n >= 5 && r && r.n >= 5 ? [Math.round((c.s / c.n - r.s / r.n) * 100) / 100, c.n] : null; }));
const base = Array.from({ length: nb }, (_, b) => { const r = cell.random?.[b]; return r && r.n >= 5 ? Math.round((r.s / r.n) * 100) / 100 : null; });
const vol = Array.from({ length: nb }, (_, b) => rules.reduce((a, e) => a + (cell[e][b]?.n || 0), 0));
// rule x hold and rule x pool size, fresh minutes, edge against random in the same cell
const cut = (keyOf) => { const t = {}; for (const r of d.agg) { const e = r.variant.split("|")[0], k = keyOf(r), c = ((t[e] ||= {})[k] ||= { n: 0, p: 0 }); c.n += r.n; c.p += r.pnl_sol; } return t; };
const byHold = cut((r) => r.variant.split("|")[3]), byTier = cut((r) => r.tier), HOLDS = ["h2", "h5", "h10", "h20", "h45"], TIERS = ["A", "B"];
const mat = (t, keys) => rules.map((e) => keys.map((k) => { const c = t[e]?.[k], r = t.random?.[k]; return c && c.n >= 200 && r ? [Math.round(((c.p / c.n) * 100 - (r.p / r.n) * 100) * 100) / 100, Math.round((c.p / c.n) * 10000) / 100, c.n] : null; }));
const P = { m0, BUCKET, nb, rules: rules.map((e) => ({ e, name: NAME[e] || e, n: fam[e].n, win: Math.round((fam[e].w / fam[e].n) * 1000) / 10, avg: Math.round(avg(fam[e]) * 1000) / 1000, edge: Math.round((avg(fam[e]) - rnd) * 1000) / 1000 })),
  grid, base, vol, hold: mat(byHold, HOLDS), tier: mat(byTier, TIERS), HOLDS, TIERS, totals: d.totals, wallet: d.state.arena?.walletSol, start: 12000, minutes: mins.length,
  grok: d.state.helper_training?.grok ? { trades: d.state.helper_training.grok.trades, won: d.state.helper_training.grok.won, lost: d.state.helper_training.grok.lost } : null };
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Aquarius spectrogram</title><style>
html,body{margin:0;background:#05070d;color:#dbe4f5;font:13px ui-monospace,Menlo,Consolas,monospace}#w{width:2400px;padding:28px 32px 36px;box-sizing:border-box}
h1{margin:0;font-size:30px;letter-spacing:.14em;color:#fff}h2{margin:26px 0 8px;font-size:15px;letter-spacing:.14em;color:#c4b5fd}p{margin:4px 0;color:#9fb0c8;max-width:2300px;line-height:1.5}
.k{display:flex;gap:34px;margin:14px 0 4px}.k div{display:flex;flex-direction:column}.k small{font-size:10px;letter-spacing:.14em;color:#8a9bb8}.k b{font-size:26px;color:#fff}.k .g b{color:#4ade80}.k .r b{color:#f87171}
canvas{display:block}table{border-collapse:collapse;font-size:13px}td,th{padding:5px 9px;text-align:right;border:1px solid #131a2c}th{color:#8a9bb8;font-weight:400}td:first-child,th:first-child{text-align:left;color:#dbe4f5}
.row{display:flex;gap:40px;align-items:flex-start}.lg{display:flex;align-items:center;gap:8px;margin:8px 0;color:#9fb0c8}.lg i{display:inline-block;width:420px;height:12px;background:linear-gradient(90deg,#b91c1c,#f87171 30%,#141a2a 50%,#4ade80 70%,#15803d)}
</style></head><body><div id="w">
<h1>AQUARIUS · TRAINING SPECTROGRAM</h1>
<p>Every paper trade of the training run, 17 Nov 2026, 00:27 to 18:17 Athens time. ${P.minutes} minutes of batches, 700 trades a minute. Paper money, real prices.</p>
<div class="k"><div><small>TRADES</small><b>${(P.totals.fresh.n + P.totals.replay.n).toLocaleString("en-US")}</b></div><div class="g"><small>WON</small><b>${(P.totals.fresh.w + P.totals.replay.w).toLocaleString("en-US")}</b></div><div class="r"><small>LOST</small><b>${(P.totals.fresh.n + P.totals.replay.n - P.totals.fresh.w - P.totals.replay.w).toLocaleString("en-US")}</b></div><div><small>ON LIVE MINUTES</small><b>${P.totals.fresh.n.toLocaleString("en-US")}</b></div><div><small>REPLAYED HISTORY</small><b>${P.totals.replay.n.toLocaleString("en-US")}</b></div><div><small>TRAINING WALLET</small><b>${Math.round(P.wallet).toLocaleString("en-US")} of ${P.start.toLocaleString("en-US")} SOL</b></div>${P.grok ? `<div><small>GROK'S MACHINE (HIS REPORT)</small><b>${P.grok.trades.toLocaleString("en-US")} trades</b></div>` : ""}</div>
<h2>1 · THE SPECTROGRAM: EVERY RULE AGAINST THE COIN FLIP, EVERY 5 MINUTES</h2>
<p>Left to right is time. Each row is one entry rule, best at the top, worst at the bottom. Green = in those 5 minutes the rule did better than a coin-flip entry on the same coins; red = worse. Dark = the same. Empty = the rule did not trade (fewer than 5 trades). Fibonacci and the extra dip rules start late because they were added during the run.</p>
<div class="lg"><span>3 points worse</span><i></i><span>3 points better (percent per trade, against the coin flip)</span></div>
<canvas id="c" width="2336" height="10"></canvas>
<h2>2 · THE MARKET ITSELF: WHAT THE COIN FLIP MADE, AND HOW MANY TRADES</h2>
<p>Top strip: the coin-flip entry's own average result per trade in each 5 minutes (green above zero, red below). This is the weather every rule traded in. Bottom strip: trades counted in each 5 minutes.</p>
<canvas id="b" width="2336" height="150"></canvas>
<div class="row"><div><h2>3 · THE WHOLE RUN, LIVE MINUTES ONLY</h2><table id="t1"></table></div>
<div><h2>4 · RULE × HOLD TIME (edge over the coin flip, points)</h2><table id="t2"></table></div>
<div><h2>5 · RULE × POOL SIZE (edge over the coin flip, points)</h2><table id="t3"></table><p style="max-width:520px">A = pools of $500K and more. B = pools from $100K to $500K. Cells need 200 trades.</p></div></div>
</div><script>const P=${JSON.stringify(P)};
const col=(v,cl=3)=>{if(v==null)return"#0a0e18";const x=Math.max(-1,Math.min(1,v/cl)),a=Math.abs(x);const mix=(c0,c1,t)=>c0.map((q,i)=>Math.round(q+(c1[i]-q)*t));const base=[20,26,42],hi=x>0?[34,197,94]:[239,68,68];return"rgb("+mix(base,hi,Math.pow(a,.7)).join(",")+")"};
const L=250,W=2336,cw=(W-L)/P.nb,rh=34,H=P.rules.length*rh+34;const c=document.getElementById("c");c.height=H;const g=c.getContext("2d");g.font="13px ui-monospace,Menlo,monospace";g.textBaseline="middle";
const tl=(b)=>{const dt=new Date((P.m0+b*P.BUCKET)*60000);return dt.toLocaleTimeString("en-GB",{timeZone:"Europe/Athens",hour:"2-digit",minute:"2-digit"})};
P.rules.forEach((r,i)=>{g.fillStyle=r.e==="random"?"#fff":"#dbe4f5";g.fillText(r.name,0,i*rh+rh/2);P.grid[i].forEach((v,b)=>{g.fillStyle=r.e==="random"?(P.base[b]==null?"#0a0e18":"#232b40"):col(v?v[0]:null);g.fillRect(L+b*cw,i*rh+1,Math.ceil(cw),rh-2)})});
g.fillStyle="#8a9bb8";for(let b=0;b<P.nb;b+=12){g.fillRect(L+b*cw,P.rules.length*rh,1,6);g.fillText(tl(b),L+b*cw-16,P.rules.length*rh+20)}
const bc=document.getElementById("b"),h=bc.getContext("2d");h.font="13px ui-monospace,Menlo,monospace";h.textBaseline="middle";h.fillStyle="#dbe4f5";h.fillText("Coin flip, % per trade",0,35);h.fillText("Trades per 5 min",0,110);
const mx=Math.max(...P.base.filter(x=>x!=null).map(Math.abs)),vm=Math.max(...P.vol);h.fillStyle="#1b2236";h.fillRect(L,35,W-L,1);
P.base.forEach((v,b)=>{if(v==null)return;const y=Math.min(32,Math.abs(v)/Math.min(mx,4)*32);h.fillStyle=v>=0?"#4ade80":"#f87171";h.fillRect(L+b*cw,v>=0?35-y:35,Math.ceil(cw),y)});
P.vol.forEach((v,b)=>{const y=v/vm*56;h.fillStyle="#7c8db0";h.fillRect(L+b*cw,140-y,Math.ceil(cw),y)});
const f=(x,dp=2)=>x==null?"":(x>0?"+":"")+x.toFixed(dp),td=(v)=>v==null?"<td></td>":'<td style="background:'+col(v[0],1)+'">'+f(v[0])+"</td>";
document.getElementById("t1").innerHTML="<tr><th>Rule</th><th>Trades</th><th>Won</th><th>Avg % a trade</th><th>Edge over coin flip</th></tr>"+P.rules.map(r=>"<tr><td>"+r.name+"</td><td>"+r.n.toLocaleString("en-US")+"</td><td>"+r.win.toFixed(1)+"%</td><td>"+f(r.avg,3)+'</td><td style="background:'+col(r.edge,1)+'">'+(r.e==="random"?"":f(r.edge,3))+"</td></tr>").join("");
document.getElementById("t2").innerHTML="<tr><th>Rule</th>"+P.HOLDS.map(x=>"<th>"+x.slice(1)+" min</th>").join("")+"</tr>"+P.rules.map((r,i)=>r.e==="random"?"":"<tr><td>"+r.name+"</td>"+P.hold[i].map(td).join("")+"</tr>").join("");
document.getElementById("t3").innerHTML="<tr><th>Rule</th>"+P.TIERS.map(x=>"<th>Pool "+x+"</th>").join("")+"</tr>"+P.rules.map((r,i)=>r.e==="random"?"":"<tr><td>"+r.name+"</td>"+P.tier[i].map(td).join("")+"</tr>").join("");
</script></body></html>`;
writeFileSync(out, html);
console.log(JSON.stringify({ out, minutes: mins.length, buckets: nb, rules: rules.length, from: new Date(m0 * 60000).toISOString(), to: new Date(m1 * 60000).toISOString() }));
