// WALLETS dock: one slim bar fixed to the bottom of the screen (Alex: "put them on bottom"). It only SHOWS what the two
// cards already know and opens them in a drawer that slides up from the bar; the cards themselves (aq/phantom.js,
// aq/wallet.js) keep every control and every behaviour, unchanged. Robinhood is not shown (his account is Robinhood
// Europe; the agent link is US-only). Motion: numbers roll to their new value; everything else is CSS transform/opacity.
import { esc, onState, store } from "./main.js";
import { phantomCard, phantomConnect } from "./phantom.js";
import { walletCard } from "./wallet.js";
import { chips, panelHTML, manual, watchOrders } from "./livepos.js";
const D = "—", num = (v) => typeof v === "number" && isFinite(v);
const px = (v) => (num(v) ? "$" + (v >= 1 ? v.toFixed(4) : v.toPrecision(4)) : D);
const short = (m) => (m && m.length > 12 ? m.slice(0, 4) + "…" + m.slice(-4) : m || D);
const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- rolling numbers: one rAF loop for all of them, only text changes, no layout reads
const rolls = new Map(); let raf = 0;
function roll(el, to, fmt, cls) {
  if (!el) return;
  if (cls != null && el.dataset.c !== cls) { el.dataset.c = cls; el.className = cls; }
  if (!num(to)) { rolls.delete(el); el.dataset.v = ""; if (el.textContent !== D) el.textContent = D; return; }
  const from = num(Number(el.dataset.v)) && el.dataset.v !== "" ? Number(el.dataset.v) : null;
  el.dataset.v = String(to);
  if (from == null || from === to || reduce) { rolls.delete(el); el.textContent = fmt(to); return; }
  rolls.set(el, { from, to, fmt, t0: performance.now() });
  el.classList.add("rolling"); if (!raf) raf = requestAnimationFrame(tick);
}
function tick(now) {
  for (const [el, r] of rolls) {
    const k = Math.min(1, (now - r.t0) / 700), e = 1 - Math.pow(1 - k, 3);
    el.textContent = r.fmt(r.from + (r.to - r.from) * e);
    if (k >= 1) { rolls.delete(el); el.classList.remove("rolling"); }
  }
  raf = rolls.size ? requestAnimationFrame(tick) : 0;
}
const fSol = (d) => (v) => v.toFixed(d) + " SOL", fSgn = (v) => (v > 0 ? "+" : "") + v.toFixed(4) + " SOL";
const sgnCls = (v) => (num(v) ? (v > 0 ? "up" : v < 0 ? "dn" : "") : "");

// ---------- the drawer: the two full cards, one at a time, sliding up from the dock
let drawer, cards = {};
function openDrawer(tab) {
  drawer.dataset.tab = tab; drawer.hidden = false;
  requestAnimationFrame(() => drawer.classList.add("open"));
  drawer.querySelectorAll(".dw-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
  drawer.querySelector(".dw-body").scrollTop = 0;
}
function closeDrawer() { drawer.classList.remove("open"); setTimeout(() => { if (!drawer.classList.contains("open")) drawer.hidden = true; }, 260); }

export function walletsDock() {
  cards = { phantom: phantomCard(), wallet: walletCard() };
  drawer = document.createElement("div"); drawer.className = "dw"; drawer.hidden = true;
  drawer.innerHTML = `<div class="dw-bg"></div><div class="dw-p" role="dialog" aria-label="Wallets"><div class="dw-h"><div class="dw-tabs"><button data-t="live">Live</button><button data-t="wallet">Aquarius wallet</button><button data-t="phantom">Phantom</button></div><button class="ghost dw-x" title="Close (Esc)">Close</button></div><div class="dw-body"></div></div>`;
  const lv = document.createElement("section"); lv.id = "lv"; lv.className = "rh lvp"; cards.live = lv;
  drawer.querySelector(".dw-body").append(lv, cards.wallet, cards.phantom);
  drawer.addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b && lv.contains(b)) manual(b, lv); });
  drawer.querySelector(".dw-bg").onclick = closeDrawer; drawer.querySelector(".dw-x").onclick = closeDrawer;
  drawer.querySelectorAll(".dw-tabs button").forEach((b) => (b.onclick = () => openDrawer(b.dataset.t)));
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden && !document.querySelector(".dlg-bg")) { e.stopImmediatePropagation(); closeDrawer(); } }, true);

  const bar = document.createElement("section"); bar.id = "dock"; bar.className = "dock";
  bar.innerHTML = `<div class="dk-sig" id="dk-sig"></div>
    <div class="dk-row">
      <div class="dk-w" id="dk-ph"><b class="dk-t ph">PHANTOM</b><span class="dk-off"><button class="ghost dk-btn" id="dk-connect">Connect Phantom</button><i class="dk-msg" data-msg></i></span>
        <span class="dk-on"><code id="dk-ph-a">${D}</code><span class="dk-k"><small>SOL</small><b id="dk-ph-sol">${D}</b></span><span class="dk-k"><small>COINS</small><b id="dk-ph-n">${D}</b></span><span class="dk-k"><small>P&amp;L</small><b id="dk-ph-pnl">${D}</b></span></span></div>
      <div class="dk-w" id="dk-aq"><b class="dk-t aq">AQUARIUS WALLET</b><span class="dk-none">not created</span>
        <span class="dk-on"><code id="dk-aq-a">${D}</code><button class="dk-copy" id="dk-copy" title="Copy the address">⧉</button><span class="dk-k"><small>SOL</small><b id="dk-aq-sol">${D}</b></span><span class="dk-k"><small>LIVE TODAY</small><b id="dk-aq-pnl">${D}</b></span><span class="dk-k"><small>LIVE</small><b id="dk-aq-n">${D}</b></span><span class="pill" id="dk-auto">AUTO OFF</span></span></div>
      <div class="dk-lc" id="dk-lc"></div><div class="dk-act"><button class="ghost dk-btn" id="dk-trade" hidden>Trade</button><button class="ghost dk-btn" id="dk-fund">Fund</button><button class="ghost dk-btn" id="dk-set">Settings</button></div>
    </div>`;
  bar.querySelector("#dk-connect").onclick = () => phantomConnect(bar);
  bar.querySelector("#dk-trade").onclick = () => openDrawer("phantom");
  bar.querySelector("#dk-set").onclick = () => openDrawer("wallet");
  bar.querySelector("#dk-aq").addEventListener("click", (e) => { if (!e.target.closest("button")) openDrawer("live"); });
  // Fund: from Phantom when it is connected (its FUND form), else the wallet's address to send to from anywhere
  bar.querySelector("#dk-fund").onclick = () => { const ph = store.state && store.state.phantom; openDrawer(ph && ph.connected ? "phantom" : "wallet"); setTimeout(() => { const f = drawer.querySelector(ph && ph.connected ? "#ph-fund" : ".wl-a"); if (f) f.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }); }, 280); };
  bar.querySelector("#dk-copy").onclick = async (e) => { const b = e.currentTarget, a = (store.state && store.state.solWallet && store.state.solWallet.address) || ""; try { await navigator.clipboard.writeText(a); b.textContent = "✓"; } catch { b.textContent = "!"; } setTimeout(() => { b.textContent = "⧉"; }, 1400); };
  bar.addEventListener("click", (e) => {
    const m = e.target.closest("[data-m]"); if (m) { e.stopPropagation(); m.dataset.def = String((store.state && store.state.solWallet && store.state.solWallet.limits && store.state.solWallet.limits.maxPerTradeSol) || ""); return manual(m, bar); }
    const c = e.target.closest("[data-pos]"); if (c) { openDrawer("live"); setTimeout(() => { const t = drawer.querySelector("#lp-" + c.dataset.pos); if (t) t.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" }); }, 280); return; } });
  bar.addEventListener("keydown", (e) => { const c = e.target.closest && e.target.closest("[data-pos]"); if (c && e.key === "Enter") c.click(); });
  bar.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (!b) return; openDrawer("phantom"); setTimeout(() => { const t = drawer.querySelector(b.dataset.go); if (t) t.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }); }, 280); });
  onState((s) => { try { paint(bar, s); } catch (err) { console.error(err); } });
  const wrap = document.createElement("div"); wrap.append(bar, drawer); return wrap;
}
function paint(bar, s) {
  bar.hidden = !s; if (!s) return;
  const ph = s.phantom || {}, w = s.solWallet || {}, live = w.live || {}, $ = (id) => bar.querySelector("#" + id);
  bar.querySelector("#dk-ph").classList.toggle("on", !!ph.connected);
  if (ph.connected) {
    const a = $("dk-ph-a"); if (a.textContent !== short(ph.address)) { a.textContent = short(ph.address); a.title = ph.address; }
    roll($("dk-ph-sol"), ph.sol, fSol(3)); roll($("dk-ph-n"), (ph.positions || []).length, (v) => String(Math.round(v))); roll($("dk-ph-pnl"), ph.pnlSol, fSgn, sgnCls(ph.pnlSol));
  }
  $("dk-trade").hidden = !ph.connected;
  bar.querySelector("#dk-aq").classList.toggle("on", !!w.exists);
  if (w.exists) {
    const a = $("dk-aq-a"); if (a.textContent !== short(w.address)) { a.textContent = short(w.address); a.title = w.address; }
    roll($("dk-aq-sol"), w.sol, fSol(3)); roll($("dk-aq-pnl"), live.pnlTodaySol, fSgn, sgnCls(live.pnlTodaySol)); roll($("dk-aq-n"), (live.positions || []).length, (v) => String(Math.round(v)));
    const on = !!(w.limits && w.limits.autoTrade), p = $("dk-auto"); if (p.classList.contains("on") !== on) { p.classList.toggle("on", on); p.textContent = on ? "AUTO ON" : "AUTO OFF"; }
  }
  // live positions: chips on the bar (max 3), the full panel + tape in the drawer's LIVE tab, a toast when an order confirms
  const ch = chips(live), lc = $("dk-lc"); if (lc.dataset.h !== ch) { lc.dataset.h = ch; lc.innerHTML = ch; }
  const lp = panelHTML(live, w.limits), lv = cards.live; if (lv && lv.dataset.h !== lp && !lv.contains(document.activeElement)) { lv.dataset.h = lp; lv.innerHTML = lp; }
  watchOrders(live);
  // signals: on the dock itself, impossible to miss
  const sig = ph.connected && ph.signal, sells = ph.connected ? (ph.positions || []).filter((x) => x.sellNow) : [], live2 = (live.positions || []).filter((x) => x.status === "stuck");
  const html = (sig ? `<div class="dk-b buy"><b>SIGNAL · buy ${esc(sig.symbol)}</b><span>zone ${esc(px(sig.zone && sig.zone[0]))}–${esc(px(sig.zone && sig.zone[1]))} · stop ${esc(px(sig.stop))} · targets ${esc(px(sig.t1))} / ${esc(px(sig.t2))}</span><button class="primary" data-go="#ph-buy">Open</button></div>` : "")
    + sells.map((x) => `<div class="dk-b sell"><b>SELL NOW · ${esc(x.symbol)}</b><span>${esc(x.sellNow)}</span><button class="danger" data-go="#ph-ban">Open</button></div>`).join("")
    + live2.map((x) => `<div class="dk-b sell"><b>STUCK · ${esc(x.symbol)}</b><span>could not be sold: SELL ALL LIVE in Settings</span></div>`).join("");
  const box = $("dk-sig"); if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
  document.body.classList.add("has-dock");
}
