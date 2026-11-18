// ROBINHOOD card (top of the page): connect the Robinhood agent account, see what Aquarius reads from it, set the limits.
// Reads state.robinhood (engine: src/aq/robinhood.mjs publicState). This build only reads the account: no order is sent.
import { esc, ago, poll, onState, dialog } from "./main.js";
const D = "—", num = (v) => typeof v === "number" && isFinite(v);
const usd = (v) => (num(v) ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : D);
const NUMS = [["maxPerTradeUsd", "Most per trade ($)"], ["maxDailyLossUsd", "Most lost in a day ($)"], ["maxOpenPositions", "Open positions at once"]];
const FLAGS = [["allowStocks", "Stocks"], ["allowCrypto", "Crypto"]];
let key = "", dirty = false, lastAsk = 0;
const post = async (path, body) => { const r = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error((j && j.error && j.error.message) || "HTTP " + r.status); return j; };

export function robinhoodCard() {
  const el = document.createElement("section"); el.id = "rh"; el.className = "rh"; el.hidden = true;
  onState((s) => { try { paint(el, s && s.robinhood); } catch (e) { console.error(e); } });
  return el;
}
function paint(el, r) {
  el.hidden = !r; if (!r) return;
  const k = r.connected ? "on" : "off";
  if (key !== k) { key = k; dirty = false; el.className = "rh " + k; el.innerHTML = r.connected ? onHTML() : offHTML(); wire(el); }
  const set = (id, v) => { const e = el.querySelector("#" + id); if (e && e.textContent !== v) e.textContent = v; };
  set("rh-err", r.lastError ? r.lastError : "");
  if (!r.connected) return;
  const a = r.account || null;
  set("rh-val", a ? usd(a.valueUsd) : D); set("rh-cash", a ? usd(a.cashUsd) : D);
  set("rh-age", r.checkedAt ? `read ${ago(r.checkedAt)} ago` : "reading the account…");
  set("rh-since", r.since ? `connected ${ago(r.since)} ago` : "");
  const P = a && Array.isArray(a.positions) ? a.positions : null, ph = el.querySelector("#rh-pos");
  const html = !a ? `<i>not read yet</i>` : P == null ? `<i>Robinhood's answer had no positions list Aquarius can read yet</i>` : !P.length ? `<i>no open positions</i>`
    : P.map((p) => `<span><b>${esc(p.symbol)}</b>${num(p.quantity) ? ` ${esc(p.quantity)}` : ""}${num(p.valueUsd) ? ` · ${usd(p.valueUsd)}` : ""}</span>`).join("");
  if (ph && ph.dataset.h !== html) { ph.dataset.h = html; ph.innerHTML = html; }
  set("rh-pn", P ? String(P.length) : D);
  const L = r.limits || {};
  if (!dirty && !el.contains(document.activeElement)) {
    for (const [n] of NUMS) { const i = el.querySelector(`[name=${n}]`); if (i && i.value !== String(L[n] ?? 0)) i.value = String(L[n] ?? 0); }
    for (const [n] of FLAGS) { const i = el.querySelector(`[name=${n}]`); if (i) i.checked = !!L[n]; }
  }
  const at = el.querySelector("#rh-auto"); if (at) { at.classList.toggle("on", !!L.autoTrade); at.textContent = L.autoTrade ? "AUTO TRADE ON" : "AUTO TRADE OFF"; at.setAttribute("aria-pressed", L.autoTrade ? "true" : "false"); }
  // the engine refreshes the numbers every 5 minutes; right after connecting (or when they are old) ask once
  if ((!r.checkedAt || Date.now() - new Date(r.checkedAt).getTime() > 120000) && Date.now() - lastAsk > 60000) { lastAsk = Date.now(); fetch("/api/aq/rh/status", { credentials: "same-origin", cache: "no-store" }).then(() => poll()).catch(() => {}); }
}
const offHTML = () => `<div class="rh-h"><b class="rh-tag">ROBINHOOD</b><span>agent account · not connected</span></div>
  <a class="rh-go" href="/api/aq/rh/connect">CONNECT ROBINHOOD</a>
  <p class="rh-n">Opens Robinhood's own sign-in. Aquarius reads the account. Live orders are not built yet.</p><p class="rh-e" id="rh-err"></p>`;
const onHTML = () => `<div class="rh-h"><b class="rh-tag on">ROBINHOOD</b><span>agent account · connected</span><em><span id="rh-age"></span> · <span id="rh-since"></span></em></div>
  <div class="rh-g">
    <div class="rh-k"><div><small>ACCOUNT VALUE</small><b id="rh-val">${D}</b></div><div><small>CASH</small><b id="rh-cash">${D}</b></div><div><small>POSITIONS</small><b id="rh-pn">${D}</b></div></div>
    <div class="rh-pos" id="rh-pos"></div>
    <form class="rh-f" id="rh-form">
      ${NUMS.map(([n, l]) => `<label>${l}<input name="${n}" type="number" inputmode="decimal" min="0" step="${n === "maxOpenPositions" ? 1 : "any"}" value="0"></label>`).join("")}
      <div class="rh-c">${FLAGS.map(([n, l]) => `<label><input name="${n}" type="checkbox"> ${l}</label>`).join("")}</div>
      <button class="primary" type="submit">Save limits</button><span class="msg" id="rh-msg"></span>
    </form>
    <div class="rh-a"><button type="button" id="rh-auto" class="rh-sw" aria-pressed="false">AUTO TRADE OFF</button><i>live orders are not built yet</i><button type="button" id="rh-off" class="ghost">Disconnect</button></div>
  </div><p class="rh-e" id="rh-err"></p>`;
function wire(el) {
  const f = el.querySelector("#rh-form"); if (!f) return;
  const msg = (t, c = "") => { const m = el.querySelector("#rh-msg"); m.textContent = t; m.className = "msg " + c; };
  f.addEventListener("input", () => { dirty = true; msg(""); });
  const read = () => { const o = {}; for (const [n] of NUMS) { const v = f.elements[n].value.trim(); o[n] = v === "" ? NaN : Number(v); } for (const [n] of FLAGS) o[n] = f.elements[n].checked; return o; };
  const send = async (body, done) => { msg("Saving…"); try { await post("/api/aq/rh/limits", body); dirty = false; msg(done, "ok"); await poll(); } catch (e) { msg(e.message, "err"); } };
  f.onsubmit = (e) => { e.preventDefault(); const o = read(); for (const [n, l] of NUMS) if (!(o[n] >= 0)) return msg(`${l}: type a number, 0 or more`, "err"); send(o, "Saved."); };
  el.querySelector("#rh-auto").onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); send({ ...read(), autoTrade: on }, on ? "Auto trade is ON. Live orders are not built yet." : "Auto trade is off."); };
  el.querySelector("#rh-off").onclick = () => dialog(`<h3>Disconnect Robinhood?</h3><p>Aquarius deletes its sign-in and switches auto trade off. Your Robinhood account is not changed.</p><div class="row"><button class="ghost" data-x>Cancel</button><button class="danger" data-ok>Disconnect</button></div><p class="msg"></p>`, (d, close) => {
    d.querySelector("[data-x]").onclick = close;
    d.querySelector("[data-ok]").onclick = async () => { const m = d.querySelector(".msg"); m.textContent = "Sending…"; try { await post("/api/aq/rh/disconnect"); close(); poll(); } catch (e2) { m.textContent = "Not sent: " + e2.message; } };
  });
}
