// AQUARIUS WALLET card (beside ROBINHOOD): the Solana wallet made on the Aquarius server. Reads state.solWallet
// (engine: src/aq/wallet.mjs walletPublic). It shows the public address and balances only; the key never reaches the page.
import { esc, ago, poll, onState, dialog } from "./main.js";
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
  paintLive(el, w.live || null, L); paintPayout(el, w);
  if ((!w.checkedAt || Date.now() - new Date(w.checkedAt).getTime() > 120000) && Date.now() - lastAsk > 60000) { lastAsk = Date.now(); fetch("/api/aq/wallet", { credentials: "same-origin", cache: "no-store" }).then(() => poll()).catch(() => {}); }
}
const sgn = (v, d = 4) => (num(v) ? (v > 0 ? "+" : "") + v.toFixed(d) + " SOL" : D);
function paintLive(el, lv, L) {
  const set = (id, v, c) => { const e = el.querySelector("#" + id); if (e && e.textContent !== v) e.textContent = v; if (e && c != null && e.className !== c) e.className = c; };
  const put = (id, html) => { const e = el.querySelector("#" + id); if (e && e.dataset.h !== html) { e.dataset.h = html; e.innerHTML = html; } };
  set("wl-auto-n", L.autoTrade ? "trading real SOL inside these limits" : lv && lv.autoOff && lv.autoOff.why && Date.now() - new Date(lv.autoOff.at).getTime() < 86400000 ? lv.autoOff.why : "off: no new buys. Open live positions still exit on their stop and their clock.");
  if (!lv) { set("wl-rule", "the engine has not sent the live book yet"); return; }
  set("wl-rule", `${lv.rule} · this rule is NOT proven after costs: small size only`);
  set("wl-pnl", sgn(lv.pnlTodaySol), num(lv.pnlTodaySol) ? (lv.pnlTodaySol > 0 ? "up" : lv.pnlTodaySol < 0 ? "dn" : "") : "");
  const P = lv.positions || []; set("wl-ln", String(P.length));
  put("wl-lpos", P.length ? P.map((p) => `<span><b>${esc(p.symbol || short(p.mint))}</b> ${p.status === "open" ? `${num(p.costSol) ? p.costSol.toFixed(4) : D} SOL in${num(p.valueSol) ? ` · now ${p.valueSol.toFixed(4)}` : ""}${p.timeExitAt ? ` · sells ${new Date(p.timeExitAt).toLocaleTimeString("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" })}` : ""}` : esc(p.status === "opening" ? "buying…" : p.status === "closing" ? "selling…" : "could not be sold: press SELL ALL LIVE")}</span>`).join("") : `<i>no live positions</i>`);
  const O = lv.orders || [];
  put("wl-lord", O.length ? O.map((o) => `<div class="o-${esc(o.status)}"><b>${esc(String(o.side).toUpperCase())} ${esc(o.symbol || "")}</b><span>${esc(o.status)}${num(o.sol) ? ` · ${sgn(o.sol)}` : ""}${o.error ? ` · ${esc(o.error)}` : o.reason ? ` · ${esc(o.reason)}` : ""}</span><em>${ago(o.at)} ago</em>${o.signature ? `<a href="https://solscan.io/tx/${encodeURIComponent(o.signature)}" target="_blank" rel="noopener noreferrer">Solscan</a>` : ""}</div>`).join("") : `<div><span>no live orders yet</span></div>`);
  const r = lv.lastRefusal; set("wl-ref", r ? `Last trade refused ${ago(r.at)} ago: ${r.reason}${r.symbol ? ` (${r.symbol})` : ""}` : "No trade has been refused yet.");
}
let poDirty = false;
function paintPayout(el, w) {
  const p = w.payout || null, a = el.querySelector("#wl-pof [name=address]");
  if (a && !poDirty && document.activeElement !== a && a.value !== (p ? p.address : "")) a.value = p ? p.address : "";
  const m = el.querySelector("#wl-pomsg");
  if (m && !poDirty && !m.dataset.busy) { const t = !p ? "No payout address yet. Withdrawals only ever go to the address saved here." : p.lockedUntil ? `Address changed: withdrawals open again ${new Date(p.lockedUntil).toLocaleString("en-GB", { timeZone: "Europe/Athens", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} Athens time.` : "Saved. Changing it later locks withdrawals for 24 hours."; if (m.textContent !== t) { m.textContent = t; m.className = "msg" + (p && p.lockedUntil ? " err" : ""); } }
  const bk = el.querySelector("#wl-bk"), bt = w.backup ? (w.backup.ok ? "wallet key: second copy checked" : `wallet key: ${w.backup.note}`) : ""; if (bk && bk.textContent !== bt) bk.textContent = bt;
  const W2 = w.withdrawals || [], html = W2.length ? W2.map((o) => `<div class="o-${esc(o.status)}"><b>${esc(num(o.sol) ? o.sol.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") : D)} SOL OUT</b><span>${esc(o.status === "confirmed" ? "arrived" : o.status === "sent" ? "sent, being confirmed" : o.status === "requested" ? "being prepared" : "not sent")}${o.error && o.status !== "confirmed" ? ` · ${esc(o.error)}` : ""} · to ${esc(short(o.destination))}</span><em>${ago(o.at)} ago</em>${o.signature ? `<a href="https://solscan.io/tx/${encodeURIComponent(o.signature)}" target="_blank" rel="noopener noreferrer">Solscan</a>` : ""}</div>`).join("") : `<div><span>no withdrawals yet</span></div>`;
  const h = el.querySelector("#wl-wds"); if (h && h.dataset.h !== html) { h.dataset.h = html; h.innerHTML = html; }
}
function wirePayout(el) {
  const pf = el.querySelector("#wl-pof"), wf = el.querySelector("#wl-wdf"); if (!pf || !wf) return;
  const say = (id, t, c = "") => { const m = el.querySelector(id); m.textContent = t; m.className = "msg " + c; m.dataset.busy = t && c !== "ok" ? "1" : ""; };
  pf.addEventListener("input", () => { poDirty = true; say("#wl-pomsg", ""); });
  pf.onsubmit = async (e) => { e.preventDefault(); say("#wl-pomsg", "Checking the address…", "busy"); try { await post("/api/aq/wallet/payout-address", { address: pf.elements.address.value.trim() }); poDirty = false; say("#wl-pomsg", "", "ok"); await poll(); } catch (e2) { say("#wl-pomsg", e2.message, "err"); } };
  const ask = async (sol) => { say("#wl-wdmsg", "Checking…", "busy");
    let pv; try { const r = await fetch("/api/aq/wallet/withdraw-preview?sol=" + encodeURIComponent(sol), { credentials: "same-origin", cache: "no-store" }); pv = await r.json(); if (!r.ok) throw new Error((pv && pv.error && pv.error.message) || "HTTP " + r.status); } catch (e2) { return say("#wl-wdmsg", e2.message, "err"); }
    if (!pv.ok) return say("#wl-wdmsg", pv.error || "Not possible right now", "err");
    say("#wl-wdmsg", "");
    dialog(`<h3>Send ${esc(pv.sol)} SOL out?</h3><p>From the Aquarius wallet to your payout address:</p><p class="po-d">${esc(pv.destination)}</p><p>Network fee ${esc(pv.feeSol)} SOL. ${pv.leavesSol > 0 ? `${esc(pv.leavesSol)} SOL stays in the wallet.` : "The wallet will be empty."} This is real money and cannot be undone.</p><div class="row"><button class="ghost" data-x>Cancel</button><button class="danger" data-ok>Send ${esc(pv.sol)} SOL</button></div><p class="msg"></p>`, (d, close) => {
      d.querySelector("[data-x]").onclick = close;
      d.querySelector("[data-ok]").onclick = async (ev) => { const b = ev.currentTarget, m = d.querySelector(".msg"); b.disabled = true; m.textContent = "Sending…";
        try { const r = await post("/api/aq/wallet/withdraw", { sol: sol === "all" ? "all" : Number(sol) }); m.textContent = r.confirmed ? "Arrived." : "Sent. It is being confirmed: it shows below in a minute."; m.className = "msg ok"; wf.reset(); setTimeout(close, 1800); poll(); }
        catch (e3) { m.textContent = e3.message; m.className = "msg err"; poll(); } };
    }); };
  wf.onsubmit = (e) => { e.preventDefault(); const v = wf.elements.sol.value.trim(); if (!(Number(v) > 0)) return say("#wl-wdmsg", "Type an amount in SOL, or press All", "err"); ask(v); };
  el.querySelector("#wl-wdall").onclick = () => ask("all");
}
const offHTML = () => `<div class="rh-h"><b class="rh-tag">AQUARIUS WALLET</b><span>Solana · not created</span></div>
  <button type="button" class="rh-go wl-go" id="wl-create">CREATE WALLET</button>
  <p class="rh-n">Aquarius makes its own Solana wallet on the server and shows you its address. It trades only inside the limits you set.</p><p class="rh-e" id="wl-err"></p>`;
const onHTML = () => `<div class="rh-h"><b class="rh-tag on wl-t">AQUARIUS WALLET</b><span>Solana · on the Aquarius server</span><em id="wl-age"></em></div>
  <div class="rh-g">
    <div class="wl-a"><code id="wl-addr">${D}</code><button type="button" class="ghost" id="wl-copy">Copy</button></div>
    <div class="rh-k"><div><small>SOL</small><b id="wl-sol">${D}</b></div><div><small>COINS</small><b id="wl-tn">${D}</b></div></div>
    <div class="rh-pos" id="wl-tok"></div>
    <form class="rh-f" id="wl-form">
      ${NUMS.map(([n, l]) => `<label>${l}<input name="${n}" type="number" inputmode="decimal" min="0" step="${n === "maxOpenPositions" ? 1 : "any"}" value="0"></label>`).join("")}
      <button class="primary" type="submit">Save limits</button><span class="msg" id="wl-msg"></span>
    </form>
    <div class="rh-a"><button type="button" id="wl-auto" class="rh-sw" aria-pressed="false">AUTO TRADE OFF</button><i id="wl-auto-n"></i><button type="button" id="wl-sellall" class="kill">SELL ALL LIVE</button></div>
    <div class="po"><div class="rh-h"><b class="po-t">TAKE MONEY OUT</b><span id="wl-bk"></span></div>
      <form class="rh-f po-f" id="wl-pof"><label class="po-a">Payout address (your own wallet)<input name="address" type="text" autocomplete="off" spellcheck="false" placeholder="Solana address"></label><button class="primary" type="submit">Save address</button><span class="msg" id="wl-pomsg"></span></form>
      <form class="rh-f po-f" id="wl-wdf"><label>Withdraw (SOL)<input name="sol" type="number" inputmode="decimal" min="0" step="any" placeholder="0.00"></label><button class="ghost" type="button" id="wl-wdall">All</button><button class="primary" type="submit">Withdraw</button><span class="msg" id="wl-wdmsg"></span></form>
      <div class="lv-o" id="wl-wds"></div></div>
    <div class="lv"><div class="rh-h"><b class="lv-t">LIVE</b><span id="wl-rule"></span></div>
      <div class="rh-k"><div><small>LIVE P&amp;L TODAY</small><b id="wl-pnl">${D}</b></div><div><small>LIVE POSITIONS</small><b id="wl-ln">${D}</b></div></div>
      <div class="rh-pos" id="wl-lpos"></div><div class="lv-o" id="wl-lord"></div><p class="rh-n" id="wl-ref"></p></div>
  </div><p class="rh-e" id="wl-err"></p>`;
function wire(el) {
  const c = el.querySelector("#wl-create");
  if (c) c.onclick = async () => { c.disabled = true; c.textContent = "CREATING…"; try { await post("/api/aq/wallet/create"); } catch (e) { const m = el.querySelector("#wl-err"); if (m) m.textContent = e.message; c.disabled = false; c.textContent = "CREATE WALLET"; } await poll(); };
  const f = el.querySelector("#wl-form"); if (!f) return;
  poDirty = false; wirePayout(el);
  const msg = (t, cl = "") => { const m = el.querySelector("#wl-msg"); m.textContent = t; m.className = "msg " + cl; };
  el.querySelector("#wl-copy").onclick = async (e) => { const b = e.currentTarget, a = el.querySelector("#wl-addr").textContent;
    try { await navigator.clipboard.writeText(a); b.textContent = "Copied"; } catch { const r = document.createRange(); r.selectNodeContents(el.querySelector("#wl-addr")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected"; }
    setTimeout(() => { b.textContent = "Copy"; }, 1500); };
  f.addEventListener("input", () => { dirty = true; msg(""); });
  const read = () => { const o = {}; for (const [n] of NUMS) { const v = f.elements[n].value.trim(); o[n] = v === "" ? NaN : Number(v); } return o; };
  const send = async (body, done) => { msg("Saving…"); try { await post("/api/aq/wallet/limits", body); dirty = false; msg(done, "ok"); await poll(); } catch (e) { msg(e.message, "err"); } };
  f.onsubmit = (e) => { e.preventDefault(); const o = read(); for (const [n, l] of NUMS) if (!(o[n] >= 0)) return msg(`${l}: type a number, 0 or more`, "err"); send(o, "Saved."); };
  el.querySelector("#wl-sellall").onclick = () => dialog(`<h3>Sell every live position?</h3><p>Aquarius sells all the coins in its wallet's live positions for SOL now, at the market. This is real money.</p><div class="row"><button class="ghost" data-x>Cancel</button><button class="danger" data-ok>SELL ALL LIVE</button></div><p class="msg"></p>`, (d, close) => {
    d.querySelector("[data-x]").onclick = close;
    d.querySelector("[data-ok]").onclick = async (e) => { const m = d.querySelector(".msg"); e.currentTarget.disabled = true; m.textContent = "Selling…"; try { const r = await post("/api/aq/wallet/sellall"); m.textContent = `${(r.sold || []).length} sold, ${(r.kept || []).length} not yet.`; m.className = "msg ok"; setTimeout(close, 1500); poll(); } catch (e2) { m.textContent = "Not sent: " + e2.message; e.currentTarget.disabled = false; } };
  });
  el.querySelector("#wl-auto").onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); send({ ...read(), autoTrade: on }, on ? "Auto trade is ON: Aquarius now buys and sells with real SOL inside these limits." : "Auto trade is off."); };
}
