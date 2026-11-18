// THE REACTOR: a nebula ring. A thick torus of woven light strands, tilted in 3D and slowly turning; the Aquarius core
// (a warm pearl with a face) floats in the hole; the twelve departments ride the ring, each through a coil of its colour;
// helpers ride the inner ring. Canvas 2D, additive blending, no WebGL, no three.js.
// Ambient motion (rotation, strand flow, bobbing) never stops. Highlights (ticket comets, rider jumps, lit cards with a
// connector) fire ONLY on real state changes: a new council verdict, a new flow, a department run.
import { DEPTS } from "./depts.js";

const TAU = Math.PI * 2, MONO = 'ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace';
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const neonRgb = (hex) => { const c = rgb(hex), m = Math.max(...c) || 1, k = 255 / m; return c.map((v) => Math.round(Math.min(255, v * k * 0.9 + 22))); };
const col = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const SHORT = { scouts_sol: "SCOUTS", scouts_stocks: "STOCKS", whales: "WHALES", news: "NEWS", setups: "SETUPS", costs: "COSTS", council: "COUNCIL", risk: "RISK", execution: "EXEC", review: "REVIEW", learning: "LEARN", ops: "OPS" };
export const NEON = DEPTS.map((d) => neonRgb(d[2]));
export const neonCss = (i) => col(NEON[i], 1);

// ---------- the ring: strands are helices around the tube ----------
const R = rng(1618), N_STR = 96, NS = 48, SUB = 2, NK = NS * SUB;
const WIND = [1, 1, 2, 2, 2, 3, 3, 4];
const strands = Array.from({ length: N_STR }, (_, j) => { const wisp = R() < 0.12; return { w: WIND[(R() * WIND.length) | 0] * (R() < 0.5 ? -1 : 1), ph: R() * TAU, f: (0.12 + R() * 0.5) * (R() < 0.5 ? -1 : 1), ar: wisp ? 1.05 + R() * 0.2 : 0.74 + R() * 0.28, wob: 0.05 + R() * 0.2, wn: 1 + ((R() * 4) | 0), wp: R() * TAU, wf: (R() - 0.5) * 0.6 }; });
const sparks = Array.from({ length: 90 }, () => ({ th: R() * TAU, ps: R() * TAU, ar: 0.7 + R() * 0.6, sp: (R() - 0.5) * 0.5, tw: R() * TAU, s: 0.6 + R() }));
const HUE = Array.from({ length: NS }, (_, s) => { const h = (300 + (s / NS) * 360) % 360; return [h, 100, h > 215 && h < 275 ? 60 : 50]; }); // magenta -> orange -> yellow -> green -> cyan -> blue -> violet
const MOONS = [["grok", "GROK", [235, 240, 250]], ["chatgpt", "GPT", [22, 200, 150]], ["codex", "CODEX", [140, 155, 255]]];
// rider silhouettes: radius as a function of the angle (canvas angles, -PI/2 is up)
const SHAPES = [
  () => [1, 1, 1], (f) => [1 + 0.42 * Math.pow(Math.max(0, Math.cos(f + Math.PI / 2)), 3), 0.92, 0.95], (f) => [1 + 0.2 * Math.cos(3 * (f + Math.PI / 2)), 1, 1], (f) => [1 + 0.17 * Math.cos(3 * (f - Math.PI / 2)), 1, 1],
  (f) => [1 / Math.pow(Math.pow(Math.abs(Math.cos(f)), 4) + Math.pow(Math.abs(Math.sin(f)), 4), 0.25), 0.9, 0.9], (f) => [1 + 0.06 * Math.cos(6 * f), 1, 1], (f) => [1.12 / Math.pow(Math.pow(Math.abs(Math.cos(f)), 1.5) + Math.pow(Math.abs(Math.sin(f)), 1.5), 1 / 1.5), 1, 1], () => [1, 0.84, 1.12],
  (f) => [1 / Math.pow(Math.pow(Math.abs(Math.cos(f)), 4) + Math.pow(Math.abs(Math.sin(f)), 4), 0.25), 1.12, 0.8], (f) => [1 + (Math.sin(f) > 0.2 ? 0.1 * Math.cos(5 * f) : 0), 0.95, 1.05], (f) => [1 + 0.1 * Math.cos(5 * (f + Math.PI / 2)), 1, 1], (f) => [1 + 0.05 * Math.cos(8 * f), 1, 1],
];

const st = { raf: 0, last: 0, t: 0, state: null, riders: [], comets: [], pulses: {}, corePulse: -9, active: {}, look: null, lookAt: -9, wander: 0, q: 1, slow: 0, fps: 60, blinkAt: 0, geo: null, bg: null, bgKey: "", off: null, small: null, lastEvent: 0, hover: null, cards: {}, cardsAt: 0 };
const seen = { flow: null, verdict: null, runs: {} };

export function reactorMood(s) { const sv = s && s.survival, g = (sv && sv.stage) || null; if (s && s.killSwitch) return "HALTED"; return { thriving: "THRIVING", healthy: "CALM", hurt: "FOCUSED", critical: "WORRIED", destroyed: "DESTROYED" }[g] || "—"; }
export const reactorInfo = () => ({ fps: Math.round(st.fps), jsMs: +(st.ms || 0).toFixed(2), q: +st.q.toFixed(2), comets: st.comets.length, lastEvent: st.lastEvent, active: Object.keys(st.active) });

// ---------- real events -> tickets (comets), rider jumps, lit cards ----------
const FROM = { buy: ["council", "risk"], sell: ["risk"], fee: ["execution"], win: ["execution"], loss: ["execution"] };
const FCOL = { buy: [64, 232, 255], sell: [64, 232, 255], fee: [255, 204, 51], win: [34, 255, 136], loss: [255, 77, 77] };
const isDept = (id) => DEPTS.some((d) => d[0] === id);
// where a verdict was decided, read from its own reason text; unknown reasons stay at the council
function stopDept(reason) { const r = String(reason || "").toLowerCase(); if (/liquidity|volume|too new|age/.test(r)) return "scouts_sol"; if (/candle|signal|impulse|pullback|fib|setup/.test(r)) return "setups"; if (/cost|round trip|fee|slippage/.test(r)) return "costs"; if (/risk|limit|drawdown|max open|kill/.test(r)) return "risk"; return "council"; }
function ticket(steps, c, label, delay = 0) { const path = steps.filter((x, i) => (x.id === "core" || isDept(x.id)) && !(i && steps[i - 1].id === x.id)); if (path.length < 2) return; path.forEach((x) => isDept(x.id) && fire(x.id, 2)); if (st.comets.length > 14) st.comets.shift(); st.comets.push({ path, c, label, t: -delay, trail: [], seg: -1, done: 0 }); st.lastEvent = Date.now(); }
function activate(id, text, c) { if (!isDept(id)) return; st.pulses[id] = st.t; st.active[id] = { until: st.t + 4.2, text: String(text || "").slice(0, 90), c }; st.look = id; st.lookAt = st.t; }
export function feedReactor(s) {
  st.state = s; if (!s) return;
  const fl = s.flows || [];
  if (seen.flow == null) seen.flow = fl.length ? Math.max(...fl.map((f) => Number(f.id) || 0)) : 0;
  else { fl.filter((f) => Number(f.id) > seen.flow).sort((a, b) => a.id - b.id).slice(-6).forEach((f, i) => { const txt = `${f.kind} · ${f.label || ""}${typeof f.sol === "number" ? " · " + Math.abs(f.sol).toFixed(4) + " SOL" : ""}`; ticket([...(FROM[f.kind] || []).map((id) => ({ id, text: `hands ${f.label || f.kind} on` })), { id: f.dept, text: txt }, { id: "core" }], FCOL[f.kind] || [64, 232, 255], String(f.label || f.kind).slice(0, 18), i * 0.5); }); if (fl.length) seen.flow = Math.max(seen.flow, ...fl.map((f) => Number(f.id) || 0)); }
  const c = s.council || {}, vs = [...(c.vetoes || [])]; if (c.last && !vs.some((v) => v.at === c.last.at && v.symbol === c.last.symbol)) vs.push(c.last);
  const tm = (v) => +new Date(v.at) || 0, mx = vs.reduce((a, v) => Math.max(a, tm(v)), 0);
  if (seen.verdict == null) seen.verdict = mx;
  else if (mx > seen.verdict) { vs.filter((v) => tm(v) > seen.verdict).sort((a, b) => tm(a) - tm(b)).slice(-5).forEach((v, i) => { const pass = v.verdict === "PASS", sym = v.symbol || "candidate", at = stopDept(v.reason), why = `${v.verdict} ${sym} · ${v.reason || "—"}`;
      const steps = pass ? [{ id: "scouts_sol", text: `candidate ${sym}` }, { id: "setups", text: `setup ${sym}` }, { id: "costs", text: `costs ${sym}` }, { id: "council", text: why }, { id: "risk", text: `sizing ${sym}` }, { id: "execution", text: `order ${sym}` }, { id: "core" }]
        : [{ id: "scouts_sol", text: at === "scouts_sol" ? why : `candidate ${sym}` }, ...(at !== "scouts_sol" && at !== "council" ? [{ id: at, text: why }] : []), { id: "council", text: why }, { id: "core" }];
      ticket(steps, pass ? [34, 255, 136] : [255, 77, 77], `${v.verdict} ${sym}`.slice(0, 18), i * 0.7); }); seen.verdict = mx; }
  for (const d of s.departments || []) { const at = d.lastRunAt || null; if (d.id in seen.runs && at && at !== seen.runs[d.id]) { st.pulses[d.id] = st.t; st.lastEvent = Date.now(); fire(d.id, 2); } seen.runs[d.id] = at; }
  wakeReactor();
}
export function wakeReactor() { if (!st.raf && typeof requestAnimationFrame !== "undefined") { st.last = performance.now(); st.raf = requestAnimationFrame(loop); } }
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (!document.hidden) wakeReactor(); });

// ---------- geometry: torus in the XZ plane, camera above and in front ----------
const SIN = 0.53, COS = 0.848, ROLL = -0.1, CR = Math.cos(ROLL), SR = Math.sin(ROLL);
function geometry(W, H, d, padX) {
  const availX = W / 2 - padX - 14 * d, R0 = Math.max(40 * d, Math.min(availX / 1.27, (H / 2 - 40 * d) / 0.9)); const a = R0 * 0.2;
  return { W, H, d, R: R0, a, cx: W / 2, cy: H / 2 + R0 * 0.07, RS: R0 * 0.245 };
}
function proj(G, X, Y, Z) { const k = 1 + (Z * COS + Y * SIN) / (G.R * 7), x0 = X * k, y0 = (Z * SIN - Y * COS) * k; return { x: G.cx + x0 * CR - y0 * SR, y: G.cy + x0 * SR + y0 * CR, z: Z * COS + Y * SIN, k }; }
function torus(G, th, ps, ar) { const rr = G.R + ar * Math.cos(ps); return proj(G, rr * Math.cos(th), ar * Math.sin(ps), rr * Math.sin(th)); }
function background(G) {
  const key = G.W + "x" + G.H + "x" + Math.round(G.R); if (st.bgKey === key) return st.bg; st.bgKey = key;
  const c = (st.bg = document.createElement("canvas")); c.width = G.W; c.height = G.H; const x = c.getContext("2d"), r = rng(7);
  const neb = (px, py, rad, cl) => { const gr = x.createRadialGradient(px, py, 0, px, py, rad); gr.addColorStop(0, cl); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(0, 0, G.W, G.H); };
  neb(G.cx, G.cy, G.R * 1.8, "rgba(20,30,84,.42)"); neb(G.cx - G.R * 0.9, G.cy + G.R * 0.35, G.R * 0.9, "rgba(190,40,170,.07)"); neb(G.cx + G.R * 0.95, G.cy + G.R * 0.1, G.R * 0.9, "rgba(40,200,150,.05)"); neb(G.cx + G.R * 0.1, G.cy - G.R * 0.7, G.R * 0.8, "rgba(70,90,255,.08)");
  x.globalCompositeOperation = "lighter"; for (let i = 0; i < 46; i++) { const a = r() * TAU, rr = G.R * (0.2 + r() * 1.25), px = G.cx + Math.cos(a) * rr * 1.25, py = G.cy + Math.sin(a) * rr * 0.62, h = [265, 290, 220, 315, 190][i % 5]; neb(px, py, G.R * (0.18 + r() * 0.45), `hsla(${h},80%,${45 + r() * 15}%,${0.025 + r() * 0.04})`); } x.globalCompositeOperation = "source-over";
  for (let i = 0; i < 240; i++) { const a = r(); x.fillStyle = `rgba(${200 + r() * 55},${210 + r() * 45},255,${0.12 + a * a * 0.7})`; const s = (a > 0.93 ? 1.6 : 0.9) * G.d; x.fillRect(r() * G.W, r() * G.H, s, s); }
  return c;
}
// ---------- the NEURON nebula (2026-11-18, Alex: "a brain in space"): glowing somas on the ring, branching dendrites,
// axons linking them. Ambient: a slow drift and a breathing glow only. Spikes travel along axons ONLY when a real event
// fires (a verdict ticket, a flow, a department run, a brain record): fire(deptId) starts them near that department.
const NV = "g"; // the neuron lines are Hermes' caduceus (Alex, 2026-11-18); the a/b/c nebula variants were retired
const NCFG = { soma: 2.0 };
const NR = rng(2718);
// SACRED GEOMETRY (2026-11-18): the somas sit on the figure and the axons ARE its lines.
// (th, ps) are the torus angles (around the ring, around the tube); ar is the distance from the tube's centre line.
const PHI = (1 + Math.sqrt(5)) / 2, GA = TAU / (PHI * PHI); // the golden angle
const node = (th, ps, ar, sz = 1) => ({ th, ps, ar, df: 0.06, dp: 0, sz, den: [] });
function sacred(v) {
  const S = [], E = []; const link = (a, b, bend = 0) => E.push({ a, b, bend });
  { // CADUCEUS of Hermes: two serpent strands wind as a double helix around the staff of light (the tube's centre line);
    // nodes at golden-ratio spacing; the strands cross at phi intervals and every crossing is a synapse joining both
    const N = 89, turns = 8; for (const off of [0, Math.PI]) for (let i = 0; i < N; i++) { const u = (i / N); S.push(node(u * TAU, u * turns * TAU + off, 1.05, 0.7 + 0.5 * ((i % 5) === 0))); }
    for (const b of [0, N]) for (let i = 0; i < N; i++) link(b + i, b + ((i + 1) % N), 0.18);
    for (let k = 1; k <= 34; k++) { const i = Math.round((k * N / PHI) % N); link(i, N + i, 0.5); }
  }
  return { S, E };
}
const somas = []; const axons = [];
if (NCFG.n) {
  somas.push(...Array.from({ length: NCFG.n }, (_, i) => { const th = ((i + NR() * 0.8) / NCFG.n) * TAU; return { th, ps: NR() * TAU, ar: 0.25 + NR() * 0.95, df: 0.05 + NR() * 0.12, dp: NR() * TAU, sz: 0.6 + NR() * 0.9,
    den: Array.from({ length: NCFG.den }, () => { const a = NR() * TAU, l = 7 + NR() * 13; return { a, l, f: (NR() - 0.5) * 1.3, l2: l * (0.4 + NR() * 0.4) }; }) }; }));
  const seen = new Set(); somas.forEach((s, i) => { const near = somas.map((o, j) => [j, Math.min(Math.abs(o.th - s.th), TAU - Math.abs(o.th - s.th)) + Math.abs(o.ps - s.ps) * 0.04]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, NCFG.deg);
    for (const [j] of near) { const k = i < j ? i + "-" + j : j + "-" + i; if (seen.has(k)) continue; seen.add(k); axons.push({ a: i, b: j, bend: (NR() - 0.5) * 0.9 }); } });
} else { const g = sacred(NV); somas.push(...g.S); axons.push(...g.E); }
// Caduceus only: the staff of light along the tube's centre line and two wings rising at the top of the ring
function drawStaff(o, G, t, rot, breath) {
  if (NV !== "g") return; const d = G.d; o.lineCap = "round";
  for (const [w, a] of [[7, 0.06], [3, 0.16], [1.2, 0.6]]) { o.strokeStyle = `rgba(255,236,190,${a * (0.8 + 0.2 * breath)})`; o.lineWidth = w * d; o.beginPath(); for (let k = 0; k <= 96; k++) { const p = torus(G, (k / 96) * TAU + rot, 0, 0); k ? o.lineTo(p.x, p.y) : o.moveTo(p.x, p.y); } o.stroke(); }
  const top = torus(G, -Math.PI / 2, 0, 0); // the back of the ring, highest on screen
  for (const side of [-1, 1]) for (let f = 0; f < 7; f++) { const len = (G.R * 0.42) * (1 - f * 0.11), a0 = -Math.PI / 2 + side * (0.35 + f * 0.17) + Math.sin(t * 0.8) * 0.04 * side;
    o.strokeStyle = `rgba(${230 - f * 8},${225 - f * 6},255,${0.55 - f * 0.05})`; o.lineWidth = (2.2 - f * 0.2) * d; o.beginPath(); o.moveTo(top.x, top.y);
    o.quadraticCurveTo(top.x + Math.cos(a0 - side * 0.5) * len * 0.6, top.y + Math.sin(a0 - side * 0.5) * len * 0.6 - 10 * d, top.x + Math.cos(a0) * len * (side > 0 ? 1 : 1), top.y + Math.sin(a0) * len * 0.55); o.stroke(); }
  const gl = o.createRadialGradient(top.x, top.y, 0, top.x, top.y, 22 * d); gl.addColorStop(0, "rgba(255,245,210,.95)"); gl.addColorStop(1, "rgba(255,220,160,0)"); o.fillStyle = gl; o.fillRect(top.x - 22 * d, top.y - 22 * d, 44 * d, 44 * d);
}
const spikes = []; const flashes = [];
const hueAt = (th) => { const u = (((th / TAU) % 1) + 1) % 1; return HUE[Math.floor(u * NS) % NS]; };
export function fire(id, n = 3) { const i = DEPTS.findIndex((d) => d[0] === id), th0 = i < 0 ? Math.random() * TAU : (i / 12) * TAU;
  const cand = axons.map((x, k) => [k, Math.min(Math.abs(somas[x.a].th - th0), TAU - Math.abs(somas[x.a].th - th0))]).sort((a, b) => a[1] - b[1]).slice(0, n * 2);
  for (let q = 0; q < n && cand.length; q++) { const [k] = cand.splice((Math.random() * cand.length) | 0, 1)[0]; if (spikes.length < 40) spikes.push({ k, t0: st.t + q * 0.12, dir: Math.random() < 0.5 ? 1 : -1, hop: 2 }); } }
function drawNeurons(o, G, t, rot, breath) {
  const d = G.d, A = G.a, P = somas.map((s) => { const p = torus(G, s.th + rot + Math.sin(t * s.df + s.dp) * 0.02, s.ps + t * s.df * 0.6, A * s.ar * (1.25 + 0.06 * Math.sin(t * 0.4 + s.dp))); p.depth = (p.z / (G.R + A * 1.6) + 1) / 2; return p; });
  drawStaff(o, G, t, rot, breath);
  o.lineCap = "round";
  // axons: fine curved fibres, brighter in front (depth), one stroke per axon
  for (const x of axons) { const p = P[x.a], q = P[x.b], h = hueAt(somas[x.a].th), dep = (p.depth + q.depth) / 2, mx = (p.x + q.x) / 2 - (q.y - p.y) * x.bend * 0.35, my = (p.y + q.y) / 2 + (q.x - p.x) * x.bend * 0.35;
    x.p = p; x.q = q; x.mx = mx; x.my = my; o.strokeStyle = `hsla(${h[0]},90%,${h[2] + 8}%,${(0.1 + 0.28 * dep) * (0.85 + breath * 0.15)})`; o.lineWidth = (0.5 + 0.7 * dep) * d; o.beginPath(); o.moveTo(p.x, p.y); o.quadraticCurveTo(mx, my, q.x, q.y); o.stroke(); }
  // dendrites: short forked branches around each soma
  somas.forEach((s, i) => { const p = P[i], h = hueAt(s.th), k = p.k * d * (0.7 + 0.5 * p.depth); o.strokeStyle = `hsla(${h[0]},85%,${h[2] + 12}%,${0.14 + 0.3 * p.depth})`; o.lineWidth = 0.6 * d; o.beginPath();
    for (const b of s.den) { const a = b.a + Math.sin(t * 0.3 + s.dp) * 0.08, ex = p.x + Math.cos(a) * b.l * k, ey = p.y + Math.sin(a) * b.l * k; o.moveTo(p.x, p.y); o.lineTo(ex, ey); for (const f of [-1, 1]) { const a2 = a + f * (0.45 + b.f * 0.3); o.moveTo(ex, ey); o.lineTo(ex + Math.cos(a2) * b.l2 * k, ey + Math.sin(a2) * b.l2 * k); } }
    o.stroke(); });
  // somas: soft glow + bright nucleus, size and light by depth
  somas.forEach((s, i) => { const p = P[i], h = hueAt(s.th), r = (NCFG.soma * s.sz * (0.6 + 0.7 * p.depth) + breath * 0.3) * d * 3.2, gl = o.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    gl.addColorStop(0, `hsla(${h[0]},100%,88%,${0.55 + 0.4 * p.depth})`); gl.addColorStop(0.25, `hsla(${h[0]},100%,${h[2] + 10}%,${0.25 + 0.3 * p.depth})`); gl.addColorStop(1, `hsla(${h[0]},100%,50%,0)`); o.fillStyle = gl; o.fillRect(p.x - r, p.y - r, r * 2, r * 2); });
  // spikes: travel along an axon in 0.9 s, flash the synapse on arrival, sometimes hop on
  for (let i = spikes.length - 1; i >= 0; i--) { const sp = spikes[i], x = axons[sp.k], u = (t - sp.t0) / 0.9; if (u < 0) continue; if (u >= 1 || !x.p) { spikes.splice(i, 1); const end = sp.dir > 0 ? x.b : x.a; if (x.p) flashes.push({ s: end, t0: t });
      if (sp.hop > 0 && spikes.length < 40) { const nx = axons.findIndex((y, k) => k !== sp.k && (y.a === end || y.b === end)); if (nx >= 0) spikes.push({ k: nx, t0: t, dir: axons[nx].a === end ? 1 : -1, hop: sp.hop - 1 }); } continue; }
    const v = sp.dir > 0 ? u : 1 - u, w = 1 - v, bx = w * w * x.p.x + 2 * w * v * x.mx + v * v * x.q.x, by = w * w * x.p.y + 2 * w * v * x.my + v * v * x.q.y, r = 7 * d, gl = o.createRadialGradient(bx, by, 0, bx, by, r);
    gl.addColorStop(0, "rgba(255,255,255,.95)"); gl.addColorStop(0.3, "rgba(170,240,255,.55)"); gl.addColorStop(1, "rgba(120,200,255,0)"); o.fillStyle = gl; o.fillRect(bx - r, by - r, r * 2, r * 2); }
  for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i], k = 1 - (t - f.t0) / 0.6; if (k <= 0) { flashes.splice(i, 1); continue; } const p = P[f.s], r = (6 + (1 - k) * 18) * d, gl = o.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); gl.addColorStop(0, `rgba(255,255,255,${0.9 * k})`); gl.addColorStop(1, "rgba(255,255,255,0)"); o.fillStyle = gl; o.fillRect(p.x - r, p.y - r, r * 2, r * 2); }
  o.lineCap = "butt";
}
function layer(k, w, h) { let c = st[k]; if (!c) c = st[k] = document.createElement("canvas"); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c; }

// ---------- frame ----------
function loop(now) {
  const c = document.getElementById("d-rx"); if (!c || document.hidden) { st.raf = 0; return; }
  const js0 = performance.now(), raw = (now - st.last) / 1000; st.last = now; const dt = Math.min(0.05, raw > 0 ? raw : 0.016); st.t += dt;
  st.fps += (1 / Math.max(raw, 0.001) - st.fps) * 0.05; if (raw > 0.024) st.slow++; else st.slow = Math.max(0, st.slow - 0.25); if (st.slow > 40 && st.q > 0.35) { st.q = Math.max(0.35, st.q - 0.15); st.slow = 0; } else if (st.slow === 0 && st.q < 1 && st.fps > 57) st.q = Math.min(1, st.q + 0.002);
  const rc = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1), W = Math.max(10, Math.round(rc.width * d)), H = Math.max(10, Math.round(rc.height * d));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const padX = (c.dataset.pad ? Number(c.dataset.pad) : 0) * d;
  const g = c.getContext("2d"), G = (st.geo = geometry(W, H, d, padX)), t = st.t, s = st.state, deps = (s && s.departments) || [], rot = t * 0.11;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.clearRect(0, 0, W, H); g.drawImage(background(G), 0, 0);
  const breath = 0.5 + 0.5 * Math.sin(t * 0.9);
  for (const id in st.active) if (st.active[id].until < t) delete st.active[id];
  // riders: one per department, fixed on the ring, turning with it
  const riders = (st.riders = DEPTS.map(([id, nm], i) => { const dep = deps.find((x) => x.id === id), ws = (dep && dep.workers) || [], busy = ws.filter((w) => w.status === "busy").length, blk = ws.filter((w) => w.status === "blocked").length, live = !!(dep && dep.live);
    const th = (i / 12) * TAU + rot, pu = pulseOf(id, t), bob = Math.sin(t * 1.5 + i * 1.7) * 0.05, jump = pu > 0 ? Math.abs(Math.sin((1 - pu) * Math.PI * 3)) * pu * 0.55 : 0, size = Math.max(9 * d, Math.min(17 * d, G.R * 0.072)) * (0.9 + (ws.length ? busy / ws.length : 0) * 0.3);
    const ps = Math.PI / 2 - 0.22 + Math.sin(t * 0.35 + i) * 0.12, p = torus(G, th, ps, G.a * (1.22 + bob + jump) + size * 0.8), cc = torus(G, th, 0, 0);
    return { id, nm, i, th, x: p.x, y: p.y, z: p.z, k: p.k, cz: cc.z, c: NEON[i], dep, ws, busy, blk, n: ws.length, live, share: ws.length ? busy / ws.length : 0, pu, size: size * p.k, act: st.active[id] || null }; }));
  // the core looks at the rider a real event touched; otherwise its gaze wanders slowly (no highlight)
  if (t - st.lookAt > 5) { st.wander = Math.floor(t / 4) % 12; }
  const lookId = t - st.lookAt <= 5 ? st.look : st.hover || DEPTS[st.wander][0];
  drawDisc(g, G, t, breath);
  drawCoils(g, G, riders, t, false);
  // strands -> offscreen, then composite sharp + blurred (bloom)
  const off = layer("off", W, H), o = off.getContext("2d"); o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = "source-over"; o.clearRect(0, 0, W, H); o.globalCompositeOperation = "lighter"; o.lineWidth = 1 * d; o.lineJoin = "round";
  drawNeurons(o, G, t, rot, breath);
  const sw = Math.max(8, W >> 3), sh = Math.max(8, H >> 3), sm = layer("small", sw, sh), m = sm.getContext("2d"); m.globalCompositeOperation = "copy"; m.imageSmoothingEnabled = true; m.drawImage(off, 0, 0, sw, sh);
  g.globalCompositeOperation = "lighter"; g.imageSmoothingEnabled = true; g.globalAlpha = 0.3; g.drawImage(sm, 0, 0, W, H); g.globalAlpha = 1; g.drawImage(off, 0, 0); g.globalCompositeOperation = "source-over";
  drawCoils(g, G, riders, t, true);
  // depth-sorted bodies: far riders, core, helpers, near riders
  const hp = (s && s.helpers) || {}, lanes = (s && s.lanes) || [];
  const moons = MOONS.map(([k, lb, cl], j) => { const v = hp[k], on = v === "connected" || (v && v.status === "connected") || lanes.some((l) => l.helper === k); const th = -t * 0.2 + j * (TAU / 3), p = proj(G, Math.cos(th) * G.R * 0.52, G.R * 0.02 + Math.sin(t * 1.2 + j) * G.R * 0.012, Math.sin(th) * G.R * 0.52); return { moon: 1, k, lb, cl, on: !!on, x: p.x, y: p.y, z: p.z, kk: p.k }; });
  const bodies = [...riders, ...moons, { core: 1, z: 0 }].sort((a, b) => a.z - b.z);
  for (const b of bodies) { if (b.core) drawCore(g, G, t, s, breath, riders.find((r) => r.id === lookId)); else if (b.moon) drawMoon(g, G, b, t); else drawRider(g, G, b, t); }
  drawTickets(g, G, dt, t);
  drawConnectors(g, G, c, rc, t);
  st.ms = (st.ms || 0) + (performance.now() - js0 - (st.ms || 0)) * 0.05;
  st.raf = requestAnimationFrame(loop);
}
const pulseOf = (id, t) => (st.pulses[id] != null ? Math.max(0, 1 - (t - st.pulses[id]) / 1.8) : 0);
function text(g, s, x, y, font, fill, d) { g.font = font; g.lineJoin = "round"; g.lineWidth = 3 * d; g.strokeStyle = "rgba(3,5,12,.86)"; g.strokeText(s, x, y); g.fillStyle = fill; g.fillText(s, x, y); }
function ringPath(g, G, r, a0 = 0, a1 = TAU, Y = 0) { const n = 72; g.beginPath(); for (let k = 0; k <= n; k++) { const a = a0 + (k / n) * (a1 - a0), p = proj(G, Math.cos(a) * r, Y, Math.sin(a) * r); k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } }

// faint grid disc and teal rings in the hole, under the core
function drawDisc(g, G, t, breath) {
  const d = G.d; g.globalCompositeOperation = "lighter";
  const p0 = proj(G, 0, 0, 0), gl = g.createRadialGradient(p0.x, p0.y, 0, p0.x, p0.y, G.R * 0.8); gl.addColorStop(0, "rgba(60,220,230,.16)"); gl.addColorStop(1, "rgba(60,220,230,0)"); g.fillStyle = gl; g.save(); g.translate(p0.x, p0.y); g.rotate(ROLL); g.scale(1, SIN); g.beginPath(); g.arc(0, 0, G.R * 0.8, 0, TAU); g.restore(); g.fill();
  g.lineWidth = 0.7 * d; g.strokeStyle = "rgba(90,230,235,.10)"; g.beginPath(); for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU + t * 0.03, p1 = proj(G, Math.cos(a) * G.R * 0.3, 0, Math.sin(a) * G.R * 0.3), p2 = proj(G, Math.cos(a) * G.R * 0.72, 0, Math.sin(a) * G.R * 0.72); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); } g.stroke();
  [0.34, 0.42, 0.52, 0.6, 0.7].forEach((k, i) => { g.strokeStyle = `rgba(80,235,225,${0.3 + (i === 2 ? 0.3 : 0) + 0.12 * Math.sin(t * 1.1 - i * 0.9)})`; g.lineWidth = (i === 2 ? 1.6 : 1) * d; ringPath(g, G, G.R * k); g.stroke(); });
  g.strokeStyle = `rgba(120,255,240,${0.45 + breath * 0.2})`; g.lineWidth = 1.4 * d; for (let k = 0; k < 3; k++) { const a = t * 0.5 + k * (TAU / 3); ringPath(g, G, G.R * 0.6, a, a + 0.7); g.stroke(); const b = -t * 0.35 + k * (TAU / 3); ringPath(g, G, G.R * 0.42, b, b + 0.45); g.stroke(); }
  g.globalCompositeOperation = "source-over";
}
// a coil = three thin rings of the department colour wrapped around the tube where its rider sits
function drawCoils(g, G, riders, t, front) {
  const d = G.d; g.lineCap = "round";
  for (const r of riders) { const lit = Math.min(1, (r.live ? 0.6 : 0.22) + r.share * 0.3 + r.pu * 0.6 + (r.act ? 0.3 : 0)), ar = G.a * (1.22 + r.pu * 0.14), cc = r.live ? r.c : r.c.map((v) => v * 0.45 + 30);
    if (front && (r.live || r.pu)) { g.globalCompositeOperation = "lighter"; const p = torus(G, r.th, Math.PI / 2, ar), rad = G.a * (0.8 + r.pu * 0.9), gl = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad); gl.addColorStop(0, col(r.c, 0.1 + r.pu * 0.4)); gl.addColorStop(1, col(r.c, 0)); g.fillStyle = gl; g.fillRect(p.x - rad, p.y - rad, rad * 2, rad * 2); }
    g.globalCompositeOperation = "source-over";
    for (let j = -1; j <= 1; j++) { const th = r.th + j * 0.03; g.strokeStyle = col(cc, front ? lit : lit * 0.3); g.lineWidth = (front ? 1.25 : 0.9) * d * (1 + r.pu * 0.8); g.beginPath(); let pen = false;
      for (let k = 0; k <= 40; k++) { const ps = (k / 40) * TAU, p = torus(G, th, ps, ar * (1 + j * j * 0.025)), vis = p.z >= r.cz - G.a * 0.05; if (front && !vis) { pen = false; continue; } pen ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); pen = true; }
      g.stroke(); } }
  g.lineCap = "butt"; g.globalCompositeOperation = "source-over";
}
function shapePath(g, i, x, y, s) { const f = SHAPES[i % SHAPES.length]; g.beginPath(); for (let k = 0; k <= 44; k++) { const a = (k / 44) * TAU, [r, sx, sy] = f(a); const px = x + Math.cos(a) * r * s * sx, py = y + Math.sin(a) * r * s * sy; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); }
function drawRider(g, G, r, t) {
  const d = G.d, s = r.size, hot = r.act || r.pu > 0, hov = st.hover === r.id;
  g.globalCompositeOperation = "lighter"; const gr = s * (1.9 + r.pu * 2 + (r.act ? 0.8 : 0)), gl = g.createRadialGradient(r.x, r.y, s * 0.6, r.x, r.y, gr); gl.addColorStop(0, col(r.c, r.live ? 0.07 + (hot ? 0.5 : 0) : 0.03)); gl.addColorStop(1, col(r.c, 0)); g.fillStyle = gl; g.beginPath(); g.arc(r.x, r.y, gr, 0, TAU); g.fill(); g.globalCompositeOperation = "source-over";
  const base = r.live ? r.c : r.c.map((v) => v * 0.28 + 38), b = g.createRadialGradient(r.x - s * 0.35, r.y - s * 0.5, s * 0.05, r.x, r.y, s * 1.35); b.addColorStop(0, "rgba(255,255,255,.95)"); b.addColorStop(0.2, col(base.map((v) => Math.min(255, v + 40)), 1)); b.addColorStop(0.62, col(base, 1)); b.addColorStop(1, col(base.map((v) => v * 0.42), 1));
  shapePath(g, r.i, r.x, r.y, s); g.fillStyle = b; g.fill(); g.strokeStyle = hov || r.act ? "rgba(255,255,255,.9)" : col(base.map((v) => Math.min(255, v + 70)), 0.7); g.lineWidth = (hov || r.act ? 1.5 : 0.8) * d; g.stroke();
  g.fillStyle = "rgba(255,255,255,.5)"; g.beginPath(); g.ellipse(r.x - s * 0.36, r.y - s * 0.5, s * 0.22, s * 0.11, -0.6, 0, TAU); g.fill();
  // two white eyes; closed when the department is idle
  const bl = (t + r.i * 1.3) % (4.3 + r.i * 0.31) < 0.12, ey = r.y - s * 0.02, ex = s * 0.3, core = st.geo, dx = core.cx - r.x, dy = core.cy - r.y, l = Math.hypot(dx, dy) || 1, lx = (dx / l) * s * 0.06, ly = (dy / l) * s * 0.06;
  if (r.live && !bl) { g.fillStyle = "#fff"; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(r.x + sx * ex + lx, ey + ly, s * 0.13, s * 0.3, sx * 0.1, 0, TAU); g.fill(); } }
  else { g.strokeStyle = r.live ? "#fff" : "rgba(255,255,255,.55)"; g.lineWidth = s * 0.1; g.lineCap = "round"; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(r.x + sx * ex - s * 0.13, ey); g.lineTo(r.x + sx * ex + s * 0.13, ey); g.stroke(); } g.lineCap = "butt"; }
  if (r.pu) { g.strokeStyle = `rgba(255,255,255,${r.pu * 0.8})`; g.lineWidth = 1.4 * d; g.beginPath(); g.arc(r.x, r.y, s * 1.3 + (1 - r.pu) * 24 * d, 0, TAU); g.stroke(); }
  if (r.blk) { const bx = r.x + s * 0.95, by = r.y - s * 0.95; g.fillStyle = "#ff4d4d"; g.beginPath(); g.arc(bx, by, 5 * d, 0, TAU); g.fill(); g.fillStyle = "#fff"; g.font = `700 ${6.5 * d}px ${MONO}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(r.blk), bx, by + 0.4 * d); }
  g.textAlign = "center"; g.textBaseline = "alphabetic"; const up = r.z < 0, ly2 = up ? r.y - s * 1.35 - 11 * d : r.y + s * 1.3 + 10 * d;
  text(g, SHORT[r.id], r.x, ly2, `700 ${8 * d}px ${MONO}`, r.live ? "#eef3fb" : "#7d8aa0", d);
  text(g, r.n ? `${r.busy}/${r.n}` : "—", r.x, ly2 + 9.5 * d, `600 ${7.5 * d}px ${MONO}`, r.n ? col(r.c, 1) : "#5b6577", d);
}
function drawMoon(g, G, m, t) {
  const d = G.d, r = (m.on ? 6 : 3.2) * d * m.kk;
  if (m.on && m.k === "grok") { // Grok: a black body with white eyes, a white halo and a slow white ping, so "connected" reads at a glance
    const R = r * 2.1, pu = (t * 0.55) % 1; g.globalCompositeOperation = "lighter"; const gl = g.createRadialGradient(m.x, m.y, R * 0.7, m.x, m.y, R * 3.4); gl.addColorStop(0, "rgba(255,255,255,.5)"); gl.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gl; g.beginPath(); g.arc(m.x, m.y, R * 3.4, 0, TAU); g.fill();
    g.strokeStyle = `rgba(255,255,255,${(0.6 * (1 - pu)).toFixed(3)})`; g.lineWidth = 1 * d; g.beginPath(); g.arc(m.x, m.y, R * (1.15 + pu * 1.7), 0, TAU); g.stroke(); g.globalCompositeOperation = "source-over";
    const b = g.createRadialGradient(m.x - R * 0.35, m.y - R * 0.45, R * 0.1, m.x, m.y, R); b.addColorStop(0, "#3c3c44"); b.addColorStop(0.55, "#0e0e11"); b.addColorStop(1, "#000"); g.fillStyle = b; g.beginPath(); g.arc(m.x, m.y, R, 0, TAU); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1.3 * d; g.stroke();
    g.fillStyle = "#fff"; g.shadowColor = "#fff"; g.shadowBlur = 5 * d; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(m.x + sx * R * 0.34, m.y - R * 0.04, R * 0.15, R * 0.3, 0, 0, TAU); g.fill(); } g.shadowBlur = 0;
    g.textAlign = "center"; g.textBaseline = "alphabetic"; text(g, m.lb, m.x + 3 * d, m.y + R + 9 * d, `700 ${7.5 * d}px ${MONO}`, "#fff", d); const tw = g.measureText(m.lb).width; g.fillStyle = "#22ff88"; g.beginPath(); g.arc(m.x + 3 * d - tw / 2 - 5 * d, m.y + R + 6.4 * d, 1.8 * d, 0, TAU); g.fill(); return; }
  if (m.on) { g.globalCompositeOperation = "lighter"; const gl = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, r * 3.2); gl.addColorStop(0, col(m.cl, 0.55)); gl.addColorStop(1, col(m.cl, 0)); g.fillStyle = gl; g.beginPath(); g.arc(m.x, m.y, r * 3.2, 0, TAU); g.fill(); g.globalCompositeOperation = "source-over";
    const b = g.createRadialGradient(m.x - r * 0.3, m.y - r * 0.4, r * 0.1, m.x, m.y, r * 1.2); b.addColorStop(0, "#fff"); b.addColorStop(0.3, col(m.cl, 1)); b.addColorStop(1, col(m.cl.map((v) => v * 0.4), 1)); g.fillStyle = b; g.beginPath(); g.arc(m.x, m.y, r, 0, TAU); g.fill(); g.fillStyle = "#0b1020"; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(m.x + sx * r * 0.32, m.y, r * 0.13, r * 0.3, 0, 0, TAU); g.fill(); } }
  else { g.fillStyle = "#0a0e18"; g.strokeStyle = "rgba(125,138,160,.7)"; g.lineWidth = 1 * d; g.beginPath(); g.arc(m.x, m.y, r, 0, TAU); g.fill(); g.stroke(); }
  g.textAlign = "center"; g.textBaseline = "alphabetic"; text(g, m.lb, m.x, m.y + r + 8 * d, `600 ${6.5 * d}px ${MONO}`, m.on ? "#e6edf7" : "#66728a", d);
}
// the core: a warm pearl with a gold rim and a face. Mood follows the survival stage; it tilts toward what it watches.
function drawCore(g, G, t, s, breath, tg) {
  const d = G.d, sv = s && s.survival, stage = (sv && sv.stage) || "healthy", halted = !!(s && s.killSwitch), dead = stage === "destroyed";
  const hit = Math.max(0, 1 - (t - st.corePulse) / 1.2), c0 = proj(G, 0, G.R * 0.1 + Math.sin(t * 1.1) * G.R * 0.012, 0), r = G.RS * (1 + 0.012 * Math.sin(t * 1.8) + hit * 0.05);
  let lx = 0, ly = 0; if (tg) { const dx = tg.x - c0.x, dy = tg.y - c0.y, l = Math.hypot(dx, dy) || 1; lx = dx / l; ly = dy / l; } const cx = c0.x + lx * r * 0.03, cy = c0.y;
  const tint = { thriving: [255, 214, 110], healthy: [255, 206, 120], hurt: [255, 160, 70], critical: [255, 90, 60], destroyed: [120, 120, 120] }[stage] || [255, 206, 120];
  g.globalCompositeOperation = "lighter"; const R2 = r * (2.5 + breath * 0.35 + hit * 1.1), cor = g.createRadialGradient(cx, cy, r * 0.7, cx, cy, R2); cor.addColorStop(0, col(tint, 0.55 + hit * 0.3)); cor.addColorStop(0.4, col(tint, 0.14)); cor.addColorStop(1, col(tint, 0)); g.fillStyle = cor; g.beginPath(); g.arc(cx, cy, R2, 0, TAU); g.fill(); g.globalCompositeOperation = "source-over";
  // contact shadow on the disc
  const sh = proj(G, 0, 0, 0); { const sg = g.createRadialGradient(0, 0, 0, 0, 0, r); sg.addColorStop(0, "rgba(0,0,0,.55)"); sg.addColorStop(1, "rgba(0,0,0,0)"); g.save(); g.translate(sh.x, sh.y + r * 0.9); g.rotate(ROLL); g.scale(1, 0.26); g.fillStyle = sg; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.restore(); }
  const b = g.createRadialGradient(cx - r * 0.32 + lx * r * 0.1, cy - r * 0.42 + ly * r * 0.1, r * 0.06, cx, cy, r * 1.02);
  if (dead) { b.addColorStop(0, "#e8e8e8"); b.addColorStop(0.6, "#8d8d8d"); b.addColorStop(1, "#3a3a3a"); } else { b.addColorStop(0, "#ffffff"); b.addColorStop(0.42, "#fffaf0"); b.addColorStop(0.78, "#f6e2bd"); b.addColorStop(0.94, col(tint, 1)); b.addColorStop(1, col(tint.map((v) => v * 0.72), 1)); }
  g.fillStyle = b; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); g.strokeStyle = dead ? "rgba(200,200,200,.5)" : col(tint.map((v) => Math.min(255, v + 30)), 0.95); g.lineWidth = 1.6 * d; g.stroke();
  g.fillStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.ellipse(cx - r * 0.42, cy - r * 0.55, r * 0.2, r * 0.09, -0.65, 0, TAU); g.fill();
  if (halted) { g.strokeStyle = "rgba(255,77,77,.9)"; g.lineWidth = 2 * d; g.setLineDash([6 * d, 5 * d]); g.beginPath(); g.arc(cx, cy, r * 1.22, -t * 0.4, -t * 0.4 + TAU); g.stroke(); g.setLineDash([]); }
  // face
  if (t > st.blinkAt + 3.2 + (Math.sin(st.blinkAt * 7) + 1) * 1.7) st.blinkAt = t; const bl = t - st.blinkAt < 0.13;
  const ink = "#15100c", fx = cx + lx * r * 0.13, fy = cy + ly * r * 0.1, ex = r * 0.25, ey = -r * 0.1, ew = r * 0.105, sad = stage === "critical" || dead, tall = r * (sad ? 0.24 : stage === "hurt" ? 0.3 : 0.36), tiltE = Math.sin(t * 0.6) * 0.04 + lx * 0.08;
  g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = "round";
  for (const sx of [-1, 1]) { const x = fx + sx * ex, y = fy + ey; if (bl || halted) { g.lineWidth = r * 0.07; g.beginPath(); g.moveTo(x - ew, y); g.lineTo(x + ew, y); g.stroke(); continue; }
    g.save(); g.translate(x, y); g.rotate(sx * 0.12 + tiltE + (stage === "hurt" ? -sx * 0.2 : sad ? sx * 0.22 : 0)); g.beginPath(); g.ellipse(0, 0, ew, tall, 0, 0, TAU); g.fill(); g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.arc(-ew * 0.2, -tall * 0.55, ew * 0.32, 0, TAU); g.fill(); g.fillStyle = ink; g.restore(); }
  g.lineWidth = r * 0.06; g.beginPath(); const my = fy + r * 0.5;
  if (stage === "thriving") g.arc(fx, my - r * 0.2, r * 0.26, 0.16 * Math.PI, 0.84 * Math.PI); else if (stage === "healthy") g.arc(fx, my - r * 0.24, r * 0.22, 0.27 * Math.PI, 0.73 * Math.PI); else if (stage === "hurt") { g.moveTo(fx - r * 0.13, my - r * 0.04); g.lineTo(fx + r * 0.13, my - r * 0.04); } else g.arc(fx, my + r * 0.14, r * 0.17, 1.22 * Math.PI, 1.78 * Math.PI);
  g.stroke(); g.lineCap = "butt";
}
// a ticket rides the current: along the top of the tube from rider to rider, then drops into the core
function drawTickets(g, G, dt, t) {
  const d = G.d, rot = t * 0.11, coreP = proj(G, 0, G.R * 0.1, 0); g.globalCompositeOperation = "lighter"; g.lineCap = "round";
  const thOf = (id) => (DEPTS.findIndex((x) => x[0] === id) / 12) * TAU;
  for (let k = st.comets.length - 1; k >= 0; k--) { const c = st.comets[k]; c.t += dt / 1.25; if (c.t < 0) continue; const nSeg = c.path.length - 1;
    if (!c.done) { const seg = Math.min(nSeg - 1, Math.floor(c.t)); if (seg > c.seg) { c.seg = seg; activate(c.path[seg].id, c.path[seg].text, c.c); }
      if (c.t >= nSeg) { c.done = 1; const L = c.path[nSeg]; if (L.id === "core") st.corePulse = t; else activate(L.id, L.text, c.c); }
      else { const A = c.path[seg], B = c.path[seg + 1]; let u = c.t - seg; u = u * u * (3 - 2 * u); let p;
        if (B.id === "core") { const a = torus(G, thOf(A.id) + rot, Math.PI / 2, G.a * 1.1), mx = (a.x + coreP.x) / 2, my = Math.min(a.y, coreP.y) - G.R * 0.25; p = { x: (1 - u) ** 2 * a.x + 2 * (1 - u) * u * mx + u * u * coreP.x, y: (1 - u) ** 2 * a.y + 2 * (1 - u) * u * my + u * u * coreP.y }; }
        else { const a0 = thOf(A.id); let da = thOf(B.id) - a0; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; p = torus(G, a0 + da * u + rot, Math.PI / 2 + Math.sin(u * Math.PI) * 0.5, G.a * (1.1 + Math.sin(u * Math.PI) * 0.25)); }
        c.trail.unshift({ x: p.x, y: p.y }); if (c.trail.length > 52) c.trail.pop(); } }
    else { c.trail.pop(); c.trail.pop(); if (!c.trail.length) { st.comets.splice(k, 1); continue; } }
    const n = c.trail.length; for (let i = 0; i < n - 1; i++) { const w = 1 - i / n; g.strokeStyle = col(c.c, Math.pow(w, 1.4)); g.lineWidth = (0.5 + 4 * w) * d; g.beginPath(); g.moveTo(c.trail[i].x, c.trail[i].y); g.lineTo(c.trail[i + 1].x, c.trail[i + 1].y); g.stroke(); }
    if (n && !c.done) { const h = c.trail[0], gl = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, 13 * d); gl.addColorStop(0, "rgba(255,255,255,1)"); gl.addColorStop(0.25, col(c.c, 0.9)); gl.addColorStop(1, col(c.c, 0)); g.fillStyle = gl; g.beginPath(); g.arc(h.x, h.y, 13 * d, 0, TAU); g.fill();
      if (c.label && k >= st.comets.length - 2) { g.globalCompositeOperation = "source-over"; g.textAlign = "left"; g.textBaseline = "middle"; text(g, c.label, h.x + 11 * d, h.y - 10 * d, `700 ${8.5 * d}px ${MONO}`, col(c.c, 1), d); g.globalCompositeOperation = "lighter"; } } }
  g.lineCap = "butt"; g.globalCompositeOperation = "source-over";
}
// callout cards are DOM (crisp, clickable). The reactor lights the card of an active rider and draws the elbow wire to it.
function drawConnectors(g, G, c, rc, t) {
  if (t - st.cardsAt > 1) { st.cardsAt = t; st.cards = {}; document.querySelectorAll(".rc[data-id]").forEach((el) => (st.cards[el.dataset.id] = el)); }
  const d = G.d, kx = c.width / rc.width;
  for (const id in st.cards) { const el = st.cards[id], a = st.active[id], on = !!a || st.hover === id; if (on !== el.classList.contains("on")) el.classList.toggle("on", on); const ev = el.querySelector(".rc-e"); if (ev) { const tx = a ? a.text : ""; if (ev.textContent !== tx) ev.textContent = tx; el.classList.toggle("ev", !!tx); }
    if (!on) continue; const r = st.riders.find((x) => x.id === id); if (!r) continue; const b = el.getBoundingClientRect(); if (!b.width || b.bottom < rc.top || b.top > rc.bottom || b.left >= rc.right || b.right <= rc.left) continue;
    const left = b.left + b.width / 2 < rc.left + rc.width / 2, ax = ((left ? b.right : b.left) - rc.left) * kx, ay = (b.top + b.height / 2 - rc.top) * kx, ex = ax + (left ? 1 : -1) * 16 * d, cc = a && a.c ? a.c : r.c;
    g.globalCompositeOperation = "lighter"; g.strokeStyle = col(cc, 0.95); g.lineWidth = 1.3 * d; g.lineJoin = "round"; { const ty = r.y - r.size * 1.25, sd = left ? 1 : -1, kxp = r.x - sd * Math.abs(ty - ay), mxp = sd * (kxp - ex) > 0 ? kxp : ex; g.beginPath(); g.moveTo(ax, ay); g.lineTo(mxp, ay); g.lineTo(r.x, ty); g.stroke(); }
    g.fillStyle = col(cc, 1); g.beginPath(); g.arc(ax, ay, 2.6 * d, 0, TAU); g.fill(); g.beginPath(); g.arc(r.x, r.y - r.size * 1.25, 2.6 * d, 0, TAU); g.fill(); g.globalCompositeOperation = "source-over"; }
}
function pick(e) { const c = e.currentTarget, r = c.getBoundingClientRect(), k = c.width / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k; let best = null, bd = 26 * k; for (const p of st.riders) { const dd = Math.hypot(p.x - x, p.y - y); if (dd < bd) { bd = dd; best = p; } } return best; }
export function wireReactor(c, onRider) {
  if (c.dataset.wired) return; c.dataset.wired = 1;
  c.addEventListener("click", (e) => { const p = pick(e); if (p) onRider(p.id); });
  c.addEventListener("mousemove", (e) => { const p = pick(e); st.hover = p ? p.id : null; c.style.cursor = p ? "pointer" : "default"; });
  c.addEventListener("mouseleave", () => { st.hover = null; });
}
export const hoverRider = (id) => { st.hover = id; };
if (typeof window !== "undefined") (window.__aq = window.__aq || {}).fire = fire;
