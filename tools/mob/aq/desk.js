// BOT MODE: "AQUARIUS DESK" — dark terminal, dense panels, canvas 2D only (no three.js).
// Every number is from /api/aq/state; histories are sampled from state while the page is open; missing = "—".
import { DEPTS, GODS, fSol, fPct, fUsd, fNum, ago, esc, xFeed, openWorker, dialog, store } from "./main.js";
function openDept(id) { const s = store.state || {}; const d = (s.departments || []).find((x) => x.id === id); const nm = (DEPTS.find((x) => x[0] === id) || [0, id])[1]; const ws = (d && d.workers) || [];
  dialog(`<h3>${esc(nm)}</h3><p class="muted">${d ? (d.live ? "live" : "idle") + " · last run " + ago(d.lastRunAt) + " ago" : "—"}${GODS[id] ? " · " + GODS[id] : ""}</p>${d && d.skills && d.skills.length ? `<p>${d.skills.map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</p>` : ""}<div class="wl" style="max-height:50vh;overflow:auto">${ws.map((w) => `<button class="wk" data-w="${esc(w.id)}"><u class="s-${esc(w.status)}"></u><b>${esc(w.name)}</b><small>${esc(w.note || w.job)}</small></button>`).join("") || "<p class=empty>—</p>"}</div><div class="row"><button class="ghost" data-x>Close</button></div>`, (el, close) => { el.querySelector("[data-x]").onclick = close; el.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => { close(); openWorker(id, b.dataset.w); })); }); }

const D = "—", num = (v) => typeof v === "number" && isFinite(v);
const cls = (v) => (num(v) ? (v > 0 ? "up" : v < 0 ? "dn" : "") : "");
const H = {}; const push = (k, v, n = 120) => { if (!num(v)) return; (H[k] ||= []).push(v); if (H[k].length > n) H[k].shift(); };
const spec = []; // spectrogram columns: per dept busy ratio
let lastFlowId = null, lastVerdictAt = null; const trails = [];
const SHORT = { scouts_sol: "SCOUTS·SOL", scouts_stocks: "STOCKS", whales: "WHALES", news: "NEWS", setups: "SETUPS", costs: "COSTS", council: "COUNCIL", risk: "RISK", execution: "EXECUTION", review: "REVIEW", learning: "LEARNING", ops: "OPS" };
const deptIdx = (id) => DEPTS.findIndex((d) => d[0] === id);

export function deskHTML() {
  return `<main id="dash" class="desk">
  <div class="strip" id="d-strip"></div>
  <section class="p reactor-row">
    <div class="col-l" id="d-minis"></div>
    <div class="reactor"><div class="ph"><b>THE REACTOR</b><span>twelve departments orbit the core · one candidate rides the pipeline</span><em id="d-rx-r"></em></div>
      <div class="rx-k"><div><small>EQUITY</small><b id="d-rx-eq">—</b></div><div class="r"><small>LAST VERDICT</small><b id="d-rx-v">—</b></div></div>
      <canvas id="d-rx"></canvas></div>
    <div class="col-r"><div class="ph"><b>CONTROL STACK</b></div><div id="d-ctl"></div></div>
  </section>
  <section class="p pnl"><div class="ph"><b>SWARM PNL</b><span>paper · after costs</span><em id="d-pnl-ev"></em></div><div id="d-pnl"></div><canvas id="d-eqc" height="120"></canvas></section>
  <section class="p tape"><div class="ph"><b>THE TAPE</b><span id="d-tape-s">active candidate · entry · stop · target · fib</span></div><div class="tape-in"><canvas id="d-tape" height="260"></canvas><div id="d-book"></div></div></section>
  <section class="p trace"><div class="ph"><b>THE TRACE</b><span>every pipeline step · dept → dept · verdict</span></div><div id="d-trace" class="scroll"></div></section>
  <section class="p pricer"><div class="ph"><b>THE PRICER</b><span>cost gate · round trip vs target</span></div><div id="d-price"></div></section>
  <section class="p spectro"><div class="ph"><b>SIGNAL SPECTROGRAM</b><span>busy share per department over time</span></div><canvas id="d-spec" height="210"></canvas></section>
  <section class="p xp"><div class="ph"><b>X · THE MARKET IS SAYING</b><span id="d-x-s"></span></div><div id="d-x" class="scroll"></div></section>
  <section class="p brain"><div class="ph"><b>BRAIN</b><span>lessons and strategies</span></div><div id="d-brain" class="scroll"></div></section>
  <section class="p swarm"><div class="ph"><b>THE SWARM</b><span id="d-wk"></span></div><div id="d-depts" class="depts"></div></section>
  <footer class="status" id="d-status"></footer>
</main>`;
}

// ---------- canvas helpers ----------
function fit(c) { const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); const w = Math.max(10, Math.round(r.width * d)), h = Math.max(10, Math.round((r.height || c.height) * d)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } const g = c.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); return [g, w, h, d]; }
function line(g, arr, x, y, w, h, col, fill) { if (!arr || arr.length < 2) return false; const mn = Math.min(...arr), mx = Math.max(...arr), r = mx - mn || Math.abs(mx) * 0.001 || 1;
  g.beginPath(); arr.forEach((v, i) => { const X = x + (i / (arr.length - 1)) * w, Y = y + h - ((v - mn) / r) * h * 0.9 - h * 0.05; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.strokeStyle = col; g.lineWidth = 1.6 * (devicePixelRatio > 1 ? 1.5 : 1); g.stroke();
  if (fill) { g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, col.replace(")", ",.35)").replace("rgb", "rgba")); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fill(); } return true; }
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return `rgb(${n >> 16},${(n >> 8) & 255},${n & 255})`; };

// ---------- reactor animation ----------
let rxRaf = 0, rxState = null, rxLast = 0, rxT = 0, planets = [], blinkAt = 0, lookAt = null; const pulses = {};
// THE REACTOR = Aquarius's solar system: the sun (core, with a face) and 12 department planets.
function reactorLoop(now) {
  const c = document.getElementById("d-rx"); if (!c || document.body.classList.contains("world") || document.hidden) { rxRaf = 0; return; }
  const dt = Math.min(0.05, ((now || 0) - rxLast) / 1000 || 0.016); rxLast = now || 0; rxT += dt;
  const [g, W, Hh, d] = fit(c); const t = rxT, s = rxState;
  g.clearRect(0, 0, W, Hh); const cx = W / 2, cy = Hh / 2 + 10 * d; const RX = Math.min(W * 0.46, Hh * 1.0), FL = 0.42;
  const deps = (s && s.departments) || [];
  // starfield
  g.fillStyle = "rgba(255,255,255,.5)"; for (let i = 0; i < 90; i++) { const x = (i * 9301 % 997) / 997 * W, y = (i * 4931 % 991) / 991 * Hh; const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.7 + i)); g.globalAlpha = tw * 0.6; g.fillRect(x, y, d, d); } g.globalAlpha = 1;
  // orbits + planet positions
  planets = DEPTS.map(([id, nm, col], i) => { const r = RX * (0.3 + (i / 11) * 0.7); const sp = 0.35 / Math.pow(r / RX + 0.2, 1.5); const a = i * 2.39996 + t * sp * 0.25;
    return { id, nm, col, i, r, a, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * FL, z: Math.sin(a) }; });
  g.lineWidth = 1 * d; for (const p of planets) { g.strokeStyle = hex2rgb(p.col).replace("rgb", "rgba").replace(")", ",.22)"); g.beginPath(); g.ellipse(cx, cy, p.r, p.r * FL, 0, 0, Math.PI * 2); g.stroke(); }
  // sun (drawn between back and front planets)
  const back = planets.filter((p) => p.z < 0).sort((a, b) => a.z - b.z), front = planets.filter((p) => p.z >= 0).sort((a, b) => a.z - b.z);
  back.forEach((p) => drawPlanet(g, p, d, deps, t));
  drawSun(g, cx, cy, RX * 0.14, d, t, s);
  // moons: helpers orbit the sun closely
  const hp = (s && s.helpers) || {}; [["grok", "#e5e7eb"], ["chatgpt", "#10a37f"], ["codex", "#7c8cff"]].forEach(([k, col], j) => { const v = hp[k]; const on = v && (v === "connected" || v.status === "connected" || v.lastAt); const a = t * 0.9 + j * 2.1, r = RX * 0.2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * FL; g.fillStyle = on ? col : "#2a3142"; g.shadowColor = on ? col : "transparent"; g.shadowBlur = on ? 12 * d : 0; g.beginPath(); g.arc(x, y, 4.5 * d, 0, 7); g.fill(); g.shadowBlur = 0;
    g.fillStyle = on ? "#cfd8e6" : "#4a5468"; g.font = `${8 * d}px ui-monospace,Menlo,monospace`; g.textAlign = "center"; g.fillText(k === "chatgpt" ? "GPT" : k.toUpperCase(), x, y - 8 * d); });
  front.forEach((p) => drawPlanet(g, p, d, deps, t));
  // comets: planet -> planet -> sun
  g.globalCompositeOperation = "lighter";
  for (let k = trails.length - 1; k >= 0; k--) { const tr = trails[k]; tr.t += dt / 2.2; if (tr.t > 1.15) { trails.splice(k, 1); continue; } const A = planets[tr.from], B = planets[tr.to]; if (!A || !B) continue;
    if (!tr.hit && tr.t > 0.5) { tr.hit = 1; pulses[B.id] = t; lookAt = B.id; }
    const pt = (u) => u < 0.5 ? lerpQ(A, B, { x: (A.x + B.x) / 2, y: Math.min(A.y, B.y) - 30 * d }, u * 2) : lerpQ(B, { x: cx, y: cy }, { x: (B.x + cx) / 2, y: (B.y + cy) / 2 - 20 * d }, (u - 0.5) * 2);
    for (let j = 0; j < 14; j++) { const u = Math.max(0, Math.min(1, tr.t - j * 0.012)); const q = pt(u); g.globalAlpha = (1 - j / 14) * (tr.t > 1 ? (1.15 - tr.t) / 0.15 : 1); g.fillStyle = tr.col; g.beginPath(); g.arc(q.x, q.y, (4 - j * 0.22) * d, 0, 7); g.fill(); } }
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  rxRaf = requestAnimationFrame(reactorLoop);
}
function lerpQ(a, b, m, u) { return { x: (1 - u) ** 2 * a.x + 2 * (1 - u) * u * m.x + u * u * b.x, y: (1 - u) ** 2 * a.y + 2 * (1 - u) * u * m.y + u * u * b.y }; }
function drawPlanet(g, p, d, deps, t) {
  const dep = deps.find((x) => x.id === p.id); const ws = (dep && dep.workers) || []; const busy = ws.filter((w) => w.status === "busy").length, blk = ws.filter((w) => w.status === "blocked").length; const live = dep && dep.live;
  const R = (7 + (p.z + 1) * 3.5) * d; const pu = pulses[p.id] != null ? Math.max(0, 1 - (t - pulses[p.id]) / 1.2) : 0;
  const gl = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * (2.6 + pu * 2)); gl.addColorStop(0, hex2rgb(p.col).replace("rgb", "rgba").replace(")", live ? ",.55)" : ",.15)")); gl.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gl; g.beginPath(); g.arc(p.x, p.y, R * (2.6 + pu * 2), 0, 7); g.fill();
  const body = g.createRadialGradient(p.x - R * 0.4, p.y - R * 0.4, R * 0.1, p.x, p.y, R); body.addColorStop(0, "#ffffff"); body.addColorStop(0.25, live ? p.col : "#4a5468"); body.addColorStop(1, "#05070d"); g.fillStyle = body; g.beginPath(); g.arc(p.x, p.y, R, 0, 7); g.fill();
  // busy ring
  g.lineWidth = 2.2 * d; g.strokeStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.arc(p.x, p.y, R + 4 * d, 0, 7); g.stroke();
  if (ws.length) { g.strokeStyle = p.col; g.beginPath(); g.arc(p.x, p.y, R + 4 * d, -Math.PI / 2, -Math.PI / 2 + (busy / ws.length) * Math.PI * 2); g.stroke(); }
  if (blk) { g.fillStyle = "#ff4d4d"; g.beginPath(); g.arc(p.x + R * 0.8, p.y - R * 0.8, 3 * d, 0, 7); g.fill(); }
  if (pu) { g.strokeStyle = `rgba(255,255,255,${pu})`; g.lineWidth = 2 * d; g.beginPath(); g.arc(p.x, p.y, R + (1 - pu) * 22 * d, 0, 7); g.stroke(); }
  g.fillStyle = "#e6edf7"; g.font = `600 ${9 * d}px ui-monospace,SFMono-Regular,Menlo,monospace`; g.textAlign = "center"; g.fillText(SHORT[p.id], p.x, p.y + R + 14 * d);
  g.fillStyle = "#7d8aa0"; g.font = `${8 * d}px ui-monospace,Menlo,monospace`; g.fillText(ws.length ? `${busy}/${ws.length}` : "—", p.x, p.y + R + 24 * d);
}
function drawSun(g, cx, cy, r, d, t, s) {
  const sv = s && s.survival; const st = (sv && sv.stage) || "thriving";
  const hot = { thriving: ["#fff6d8", "#ffcf5a", "#ff8a1e"], hurt: ["#fff0d0", "#f5b54a", "#c7651a"], critical: ["#ffd6c8", "#ff6a3a", "#8a1a10"], destroyed: ["#cfcfcf", "#6b6b6b", "#2a2a2a"] }[st] || ["#fff6d8", "#ffcf5a", "#ff8a1e"];
  const pul = 1 + Math.sin(t * 2) * 0.03;
  const cor = g.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 3.2); cor.addColorStop(0, hot[1] + "cc"); cor.addColorStop(0.4, hot[2] + "44"); cor.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = cor; g.beginPath(); g.arc(cx, cy, r * 3.2, 0, 7); g.fill();
  // flares
  g.strokeStyle = hot[1] + "66"; g.lineWidth = 2 * d; for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2 + t * 0.15, l = r * (1.15 + 0.18 * Math.sin(t * 3 + k * 1.7)); g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 1.02, cy + Math.sin(a) * r * 1.02); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke(); }
  const b = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * pul); b.addColorStop(0, hot[0]); b.addColorStop(0.6, hot[1]); b.addColorStop(1, hot[2]); g.fillStyle = b; g.beginPath(); g.arc(cx, cy, r * pul, 0, 7); g.fill();
  // face: eyes look toward the active planet, blink, mood by stage
  const tgt = planets.find((p) => p.id === lookAt); let lx = 0, ly = 0; if (tgt) { const dx = tgt.x - cx, dy = tgt.y - cy, l = Math.hypot(dx, dy) || 1; lx = (dx / l) * r * 0.1; ly = (dy / l) * r * 0.08; }
  if (t > blinkAt + 3.6 + (Math.sin(blinkAt) + 1) * 1.5) blinkAt = t; const bl = t - blinkAt < 0.14 ? 0.12 : 1;
  const ex = r * 0.3, ey = -r * 0.08, ew = r * 0.13, eh = r * (st === "critical" || st === "destroyed" ? 0.2 : 0.3) * bl;
  g.fillStyle = "#1a0f05"; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * ex + lx, cy + ey + ly, ew, eh, sx * (st === "hurt" || st === "critical" ? 0.25 : 0), 0, 7); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(cx + sx * ex + lx - ew * 0.3, cy + ey + ly - eh * 0.4, ew * 0.3, 0, 7); g.fill(); g.fillStyle = "#1a0f05"; }
  // brows + mouth by mood
  g.strokeStyle = "#1a0f05"; g.lineWidth = r * 0.05; g.lineCap = "round";
  if (st !== "thriving") for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(cx + sx * (ex - ew * 1.2), cy + ey - r * 0.38 + (st === "hurt" ? 0 : -r * 0.04)); g.lineTo(cx + sx * (ex + ew * 1.1), cy + ey - r * 0.32 - (st === "hurt" ? r * 0.02 : r * 0.12) * sx * sx); g.stroke(); }
  g.beginPath(); const my = cy + r * 0.38; if (st === "thriving") g.arc(cx, my - r * 0.1, r * 0.22, 0.2 * Math.PI, 0.8 * Math.PI); else if (st === "hurt") { g.moveTo(cx - r * 0.18, my); g.lineTo(cx + r * 0.18, my); } else g.arc(cx, my + r * 0.12, r * 0.2, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke();
  g.fillStyle = "#ffe7a8"; g.font = `700 ${9 * d}px ui-monospace,Menlo,monospace`; g.textAlign = "center"; g.fillText(st === "thriving" ? "CALM" : st === "hurt" ? "FOCUSED" : "WORRIED", cx, cy + r * 1.75 + 6 * d);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { rxLast = performance.now(); if (!rxRaf) rxRaf = requestAnimationFrame(reactorLoop); } });
export function reactorClick(e, onPlanet) { const c = e.currentTarget, r = c.getBoundingClientRect(), d = c.width / r.width; const x = (e.clientX - r.left) * d, y = (e.clientY - r.top) * d; let best = null, bd = 30 * d; for (const p of planets) { const dd = Math.hypot(p.x - x, p.y - y); if (dd < bd) { bd = dd; best = p; } } if (best) onPlanet(best.id); }

// ---------- render ----------
export function renderDesk(root, s) {
  const $ = (id) => root.querySelector("#" + id); const set = (id, h) => { const e = $(id); if (e) e.innerHTML = h; };
  if (!s) return;
  // samples
  push("eq", s.equitySol); push("sol", s.market && s.market.sol && s.market.sol.price); push("fg", s.market && s.market.fearGreed && s.market.fearGreed.value);
  push("liq", (s.market && s.market.trending || []).reduce((a, t) => a + (num(t.liqUsd) ? t.liqUsd : 0), 0) || null);
  push("fees", (s.flows || []).filter((f) => f.kind === "fee").reduce((a, f) => a + Math.abs(f.sol || 0), 0));
  const W = (id) => { const d = (s.departments || []).find((x) => x.id === id); return d ? (d.workers || []).filter((w) => w.status === "busy").length : null; };
  push("whales", W("whales")); push("news", W("news"));
  spec.push(DEPTS.map(([id]) => { const d = (s.departments || []).find((x) => x.id === id); const ws = (d && d.workers) || []; return ws.length ? ws.filter((w) => w.status === "busy").length / ws.length : null; })); if (spec.length > 60) spec.shift();
  // trails from new flows + new council verdicts
  const fl = s.flows || []; if (lastFlowId == null) lastFlowId = fl.length ? Math.max(...fl.map((f) => f.id)) : 0;
  for (const f of fl.filter((f) => f.id > lastFlowId).slice(0, 6)) { const i = deptIdx(f.dept); if (i >= 0) trails.push({ from: (i + 11) % 12, to: i, t: 0, col: { win: "#22ff88", loss: "#ff4d4d", fee: "#ffcc33" }[f.kind] || "#40e8ff" }); }
  if (fl.length) lastFlowId = Math.max(lastFlowId, ...fl.map((f) => f.id));
  const L = s.council && s.council.last; if (L && L.at !== lastVerdictAt) { if (lastVerdictAt != null) trails.push({ from: deptIdx("setups"), to: deptIdx("council"), t: 0, col: L.verdict === "PASS" ? "#22ff88" : "#ff4d4d" }); lastVerdictAt = L.at; }
  rxState = s; if (!rxRaf) rxRaf = requestAnimationFrame(reactorLoop);
  const rc = $("d-rx"); if (rc && !rc.dataset.wired) { rc.dataset.wired = 1; rc.style.cursor = "pointer"; rc.addEventListener("click", (e) => reactorClick(e, openDept)); }

  // dept strip
  set("d-strip", DEPTS.map(([id, nm, col]) => { const d = (s.departments || []).find((x) => x.id === id); const ws = (d && d.workers) || []; const b = ws.filter((w) => w.status === "busy").length, bl = ws.filter((w) => w.status === "blocked").length;
    return `<div class="ag" style="--c:${col}"><i></i><b>${SHORT[id]}</b><small>${d ? (d.live ? "LIVE" : "IDLE") : D}${GODS[id] ? " · " + GODS[id].toUpperCase() : ""}${bl ? ` · <u>${bl} BLOCKED</u>` : ""}</small><em>${ws.length ? `${b}/${ws.length}` : D}</em></div>`; }).join(""));
  // mini cards
  const minis = [["TAPE", "sol", s.market && s.market.sol ? fUsd(s.market.sol.price) : D, "#40e8ff", "SOL"], ["BOOK", "liq", fUsd(H.liq && H.liq[H.liq.length - 1]), "#a78bfa", "trending liquidity"], ["COSTS", "fees", (H.fees && H.fees.length ? H.fees[H.fees.length - 1].toFixed(4) : D) + " SOL", "#facc15", "fees in last 40 flows"], ["WHALES", "whales", fNum(W("whales")), "#4f8bff", "whale workers busy"], ["SENTIMENT", "fg", s.market && s.market.fearGreed ? `${s.market.fearGreed.value} ${esc(s.market.fearGreed.label || "")}` : D, "#ff7ad9", "fear & greed"]];
  const mEl = $("d-minis"); if (mEl && !mEl.children.length) mEl.innerHTML = minis.map(([n, k, , col]) => `<div class="mini" style="--c:${col}"><div><b>${n}</b><em data-v="${k}"></em></div><canvas data-k="${k}" height="44"></canvas><small data-s="${k}"></small></div>`).join("");
  minis.forEach(([, k, v, col, sub]) => { const e = mEl.querySelector(`[data-v=${k}]`); e.textContent = v; mEl.querySelector(`[data-s=${k}]`).textContent = sub + (H[k] && H[k].length > 1 ? "" : " · line builds live");
    const c = mEl.querySelector(`[data-k=${k}]`); const [g, w, h] = fit(c); g.clearRect(0, 0, w, h); line(g, H[k], 0, 0, w, h, hex2rgb(col), true); });
  // reactor overlays
  set("d-rx-eq", fSol(s.equitySol)); set("d-rx-v", L ? `<span class="${L.verdict === "PASS" ? "up" : "dn"}">${esc(L.verdict)}</span> ${esc(L.symbol || "")}` : D);
  const busyAll = (s.departments || []).flatMap((d) => d.workers || []).filter((w) => w.status === "busy").length; set("d-rx-r", `${(s.departments || []).filter((d) => d.live).length}/12 departments live · ${busyAll} workers busy`);
  // control stack
  const P = s.positions || [];
  set("d-ctl", `<div class="ctl-h">LIVE TICKETS</div>${P.length ? P.slice(0, 4).map((p) => `<div class="tk"><b>${esc(p.symbol)}</b><span>${esc(p.strategy || D)}</span><em class="${cls(p.pnlPct)}">${fPct(p.pnlPct)}</em><small>${num(p.sizeSol) ? p.sizeSol.toFixed(3) : D} SOL · ${ago(p.openedAt)}</small></div>`).join("") : `<p class="empty">no open positions</p>`}
    <div class="ctl-h">CONFIDENCE · BUSY SHARE</div>${DEPTS.map(([id, nm, col]) => { const d = (s.departments || []).find((x) => x.id === id); const ws = (d && d.workers) || []; const r = ws.length ? ws.filter((w) => w.status === "busy").length / ws.length : 0; return `<div class="cb"><span>${esc(nm.split(" ")[0])}</span><i style="--c:${col};--w:${(r * 100).toFixed(0)}%"></i></div>`; }).join("")}
    <div class="ctl-h">KILL SWITCH</div><div class="ks ${s.killSwitch ? "on" : ""}">${s.killSwitch ? "ON · NOTHING TRADES" : "OFF · inside Risk's limits"}</div>`);
  // swarm pnl
  const T = s.trades || {};
  set("d-pnl-ev", `<span class="ev ${T.evidence === "EDGE" ? "up" : T.evidence === "NO EDGE" ? "dn" : ""}">${esc(T.evidence || D)}</span>`);
  set("d-pnl", `<div class="big">${num(s.equitySol) ? s.equitySol.toFixed(4) : D}<small> SOL</small></div><div class="chg"><span class="${cls(s.pnlTodaySol)}">${fSol(s.pnlTodaySol, true)} today</span><span class="${cls(s.pnlTotalSol)}">${fSol(s.pnlTotalSol, true)} total</span><span>start ${fSol(s.startSol)}</span></div>
    <div class="kv4"><div><small>TRADES</small><b>${fNum(T.n)}<i>/100</i></b></div><div><small>WIN RATE</small><b>${num(T.winRate) ? (T.winRate * (T.winRate <= 1 ? 100 : 1)).toFixed(1) + "%" : D}</b></div><div><small>EXPECTANCY</small><b class="${cls(T.expectancyPct)}">${fPct(T.expectancyPct)}</b></div><div><small>95% CI</small><b>${Array.isArray(T.ci95) && T.ci95.every(num) ? T.ci95.map((v) => v.toFixed(1)).join(" … ") + "%" : D}</b></div></div>`);
  { const c = $("d-eqc"); const [g, w, h] = fit(c); g.clearRect(0, 0, w, h); if (!line(g, H.eq, 0, 4, w, h - 8, "rgb(34,255,136)", true)) { g.fillStyle = "#5b6577"; g.font = `${11 * (devicePixelRatio || 1)}px ui-monospace,monospace`; g.fillText("equity curve builds while the desk is open", 8, h / 2); } }
  // tape: active candidate levels
  { const p = P[0]; set("d-tape-s", p ? `${esc(p.symbol)} · ${esc(p.strategy || D)} · entry ${fUsd(p.entryPrice)} · now ${fUsd(p.price)}` : "no active candidate");
    const c = $("d-tape"); const [g, w, h, d] = fit(c); g.clearRect(0, 0, w, h); g.font = `${10 * d}px ui-monospace,Menlo,monospace`; g.textBaseline = "middle";
    if (!p || !num(p.entryPrice)) { g.fillStyle = "#5b6577"; g.fillText(p ? "no entry price reported" : "no open position: nothing to chart", 10 * d, h / 2); }
    else { const e = p.entryPrice, st = num(p.stopPct) ? e * (1 + p.stopPct / 100) : null, tg = num(p.targetPct) ? e * (1 + p.targetPct / 100) : null; const lo = Math.min(e, st ?? e, p.price ?? e) * 0.995, hi = Math.max(e, tg ?? e, p.price ?? e) * 1.005; const Y = (v) => h - 14 * d - ((v - lo) / (hi - lo)) * (h - 28 * d);
      // fib grid between stop and target
      if (st != null && tg != null) for (const f of [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]) { const v = st + (tg - st) * f; g.strokeStyle = f === 0.618 ? "rgba(243,210,122,.6)" : "rgba(120,140,170,.25)"; g.setLineDash([4 * d, 4 * d]); g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(w - 90 * d, Y(v)); g.stroke(); g.setLineDash([]); g.fillStyle = "#6b7c90"; g.fillText(`fib ${f}`, w - 86 * d, Y(v)); }
      const lv = [["ENTRY", e, "#e2e8f0"], ["STOP", st, "#ff4d4d"], ["TARGET", tg, "#22ff88"], ["NOW", p.price, "#40e8ff"]];
      for (const [n, v, col] of lv) if (num(v)) { g.strokeStyle = col; g.lineWidth = (n === "NOW" ? 2.5 : 1.5) * d; g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(w - 160 * d, Y(v)); g.stroke(); g.fillStyle = col; g.fillText(`${n} ${fUsd(v)}`, w - 156 * d, Y(v) - 7 * d); }
      // SOL session tape underneath as context
      if (H.sol && H.sol.length > 1) { g.globalAlpha = 0.35; line(g, H.sol, 0, h * 0.7, w - 170 * d, h * 0.28, "rgb(64,232,255)"); g.globalAlpha = 1; } } }
  set("d-book", `<div class="ctl-h">OPEN BOOK</div>${P.map((p) => `<div class="bk"><b>${esc(p.symbol)}</b><span class="${cls(p.pnlPct)}">${fPct(p.pnlPct)}</span><small>stop ${num(p.stopPct) ? p.stopPct.toFixed(1) : D} · tgt ${num(p.targetPct) ? p.targetPct.toFixed(1) : D}</small></div>`).join("") || `<p class="empty">empty</p>`}
    <div class="ctl-h">LAST FILLS</div>${(s.recent || []).slice(0, 5).map((r) => `<div class="bk"><b>${esc(r.side || D)} ${esc(r.symbol)}</b><span class="${cls(r.pnlSol)}">${r.pnlSol == null ? D : fSol(r.pnlSol, true)}</span><small>${esc(r.reason || D)}</small></div>`).join("") || `<p class="empty">none</p>`}`);
  // trace: flows + verdicts as pipeline steps
  const steps = [...(s.flows || []).map((f) => ({ at: f.at, from: { buy: "council", sell: "risk", fee: "execution", win: "execution", loss: "execution" }[f.kind] || null, to: f.dept, what: f.kind, txt: f.label, v: num(f.sol) ? Math.abs(f.sol).toFixed(4) : D, k: f.kind })),
    ...((s.council && s.council.vetoes) || []).map((v) => ({ at: v.at, from: "setups", to: "council", what: v.verdict, txt: `${v.symbol || ""} · ${v.reason || ""}`, v: v.number ?? D, k: v.verdict }))].sort((a, b) => new Date(b.at) - new Date(a.at));
  const dn = (id) => (id ? (DEPTS[deptIdx(id)] || [0, id])[1].split(" ")[0].toUpperCase() : D); const dc = (id) => (DEPTS[deptIdx(id)] || [0, 0, "#888"])[2];
  set("d-trace", steps.length ? steps.slice(0, 30).map((x) => `<div class="tr"><time>${ago(x.at)}</time><span style="color:${dc(x.from)}">${dn(x.from)}</span><i>→</i><span style="color:${dc(x.to)}">${dn(x.to)}</span><b class="k-${esc(x.k)}">${esc(x.what)}</b><em>${esc(x.txt)}</em><u>${esc(x.v)}</u></div>`).join("") : `<p class="empty">no steps yet</p>`);
  // pricer: round-trip cost from the latest buy and its fees vs the position target, 6x gate
  { const buys = (s.flows || []).filter((f) => f.kind === "buy"), fees = (s.flows || []).filter((f) => f.kind === "fee");
    const sz = buys.length && num(buys[0].sol) ? Math.abs(buys[0].sol) : null; const fee = fees.length ? fees.slice(0, 2).reduce((a, f) => a + Math.abs(f.sol || 0), 0) : null;
    const rt = sz && fee != null ? (fee / sz) * 100 : null; const tgt = P[0] && num(P[0].targetPct) ? P[0].targetPct : null; const pass = rt != null && tgt != null ? tgt >= rt * 6 : null;
    set("d-price", `<div class="kv4"><div><small>ROUND TRIP</small><b>${rt == null ? D : rt.toFixed(2) + "%"}</b></div><div><small>TARGET</small><b>${tgt == null ? D : tgt.toFixed(2) + "%"}</b></div><div><small>6× GATE</small><b>${rt == null ? D : (rt * 6).toFixed(2) + "%"}</b></div><div><small>RESULT</small><b class="${pass == null ? "" : pass ? "up" : "dn"}">${pass == null ? D : pass ? "PASS" : "BLOCK"}</b></div></div>
      <div class="gate"><i style="--w:${rt == null || tgt == null ? 0 : Math.min(100, (rt * 6 / Math.max(tgt, rt * 6)) * 100)}%"></i><b style="--l:${tgt == null || rt == null ? 0 : Math.min(100, (tgt / Math.max(tgt, rt * 6)) * 100)}%"></b></div>
      <p class="muted">Round trip = latest two fee flows ÷ latest buy size (${sz == null ? D : sz.toFixed(3) + " SOL"}). Target = open position ${P[0] ? esc(P[0].symbol) : D}.</p>
      <div class="ctl-h">FEES</div>${fees.slice(0, 4).map((f) => `<div class="bk"><b>${Math.abs(f.sol || 0).toFixed(4)}</b><small>${esc(f.label || "fee")} · ${ago(f.at)}</small></div>`).join("") || `<p class="empty">no fees yet</p>`}`); }
  // spectrogram
  { const c = $("d-spec"); const [g, w, h, d] = fit(c); g.clearRect(0, 0, w, h); const lw = 70 * d, rows = 12, rh = h / rows, cw = (w - lw) / Math.max(24, spec.length);
    g.font = `${9 * d}px ui-monospace,Menlo,monospace`; g.textBaseline = "middle";
    DEPTS.forEach(([, nm], r) => { g.fillStyle = "#7d8aa0"; g.fillText(SHORT[DEPTS[r][0]], 2 * d, r * rh + rh / 2); });
    spec.forEach((col, x) => col.forEach((v, r) => { if (v == null) { g.fillStyle = "#151a26"; } else { const hue = 260 - v * 220; g.fillStyle = `hsl(${hue},90%,${18 + v * 45}%)`; } g.fillRect(lw + (Math.max(24, spec.length) - spec.length + x) * cw, r * rh + 1, cw - 1, rh - 2); }));
    if (spec.length < 3) { g.fillStyle = "#5b6577"; g.fillText("fills every 3 s", lw + 8 * d, h / 2); } }
  // X
  const xf = xFeed(s); const gk = s.helpers && s.helpers.grok; const gOn = gk && (gk === "connected" || gk.status === "connected" || gk.lastAt);
  set("d-x-s", gOn ? "Grok · live X search" : "Grok not connected");
  set("d-x", xf.length ? xf.slice(0, 10).map((m) => `<div class="xm"><span class="lbl lbl-${esc(String(m.label || "").toLowerCase())}">${esc(String(m.label || "—").toUpperCase())}</span><p>${esc(m.text)}</p><small>${m.dept ? esc(dn(m.dept)) + " · " : ""}${ago(m.at)}</small></div>`).join("") : `<p class="empty">${gOn ? "Grok connected · no messages yet" : "Grok not connected"}</p>`);
  // brain + strategies
  const st = s.strategies || [];
  set("d-brain", `${st.map((r) => `<div class="sr ${r.alive === false ? "dead" : ""}"><b>${esc(r.id)}</b><span>${esc(r.name || D)}</span><small>${esc(r.status || (r.alive === false ? "killed" : "alive"))} · ${fNum(r.trades)}</small><em class="${cls(r.pnlSol)}">${r.pnlSol == null ? D : fSol(r.pnlSol, true)}</em></div>`).join("") || `<p class="empty">no strategies</p>`}
    <div class="ctl-h">LESSONS</div>${(s.brain || []).slice(0, 8).map((b) => `<div class="ls"><i style="background:${dc(b.dept)}"></i><p>${esc(b.text)}</p><small>${esc(dn(b.dept))} · ${ago(b.at)}</small></div>`).join("") || `<p class="empty">nothing learned yet</p>`}`);
  // swarm: departments and workers
  const all = (s.departments || []).flatMap((d) => d.workers || []);
  set("d-wk", all.length ? `${all.length} workers · ${all.filter((w) => w.status === "busy").length} busy · ${all.filter((w) => w.status === "blocked").length} blocked` : "");
  const open = [...root.querySelectorAll("details.dept[open]")].map((d) => d.dataset.id);
  set("d-depts", DEPTS.map(([id, nm, col]) => { const d = (s.departments || []).find((x) => x.id === id); const ws = (d && d.workers) || [];
    return `<details class="dept" data-id="${id}" style="--c:${col}" ${open.includes(id) ? "open" : ""}><summary><i></i><b>${esc(nm)}</b><span class="dots">${ws.map((w) => `<u class="s-${esc(w.status)}" title="${esc(w.name)}"></u>`).join("")}</span></summary>
      <div class="wl">${(d && d.skills && d.skills.length) ? `<p class="muted">skills: ${d.skills.map(esc).join(" · ")}</p>` : ""}${ws.map((w) => `<button class="wk" data-d="${esc(id)}" data-w="${esc(w.id)}"><u class="s-${esc(w.status)}"></u><b><span class="pw pw-${esc(w.power || "code")}" title="${esc(w.power || "")}"></span>${esc(w.name)}</b><small>${esc(w.note || w.job)}</small></button>`).join("") || `<p class="empty">no workers reported</p>`}</div></details>`; }).join(""));
  root.querySelectorAll("#d-depts .wk").forEach((b) => (b.onclick = () => openWorker(b.dataset.d, b.dataset.w)));
  // status line
  const sv = s.survival;
  set("d-status", `<span>AQUARIUS DESK · ${esc(s.mode || D)}</span><span>build ${esc(s.build || D)}</span><span>updated ${ago(s.updatedAt)} ago</span><span>health ${sv && num(sv.health) ? sv.health : D} · ${esc((sv && sv.stage) || D)}</span><span>open ${P.length}</span><span>trades ${fNum(T.n)}</span><span>${esc(T.evidence || D)}</span><span>Grok ${gOn ? "connected" : "not connected"}</span><span class="${s.killSwitch ? "dn" : ""}">kill switch ${s.killSwitch ? "ON" : "off"}</span>`);
}
export function wakeReactor() { if (!rxRaf) rxRaf = requestAnimationFrame(reactorLoop); }
