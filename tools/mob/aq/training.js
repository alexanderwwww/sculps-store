// TRAINING MODE: the header switch and the compact TRAINING ARENA card. Both stay hidden until the engine sends state.training.
// The engine's exact field names were not final when this was written, so each value is read from the first name that exists
// (listed in CONTRACT.md); anything missing shows "—". Nothing is computed here except what the label says.
import { esc, ago, dialog, poll, store } from "./main.js";
const D = "—", num = (v) => typeof v === "number" && isFinite(v);
const pick = (o, ...ks) => { for (const k of ks) { const v = k.split(".").reduce((a, p) => (a == null ? a : a[p]), o); if (v != null) return v; } return null; };
const big = (v) => (num(v) ? (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e4 ? (v / 1e3).toFixed(1) + "k" : v.toLocaleString("en-US", { maximumFractionDigits: 2 })) : D);
const pct = (v) => (num(v) ? (v > 0 ? "+" : "") + v.toFixed(2) + "%" : D), cls = (v) => (num(v) ? (v > 0 ? "up" : v < 0 ? "dn" : "") : "");
export const trainingOn = (s) => { const t = s && s.training; return !!t && (t === true || t.on === true || t.mode === "on" || t.enabled === true); };
export function trainingHTML() { return `<section class="p arena" id="d-arena" hidden><div class="ph"><b>TRAINING ARENA</b><span>its own paper wallet and ledger · virtual trades on real prices · never mixed into the main book</span><em id="t-st"></em></div><div id="t-body"></div></section>`; }
let last = "";
export function renderTraining(root, s) {
  const el = root.querySelector("#d-arena"); if (!el) return; const t = s && s.training && typeof s.training === "object" ? s.training : null; el.hidden = !t; if (!t) return;
  const on = trainingOn(s), wallet = pick(t, "walletSol", "wallet.sol", "wallet.equitySol", "equitySol", "wallet"), start = pick(t, "startSol", "wallet.startSol", "wallet.baseSol"), total = pick(t, "trades", "tradesTotal", "virtualTrades", "stats.trades"), perMin = pick(t, "perMin", "tradesPerMin", "perMinute", "stats.perMin");
  const variants = pick(t, "variants", "variantsTried", "tried", "settingsTried"), grad = pick(t, "graduated", "graduatedCount", "graduates"), rnd = pick(t, "random.expectancyPct", "randomExpectancyPct", "baseline.expectancyPct"), leaders = pick(t, "leaders", "top", "leaderboard");
  const gN = Array.isArray(grad) ? grad.length : grad, vN = Array.isArray(variants) ? variants.length : variants, L = Array.isArray(leaders) ? leaders.slice(0, 5) : [];
  const st = `${on ? "ON" : "OFF"}${pick(t, "since", "startedAt", "onSince") ? " · since " + ago(pick(t, "since", "startedAt", "onSince")) + " ago" : ""}`;
  const tile = (k, v, sub = "") => `<div><small>${k}</small><b>${v}</b>${sub ? `<i>${sub}</i>` : ""}</div>`;
  const html = `<div class="ar-k">${tile("WALLET", num(wallet) ? big(wallet) + " SOL" : D, num(start) ? "started at " + big(start) + " SOL" : "")}${tile("VIRTUAL TRADES", big(total))}${tile("PER MINUTE", big(perMin))}${tile("VARIANTS TRIED", big(vN))}${tile("GRADUATED", big(gN), "won again on fresh data")}${tile("RANDOM BASELINE", `<span class="${cls(rnd)}">${pct(rnd)}</span>`, "per trade, after costs")}</div>
    <div class="ar-h">TOP 5 LEADERS vs RANDOM</div>${L.length ? `<div class="ar-l hd"><span>#</span><b>SETTING</b><span>TRADES</span><span>EXPECTANCY</span><span>vs RANDOM</span></div>` + L.map((x, i) => { const e = pick(x, "expectancyPct", "expPct", "expectancy"), n = pick(x, "n", "trades"), vs = pick(x, "vsRandomPct", "edgePct") ?? (num(e) && num(rnd) ? e - rnd : null);
      return `<div class="ar-l"><span>${i + 1}</span><b title="${esc(pick(x, "name", "label", "id", "key") ?? D)}">${esc(pick(x, "name", "label", "id", "key") ?? D)}${x.graduated ? `<u>GRADUATED</u>` : ""}</b><span>${big(n)}</span><span class="${cls(e)}">${pct(e)}</span><span class="${cls(vs)}">${pct(vs)}</span></div>`; }).join("") : `<p class="empty">${on ? "no leaders yet: the arena needs trades on fresh data first" : "training is off"}</p>`}`;
  const se = el.querySelector("#t-st"); if (se.textContent !== st) { se.textContent = st; se.className = on ? "up" : ""; }
  if (html !== last) { el.querySelector("#t-body").innerHTML = html; last = html; }
}
// header switch: hidden until state.training exists
export function trainingButton() { const b = document.createElement("button"); b.id = "train"; b.className = "ghost train"; b.hidden = true; b.onclick = trainingDialog; return b; }
export function renderTrainingButton(s) { const b = document.getElementById("train"); if (!b) return; const has = !!(s && s.training != null); b.hidden = !has; if (!has) return; const on = trainingOn(s); b.textContent = on ? "TRAINING ON" : "TRAINING"; b.classList.toggle("on", on); b.title = on ? "Training mode is on. Click to turn it off." : "Turn training mode on"; }
function trainingDialog() {
  const on = !trainingOn(store.state);
  dialog(`<h3>${on ? "Turn TRAINING MODE on?" : "Turn TRAINING MODE off?"}</h3><p>${on ? "The training arena starts next to the normal paper book: its own paper wallet, its own ledger, thousands of virtual trades a minute on real prices. The main book and its stats are not touched." : "The training arena stops. What it learned stays in the brain. The main paper book carries on as it is."}</p>
    <div class="row"><button class="ghost" data-x>Cancel</button><button class="primary" data-ok>${on ? "Start training" : "Stop training"}</button></div><p class="msg"></p>`, (d, close) => {
    d.querySelector("[data-x]").onclick = close;
    d.querySelector("[data-ok]").onclick = async () => { const m = d.querySelector(".msg"); m.textContent = "Sending…";
      try { const r = await fetch("/api/aq/training", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ on }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || "HTTP " + r.status); close(); poll(); }
      catch (e) { m.textContent = "Not sent: " + e.message; m.className = "msg err"; } };
  });
}
