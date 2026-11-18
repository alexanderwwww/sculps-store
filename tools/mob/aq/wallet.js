// AQUARIUS WALLET card (beside ROBINHOOD): the Solana wallet made on the Aquarius server. Reads state.solWallet
// (engine: src/aq/wallet.mjs walletPublic). It shows the public address and balances only; the key never reaches the page.
import { esc, ago, poll, onState } from "./main.js";
const D = "—", num = (v) => typeof v === "number" && isFinite(v);
const sol = (v) => (num(v) ? v.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + " SOL" : D);
const amt = (v) => (num(v) ? v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 2 }) : D);
const short = (m) => (m && m.length > 12 ? m.slice(0, 4) + "…" + m.slice(-4) : m || D);
const NUMS = [["maxPerTradeSol", "Most per trade (SOL)"], ["maxDailyLossSol", "Most lost in a day (SOL)"], ["maxOpenPositions", "Open positions at once"]];
let key = "", dirty = false, lastAsk = 0;
const post = async (path, body) => { const r = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error((j && j.error && j.error.message) || "HTTP " + r.status); return j; };

export function walletCard() {
  const el = document.createElement("section"); el.id = "wl"; el.className = "rh wl"; el.hidden = true;
  onState((s) => { try { paint(el, s && s.solWallet); } catch (e) { console.error(e); } });
  return el;
}
function paint(el, w) {
  el.hidden = !w; if (!w) return;
  const k = w.exists ? "on" : "off";
  if (key !== k) { key = k; dirty = false; el.className = "rh wl " + k; el.innerHTML = w.exists ? onHTML() : offHTML(); wire(el); }
  const set = (id, v) => { const e = el.querySelector("#" + id); if (e && e.textContent !== v) e.textContent = v; };
  set("wl-err", w.lastError ? w.lastError : "");
  if (!w.exists) return;
  set("wl-addr", w.address || D); set("wl-sol", w.checkedAt ? sol(w.sol) : D);
  set("wl-age", w.checkedAt ? `read ${ago(w.checkedAt)} ago` : "reading the balances…");
  const T = Array.isArray(w.tokens) ? w.tokens : null, th = el.querySelector("#wl-tok");
  const html = !T ? `<i>not read yet</i>` : !T.length ? `<i>no coins in the wallet</i>` : T.map((t) => `<span title="${esc(t.mint)}"><b>${esc(short(t.mint))}</b> ${esc(amt(t.amount))}</span>`).join("");
  if (th && th.dataset.h !== html) { th.dataset.h = html; th.innerHTML = html; }
  set("wl-tn", T ? String(T.length) : D);
  const L = w.limits || {};
  if (!dirty && !el.contains(document.activeElement)) for (const [n] of NUMS) { const i = el.querySelector(`[name=${n}]`); if (i && i.value !== String(L[n] ?? 0)) i.value = String(L[n] ?? 0); }
  const at = el.querySelector("#wl-auto"); if (at) { at.classList.toggle("on", !!L.autoTrade); at.textContent = L.autoTrade ? "AUTO TRADE ON" : "AUTO TRADE OFF"; at.setAttribute("aria-pressed", L.autoTrade ? "true" : "false"); }
  if ((!w.checkedAt || Date.now() - new Date(w.checkedAt).getTime() > 120000) && Date.now() - lastAsk > 60000) { lastAsk = Date.now(); fetch("/api/aq/wallet", { credentials: "same-origin", cache: "no-store" }).then(() => poll()).catch(() => {}); }
}
const offHTML = () => `<div class="rh-h"><b class="rh-tag">AQUARIUS WALLET</b><span>Solana · not created</span></div>
  <button type="button" class="rh-go wl-go" id="wl-create">CREATE WALLET</button>
  <p class="rh-n">Aquarius makes its own Solana wallet on the server and shows you its address. Live orders are not built yet.</p><p class="rh-e" id="wl-err"></p>`;
const onHTML = () => `<div class="rh-h"><b class="rh-tag on wl-t">AQUARIUS WALLET</b><span>Solana · on the Aquarius server</span><em id="wl-age"></em></div>
  <div class="rh-g">
    <div class="wl-a"><code id="wl-addr">${D}</code><button type="button" class="ghost" id="wl-copy">Copy</button></div>
    <div class="rh-k"><div><small>SOL</small><b id="wl-sol">${D}</b></div><div><small>COINS</small><b id="wl-tn">${D}</b></div></div>
    <div class="rh-pos" id="wl-tok"></div>
    <form class="rh-f" id="wl-form">
      ${NUMS.map(([n, l]) => `<label>${l}<input name="${n}" type="number" inputmode="decimal" min="0" step="${n === "maxOpenPositions" ? 1 : "any"}" value="0"></label>`).join("")}
      <button class="primary" type="submit">Save limits</button><span class="msg" id="wl-msg"></span>
    </form>
    <div class="rh-a"><button type="button" id="wl-auto" class="rh-sw" aria-pressed="false">AUTO TRADE OFF</button><i>live orders are not built yet</i></div>
  </div><p class="rh-e" id="wl-err"></p>`;
function wire(el) {
  const c = el.querySelector("#wl-create");
  if (c) c.onclick = async () => { c.disabled = true; c.textContent = "CREATING…"; try { await post("/api/aq/wallet/create"); } catch (e) { const m = el.querySelector("#wl-err"); if (m) m.textContent = e.message; c.disabled = false; c.textContent = "CREATE WALLET"; } await poll(); };
  const f = el.querySelector("#wl-form"); if (!f) return;
  const msg = (t, cl = "") => { const m = el.querySelector("#wl-msg"); m.textContent = t; m.className = "msg " + cl; };
  el.querySelector("#wl-copy").onclick = async (e) => { const b = e.currentTarget, a = el.querySelector("#wl-addr").textContent;
    try { await navigator.clipboard.writeText(a); b.textContent = "Copied"; } catch { const r = document.createRange(); r.selectNodeContents(el.querySelector("#wl-addr")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected"; }
    setTimeout(() => { b.textContent = "Copy"; }, 1500); };
  f.addEventListener("input", () => { dirty = true; msg(""); });
  const read = () => { const o = {}; for (const [n] of NUMS) { const v = f.elements[n].value.trim(); o[n] = v === "" ? NaN : Number(v); } return o; };
  const send = async (body, done) => { msg("Saving…"); try { await post("/api/aq/wallet/limits", body); dirty = false; msg(done, "ok"); await poll(); } catch (e) { msg(e.message, "err"); } };
  f.onsubmit = (e) => { e.preventDefault(); const o = read(); for (const [n, l] of NUMS) if (!(o[n] >= 0)) return msg(`${l}: type a number, 0 or more`, "err"); send(o, "Saved."); };
  el.querySelector("#wl-auto").onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); send({ ...read(), autoTrade: on }, on ? "Auto trade is ON. Live orders are not built yet." : "Auto trade is off."); };
}
