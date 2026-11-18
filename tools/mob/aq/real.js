// REAL money first (Alex, 2026-11-18: real money must be the biggest thing on the screen; paper is smaller and labelled PAPER).
// realBar(): top of the page. REAL BALANCE = Aquarius wallet SOL + Phantom SOL (both read on-chain by the server) + the
// marked value of open live positions. Real P&L today and total, open real positions.
// tradeScreens(): right after the reactor, ALWAYS three slots. A filled slot is a live chart of the position with entry,
// stop, T1 and T2 lines, its P&L and SELL 25/50/ALL + BUY MORE (same order path as the dock: aq/livepos.js manual()).
// An empty slot says "waiting for a setup" with the last refusal reason. Missing data shows "—", never invented.
import { esc, onState, store } from "./main.js";
import { manual } from "./livepos.js";
const D = "—", num = (v) => typeof v === "number" && isFinite(v);
const sol = (v, d = 4, sg = false) => (num(v) ? (sg && v > 0 ? "+" : "") + v.toFixed(d) + " SOL" : D);
const cls = (v) => (num(v) ? (v > 0 ? "up" : v < 0 ? "dn" : "") : "");
const px = (v) => (num(v) ? "$" + (v >= 1 ? v.toFixed(4) : v.toPrecision(4)) : D);
const short = (m) => (m && m.length > 12 ? m.slice(0, 4) + "…" + m.slice(-4) : m || D);
const athens = (t) => (t ? new Date(t).toLocaleTimeString("en-GB", { timeZone: "Europe/Athens", hour12: false, hour: "2-digit", minute: "2-digit" }) : D);

// the real numbers, from state only. Any wallet not read yet = its part is unknown, and the total says so.
export function realNumbers(s) {
  const w = (s && s.solWallet) || {}, ph = (s && s.phantom) || {}, live = w.live || {};
  const P = (live.positions || []).filter((p) => p.status === "open" || p.status === "stuck"), phP = ph.connected ? ph.positions || [] : [];
  const parts = []; let known = true, bal = 0;
  if (w.exists) { if (num(w.sol)) { bal += w.sol; parts.push(["Aquarius wallet", w.sol]); } else known = false; }
  if (ph.connected) { if (num(ph.sol)) { bal += ph.sol; parts.push(["Phantom", ph.sol]); } else known = false; }
  let posV = 0; for (const p of P) { if (num(p.valueSol)) posV += p.valueSol; else known = false; }
  if (P.length) parts.push(["Live positions (marked)", posV]);
  const any = w.exists || ph.connected;
  const sum = (a, b) => (num(a) || num(b) ? (num(a) ? a : 0) + (num(b) ? b : 0) : null);
  return { any, known, balance: any ? bal + posV : null, parts, today: sum(live.pnlTodaySol, ph.connected ? ph.pnlSol : null), total: sum(live.pnlTotalSol, ph.connected ? ph.pnlTotalSol : null), open: P.length + phP.length };
}

export function realBar() {
  const el = document.createElement("section"); el.id = "real"; el.className = "real";
  el.innerHTML = `<div class="rl-c"><small>REAL BALANCE <i>on-chain</i></small><b id="rl-bal">${D}</b><span id="rl-parts"></span></div>
    <div class="rl-k"><small>REAL P&amp;L TODAY</small><b id="rl-today">${D}</b></div><div class="rl-k"><small>REAL P&amp;L TOTAL</small><b id="rl-total">${D}</b></div><div class="rl-k"><small>REAL OPEN</small><b id="rl-open">${D}</b></div>`;
  onState((s) => { try { paintBar(el, s); } catch (e) { console.error(e); } });
  return el;
}
function paintBar(el, s) {
  if (!s) return; const r = realNumbers(s), $ = (id) => el.querySelector("#" + id);
  const set = (id, v, c) => { const e = $(id); if (e.textContent !== v) e.textContent = v; if (c != null && e.className !== c) e.className = c; };
  set("rl-bal", r.any ? sol(r.balance, 4) + (r.known ? "" : " +?") : "no wallet yet");
  const pt = r.parts.map(([n, v]) => `${esc(n)} ${esc(sol(v, 4))}`).join(" · ") || "connect Phantom or create the Aquarius wallet";
  const pe = $("rl-parts"); if (pe.dataset.h !== pt) { pe.dataset.h = pt; pe.innerHTML = pt; }
  set("rl-today", sol(r.today, 4, true), cls(r.today)); set("rl-total", sol(r.total, 4, true), cls(r.total)); set("rl-open", String(r.open));
}

// one live chart: prices since entry (spark) with the plan's lines
export function chartSVG(p, W = 320, H = 120) {
  const v = (p.spark || []).filter(num), pl = p.plan || {};
  const lines = [["stop", pl.stop, "#ff4d4d"], ["entry", pl.entry, "#d8e1ee"], ["T1", pl.t1, "#22ff88"], ["T2", pl.t2, "#40e8ff"]].filter((x) => num(x[1]));
  const all = v.concat(lines.map((x) => x[1])); if (!all.length) return `<svg class="ts-ch" viewBox="0 0 ${W} ${H}"><text x="8" y="${H / 2}" fill="#6b7a90" font-size="10">no price yet</text></svg>`;
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08 || lo * 0.01 || 1, a = lo - pad, b = hi + pad, y = (q) => (H - 4 - ((q - a) / (b - a)) * (H - 8)).toFixed(1);
  const ln = lines.map(([n, q, c]) => `<line x1="0" x2="${W - 40}" y1="${y(q)}" y2="${y(q)}" stroke="${c}" stroke-width="1" stroke-dasharray="${n === "entry" ? "0" : "4 3"}" opacity=".85"/><text x="${W - 38}" y="${+y(q) + 3}" fill="${c}" font-size="9">${n}</text>`).join("");
  const pts = v.length > 1 ? v.map((q, i) => `${((i / (v.length - 1)) * (W - 44)).toFixed(1)},${y(q)}`).join(" ") : "";
  return `<svg class="ts-ch" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${ln}${pts ? `<polyline points="${pts}" fill="none" stroke="${v.at(-1) >= v[0] ? "#22ff88" : "#ff4d4d"}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>` : ""}</svg>`;
}
export function slotsHTML(s) {
  const w = (s && s.solWallet) || {}, live = w.live || {}, lim = w.limits || {}, ref = live.lastRefusal;
  const P = (live.positions || []).filter((p) => p.status === "open" || p.status === "stuck").slice(0, 3);
  const out = [];
  for (let i = 0; i < 3; i++) {
    const p = P[i];
    if (!p) { out.push(`<div class="ts empty"><div class="ts-h"><b>SLOT ${i + 1}</b><span>waiting for a setup</span></div><div class="ts-w"><p>Last refusal${ref ? ` · ${esc(athens(ref.at))} Athens` : ""}</p><b>${ref ? esc(ref.reason) : "none recorded yet"}</b>${ref && ref.symbol ? `<small>${esc(ref.symbol)} · ${esc(ref.gate)}${ref.times > 1 ? ` · ${esc(ref.times)}×` : ""}</small>` : ""}<small>Auto trade ${lim.autoTrade ? "ON" : "OFF"}</small></div></div>`); continue; }
    const pnlSol = num(p.valueSol) && num(p.costSol) ? p.valueSol - p.costSol : null;
    out.push(`<div class="ts" id="ts-${p.id}"><div class="ts-h"><b>${esc(p.symbol || short(p.mint))}</b><code title="${esc(p.mint)}">${esc(short(p.mint))}</code><em class="${cls(p.pnlPct)}">${num(p.pnlPct) ? (p.pnlPct > 0 ? "+" : "") + p.pnlPct.toFixed(2) + "%" : D}</em><em class="${cls(pnlSol)}">${esc(sol(pnlSol, 4, true))}</em>${p.status === "stuck" ? `<i class="dn">STUCK</i>` : ""}</div>
      ${chartSVG(p)}<div class="ts-l"><span>stop ${px(p.plan && p.plan.stop)}</span><span>entry ${px(p.plan && p.plan.entry)}</span><span>T1 ${px(p.plan && p.plan.t1)}</span><span>T2 ${px(p.plan && p.plan.t2)}</span><span>in ${esc(sol(p.costSol, 4))}</span></div>
      <div class="ts-a"><button class="ghost" data-m="sell" data-pct="25" data-id="${p.id}">SELL 25%</button><button class="ghost" data-m="sell" data-pct="50" data-id="${p.id}">SELL 50%</button><button class="danger" data-m="sell" data-pct="100" data-id="${p.id}">SELL ALL</button><span><input type="number" min="0" step="any" inputmode="decimal" value="${num(lim.maxPerTradeSol) ? lim.maxPerTradeSol : ""}" data-amt="${p.id}" aria-label="SOL to add"><button class="primary" data-m="buy" data-id="${p.id}">BUY MORE</button></span></div></div>`);
  }
  return out.join("");
}
export function tradeScreens() {
  const el = document.createElement("section"); el.id = "slots"; el.className = "p slots";
  el.innerHTML = `<div class="ph"><b>LIVE TRADES · REAL MONEY</b><span>three slots · Aquarius wallet · chart trader</span></div><div class="ts-g" id="ts-g"></div>`;
  const g = el.querySelector("#ts-g");
  g.addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b) manual(b, g); });
  onState((s) => { if (!s) return; const h = slotsHTML(s); const f = document.activeElement; if (g.dataset.h !== h && !(f && f.tagName === "INPUT" && g.contains(f))) { g.dataset.h = h; g.innerHTML = h; } });
  return el;
}
