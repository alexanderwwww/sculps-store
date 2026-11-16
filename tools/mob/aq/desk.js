// BOT MODE: "AQUARIUS DESK" — dark terminal, dense panels, canvas 2D only (no three.js).
// Every number is from /api/aq/state. Histories are values the engine reported, sampled by this page and kept in
// localStorage (hist.js). Missing = "—" or an honest empty state. Nothing is invented.
import { DEPTS, GODS } from "./depts.js";
import { fSol, fPct, fUsd, fNum, ago, esc, xFeed, openWorker, dialog, store } from "./main.js";
import { feedReactor, wakeReactor as wake, wireReactor, reactorMood, SHORT, NEON, hoverRider } from "./reactor.js";
import { sample, series, lastOf, specPush, spec } from "./hist.js";
export const wakeReactor = wake;

const D = "—", num = (v) => typeof v === "number" && isFinite(v), MONO = 'ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace';
const cls = (v) => (num(v) ? (v > 0 ? "up" : v < 0 ? "dn" : "") : "");
const deptIdx = (id) => DEPTS.findIndex((d) => d[0] === id);
const dn = (id) => (id && SHORT[id]) || (id ? String(id).toUpperCase() : D);
const dc = (id) => { const i = deptIdx(id); return i < 0 ? "#8894a8" : `rgb(${NEON[i].join(",")})`; };
const hms = (t) => { const x = new Date(t); return isNaN(x) ? D : x.toISOString().slice(11, 19); };
const pct = (v, dp = 1) => (num(v) ? (v > 0 ? "+" : "") + v.toFixed(dp) + "%" : D);
const wr = (v) => (num(v) ? (v * (v <= 1 ? 100 : 1)).toFixed(1) + "%" : D);
const span = (ms) => (ms < 6e4 ? Math.round(ms / 1e3) + "s" : ms < 36e5 ? Math.round(ms / 6e4) + "m" : (ms / 36e5).toFixed(1) + "h");

function openDept(id) { const s = store.state || {}; const d = (s.departments || []).find((x) => x.id === id); const nm = (DEPTS.find((x) => x[0] === id) || [0, id])[1]; const ws = (d && d.workers) || [];
  dialog(`<h3>${esc(nm)}</h3><p class="muted">${d ? (d.live ? "live" : "idle") + " · last run " + ago(d.lastRunAt) + " ago" : "—"}${GODS[id] ? " · " + GODS[id] : ""}</p>${d && d.skills && d.skills.length ? `<p>${d.skills.map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</p>` : ""}<div class="wl" style="max-height:50vh;overflow:auto">${ws.map((w) => `<button class="wk" data-w="${esc(w.id)}"><u class="s-${esc(w.status)}"></u><b>${esc(w.name)}</b><small>${esc(w.note || w.job)}</small></button>`).join("") || "<p class=empty>—</p>"}</div><div class="row"><button class="ghost" data-x>Close</button></div>`, (el, close) => { el.querySelector("[data-x]").onclick = close; el.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => { close(); openWorker(id, b.dataset.w); })); }); }

export function deskHTML() {
  return `<main id="dash" class="desk">
  <div class="wire"><b>LIVE WIRE</b><div class="wire-c"><div class="wire-in" id="d-wire"></div></div></div>
  <div class="strip" id="d-strip"></div>
  <section class="p reactor-row">
    <div class="col-l" id="d-minis"></div>
    <div class="reactor"><div class="ph"><b>THE REACTOR</b><span>twelve coils hold the ring · one ticket rides the current · Aquarius in the core</span><em id="d-rx-r"></em></div>
      <div class="rx-t" id="d-ticket"></div>
      <div class="rx-stage"><canvas id="d-rx"></canvas>
        <div class="rx-k"><div><small>EQUITY</small><b id="d-rx-eq">—</b><i id="d-rx-pl"></i></div><div class="r"><small>CORE</small><b id="d-rx-mood">—</b><i id="d-rx-hp"></i></div></div>
        <div class="rx-cards l" id="d-cards-l"></div><div class="rx-cards r" id="d-cards-r"></div>
        <div class="rx-f" id="d-rx-f"></div></div></div>
    <div class="col-r"><div class="ph"><b>CONTROL STACK</b><em id="d-ctl-m"></em></div><div id="d-ctl"></div></div>
  </section>
  <section class="p pnl"><div class="ph"><b>SWARM PNL</b><span>paper · after costs</span><em id="d-pnl-ev"></em></div><div id="d-pnl"></div><canvas id="d-eqc"></canvas><div id="d-lanes"></div></section>
  <section class="p tape"><div class="ph"><b>THE TAPE</b><span id="d-tape-s">—</span><em id="d-tape-r"></em></div><div class="tape-in"><canvas id="d-tape"></canvas><div id="d-book" class="scroll"></div></div></section>
  <section class="p trace"><div class="ph"><b>THE TRACE</b><span>every pipeline step · dept → dept · verdict</span><em id="d-trace-n"></em></div><div id="d-trace-k"></div><div id="d-trace" class="scroll"></div></section>
  <section class="p pricer"><div class="ph"><b>THE PRICER</b><span>cost gate · round trip vs target vs 6×</span></div><canvas id="d-gauge"></canvas><div id="d-price"></div></section>
  <section class="p spectro"><div class="ph"><b>SIGNAL SPECTROGRAM</b><span>busy share per department · feed health · over time</span><em id="d-spec-n"></em></div><canvas id="d-spec"></canvas></section>
  <section class="p xp"><div class="ph"><b>X · THE MARKET IS SAYING</b><span id="d-x-s"></span></div><div id="d-x" class="scroll"></div></section>
  <section class="p brain"><div class="ph"><b>BRAIN</b><span>strategies · replay · lessons</span></div><div id="d-brain" class="scroll"></div></section>
  <section class="p swarm"><div class="ph"><b>THE SWARM</b><span id="d-wk"></span></div><div id="d-depts" class="depts"></div></section>
  <footer class="status" id="d-status"></footer>
</main>`;
}

// ---------- canvas helpers ----------
function fit(c) { const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); const w = Math.max(10, Math.round(r.width * d)), h = Math.max(10, Math.round(r.height * d)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } const g = c.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); return [g, w, h, d]; }
// pts = [[t, v]]; returns false when there is nothing to draw
function line(g, pts, x, y, w, h, rgbc, fill, lw = 1.4) { if (!pts || !pts.length) return false; if (pts.length === 1) { const dd = Math.min(2, devicePixelRatio || 1), yy = Math.round(y + h / 2) + 0.5; g.strokeStyle = `rgba(${rgbc},.7)`; g.lineWidth = dd; g.setLineDash([4 * dd, 4 * dd]); g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); g.setLineDash([]); g.fillStyle = `rgb(${rgbc})`; g.beginPath(); g.arc(x + w - 3 * dd, yy, 2 * dd, 0, 7); g.fill(); return { mn: pts[0][1], mx: pts[0][1], one: true }; } let mn = Infinity, mx = -Infinity; for (const p of pts) { if (p[1] < mn) mn = p[1]; if (p[1] > mx) mx = p[1]; } const r = mx - mn || Math.abs(mx) * 0.002 || 1, t0 = pts[0][0], tr = pts[pts.length - 1][0] - t0 || 1;
  const X = (p) => x + ((p[0] - t0) / tr) * w, Y = (p) => y + h - ((p[1] - mn) / r) * h * 0.82 - h * 0.09;
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p)))); g.strokeStyle = `rgb(${rgbc})`; g.lineWidth = lw * Math.min(2, devicePixelRatio || 1); g.lineJoin = "round"; g.stroke();
  if (fill) { g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, `rgba(${rgbc},.32)`); gr.addColorStop(1, `rgba(${rgbc},0)`); g.fillStyle = gr; g.fill(); }
  const L = pts[pts.length - 1]; g.fillStyle = `rgb(${rgbc})`; g.beginPath(); g.arc(X(L), Y(L), 2 * Math.min(2, devicePixelRatio || 1), 0, 7); g.fill(); return { mn, mx }; }
const empty = (g, w, h, d, t) => { g.fillStyle = "#5b6577"; g.font = `${10 * d}px ${MONO}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, w / 2, h / 2); g.textAlign = "left"; };
const sparkSvg = (vals, c) => { if (!vals || vals.length < 2) return ""; const n = vals.length; return `<svg viewBox="0 0 60 12" preserveAspectRatio="none"><polyline fill="none" stroke="${c}" stroke-width="1.2" points="${vals.map((v, i) => `${((i / (n - 1)) * 60).toFixed(1)},${(11 - v * 10).toFixed(1)}`).join(" ")}"/></svg>`; };

// ---------- pipeline steps (trace + wire share them) ----------
function steps(s) {
  const c = s.council || {}, vs = [...(c.vetoes || [])]; if (c.last && !vs.some((v) => v.at === c.last.at && v.symbol === c.last.symbol)) vs.unshift(c.last);
  return [...(s.flows || []).map((f) => ({ at: f.at, from: { buy: "council", sell: "risk", fee: "execution", win: "execution", loss: "execution" }[f.kind] || null, to: f.dept, what: f.kind, txt: f.label, v: num(f.sol) ? Math.abs(f.sol).toFixed(4) : D, k: f.kind, o: 0 })),
    ...vs.map((v) => ({ at: v.at, from: "setups", to: "council", what: v.verdict, txt: `${v.symbol || ""} · ${v.reason || ""}`, sym: v.symbol, v: v.number == null ? D : num(v.number) ? +Number(v.number).toPrecision(5) : v.number, k: v.verdict, o: 0 })),
    ...(s.departments || []).filter((d) => d.lastRunAt).map((d) => { const ws = d.workers || [], w = ws.find((x) => x.status === "busy" && x.note) || ws.find((x) => x.note); return { at: d.lastRunAt, from: null, to: d.id, what: "run", txt: w ? `${w.name}: ${w.note}` : "ran", v: `${ws.filter((x) => x.status === "busy").length}/${ws.length}`, k: "run", o: 1 }; })]
    .sort((a, b) => new Date(b.at) - new Date(a.at) || a.o - b.o);
}

// ---------- the tape ----------
function tapeModel(s) {
  const P = s.positions || [], T = s.tape && Array.isArray(s.tape.candles) && s.tape.candles.length > 1 ? s.tape : null, p = (T && P.find((x) => x.symbol === T.symbol || x.mint === T.mint)) || P[0] || null;
  const lv = (q) => (q && num(q.entryPrice) ? { entry: q.entryPrice, stop: num(q.stopPct) ? q.entryPrice * (1 + q.stopPct / 100) : null, target: num(q.targetPct) ? q.entryPrice * (1 + q.targetPct / 100) : null, now: num(q.price) ? q.price : null } : {});
  if (T) { const f = T.fib || {}; return { kind: "candles", sym: T.symbol, candles: T.candles, lv: { ...lv(p && (p.symbol === T.symbol || p.mint === T.mint) ? p : null), ...(num(f.entry) ? { entry: f.entry } : {}), ...(num(f.stop) ? { stop: f.stop } : {}), ...(num(f.target) ? { target: f.target } : {}) }, hi: num(f.high) ? f.high : null, lo: num(f.low) ? f.low : null, sub: `${esc(T.symbol || D)} · 1m candles${T.src ? " · " + esc(T.src) : ""}${T.verdict ? " · " + esc(T.verdict) : ""}`, right: `${T.candles.length} bars` }; }
  if (p) return { kind: "line", sym: p.symbol, pts: series("px:" + p.id), lv: lv(p), sub: `${esc(p.symbol)} · ${esc(p.strategy || D)} · entry ${fUsd(p.entryPrice)} · now ${fUsd(p.price)}`, right: "price line · sampled by this page · no candles in state" };
  return { kind: "line", sym: "SOL", pts: series("sol"), lv: {}, sub: "no active candidate · SOL reference line", right: "sampled by this page · no candles in state" };
}
function drawTape(c, m) {
  const [g, w, h, d] = fit(c), padR = 62 * d, padB = 15 * d, padT = 8 * d, pw = w - padR, hasV = m.kind === "candles" && m.candles.some((k) => num(k.v) && k.v > 0), vh = hasV ? (h - padB) * 0.16 : 0, ph = h - padB - padT - vh;
  g.font = `${9 * d}px ${MONO}`; g.textBaseline = "middle";
  let lo = Infinity, hi = -Infinity; const inc = (v) => { if (num(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
  if (m.kind === "candles") for (const k of m.candles) { inc(k.h); inc(k.l); } else for (const p of m.pts || []) inc(p[1]);
  const n0 = lo; for (const k of ["entry", "stop", "target", "now"]) inc(m.lv[k]); inc(m.hi); inc(m.lo);
  if (!isFinite(lo)) return empty(g, w, h, d, "no price reported yet");
  if (hi === lo) { hi = lo * 1.002 || 1; lo = lo * 0.998; } const pad = (hi - lo) * 0.06; lo -= pad; hi += pad; const Y = (v) => padT + ph - ((v - lo) / (hi - lo)) * ph;
  g.strokeStyle = "rgba(120,140,170,.10)"; g.lineWidth = 1; g.fillStyle = "#5b6b82"; g.textAlign = "left";
  for (let i = 0; i <= 5; i++) { const v = lo + ((hi - lo) * i) / 5, y = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(pw, y); g.stroke(); g.fillText(fUsd(v), pw + 5 * d, y); }
  for (let i = 1; i < 8; i++) { const x = Math.round((pw * i) / 8) + 0.5; g.beginPath(); g.moveTo(x, padT); g.lineTo(x, h - padB); g.stroke(); }
  // fib grid: between the swing low/high when the engine sends them, else between stop and target
  const f0 = num(m.lo) ? m.lo : m.lv.stop, f1 = num(m.hi) ? m.hi : m.lv.target;
  if (num(f0) && num(f1)) for (const f of [0.236, 0.382, 0.5, 0.618, 0.786]) { const y = Y(f0 + (f1 - f0) * f); g.strokeStyle = f === 0.618 ? "rgba(243,210,122,.7)" : "rgba(140,160,200,.28)"; g.setLineDash([3 * d, 4 * d]); g.beginPath(); g.moveTo(0, y); g.lineTo(pw, y); g.stroke(); g.setLineDash([]); g.fillStyle = f === 0.618 ? "#f3d27a" : "#6b7c90"; g.fillText(String(f), 4 * d, y - 6 * d); }
  let t0 = null, t1 = null;
  if (m.kind === "candles") { const cs = m.candles, n = cs.length, cw = pw / Math.max(n, 30), bw = Math.max(1, cw * 0.64), vmax = Math.max(...cs.map((k) => k.v || 0)) || 1; t0 = cs[0].t * 1000; t1 = cs[n - 1].t * 1000;
    cs.forEach((k, i) => { const x = pw - (n - i - 0.5) * cw, up = k.c >= k.o, cl = up ? "#22ff88" : "#ff4d6a"; g.strokeStyle = cl; g.fillStyle = cl; g.lineWidth = Math.max(1, d); g.beginPath(); g.moveTo(Math.round(x) + 0.5, Y(k.h)); g.lineTo(Math.round(x) + 0.5, Y(k.l)); g.stroke(); const y1 = Y(Math.max(k.o, k.c)), y2 = Y(Math.min(k.o, k.c)); g.fillRect(x - bw / 2, y1, bw, Math.max(d, y2 - y1));
      if (hasV) { g.globalAlpha = 0.55; const bh = ((k.v || 0) / vmax) * vh; g.fillRect(x - bw / 2, h - padB - bh, bw, bh); g.globalAlpha = 1; } }); }
  else if (m.pts && m.pts.length > 1) { const pts = m.pts, a = pts[0][0], r = pts[pts.length - 1][0] - a || 1; t0 = a; t1 = pts[pts.length - 1][0]; g.beginPath(); pts.forEach((p, i) => { const x = ((p[0] - a) / r) * pw, y = Y(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = "#40e8ff"; g.lineWidth = 1.6 * d; g.lineJoin = "round"; g.stroke(); g.lineTo(pw, h - padB); g.lineTo(0, h - padB); g.closePath(); const gr = g.createLinearGradient(0, padT, 0, h - padB); gr.addColorStop(0, "rgba(64,232,255,.22)"); gr.addColorStop(1, "rgba(64,232,255,0)"); g.fillStyle = gr; g.fill(); }
  else { g.fillStyle = "#5b6577"; g.textAlign = "center"; g.fillText("line builds while the desk is open", pw / 2, padT + ph / 2); g.textAlign = "left"; }
  for (const [nm, v, cl] of [["TARGET", m.lv.target, "#22ff88"], ["ENTRY", m.lv.entry, "#e2e8f0"], ["STOP", m.lv.stop, "#ff4d4d"], ["NOW", m.lv.now ?? (m.kind === "candles" ? m.candles[m.candles.length - 1].c : m.pts && m.pts.length ? m.pts[m.pts.length - 1][1] : null), "#40e8ff"]]) if (num(v)) { const y = Math.round(Y(v)) + 0.5; g.strokeStyle = cl; g.lineWidth = d; if (nm !== "NOW") g.setLineDash([6 * d, 3 * d]); g.beginPath(); g.moveTo(0, y); g.lineTo(pw, y); g.stroke(); g.setLineDash([]); g.fillStyle = cl; g.fillRect(pw, y - 7 * d, padR, 14 * d); g.fillStyle = "#05070d"; g.font = `700 ${8.5 * d}px ${MONO}`; g.fillText(fUsd(v), pw + 4 * d, y + 0.5 * d); g.fillStyle = cl; g.textAlign = "right"; g.fillText(nm, pw - 5 * d, y - 6 * d); g.textAlign = "left"; g.font = `${9 * d}px ${MONO}`; }
  if (t0) { g.fillStyle = "#5b6b82"; g.textBaseline = "alphabetic"; g.fillText(hms(t0).slice(0, 5), 2 * d, h - 3 * d); g.textAlign = "right"; g.fillText(hms(t1).slice(0, 5) + " UTC", pw, h - 3 * d); g.textAlign = "left"; }
  void n0;
}

// ---------- the pricer gauge ----------
function drawGauge(c, m) {
  const [g, w, h, d] = fit(c), cx = w / 2, cy = h - 16 * d, R = Math.min(w / 2 - 62 * d, h - 34 * d), lw = 11 * d, A0 = Math.PI, base = m.rt ?? m.assumed, six = num(base) ? base * 6 : null, max = Math.max(num(m.tgt) ? m.tgt : 0, six || 0, 1) * 1.18, ang = (v) => A0 + Math.min(1, Math.max(0, v / max)) * Math.PI;
  const arc = (a, b, cl, wd = lw) => { g.strokeStyle = cl; g.lineWidth = wd; g.beginPath(); g.arc(cx, cy, R, a, b); g.stroke(); };
  arc(A0, A0 + Math.PI, "#141b2b");
  g.font = `${8 * d}px ${MONO}`; g.textAlign = "center"; g.textBaseline = "middle";
  if (num(base)) { const dim = m.rt == null ? 0.45 : 1; g.globalAlpha = dim; arc(ang(0), ang(base), "#ff4d4d"); arc(ang(base), ang(six), "#f5b83d"); arc(ang(six), A0 + Math.PI, "#18c46e"); g.globalAlpha = 1;
    for (const [v, lb, cl] of [[base, m.rt == null ? "REPLAY COST" : "COST", "#ff8a8a"], [six, "6×", "#f3d27a"]]) { const a = ang(v); g.strokeStyle = cl; g.lineWidth = 2 * d; g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - lw), cy + Math.sin(a) * (R - lw)); g.lineTo(cx + Math.cos(a) * (R + lw), cy + Math.sin(a) * (R + lw)); g.stroke(); g.fillStyle = cl; g.textAlign = Math.cos(a) < -0.25 ? "right" : Math.cos(a) > 0.25 ? "left" : "center"; g.fillText(lb, cx + Math.cos(a) * (R + lw + 5 * d), cy + Math.sin(a) * (R + lw + 5 * d)); } }
  for (let i = 0; i <= 10; i++) { const a = A0 + (i / 10) * Math.PI; g.strokeStyle = "rgba(160,180,210,.35)"; g.lineWidth = d; g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - lw * 0.5 - 7 * d), cy + Math.sin(a) * (R - lw * 0.5 - 7 * d)); g.lineTo(cx + Math.cos(a) * (R - lw * 0.5 - 3 * d), cy + Math.sin(a) * (R - lw * 0.5 - 3 * d)); g.stroke(); }
  g.textAlign = "left"; g.fillStyle = "#5b6b82"; g.fillText("0%", cx - R - lw / 2, cy + 9 * d); g.textAlign = "right"; g.fillText(max.toFixed(0) + "%", cx + R + lw / 2, cy + 9 * d); g.textAlign = "center";
  if (num(m.tgt)) { const a = ang(m.tgt), cl = m.pass == null ? "#e2e8f0" : m.pass ? "#22ff88" : "#ff4d4d"; g.strokeStyle = cl; g.lineWidth = 2.5 * d; g.lineCap = "round"; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - lw), cy + Math.sin(a) * (R - lw)); g.stroke(); g.lineCap = "butt"; g.fillStyle = cl; g.beginPath(); g.arc(cx, cy, 4.5 * d, 0, 7); g.fill(); }
  else { g.fillStyle = "#2a3346"; g.beginPath(); g.arc(cx, cy, 4.5 * d, 0, 7); g.fill(); }
  g.fillStyle = m.pass == null ? "#7d8aa0" : m.pass ? "#22ff88" : "#ff4d4d"; g.font = `700 ${m.pass == null ? 9 * d : 17 * d}px ${MONO}`; g.fillText(m.pass == null ? (num(m.tgt) ? "NO MEASURED COST" : "NO TARGET") : m.pass ? "PASS" : "BLOCK", cx, cy - R * (m.pass == null ? 0.3 : 0.5));
  if (num(m.tgt) && num(m.rt) && m.rt > 0) { g.font = `${9 * d}px ${MONO}`; g.fillStyle = "#aab6c8"; g.fillText(`target ÷ cost ${(m.tgt / m.rt).toFixed(1)}×`, cx, cy + 9 * d); }
}

// ---------- spectrogram ----------
const RAMP = [[11, 16, 38], [59, 29, 143], [181, 23, 158], [247, 127, 0], [255, 230, 109]];
const heat = (v) => { const x = Math.max(0, Math.min(1, v)) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, x | 0), f = x - i, a = RAMP[i], b = RAMP[i + 1]; return `rgb(${(a[0] + (b[0] - a[0]) * f) | 0},${(a[1] + (b[1] - a[1]) * f) | 0},${(a[2] + (b[2] - a[2]) * f) | 0})`; };
function drawSpec(c, rows, feeds) {
  const [g, w, h, d] = fit(c), lw = 62 * d, rw = 30 * d, pb = 13 * d, nR = 12 + (feeds.length ? feeds.length + 0.6 : 0), rh = (h - pb) / nR, cols = Math.max(rows.length, 14), cw = (w - lw - rw) / cols, x0 = lw + (cols - rows.length) * cw;
  g.font = `${Math.min(8.5 * d, rh * 0.82)}px ${MONO}`; g.textBaseline = "middle";
  const L = rows[rows.length - 1];
  for (let r = 0; r < 12; r++) { const y = r * rh; g.fillStyle = "#0b1020"; g.fillRect(lw, y + 0.5, w - lw - rw, rh - 1); g.fillStyle = dc(DEPTS[r][0]); g.textAlign = "left"; g.fillText(SHORT[DEPTS[r][0]], 2 * d, y + rh / 2); if (L && num(L[1][r])) { g.fillStyle = "#c7d2e3"; g.textAlign = "right"; g.fillText(Math.round(L[1][r] * 100) + "%", w - 1 * d, y + rh / 2); } }
  feeds.forEach((f, i) => { const y = (12.6 + i) * rh; g.fillStyle = "#0b1020"; g.fillRect(lw, y + 0.5, w - lw - rw, rh - 1); g.fillStyle = "#6b7c90"; g.textAlign = "left"; g.fillText(f.replace(/geckoterminal/, "gecko").replace(/dexscreener/, "dexscr").slice(0, 11).toUpperCase(), 2 * d, y + rh / 2); if (L && L[2] && f in L[2]) { g.fillStyle = L[2][f] ? "#22ff88" : "#ff4d4d"; g.textAlign = "right"; g.fillText(L[2][f] ? "OK" : "DOWN", w - 1 * d, y + rh / 2); } });
  rows.forEach((row, i) => { const x = x0 + i * cw, bw = Math.max(1, cw - (cw > 3 * d ? 1 : 0)); for (let r = 0; r < 12; r++) { const v = row[1][r]; if (!num(v)) continue; g.fillStyle = heat(0.06 + v * 0.94); g.fillRect(x, r * rh + 0.5, bw, rh - 1); }
    feeds.forEach((f, k) => { const v = row[2] ? row[2][f] : null; if (v == null) return; g.fillStyle = v ? "#0e8f6a" : "#ff4d4d"; g.fillRect(x, (12.6 + k) * rh + 0.5, bw, rh - 1); }); });
  g.fillStyle = "#5b6b82"; g.textBaseline = "alphabetic"; g.font = `${8 * d}px ${MONO}`;
  if (rows.length) { g.textAlign = "left"; g.fillText(hms(rows[0][0]).slice(0, 5), x0, h - 2 * d); g.textAlign = "right"; g.fillText("now", w - rw, h - 2 * d); } g.textAlign = "left";
}

// ---------- render ----------
const cache = new Map(); let wireKey = "", cardsBuilt = false;
export function renderDesk(root, s) {
  const $ = (id) => root.querySelector("#" + id); const set = (id, html) => { if (cache.get(id) === html) return; const e = $(id); if (e) { e.innerHTML = html; cache.set(id, html); } };
  if (!s) return;
  const deps = s.departments || [], P = s.positions || [], T = s.trades || {}, mk = s.market || {}, sv = s.survival || null, L = s.council && s.council.last, all = deps.flatMap((d) => d.workers || []);
  const dep = (id) => deps.find((x) => x.id === id), busyOf = (id) => { const d = dep(id); return d ? (d.workers || []).filter((w) => w.status === "busy").length : null; };
  // ---- samples (real values, kept across reloads)
  sample("eq", s.equitySol); sample("sol", mk.sol && mk.sol.price); sample("btc", mk.btc && mk.btc.price); sample("fg", mk.fearGreed && mk.fearGreed.value, 60000);
  sample("liq", (mk.trending || []).reduce((a, t) => a + (num(t.liqUsd) ? t.liqUsd : 0), 0) || null); sample("fees", (s.flows || []).filter((f) => f.kind === "fee").reduce((a, f) => a + Math.abs(f.sol || 0), 0)); sample("whales", busyOf("whales")); sample("busy", all.length ? all.filter((w) => w.status === "busy").length : null);
  for (const p of P) sample("px:" + p.id, p.price, 10000, 360);
  const feedsNow = s.health && typeof s.health === "object" ? Object.fromEntries(Object.entries(s.health).filter(([, v]) => typeof v === "boolean").map(([k, v]) => [k, v ? 1 : 0])) : {};
  specPush(DEPTS.map(([id]) => { const d = dep(id), ws = (d && d.workers) || []; return ws.length ? +(ws.filter((w) => w.status === "busy").length / ws.length).toFixed(3) : null; }), feedsNow);
  feedReactor(s);
  const rc = $("d-rx"); if (rc) { wireReactor(rc, openDept); const pad = innerWidth <= 720 ? 0 : innerWidth <= 1280 ? 128 : 156; if (rc.dataset.pad !== String(pad)) rc.dataset.pad = pad; }
  const ST = steps(s), gk = s.helpers && s.helpers.grok, gOn = gk === "connected" || (gk && (gk.status === "connected" || gk.lastText));

  // ---- live wire: newest verdicts, flows, lessons and X messages, scrolling
  { const items = [...ST.filter((x) => x.k !== "run").slice(0, 12).map((x) => ({ at: x.at, h: `<b class="k-${esc(x.k)}">${esc(String(x.what).toUpperCase())}</b> ${esc(x.txt)}${x.v !== D ? ` <u>${esc(x.v)}</u>` : ""}` })), ...(s.brain || []).slice(0, 3).map((b) => ({ at: b.at, h: `<b class="k-brain">BRAIN</b> ${esc(b.text)}` })), ...xFeed(s).slice(0, 3).map((m) => ({ at: m.at, h: `<b class="k-x">X ${esc(String(m.label || "").toUpperCase())}</b> ${esc(m.text)}` }))].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 14);
    const key = items.map((i) => i.at + i.h).join("|"); if (key !== wireKey) { wireKey = key; const e = $("d-wire"); const one = items.map((i) => `<span class="w"><time>${hms(i.at)}</time>${i.h}</span>`).join(""); e.innerHTML = items.length ? one + one : `<span class="w muted">no verdicts or flows yet · the wire starts with the first council verdict</span>`; e.style.animationDuration = Math.max(40, e.textContent.length * 0.11) + "s"; e.classList.toggle("run", items.length > 0); } }
  // ---- department chips
  set("d-strip", DEPTS.map(([id, nm], i) => { const d = dep(id), ws = (d && d.workers) || [], b = ws.filter((w) => w.status === "busy").length, bl = ws.filter((w) => w.status === "blocked").length;
    return `<button class="ag ${d && d.live ? "live" : ""}" data-dept="${id}" style="--c:${dc(id)}" title="${esc(nm)}"><i></i><b>${SHORT[id]}</b><em>${ws.length ? `${b}/${ws.length}` : D}</em><small>${d ? (d.live ? "LIVE" : "IDLE") : D}${bl ? ` · <u>${bl} BLK</u>` : GODS[id] ? " · " + GODS[id].toUpperCase() : ""}</small><s style="--w:${ws.length ? ((b / ws.length) * 100).toFixed(0) : 0}%"></s></button>`; }).join(""));
  root.querySelectorAll("#d-strip .ag").forEach((b) => { b.onclick = () => openDept(b.dataset.dept); b.onmouseenter = () => hoverRider(b.dataset.dept); b.onmouseleave = () => hoverRider(null); });
  // ---- mini cards
  const ch = (o) => (o && num(o.ch24) ? ` <i class="${cls(o.ch24)}">${pct(o.ch24)}</i>` : "");
  const minis = [["SOL", "sol", (mk.sol ? fUsd(mk.sol.price) : D) + ch(mk.sol), "64,232,255", "24h change"], ["BTC", "btc", (mk.btc ? fUsd(mk.btc.price) : D) + ch(mk.btc), "247,147,26", "24h change"], ["BOOK", "liq", fUsd(lastOf("liq")), "167,139,250", `liquidity · ${(mk.trending || []).length} trending pools`], ["COSTS", "fees", (num(lastOf("fees")) ? lastOf("fees").toFixed(4) : D) + " SOL", "250,204,21", "fees in the last 40 flows"], ["SWARM", "busy", all.length ? `${all.filter((w) => w.status === "busy").length}/${all.length}` : D, "34,255,136", "workers busy"], ["SENTIMENT", "fg", mk.fearGreed ? `${mk.fearGreed.value} · ${esc(mk.fearGreed.label || "")}` : D, "255,122,217", "fear & greed index"]];
  const mEl = $("d-minis"); if (mEl && !mEl.children.length) mEl.innerHTML = `<div class="ctl-h" style="margin-top:0">INJECTOR BANK</div>` + minis.map(([n, k, , c]) => `<div class="mini" style="--c:rgb(${c})"><div><b>${n}</b><em data-v="${k}"></em></div><canvas data-k="${k}"></canvas><small data-s="${k}"></small></div>`).join("");
  minis.forEach(([, k, v, c, sub]) => { const e = mEl.querySelector(`[data-v=${k}]`); if (e.innerHTML !== v) e.innerHTML = v; const pts = series(k), sp = pts.length > 1 ? pts[pts.length - 1][0] - pts[0][0] : 0; mEl.querySelector(`[data-s=${k}]`).textContent = sub + (sp ? " · " + span(sp) : " · sampling");
    const [g, w, h] = fit(mEl.querySelector(`[data-k=${k}]`)); g.strokeStyle = "rgba(120,140,170,.10)"; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, Math.round((h * i) / 4) + 0.5); g.lineTo(w, Math.round((h * i) / 4) + 0.5); g.stroke(); } line(g, pts, 0, 0, w, h, c, true); });
  // ---- reactor overlays: equity, core mood, the ticket row, the rider cards
  set("d-rx-eq", fSol(s.equitySol)); set("d-rx-pl", `<span class="${cls(s.pnlTotalSol)}">${fSol(s.pnlTotalSol, true)}</span> total · <span class="${cls(s.pnlTodaySol)}">${fSol(s.pnlTodaySol, true)}</span> today`);
  set("d-rx-mood", esc(reactorMood(s))); set("d-rx-hp", sv ? `health ${num(sv.health) ? sv.health : D} · ${esc(sv.stage || D)}` : D);
  set("d-rx-r", `${deps.filter((d) => d.live).length}/12 live · ${all.filter((w) => w.status === "busy").length} busy · ${all.filter((w) => w.status === "blocked").length} blocked`);
  { const pos = L && P.find((p) => p.symbol === L.symbol), stage = !L ? D : L.verdict === "PASS" ? (pos ? "IN POSITION" : "PASSED TO RISK") : "HANDED BACK";
    set("d-ticket", `<div><small>CANDIDATE</small><b>${L ? esc(L.symbol || D) : D}</b></div><div><small>VERDICT</small><b class="${L ? (L.verdict === "PASS" ? "up" : "dn") : ""}">${L ? esc(L.verdict) : D}</b></div><div class="wide"><small>REASON</small><b>${L ? esc(L.reason || D) : "no candidate judged yet"}</b></div><div><small>NUMBER</small><b>${L && L.number != null ? esc(num(L.number) ? +Number(L.number).toPrecision(5) : L.number) : D}</b></div><div><small>STAGE</small><b class="gold">${stage}</b></div><div><small>JUDGED</small><b>${L ? ago(L.at) + " ago" : D}</b></div><div><small>OPEN</small><b>${P.length}${sv && num(sv.maxOpen) ? "/" + sv.maxOpen : ""}</b></div>`); }
  if (!cardsBuilt && $("d-cards-l")) { cardsBuilt = true; const card = ([id], i) => `<button class="rc" data-id="${id}" style="--c:${dc(id)}"><span class="rc-h"><i></i><b>${SHORT[id]}</b><em></em></span><span class="rc-s"></span><small class="rc-n"></small><small class="rc-e"></small></button>`;
    $("d-cards-l").innerHTML = DEPTS.slice(0, 6).map(card).join(""); $("d-cards-r").innerHTML = DEPTS.slice(6).map(card).join("");
    root.querySelectorAll(".rc").forEach((b) => { b.onclick = () => openDept(b.dataset.id); b.onmouseenter = () => hoverRider(b.dataset.id); b.onmouseleave = () => hoverRider(null); }); }
  { const rows = spec().slice(-40); root.querySelectorAll(".rc").forEach((el) => { const id = el.dataset.id, i = deptIdx(id), d = dep(id), ws = (d && d.workers) || [], b = ws.filter((w) => w.status === "busy").length, w = ws.find((x) => x.status === "blocked" && x.note) || ws.find((x) => x.status === "busy" && x.note) || ws.find((x) => x.note);
      const em = el.querySelector("em"), t1 = ws.length ? `${b}/${ws.length}` : D; if (em.textContent !== t1) em.textContent = t1; const n = el.querySelector(".rc-n"), t2 = d ? (w ? w.note : d.live ? "live" : "idle") : D; if (n.textContent !== t2) n.textContent = t2; el.classList.toggle("idle", !(d && d.live));
      const sp = sparkSvg(rows.map((r) => r[1][i]).filter(num), dc(id)), se = el.querySelector(".rc-s"); if (se.dataset.k !== sp) { se.dataset.k = sp; se.innerHTML = sp; } }); }
  { const le = Math.max(...ST.filter((x) => x.k !== "run").map((x) => +new Date(x.at) || 0), 0); set("d-rx-f", `<span>tickets fly on real verdicts and flows only</span><span>last pipeline event ${le ? ago(le) + " ago" : D}</span>`); }
  // ---- control stack
  const blocks = ((s.council && s.council.vetoes) || []).length, hl = Object.entries(feedsNow);
  set("d-ctl-m", esc(s.mode || D));
  set("d-ctl", `<div class="ctl-h">COUNCIL · LAST VERDICT</div>${L ? `<div class="vd ${L.verdict === "PASS" ? "pass" : "block"}"><b>${esc(L.verdict)}</b><span>${esc(L.symbol || D)}</span><p>${esc(L.reason || D)}</p><small>${L.number != null ? "number " + esc(num(L.number) ? +Number(L.number).toPrecision(5) : L.number) + " · " : ""}${ago(L.at)} ago · ${blocks} blocks on record</small></div>` : `<p class="empty">no verdict yet</p>`}
    <div class="ctl-h">LIVE TICKETS</div>${P.length ? P.slice(0, 4).map((p) => `<div class="tk"><b>${esc(p.symbol)}</b><span>${esc(p.strategy || D)}</span><em class="${cls(p.pnlPct)}">${fPct(p.pnlPct)}</em><small>${num(p.sizeSol) ? p.sizeSol.toFixed(3) : D} SOL · ${ago(p.openedAt)}</small></div>`).join("") : `<p class="empty">no open positions</p>`}
    <div class="ctl-h">SURVIVAL</div><div class="sv st-${esc((sv && sv.stage) || "none")}"><div><b>${sv && num(sv.health) ? sv.health : D}</b><span>${esc((sv && sv.stage) || D).toUpperCase()}</span></div><i><u style="width:${sv && num(sv.health) ? Math.max(0, Math.min(100, sv.health)) : 0}%"></u></i><small>size ×${sv && num(sv.sizeMult) ? sv.sizeMult : D} · max open ${sv && num(sv.maxOpen) ? sv.maxOpen : D}</small></div>
    <div class="ctl-h">DATA FEEDS</div><div class="feeds">${hl.length ? hl.map(([k, v]) => `<span class="${v ? "ok" : "bad"}">${esc(k.replace(/_/g, " "))}</span>`).join("") : `<span class="muted">not reported</span>`}</div>
    <div class="ctl-h">HELPERS</div><div class="feeds">${["grok", "chatgpt"].map((k) => { const v = s.helpers && s.helpers[k], on = v === "connected" || (v && (v.status === "connected" || v.lastText)); return `<span class="${on ? "ok" : "off"}">${k === "grok" ? "Grok" : "ChatGPT"} ${on ? "connected" : "not connected"}</span>`; }).join("")}</div>
    <div class="ctl-h">KILL SWITCH</div><div class="ks ${s.killSwitch ? "on" : ""}">${s.killSwitch ? "ON · NOTHING TRADES" : "OFF · inside Risk's limits"}</div>`);
  // ---- swarm pnl
  set("d-pnl-ev", `<span class="ev ${T.evidence === "EDGE" ? "up" : T.evidence === "NO EDGE" ? "dn" : ""}">${esc(String(T.evidence || D).toUpperCase())}</span>`);
  const nT = num(T.n) ? T.n : null;
  set("d-pnl", `<div class="big">${num(s.equitySol) ? s.equitySol.toFixed(4) : D}<small> SOL</small><span class="chg-c ${cls(s.pnlTodaySol)}">${num(s.pnlTodaySol) ? (s.pnlTodaySol > 0 ? "▲ " : s.pnlTodaySol < 0 ? "▼ " : "") + fSol(s.pnlTodaySol, true) + " today" : D}</span></div>
    <div class="chg"><span class="${cls(s.pnlTotalSol)}">${fSol(s.pnlTotalSol, true)} total</span><span>start ${fSol(s.startSol)}</span>${num(s.equitySol) && num(s.startSol) && s.startSol ? `<span class="${cls(s.equitySol - s.startSol)}">${pct((s.equitySol / s.startSol - 1) * 100, 2)}</span>` : ""}<span>${esc(s.mode || D)}</span></div>
    <div class="meter"><span>EVIDENCE</span><i><u style="width:${nT == null ? 0 : Math.min(100, nT)}%"></u></i><em>${nT == null ? D : nT}/100 trades</em></div>
    <div class="kv4"><div><small>TRADES</small><b>${fNum(T.n)}</b></div><div><small>WIN RATE</small><b>${wr(T.winRate)}</b></div><div><small>EXPECTANCY</small><b class="${cls(T.expectancyPct)}">${fPct(T.expectancyPct)}</b></div><div><small>95% CI</small><b>${Array.isArray(T.ci95) && T.ci95.every(num) ? T.ci95.map((v) => v.toFixed(1)).join(" … ") + "%" : D}</b></div></div>`);
  { const [g, w, h, d] = fit($("d-eqc")), pts = series("eq"), pr = 52 * d; g.strokeStyle = "rgba(120,140,170,.10)"; g.lineWidth = 1; for (let i = 1; i < 4; i++) { const y = Math.round((h * i) / 4) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(w - pr, y); g.stroke(); }
    const up = !num(s.pnlTotalSol) || s.pnlTotalSol >= 0, r = line(g, pts, 0, 2, w - pr, h - 14 * d, up ? "34,255,136" : "255,77,77", true, 1.6);
    g.font = `${8.5 * d}px ${MONO}`; g.fillStyle = "#5b6b82"; g.textBaseline = "alphabetic";
    if (r && r.one) { g.fillText(r.mx.toFixed(4), w - pr + 4 * d, h / 2); g.fillText("equity · first sample · the curve grows while the desk is open and is kept in this browser", 2 * d, h - 2 * d); } else if (r) { g.fillText(r.mx.toFixed(4), w - pr + 4 * d, 11 * d); g.fillText(r.mn.toFixed(4), w - pr + 4 * d, h - 16 * d); g.fillText(`equity · ${hms(pts[0][0]).slice(0, 5)} → now · ${span(pts[pts.length - 1][0] - pts[0][0])} · ${pts.length} samples kept in this browser`, 2 * d, h - 2 * d); } else empty(g, w, h, d, "equity curve starts with the next sample · kept in this browser"); }
  { const sh = s.shadow, ln = Array.isArray(s.lanes) ? s.lanes : []; const row = (nm, tag, o, c) => `<div class="ln"><b style="color:${c}">${esc(nm)}</b><small>${esc(tag)}</small><span>${fNum(o.n)}</span><span>${wr(o.winRate)}</span><span class="${cls(o.expectancyPct)}">${fPct(o.expectancyPct)}</span><span>${fNum(o.open)}</span><span>${num(o.weight) ? "×" + o.weight : D}</span></div>`;
    const rows = [...ln.slice(0, 1).map((l) => row("AQUARIUS", l.tag || "REAL", l, "#f3d27a")), ...(sh ? [row("SHADOW", "blocked coins, tracked", sh, "#a78bfa")] : []), ...ln.slice(1).map((l) => row(String(l.helper).toUpperCase(), (l.tag || "LANE") + (num(l.rejected) ? ` · ${l.rejected} rejected` : ""), l, "#40e8ff"))];
    set("d-lanes", `<div class="ctl-h">LANE SCORES</div><div class="ln hd"><b>LANE</b><small></small><span>N</span><span>WIN</span><span>EXP</span><span>OPEN</span><span>WT</span></div>${rows.join("") || `<p class="empty">no lanes reported</p>`}${ln.length < 2 ? `<p class="empty">helper lanes (Grok, ChatGPT, Codex): no picks yet</p>` : ""}`); }
  // ---- tape + book
  { const m = tapeModel(s); set("d-tape-s", m.sub); set("d-tape-r", esc(m.right)); drawTape($("d-tape"), m);
    const sh = s.shadow, ln = (Array.isArray(s.lanes) ? s.lanes : []).slice(1), tr = [...(mk.trending || [])].sort((a, b) => (b.liqUsd || 0) - (a.liqUsd || 0)).slice(0, 8), lmax = Math.max(...tr.map((t) => t.liqUsd || 0), 1);
    set("d-book", `<div class="ctl-h" style="margin-top:0">OPEN POSITIONS</div>${P.map((p) => `<div class="bk"><b>${esc(p.symbol)}</b><span class="${cls(p.pnlPct)}">${fPct(p.pnlPct)}</span><small>${esc(p.strategy || D)} · stop ${num(p.stopPct) ? p.stopPct.toFixed(1) : D} · tgt ${num(p.targetPct) ? p.targetPct.toFixed(1) : D} · ${num(p.sizeSol) ? p.sizeSol.toFixed(3) : D} SOL</small></div>`).join("") || `<p class="empty">none</p>`}
      <div class="ctl-h">SHADOW PROBES</div>${sh ? `<div class="bk"><b>${fNum(sh.open)} open · ${fNum(sh.n)} closed</b><span class="${cls(sh.expectancyPct)}">${fPct(sh.expectancyPct)}</span><small>win ${wr(sh.winRate)} · coins the council blocked, followed on paper</small></div>${(sh.byReason || []).slice(0, 4).map((r) => `<div class="bk"><b>${esc(r.reason)}</b><span class="${cls(r.expectancyPct)}">${fPct(r.expectancyPct)}</span><small>${fNum(r.n)} closed</small></div>`).join("")}` : `<p class="empty">not reported</p>`}
      <div class="ctl-h">LANE PICKS</div>${ln.map((l) => `<div class="bk"><b>${esc(String(l.helper).toUpperCase())}</b><span class="${cls(l.expectancyPct)}">${fPct(l.expectancyPct)}</span><small>${fNum(l.open)} open · ${fNum(l.n)} closed${num(l.rejected) ? " · " + l.rejected + " rejected" : ""}</small></div>`).join("") || `<p class="empty">no helper picks yet</p>`}
      <div class="ctl-h">TRENDING · LIQUIDITY</div>${tr.map((t) => `<div class="dp"><b>${esc(t.symbol)}${t.boosted ? `<u title="boosted listing">B</u>` : ""}</b><i><s style="width:${(((t.liqUsd || 0) / lmax) * 100).toFixed(0)}%"></s></i><span>${fUsd(t.liqUsd)}</span><em class="${cls(t.ch1h)}">${pct(t.ch1h)}</em></div>`).join("") || `<p class="empty">no trending pools reported</p>`}
      <div class="ctl-h">LAST FILLS</div>${(s.recent || []).slice(0, 5).map((r) => `<div class="bk"><b>${esc(r.side || D)} ${esc(r.symbol)}</b><span class="${cls(r.pnlSol)}">${r.pnlSol == null ? D : fSol(r.pnlSol, true)}</span><small>${esc(r.reason || D)} · ${ago(r.at)}</small></div>`).join("") || `<p class="empty">none</p>`}`); }
  // ---- trace
  { const ev = ST.filter((x) => x.k !== "run"), nb = ev.filter((x) => x.k === "BLOCK").length, np = ev.filter((x) => x.k === "PASS").length, nf = ev.length - nb - np;
    set("d-trace-n", `${ST.length} steps`);
    set("d-trace-k", `<div class="kv4 k5"><div><small>VERDICTS</small><b>${nb + np}</b></div><div><small>PASS</small><b class="up">${np}</b></div><div><small>BLOCK</small><b class="dn">${nb}</b></div><div><small>FLOWS</small><b>${nf}</b></div><div><small>LAST EVENT</small><b>${ev.length ? ago(ev[0].at) : D}</b></div></div>`);
    set("d-trace", ST.length ? ST.slice(0, 40).map((x) => `<div class="tr t-${esc(x.k)}"><time>${ago(x.at)}</time><i style="background:${dc(x.to)}"></i><span style="color:${dc(x.from)}">${x.from ? dn(x.from) : "·"}</span><span class="ar">→</span><span style="color:${dc(x.to)}">${dn(x.to)}</span><b class="k-${esc(x.k)}">${esc(x.what)}</b><em>${esc(x.txt)}</em><u>${esc(x.v)}</u></div>`).join("") : `<p class="empty">no steps yet</p>`); }
  // ---- pricer: measured round trip (latest two fee flows ÷ latest buy) vs the open target, gate at 6×
  { const buys = (s.flows || []).filter((f) => f.kind === "buy"), fees = (s.flows || []).filter((f) => f.kind === "fee");
    const sz = buys.length && num(buys[0].sol) ? Math.abs(buys[0].sol) : null, fee = fees.length ? fees.slice(0, 2).reduce((a, f) => a + Math.abs(f.sol || 0), 0) : null;
    const rt = sz && fee != null ? (fee / sz) * 100 : null, tgt = P[0] && num(P[0].targetPct) ? P[0].targetPct : null, pass = rt != null && tgt != null ? tgt >= rt * 6 : null, assumed = s.replay && num(s.replay.costPct) ? s.replay.costPct : null;
    drawGauge($("d-gauge"), { rt, tgt, pass, assumed });
    set("d-price", `<div class="kv4"><div><small>ROUND TRIP</small><b>${rt == null ? D : rt.toFixed(2) + "%"}</b></div><div><small>TARGET</small><b>${tgt == null ? D : tgt.toFixed(2) + "%"}</b></div><div><small>6× GATE</small><b>${rt == null ? D : (rt * 6).toFixed(2) + "%"}</b></div><div><small>RESULT</small><b class="${pass == null ? "" : pass ? "up" : "dn"}">${pass == null ? D : pass ? "PASS" : "BLOCK"}</b></div></div>
      <p class="muted">${rt == null ? `No measured round trip in the flows yet.${assumed != null ? ` Dim scale = the ${assumed}% cost the Time Machine replay assumes, and its 6× line.` : ""}` : `Round trip = latest two fee flows ÷ latest buy (${sz.toFixed(3)} SOL). Target = open position ${P[0] ? esc(P[0].symbol) : D}.`}</p>
      <div class="ctl-h">FEES</div>${fees.slice(0, 4).map((f) => `<div class="bk"><b>${Math.abs(f.sol || 0).toFixed(4)} SOL</b><span></span><small>${esc(f.label || "fee")} · ${ago(f.at)}</small></div>`).join("") || `<p class="empty">no fees yet</p>`}`); }
  // ---- spectrogram
  { const rows = spec(), feeds = [...new Set(rows.slice(-60).flatMap((r) => Object.keys(r[2] || {})))].sort().slice(0, 9); drawSpec($("d-spec"), rows, feeds); set("d-spec-n", rows.length ? `${rows.length} samples · ${span(rows[rows.length - 1][0] - rows[0][0])}` : ""); }
  // ---- X
  const xf = xFeed(s);
  set("d-x-s", gOn ? "Grok · live X search" : "Grok not connected");
  set("d-x", xf.length ? xf.slice(0, 10).map((m) => `<div class="xm"><span class="lbl lbl-${esc(String(m.label || "").toLowerCase())}">${esc(String(m.label || "—").toUpperCase())}</span><p>${esc(m.text)}</p><small>${m.dept || m.section ? esc(dn(m.dept || m.section)) + " · " : ""}${ago(m.at)}</small></div>`).join("")
    : `<div class="x0"><div class="x0-o ${gOn ? "on" : ""}"><i></i></div><b>${gOn ? "GROK CONNECTED · NO MESSAGES YET" : "GROK NOT CONNECTED"}</b><p>${gOn ? "The X lane is open. Messages land here as Grok posts them." : "The X lane is dark. When Grok joins through the helper bridge, what the market is saying lands here, each line labelled by how far it can be trusted."}</p><div><span class="lbl lbl-verified">VERIFIED</span><span class="lbl lbl-reported">REPORTED</span><span class="lbl lbl-claimed">CLAIMED</span><span class="lbl lbl-inferred">INFERRED</span></div><small>Grok ${s.helpers && s.helpers.grokLastAt ? "last heard " + ago(s.helpers.grokLastAt) + " ago" : "never heard"} · ChatGPT ${s.helpers && s.helpers.chatgptLastAt ? "last heard " + ago(s.helpers.chatgptLastAt) + " ago" : "never heard"}</small></div>`);
  // ---- brain: strategies, replay, lessons
  const stg = s.strategies || [], rp = s.replay;
  set("d-brain", `<div class="ctl-h" style="margin-top:0">STRATEGIES</div>${stg.map((r) => `<div class="sr ${r.alive === false ? "dead" : ""}"><b>${esc(r.id)}</b><span>${esc(String(r.name || D).replace(new RegExp("^" + r.id + "\\s+"), ""))}</span><small><u class="stt stt-${esc(String(r.status || "").replace(/\s+/g, "-"))}">${esc(r.status || (r.alive === false ? "killed" : "alive"))}</u>${r.market ? " " + esc(r.market) + " ·" : ""} ${fNum(r.trades)} trades</small><em class="${cls(r.pnlSol)}">${r.pnlSol == null ? D : fSol(r.pnlSol, true)}</em></div>`).join("") || `<p class="empty">no strategies</p>`}
    <div class="ctl-h">TIME MACHINE · R3 REPLAY</div>${rp ? `<div class="kv4"><div><small>TRADES</small><b>${fNum(rp.trades)}</b></div><div><small>EXPECTANCY</small><b class="${cls(rp.expectancyPct)}">${fPct(rp.expectancyPct)}</b></div><div><small>95% CI</small><b>${Array.isArray(rp.ci95) && rp.ci95.every(num) ? rp.ci95.map((v) => v.toFixed(1)).join(" … ") + "%" : D}</b></div><div><small>COST</small><b>${num(rp.costPct) ? rp.costPct + "%" : D}</b></div></div><p class="muted">${esc(rp.evidence || D)}</p>` : `<p class="empty">no replay result yet</p>`}
    <div class="ctl-h">LESSONS</div>${(s.brain || []).slice(0, 10).map((b) => `<div class="ls"><i style="background:${dc(b.dept)}"></i><p>${esc(b.text)}</p><small>${esc(dn(b.dept))} · ${ago(b.at)}</small></div>`).join("") || `<p class="empty">nothing learned yet</p>`}`);
  // ---- swarm: every worker is a cell; click one for its card
  set("d-wk", all.length ? `${all.length} workers · ${all.filter((w) => w.status === "busy").length} busy · ${all.filter((w) => w.status === "blocked").length} blocked` : "");
  set("d-depts", DEPTS.map(([id, nm]) => { const d = dep(id), ws = (d && d.workers) || [];
    return `<div class="dept ${d && d.live ? "" : "idle"}" style="--c:${dc(id)}"><button class="dn" data-dept="${id}" title="${esc(nm)}"><i></i>${SHORT[id]}</button><span class="dots">${ws.map((w) => `<button class="s-${esc(w.status)}" data-d="${id}" data-w="${esc(w.id)}" title="${esc(w.name)} · ${esc(w.job || "")}${w.note ? " · " + esc(w.note) : ""}"></button>`).join("") || `<small class="muted">no workers reported</small>`}</span><em>${ws.length ? `${ws.filter((w) => w.status === "busy").length}/${ws.length}` : D}</em></div>`; }).join("") + `<div class="lg"><span><u class="s-busy"></u>busy</span><span><u class="s-idle"></u>idle</span><span><u class="s-blocked"></u>blocked</span><span>click a cell for the worker card</span></div>`);
  root.querySelectorAll("#d-depts .dots button").forEach((b) => (b.onclick = () => openWorker(b.dataset.d, b.dataset.w)));
  root.querySelectorAll("#d-depts .dn").forEach((b) => (b.onclick = () => openDept(b.dataset.dept)));
  // ---- status line
  set("d-status", `<span>AQUARIUS DESK · ${esc(s.mode || D)}</span><span>build ${esc(s.build || D)}</span><span>updated ${ago(s.updatedAt)} ago</span><span>health ${sv && num(sv.health) ? sv.health : D} · ${esc((sv && sv.stage) || D)}</span><span>open ${P.length}</span><span>trades ${fNum(T.n)}</span><span>${esc(T.evidence || D)}</span><span>Grok ${gOn ? "connected" : "not connected"}</span><span class="${s.killSwitch ? "dn" : ""}">kill switch ${s.killSwitch ? "ON" : "off"}</span>`);
}
