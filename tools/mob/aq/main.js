// Aquarius client. BOT MODE (default): a light dashboard, no three.js. WORLD MODE: lazy-loads /aq/assets/world.js.
// Both read GET /api/aq/state every 3 s (tools/mob/aq/CONTRACT.md). Missing data shows "—", never invented.
export const BUILD = typeof __AQ_BUILD__ !== "undefined" ? __AQ_BUILD__ : "dev";

export const DEPTS = [
  ["scouts_sol", "Scouts · Solana", "#2fb7c9"], ["scouts_stocks", "Scouts · Stocks", "#3b82f6"], ["whales", "Whales", "#4f5bd5"],
  ["news", "News & Mood", "#c03fb0"], ["setups", "Setups", "#e8a317"], ["costs", "Costs", "#7c9a2e"],
  ["council", "Council of Olympus", "#d4a020"], ["risk", "Risk", "#d33a2c"], ["execution", "Execution", "#0e9f6e"],
  ["review", "Review & Journal", "#8a5a32"], ["learning", "Learning", "#7d3cd8"], ["ops", "Ops", "#5b6b7c"],
];
export const GODS = { scouts_sol: "Hecate", learning: "Apollo", setups: "Athena", risk: "Zeus", execution: "Hermes", news: "Dionysus" };
const deptName = (id) => (DEPTS.find((d) => d[0] === id) || [id, id])[1];
const deptCol = (id) => (DEPTS.find((d) => d[0] === id) || [0, 0, "#888"])[2];

// ---------- formatting: null -> "—" ----------
const D = "—";
const num = (v) => typeof v === "number" && isFinite(v);
export const fSol = (v, sign = false) => (num(v) ? (sign && v > 0 ? "+" : "") + v.toFixed(Math.abs(v) < 10 ? 3 : 2) + " SOL" : D);
export const fPct = (v, sign = true) => (num(v) ? (sign && v > 0 ? "+" : "") + v.toFixed(1) + "%" : D);
export const fUsd = (v) => (num(v) ? "$" + (v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v.toPrecision(4)) : D);
export const fNum = (v) => (num(v) ? String(v) : D);
export const ago = (t) => { if (!t) return D; const s = (Date.now() - new Date(t).getTime()) / 1000; if (!isFinite(s)) return D; return s < 60 ? Math.max(0, s | 0) + "s" : s < 3600 ? ((s / 60) | 0) + "m" : s < 86400 ? ((s / 3600) | 0) + "h" : ((s / 86400) | 0) + "d"; };
export const esc = (s) => String(s ?? D).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cls = (v) => (num(v) ? (v > 0 ? "up" : v < 0 ? "dn" : "") : "");
const helperOf = (h) => (h == null ? null : typeof h === "string" ? { status: h } : h);
const helperConnected = (h) => { h = helperOf(h); return !!h && (h.status === "connected" || !!h.lastAt || !!h.lastText); };

// ---------- shared store ----------
const listeners = new Set();
export const store = { state: null, ok: false, lastOk: 0, err: null, mode: "bot" };
export const onState = (f) => { listeners.add(f); if (store.state) f(store.state); return () => listeners.delete(f); };
async function poll() {
  try {
    const r = await fetch("/api/aq/state", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    store.state = await r.json(); store.ok = true; store.lastOk = Date.now(); store.err = null;
  } catch (e) { store.ok = false; store.err = String(e.message || e); }
  for (const f of listeners) { try { f(store.state); } catch (e) { console.error(e); } }
}

// x feed: state.xfeed if present, else Grok's latest message
export function xFeed(s) {
  if (s && Array.isArray(s.xfeed) && s.xfeed.length) return s.xfeed;
  const g = helperOf(s && s.helpers && s.helpers.grok);
  if (g && g.lastText) return [{ at: g.lastAt, text: g.lastText, label: g.label || null, dept: null }];
  return [];
}
const LBL = (l) => (l ? `<span class="lbl lbl-${esc(String(l).toLowerCase())}">${esc(String(l).toUpperCase())}</span>` : "");

// ---------- DOM helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// ---------- top bar (both modes) ----------
function topbar() {
  const el = h(`<header id="top">
    <div class="brand"><span class="logo">♒</span><b>AQUARIUS</b><span id="mode-badge" class="badge">—</span></div>
    <div class="kpis">
      <div class="kpi"><small>Equity</small><b id="k-eq">—</b></div>
      <div class="kpi"><small>Today</small><b id="k-today">—</b></div>
      <div class="kpi"><small>Total P&amp;L</small><b id="k-total">—</b></div>
      <div class="kpi"><small>Open</small><b id="k-open">—</b></div>
      <div class="kpi wide"><small>Evidence</small><b id="k-ev">—</b></div>
      <div class="kpi wide"><small>Council</small><b id="k-council">—</b></div>
    </div>
    <div class="right">
      <div class="seg" role="tablist"><button data-m="bot" class="on">Bot</button><button data-m="world">World</button></div>
      <button id="kill" class="kill">Kill switch</button>
      <button id="menu-btn" class="ghost" title="Menu (Esc)">☰</button>
    </div>
  </header>`);
  el.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
  el.querySelector("#kill").onclick = killDialog;
  el.querySelector("#menu-btn").onclick = () => openMenu();
  return el;
}
function renderTop(s) {
  const set = (id, v, c) => { const e = document.getElementById(id); if (e) { e.textContent = v; e.className = c || ""; } };
  const mb = $("#mode-badge");
  if (mb) { mb.textContent = s ? s.mode || D : store.err ? "OFFLINE" : D; mb.className = "badge " + (s && s.mode === "LIVE" ? "live" : "paper"); }
  if (!s) return;
  set("k-eq", fSol(s.equitySol)); set("k-today", fSol(s.pnlTodaySol, true), cls(s.pnlTodaySol)); set("k-total", fSol(s.pnlTotalSol, true), cls(s.pnlTotalSol));
  set("k-open", Array.isArray(s.positions) ? String(s.positions.length) : D);
  const ev = s.trades && s.trades.evidence; set("k-ev", ev ? `${ev}${s.trades.n != null ? " · " + s.trades.n + "/100" : ""}` : D, ev === "EDGE" ? "up" : ev === "NO EDGE" ? "dn" : "muted");
  const lv = s.council && s.council.last; set("k-council", lv ? `${lv.verdict} ${lv.symbol || ""}` : D, lv ? (lv.verdict === "PASS" ? "up" : "dn") : "muted");
  const k = $("#kill"); if (k) { k.classList.toggle("on", !!s.killSwitch); k.textContent = s.killSwitch ? "Kill switch ON" : "Kill switch"; }
  const warn = $("#offline"); if (warn) warn.hidden = store.ok;
}

// ---------- dialogs ----------
export function dialog(html, onMount) {
  const bg = h(`<div class="dlg-bg"><div class="dlg">${html}</div></div>`);
  bg.onclick = (e) => { if (e.target === bg) bg.remove(); };
  document.body.appendChild(bg); onMount && onMount(bg.firstElementChild, () => bg.remove()); return bg;
}
function killDialog() {
  const on = !(store.state && store.state.killSwitch);
  dialog(`<h3>${on ? "Turn the kill switch ON?" : "Turn the kill switch OFF?"}</h3>
    <p>${on ? "Every department stops placing trades until you switch it off." : "Trading resumes inside Risk's limits."}</p>
    <div class="row"><button class="ghost" data-x>Cancel</button><button class="${on ? "danger" : "primary"}" data-ok>${on ? "Stop everything" : "Resume"}</button></div><p class="msg"></p>`,
  (d, close) => {
    d.querySelector("[data-x]").onclick = close;
    d.querySelector("[data-ok]").onclick = async () => {
      const m = d.querySelector(".msg"); m.textContent = "Sending…";
      try { const r = await fetch("/api/aq/kill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on }) }); if (!r.ok) throw new Error("HTTP " + r.status); close(); poll(); }
      catch (e) { m.textContent = "Not sent: " + e.message; }
    };
  });
}
export function workerPanel(w, dept) {
  const sk = (w.skills && w.skills.length) ? w.skills.map((x) => `<span class="chip">${esc(x)}</span>`).join("") : D;
  dialog(`<div class="wp"><div class="wp-h"><span class="dot st-${esc(w.status)}"></span><div><h3>${esc(w.name)}</h3><small>${esc(deptName(dept))} · ${esc(w.job)}</small></div></div>
    <dl><dt>Status</dt><dd class="st-t-${esc(w.status)}">${esc(w.status)}</dd><dt>Note</dt><dd>${esc(w.note || D)}</dd>
    <dt>Rules</dt><dd>${esc(w.rules || D)}</dd><dt>Power</dt><dd>${esc(w.power || D)}</dd><dt>Skills</dt><dd>${sk}</dd></dl>
    <div class="row"><button class="ghost" data-x>Close</button></div></div>`, (d, c) => (d.querySelector("[data-x]").onclick = c));
}

// ---------- BOT MODE dashboard ----------
let dash;
function buildDash() {
  dash = h(`<main id="dash">
    <section class="card hero"><div class="hero-l"><small>Wallet · equity</small><div class="big" id="d-eq">—</div>
      <div class="sub"><span id="d-start">—</span></div>
      <div class="trio"><div><small>Today</small><b id="d-today">—</b></div><div><small>Total</small><b id="d-total">—</b></div><div><small>Win rate</small><b id="d-wr">—</b></div><div><small>Trades</small><b id="d-n">—</b></div><div><small>Expectancy</small><b id="d-exp">—</b></div><div><small>95% interval</small><b id="d-ci">—</b></div></div></div>
      <div class="hero-r"><canvas id="d-spark" width="420" height="140"></canvas><div class="evid" id="d-ev">—</div></div></section>
    <section class="card flows"><h2>Money moving</h2><div id="d-flows" class="ticker"></div></section>
    <section class="card"><h2>Open positions</h2><div id="d-pos"></div></section>
    <section class="card"><h2>Council of Olympus</h2><div id="d-council"></div></section>
    <section class="card"><h2>Strategies</h2><div id="d-strat"></div></section>
    <section class="card"><h2>X · what the market is saying</h2><div id="d-x"></div></section>
    <section class="card"><h2>Market</h2><div id="d-mkt"></div></section>
    <section class="card span2"><h2>Departments <small id="d-wk"></small></h2><div id="d-depts" class="depts"></div></section>
    <section class="card"><h2>Brain · lessons</h2><div id="d-brain" class="list"></div></section>
    <section class="card"><h2>Helpers</h2><div id="d-help"></div></section>
  </main>`);
  return dash;
}
const equityHist = [];
function spark(c, arr) {
  const g = c.getContext("2d"), W = c.width, H = c.height; g.clearRect(0, 0, W, H);
  if (arr.length < 2) { g.fillStyle = "#9aa3ad"; g.font = "13px -apple-system,Segoe UI,sans-serif"; g.fillText("Equity line builds while this page is open", 10, H / 2); return; }
  const mn = Math.min(...arr), mx = Math.max(...arr), r = mx - mn || 1;
  const up = arr[arr.length - 1] >= arr[0], col = up ? "#16a34a" : "#dc2626";
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, up ? "rgba(22,163,74,.22)" : "rgba(220,38,38,.22)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.beginPath(); arr.forEach((v, i) => { const x = (i / (arr.length - 1)) * W, y = H - 8 - ((v - mn) / r) * (H - 16); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.strokeStyle = col; g.lineWidth = 2.5; g.stroke(); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fillStyle = gr; g.fill();
}
const flowIcon = { buy: "↗", sell: "↘", fee: "◎", win: "▲", loss: "▼" };
export function flowRow(f) { return `<div class="flow f-${esc(f.kind)}"><span class="fi">${flowIcon[f.kind] || "•"}</span><b>${f.kind === "fee" || f.kind === "loss" ? "−" : f.kind === "win" ? "+" : ""}${num(f.sol) ? Math.abs(f.sol).toFixed(4) : D} SOL</b><span class="fl">${esc(f.label || f.kind)}</span><small>${esc(deptName(f.dept))} · ${ago(f.at)}</small></div>`; }
function table(cols, rows, empty = "Nothing yet") {
  if (!rows || !rows.length) return `<p class="empty">${empty}</p>`;
  return `<div class="tbl-wrap"><table><thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c[2] ? c[2](r) : ""}">${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const posCols = [["Symbol", (p) => `<b>${esc(p.symbol)}</b>`], ["Strategy", (p) => esc(p.strategy)], ["Size", (p) => fSol(p.sizeSol)], ["Entry", (p) => fUsd(p.entryPrice)], ["Now", (p) => fUsd(p.price)], ["P&L", (p) => fPct(p.pnlPct), (p) => cls(p.pnlPct)], ["Stop / Target", (p) => `${fPct(p.stopPct, false)} / ${fPct(p.targetPct, false)}`], ["Open", (p) => ago(p.openedAt)]];
const verdictRow = (v) => `<div class="verdict v-${esc(v.verdict)}"><span class="vb">${esc(v.verdict)}</span><b>${esc(v.symbol || D)}</b><span>${esc(v.reason || D)}</span><small>${v.number != null ? esc(v.number) + " · " : ""}${ago(v.at)}</small></div>`;
export function stratRows(s) {
  const st = (s && s.strategies) || []; if (!st.length) return `<p class="empty">No strategies reported</p>`;
  const mx = Math.max(0.0001, ...st.map((x) => Math.abs(num(x.pnlSol) ? x.pnlSol : 0)));
  return st.map((x) => `<div class="strat ${x.alive === false ? "dead" : ""}"><b>${esc(x.id)}</b><span>${esc(x.name)}</span><small>${esc(x.status || (x.alive === false ? "killed" : x.alive ? "alive" : D))} · ${fNum(x.trades)} trades</small><div class="bar"><i class="${cls(x.pnlSol)}" style="width:${num(x.pnlSol) ? (Math.abs(x.pnlSol) / mx) * 100 : 0}%"></i></div><em class="${cls(x.pnlSol)}">${fSol(x.pnlSol, true)}</em></div>`).join("");
}
export function xRows(s, n = 8) {
  const xf = xFeed(s); const g = s && s.helpers && s.helpers.grok;
  if (!xf.length) return `<p class="empty">${helperConnected(g) ? "Grok connected · no X messages yet" : "Grok not connected"}</p>`;
  return xf.slice(0, n).map((m) => `<div class="xm">${LBL(m.label)}<span>${esc(m.text)}</span><small>${m.dept ? esc(deptName(m.dept)) + " · " : ""}${ago(m.at)}</small></div>`).join("");
}
function mkt(s) {
  const m = (s && s.market) || {};
  const c = (n, o) => `<div class="mk"><small>${n}</small><b>${o ? fUsd(o.price) : D}</b><em class="${o ? cls(o.ch24) : ""}">${o ? fPct(o.ch24) : D}</em></div>`;
  const fg = m.fearGreed;
  return `<div class="mks">${c("SOL", m.sol)}${c("BTC", m.btc)}<div class="mk"><small>Fear &amp; Greed</small><b>${fg ? fNum(fg.value) : D}</b><em>${fg ? esc(fg.label) : D}</em></div></div>` +
    table([["Trending", (t) => `<b>${esc(t.symbol)}</b>${t.boosted ? ' <span class="chip warn">boosted</span>' : ""}`], ["1h", (t) => fPct(t.ch1h), (t) => cls(t.ch1h)], ["Liquidity", (t) => fUsd(t.liqUsd)]], (m.trending || []).slice(0, 6), "No trending list");
}
function deptCards(s) {
  const ds = (s && s.departments) || [];
  return DEPTS.map(([id, nm, col]) => {
    const d = ds.find((x) => x.id === id); const ws = (d && d.workers) || [];
    const c = { busy: 0, idle: 0, blocked: 0 }; ws.forEach((w) => (c[w.status] = (c[w.status] || 0) + 1));
    return `<details class="dept" style="--dc:${col}"><summary><span class="dc"></span><b>${esc(nm)}</b>${GODS[id] ? `<small class="god">${GODS[id]}</small>` : ""}<span class="live ${d && d.live ? "on" : ""}">${d ? (d.live ? "live" : "idle") : D}</span>
      <span class="stbar"><i class="st-busy" style="flex:${c.busy}"></i><i class="st-idle" style="flex:${c.idle}"></i><i class="st-blocked" style="flex:${c.blocked}"></i></span><small>${ws.length ? `${c.busy} busy · ${c.blocked} blocked` : D}</small></summary>
      <div class="wl">${ws.map((w) => `<button class="wk" data-d="${esc(id)}" data-w="${esc(w.id)}"><span class="dot st-${esc(w.status)}"></span><b>${esc(w.name)}</b><small>${esc(w.note || w.job)}</small></button>`).join("") || `<p class="empty">No workers reported</p>`}</div></details>`;
  }).join("");
}
function renderDash(s) {
  if (!dash) return;
  const set = (id, html) => { const e = dash.querySelector("#" + id); if (e) e.innerHTML = html; };
  if (!s) { set("d-eq", store.err ? "Offline" : D); return; }
  if (num(s.equitySol) && equityHist[equityHist.length - 1] !== s.equitySol) { equityHist.push(s.equitySol); if (equityHist.length > 300) equityHist.shift(); }
  set("d-eq", fSol(s.equitySol));
  set("d-start", `Started with ${fSol(s.startSol)} · ${esc(s.mode || D)} · updated ${ago(s.updatedAt)} ago`);
  const T = s.trades || {};
  const sv = (id, v, c) => { const e = dash.querySelector("#" + id); e.textContent = v; e.className = c || ""; };
  sv("d-today", fSol(s.pnlTodaySol, true), cls(s.pnlTodaySol)); sv("d-total", fSol(s.pnlTotalSol, true), cls(s.pnlTotalSol));
  sv("d-wr", num(T.winRate) ? (T.winRate * (T.winRate <= 1 ? 100 : 1)).toFixed(0) + "%" : D); sv("d-n", fNum(T.n)); sv("d-exp", fPct(T.expectancyPct), cls(T.expectancyPct));
  sv("d-ci", Array.isArray(T.ci95) && T.ci95.every(num) ? `${fPct(T.ci95[0])} … ${fPct(T.ci95[1])}` : D);
  set("d-ev", T.evidence ? `<b class="${T.evidence === "EDGE" ? "up" : T.evidence === "NO EDGE" ? "dn" : ""}">${esc(T.evidence)}</b><small>${num(T.n) ? `${T.n} of 100 trades needed` : ""}</small>` : D);
  spark(dash.querySelector("#d-spark"), equityHist);
  set("d-flows", (s.flows || []).slice(0, 14).map(flowRow).join("") || `<p class="empty">No money moved yet</p>`);
  set("d-pos", table(posCols, s.positions, "No open positions"));
  const c = s.council || {};
  set("d-council", (c.last ? `<div class="vstone v-${esc(c.last.verdict)}"><span>${esc(c.last.verdict)}</span><b>${esc(c.last.symbol || D)}</b><small>${esc(c.last.reason || D)}${c.last.number != null ? " · " + esc(c.last.number) : ""}</small></div>` : `<p class="empty">No verdict yet</p>`) + ((c.vetoes || []).slice(0, 5).map(verdictRow).join("")));
  set("d-strat", stratRows(s)); set("d-x", xRows(s)); set("d-mkt", mkt(s));
  const open = [...dash.querySelectorAll("details.dept[open]")].map((d) => d.querySelector(".wk")?.dataset.d);
  set("d-depts", deptCards(s));
  dash.querySelectorAll("details.dept").forEach((d) => { const id = d.querySelector(".wk")?.dataset.d; if (id && open.includes(id)) d.open = true; });
  const all = (s.departments || []).flatMap((d) => d.workers || []);
  set("d-wk", all.length ? `${all.length} workers · ${all.filter((w) => w.status === "busy").length} busy · ${all.filter((w) => w.status === "blocked").length} blocked` : "");
  set("d-brain", (s.brain || []).slice(0, 10).map((b) => `<div class="li"><span class="dc" style="--dc:${deptCol(b.dept)}"></span><span>${esc(b.text)}</span><small>${esc(deptName(b.dept))} · ${ago(b.at)}</small></div>`).join("") || `<p class="empty">Nothing learned yet</p>`);
  set("d-help", helpersHtml(s));
}
export function helpersHtml(s) {
  const hp = (s && s.helpers) || {};
  return ["grok", "chatgpt"].map((k) => { const o = helperOf(hp[k]); const on = helperConnected(hp[k]);
    return `<div class="helper"><b>${k === "grok" ? "Grok" : "ChatGPT"}</b><span class="pill ${on ? "on" : ""}">${on ? "connected" : o ? esc(o.status || "not connected") : D}</span>${o && o.lastText ? `<p>${LBL(o.label)}${esc(o.lastText)}</p><small>${ago(o.lastAt)} ago</small>` : ""}</div>`; }).join("");
}

// ---------- MENU: Game / Inventory / Database ----------
let menuEl;
export function openMenu(tab = "game") {
  if (menuEl) { menuEl.remove(); menuEl = null; return; }
  menuEl = h(`<div id="menu"><div class="menu-in"><nav>
    <div class="mtitle">♒ Aquarius <small>build ${esc(BUILD)}</small></div>
    <button data-t="game">Game</button><button data-t="inv">Inventory</button><button data-t="db">Database</button><button data-t="new">Bot creator</button>
    <button class="close" data-close>Close · Esc</button></nav><div class="mbody"></div></div></div>`);
  menuEl.querySelector("[data-close]").onclick = () => openMenu();
  menuEl.querySelectorAll("nav [data-t]").forEach((b) => (b.onclick = () => showTab(b.dataset.t)));
  document.body.appendChild(menuEl); showTab(tab);
}
function showTab(t) {
  menuEl.querySelectorAll("nav [data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
  const body = menuEl.querySelector(".mbody"), s = store.state || {};
  if (t === "game") {
    body.innerHTML = `<h2>Game</h2><div class="gm">
      <button class="tile" data-go="bot"><b>Bot mode</b><small>The dashboard. Light and fast.</small></button>
      <button class="tile" data-go="world"><b>World mode</b><small>Walk the island. WASD + mouse, Shift run, E enter, O overview.</small></button></div>
      <h3>Controls</h3><ul class="keys"><li><kbd>W A S D</kbd> walk</li><li><kbd>Shift</kbd> run</li><li><kbd>Mouse drag</kbd> look · <kbd>wheel</kbd> zoom</li><li><kbd>E</kbd> enter / leave a building</li><li><kbd>O</kbd> overview camera</li><li><kbd>Click</kbd> a worker for his card</li><li><kbd>Esc</kbd> this menu</li></ul>
      <p class="muted">Build ${esc(BUILD)} · state ${store.ok ? "live, updated " + ago(s.updatedAt) + " ago" : "offline: " + esc(store.err || D)}</p>`;
    body.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { openMenu(); setMode(b.dataset.go); }));
  }
  if (t === "inv") {
    const ds = s.departments || [];
    const tools = s.tools || [];
    body.innerHTML = `<h2>Inventory</h2>
      <h3>Strategies</h3><div class="inv-s">${stratRows(s)}</div>
      <h3>Tools</h3>${table([["Tool", (x) => `<b>${esc(x.name)}</b>`], ["Status", (x) => `<span class="pill ${x.status === "connected" ? "on" : ""}">${esc(x.status)}</span>`], ["Used by", (x) => esc(Array.isArray(x.usedBy) ? x.usedBy.map(deptName).join(", ") : x.usedBy ? deptName(x.usedBy) : D)], ["Licence", (x) => esc(x.licence)], ["Verdict", (x) => esc(x.verdict)]], tools, "No tools reported")}
      <h3>Bots by department</h3>${DEPTS.map(([id, nm, col]) => { const d = ds.find((x) => x.id === id) || {}; const ws = d.workers || [];
        return `<details class="inv-d" style="--dc:${col}"><summary><span class="dc"></span><b>${esc(nm)}</b><small>${ws.length || D} bots</small><span class="chips">${(d.skills || []).slice(0, 6).map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</span></summary>
        ${(d.skills || []).length ? `<p class="muted">Department skills: ${(d.skills || []).map(esc).join(", ")}</p>` : `<p class="muted">Department skills: —</p>`}
        ${table([["Bot", (w) => `<button class="link" data-d="${esc(id)}" data-w="${esc(w.id)}">${esc(w.name)}</button>`], ["Job", (w) => esc(w.job)], ["Status", (w) => `<span class="dot st-${esc(w.status)}"></span>${esc(w.status)}`], ["Power", (w) => esc(w.power)], ["Skills", (w) => (w.skills || []).map(esc).join(", ") || D]], ws, "No bots")}</details>`; }).join("")}
      <h3>All skills</h3><div class="chips">${[...new Set(ds.flatMap((d) => [...(d.skills || []), ...(d.workers || []).flatMap((w) => w.skills || [])]))].map((k) => `<span class="chip">${esc(k)}</span>`).join("") || D}</div>
      <div class="row"><button class="primary" data-new>＋ Create a bot</button></div>`;
    body.querySelector("[data-new]").onclick = () => showTab("new");
  }
  if (t === "new") {
    body.innerHTML = `<h2>Bot creator</h2><p class="muted">Your bot needs no vote. It starts on paper.</p>
      <form class="bf"><label>Name<input name="name" required maxlength="40" placeholder="e.g. Volume Hawk"></label>
      <label>Department<select name="dept">${DEPTS.map(([id, nm]) => `<option value="${id}">${esc(nm)}</option>`).join("")}</select></label>
      <label>Job<input name="job" required maxlength="80" placeholder="What it does, in one line"></label>
      <label>Rules<textarea name="rules" rows="3" placeholder="When it may act, when it must stop"></textarea></label>
      <label>Skills <small>(comma separated)</small><input name="skills" placeholder="fibonacci, volume spikes"></label>
      <fieldset><legend>Power</legend>${["claude", "grok", "chatgpt"].map((p, i) => `<label class="radio"><input type="radio" name="power" value="${p}" ${i ? "" : "checked"}>${p === "chatgpt" ? "ChatGPT" : p[0].toUpperCase() + p.slice(1)}</label>`).join("")}</fieldset>
      <div class="row"><button class="primary" type="submit">Create bot</button></div><p class="msg"></p></form>`;
    const f = body.querySelector("form");
    f.onsubmit = async (e) => {
      e.preventDefault(); const fd = new FormData(f), m = f.querySelector(".msg");
      const b = { name: fd.get("name").trim(), dept: fd.get("dept"), job: fd.get("job").trim(), rules: fd.get("rules").trim(), skills: String(fd.get("skills") || "").split(",").map((x) => x.trim()).filter(Boolean), power: fd.get("power") };
      m.textContent = "Creating…";
      try { const r = await fetch("/api/aq/bots", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status); m.textContent = `${b.name} created in ${deptName(b.dept)}.`; m.className = "msg ok"; f.reset(); poll(); }
      catch (err) { m.textContent = "Not created: " + err.message; m.className = "msg err"; }
    };
  }
  if (t === "db") dbTab(body, s);
  body.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => openWorker(b.dataset.d, b.dataset.w)));
}
export function openWorker(dept, wid) {
  const d = ((store.state && store.state.departments) || []).find((x) => x.id === dept); const w = d && (d.workers || []).find((x) => String(x.id) === String(wid));
  if (w) workerPanel(w, dept);
}
const DB = {
  trades: { name: "Trades", rows: (s) => s.recent || [], cols: [["Time", (r) => ago(r.at)], ["Symbol", (r) => `<b>${esc(r.symbol)}</b>`], ["Side", (r) => esc(r.side)], ["Size", (r) => fSol(r.sizeSol)], ["P&L", (r) => fSol(r.pnlSol, true), (r) => cls(r.pnlSol)], ["Reason", (r) => esc(r.reason)]], kinds: (r) => r.side },
  positions: { name: "Positions", rows: (s) => s.positions || [], cols: posCols, kinds: (r) => r.strategy },
  flows: { name: "Flows", rows: (s) => s.flows || [], cols: [["Time", (r) => ago(r.at)], ["Kind", (r) => `<span class="fk f-${esc(r.kind)}">${esc(r.kind)}</span>`], ["SOL", (r) => (num(r.sol) ? r.sol.toFixed(4) : D)], ["Dept", (r) => esc(deptName(r.dept))], ["Label", (r) => esc(r.label)]], kinds: (r) => r.kind, dept: (r) => r.dept },
  council: { name: "Council verdicts", rows: (s) => { const c = s.council || {}; const v = [...(c.vetoes || [])]; if (c.last && !v.some((x) => x.at === c.last.at && x.symbol === c.last.symbol)) v.unshift(c.last); return v; }, cols: [["Time", (r) => ago(r.at)], ["Verdict", (r) => `<span class="vb v-${esc(r.verdict)}">${esc(r.verdict)}</span>`], ["Symbol", (r) => esc(r.symbol)], ["Number", (r) => esc(r.number)], ["Reason", (r) => esc(r.reason)]], kinds: (r) => r.verdict },
  brain: { name: "Brain lessons", rows: (s) => s.brain || [], cols: [["Time", (r) => ago(r.at)], ["Dept", (r) => esc(deptName(r.dept))], ["Lesson", (r) => esc(r.text)]], dept: (r) => r.dept },
  workers: { name: "Workers", rows: (s) => (s.departments || []).flatMap((d) => (d.workers || []).map((w) => ({ ...w, dept: d.id }))), cols: [["Name", (r) => `<button class="link" data-d="${esc(r.dept)}" data-w="${esc(r.id)}">${esc(r.name)}</button>`], ["Dept", (r) => esc(deptName(r.dept))], ["Job", (r) => esc(r.job)], ["Status", (r) => `<span class="dot st-${esc(r.status)}"></span>${esc(r.status)}`], ["Power", (r) => esc(r.power)], ["Note", (r) => esc(r.note)]], kinds: (r) => r.status, dept: (r) => r.dept },
  strategies: { name: "Strategies", rows: (s) => s.strategies || [], cols: [["Id", (r) => `<b>${esc(r.id)}</b>`], ["Name", (r) => esc(r.name)], ["Status", (r) => esc(r.status || (r.alive ? "alive" : r.alive === false ? "killed" : D))], ["Trades", (r) => fNum(r.trades)], ["P&L", (r) => fSol(r.pnlSol, true), (r) => cls(r.pnlSol)]] },
};
let dbSel = { t: "trades", q: "", k: "", d: "" };
function dbTab(body, s) {
  const T = DB[dbSel.t];
  const all = T.rows(s);
  const kinds = T.kinds ? [...new Set(all.map(T.kinds).filter(Boolean))] : [];
  const rows = all.filter((r) => (!dbSel.q || JSON.stringify(r).toLowerCase().includes(dbSel.q.toLowerCase())) && (!dbSel.k || (T.kinds && T.kinds(r) === dbSel.k)) && (!dbSel.d || (T.dept && T.dept(r) === dbSel.d)));
  body.innerHTML = `<h2>Database</h2><div class="dbtabs">${Object.entries(DB).map(([k, v]) => `<button data-db="${k}" class="${k === dbSel.t ? "on" : ""}">${v.name} <small>${v.rows(s).length}</small></button>`).join("")}</div>
    <div class="filters"><input type="search" placeholder="Search ${T.name.toLowerCase()}" value="${esc(dbSel.q)}" data-q>
    ${kinds.length ? `<select data-k><option value="">All kinds</option>${kinds.map((k) => `<option ${k === dbSel.k ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>` : ""}
    ${T.dept ? `<select data-dd><option value="">All departments</option>${DEPTS.map(([id, nm]) => `<option value="${id}" ${id === dbSel.d ? "selected" : ""}>${esc(nm)}</option>`).join("")}</select>` : ""}
    <small class="muted">${rows.length} of ${all.length}</small></div>${table(T.cols, rows.slice(0, 400), "No rows")}`;
  body.querySelectorAll("[data-db]").forEach((b) => (b.onclick = () => { dbSel = { t: b.dataset.db, q: "", k: "", d: "" }; dbTab(body, store.state || {}); }));
  const q = body.querySelector("[data-q]"); q.oninput = () => { dbSel.q = q.value; const p = q.selectionStart; dbTab(body, store.state || {}); const n = body.querySelector("[data-q]"); n.focus(); n.setSelectionRange(p, p); };
  const k = body.querySelector("[data-k]"); if (k) k.onchange = () => { dbSel.k = k.value; dbTab(body, store.state || {}); };
  const dd = body.querySelector("[data-dd]"); if (dd) dd.onchange = () => { dbSel.d = dd.value; dbTab(body, store.state || {}); };
  body.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => openWorker(b.dataset.d, b.dataset.w)));
}

// ---------- mode switching ----------
let world = null, worldBusy = false;
export async function setMode(m) {
  if (worldBusy || m === store.mode) return;
  document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
  try { localStorage.setItem("aq-mode", m); } catch {}
  if (m === "world") {
    worldBusy = true; store.mode = "world"; document.body.classList.add("world");
    const ld = h(`<div id="loading"><div class="spin"></div><p>Raising the island…</p></div>`); document.body.appendChild(ld);
    try {
      const mod = await import(/* @vite-ignore */ (window.AQ_WORLD_URL || "/aq/assets/world.js") + "?b=" + encodeURIComponent(BUILD));
      world = await mod.start(document.getElementById("stage"), { store, onState, openWorker, openMenu, dialog, DEPTS, GODS, fmt: { fSol, fPct, fUsd, fNum, ago, esc }, xFeed, flowRow, stratRows, xRows, helpersHtml, BUILD, setMode });
    } catch (e) { console.error(e); dialog(`<h3>World did not load</h3><p>${esc(e.message)}</p><div class="row"><button class="primary" data-x>Back to bot mode</button></div>`, (d, c) => (d.querySelector("[data-x]").onclick = () => { c(); })); store.mode = "world"; worldBusy = false; ld.remove(); return setMode("bot"); }
    ld.remove(); worldBusy = false;
  } else {
    store.mode = "bot"; document.body.classList.remove("world");
    if (world) { try { world.dispose(); } catch (e) { console.error(e); } world = null; }
    renderDash(store.state);
  }
}

// ---------- boot ----------
function boot() {
  document.body.append(topbar(), h(`<div id="offline" hidden>Can't reach the engine. Showing the last data.</div>`), buildDash(), h(`<div id="stage"></div>`));
  onState((s) => { renderTop(s); if (store.mode === "bot") renderDash(s); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector(".dlg-bg")) openMenu(); else if (e.key === "Escape") document.querySelector(".dlg-bg").remove(); });
  poll(); setInterval(poll, 3000); setInterval(() => listeners.forEach((f) => store.state && f(store.state)), 1000 * 15);
  let m = "bot"; try { m = new URLSearchParams(location.search).get("mode") || "bot"; } catch {}
  if (m === "world") setMode("world");
  window.__aq = { store, setMode, openMenu, poll };
}
if (typeof document !== "undefined") boot();
