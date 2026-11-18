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
// one brain row as an ENGINE LOG line, Dracula colours: [time] [TAG] EVENT {data}
const TAGS = { lesson: ["ENGINE", "PAPER_TRADE_EXEC"], pain: ["RISK", "PAIN"], fake_pump: ["RISK", "FAKE_PUMP_DETECTED"], right_call: ["RIGHT", "RIGHT_CALL"] };
function codeOf(r) {
  const [tag, ev] = TAGS[r.kind] || [String(r.dept || "BRAIN").toUpperCase(), String(r.kind || "RECORD").toUpperCase()];
  const k = (x) => `<span class="dk">${esc(x)}</span>`, val = (v) => (v === null || v === undefined ? `<span class="dc">null</span>` : typeof v === "number" ? `<span class="${/pct|Pct|gain/.test("") ? "" : v < 0 ? "dr" : "dg"}">${esc(+v.toFixed(4))}</span>` : typeof v === "boolean" ? `<span class="dp">${v}</span>` : typeof v === "string" ? `<span class="ds">"${esc(v.length > 60 ? v.slice(0, 60) + "…" : v)}"</span>` : Array.isArray(v) ? `<span class="ds">[${esc(v.length)}]</span>` : "{…}");
  const data = r.data && typeof r.data === "object" ? `{${Object.entries(r.data).filter(([a, v]) => (typeof v !== "object" || v === null) && !["rtPct", "legPct", "gta"].includes(a)).slice(0, 6).map(([a, v]) => `${k(a === "mint" ? "token" : a)}:${a === "mint" ? `<span class="ds">"${esc(short(v))}"</span>` : val(typeof v === "number" ? +v.toFixed(2) : v)}`).join(", ")}}` : `<span class="ds">"${esc(String(r.text || "").slice(0, 120))}"</span>`;
  return `<div class="tl ${r.kind === "pain" || tag === "RISK" ? "pain" : ""}" title="${esc(r.text)}"><span class="dt">[${athens(r.at)}]</span> <span class="dtag ${tag === "RISK" ? "dr" : tag === "RIGHT" ? "dg" : "dp"}">[${esc(tag)}]</span> <span class="dev ${tag === "RISK" ? "dr" : "dp"}">${esc(ev)}</span> ${data}</div>`;
}

// ---------- the screen ----------
const brassCounter = (id, label) => `<button class="sym-brass" data-src="${id}"><span class="lau l">${LAUREL}</span><small>${label}</small><b id="${id}">${D}</b><span class="lau r">${LAUREL}</span></button>`;
const LAUREL = `<svg viewBox="0 0 20 40" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<ellipse cx="${9 - i * 0.6}" cy="${6 + i * 7}" rx="2.4" ry="5" transform="rotate(${-35 + i * 4} ${9 - i * 0.6} ${6 + i * 7})"/>`).join("")}<path d="M12 2 Q4 20 12 38" fill="none" stroke-width="1.2"/></svg>`;
const ORN = `<svg viewBox="0 0 60 14" class="orn" aria-hidden="true"><path d="M2 7 H40 M40 7 l6 -5 l6 5 l-6 5 z M52 7 h6" fill="none"/><circle cx="46" cy="7" r="1.6"/></svg>`;
function windowSvg() { // the red-planet arch window
  return `<svg class="sym-window" viewBox="0 0 300 150" aria-hidden="true"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0608"/><stop offset=".55" stop-color="#a3241a"/><stop offset="1" stop-color="#e0573a"/></linearGradient>
    <radialGradient id="pl" cx="40%" cy="35%"><stop offset="0" stop-color="#ff9a7a"/><stop offset=".6" stop-color="#c0392b"/><stop offset="1" stop-color="#5a0d0a"/></radialGradient><clipPath id="arches"><path d="M10 150 V60 Q10 15 52 10 Q94 15 94 60 V150 Z M104 150 V60 Q104 15 150 8 Q196 15 196 60 V150 Z M206 150 V60 Q206 15 248 10 Q290 15 290 60 V150 Z"/></clipPath></defs>
    <rect width="300" height="150" fill="#0b0b0e"/><g clip-path="url(#arches)"><rect width="300" height="150" fill="url(#sky)"/><circle cx="240" cy="48" r="34" fill="url(#pl)"/><path d="M0 120 L30 95 L55 110 L80 85 L110 105 L140 92 L170 112 L205 88 L235 104 L265 90 L300 108 V150 H0 Z" fill="#4a0f0b"/><path d="M0 135 L40 118 L90 130 L150 115 L210 132 L260 120 L300 128 V150 H0 Z" fill="#2a0806"/></g>
    <g fill="none" stroke="#8b8f98" stroke-width="5"><path d="M10 150 V60 Q10 15 52 10 Q94 15 94 60 V150 M104 150 V60 Q104 15 150 8 Q196 15 196 60 V150 M206 150 V60 Q206 15 248 10 Q290 15 290 60 V150"/></g></svg>`;
}
function treeSvg() { // the silver circuit tree; fruits are added by paint() from the real right calls
  return `<svg class="sym-tree" viewBox="0 0 260 260" aria-hidden="true"><defs><linearGradient id="silv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6f7480"/><stop offset=".5" stop-color="#e8ecf2"/><stop offset="1" stop-color="#7a808c"/></linearGradient></defs>
    <g stroke="url(#silv)" fill="none" stroke-linecap="round"><path d="M130 250 C128 200 136 170 128 140 C120 110 132 90 130 60" stroke-width="10"/><path d="M128 150 C100 130 80 120 52 96 M132 130 C160 112 186 104 214 80 M130 100 C110 80 96 60 86 38 M131 95 C150 74 166 58 176 34 M129 175 C104 166 78 170 50 150 M131 170 C160 160 186 166 214 146" stroke-width="4"/>
    <path d="M52 96 L36 84 M52 96 L40 108 M214 80 L230 70 M214 80 L226 94 M86 38 L76 26 M176 34 L188 22 M50 150 L34 142 M214 146 L232 140" stroke-width="2"/></g>
    <g stroke="#9d4edd" stroke-width="1.6" fill="none" opacity=".85">${Array.from({ length: 9 }, (_, i) => { const x = 130 + (i - 4) * 14; return `<path d="M130 246 L${x} 252 L${x} 258"/>`; }).join("")}<path d="M100 252 H40 V258 M160 252 H220 V258"/></g>
    <g fill="#c9ccd4" opacity=".75">${[[60,90],[96,46],[170,44],[200,86],[60,148],[200,150],[110,72],[150,70]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="3" transform="rotate(-25 ${x} ${y})"/>`).join("")}</g><g id="sym-gems"></g></svg>`;
}
const GEM_AT = [[52, 104], [214, 88], [86, 46], [176, 42], [50, 158], [214, 154], [118, 112], [146, 106], [100, 136]];
function cathedral(inner) { // the iron/silver gothic frame around the chip
  return `<div class="sym-cath"><svg class="sym-cath-svg" viewBox="0 0 400 420" aria-hidden="true" preserveAspectRatio="none"><defs><linearGradient id="iron" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2c33"/><stop offset=".5" stop-color="#8f949e"/><stop offset="1" stop-color="#2a2c33"/></linearGradient><linearGradient id="brs" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b3a14"/><stop offset=".5" stop-color="#e2b06a"/><stop offset="1" stop-color="#5b3a14"/></linearGradient></defs>
    <path d="M20 420 V120 Q20 30 120 12 L200 0 L280 12 Q380 30 380 120 V420" fill="none" stroke="url(#iron)" stroke-width="10"/><path d="M60 420 V140 Q60 60 200 34 Q340 60 340 140 V420" fill="none" stroke="url(#iron)" stroke-width="4" opacity=".8"/>
    ${[46, 70, 330, 354].map((x) => `<rect x="${x - 4}" y="60" width="8" height="360" fill="url(#brs)" opacity=".85"/>`).join("")}<path d="M90 30 Q200 -4 310 30" fill="none" stroke="url(#brs)" stroke-width="6"/>
    <g class="sym-red">${[[33, 110], [367, 110], [33, 300], [367, 300]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5"/>`).join("")}</g>
    <g fill="#5a1828" stroke="#8f949e" stroke-width="2"><path d="M8 150 h22 v120 l-11 14 l-11 -14 z"/><path d="M370 150 h22 v120 l-11 14 l-11 -14 z"/></g><g fill="#b98a9a" font-size="13" font-family="Georgia" text-anchor="middle">${"ᛟᚨᛉ".split("").map((r, i) => `<text x="19" y="${182 + i * 28}">${r}</text><text x="381" y="${182 + i * 28}">${r}</text>`).join("")}</g></svg>${inner}</div>`;
}

export function symScreen() {
  const el = document.createElement("section"); el.id = "sym";
  el.innerHTML = `<style>${CSS}</style><div class="sym-pipes"><i class="p1"></i><i class="p2"></i><i class="p3"></i><i class="p4"></i><b class="led a"></b><b class="led b"></b><b class="led c"></b><b class="led d"></b></div>
  <header class="sym-top"><div class="sym-titlebar"><h2 class="sym-title">SYMBIOTE</h2><span class="sym-plaque">PAPER</span><p class="sym-sub">A LIVING PAPER-TRADING ENGINE<br>FOR NEWLY LAUNCHED MEMECOINS</p><span class="sym-glyphs">ᛟ ᚦ ᛏ ᛉ ᛜ</span></div>
    <div class="sym-counters">${brassCounter("sym-coins", "COINS TRADED")}${brassCounter("sym-cov", "COVERAGE")}${brassCounter("sym-rc", "RIGHT CALLS")}${brassCounter("sym-fp", "FAKE PUMPS")}</div>${windowSvg()}</header>
  <p class="sym-status"><em id="sym-up">${D}</em> · <span id="sym-market"></span> · <span id="sym-src"></span></p>
  <div class="sym-grid">
    <section class="sym-panel sym-trades"><h3>${ORN}<span>PAPER TRADES</span>${ORN}</h3><table><thead><tr><th>TIME</th><th>TOKEN</th><th>ACTION</th><th>P&amp;L</th></tr></thead><tbody id="sym-rows"></tbody></table><div class="sym-lanes" id="sym-lanes"></div></section>
    <section class="sym-mid">${cathedral(`<div class="sym-chip" id="sym-chip">${chipSvg()}</div>`)}<div class="sym-banner">ASTRA ULTIMUM</div><div class="sym-pain">PAIN 24 H <b id="sym-pain">${D}</b></div></section>
    <section class="sym-panel sym-right"><h3>${ORN}<span>RIGHT CALLS</span>${ORN}</h3><div class="sym-rc-body">${treeSvg()}<div class="sym-stats"><div><small>RIGHT CALLS</small><b id="rs-n">${D}</b></div><div><small>WIN RATE</small><b id="rs-wr">${D}</b></div><div><small>AVG P&amp;L</small><b id="rs-avg">${D}</b></div><div><small>TOTAL P&amp;L</small><b id="rs-tot">${D}</b></div></div></div><p class="sym-fp-list" id="sym-fruits"></p></section>
  </div>
  <section class="sym-log"><h3>ENGINE<br>LOG</h3><pre id="sym-code"></pre></section>
  <div class="sym-extra"><div><h4>GTA 6 WATCH <span>whole life</span></h4><div id="sym-gta"></div></div><div><h4>MISSED <span>with the reason</span></h4><div id="sym-miss"></div></div></div>`;
  el.querySelectorAll(".sym-brass").forEach((b) => b.addEventListener("click", () => openSources()));
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
function crack(id) { const g = document.getElementById("sym-cracks"); if (!g) return; g.insertAdjacentHTML("beforeend", `<path class="crack" d="${fracture(id)}"/>`); const p = g.lastElementChild; setTimeout(() => p.remove(), 12500); while (g.children.length > 6) g.firstChild.remove(); }
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
  const v = s.live || {}, cov = v.coverage || {}, src = Object.fromEntries((s.sources || []).map((x) => [x.label, x])), mk = s.market || {};
  set("sym-up", s.running ? `live · ${athens(s.updatedAt)} Athens` : s.updatedAt ? `stopped · last ${athens(s.updatedAt)} Athens` : "not started yet");
  set("sym-coins", int(mk.boughtAll ?? mk.bought));
  set("sym-cov", num(cov.pct) ? cov.pct.toFixed(1) + "%" : D);
  set("sym-rc", int(src["right calls"]?.n)); set("sym-fp", int(src["fake pumps"]?.n));
  set("sym-market", `bought <b>${int(mk.bought)}</b> of <b>${int(mk.total)}</b> coins in 24 h = <b>${mk.total ? ((mk.bought / mk.total) * 100).toFixed(1) + "%" : D}</b>`);
  set("sym-src", `stream ${num(v.perSec) ? v.perSec.toFixed(1) + "/s" : D} · ${esc(v.source || D)} · credits ${int(v.credits?.usedToday)} of ${int(v.credits?.capPerDay)}`);
  set("sym-pain", `${int(src["pain (24 h)"]?.n)} <em>/ ${int(src["pain (total)"]?.n)} total · ${int(src["scars (lessons that changed a rule)"]?.n)} scars</em>`);
  scars(src["scars (lessons that changed a rule)"]?.n);
  // PAPER TRADES: every buy and sell of the lanes, newest first (paper long only)
  const rows = [];
  for (const t of s.recent || []) { rows.push({ at: t.exit_at, tok: t.symbol || short(t.mint), act: "SELL", pnl: t.net_pct, lane: t.lane }); rows.push({ at: t.entry_at, tok: t.symbol || short(t.mint), act: "BUY", pnl: null, lane: t.lane }); }
  rows.sort((a, b) => new Date(b.at) - new Date(a.at));
  set("sym-rows", rows.slice(0, 9).map((r) => `<tr><td>${athens(r.at)}</td><td>${esc(String(r.tok).slice(0, 10))}</td><td class="${r.act === "BUY" ? "buy" : "sell"}">${r.act}</td><td class="${num(r.pnl) ? (r.pnl >= 0 ? "up" : "dn") : ""}">${num(r.pnl) ? pct(r.pnl, 2) : "·"}</td></tr>`).join("") || `<tr><td colspan="4" class="sym-empty">Waiting for the first paper trade.</td></tr>`);
  set("sym-lanes", Object.entries(s.lanes || {}).map(([l, x]) => `<span><u class="sym-paper">PAPER</u> ${esc(l)} <b>${num(x.walletSol) ? x.walletSol.toLocaleString("en-US", { maximumFractionDigits: 1 }) : D}</b> SOL · ${int(x.trades)} trades · ${int(x.wins)} won</span>`).join(""));
  // RIGHT CALLS: the real stats of the coins that passed, amethyst gems on the tree (one per right call, up to 9)
  const rs = s.rightStats || {}; set("rs-n", int(src["right calls"]?.n)); set("rs-wr", num(rs.winRate) ? rs.winRate.toFixed(1) + "%" : D); set("rs-avg", pct(rs.avgPct, 2)); set("rs-tot", pct(rs.totalPct, 2));
  for (const id of ["rs-avg", "rs-tot"]) { const e = $(id), x = id === "rs-avg" ? rs.avgPct : rs.totalPct; if (e) e.className = num(x) ? (x >= 0 ? "up" : "dn") : ""; }
  const ripe = (s.right || []).filter((r) => r.status === "candidate");
  set("sym-gems", ripe.slice(0, 9).map((r, i) => { const [x, y] = GEM_AT[i]; return `<g class="gem" style="--i:${i}"><title>${esc(r.symbol || r.mint)} ${pct(r.gain_pct, 0)}</title><polygon points="${P(hexPts(x, y, 9))}"/><polygon class="hi" points="${P(hexPts(x - 2, y - 2, 4))}"/></g>`; }).join(""));
  set("sym-fruits", ripe.length ? ripe.slice(0, 6).map((r) => `<span class="ripe">${esc(r.symbol || short(r.mint))} ${pct(r.gain_pct, 0)}</span>`).join(" ") : `<span class="sym-empty">No coin has doubled on paper and passed every health check yet.</span>`);
  set("sym-gta", (s.gta || []).slice(0, 6).map((g) => `<div class="g"><b>${esc(g.symbol || short(g.mint))}</b><span>${esc(g.name || "")}</span><i>${g.px0 && g.last ? pct((g.last / g.px0 - 1) * 100, 0) : D} · ${int(Number(g.minutes))} min</i></div>`).join("") || `<p class="sym-empty">No GTA launch yet. The main coin 4kjr…zDnz is priced every minute.</p>`);
  set("sym-miss", (s.missedReasons || []).map((m) => `<div class="m"><b>${int(m.n)}</b><span>${esc(m.reason)}</span></div>`).join("") || `<p class="sym-empty">Nothing missed.</p>`);
  const chip = $("sym-chip"); if (chip) { const r = num(v.perSec) ? v.perSec : 0, dur = Math.max(1.4, 6 - Math.log10(1 + r) * 1.9); chip.style.setProperty("--breath", dur.toFixed(2) + "s"); chip.classList.toggle("idle", !s.running); }
}

function openSources() {
  const s = last; if (!s) return;
  dialog(`<h3>Where the numbers come from</h3><p class="muted">Every count is a live query on its own table (Neon), read ${athens(s.updatedAt) || ""}.</p>
  <table class="sym-src">${(s.sources || []).map((x) => `<tr><td>${esc(x.label)}</td><td><code>${esc(x.table)}</code></td><td>${x.n == null ? esc(x.error || D) : int(x.n)}</td></tr>`).join("")}</table><div class="row"><button class="ghost" data-x>Close</button></div>`,
  (d, close) => d.querySelector("[data-x]").addEventListener("click", close));
}

const CSS = `
#sym{position:relative;margin:14px 12px;padding:16px 18px 14px;border-radius:6px;color:#d9dbe2;font-family:var(--sf);
  background:radial-gradient(900px 400px at 50% 40%,rgba(80,40,120,.18),transparent 70%),repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 34px),repeating-linear-gradient(90deg,rgba(0,0,0,.25) 0 2px,transparent 2px 68px),linear-gradient(180deg,#16161a,#0c0c0f);
  border:6px solid transparent;border-image:linear-gradient(180deg,#9aa0aa,#3b3e45 40%,#a9afb9 60%,#2e3036) 1;box-shadow:inset 0 0 0 2px #050507,inset 0 0 40px rgba(0,0,0,.8)}
#sym h3,#sym h4{margin:0}.sym-pipes i{position:absolute;background:linear-gradient(90deg,#4a2f10,#e2b06a 45%,#7a5220);border-radius:6px;opacity:.9}
.sym-pipes .p1{left:4px;top:30px;width:10px;height:140px}.sym-pipes .p2{left:4px;top:30px;width:90px;height:10px;background:linear-gradient(180deg,#4a2f10,#e2b06a 45%,#7a5220)}.sym-pipes .p3{right:4px;top:20px;width:10px;height:180px}.sym-pipes .p4{right:4px;top:200px;width:60px;height:10px;background:linear-gradient(180deg,#4a2f10,#e2b06a 45%,#7a5220)}
.led{position:absolute;width:8px;height:8px;border-radius:50%;background:#ff2a2a;box-shadow:0 0 8px #ff2a2a,0 0 18px rgba(255,40,40,.6);animation:symLed 2.4s ease-in-out infinite}.led.a{left:16px;top:20px}.led.b{left:40%;top:8px;animation-delay:.7s}.led.c{right:30%;top:8px;animation-delay:1.3s}.led.d{right:16px;top:230px;animation-delay:.3s}
@keyframes symLed{0%,100%{opacity:1}50%{opacity:.35}}.sym-red circle{fill:#ff2a2a;filter:drop-shadow(0 0 4px #ff2a2a);animation:symLed 2.4s infinite}
.sym-top{display:grid;grid-template-columns:1fr 300px;gap:10px 16px;align-items:start}.sym-titlebar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;grid-column:1}
.sym-title{font:700 42px/1 var(--serif);letter-spacing:.06em;background:linear-gradient(180deg,#fff,#b9bec8 45%,#6e737d 55%,#e6e9ee);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 0 #000)}
.sym-plaque{font:700 20px var(--serif);letter-spacing:.06em;color:#2a1a05;padding:6px 16px;border-radius:6px;background:linear-gradient(180deg,#fbe3a0,#d8a548 45%,#9c6b20 55%,#e9c06a);border:2px solid #5b3a14;box-shadow:0 0 0 2px #e2b06a,0 4px 10px rgba(0,0,0,.6)}
.sym-sub{margin:0;padding-left:14px;border-left:1px solid #555;font:600 11px/1.5 var(--serif);letter-spacing:.24em;color:#c9ccd4}.sym-glyphs{color:#8f949e;letter-spacing:.3em;font-size:16px}
.sym-counters{grid-column:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.sym-brass{position:relative;display:flex;flex-direction:column;align-items:center;padding:8px 30px 10px;border-radius:10px;cursor:pointer;background:linear-gradient(180deg,#f3d08a,#c08a38 40%,#8a5a1c 60%,#d8a556);border:2px solid #4a2f10;box-shadow:inset 0 1px 0 #fff3c8,0 4px 12px rgba(0,0,0,.6)}
.sym-brass small{font:700 13px var(--serif);letter-spacing:.06em;color:#2a1a05}.sym-brass b{margin-top:4px;min-width:80%;text-align:center;font:600 26px var(--mono);letter-spacing:.06em;color:#f2f2f2;background:linear-gradient(180deg,#121214,#26262b);border:2px solid #3a2a12;border-radius:5px;padding:2px 10px;box-shadow:inset 0 2px 6px #000}
.sym-brass .lau{position:absolute;top:22px;width:16px;height:34px}.sym-brass .lau.l{left:7px}.sym-brass .lau.r{right:7px;transform:scaleX(-1)}.lau svg{width:100%;height:100%;fill:#5b3a14;stroke:#5b3a14}
.sym-window{grid-column:2;grid-row:1/3;width:100%;height:auto;border:3px solid #4b4e56;border-radius:4px;box-shadow:inset 0 0 20px #000}
.sym-status{margin:8px 0 10px;font:11px var(--mono);color:#9a9ca6}.sym-status b{color:#fff}.sym-status em{font-style:normal;color:#c9ccd4}
.sym-grid{display:grid;grid-template-columns:1fr 1.05fr 1fr;gap:14px}
.sym-panel{position:relative;padding:12px 14px;border:4px solid transparent;border-image:linear-gradient(180deg,#8f949e,#2e3036 50%,#8f949e) 1;background:linear-gradient(180deg,rgba(20,20,24,.95),rgba(10,10,12,.95));box-shadow:inset 0 0 24px #000}
.sym-panel h3{display:flex;align-items:center;justify-content:center;gap:10px;font:700 22px var(--serif);letter-spacing:.08em;color:#e9ebef;margin-bottom:10px}.orn{width:60px;height:14px;stroke:#b9bec8;fill:#b9bec8;stroke-width:1.4}.sym-panel h3 .orn:last-child{transform:scaleX(-1)}
.sym-trades table{width:100%;border-collapse:collapse;font:14px var(--mono);color:#3cff7a;background:linear-gradient(180deg,#04140a,#020a05);border:1px solid #1a4a2a;box-shadow:inset 0 0 20px rgba(60,255,122,.08)}
.sym-trades th{text-align:left;padding:8px 8px 6px;font-weight:500;border-bottom:1px solid #2a7a44}.sym-trades td{padding:7px 8px;border-bottom:1px solid rgba(60,255,122,.18);white-space:nowrap}.sym-trades td.buy{color:#3cff7a}.sym-trades td.sell{color:#f1fa8c}.sym-trades td.up{color:#3cff7a}.sym-trades td.dn{color:#ff5555}
.sym-lanes{display:flex;flex-direction:column;gap:3px;margin-top:8px;font:10px var(--mono);color:#9a9ca6}.sym-lanes b{color:#f5a524}.sym-paper{font:700 9px var(--mono);letter-spacing:.12em;text-decoration:none;color:#f5a524;border:1px solid rgba(245,165,36,.6);border-radius:4px;padding:1px 4px}
.sym-mid{display:flex;flex-direction:column;align-items:center}.sym-cath{position:relative;width:100%;max-width:420px;aspect-ratio:400/420;display:grid;place-items:center}.sym-cath-svg{position:absolute;inset:0;width:100%;height:100%}
.sym-banner{margin-top:-28px;position:relative;font:700 20px var(--serif);letter-spacing:.24em;color:#e9ebef;padding:8px 28px;background:linear-gradient(180deg,#3a3c43,#151518);border:2px solid #8f949e;clip-path:polygon(6% 0,94% 0,100% 50%,94% 100%,6% 100%,0 50%)}
.sym-pain{margin-top:6px;font:700 10px var(--mono);letter-spacing:.1em;color:#ff5555}.sym-pain em{font-style:normal;font-weight:400;color:#9a9ca6;letter-spacing:0}
.sym-chip{position:relative;--breath:4s;width:78%;display:grid;place-items:center}.sym-chip-svg{width:100%;height:auto;overflow:visible}
.sym-chip .gear{fill:#1b1426;stroke:#aab2bf;stroke-width:1.2;transform-origin:200px 200px;animation:symSpin 120s linear infinite}.sym-chip .breath{transform-origin:200px 200px;animation:symBreath var(--breath) ease-in-out infinite}
.sym-chip .fil{fill:none;stroke:#dfe5ee;stroke-width:1.3;opacity:.85}.sym-chip .trace{fill:none;stroke:#c3cad5;stroke-width:1.6;opacity:.55}
.sym-chip .vein{fill:none;stroke:#f3e6ff;stroke-width:2.6;stroke-linecap:round;stroke-dasharray:14 240;animation:symPulse calc(var(--breath) * .9) linear infinite}
.sym-chip .rune{font:15px Georgia,serif;fill:#8f86a6;text-anchor:middle;dominant-baseline:middle}.sym-chip .rune.lit{animation:symRune 2.6s ease-out}
.sym-chip .star{fill:#d8b4fe;stroke:#fff;stroke-width:1.2;transform-origin:200px 200px;animation:symStar calc(var(--breath) * 2) ease-in-out infinite}.sym-chip.idle .vein{animation-play-state:paused;opacity:.2}
.sym-chip .crack{fill:none;stroke:#ff5555;stroke-width:2.4;stroke-linecap:round;stroke-dasharray:400;animation:symCrack 12s ease-out forwards}.sym-chip .scar{fill:none;stroke:#dfe5ee;stroke-width:1.1;opacity:.55;stroke-linecap:round}
@keyframes symSpin{to{transform:rotate(360deg)}}@keyframes symBreath{0%,100%{transform:scale(.985);filter:drop-shadow(0 0 6px rgba(157,78,221,.35))}50%{transform:scale(1.015);filter:drop-shadow(0 0 22px rgba(199,125,255,.75))}}
@keyframes symPulse{from{stroke-dashoffset:254}to{stroke-dashoffset:0}}@keyframes symRune{0%{fill:#fff}100%{fill:#8f86a6}}@keyframes symStar{0%,100%{opacity:.85}50%{opacity:1}}
@keyframes symCrack{0%{stroke-dashoffset:400;stroke:#ff5555}8%{stroke-dashoffset:0}60%{stroke:#ff9b9b}100%{stroke-dashoffset:0;stroke:#dfe5ee;opacity:0;stroke-width:1}}
.sym-rc-body{display:grid;grid-template-columns:1fr 140px;gap:10px;align-items:center}.sym-tree{width:100%;height:auto}
.sym-tree .gem polygon{fill:#9d4edd;stroke:#e0b3ff;stroke-width:1.2;filter:drop-shadow(0 0 6px #b44dff)}.sym-tree .gem .hi{fill:#f0d6ff;stroke:none;filter:none;opacity:.7}.sym-tree .gem{animation:symRise 1.2s both;animation-delay:calc(var(--i) * 80ms)}
@keyframes symRise{from{opacity:0;transform:translateY(14px)}to{opacity:1}}
.sym-stats{display:flex;flex-direction:column;gap:8px}.sym-stats div{border:2px solid #8f949e;background:#0b0b0e;padding:6px 10px;border-radius:3px}.sym-stats small{display:block;font:600 10px var(--serif);letter-spacing:.12em;color:#c9ccd4}.sym-stats b{font:600 20px var(--mono);color:#fff}.sym-stats b.up{color:#3cff7a}.sym-stats b.dn{color:#ff5555}
.sym-fp-list{margin:8px 0 0;font:11px var(--mono)}.sym-fp-list .ripe{color:#e0b3ff;margin-right:8px}
.sym-log{display:grid;grid-template-columns:120px 1fr;gap:14px;margin-top:14px;padding:12px 16px;border:4px solid transparent;border-image:linear-gradient(180deg,#8f949e,#2e3036 50%,#8f949e) 1;background:#1b1c26}
.sym-log h3{font:700 22px/1.15 var(--serif);letter-spacing:.06em;color:#e9ebef;align-self:center;border-right:1px solid #44475a;padding-right:12px}
#sym-code{margin:0;height:150px;overflow:auto;font:12px/1.55 var(--mono);color:#f8f8f2;white-space:pre-wrap;word-break:break-word}#sym-code .tl{display:block;white-space:normal;animation:symIn .5s ease-out}#sym-code .tl>span{display:inline}
#sym-code .dt{color:#f8f8f2}#sym-code .dk{color:#8be9fd}#sym-code .ds{color:#f1fa8c}#sym-code .dp{color:#ff79c6}#sym-code .dg{color:#50fa7b}#sym-code .dr{color:#ff5555}#sym-code .dc{color:#6272a4}#sym-code .dev.dp{color:#ff79c6}#sym-code .dtag.dp{color:#bd93f9}
@keyframes symIn{from{opacity:0;transform:translateY(4px)}to{opacity:1}}
.sym-extra{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px;font:11px var(--mono)}.sym-extra h4{font:700 10px var(--mono);letter-spacing:.14em;color:#c9ccd4;margin-bottom:4px}.sym-extra h4 span{font-weight:400;color:#6b7a90;letter-spacing:0;margin-left:6px}
.g,.m{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid rgba(80,80,90,.35);align-items:baseline}.g b{color:#ff79c6}.g span{color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.g i{color:#888;font-style:normal}.m b{color:#ffb86c;min-width:40px}.m span{color:#ccc}
.sym-empty{color:#7a7f8a;font:11px var(--mono)}table.sym-src{width:100%;border-collapse:collapse;font:11px var(--mono)}table.sym-src td{padding:4px 6px;border-bottom:1px solid var(--line)}table.sym-src td:last-child{text-align:right;color:#fff}
@media (max-width:1100px){.sym-grid{grid-template-columns:1fr 1fr}.sym-mid{grid-column:1/3;grid-row:1}}
@media (max-width:820px){#sym{margin:10px 6px;padding:12px 10px}.sym-top{grid-template-columns:1fr}.sym-window{grid-column:1;grid-row:auto;max-height:120px;object-fit:cover}.sym-counters{grid-template-columns:1fr 1fr}.sym-title{font-size:32px}.sym-sub{border:0;padding:0}
  .sym-grid{grid-template-columns:1fr}.sym-mid{grid-column:1;grid-row:auto}.sym-log{grid-template-columns:1fr}.sym-log h3{border:0;padding:0}.sym-extra{grid-template-columns:1fr}.sym-rc-body{grid-template-columns:1fr 120px}.sym-brass b{font-size:20px}}
`;
