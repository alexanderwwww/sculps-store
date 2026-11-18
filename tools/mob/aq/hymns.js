// HYMN screen: the 88 Orphic hymns (Greek, from aq/data/orphic-hymns.json, Wikisource CC BY-SA), framed by gold Doric columns,
// the Delphic E above, a pentagram below, lightning behind, and the Council as an orchestra: one musician per department,
// glowing when any of its workers is busy. Opens on hymn 15 (Zeus). Styles live in style.css under #hymn.
import { hymns } from "./data/orphic-hymns.json";
import { esc, onState } from "./main.js";

const H = hymns, START = 15;
const at = (n) => H.find((x) => x.n === n) || H[0];

const column = (side) => `<svg class="hy-col hy-${side}" viewBox="0 0 40 300" preserveAspectRatio="none" aria-hidden="true">
  <rect x="2" y="0" width="36" height="8" class="g"/><path d="M5 8h30l-3 10H8z" class="g"/>
  ${[9, 15, 21, 27, 33].map((x) => `<rect x="${x - 1.5}" y="20" width="3" height="262" class="fl"/>`).join("")}
  <rect x="7" y="18" width="26" height="266" class="sh"/><rect x="4" y="284" width="32" height="7" class="g"/><rect x="1" y="291" width="38" height="9" class="g"/></svg>`;

const star = (cx, cy, r) => Array.from({ length: 5 }, (_, i) => { const a = (-90 + i * 144) * Math.PI / 180; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
const pentagram = `<svg class="hy-penta" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="27"/><polygon points="${star(30, 31, 25)}"/></svg>`;
const delphicE = `<svg class="hy-e" viewBox="0 0 60 60" aria-hidden="true"><path d="M30 3 57 30 30 57 3 30Z"/><text x="30" y="40" text-anchor="middle">Ε</text></svg>`;
const bolt = `<svg class="hy-bolt" viewBox="0 0 100 200" preserveAspectRatio="none" aria-hidden="true"><path d="M58 0 30 90h22L36 200 74 78H50L70 0Z"/></svg>`;

function orchestra(depts) {
  const n = depts.length || 1;
  return depts.map((d, i) => {
    const a = Math.PI * (0.92 - (0.84 * i) / Math.max(1, n - 1)), x = 50 + 47 * Math.cos(a), y = 86 - 74 * Math.sin(a);
    const on = (d.workers || []).some((w) => w.status === "busy");
    return `<div class="hy-mus${on ? " on" : ""}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%" title="${esc(d.name)}${on ? " · playing" : " · resting"}">
      <svg viewBox="0 0 24 30" aria-hidden="true"><circle cx="12" cy="6" r="4"/><path d="M5 29c0-9 3-15 7-15s7 6 7 15z"/><path class="ly" d="M15 13c3 0 5 3 4 8M15 13v9M19 21h-5"/></svg>
      <small>${esc(String(d.name || "").split(" · ").pop())}</small></div>`;
  }).join("");
}

export function hymnScreen() {
  const el = document.createElement("section"); el.id = "hymn";
  el.innerHTML = `<div class="hy-sky">${bolt}${bolt}</div>${column("l")}${column("r")}
    <div class="hy-mid">${delphicE}
      <div class="hy-nav"><button data-d="-1" aria-label="Previous hymn">‹</button>
        <select aria-label="Choose a hymn">${H.map((x) => `<option value="${x.n}">${x.n}. ${esc(x.title)}</option>`).join("")}</select>
        <button data-d="1" aria-label="Next hymn">›</button></div>
      <h3 class="hy-title"></h3><p class="hy-inc"></p><div class="hy-text"></div>
      ${pentagram}
      <div class="hy-orch" aria-label="The Council"></div>
      <p class="hy-src">Text: Greek Wikisource, CC BY-SA 4.0; Abel 1885</p></div>`;
  const sel = el.querySelector("select"), orch = el.querySelector(".hy-orch");
  let i = Math.max(0, H.findIndex((x) => x.n === START));
  const show = () => { const x = H[i]; sel.value = x.n; el.querySelector(".hy-title").textContent = `${x.n} · ${x.title}`;
    el.querySelector(".hy-inc").textContent = x.incense || ""; el.querySelector(".hy-text").innerHTML = x.lines.map((l) => `<p>${esc(l)}</p>`).join(""); };
  el.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { i = (i + Number(b.dataset.d) + H.length) % H.length; show(); }));
  sel.onchange = () => { i = H.indexOf(at(Number(sel.value))); show(); };
  show();
  onState((s) => { orch.innerHTML = orchestra(s.departments || []); });
  return el;
}
