// The clean chart of the training run (Alex, 2026-11-18: "give me the clean chart of what happened... apply some Fibonacci on them").
//   node tools/mob/scripts/aq-clean-chart.mjs <export.json.gz> <grok-study-posts.json> <out.html> [clean|fib]
// The running result of each machine in paper SOL. "fib" adds the Fibonacci levels of each machine's whole move:
// when it reached each level and how fast it was losing on the way there.
import { gunzipSync } from "node:zlib"; import { readFileSync, writeFileSync } from "node:fs";
const [inp, gposts, out, mode = "clean"] = process.argv.slice(2), d = JSON.parse(gunzipSync(readFileSync(inp))), SIZE = 0.9, day = Date.UTC(2026, 10, 17);
const mins = d.brain.filter((r) => r.kind === "arena-lesson" && r.data?.rows).map((r) => ({ t: new Date(r.at).getTime(), p: r.data.rows.reduce((a, x) => a + ((x.n * x.mean) / 100) * SIZE, 0) })).sort((a, b) => a.t - b.t);
const real = d.totals.fresh.p + d.totals.replay.p, raw = mins.reduce((a, m) => a + m.p, 0); let c = 0;
const aq = mins.map((m) => ({ t: m.t, v: (c += m.p) * (real / raw) })); // scaled so the last point is the wallet's real result
const GP = JSON.parse(readFileSync(gposts, "utf8")).map((r) => r.text), gw = new Map();
for (const x of GP.filter((s) => s.includes("item1 "))) for (const m of x.matchAll(/(?:^|\s)(\d{4}),(\d+\.\d+)/g)) gw.set(m[1], Number(m[2]));
const fund = [[43, 330.49], [63, 205.68], [94, 11000], [652, 2409.04]], funded = (min) => 1000 + fund.filter(([m]) => m <= min).reduce((a, [, v]) => a + v, 0);
const gk = [...gw].map(([h, v]) => { const min = Number(h.slice(0, 2)) * 60 + Number(h.slice(2)); return { t: day + min * 60000, v: v - funded(min) }; }).sort((a, b) => a.t - b.t);

const ath = (ms) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" }), N = (x) => Math.round(x).toLocaleString("en-US");
const FIB = [0.236, 0.382, 0.5, 0.618, 0.786, 1], fib = mode === "fib", W = 1800, L = 110, R = 60, PH = fib ? 560 : 400, H = 130 + PH * 2 + 50;
const x0 = Math.min(aq[0].t, gk[0].t), x1 = Math.max(aq.at(-1).t, gk.at(-1).t), X = (t) => L + ((t - x0) / (x1 - x0)) * (W - L - R);

function panel(pts, col, name, sub, T) {
  const B = 46, lo = Math.min(...pts.map((p) => p.v)), Y = (v) => T + 24 + (v / lo) * (PH - B - 24), rows = [];
  let g = "", prev = null, path = "";
  for (const p of pts) { path += (prev && p.t - prev.t < 20 * 60000 ? "L" : "M") + X(p.t).toFixed(1) + "," + Y(p.v).toFixed(1); prev = p; }
  for (let t = Math.ceil(x0 / 7200000) * 7200000; t <= x1; t += 7200000) g += `<line x1="${X(t)}" x2="${X(t)}" y1="${T + 24}" y2="${T + PH - B}" stroke="#0e1422"/><text x="${X(t)}" y="${T + PH - B + 24}" text-anchor="middle" fill="#8a9bb8" font-size="16">${ath(t)}</text>`;
  g += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#3a4563"/><text x="${L - 12}" y="${Y(0) + 6}" text-anchor="end" fill="#8a9bb8" font-size="16">0</text>`;
  if (!fib) for (let v = -500; v >= lo; v -= 500) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#131a2c"/><text x="${L - 12}" y="${Y(v) + 6}" text-anchor="end" fill="#8a9bb8" font-size="16">${N(v)}</text>`;
  else { let pt = pts[0].t, pv = 0;
    for (const fl of FIB) { const lv = lo * fl, hit = pts.find((p) => p.v <= lv + 1e-9) || pts.at(-1), hrs = (hit.t - pt) / 3600000, rate = hrs > 0 ? (lv - pv) / hrs : 0;
      rows.push({ fl, lv, at: hit.t, rate, hrs });
      g += `<line x1="${L}" x2="${W - R}" y1="${Y(lv)}" y2="${Y(lv)}" stroke="#d4a72c" stroke-dasharray="6 6" opacity=".7"/><text x="${L - 12}" y="${Y(lv) + 6}" text-anchor="end" fill="#d4a72c" font-size="15">${(fl * 100).toFixed(1)}%</text><line x1="${X(hit.t)}" x2="${X(hit.t)}" y1="${Y(lv) - 14}" y2="${Y(lv) + 14}" stroke="#ffe08a" stroke-width="2"/><text x="${X(hit.t) + 10}" y="${Y(lv) - 9}" fill="#ffe08a" font-size="15">${ath(hit.t)} · ${N(lv)} SOL · ${N(rate)} SOL an hour</text>`;
      pt = hit.t; pv = lv; } }
  g += `<path d="${path}" fill="none" stroke="${col}" stroke-width="3.2" stroke-linejoin="round"/><text x="${W - R}" y="${T + 50}" text-anchor="end" fill="${col}" font-size="26" font-weight="700">${name} · ${N(pts.at(-1).v)} SOL</text><text x="${W - R}" y="${T + 74}" text-anchor="end" fill="#8a9bb8" font-size="15">${sub}</text>`;
  return { g, rows };
}
const p1 = panel(aq, "#a78bfa", "AQUARIUS", "664,164 trades · 26.4% won", 110), p2 = panel(gk, "#e5e7eb", "GROK", "202,395 trades · 18.8% won", 110 + PH);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#05070d}text{font-family:ui-monospace,Menlo,Consolas,monospace}</style></head><body>
<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#05070d"/>
<text x="${L}" y="58" fill="#fff" font-size="36" font-weight="700" letter-spacing="3">THE TRAINING RUN · ${fib ? "FIBONACCI LEVELS" : "WHAT HAPPENED"}</text>
<text x="${L}" y="94" fill="#9fb0c8" font-size="18">${fib ? "Each machine's whole loss split at the Fibonacci levels: when it reached each level, and how fast it was losing on the way there." : "Running result of each machine in paper SOL, 17 November 2026, Athens time. 866,559 paper trades on real prices."}</text>
${p1.g}${p2.g}
<text x="${L}" y="${H - 22}" fill="#6b7a96" font-size="13">Aquarius: rebuilt from its per-minute batch records, scaled to the wallet's real final result. Grok: his wallet every 5 minutes from his own ledger, less the paper SOL he was funded with.</text>
</svg></body></html>`;
writeFileSync(out, html);
// the bounces: the biggest rises off a low, in SOL and as a share of the drop before them
const ups = (pts) => { const best = []; let lowV = pts[0].v, lowT = pts[0].t; for (const p of pts) { if (p.v < lowV) { lowV = p.v; lowT = p.t; } else if (p.v - lowV > 0) best.push({ rise: p.v - lowV, from: lowT, to: p.t, low: lowV }); }
  const seen = new Set(); return best.sort((a, b) => b.rise - a.rise).filter((x) => (seen.has(x.from) ? false : seen.add(x.from))).slice(0, 3).map((x) => ({ rise: Math.round(x.rise * 10) / 10, from: ath(x.from), to: ath(x.to), shareOfDropPct: Math.round((x.rise / -x.low) * 1000) / 10 })); };
const row = (r) => [r.fl, ath(r.at), Math.round(r.lv), Math.round(r.rate), Math.round(r.hrs * 10) / 10];
console.log(JSON.stringify({ mode, H, aq: p1.rows.map(row), grok: p2.rows.map(row), bouncesAq: ups(aq), bouncesGrok: ups(gk), aqSpanH: Math.round(((aq.at(-1).t - aq[0].t) / 3600000) * 10) / 10, grokSpanH: Math.round(((gk.at(-1).t - gk[0].t) / 3600000) * 10) / 10 }));
