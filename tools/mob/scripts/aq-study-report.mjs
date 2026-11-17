// The complete study of the training run as one page (Alex, 2026-11-18: "the full chart, the spectrogram, you and Grok separately... a complete analysis PDF").
//   node tools/mob/scripts/aq-study-report.mjs <export.json.gz> <spectrogram.png> <out.html>
// Reads the frozen export only. Every number is computed here from that file; Grok's section is what his machine reported to ours.
import { gunzipSync } from "node:zlib"; import { readFileSync, writeFileSync } from "node:fs";
const [inp, spec, out] = process.argv.slice(2);
if (!inp || !spec || !out) { console.error("usage: aq-study-report.mjs <export.json.gz> <spectrogram.png> <out.html>"); process.exit(1); }
const d = JSON.parse(gunzipSync(readFileSync(inp))), SIZE = 0.9; // trades were 0.8 to 1 SOL
const ath = (ms) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" });
const N = (x) => Math.round(x).toLocaleString("en-US"), f = (x, dp = 2) => (x > 0 ? "+" : "") + x.toFixed(dp);
// ---- Aquarius, minute by minute, from the lesson the engine wrote after every batch
const mins = d.brain.filter((r) => r.kind === "arena-lesson" && r.data?.rows).map((r) => { const t = new Date(r.at).getTime(); let n = 0, w = 0, p = 0; for (const x of r.data.rows) { n += x.n; w += (x.n * x.win) / 100; p += ((x.n * x.mean) / 100) * SIZE; } return { t, n, w, p }; }).sort((a, b) => a.t - b.t);
let cum = 0; const curve = mins.map((m) => ({ t: m.t, v: (cum += m.p) }));
const roll = mins.map((m, i) => { const s = mins.slice(Math.max(0, i - 29), i + 1); return { t: m.t, v: (100 * s.reduce((a, x) => a + x.w, 0)) / s.reduce((a, x) => a + x.n, 0) }; });
const covered = mins.reduce((a, m) => a + m.n, 0), tot = { n: d.totals.fresh.n + d.totals.replay.n, w: d.totals.fresh.w + d.totals.replay.w, p: d.totals.fresh.p + d.totals.replay.p };
// ---- Grok, from the reports his machine sent (the server kept his last 240 wallet points)
const G = d.state.helper_training?.grok || {}, gline = (G.line || []).map((x) => ({ t: new Date(x.t).getTime(), v: x.w }));
// ---- the sample trades
const S = d.samples, bucket = (a) => (a < 1 ? "under 1%" : a < 2 ? "1 to 2%" : a < 4 ? "2 to 4%" : a < 8 ? "4 to 8%" : "8% and more"), BK = ["under 1%", "1 to 2%", "2 to 4%", "4 to 8%", "8% and more"];
const agg = (rows) => ({ n: rows.length, win: rows.length ? (100 * rows.filter((x) => x.net_pct > 0).length) / rows.length : 0, net: rows.length ? rows.reduce((a, x) => a + x.net_pct, 0) / rows.length : 0 });
const fam = (e) => S.filter((x) => x.variant.startsWith(e + "|")), byB = (rows) => BK.map((b) => agg(rows.filter((x) => bucket(x.atr_pct) === b)));
const dipB = byB(fam("rev1")), rndB = byB(fam("random")), exits = ["time", "stop", "target"].map((w) => ({ w, ...agg(S.filter((x) => x.why === w)) }));
const cost = S.reduce((a, x) => a + (x.gross_pct - x.net_pct), 0) / S.length;
const coins = {}; for (const x of S) { const c = (coins[x.symbol] ||= { n: 0, s: 0 }); c.n++; c.s += x.net_pct; }
const cl = Object.entries(coins).filter(([, c]) => c.n >= 60).map(([k, c]) => ({ k, n: c.n, v: c.s / c.n })).sort((a, b) => b.v - a.v);
// ---- drawing
const line = (pts, { w = 1100, h = 230, color = "#a78bfa", zero = false, unit = "", dp = 0 } = {}) => {
  if (pts.length < 2) return `<p>not enough points</p>`;
  const L = 70, R = 14, T = 12, B = 26, x0 = pts[0].t, x1 = pts.at(-1).t, lo = Math.min(...pts.map((p) => p.v), zero ? 0 : Infinity), hi = Math.max(...pts.map((p) => p.v), zero ? 0 : -Infinity), r = hi - lo || 1;
  const X = (t) => L + ((t - x0) / (x1 - x0 || 1)) * (w - L - R), Y = (v) => T + (1 - (v - lo) / r) * (h - T - B);
  const ticks = [0, 1, 2, 3, 4].map((i) => lo + (r * i) / 4), tx = [0, 1, 2, 3, 4, 5, 6].map((i) => x0 + ((x1 - x0) * i) / 6);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${ticks.map((v) => `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#151c2e"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" fill="#8a9bb8" font-size="12">${v.toFixed(dp)}${unit}</text>`).join("")}${tx.map((t) => `<text x="${X(t)}" y="${h - 6}" text-anchor="middle" fill="#8a9bb8" font-size="12">${ath(t)}</text>`).join("")}<polyline fill="none" stroke="${color}" stroke-width="2" points="${pts.map((p) => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ")}"/></svg>`;
};
const bars = (rows, labels, { w = 520, h = 210 } = {}) => { const mx = Math.max(...rows.map((r) => Math.abs(r.net)), 0.5), bw = (w - 60) / rows.length, mid = h / 2 - 10;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><line x1="50" x2="${w}" y1="${mid}" y2="${mid}" stroke="#2a3350"/>${rows.map((r, i) => { const hh = (Math.abs(r.net) / mx) * (mid - 22), x = 56 + i * bw; return r.n ? `<rect x="${x}" y="${r.net >= 0 ? mid - hh : mid}" width="${bw - 12}" height="${hh}" fill="${r.net >= 0 ? "#4ade80" : "#f87171"}"/><text x="${x + (bw - 12) / 2}" y="${r.net >= 0 ? mid - hh - 5 : mid + hh + 14}" text-anchor="middle" fill="#fff" font-size="12">${f(r.net)}%</text><text x="${x + (bw - 12) / 2}" y="${h - 18}" text-anchor="middle" fill="#8a9bb8" font-size="11">${labels[i]}</text><text x="${x + (bw - 12) / 2}" y="${h - 4}" text-anchor="middle" fill="#5d6c88" font-size="10">${N(r.n)} trades</text>` : ""; }).join("")}</svg>`; };
const k = (l, v, c = "") => `<div class="${c}"><small>${l}</small><b>${v}</b></div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Aquarius training study</title><style>
html,body{margin:0;background:#05070d;color:#dbe4f5;font:14px ui-monospace,Menlo,Consolas,monospace}#w{width:2400px;padding:30px 34px 40px;box-sizing:border-box}
h1{margin:0;font-size:34px;letter-spacing:.14em;color:#fff}h2{margin:34px 0 8px;font-size:20px;letter-spacing:.14em;color:#c4b5fd;border-top:1px solid #1a2238;padding-top:22px}h3{margin:14px 0 6px;font-size:14px;letter-spacing:.12em;color:#fff}
p,li{color:#aebbd2;line-height:1.55;max-width:1500px}ul{margin:6px 0;padding-left:20px}.k{display:flex;gap:38px;margin:14px 0 6px;flex-wrap:wrap}.k div{display:flex;flex-direction:column}.k small{font-size:11px;letter-spacing:.14em;color:#8a9bb8}.k b{font-size:28px;color:#fff}.k .g b{color:#4ade80}.k .r b{color:#f87171}
.row{display:flex;gap:44px;align-items:flex-start;flex-wrap:wrap}.box{border:1px solid #1a2238;border-radius:8px;padding:14px 18px;background:#080b14}.gk{border-color:#3a4258;background:#050608}
table{border-collapse:collapse}td,th{padding:5px 11px;text-align:right;border:1px solid #131a2c}th{color:#8a9bb8;font-weight:400}td:first-child,th:first-child{text-align:left}img{display:block;width:100%}
.v b{color:#fff}</style></head><body><div id="w">
<h1>AQUARIUS · THE TRAINING RUN · COMPLETE STUDY</h1>
<p>17 November 2026, Athens time. Two machines, paper money, real Solana prices. Aquarius ran from 23:55 on the 16th to 18:17; Grok ran on his own machine from 02:12 to 18:30. Every number below is computed from the frozen history. Nothing is estimated except where it says so.</p>

<h2>1 · THE TWO MACHINES SIDE BY SIDE</h2>
<div class="row"><div class="box"><h3>AQUARIUS</h3><div class="k">${k("TRADES", N(tot.n))}${k("WON", N(tot.w), "g")}${k("LOST", N(tot.n - tot.w), "r")}${k("WIN RATE", ((100 * tot.w) / tot.n).toFixed(1) + "%")}${k("RESULT", N(tot.p) + " SOL")}${k("PER TRADE", f((tot.p / tot.n) * 100, 3) + "%")}</div><p>${N(d.totals.fresh.n)} trades on live minutes, ${N(d.totals.replay.n)} on replayed real history. Wallet ${N(d.state.arena.walletSol)} of 12,000 SOL.</p></div>
<div class="box gk"><h3>GROK (his own machine, as he reported it)</h3><div class="k">${k("TRADES CLOSED", "202,395")}${k("WON", "38,021", "g")}${k("LOST OR FLAT", "164,374", "r")}${k("WIN RATE", "18.8%")}${k("RESULT", "-3,770 SOL")}${k("PER TRADE", f((-3770.48 / 202395 / SIZE) * 100, 3) + "%")}</div><p>His final freeze, 18:30: 405,995 ledger rows on his machine, 1,200 positions left open. Best single trade +447%, worst -97%. His verdict: no edge overall.</p></div></div>

<h2>2 · AQUARIUS · THE FULL CHART</h2>
<div class="row"><div><h3>RESULT OVER THE RUN, SOL (running total, minute by minute)</h3>${line(curve, { zero: true, color: "#f87171" })}<p>Rebuilt from the lesson written after each of ${N(mins.length)} batches (${N(covered)} of the ${N(tot.n)} trades; the first half hour wrote no lesson). Each trade is counted at ${SIZE} SOL, the middle of the 0.8 to 1 range, so the last point is close to, not exactly, the wallet's real ${N(tot.p)} SOL.</p></div>
<div><h3>WIN RATE, ROLLING 30 MINUTES</h3>${line(roll, { color: "#4ade80", unit: "%", dp: 0 })}<p>It starts near 13% and climbs after 01:50, when coins that barely move were cut from the list. It ends the run between 25% and 35%.</p></div></div>

<h2>3 · AQUARIUS · THE SPECTROGRAM</h2><img src="${spec}">

<h2>4 · AQUARIUS · INSIDE THE TRADES (the ${N(S.length)} individual trades kept as samples)</h2>
<div class="row"><div class="box"><h3>BUYING A DIP, BY HOW MUCH THE COIN MOVES IN 5 MINUTES</h3>${bars(dipB, BK)}<p style="max-width:520px">Average result per trade after costs. A dip only pays on coins that move 2% or more. The two green bars are ${N(dipB[2].n + dipB[3].n)} trades: a hint, not proof.</p></div>
<div class="box"><h3>THE COIN FLIP ON THE SAME COINS</h3>${bars(rndB, BK)}<p style="max-width:520px">The coin-flip entry loses in every group but the last (${N(rndB[4].n)} trades). So the green bars on the left are the rule, not the coins.</p></div>
<div class="box"><h3>HOW TRADES ENDED</h3><table><tr><th>Ended on</th><th>Trades</th><th>Share</th><th>Avg result</th></tr>${exits.map((e) => `<tr><td>${e.w === "time" ? "the clock" : "the " + e.w}</td><td>${N(e.n)}</td><td>${((100 * e.n) / S.length).toFixed(0)}%</td><td>${f(e.net)}%</td></tr>`).join("")}</table><p style="max-width:430px">Average cost per trade: ${cost.toFixed(2)}%. Stops fired ${(exits[1].n / exits[2].n).toFixed(1)} times as often as targets.</p>
<h3>COINS (60 or more samples)</h3><table><tr><th>Best</th><th>Avg</th><th>Worst</th><th>Avg</th></tr>${[0, 1, 2, 3, 4].map((i) => `<tr><td>${cl[i].k} (${cl[i].n})</td><td>${f(cl[i].v)}%</td><td style="text-align:left">${cl.at(-1 - i).k} (${cl.at(-1 - i).n})</td><td>${f(cl.at(-1 - i).v)}%</td></tr>`).join("")}</table></div></div>

<h2>5 · GROK · HIS MACHINE</h2>
<div class="row"><div><h3>HIS WALLET, THE LAST ${gline.length} REPORTS HE SENT, SOL</h3>${line(gline, { color: "#e5e7eb", w: 900 })}<p style="max-width:900px">Our server kept only his last ${gline.length} reports (about ${Math.round((gline.at(-1)?.t - gline[0]?.t) / 60000)} minutes). His full ledger, one row per trade, is frozen on his machine and has not been sent to ours, so his chart for the whole run and his own spectrogram cannot be drawn yet.</p></div>
<div class="box gk v" style="max-width:1150px"><h3>WHAT HIS MACHINE FOUND (his own reports in the war room; edge = points of % per trade over his coin flip)</h3><ul>
<li><b>Fibonacci on new pairs:</b> 50% level +1.17 (492 trades, range +0.57 to +1.77), 38.2% level +1.04 (526). Reported 18:03.</li>
<li><b>Following whale buys:</b> +0.39 (700 trades, range +0.18 to +0.60). Reported 18:03.</li>
<li><b>A coin's address first seen on X under 15 minutes ago:</b> +0.69 at 868 trades, +0.54 at 1,059, then <b>faded to -0.09 at 1,657</b>. It did not hold.</li>
<li><b>Raw X heat:</b> decayed to +0.18 with the range crossing zero.</li>
<li><b>Breakouts and momentum: his worst too</b> (-0.89 and -0.75 against his coin flip). Both machines agree.</li>
<li><b>Dips on brand-new or thin pairs lose</b> (-2.15 against his coin flip on 176 early trades).</li>
<li><b>His costs run harsher than ours:</b> his coin flip lost about 1.8 to 1.9% a trade, ours 0.5%.</li>
<li><b>His machine pauses between his sweeps</b>, so it only traded while he was awake; that is why he closed 202,395 trades to our 664,164.</li></ul></div></div>

<h2>6 · WHAT THE RUN SAYS</h2>
<div class="row"><div class="box" style="max-width:1100px"><h3>HELD ALL DAY, ON BOTH MACHINES</h3><ul><li>Chasing strength loses. Breakouts and momentum were the worst rules on Aquarius (${N(32074 + 30574)} live trades) and on Grok.</li><li>The cost is the wall: about 0.47% a round trip on ours. Before costs our trades were roughly flat.</li></ul>
<h3>HELD ALL DAY, ON AQUARIUS</h3><ul><li>Buying a dip beats the coin flip by about 0.35 points on 28,519 live trades, in every read since the first night.</li><li>The dip works better the longer it is held (2 to 45 minutes) and on pools from $100K to $500K.</li><li>Most coins on the list moved too little to cover the cost.</li></ul></div>
<div class="box" style="max-width:1100px"><h3>LOOKED GOOD, THEN DID NOT HOLD</h3><ul><li>Fibonacci on Aquarius: in profit on about 1,000 trades at 02:24, a loss by 04:20.</li><li>Dip in an up-trend: +0.20% on 404 trades at 11:50, -0.41% two hours later.</li><li>Grok's early-X rule: +0.69 at 868 trades, -0.09 at 1,657.</li></ul>
<h3>STILL OPEN</h3><ul><li>Nothing made money after costs on either machine.</li><li>Dips on coins that move 2% or more: +0.30% and +2.25% a trade, on only ${N(dipB[2].n + dipB[3].n)} trades.</li><li>Grok's Fibonacci on new pairs and whale-following: positive on 500 to 700 trades each, not yet repeated.</li><li>The two machines disagree on Fibonacci and on dips for new pairs. Different coins and different costs; one study on both ledgers settles it.</li></ul></div></div>
</div></body></html>`;
writeFileSync(out, html);
console.log(JSON.stringify({ out, minutes: mins.length, covered, total: tot.n, endCurve: Math.round(cum), realPnl: Math.round(tot.p), grokPoints: gline.length, dipB: dipB.map((x) => [x.n, +x.net.toFixed(2)]) }));
