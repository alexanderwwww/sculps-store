// PHANTOM card: Alex's own wallet. The page only ever does three things with Phantom, exactly as Phantom documents them
// (docs.phantom.com/solana, read 2026-11-18): detect window.phantom.solana.isPhantom, connect() for the PUBLIC address,
// and signAndSendTransaction(tx) on a transaction the Aquarius server built, so he approves it in Phantom's own window.
// This file never asks for a key or a phrase and never calls anything but this site's own /api/aq/phantom routes.
import { esc, ago, poll, onState, dialog, store, BUILD } from "./main.js";
const D = "—", num = (v) => typeof v === "number" && isFinite(v);
const sol = (v, d = 4) => (num(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) + " SOL" : D);
const amt = (v) => (num(v) ? v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 2 }) : D);
const short = (m) => (m && m.length > 12 ? m.slice(0, 4) + "…" + m.slice(-4) : m || D);
const provider = () => { const p = typeof window !== "undefined" && window.phantom && window.phantom.solana; return p && p.isPhantom ? p : null; };
const api = async (path, body) => { const r = await fetch("/api/aq/phantom" + path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error((j && j.error && j.error.message) || "HTTP " + r.status); return { ...j, httpStatus: r.status }; };
let key = "", lastSeen = 0, busy = false, hooked = false;

export function phantomCard() {
  const el = document.createElement("section"); el.id = "ph"; el.className = "rh phm"; el.hidden = true;
  onState((s) => { try { paint(el, s && s.phantom); } catch (e) { console.error(e); } });
  return el;
}
const say = (el, t, c = "") => { const m = el.querySelector("#ph-msg"); if (m) { m.textContent = t; m.className = "msg " + c; } };
function hook() { // Phantom tells the page when he switches account or disconnects there: the server follows, public address only
  const p = provider(); if (!p || hooked || typeof p.on !== "function") return; hooked = true;
  p.on("accountChanged", (pk) => { (pk ? api("/connect", { address: pk.toString() }) : api("/disconnect", {})).then(() => poll()).catch(() => {}); });
  p.on("disconnect", () => {});
  if (store.state && store.state.phantom && store.state.phantom.connected) p.connect({ onlyIfTrusted: true }).catch(() => {});
}
async function connect(el) {
  const p = provider();
  if (!p) return say(el, "Phantom is not installed in this browser. Add the Phantom extension to this browser, then press the button again.", "err");
  say(el, "Approve the connection in Phantom…");
  try { const r = await p.connect(); await api("/connect", { address: r.publicKey.toString() }); say(el, ""); hook(); await poll(); }
  catch (e) { say(el, e && e.code === 4001 ? "You said no in Phantom. Nothing was connected." : (e && e.message) || "Phantom did not connect", "err"); }
}
// One trade or transfer: the server builds it, a confirm shows exactly what it is, Phantom asks him, the signature goes back.
async function act(el, path, body) {
  if (busy) return; busy = true; say(el, "Getting the price…");
  let t; try { t = await api(path, body); } catch (e) { busy = false; return say(el, e.message, "err"); }
  say(el, "");
  const fund = t.side === "fund", buy = t.side === "buy";
  const head = fund ? `Send ${esc(t.sol)} SOL to the Aquarius wallet?` : buy ? `Buy ${esc(t.symbol)} with ${esc(t.solIn)} SOL?` : `Sell ${esc(t.pct)}% of your ${esc(t.symbol)}?`;
  const rows = fund ? [["From", "your Phantom"], ["To (Aquarius wallet)", t.destination], ["Amount", `${t.sol} SOL`], ["Network fee", `${t.feeSol} SOL`]]
    : [["Coin", t.symbol], ["Coin address", t.mint], buy ? ["You pay", `${t.solIn} SOL`] : ["You sell", `${t.tokensIn != null ? amt(t.tokensIn) : t.tokensInRaw + " (smallest units)"} ${t.symbol}`],
      ["You get about", buy ? `${t.expectOut != null ? amt(t.expectOut) : t.expectOutRaw + " (smallest units)"} ${t.symbol}` : `${t.expectOut} SOL`], ["At least", buy ? (t.minOut != null ? `${amt(t.minOut)} ${t.symbol}` : D) : `${t.minOut} SOL`],
      ["Price impact", `${t.impactPct}%`], ["Fees", `about ${t.feeSol} SOL`]];
  dialog(`<h3>${head}</h3><div class="ph-c">${rows.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div>${(t.warnings || []).map((w) => `<p class="ph-w">${esc(w)}</p>`).join("")}
    <p class="note">Phantom opens next and asks you to approve. This is real money from your own wallet.</p><div class="row"><button class="ghost" data-x>Cancel</button><button class="${buy || fund ? "primary" : "danger"}" data-ok>Open Phantom</button></div><p class="msg"></p>`, (d, close) => {
    const m = d.querySelector(".msg"), ok = d.querySelector("[data-ok]"), done = () => { busy = false; };
    const drop = () => api("/cancel", { orderId: t.orderId }).then(() => poll()).catch(() => {});
    d.querySelector("[data-x]").onclick = () => { drop(); done(); close(); };
    ok.onclick = async () => {
      ok.disabled = true; m.className = "msg"; m.textContent = "Waiting for you in Phantom…";
      try {
        const p = provider(); if (!p) throw new Error("Phantom is not installed in this browser");
        if (!p.publicKey) await p.connect();
        if (p.publicKey.toString() !== t.wallet) throw new Error("Phantom is on a different account than the one connected here. Press Disconnect, then CONNECT PHANTOM again.");
        const { toTransaction } = await import("/aq/phantom-tx.js?b=" + encodeURIComponent(BUILD));
        const { signature } = await p.signAndSendTransaction(toTransaction(t.tx));
        m.textContent = "Sent by Phantom. Confirming on the chain…";
        let r = null; for (let i = 0; i < 10; i++) { r = await api("/sent", { orderId: t.orderId, signature }); if (r.httpStatus !== 202) break; await new Promise((z) => setTimeout(z, 3000)); }
        const good = r && r.status === "confirmed";
        m.textContent = good ? "Done. It is on the chain." : r && r.status === "failed" ? `It did not go through: ${r.reason || "the chain rejected it"}` : "Sent. It is still being confirmed: it shows on the card in a minute.";
        m.className = "msg " + (good ? "ok" : r && r.status === "failed" ? "err" : ""); done(); poll(); if (good) setTimeout(close, 1800);
      } catch (e) { const no = e && e.code === 4001; m.textContent = no ? "You said no in Phantom. Nothing was sent." : (e && e.message) || "Phantom did not send it"; m.className = "msg err"; if (no) drop(); done(); ok.disabled = false; ok.textContent = "Close"; ok.onclick = close; }
    };
  });
}
function paint(el, ph) {
  el.hidden = !ph; if (!ph) return;
  const k = ph.connected ? "on" : "off";
  if (key !== k) { key = k; el.className = "rh phm " + k; el.innerHTML = ph.connected ? onHTML() : offHTML(ph); wire(el); hook(); }
  if (!ph.connected) return;
  if (Date.now() - lastSeen > 20000) { lastSeen = Date.now(); api("").catch(() => {}); } // tells the engine the page is open, refreshes balances
  const set = (id, v, c) => { const e = el.querySelector("#" + id); if (e && e.textContent !== v) e.textContent = v; if (e && c != null && e.className !== c) e.className = c; };
  const put = (id, html) => { const e = el.querySelector("#" + id); if (e && e.dataset.h !== html) { e.dataset.h = html; e.innerHTML = html; } };
  const a = el.querySelector("#ph-addr"); if (a && a.textContent !== short(ph.address)) { a.textContent = short(ph.address); a.title = ph.address; }
  set("ph-age", ph.checkedAt ? `read ${ago(ph.checkedAt)} ago` : "reading your wallet…");
  set("ph-sol", ph.checkedAt ? sol(ph.sol) : D); set("ph-pnl", num(ph.pnlSol) ? (ph.pnlSol > 0 ? "+" : "") + ph.pnlSol.toFixed(4) + " SOL" : D, num(ph.pnlSol) ? (ph.pnlSol > 0 ? "up" : ph.pnlSol < 0 ? "dn" : "") : "");
  const P = ph.positions || [], T = Array.isArray(ph.tokens) ? ph.tokens : [], name = new Map((ph.coins || []).map((c) => [c.mint, c.symbol]));
  const rows = [...P.map((p) => ({ mint: p.mint, symbol: p.symbol, p })), ...T.filter((t) => !P.some((p) => p.mint === t.mint)).map((t) => ({ mint: t.mint, symbol: name.get(t.mint) || short(t.mint), t }))];
  set("ph-n", String(rows.length));
  put("ph-pos", rows.length ? rows.map((r) => `<div class="ph-row${r.p && r.p.sellNow ? " now" : ""}"><b title="${esc(r.mint)}">${esc(r.symbol || short(r.mint))}</b><span>${r.p ? `${num(r.p.costSol) ? r.p.costSol.toFixed(4) : D} SOL in${num(r.p.valueSol) ? ` · now ${r.p.valueSol.toFixed(4)}` : ""}` : `${amt(r.t.amount)} in your wallet`}</span>${(ph.sellPcts || [25, 50, 100]).map((x) => `<button type="button" class="ghost" data-sell="${esc(r.mint)}" data-pct="${x}">Sell ${x}%</button>`).join("")}</div>`).join("") : `<i>no coins in your Phantom</i>`);
  const sells = P.filter((p) => p.sellNow), sg = ph.signal;
  put("ph-ban", (sg ? `<div class="ph-b buy"><b>SIGNAL: buy ${esc(sg.symbol)}</b><span>${esc(sg.why)} · ${ago(sg.at)} ago · not proven after costs: small size</span><button type="button" class="primary" data-sig="${esc(sg.mint)}">Buy ${esc(sg.symbol)}</button></div>` : "")
    + sells.map((p) => `<div class="ph-b sell"><b>SELL NOW: ${esc(p.symbol)}</b><span>${esc(p.sellNow)}</span><button type="button" class="danger" data-sell="${esc(p.mint)}" data-pct="100">Sell ${esc(p.symbol)}</button></div>`).join(""));
  const sel = el.querySelector("#ph-coin"), opts = (ph.coins || []).map((c) => `<option value="${esc(c.mint)}">${esc(c.symbol)} · ${esc(c.from)}</option>`).join("") + `<option value="">Another coin (paste its address)</option>`;
  if (sel && sel.dataset.h !== opts && document.activeElement !== sel) { const v = sel.value; sel.dataset.h = opts; sel.innerHTML = opts; if (v && [...sel.options].some((o) => o.value === v)) sel.value = v; el.querySelector("#ph-mint").hidden = sel.value !== ""; }
  const fd = el.querySelector("#ph-fund"); if (fd) fd.hidden = !ph.aquariusAddress;
  const O = ph.orders || [];
  put("ph-ord", O.length ? O.map((o) => `<div class="o-${esc(o.status)}"><b>${esc(o.side === "fund" ? "TO AQUARIUS" : String(o.side).toUpperCase() + " " + (o.symbol || ""))}</b><span>${esc(o.status === "requested" ? "waiting for you in Phantom" : o.status === "sent" ? "sent, being confirmed" : o.status === "confirmed" ? "done" : "not done")}${num(o.sol) && o.status === "confirmed" ? ` · ${(o.sol > 0 ? "+" : "") + o.sol.toFixed(4)} SOL` : ""}${o.error ? ` · ${esc(o.error)}` : ""}</span><em>${ago(o.at)} ago</em>${o.signature ? `<a href="https://solscan.io/tx/${encodeURIComponent(o.signature)}" target="_blank" rel="noopener noreferrer">Solscan</a>` : ""}</div>`).join("") : `<div><span>no Phantom trades yet</span></div>`);
  set("ph-err", ph.lastError ? `Your wallet could not be read: ${ph.lastError}` : "");
}
const offHTML = (ph) => `<div class="rh-h"><b class="rh-tag">PHANTOM</b><span>your own wallet · not connected</span></div>
  <button type="button" class="rh-go ph-go" id="ph-connect">CONNECT PHANTOM</button>
  <p class="rh-n">${esc(ph.note || "")}</p><p class="rh-n">Aquarius only ever sees your public address. It never asks for a private key or a recovery phrase.</p><p class="msg" id="ph-msg"></p>`;
const onHTML = () => `<div class="rh-h"><b class="rh-tag on ph-t">PHANTOM</b><span>your own wallet · you approve every trade in Phantom</span><em id="ph-age"></em></div>
  <div class="rh-g">
    <div class="wl-a"><code id="ph-addr">${D}</code><button type="button" class="ghost" id="ph-copy">Copy</button><button type="button" class="ghost" id="ph-off">Disconnect</button></div>
    <div class="rh-k"><div><small>SOL</small><b id="ph-sol">${D}</b></div><div><small>COINS</small><b id="ph-n">${D}</b></div><div><small>P&amp;L FROM HERE</small><b id="ph-pnl">${D}</b></div></div>
    <div id="ph-ban"></div>
    <div class="ph-pos" id="ph-pos"></div>
    <form class="rh-f" id="ph-buy"><label class="ph-s">Coin<select id="ph-coin" name="coin"></select></label><label class="po-a" id="ph-mint" hidden>Coin address<input name="mint" type="text" autocomplete="off" spellcheck="false" placeholder="coin address (mint)"></label>
      <label>Spend (SOL)<input name="sol" type="number" inputmode="decimal" min="0" step="any" placeholder="0.00"></label><button class="primary" type="submit">Buy</button></form>
    <form class="rh-f" id="ph-fund" hidden><label>Send SOL to the Aquarius wallet<input name="sol" type="number" inputmode="decimal" min="0" step="any" placeholder="0.00"></label><button class="ghost" type="submit">FUND AQUARIUS WALLET</button></form>
    <p class="msg" id="ph-msg"></p>
    <div class="lv-o" id="ph-ord"></div>
    <p class="rh-n">Trades from Phantom need your approval in Phantom each time and only happen while this page is open. Fully automatic trading while you are away only works from the Aquarius wallet.</p>
  </div><p class="rh-e" id="ph-err"></p>`;
function wire(el) {
  const c = el.querySelector("#ph-connect"); if (c) { c.onclick = () => connect(el); return; }
  el.querySelector("#ph-copy").onclick = async (e) => { const b = e.currentTarget, a = el.querySelector("#ph-addr").title; try { await navigator.clipboard.writeText(a); b.textContent = "Copied"; } catch { b.textContent = a; } setTimeout(() => { b.textContent = "Copy"; }, 2500); };
  el.querySelector("#ph-off").onclick = async () => { try { const p = provider(); if (p && p.disconnect) await p.disconnect(); } catch {} try { await api("/disconnect", {}); } catch {} poll(); };
  const sel = el.querySelector("#ph-coin"); sel.onchange = () => { el.querySelector("#ph-mint").hidden = sel.value !== ""; };
  const bf = el.querySelector("#ph-buy");
  bf.onsubmit = (e) => { e.preventDefault(); const mint = (sel.value || bf.elements.mint.value).trim(), v = Number(bf.elements.sol.value); if (!mint) return say(el, "Choose a coin or paste its address", "err"); if (!(v > 0)) return say(el, "Type how much SOL to spend", "err"); act(el, "/trade", { mint, side: "buy", sol: v }); };
  const ff = el.querySelector("#ph-fund"); ff.onsubmit = (e) => { e.preventDefault(); const v = Number(ff.elements.sol.value); if (!(v > 0)) return say(el, "Type how much SOL to send", "err"); act(el, "/fund", { sol: v }); };
  el.addEventListener("click", (e) => { const b = e.target.closest("[data-sell],[data-sig]"); if (!b) return;
    if (b.dataset.sig) { sel.value = b.dataset.sig; el.querySelector("#ph-mint").hidden = sel.value !== ""; const v = Number(bf.elements.sol.value); if (!(v > 0)) { bf.elements.sol.focus(); return say(el, "Type how much SOL to spend, then press Buy", "err"); } return act(el, "/trade", { mint: b.dataset.sig, side: "buy", sol: v }); }
    act(el, "/trade", { mint: b.dataset.sell, side: "sell", pct: Number(b.dataset.pct) }); });
}
