// Fakes for the real-trader tests (build 41). Not a test itself (pack.sh runs *.test.mjs only).
//
//   startFakeGmgn({chain, variant})  a local token page shaped like a trade panel: Buy/Sell tabs,
//        an amount box, presets, a slippage control, a wallet label, an iframe variant. Every
//        click and input on it (trusted or not) is sent to the server and counted, and Buy/Sell
//        move money on the FakeChain. This proves the probe's honesty and the executor's
//        discipline only; GMGN's real DOM has never been seen from here.
//   FakeChain  the wallet's read API (solBalance, tokenBalance, recentSigs, txFill, tokens) over
//        an in-memory ledger, with the plan's fee model (1.25% a side + $0.03), and buys that
//        land, never land or land late.
//   routeGmgn(context, url)  https://gmgn.ai/** answered by the local server; everything else
//        aborted, so no test reaches the internet.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
export const { chromium } = require(path.resolve(HERE, "../../../../node_modules/playwright-core"));
const CHROME = process.env.ULTRA_TEST_CHROMIUM || "/opt/pw-browsers/chromium";

/** A headless Chrome reached over its DevTools port, the way the app reaches Alex's Chrome. */
export async function launchChrome() {
  const port = 9300 + Math.floor(Math.random() * 600);
  const udir = fs.mkdtempSync(path.join(os.tmpdir(), "uc-real-chrome-"));
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-proxy-server", `--remote-debugging-port=${port}`, `--user-data-dir=${udir}`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
  let browser = null;
  for (let i = 0; i < 100 && !browser; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { /* not up yet */ }
    if (!browser) await new Promise((r) => setTimeout(r, 200));
  }
  if (!browser) { ch.kill("SIGKILL"); throw new Error("chrome did not start"); }
  const ctx = browser.contexts()[0];
  return { browser, ctx, close: async () => { await browser.close().catch(() => {}); ch.kill("SIGKILL"); try { fs.rmSync(udir, { recursive: true, force: true }); } catch { /* busy */ } } };
}

/** Selectors the way Claude writes them from a probe report: role + exact name, as data. */
export function selectorsFrom(rep, names = {}) {
  const want = { buyTab: ["tab", "Buy"], sellTab: ["tab", "Sell"], amount: ["textbox", "Amount"], buyButton: ["button", "Buy"], sellAll: ["button", "100%"], sellButton: ["button", "Sell"], slippage: ["button", "Slippage 1%"], walletLabel: ["button", WALLET_LABEL], ...names };
  const out = {};
  for (const [k, [role, name]] of Object.entries(want)) {
    const c = (rep.controls || []).find((x) => x.role === role && x.name === name);
    if (c) out[k] = { role, name, exact: true };
  }
  return out;
}

export const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
export const WALLET_LABEL = "7xKX…gAsU";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const mintOf = (seed) => { const h = crypto.createHash("sha256").update(String(seed)).digest(); let s = ""; for (let i = 0; i < 44; i++) s += B58[h[i % h.length] % 58]; return s; };

export class FakeChain {
  constructor({ address = WALLET, sol = 0.15, solUsd = 100, now = Date.now, feeSide = 0.0125, netUsd = 0.03 } = {}) {
    this.address = address; this.lamports = Math.round(sol * 1e9); this.solUsd = solUsd; this.now = now;
    this.feeSide = feeSide; this.netUsd = netUsd;
    this.tok = new Map(); this.cost = new Map(); this.sigs = []; this.txs = new Map(); this.pending = []; this.n = 0;
    this.calls = { solBalance: 0, tokenBalance: 0, recentSigs: 0, txFill: 0 };
  }
  #settle() { const t = this.now(); for (const p of [...this.pending]) if (p.at <= t) { this.pending.splice(this.pending.indexOf(p), 1); p.fn(); } }
  #tx(mint, solDelta, tokenDelta, at = this.now()) {
    const sig = `sig${++this.n}${"x".repeat(80)}`.slice(0, 88);
    this.sigs.unshift({ sig, at, status: "finalized", err: null });
    this.txs.set(sig, { sig, at, ok: true, feeSol: 0.000005, solDelta, tokenDelta, mint });
    return sig;
  }
  /** A buy at pxSol (SOL per token). mode: land | never | late (lands after lagMs). */
  buy(mint, sol, pxSol, { mode = "land", lagMs = 30_000 } = {}) {
    const fn = () => {
      const lam = Math.round(sol * 1e9), raw = BigInt(Math.round((sol / pxSol) * 1e6));
      this.lamports -= lam;
      this.tok.set(mint, (this.tok.get(mint) || 0n) + raw);
      this.cost.set(mint, (this.cost.get(mint) || 0) + sol);
      this.#tx(mint, -lam / 1e9, Number(raw) / 1e6);
    };
    if (mode === "land") fn();
    else if (mode === "late") this.pending.push({ at: this.now() + lagMs, fn });
    return mode !== "never";
  }
  /** A sell of `ui` tokens at pxSol, the plan's fee model: 1.25% of the buy + 1.25% of the sale + $0.03. */
  sell(mint, ui, pxSol, { fail = false, leaveFrac = 0 } = {}) {
    if (fail) return false;
    const have = this.tok.get(mint) || 0n;
    let raw = BigInt(Math.round(ui * 1e6)); if (raw > have) raw = have;
    if (leaveFrac) raw -= BigInt(Math.round(Number(raw) * leaveFrac));
    const gross = (Number(raw) / 1e6) * pxSol;
    const buyCost = this.cost.get(mint) || 0;
    const fee = this.feeSide * buyCost + this.feeSide * gross + this.netUsd / this.solUsd;
    const lam = Math.round((gross - fee) * 1e9);
    this.lamports += lam;
    this.tok.set(mint, have - raw);
    this.#tx(mint, lam / 1e9, -Number(raw) / 1e6);
    return true;
  }
  deposit(sol) { this.lamports += Math.round(sol * 1e9); }
  // ---- the Wallet read API
  async solBalance() { this.calls.solBalance++; this.#settle(); return this.lamports / 1e9; }
  async tokenBalance(mint) { this.calls.tokenBalance++; this.#settle(); const raw = this.tok.get(mint) || 0n; return { raw: raw.toString(), ui: Number(raw) / 1e6, decimals: 6 }; }
  async recentSigs(limit = 10) { this.calls.recentSigs++; this.#settle(); return this.sigs.slice(0, limit); }
  // like the real Wallet.txFill(sig, mint): another coin's transaction moves this coin by 0
  async txFill(sig, mint = null) { this.calls.txFill++; const t = this.txs.get(sig) || null; return t && mint && t.mint !== mint ? { ...t, tokenDelta: 0 } : t; }
  async tokens() { this.#settle(); return [...this.tok].filter(([, r]) => r > 0n).map(([mint, r]) => ({ mint, raw: r.toString(), ui: Number(r) / 1e6, decimals: 6 })); }
}

// ------------------------------------------------------------------ the page
function tradeBox(v) {
  const slip = v === "noSlip" ? "" : `<button id="slip" aria-label="Slippage ${v === "slip5" ? 5 : 1}%">Slippage ${v === "slip5" ? 5 : 1}%</button>`;
  const amount = v === "dupAmount"
    ? `<input id="amt" aria-label="Amount" inputmode="decimal" placeholder="0.0"><input id="amt2" aria-label="Amount" inputmode="decimal">`
    : `<input id="amt" aria-label="Amount" inputmode="decimal" placeholder="0.0"${v === "fmt" ? ' data-fmt="1"' : ""}>`;
  return `<section class="trade" id="tradebox" style="width:320px;padding:8px;border:1px solid #333">
  <div role="tablist"><button role="tab" id="tbuy" aria-selected="true">${v === "renamed" ? "Purchase" : "Buy"}</button><button role="tab" id="tsell" aria-selected="false">Sell</button></div>
  ${amount}
  <div id="bp"><button class="pre">0.01</button><button class="pre">0.1</button><button class="pre">0.5</button><button class="pre">1</button><button class="pre">Max</button></div>
  <div id="sp" hidden><button class="pre">25%</button><button class="pre">50%</button><button id="all">100%</button></div>
  ${slip}
  <span>Priority 0.0001 SOL</span> <label><input type="checkbox" aria-label="Anti-MEV" checked> Anti-MEV</label>
  <span>Auto Sell TP/SL</span> <span>Balance 0.15 SOL</span>
  <button id="buy">Buy</button><button id="sell" hidden>Sell</button>
</section>`;
}
const SCRIPT = `<script>
(() => {
  const mint = location.pathname.split("/").pop();
  const ev = (type, el, trusted) => { try { const x = new XMLHttpRequest(); x.open("POST", "/__ev", false); x.send(JSON.stringify({ type, id: el && el.id || null, name: el && (el.getAttribute && (el.getAttribute("aria-label") || el.textContent) || "").trim().slice(0, 40), trusted, mint: window.__mint || mint })); } catch (e) {} };
  for (const t of ["click", "input", "keydown", "change", "pointerdown"]) document.addEventListener(t, (e) => ev(t, e.target, e.isTrusted), true);
  const $ = (id) => document.getElementById(id);
  const post = (path, body) => { const x = new XMLHttpRequest(); x.open("POST", path, false); x.send(JSON.stringify(body)); return JSON.parse(x.responseText || "{}"); };
  const sellMode = (on) => { $("bp").hidden = on; $("buy").hidden = on; $("sp").hidden = !on; $("sell").hidden = !on; $("tbuy").setAttribute("aria-selected", String(!on)); $("tsell").setAttribute("aria-selected", String(on)); };
  window.__wire = () => {
    if ($("amt").dataset.fmt) $("amt").addEventListener("input", () => { $("amt").value = Number($("amt").value).toFixed(2); });
    $("tbuy").onclick = () => sellMode(false);
    $("tsell").onclick = () => sellMode(true);
    for (const b of document.querySelectorAll(".pre")) b.onclick = () => { $("amt").value = b.textContent.replace("Max", "0.15"); };
    $("all").onclick = () => { const r = post("/__bal", { mint: window.__mint || mint }); $("amt").value = String(r.ui); };
    $("buy").onclick = () => post("/__buy", { mint: window.__mint || mint, amount: $("amt").value });
    $("sell").onclick = () => post("/__sell", { mint: window.__mint || mint, amount: $("amt").value });
  };
  if (document.getElementById("tradebox")) window.__wire();
})();
</script>`;

// build 45: GMGN's "Instant trade" window as the build 44 probe read it on Alex's Mac: one div,
// clickable DIVs (no button role), one click on a preset buys at once, one click on a % sells at
// once. Decoys that must never be clicked: a "0.01618" outside the window (a quick-buy strip) and
// a DryFlip-like panel with Buy / 0.01618 / Sell / 100% of its own.
function instantWindow(v, sym = "PEPE", wsol = "0.133") {
  const pre = (cls, t, i) => `<div class="${cls}" id="${cls}${i}" style="cursor:pointer;padding:2px 6px;border:1px solid #444">${t}</div>`;
  const row = (xs) => `<div style="display:flex;gap:4px">${xs}</div>`;
  return `<div id="iw" style="position:fixed;right:20px;top:200px;width:300px;padding:6px;background:#111;color:#eee;${v === "instantClosed" ? "display:none" : ""}">
  <div style="display:flex;gap:6px"><span>1</span><span>0</span><div>Buy</div><div style="cursor:pointer">P1</div><div style="cursor:pointer">P2</div><div style="cursor:pointer">P3</div><span id="wsol">${wsol}</span></div>
  ${row(["0.01618", "0.1", "0.5", "1"].map((t, i) => pre("ip", t, i)).join(""))}
  <div style="display:flex;gap:6px"><div style="cursor:pointer">Auto</div><span>0.00001</span><span>&lt;0.01</span><span>Red.</span><span>Adv.</span></div>
  <div style="display:flex;gap:6px"><div>Sell %</div><div style="cursor:pointer">P1</div><div style="cursor:pointer">P2</div><div style="cursor:pointer">P3</div></div>
  <div style="display:flex;gap:6px"><span>0</span><span>${sym}</span><span>0</span></div>
  ${row(["10%", "25%", "50%", "100%"].map((t, i) => pre("isp", t, i)).join(""))}
  <div style="display:flex;gap:6px"><span>Bal</span><span>Bought</span><span>Sold</span><span>PnL</span></div>
  <div style="cursor:pointer">Sell All</div>
</div>`;
}
const INSTANT_SCRIPT = `<script>
(() => {
  const mint = location.pathname.split("/").pop();
  const ev = (type, el, trusted) => { try { const x = new XMLHttpRequest(); x.open("POST", "/__ev", false); x.send(JSON.stringify({ type, id: el && el.id || null, name: (el && el.textContent || "").trim().slice(0, 40), trusted, mint })); } catch (e) {} };
  for (const t of ["click", "input", "keydown", "change", "pointerdown"]) document.addEventListener(t, (e) => ev(t, e.target, e.isTrusted), true);
  const post = (path, body) => { const x = new XMLHttpRequest(); x.open("POST", path, false); x.send(JSON.stringify(body)); return JSON.parse(x.responseText || "{}"); };
  const $ = (id) => document.getElementById(id);
  setInterval(() => { try { $("chipsol").textContent = post("/__sol", {}).sol; $("wsol").textContent = post("/__wsol", {}).sol; } catch (e) {} }, 250);
  $("itoggle").onclick = () => { $("iw").style.display = $("iw").style.display === "none" ? "" : "none"; };
  for (const b of document.querySelectorAll(".ip, #decoy, .dp")) b.onclick = () => post("/__buy", { mint, amount: b.textContent.trim(), via: b.id });
  for (const b of document.querySelectorAll(".isp")) b.onclick = () => { const r = post("/__bal", { mint }); post("/__sell", { mint, amount: String(r.ui * parseFloat(b.textContent) / 100), via: b.id }); };
})();
</script>`;
function instantPage(v, mint, sol, wsol = sol) {
  const header = `<header style="display:flex;gap:12px;align-items:center;height:48px"><a href="/">GMGN</a><span>MC $48K</span>
    <div id="chip" style="display:flex;gap:4px;align-items:center"><img alt="SOL" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14'%3E%3Ccircle cx='7' cy='7' r='7'/%3E%3C/svg%3E" width="14" height="14"><span id="chipsol">${sol}</span></div>
    <button id="itoggle"> Instant trade</button></header>`;
  const decoys = `<div id="quick" style="display:flex;gap:6px"><span>Quick buy</span><div id="decoy" style="cursor:pointer">0.01618</div></div>
  <div id="dryflip" style="width:260px;border:1px dashed #888;padding:4px"><b>DryFlip</b><div>Buy</div><div class="dp" id="dp0" style="cursor:pointer">0.01618</div><div>Sell</div><div class="dp" id="dp1" style="cursor:pointer">100%</div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>$PEPE | GMGN fake</title></head><body style="margin:0">${header}<main><div id="chart" style="height:120px">chart</div>${decoys}</main>${instantWindow(v, "PEPE", wsol)}${INSTANT_SCRIPT}</body></html>`;
}

function page(v, mint) {
  const header = `<header style="display:flex;gap:12px;align-items:center"><a href="/">GMGN</a><span>MC $48K</span><button id="wal" aria-label="${WALLET_LABEL}">${WALLET_LABEL}</button>${v === "phantom" ? "<span>Phantom</span>" : ""}</header>`;
  const main = v === "iframe" ? `<iframe id="tf" src="/box/${mint}" style="width:360px;height:320px;border:0"></iframe>` : tradeBox(v);
  return `<!doctype html><html><head><meta charset="utf-8"><title>$PEPE | GMGN fake</title></head><body>${header}<main><div id="chart" style="height:120px">chart</div>${main}</main>${SCRIPT}</body></html>`;
}
function boxPage(v, mint) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.__mint=${JSON.stringify(mint)}</script>${tradeBox(v)}${SCRIPT}</body></html>`;
}

/** A local server for the token page. srv.variant can be changed between page loads. */
export async function startFakeGmgn({ chain = null, variant = "normal", pxOf = () => 4.8e-5 } = {}) {
  const srv = { variant, events: [], buys: [], sells: [], pxOf, chain };
  const body = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch { ok({}); } }); });
  srv.server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const v = u.searchParams.get("v") || srv.variant;
    const send = (code, type, text) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(text); };
    if (req.method === "GET" && /^\/sol\/token\/[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(u.pathname)) {
      const mint = u.pathname.split("/").pop();
      const wsol = srv.chain ? (await srv.chain.solBalance()).toFixed(5) : "0.13300";
      if (v === "loggedOut") return send(200, "text/html", `<!doctype html><html><body><header><a href="/">GMGN</a><button>Log in</button></header><main>chart</main></body></html>`);
      if (v === "instant" || v === "instantClosed") return send(200, "text/html", instantPage(v, mint, srv.chip || (srv.chain ? (await srv.chain.solBalance()).toFixed(3) : "0.133"), wsol));
      return send(200, "text/html", page(v, mint));
    }
    if (req.method === "GET" && /^\/box\//.test(u.pathname)) return send(200, "text/html", boxPage(v, u.pathname.split("/").pop()));
    if (req.method === "POST" && u.pathname === "/__ev") { srv.events.push(await body(req)); return send(200, "application/json", "{}"); }
    if (req.method === "POST" && u.pathname === "/__sol") return send(200, "application/json", JSON.stringify({ sol: srv.chip || (srv.chain ? (await srv.chain.solBalance()).toFixed(3) : "0.133") }));
    if (req.method === "POST" && u.pathname === "/__wsol") return send(200, "application/json", JSON.stringify({ sol: srv.chain ? (await srv.chain.solBalance()).toFixed(5) : "0.13300" }));
    if (req.method === "POST" && u.pathname === "/__bal") { const j = await body(req); const t = srv.chain ? await srv.chain.tokenBalance(j.mint) : { ui: 0 }; return send(200, "application/json", JSON.stringify({ ui: t.ui })); }
    if (req.method === "POST" && u.pathname === "/__buy") { const j = await body(req); srv.buys.push(j); if (srv.chain) srv.chain.buy(j.mint, Number(j.amount), srv.pxOf(j.mint)); return send(200, "application/json", "{}"); }
    if (req.method === "POST" && u.pathname === "/__sell") { const j = await body(req); srv.sells.push(j); if (srv.chain) srv.chain.sell(j.mint, Number(j.amount), srv.pxOf(j.mint)); return send(200, "application/json", "{}"); }
    send(404, "text/plain", "no");
  });
  await new Promise((ok) => srv.server.listen(0, "127.0.0.1", ok));
  srv.port = srv.server.address().port;
  srv.base = `http://127.0.0.1:${srv.port}`;
  srv.url = (mint, v = null) => `${srv.base}/sol/token/${mint}${v ? `?v=${v}` : ""}`;
  srv.clicks = (pred = () => true) => srv.events.filter((e) => e.type === "click" && pred(e));
  srv.close = () => new Promise((ok) => srv.server.close(ok));
  return srv;
}

/** https://gmgn.ai/** is answered by the local server; every other request is aborted. */
export async function routeGmgn(context, srv) {
  await context.route("**/*", (r) => (/^http:\/\/127\.0\.0\.1:/.test(r.request().url()) ? r.continue() : r.abort()));
  await context.route("https://gmgn.ai/**", async (r) => {
    const u = new URL(r.request().url());
    try { const resp = await r.fetch({ url: `${srv.base}${u.pathname}${u.search}` }); await r.fulfill({ response: resp }); } catch { await r.abort().catch(() => {}); }
  });
}
