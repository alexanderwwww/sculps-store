// SYMBIOTE screen (PAPER): every pump.fun launch paper-traded in two lanes. Reads GET /api/aq/sym/state every 4 s and the brain
// terminal from GET /api/aq/sym/brain?after=<id> every 3 s. Every number is a real database count or the Durable Object's own
// stats row; a missing number shows "—". Times are Athens time. Its own styles are scoped under #sym (nothing existing restyled).
import { esc, dialog } from "./main.js";
const D = "—", num = (v) => typeof v === "number" && isFinite(v);
const int = (v) => (num(v) ? Math.round(v).toLocaleString("en-US") : D);
const pct = (v, d = 1) => (num(v) ? (v > 0 ? "+" : "") + v.toFixed(d) + "%" : D);
const athens = (t) => (t ? new Date(t).toLocaleTimeString("en-GB", { timeZone: "Europe/Athens", hour12: false }) : D);
const short = (m) => (m ? m.slice(0, 4) + "…" + m.slice(-4) : D);
const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";

// ---------- the ASTRA ULTIMUM chip: amethyst hex, silver filigree, light veins, runes, the eight-point star in a hex ----------
const hexPts = (cx, cy, r, rot = -90) => Array.from({ length: 6 }, (_, i) => { const a = (rot + i * 60) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const P = (pts) => pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
function gear(cx, cy, r1, r2, teeth) { let d = ""; for (let i = 0; i < teeth; i++) { const a0 = (i / teeth) * Math.PI * 2, a1 = a0 + Math.PI / teeth * 0.55, a2 = a0 + Math.PI / teeth, a3 = a2 + Math.PI / teeth * 0.45;
  const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; d += `${i ? "L" : "M"}${pt(r1, a0)}L${pt(r2, a0 + 0.02)}L${pt(r2, a1)}L${pt(r1, a1 + 0.02)}L${pt(r1, a2)}`; void a3; } return d + "Z"; }
function star8(cx, cy, R, r) { let d = ""; for (let i = 0; i < 16; i++) { const a = (-90 + i * 22.5) * Math.PI / 180, rr = i % 2 ? r : R; d += `${i ? "L" : "M"}${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`; } return d + "Z"; }
export function logoSvg(size = 22) {
  return `<svg class="sym-logo" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><polygon points="${P(hexPts(20, 20, 18))}" fill="#2a0f4a" stroke="#d9dee6" stroke-width="1.6"/><path d="${star8(20, 20, 13, 5.2)}" fill="#c9a6ff" stroke="#f4f6fa" stroke-width=".8"/><circle cx="20" cy="20" r="2.4" fill="#fff"/></svg>`;
}
function chipSvg() {
  const C = 200, outer = hexPts(C, C, 176), inner = hexPts(C, C, 150), core = hexPts(C, C, 62);
  const veins = [
    `M${outer[0].join(",")} Q${C + 40},${C - 120} ${C},${C - 62}`, `M${outer[3].join(",")} Q${C - 40},${C + 120} ${C},${C + 62}`,
    `M${outer[1].join(",")} C${C + 120},${C - 40} ${C + 90},${C + 10} ${C + 54},${C + 31}`, `M${outer[4].join(",")} C${C - 120},${C + 40} ${C - 90},${C - 10} ${C - 54},${C - 31}`,
    `M${outer[2].join(",")} C${C + 90},${C + 110} ${C + 40},${C + 60} ${C + 54},${C + 31}`, `M${outer[5].join(",")} C${C - 90},${C - 110} ${C - 40},${C - 60} ${C - 54},${C - 31}`,
  ];
  const runes = Array.from({ length: 24 }, (_, i) => { const a = (-90 + i * 15) * Math.PI / 180, r = 118; return `<text class="rune" data-i="${i}" x="${(C + r * Math.cos(a)).toFixed(1)}" y="${(C + r * Math.sin(a)).toFixed(1)}" transform="rotate(${i * 15} ${(C + r * Math.cos(a)).toFixed(1)} ${(C + r * Math.sin(a)).toFixed(1)})">${RUNES[i]}</text>`; }).join("");
  const scrolls = Array.from({ length: 6 }, (_, i) => `<path class="fil" transform="rotate(${i * 60} ${C} ${C})" d="M${C - 34},${C - 140} c 10,-14 24,-14 34,-4 c 10,-10 24,-10 34,4 m-34,-4 c -4,10 -14,14 -22,8 m22,-8 c 4,10 14,14 22,8"/>`).join("");
  return `<svg class="sym-chip-svg" viewBox="0 0 400 400" role="img" aria-label="ASTRA ULTIMUM">
  <defs>
    <radialGradient id="amG" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="#e6c8ff"/><stop offset=".28" stop-color="#9d4edd"/><stop offset=".62" stop-color="#5a189a"/><stop offset="1" stop-color="#1a0533"/></radialGradient>
    <linearGradient id="agG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f9fc"/><stop offset=".45" stop-color="#9aa3b1"/><stop offset=".7" stop-color="#e9edf3"/><stop offset="1" stop-color="#6d7584"/></linearGradient>
    <filter id="glw" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="hexClip"><polygon points="${P(outer)}"/></clipPath>
  </defs>
  <path class="gear" d="${gear(C, C, 182, 193, 36)}"/>
  <g class="breath"><polygon points="${P(outer)}" fill="url(#amG)" stroke="url(#agG)" stroke-width="5"/>
  <g clip-path="url(#hexClip)" opacity=".38">${outer.map((p, i) => `<polygon points="${P([[C, C], p, outer[(i + 1) % 6]])}" fill="${i % 2 ? "#3c096c" : "#c77dff"}" opacity="${i % 2 ? 0.5 : 0.18}"/>`).join("")}</g>
  <polygon points="${P(inner)}" fill="none" stroke="url(#agG)" stroke-width="1.6" opacity=".9"/>
  <circle cx="${C}" cy="${C}" r="132" fill="none" stroke="url(#agG)" stroke-width="1.2"/><circle cx="${C}" cy="${C}" r="104" fill="none" stroke="url(#agG)" stroke-width="1"/>
  <polygon points="${P(hexPts(C, C, 104, -90).filter((_, i) => i % 2 === 0))}" fill="none" stroke="url(#agG)" stroke-width="1" opacity=".75"/>
  <polygon points="${P(hexPts(C, C, 104, -90).filter((_, i) => i % 2 === 1))}" fill="none" stroke="url(#agG)" stroke-width="1" opacity=".75"/>
  ${scrolls}
  <g class="traces">${veins.map((d) => `<path class="trace" d="${d}"/>`).join("")}</g>
  <g class="veins" filter="url(#glw)">${veins.map((d, i) => `<path class="vein" style="animation-delay:${(i * 0.37).toFixed(2)}s" d="${d}"/>`).join("")}</g>
  <g class="runes">${runes}</g>
  <polygon points="${P(core)}" fill="#14042a" stroke="url(#agG)" stroke-width="3"/>
  <g id="sym-scars"></g><g id="sym-cracks"></g>
  <path class="star" d="${star8(C, C, 46, 18)}" filter="url(#glw)"/>
  <circle cx="${C}" cy="${C}" r="7" fill="#fff" filter="url(#glw)"/></g>
  <path id="arcTop" d="M${C - 150},${C - 6} A150,150 0 0 1 ${C + 150},${C - 6}" fill="none"/>
  </svg>`;
}

// ---------- the brain terminal: each new record as pretty code, Dracula colours ----------
function codeOf(r) {
  const k = (s) => `<span class="dk">${esc(s)}</span>`, str = (s) => `<span class="ds">"${esc(s)}"</span>`, n = (v) => `<span class="dn">${esc(v)}</span>`;
  const val = (v, depth = 0) => (v === null || v === undefined ? `<span class="dc">null</span>` : typeof v === "number" ? n(+v.toFixed(4)) : typeof v === "boolean" ? `<span class="dp">${v}</span>` : typeof v === "string" ? str(v.length > 140 ? v.slice(0, 140) + "…" : v)
    : Array.isArray(v) ? `[${v.slice(0, 6).map((x) => val(x, depth + 1)).join(", ")}${v.length > 6 ? ", …" : ""}]` : depth > 1 ? `{…}` : `{ ${Object.entries(v).slice(0, 8).map(([a, b]) => `${k(a)}: ${val(b, depth + 1)}`).join(", ")} }`);
  return `<div class="tl${r.kind === "pain" ? " pain" : ""}"><span class="dc">// ${athens(r.at)} Athens · #${esc(r.id)}</span>\n<span class="dp">brain</span>.<span class="df">record</span>({ ${k("dept")}: ${str(r.dept)}, ${k("kind")}: ${str(r.kind)},\n  ${k("text")}: ${str(r.text)}${r.data ? `,\n  ${k("data")}: ${val(r.data)}` : ""} })</div>`;
}

// ---------- the screen ----------
export function symScreen() {
  const el = document.createElement("section"); el.id = "sym";
  el.innerHTML = `<style>${CSS}</style>
  <div class="sym-head">${logoSvg(26)}<b>SYMBIOTE</b><u class="sym-paper">PAPER</u><span class="sym-sub">every pump.fun launch, paper-traded in two lanes · no real money</span><em id="sym-up">${D}</em></div>
  <div class="sym-grid">
    <div class="sym-left">
      <button class="sym-counts" id="sym-counts" title="Show every source"><small>BRAIN RECORDS · ALL SOURCES</small><b id="sym-total">${D}</b><span id="sym-mini"></span><span class="sym-pain">PAIN 24 H <b id="sym-pain">${D}</b></span><i>tap for the sources</i></button>
      <div class="sym-chip" id="sym-chip">${chipSvg()}<div class="sym-name">ASTRA ULTIMUM</div></div>
      <div class="sym-term" id="sym-term"><div class="sym-term-h"><span></span><span></span><span></span><em>brain · live</em></div><pre id="sym-code"></pre></div>
    </div>
    <div class="sym-right">
      <div class="sym-kpis"><div><small>COINS SEEN</small><b id="sym-coins">${D}</b></div><div><small>COVERAGE</small><b id="sym-cov">${D}</b><i id="sym-covsub"></i></div><div><small>STREAM</small><b id="sym-rate">${D}</b><i id="sym-src"></i></div><div><small>RIGHT CALLS</small><b id="sym-rc">${D}</b><i id="sym-fp"></i></div></div>
      <div class="sym-lanes" id="sym-lanes"></div>
      <div class="sym-tree"><h4>FRUITS <span>right calls rise, fake pumps wither</span></h4><div class="sym-fruits" id="sym-fruits"></div></div>
      <div class="sym-two"><div><h4>THE STREAM</h4><div class="sym-feed" id="sym-feed"></div></div><div><h4>GTA 6 WATCH <span>whole life</span></h4><div class="sym-gta" id="sym-gta"></div><h4>MISSED <span>with the reason</span></h4><div class="sym-miss" id="sym-miss"></div></div></div>
    </div>
  </div>`;
  el.querySelector("#sym-counts").addEventListener("click", () => openSources());
  setTimeout(() => { pollState(); pollBrain(); }, 50);
  setInterval(pollState, 4000); setInterval(pollBrain, 3000);
  return el;
}

let last = null, lastBrain = 0, lit = 0, lastBrainSeeded = false, scarsDrawn = 0;
// a jagged line through the amethyst, placed by a number (a row id or a scar index), so the same row always cracks the same way
function fracture(seed) {
  let x = seed * 9301 + 49297; const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const a = rnd() * Math.PI * 2, r0 = 70 + rnd() * 20, r1 = 150 + rnd() * 18; let px = 200 + r0 * Math.cos(a), py = 200 + r0 * Math.sin(a), d = `M${px.toFixed(1)},${py.toFixed(1)}`;
  for (let i = 1; i <= 5; i++) { const rr = r0 + (r1 - r0) * i / 5, aa = a + (rnd() - 0.5) * 0.35; px = 200 + rr * Math.cos(aa); py = 200 + rr * Math.sin(aa); d += ` L${px.toFixed(1)},${py.toFixed(1)}`; }
  return d;
}
// a fresh PAIN row: a red fracture that heals to silver over 12 s and fades (only rule changes leave a permanent scar)
function crack(id) { const g = document.getElementById("sym-cracks"); if (!g) return; const ns = "http://www.w3.org/2000/svg", p = document.createElementNS(ns, "path"); p.setAttribute("d", fracture(id)); p.setAttribute("class", "crack"); g.appendChild(p); setTimeout(() => p.remove(), 12500); while (g.children.length > 6) g.firstChild.remove(); }
function scars(n) { const g = document.getElementById("sym-scars"); if (!g || !num(n)) return; const want = Math.min(n, 36); if (want === scarsDrawn) return; g.innerHTML = Array.from({ length: want }, (_, i) => `<path class="scar" d="${fracture(7 + i * 13)}"/>`).join(""); scarsDrawn = want; }
async function pollState() {
  try { const r = await fetch("/api/aq/sym/state", { credentials: "same-origin", cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); last = await r.json(); paint(last); }
  catch (e) { const u = document.getElementById("sym-up"); if (u) u.textContent = "can't reach symbiote: " + e.message; }
}
async function pollBrain() {
  try {
    const r = await fetch("/api/aq/sym/brain" + (lastBrain ? "?after=" + lastBrain : ""), { credentials: "same-origin", cache: "no-store" }); if (!r.ok) return;
    const { rows } = await r.json(); if (!rows || !rows.length) return;
    const pre = document.getElementById("sym-code"); if (!pre) return;
    for (const row of rows) { lastBrain = Math.max(lastBrain, row.id); pre.insertAdjacentHTML("beforeend", codeOf(row)); if (row.dept === "symbiote") lightRune(); if (row.kind === "pain" && lastBrainSeeded) crack(row.id); }
    lastBrainSeeded = true;
    while (pre.children.length > 30) pre.firstElementChild.remove();
    pre.scrollTop = pre.scrollHeight;
  } catch {}
}
function lightRune() { const rs = document.querySelectorAll("#sym-chip .rune"); if (!rs.length) return; const e = rs[lit++ % rs.length]; e.classList.remove("lit"); void e.getBoundingClientRect(); e.classList.add("lit"); }

function paint(s) {
  const $ = (id) => document.getElementById(id), set = (id, v) => { const e = $(id); if (e && e.innerHTML !== v) e.innerHTML = v; };
  const v = s.live || {}, cov = v.coverage || {}, src = Object.fromEntries((s.sources || []).map((x) => [x.label, x]));
  set("sym-up", s.running ? `live · ${athens(s.updatedAt)} Athens` : s.updatedAt ? `stopped · last ${athens(s.updatedAt)} Athens` : "not started yet");
  set("sym-total", int(src["brain records (all)"]?.n));
  set("sym-mini", ["launches seen", "symbiote paper trades", "symbiote lessons", "right calls"].map((k) => `<span><b>${int(src[k]?.n)}</b> ${esc(k)}</span>`).join(""));
  set("sym-coins", int(src["launches seen"]?.n ?? cov.launches));
  set("sym-cov", num(cov.pct) ? cov.pct.toFixed(1) + "%" : D);
  set("sym-pain", `${int(src["pain (24 h)"]?.n)} <em>/ ${int(src["pain (total)"]?.n)} total · ${int(src["scars (lessons that changed a rule)"]?.n)} scars</em>`);
  scars(src["scars (lessons that changed a rule)"]?.n);
  set("sym-covsub", `${int(cov.missed)} missed · ${int(cov.pending)} waiting for a first trade`);
  set("sym-rate", num(v.perSec) ? v.perSec.toFixed(1) + "/s" : D);
  set("sym-src", `source: ${esc(v.source || "—")}${v.sockets ? ` · launches ${v.sockets.pumpportal ? "on" : "off"} · trades ${v.sockets.chain ? "on" : "off"}` : ""}`);
  const rights = (s.right || []).filter((r) => r.status === "candidate"), fakes = (s.right || []).filter((r) => r.status === "fake_pump");
  set("sym-rc", int(src["right calls"]?.n ?? rights.length)); set("sym-fp", `${int(src["fake pumps"]?.n ?? fakes.length)} fake pumps`);
  set("sym-lanes", Object.entries(s.lanes || {}).map(([l, x]) => `<div class="lane"><small><u class="sym-paper">PAPER</u> ${esc(l.toUpperCase())} LANE</small><b>${num(x.walletSol) ? x.walletSol.toLocaleString("en-US", { maximumFractionDigits: 2 }) : D} <em>SOL</em></b><i>${int(x.trades)} trades · ${int(x.wins)} won · avg ${pct(x.avgPct)}</i></div>`).join(""));
  set("sym-fruits", (s.right || []).slice(0, 18).map((r, i) => `<div class="fruit ${r.status === "candidate" ? "ripe" : "dead"}" style="--i:${i}" title="${esc(r.status === "candidate" ? "right call" : "fake pump: " + (r.failed || []).join("; "))}"><span class="orb"></span><b>${esc(r.symbol || short(r.mint))}</b><i>${pct(r.gain_pct, 0)} · ${esc(r.lane || "")}</i></div>`).join("") || `<p class="sym-empty">No coin has doubled on paper and passed the checks yet.</p>`);
  const feed = v.feed || [];
  set("sym-feed", feed.slice(0, 16).map((f) => `<div class="fi ${esc(f.k)}"><time>${athens(f.at)}</time><b>${f.k === "launch" ? "LAUNCH" : f.k === "entry" ? "BUY" : "SELL"}</b><span>${esc(f.sym || short(f.mint))}${f.gta ? ' <u class="gta">GTA</u>' : ""}</span><i>${f.lane ? esc(f.lane) : ""}${num(f.pct) ? " " + pct(f.pct) : ""}${f.exit ? " · " + esc(f.exit) : ""}</i></div>`).join("") || `<p class="sym-empty">Waiting for the first launch.</p>`);
  set("sym-gta", (s.gta || []).slice(0, 8).map((g) => `<div class="g"><b>${esc(g.symbol || short(g.mint))}</b><span>${esc(g.name || "")}</span><i>${g.px0 && g.last ? pct((g.last / g.px0 - 1) * 100, 0) : D} · ${int(Number(g.minutes))} min tracked</i></div>`).join("") || `<p class="sym-empty">No GTA launch yet. The main coin 4kjr…zDnz is priced every minute.</p>`);
  set("sym-miss", (s.missedReasons || []).map((m) => `<div class="m"><b>${int(m.n)}</b><span>${esc(m.reason)}</span></div>`).join("") || `<p class="sym-empty">Nothing missed.</p>`);
  // breathing follows the real notification rate: faster feed, faster breath (1.4 s to 6 s)
  const chip = $("sym-chip"); if (chip) { const r = num(v.perSec) ? v.perSec : 0, dur = Math.max(1.4, 6 - Math.log10(1 + r) * 1.9); chip.style.setProperty("--breath", dur.toFixed(2) + "s"); chip.classList.toggle("idle", !s.running); }
}

function openSources() {
  const s = last; if (!s) return;
  dialog(`<h3>Where the numbers come from</h3><p class="muted">Every count is a live query on its own table (Neon), read ${athens(s.updatedAt) || ""}.</p>
  <table class="sym-src">${(s.sources || []).map((x) => `<tr><td>${esc(x.label)}</td><td><code>${esc(x.table)}</code></td><td>${x.n == null ? esc(x.error || D) : int(x.n)}</td></tr>`).join("")}</table><div class="row"><button class="ghost" data-x>Close</button></div>`,
  (d, close) => d.querySelector("[data-x]").addEventListener("click", close));
}

const CSS = `
#sym{margin:14px 12px;padding:14px;border:1px solid rgba(199,125,255,.28);border-radius:14px;background:linear-gradient(180deg,rgba(26,5,51,.55),rgba(10,14,24,.9));box-shadow:0 0 40px rgba(157,78,221,.08) inset}
#sym h4{margin:12px 0 6px;font:700 10px var(--mono);letter-spacing:.14em;color:#d9c2ff}#sym h4 span{font-weight:400;color:var(--mut);letter-spacing:0;margin-left:6px}
.sym-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.sym-head b{font:700 16px var(--serif);letter-spacing:.2em;color:#fff}.sym-head em{margin-left:auto;font:11px var(--mono);color:var(--mut);font-style:normal}
.sym-sub{color:var(--mut);font-size:11px}.sym-paper{font:700 9px var(--mono);letter-spacing:.12em;text-decoration:none;color:#f5a524;border:1px solid rgba(245,165,36,.6);border-radius:4px;padding:2px 5px}
.sym-grid{display:grid;grid-template-columns:minmax(300px,420px) 1fr;gap:18px;margin-top:12px}.sym-left{display:flex;flex-direction:column;gap:10px;min-width:0}.sym-right{min-width:0}
.sym-counts{display:flex;flex-direction:column;align-items:center;gap:2px;background:rgba(20,4,42,.7);border:1px solid rgba(217,222,230,.25);border-radius:10px;padding:8px 10px}
.sym-counts small{font:700 9px var(--mono);letter-spacing:.14em;color:#cfc4e6}.sym-counts b{font:700 28px var(--mono);color:#fff;text-shadow:0 0 18px rgba(199,125,255,.6)}.sym-counts i{font:10px var(--mono);color:var(--mut)}
#sym-mini{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;font:10px var(--mono);color:#b9b2c9}#sym-mini b{font-size:11px;color:#fff;text-shadow:none}
.sym-chip{position:relative;--breath:4s;display:grid;place-items:center}.sym-chip-svg{width:100%;max-width:380px;height:auto;overflow:visible}
.sym-chip .gear{fill:#1b1426;stroke:#aab2bf;stroke-width:1.2;transform-origin:200px 200px;animation:symSpin 120s linear infinite}
.sym-chip .breath{transform-origin:200px 200px;animation:symBreath var(--breath) ease-in-out infinite}
.sym-chip .fil{fill:none;stroke:#dfe5ee;stroke-width:1.3;opacity:.85}.sym-chip .trace{fill:none;stroke:#c3cad5;stroke-width:1.6;opacity:.55}
.sym-chip .vein{fill:none;stroke:#f3e6ff;stroke-width:2.6;stroke-linecap:round;stroke-dasharray:14 240;animation:symPulse calc(var(--breath) * .9) linear infinite}
.sym-chip .rune{font:15px Georgia,serif;fill:#8f86a6;text-anchor:middle;dominant-baseline:middle;transition:fill .4s}.sym-chip .rune.lit{animation:symRune 2.6s ease-out}
.sym-chip .star{fill:#d8b4fe;stroke:#fff;stroke-width:1.2;transform-origin:200px 200px;animation:symStar calc(var(--breath) * 2) ease-in-out infinite}
.sym-chip.idle .vein{animation-play-state:paused;opacity:.2}.sym-chip.idle .breath{animation-duration:9s}
.sym-name{font:700 13px var(--serif);letter-spacing:.42em;color:#eef1f6;text-shadow:0 0 12px rgba(199,125,255,.8);margin-top:-6px}
@keyframes symSpin{to{transform:rotate(360deg)}}@keyframes symBreath{0%,100%{transform:scale(.985);filter:drop-shadow(0 0 6px rgba(157,78,221,.35))}50%{transform:scale(1.015);filter:drop-shadow(0 0 22px rgba(199,125,255,.75))}}
@keyframes symPulse{from{stroke-dashoffset:254}to{stroke-dashoffset:0}}@keyframes symRune{0%{fill:#fff;filter:drop-shadow(0 0 6px #e0b3ff)}100%{fill:#8f86a6}}@keyframes symStar{0%,100%{opacity:.85}50%{opacity:1}}
.sym-term{background:#282a36;border:1px solid #44475a;border-radius:10px;overflow:hidden}.sym-term-h{display:flex;gap:6px;align-items:center;padding:6px 10px;background:#21222c}
.sym-term-h span{width:9px;height:9px;border-radius:50%;background:#ff5555}.sym-term-h span:nth-child(2){background:#f1fa8c}.sym-term-h span:nth-child(3){background:#50fa7b}.sym-term-h em{margin-left:auto;font:10px var(--mono);color:#6272a4;font-style:normal}
#sym-code{margin:0;padding:10px;height:260px;overflow:auto;font:11px/1.45 var(--mono);color:#f8f8f2;white-space:pre-wrap;word-break:break-word}
#sym-code .tl{margin-bottom:8px;animation:symIn .5s ease-out}#sym-code .tl.pain,#sym-code .tl.pain .ds{color:#ff5555}
.sym-chip .crack{fill:none;stroke:#ff5555;stroke-width:2.4;stroke-linecap:round;stroke-dasharray:400;animation:symCrack 12s ease-out forwards;filter:drop-shadow(0 0 4px #ff5555)}
.sym-chip .scar{fill:none;stroke:#dfe5ee;stroke-width:1;opacity:.45;stroke-linecap:round}
@keyframes symCrack{0%{stroke-dashoffset:400;stroke:#ff5555}8%{stroke-dashoffset:0;stroke:#ff5555}60%{stroke:#ff9b9b;opacity:1}100%{stroke-dashoffset:0;stroke:#dfe5ee;opacity:0;stroke-width:1}}
.sym-pain{font:700 9px var(--mono);letter-spacing:.1em;color:#ff5555}.sym-pain b{font-size:12px;color:#ff5555;text-shadow:none}.sym-pain em{font-style:normal;font-weight:400;color:var(--mut);letter-spacing:0}#sym-code .dk{color:#8be9fd}#sym-code .ds{color:#f1fa8c}#sym-code .dn{color:#bd93f9}#sym-code .dp{color:#ff79c6}#sym-code .df{color:#50fa7b}#sym-code .dc{color:#6272a4}
@keyframes symIn{from{opacity:0;transform:translateY(4px)}to{opacity:1}}
.sym-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.sym-kpis>div,.sym-lanes .lane{background:rgba(13,18,32,.85);border:1px solid var(--line);border-radius:9px;padding:8px 10px;min-width:0}
.sym-kpis small,.sym-lanes small{display:block;font:700 9px var(--mono);letter-spacing:.12em;color:var(--mut)}.sym-kpis b{font:700 20px var(--mono);color:#fff}.sym-kpis i,.sym-lanes i{display:block;font:10px var(--mono);color:var(--mut);font-style:normal;overflow:hidden;text-overflow:ellipsis}
.sym-lanes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.sym-lanes b{font:700 15px var(--mono);color:#f5a524}.sym-lanes b em{font-size:10px;font-style:normal;color:var(--mut)}
.sym-fruits{position:relative;display:flex;flex-wrap:wrap;gap:8px;min-height:84px;padding:10px;border-radius:10px;background:radial-gradient(400px 120px at 50% 100%,rgba(80,250,123,.08),transparent),rgba(13,18,32,.6);border:1px solid var(--line)}
.fruit{display:flex;flex-direction:column;align-items:center;gap:2px;font:10px var(--mono);animation:symRise 1.2s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 60ms)}
.fruit .orb{width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#50fa7b 45%,#0b6b2e);box-shadow:0 0 14px rgba(80,250,123,.6)}.fruit b{color:#fff}.fruit i{color:var(--mut);font-style:normal}
.fruit.dead .orb{background:radial-gradient(circle at 35% 30%,#bbb,#6b6b6b 50%,#2b2b2b);box-shadow:none}.fruit.dead b{color:#8a8a8a;text-decoration:line-through}
@keyframes symRise{from{opacity:0;transform:translateY(26px) scale(.6)}to{opacity:1;transform:none}}
.sym-two{display:grid;grid-template-columns:1.2fr 1fr;gap:14px}.sym-feed,.sym-gta,.sym-miss{font:11px var(--mono)}
.fi{display:grid;grid-template-columns:62px 46px minmax(0,1fr) auto;gap:6px;padding:3px 0;border-bottom:1px solid rgba(26,34,51,.7)}.fi time{color:var(--mut)}.fi b{color:#8be9fd}.fi.entry b{color:#50fa7b}.fi.exit b{color:#ffb86c}.fi span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff}.fi i{color:var(--mut);font-style:normal}
u.gta{font:700 8px var(--mono);text-decoration:none;color:#ff79c6;border:1px solid #ff79c6;border-radius:3px;padding:0 3px}
.g,.m{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid rgba(26,34,51,.7);align-items:baseline}.g b{color:#ff79c6}.g span{color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.g i{color:var(--mut);font-style:normal}.m b{color:#ffb86c;min-width:40px}.m span{color:#ccc}
.sym-empty{color:var(--mut);font:11px var(--mono);margin:4px 0}table.sym-src{width:100%;border-collapse:collapse;font:11px var(--mono)}table.sym-src td{padding:4px 6px;border-bottom:1px solid var(--line)}table.sym-src td:last-child{text-align:right;color:#fff}
@media (max-width:820px){.sym-grid{grid-template-columns:1fr}.sym-kpis{grid-template-columns:1fr 1fr}.sym-two{grid-template-columns:1fr}#sym{margin:12px 8px;padding:10px}.sym-chip-svg{max-width:300px}}
`;
