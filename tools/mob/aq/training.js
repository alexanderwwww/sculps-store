// TRAINING MODE: the header switch, the headline band under the top bar, and the TRAINING ARENA card.
// While training is ON the headline is the 1,000 SOL training wallet with TRADES / WON / LOST / per minute and a trade tape;
// the 10 SOL book moves to a smaller second line (it is a separate ledger and keeps running). While OFF the headline shows the
// main book's own TRADES / WON / LOST.
// The engine resolves a batch of virtual trades once a minute (a Worker timer cannot fire faster). So that the numbers do
// not jump once a minute, the counters run from the previous minute's totals up to the latest ones over the minute, and
// the tape shows that batch trade by trade. Nothing shown is ever above what the engine has resolved.
import { esc, ago, poll, store } from "./main.js";
const D = "—", num = (v) => typeof v === "number" && isFinite(v);
const int = (v) => (num(v) ? Math.floor(v).toLocaleString("en-US") : D), pct = (v, d = 2) => (num(v) ? (v > 0 ? "+" : "") + v.toFixed(d) + "%" : D), cls = (v) => (num(v) ? (v > 0 ? "up" : v < 0 ? "dn" : "") : "");
const sol = (v, d = 2) => (num(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : D);
export const trainingOn = (s) => !!(s && s.training && s.training.on === true);
// how far through the minute after the last batch we are (0..1): what share of that batch the counters have run through
const frac = (t) => { const a = t && t.lastTickAt ? (Date.now() - new Date(t.lastTickAt).getTime()) / 55000 : 1; return t && t.on ? Math.max(0, Math.min(1, a)) : 1; };
const run = (prev, cur, f) => (num(cur) ? (num(prev) && prev <= cur ? prev + (cur - prev) * f : cur) : null);

// ---------- headline band (under the top bar, both states) ----------
export function trainingHero() { const el = document.createElement("section"); el.id = "t-hero"; el.className = "hero"; el.hidden = true; setInterval(() => { try { paintHero(store.state); } catch (e) { console.error(e); } }, 70); return el; }
let heroKey = "", lastWal = null, flashT = 0;
function paintHero(s) {
  const el = document.getElementById("t-hero"); if (!el) return; el.hidden = !s; if (!s) return;
  const t = s.training || null, on = trainingOn(s), T = s.trades || {}, key = on ? "on" : "off";
  if (heroKey !== key) { heroKey = key; el.className = "hero " + key;
    el.innerHTML = on ? `<div class="hr-top"><b class="hr-tag">TRAINING MODE ON</b><span>training wallet, separate from the main paper book · virtual trades on real 1-minute candles · bad trades welcome</span><em id="h-age"></em></div>
      <div class="hr-big"><div class="hw"><small>TRAINING WALLET</small><b id="h-wal">${D}</b><i id="h-wsub"></i></div><div><small>TRADES</small><b id="h-n">${D}</b></div><div class="won"><small>WON</small><b id="h-w">${D}</b></div><div class="lost"><small>LOST</small><b id="h-l">${D}</b></div><div><small>WIN RATE</small><b id="h-wr">${D}</b></div><div><small>TRADES / MIN</small><b id="h-pm">${D}</b><i id="h-pmsub"></i></div></div>
      <svg class="hr-line" id="h-line" viewBox="0 0 600 60" preserveAspectRatio="none"><polyline id="h-poly" fill="none" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg><div class="hr-tape" id="h-tape"></div><div class="hr-main" id="h-main"></div>`
      : `<div class="hr-top"><b class="hr-tag main">PAPER BOOK</b><span>the main paper wallet</span></div>
      <div class="hr-big"><div class="hw"><small>WALLET</small><b id="h-wal">${D}</b><i id="h-wsub"></i></div><div><small>TRADES</small><b id="h-n">${D}</b></div><div class="won"><small>WON</small><b id="h-w">${D}</b></div><div class="lost"><small>LOST</small><b id="h-l">${D}</b></div><div><small>WIN RATE</small><b id="h-wr">${D}</b></div><div><small>OPEN NOW</small><b id="h-pm">${D}</b></div></div>`; }
  const set = (id, v, c) => { const e = document.getElementById(id); if (e && e.textContent !== v) e.textContent = v; if (e && c != null && e.className !== c) e.className = c; };
  const mainLine = `Main paper book: ${sol(s.equitySol, 3)} SOL · ${int(T.n)} trades · ${int(T.wins)} won · ${num(T.n) && num(T.wins) ? int(T.n - T.wins) : D} lost · ${Array.isArray(s.positions) ? s.positions.length : D} open`;
  if (!on) { set("h-wal", sol(s.equitySol, 3) + " SOL"); set("h-wsub", num(s.startSol) ? `started at ${sol(s.startSol, 0)} SOL` : ""); set("h-n", int(T.n)); set("h-w", int(T.wins)); set("h-l", num(T.n) && num(T.wins) ? int(T.n - T.wins) : D); set("h-wr", num(T.winRate) ? (T.winRate * 100).toFixed(1) + "%" : D); set("h-pm", Array.isArray(s.positions) ? String(s.positions.length) : D); return; }
  // the wallet steps through the batch the server resolved: walletPath is the real balance after each part of it, in order
  const f = frac(t), n = run(t.prevTradesTotal, t.trades, f), w = run(t.prevWins, t.wins, f), P = Array.isArray(t.walletPath) ? t.walletPath : [], pi = Math.min(P.length, Math.floor(f * P.length));
  const wal = P.length ? (pi === 0 ? (num(t.prevWalletSol) ? t.prevWalletSol : P[0]) : P[pi - 1]) : t.walletSol;
  const we = document.getElementById("h-wal"), txt = sol(wal, 4) + " SOL";
  if (we && we.textContent !== txt) { const up = num(lastWal) ? wal > lastWal : null; we.textContent = txt; if (up != null && wal !== lastWal) { we.className = up ? "fu" : "fd"; clearTimeout(flashT); flashT = setTimeout(() => { we.className = ""; }, 420); } lastWal = wal; }
  set("h-wsub", `started at ${sol(t.startSol, 0)} SOL · ${Array.isArray(t.sizeRange) ? t.sizeRange.join(" to ") : t.sizeSol} SOL a trade · last minute ${num(t.batchPnlSol) ? (t.batchPnlSol > 0 ? "+" : "") + t.batchPnlSol.toFixed(3) + " SOL" : D}`);
  // the equity line: one point a minute, then the minute now playing, point by point
  { const pts = (Array.isArray(t.equityLine) ? t.equityLine.slice(0, -1).map((x) => x.w) : []).concat(num(t.prevWalletSol) ? [t.prevWalletSol] : [], P.slice(0, pi)).filter(num).slice(-240), poly = document.getElementById("h-poly");
    if (poly && pts.length > 1) { const lo = Math.min(...pts), hi = Math.max(...pts), sp = hi - lo || 1, d = pts.map((v, i) => `${((i / (pts.length - 1)) * 600).toFixed(1)},${(56 - ((v - lo) / sp) * 52).toFixed(1)}`).join(" "); if (poly.getAttribute("points") !== d) { poly.setAttribute("points", d); poly.setAttribute("stroke", pts.at(-1) >= pts[0] ? "#4ade80" : "#f87171"); } } }
  set("h-n", int(n)); set("h-w", int(w)); set("h-l", num(n) && num(w) ? int(n - w) : D); set("h-wr", num(n) && n > 0 && num(w) ? ((w / n) * 100).toFixed(1) + "%" : D);
  set("h-pm", int(t.perMin)); set("h-pmsub", num(t.perMinuteLive) ? `${int(t.perMinuteLive)} fresh · ${int(t.perMinuteReplay)} replay${num(t.targetPerMin) ? ` · set to ${int(t.targetPerMin)}` : ""}` : "");
  set("h-age", t.lastTickAt ? `last batch ${ago(t.lastTickAt)} ago · ${int(t.coins)} coins · ${int(t.variants)} settings` : "waiting for the first batch");
  { const g = (Array.isArray(t.grok) ? t.grok : []).find((x) => x.input === "grok_trade"); set("h-main", mainLine + (g ? `   ·   GROK's own trades: ${int(g.trades)} · ${int(g.won)} won · ${int(g.lost)} lost` : "   ·   GROK: no trade of his own resolved yet (a pick resolves 47 minutes after he sends it)")); }
  // the tape: the last batch, one more trade every quarter second, newest on top
  const tape = Array.isArray(t.tape) ? t.tape : [], shown = tape.slice(0, Math.max(0, Math.min(tape.length, Math.ceil(f * tape.length)))).slice(-20).reverse();
  const html = shown.length ? shown.map((x) => `<span class="${cls(x.pnlPct)}"><b>${esc(x.symbol)}</b> ${esc(String(x.variant).replace(/\|/g, " "))} <u>${pct(x.pnlPct)}${num(x.pnlSol) ? ` · ${x.pnlSol > 0 ? "+" : ""}${x.pnlSol.toFixed(4)} SOL` : ""}</u></span>`).join("") : `<span class="mut">${esc(t.note || "waiting for the first batch")}</span>`;
  const tp = document.getElementById("h-tape"); if (tp && tp.dataset.h !== html) { tp.innerHTML = html; tp.dataset.h = html; }
}

// ---------- the card (leaders, laggards, Grok, graduates) ----------
export function trainingHTML() { return `<section class="p arena" id="d-arena" hidden><div class="ph"><b>TRAINING ARENA</b><span>its own 1,000 SOL paper wallet and ledger · virtual trades on real candles · never mixed into the main book</span><em id="t-st"></em></div><div id="t-body"></div></section>`; }
let last = "";
export function renderTraining(root, s) {
  const el = root.querySelector("#d-arena"); if (!el) return; const t = s && s.training && typeof s.training === "object" ? s.training : null; el.hidden = !t; if (!t) return;
  const on = trainingOn(s), st = `${on ? "ON" : "OFF"}${t.since ? " · since " + ago(t.since) + " ago" : ""}`;
  const tile = (k, v, sub = "", c = "") => `<div><small>${k}</small><b class="${c}">${v}</b>${sub ? `<i>${sub}</i>` : ""}</div>`;
  const row = (x, i) => `<div class="ar-l"><span>${i + 1}</span><b title="${esc(x.rule || "")}">${esc(x.name || x.variant)}${x.graduated ? `<u>GRADUATED</u>` : ""}</b><span>${int(x.n)}</span><span class="${cls(x.expectancyPct ?? x.meanPct)}">${pct(x.expectancyPct ?? x.meanPct)}</span><span class="${cls(x.vsRandomPct ?? x.edgePct)}">${pct(x.vsRandomPct ?? x.edgePct)}</span></div>`;
  const head = `<div class="ar-l hd"><span>#</span><b>SETTING</b><span>TRADES</span><span>PER TRADE</span><span>vs RANDOM</span></div>`;
  const L = Array.isArray(t.leaders) ? t.leaders.slice(0, 5) : [], B = Array.isArray(t.laggards) ? t.laggards.slice(0, 5) : [], G = Array.isArray(t.grok) ? t.grok : [], R = t.replay || null;
  const html = `<div class="ar-k">${tile("TRADES", int(t.trades))}${tile("WON", int(t.wins), "", "up")}${tile("LOST", int(t.losses), "", "dn")}${tile("WIN RATE", num(t.winRate) ? (t.winRate * 100).toFixed(1) + "%" : D)}${tile("WALLET", sol(t.walletSol, 2) + " SOL", `started at ${sol(t.startSol, 0)}`)}${tile("RANDOM BASELINE", `<span class="${cls(t.random && t.random.expectancyPct)}">${pct(t.random && t.random.expectancyPct)}</span>`, "per trade, after costs")}
      ${tile("FRESH MINUTES", int(t.liveTrades), "trades since the switch")}${tile("REPLAY", int(t.replayTrades), R && R.from ? `history back to ${esc(R.from)}` : "real past candles")}${tile("SETTINGS TRIED", int(t.variants), "some lead by luck")}${tile("GRADUATED", int(Array.isArray(t.graduated) ? t.graduated.length : 0), "won again on a fresh day")}${tile("WAITING", int(Array.isArray(t.pending) ? t.pending.length : 0), "picked, not yet confirmed")}${tile("BATCH", num(t.tickMs) ? (t.tickMs / 1000).toFixed(1) + " s" : D, `${int(t.coinsReadThisTick)} coins read`)}</div>
    <div class="ar-2"><div><div class="ar-h">TOP 5 vs RANDOM</div>${L.length ? head + L.map(row).join("") : `<p class="empty">${on ? "no leaders yet" : "training is off"}</p>`}</div>
    <div><div class="ar-h">BOTTOM 5: RULES THAT COST MONEY</div>${B.length ? head + B.map(row).join("") : `<p class="empty">${on ? "nothing yet" : "training is off"}</p>`}</div></div>
    <div class="ar-h">GROK IN THE ARENA · trades · won / lost · per trade</div>${G.length ? G.map((g) => `<div class="ar-l"><span></span><b>${esc(g.rule || g.input)}</b><span>${int(g.n)}</span><span><i class="up">${int(g.won)}</i> / <i class="dn">${int(g.lost)}</i></span><span class="${cls(g.meanPct)}">${pct(g.meanPct)}</span></div>`).join("") : `<p class="empty">no trade has started from a Grok pick, vote or X post yet</p>`}
    <p class="ar-n">${esc(t.note || "")} · ${esc(t.resolution || "")}</p>`;
  const se = el.querySelector("#t-st"); if (se.textContent !== st) { se.textContent = st; se.className = on ? "up" : ""; }
  if (html !== last) { el.querySelector("#t-body").innerHTML = html; last = html; }
}

// ---------- header switch: one click toggles it ----------
let busy = false;
export function trainingButton() { const b = document.createElement("button"); b.id = "train"; b.className = "train"; b.hidden = true; b.onclick = toggle; return b; }
export function renderTrainingButton(s) {
  const b = document.getElementById("train"); if (!b) return; const has = !!(s && s.training != null); b.hidden = !has; if (!has || busy) return; const on = trainingOn(s);
  const html = `<span>TRAINING MODE</span><i class="sw"><u></u></i><b>${on ? "ON" : "OFF"}</b>`; if (b.dataset.h !== html) { b.innerHTML = html; b.dataset.h = html; }
  b.classList.toggle("on", on); b.title = on ? "Training mode is ON. Click to turn it off." : "Training mode is OFF. Click to turn it on.";
}
async function toggle() {
  const b = document.getElementById("train"); if (!b || busy) return; const on = !trainingOn(store.state); busy = true; b.classList.add("busy"); b.querySelector("b").textContent = on ? "ON…" : "OFF…";
  try { const r = await fetch("/api/aq/training", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ on }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || "HTTP " + r.status);
    if (store.state && j.training) store.state.training = j.training; }
  catch (e) { b.title = "Not switched: " + e.message; b.querySelector("b").textContent = "FAILED"; await new Promise((r) => setTimeout(r, 1500)); }
  busy = false; b.classList.remove("busy"); b.dataset.h = ""; renderTrainingButton(store.state); poll();
}
