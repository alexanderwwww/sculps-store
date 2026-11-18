// LIVE positions of the Aquarius wallet, up close (Alex: "I wanna see how it trades live. Give me option to sell or buy more
// instant on all your 3 positions"). Chips on the dock, one panel per position in the drawer's LIVE tab, the trade tape, and a
// toast when an order confirms. Orders go to POST /api/aq/wallet/manual(/preview): the server runs every safety check.
import { esc, dialog, poll } from "./main.js";
const D = "—", num = (v) => typeof v === "number" && isFinite(v);
const px = (v) => (num(v) ? "$" + (v >= 1 ? v.toFixed(4) : v.toPrecision(4)) : D);
const pct = (v) => (num(v) ? (v > 0 ? "+" : "") + v.toFixed(2) + "%" : D);
const cls = (v) => (num(v) ? (v > 0 ? "up" : v < 0 ? "dn" : "") : "");
const short = (m) => (m && m.length > 12 ? m.slice(0, 4) + "…" + m.slice(-4) : m || D);
const athens = (t) => (t ? new Date(t).toLocaleTimeString("en-GB", { timeZone: "Europe/Athens", hour12: false }) : D);
const post = async (path, body) => { const r = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => null); if (!r.ok) { const e = new Error((j && j.error && j.error.message) || "HTTP " + r.status); e.body = j; throw e; } return j; };

// a tiny sparkline: prices since entry (the engine keeps the last 90 one-minute closes)
export function spark(xs, w = 64, h = 18) {
  const v = (xs || []).filter(num); if (v.length < 2) return `<svg class="sp" width="${w}" height="${h}"></svg>`;
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 1 - ((y - lo) / r) * (h - 2)).toFixed(1)}`).join(" ");
  return `<svg class="sp ${v[v.length - 1] >= v[0] ? "up" : "dn"}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
}
// where price sits between stop, entry, T1 and T2
export function ladder(p) {
  const pl = p.plan, now = p.spark && p.spark.length ? p.spark[p.spark.length - 1] : null;
  if (!pl || !num(pl.stop) || !num(pl.t2)) return `<div class="ld none"></div>`;
  const lo = pl.stop, hi = pl.t2, at = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100)).toFixed(1) + "%";
  return `<div class="ld" title="stop ${px(pl.stop)} · entry ${px(pl.entry)} · T1 ${px(pl.t1)} · T2 ${px(pl.t2)}"><i class="s" style="left:0"></i><i class="e" style="left:${at(pl.entry)}"></i><i class="t" style="left:${at(pl.t1)}"></i><i class="t" style="left:100%"></i>${num(now) ? `<b style="left:${at(now)}"></b>` : ""}</div>`;
}
export function chips(live) {
  const P = ((live && live.positions) || []).slice(0, 3);
  return P.map((p) => `<div class="lc" role="button" tabindex="0" data-pos="${p.id}" title="${esc(p.mint)}"><b>${esc(p.symbol || short(p.mint))}</b><em class="${cls(p.pnlPct)}">${pct(p.pnlPct)}</em>${spark(p.spark, 46, 16)}${ladder(p)}${p.status === "open" ? `<span class="lc-h"><button class="ghost" data-m="sell" data-pct="25" data-id="${p.id}">25%</button><button class="ghost" data-m="sell" data-pct="50" data-id="${p.id}">50%</button><button class="danger" data-m="sell" data-pct="100" data-id="${p.id}">ALL</button><button class="primary" data-m="buy" data-id="${p.id}">+ BUY</button></span>` : ""}</div>`).join("");
}
const phase = (pl) => (!pl ? "no chart plan" : pl.phase === 0 ? `aiming at T1 ${px(pl.t1)}` : pl.phase === 1 ? `half sold · stop at entry · next T2 ${px(pl.t2)}` : "trailing under each higher low");
export function panelHTML(live, lim) {
  const P = (live && live.positions) || [], O = (live && live.orders) || [];
  const pos = P.length ? P.map((p) => `<div class="lp" id="lp-${p.id}"><div class="lp-h"><b>${esc(p.symbol || short(p.mint))}</b><code title="${esc(p.mint)}">${esc(short(p.mint))}</code><em class="${cls(p.pnlPct)}">${pct(p.pnlPct)}</em><span>${esc(p.status)}</span></div>
      <div class="lp-g">${spark(p.spark, 180, 40)}<div class="lp-n"><span>in ${num(p.costSol) ? p.costSol.toFixed(4) : D} SOL · now ${num(p.valueSol) ? p.valueSol.toFixed(4) : D} SOL</span><span>${esc(phase(p.plan))}</span>${p.plan ? `<span>stop ${px(p.plan.stop)} · entry ${px(p.plan.entry)} · T1 ${px(p.plan.t1)} · T2 ${px(p.plan.t2)}</span>` : ""}</div></div>${ladder(p)}
      ${p.status === "open" ? `<div class="lp-a"><button class="ghost" data-m="sell" data-pct="25" data-id="${p.id}">SELL 25%</button><button class="ghost" data-m="sell" data-pct="50" data-id="${p.id}">SELL 50%</button><button class="danger" data-m="sell" data-pct="100" data-id="${p.id}">SELL ALL</button><span class="lp-b"><input type="number" min="0" step="any" inputmode="decimal" value="${num(lim && lim.maxPerTradeSol) ? lim.maxPerTradeSol : ""}" data-amt="${p.id}" aria-label="SOL to add"><button class="primary" data-m="buy" data-id="${p.id}">BUY MORE</button></span></div>` : ""}</div>`).join("")
    : `<p class="rh-n">No live position open. When the chart trader buys, each position shows here with SELL 25% / 50% / ALL and BUY MORE.</p>`;
  const tape = O.length ? O.map((o) => `<div class="tp o-${esc(o.status)}"><time>${athens(o.at)}</time><b class="${o.side === "buy" ? "up" : o.side === "sell" ? "dn" : ""}">${esc(String(o.side).toUpperCase())}</b><span>${esc(o.symbol || "")}</span><span class="m">${num(o.sol) ? (o.sol > 0 ? "+" : "") + o.sol.toFixed(4) + " SOL" : D}</span><i class="st">${esc(o.status)}</i>${o.signature ? `<a href="https://solscan.io/tx/${encodeURIComponent(o.signature)}" target="_blank" rel="noopener">tx</a>` : "<a></a>"}</div>`).join("") : `<p class="rh-n">No live order yet.</p>`;
  return `<div class="lv-ps">${pos}</div><div class="rh-h"><b class="lv-t">TRADE TAPE</b><span>Athens time · newest first</span></div><div class="tape-l">${tape}</div>`;
}
// the confirm flow: preview (sends nothing) -> dialog with coin, exact mint, amount, expected out, impact -> the order
export async function manual(btn, root) {
  const id = Number(btn.dataset.id), side = btn.dataset.m, body = { positionId: id, side };
  if (side === "sell") body.pct = Number(btn.dataset.pct);
  else { const inp = root.querySelector(`[data-amt="${id}"]`), v = inp ? Number(inp.value) : Number(btn.dataset.def); if (!(v > 0)) return toast("Type the SOL to add", "err"); body.sol = v; }
  btn.disabled = true; let pv;
  try { pv = await post("/api/aq/wallet/manual/preview", body); } catch (e) { btn.disabled = false; return toast(e.message, "err"); }
  btn.disabled = false;
  const go = (force) => dialog(`<h3>${side === "sell" ? `Sell ${pv.pct === 100 ? "ALL" : pv.pct + "%"} of ${esc(pv.symbol)}?` : `Buy ${esc(pv.sol)} SOL more ${esc(pv.symbol)}?`}</h3>
    <div class="ph-c"><div><small>COIN</small><b>${esc(pv.symbol)}</b></div><div><small>EXACT MINT</small><b>${esc(pv.mint)}</b></div>
    <div><small>AMOUNT</small><b>${side === "sell" ? esc(pv.tokensIn) + " raw tokens" : esc(pv.sol) + " SOL"}</b></div>
    <div><small>EXPECTED OUT</small><b>${side === "sell" ? esc(pv.expectSol.toFixed(6)) + " SOL" : esc(pv.expectOut) + " raw tokens"}</b></div>
    <div><small>PRICE IMPACT</small><b class="${pv.overImpact ? "dn" : ""}">${esc(pv.impactPct)}%${pv.overImpact ? " (over the 1% cap: it will be refused)" : ""}</b></div></div>
    <p>Real money, from the Aquarius wallet. Recorded as "manual: Alex".</p><div class="row"><button class="ghost" data-x>Cancel</button><button class="${side === "sell" ? "danger" : "primary"}" data-ok>${side === "sell" ? "SELL" : "BUY MORE"}</button></div><p class="msg"></p>`, (d, close) => {
    d.querySelector("[data-x]").onclick = close;
    d.querySelector("[data-ok]").onclick = async (e) => { const b = e.currentTarget, m = d.querySelector(".msg"); if (b.disabled) return; b.disabled = true; m.textContent = "Sending…";
      try { const r = await post("/api/aq/wallet/manual", { ...body, force }); m.textContent = r.confirmed ? "Confirmed on the chain." : r.pending || r.sent ? "Sent: being confirmed." : r.failed ? "Not done: " + r.failed : r.skipped || "Done."; m.className = "msg " + (r.failed ? "err" : "ok"); setTimeout(close, 1600); poll(); }
      catch (e2) { m.textContent = e2.message; m.className = "msg err"; poll(); } };
  });
  if (side === "buy" && pv.underwater) dialog(`<h3>Rulebook v2 rule 10</h3><p>Never add to a loser. This position is under water. Buy anyway?</p><div class="row"><button class="ghost" data-x>No</button><button class="danger" data-ok>Buy anyway</button></div>`, (d, close) => { d.querySelector("[data-x]").onclick = close; d.querySelector("[data-ok]").onclick = () => { close(); go(true); }; });
  else go(false);
}
// a toast on the main screen when a live order confirms (each order once)
const seen = new Map(); let first = true;
export function watchOrders(live) {
  for (const o of (live && live.orders) || []) { const was = seen.get(o.id); seen.set(o.id, o.status); if (!first && was !== "confirmed" && o.status === "confirmed") toast(`${String(o.side).toUpperCase()} ${o.symbol || ""} confirmed${num(o.sol) ? ` · ${(o.sol > 0 ? "+" : "") + o.sol.toFixed(4)} SOL` : ""}`, o.side === "buy" ? "up" : "dn"); }
  first = false;
}
export function toast(text, c = "") {
  const t = document.createElement("div"); t.className = "toast " + c; t.textContent = text; document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("in")); setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, 4200);
}
