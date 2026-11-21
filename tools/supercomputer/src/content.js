// supercomputer: an eyes-only widget on Kraken Pro. It reads public prices, never the account, never clicks.
import { CONFIG } from "./config.js";
import MODEL from "../model/model.json";
import { fillGaps } from "./lib/indicators.js";
import { columns, features, setupTags } from "./lib/features.js";
import { read, verdict } from "./lib/model.js";
import { plan, DEFAULTS, limits, leverageFor } from "./lib/plan.js";
import { loadMarkets, resolve, detectBase, bars1m, lastPrice, spotTickers } from "./lib/kraken.js";
import { shouldLog, makeCall, settle, tally, prune } from "./lib/score.js";
import * as grok from "./lib/grok.js";
import * as news from "./lib/news.js";
import { Chart } from "./chart.js";
import { detect, LABEL, DIR } from "./lib/patterns.js";
import { rank, learn, makeRec, settleRec } from "./lib/recs.js";
import { CSS } from "./style.js";


function start() {
  // ---------- small helpers ----------
  const msg = (m) => new Promise((res, rej) => chrome.runtime.sendMessage(m, (r) => (chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : r && r.ok ? res(r.data) : rej(new Error(r ? r.error : "no reply")))));
  const get = (url) => msg({ type: "get", url });
  const store = { get: (k) => chrome.storage.local.get(k).then((o) => o[k]), set: (k, v) => chrome.storage.local.set({ [k]: v }) };
  const ATH = "Europe/Athens";
  const clock = (sec, s) => new Intl.DateTimeFormat("en-GB", { timeZone: ATH, hour: "2-digit", minute: "2-digit", ...(s ? { second: "2-digit" } : {}), hour12: false }).format(new Date(sec * 1000));
  const athensHM = () => { const [h, m] = clock(Date.now() / 1000).split(":").map(Number); return h * 60 + m; };
  const hm = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
  const $ = (sel) => root.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const pc = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
  const usd = (x) => `$${Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let decimals = 2;
  const fmt = (x, dec = decimals) => (x == null || !Number.isFinite(x) ? "–" : Number(x).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  const raw = (x, dec = decimals) => Number(x).toFixed(dec);
  const decOf = (tick) => Math.max(0, Math.min(10, Math.round(-Math.log10(tick || 0.01))));

  // ---------- state ----------
  const S = { settings: { ...DEFAULTS }, markets: [], mkt: null, override: null, detected: null, bars: [], f: null, r5: null, r15: null, plan: null,
    price: null, live: "starting", lastTick: 0, calls: [], movers: [], moverCache: {}, news: null, newsItems: [], grokByCoin: {}, recs: [], best: null, ranked: [], cancelled: null, update: null, tab: null, collapsed: false, corner: "bl", pageLev: null, err: null };

  // ---------- DOM (shadow root so Kraken's styles never touch it) ----------
  const host = el("div"); host.id = "supercomputer-root";
  host.style.cssText = "position:fixed;z-index:2147483646;left:16px;bottom:16px;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${CSS}</style>
  <div class="pill" part="pill"><span class="pdot"></span><span class="pcoin">–</span><span class="parrow"></span><span class="ppct"></span></div>
  <div class="card">
    <header class="drag">
      <div class="coin"><button class="coinbtn" title="Change coin"><span class="cname">–</span><span class="chev">⌄</span></button><span class="src"></span></div>
      <div class="tools"><button class="ico gear" title="Settings">${ICON.gear}</button><button class="ico min" title="Minimise">${ICON.min}</button></div>
    </header>
    <div class="priceRow"><div class="price">–</div><div class="sess"></div></div>
    <select class="picker" hidden></select>
    <canvas class="chart"></canvas>
    <div class="legend"><span><i style="background:#64D2FF"></i>5 min</span><span><i style="background:#BF5AF2"></i>15 min</span><span class="lg"><i style="background:#FF9F0A"></i>Grok</span></div>
    <div class="calls"><div class="call c5"></div><div class="call c15"></div></div>
    <div class="verdict"></div>
    <div class="best"></div>
    <div class="plan" hidden></div>
    <nav class="tabs"><button data-t="movers">Movers</button><button data-t="news">News</button><button data-t="grok">Grok</button><button data-t="score">Score</button></nav>
    <section class="tabbody" hidden></section>
    <footer><span class="build">build ${CONFIG.build}</span><span class="dot">·</span><span class="clock"></span><span class="dot">·</span><span class="feed"></span><span class="upd"></span></footer>
    <div class="sheet" hidden></div>
  </div>`;
  (document.body || document.documentElement).appendChild(host);
  const card = $(".card"), pill = $(".pill");
  const chart = new Chart($(".chart"));

  // ---------- position: snaps to the nearest corner, remembered ----------
  function place() {
    const m = 16, s = host.style; s.left = s.right = s.top = s.bottom = "";
    if (S.corner[0] === "t") s.top = m + "px"; else s.bottom = m + "px";
    if (S.corner[1] === "l") s.left = m + "px"; else s.right = m + "px";
    card.hidden = S.collapsed; pill.hidden = !S.collapsed;
  }
  function draggable(handle, isPill) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (!isPill && e.target.closest("button,select,input,textarea"))) return;
      const r = host.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top; let moved = false;
      const mv = (ev) => { if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return; moved = true; host.classList.add("dragging");
        const s = host.style; s.right = s.bottom = ""; s.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + "px"; s.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + "px"; };
      const up = (ev) => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); host.classList.remove("dragging");
        if (moved) { const b = host.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; S.corner = (cy < innerHeight / 2 ? "t" : "b") + (cx < innerWidth / 2 ? "l" : "r"); savePos(); place(); }
        else if (isPill) { S.collapsed = false; savePos(); place(); } };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    });
  }
  const savePos = () => store.set("pos", { corner: S.corner, collapsed: S.collapsed, tab: S.tab });
  draggable($(".drag"), false); draggable(pill, true);
  $(".min").onclick = () => { S.collapsed = true; savePos(); place(); };

  // ---------- coin picker (overrides what the page shows) ----------
  $(".coinbtn").onclick = () => { const p = $(".picker"); p.hidden = !p.hidden; if (!p.hidden) p.focus(); };
  $(".picker").onchange = (e) => { S.override = e.target.value || null; store.set("override", S.override); e.target.hidden = true; pickMarket(); };
  function fillPicker() {
    const p = $(".picker");
    p.innerHTML = `<option value="">Follow the page${S.detected ? ` (${S.detected.base})` : ""}</option>` + S.markets.map((m) => `<option value="${m.base}" ${S.override === m.base ? "selected" : ""}>${m.name}${m.source === "futures" ? " · perp" : ""}</option>`).join("");
  }

  // ---------- tabs ----------
  root.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { S.tab = S.tab === b.dataset.t ? null : b.dataset.t; savePos(); renderTab(); }));
  const markTabs = () => root.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === S.tab));

  // ---------- settings sheet ----------
  const FIELDS = [["accountSize", "Account size", "$"], ["equityNow", "Equity now", "$"], ["dayStartBalance", "Balance at 02:30 Athens", "$"], ["maxLossPerTrade", "Max loss per trade", "$"],
    ["dailyLossPct", "Max daily loss", "%"], ["maxDrawdownPct", "Max drawdown", "%"], ["targetPct", "Profit target", "%"], ["levBTC", "Leverage BTC", "x"], ["levETH", "Leverage ETH", "x"],
    ["levOther", "Leverage others", "x"], ["feePerSidePct", "Fee per side", "%"], ["minLiquidityUSD", "Movers: min 24h volume", "$"], ["minRange24hPct", "Movers: min 24h range", "%"], ["sessionFrom", "Best hours from", ""], ["sessionTo", "Best hours to", ""]];
  $(".gear").onclick = () => {
    const sh = $(".sheet"); if (!sh.hidden) { sh.hidden = true; return; }
    const L = limits(S.settings);
    sh.innerHTML = `<div class="shead"><b>Settings</b><button class="done">Done</button></div>
      <div class="grid">${FIELDS.map(([k, label, u]) => `<label><span>${label}</span><div class="inp"><input data-k="${k}" value="${esc(S.settings[k])}" inputmode="decimal"><em>${u}</em></div></label>`).join("")}</div>
      <p class="fine">Daily floor ${usd(L.dailyFloor)} · drawdown floor ${usd(L.ddFloor)} · target ${usd(L.target)}. supercomputer never reads your account: type your equity here after each trade.</p>
      <div class="sbtns"><button class="chk">Check for update</button></div>`;
    sh.hidden = false;
    sh.querySelector(".done").onclick = () => { sh.hidden = true; };
    sh.querySelector(".chk").onclick = async () => { try { S.update = await msg({ type: "checkUpdate" }); } catch (e) { S.update = { state: "error", error: e.message }; } renderFooter(); };
    sh.querySelectorAll("input").forEach((i) => (i.onchange = () => { const k = i.dataset.k, v = typeof DEFAULTS[k] === "number" ? Number(String(i.value).replace(/[$,%x\s]/g, "")) : i.value.trim();
      if (typeof DEFAULTS[k] === "number" && !Number.isFinite(v)) { i.value = S.settings[k]; return; } S.settings[k] = v; store.set("settings", S.settings); recompute(); }));
  };

  // ---------- data: markets, bars, live price ----------
  async function loadAll() {
    const cached = await store.get("markets");
    if (cached && cached.v === 2 && Date.now() - cached.at < 6 * 3600e3 && cached.list.length) S.markets = cached.list;
    else { S.markets = await loadMarkets(get); store.set("markets", { v: 2, at: Date.now(), list: S.markets }); }
    fillPicker();
  }
  function pageCoin() { return detectBase(location.href, document.title); }
  function pickMarket() {
    S.detected = pageCoin();
    const base = S.override || (S.detected && S.detected.base);
    const m = base ? resolve(S.markets, base) : resolve(S.markets, "BTC");
    if (!m) { S.err = base ? `${base} is not a Kraken USD market` : null; render(); return; }
    if (S.mkt && S.mkt.key === m.key) return;
    S.mkt = m; S.bars = []; S.f = S.r5 = S.r15 = S.plan = null; S.price = null; decimals = decOf(m.tick); S.err = null; chart.view = null; chart.shown = null;
    fillPicker(); render(); refreshBars(); openLive(); refreshNews();
  }
  async function refreshBars() {
    const m = S.mkt; if (!m) return;
    try {
      const bars = fillGaps(await bars1m(get, m));
      if (m !== S.mkt) return;
      S.bars = bars; S.err = null; recompute();
      settleCalls(m, bars); settleRecs(m.base, bars);
    } catch (e) { S.err = `Kraken data: ${e.message}`; render(); }
  }
  function recompute() {
    const m = S.mkt; if (!m || S.bars.length < 2) return render();
    const col = columns(S.bars), f = features(col, col.n - 1);
    S.f = f; S.pats = [];
    if (f) { const det = detect(col, col.n - 1); f.px = det.x; S.pats = patList(det.hits); }
    if (f) {
      S.r5 = read(MODEL, f, "5"); S.r15 = read(MODEL, f, "15");
      if (m.source !== "spot" || m.kind !== "crypto") { S.r5.edge = S.r15.edge = false; S.r5.untested = S.r15.untested = true; }
      const best = [S.r15, S.r5].find((r) => r.edge) || S.r15;
      S.plan = plan(MODEL, f, best, settingsFor(m), instFor(m));
      logCalls(m, f);
    }
    if (S.price == null) S.price = S.bars[S.bars.length - 1].c;
    render();
  }
  // detected patterns with their measured out-of-sample record (15-minute horizon)
  function patList(hits) {
    const st = MODEL.horizons["15"].patternStats || {};
    return Object.entries(hits).map(([name, lines]) => ({ name, label: LABEL[name], dir: DIR[name], lines, test: st[name] ? st[name].test : null, used: !!(st[name] && st[name].used) }));
  }
  const patWhy = (pats) => pats.map((p) => `${p.label}${p.test ? ` (tested ${pc(p.test.hit, 0)} on ${p.test.n.toLocaleString("en-US")}${p.used ? "" : ", context only"})` : ""}`).join(", ");
  const instFor = (m) => ({ base: m.base, tick: m.tick, qtyInc: m.qtyInc, minQty: m.minQty });
  function settingsFor(m) {
    const s = { ...S.settings };
    const lev = S.pageLev && S.pageLev.base === m.base ? S.pageLev.lev : null; // leverage printed on the Prop page wins
    if (lev) { s.levBTC = s.levETH = s.levOther = lev; }
    return s;
  }

  // live price: Kraken WebSocket v2 ticker for spot; if it cannot open (page rules, network), poll REST via the background.
  let ws = null, poll = null;
  function openLive() {
    try { ws && ws.close(); } catch {} ws = null; clearInterval(poll); poll = null;
    const m = S.mkt; if (!m) return;
    const startPoll = () => { if (poll) return; S.live = "polling"; poll = setInterval(async () => { try { const p = await lastPrice(get, m); if (m === S.mkt && p) tick(p); } catch {} }, 2000); };
    if (m.source !== "spot") return startPoll();
    try {
      const sock = new WebSocket("wss://ws.kraken.com/v2"); ws = sock;
      const fallback = setTimeout(() => { if (S.live !== "websocket") startPoll(); }, 6000);
      sock.onopen = () => sock.send(JSON.stringify({ method: "subscribe", params: { channel: "ticker", symbol: [m.name] } }));
      sock.onmessage = (e) => { const d = JSON.parse(e.data); if (d.channel === "ticker" && d.data && d.data[0]) { clearTimeout(fallback); S.live = "websocket"; clearInterval(poll); poll = null; tick(+d.data[0].last); } };
      sock.onclose = () => { if (ws === sock && m === S.mkt) { S.live = "reconnecting"; setTimeout(() => m === S.mkt && openLive(), 3000); } };
      sock.onerror = () => startPoll();
    } catch { startPoll(); }
  }
  function tick(p) { if (!Number.isFinite(p)) return; S.price = p; S.lastTick = Date.now(); renderPrice(); }

  // ---------- scorecard ----------
  function logCalls(m, f) {
    let changed = false;
    for (const r of [S.r5, S.r15]) if (shouldLog(S.calls, m.base, r.h, f.tClose)) { S.calls.push(makeCall(m.base, r, f.tClose, { key: m.key })); changed = true; }
    if (changed) { S.calls = prune(S.calls); store.set("calls", S.calls); }
  }
  function settleCalls(m, bars) {
    let changed = false; const now = Date.now() / 1000;
    S.calls = S.calls.map((c) => {
      if (c.status !== "open") return c;
      if (now - c.tEnd > 11 * 3600) { changed = true; return { ...c, status: "expired" }; }
      if (c.coin !== m.base || c.tEnd > now - 5) return c;
      const s = settle(c, bars); if (s !== c) changed = true; return s;
    });
    if (changed) { store.set("calls", S.calls); if (S.tab === "score") renderTab(); }
  }
  function settleRecs(coin, bars) {
    let changed = false;
    S.recs = S.recs.map((r) => { if (r.coin !== coin || r.status !== "open") return r; const x = settleRec(r, bars, S.settings.feePerSidePct / 100); if (x !== r) changed = true; return x; });
    S.recs = S.recs.map((r) => (r.status === "open" && Date.now() / 1000 - r.t0 > 11 * 3600 ? (changed = true, { ...r, status: "expired" }) : r));
    if (changed) { S.recs = S.recs.slice(-2000); store.set("recs", S.recs); }
  }
  const hourAthens = () => Number(clock(Date.now() / 1000).slice(0, 2));
  function decide() {
    const st = learn(S.recs), cands = Object.values(S.moverCache).filter((x) => Date.now() - x.at < 3 * 60e3).map((x) => ({ coin: x.m.base, name: x.m.name, key: x.m.key, tick: x.m.tick, plan: x.plan, read: x.best, tags: x.tags, pats: x.pats || [], hourAthens: hourAthens() }));
    if (S.mkt && S.f && S.plan && !cands.some((c) => c.coin === S.mkt.base))
      cands.push({ coin: S.mkt.base, name: S.mkt.name, key: S.mkt.key, tick: S.mkt.tick, plan: S.plan, read: [S.r15, S.r5].find((r) => r.edge) || S.r15, tags: setupTags(S.f), pats: S.pats || [], hourAthens: hourAthens() });
    const ranked = rank(cands, st), prev = S.best;
    S.ranked = ranked; S.best = ranked[0] || null; S.scored = S.recs.filter((r) => ["win", "loss", "timeout"].includes(r.status)).length;
    if (prev && !ranked.some((c) => c.coin === prev.coin && c.plan.side === prev.plan.side)) S.cancelled = { name: prev.name, side: prev.plan.side, at: Date.now() };
    if (S.best) {
      const b = S.best, t0 = Math.floor(Date.now() / 60000) * 60;
      if (!S.recs.some((r) => r.coin === b.coin && r.side === b.plan.side && (r.status === "open" || t0 - r.t0 < b.plan.holdMin * 60))) { S.recs.push(makeRec(b, t0)); store.set("recs", S.recs); }
    }
    renderBest();
  }
  function renderBest() {
    const el2 = $(".best"), b = S.best, learnTxt = `learning: ${S.scored || 0} calls scored`;
    const scan = !S.moversAt ? "scanning the liquid Kraken markets" : `scanned ${S.moversLiquid || 0} markets${S.moversAt ? " · " + clock(S.moversAt / 1000) : ""}`;
    if (!b) {
      const c = S.cancelled && Date.now() - S.cancelled.at < 90e3 ? `<div class="gone">Cancelled: ${esc(S.cancelled.name)} ${S.cancelled.side === "up" ? "long" : "short"}, setup gone</div>` : "";
      el2.className = "best"; el2.innerHTML = `<div class="bh"><b>No trade now · waiting</b><span>${learnTxt}</span></div>${c}<div class="bw">${S.standWhy ? esc(S.standWhy) + "<br>" : ""}${scan}. A trade shows only when its tested edge after fees is real.</div>`; return;
    }
    const p = b.plan, d = decOf(b.tick), nx = S.ranked.slice(1, 3).map((x) => `${x.name} ${x.plan.side === "up" ? "▲" : "▼"}`).join(" · ");
    el2.className = "best go" + (p.side === "up" ? "" : " short");
    el2.innerHTML = `<div class="bh"><b>Best trade now: ${esc(b.name)} ${p.side === "up" ? "long" : "short"}</b><span>${learnTxt}</span></div>
      <div class="bw">In ${fmt(p.entry, d)} · SL ${fmt(p.stop, d)} · TP ${fmt(p.tp, d)} · size ${+p.qty.toFixed(6)} (${usd(p.notional)}) · risk ${usd(p.risk)} · reward ${usd(p.reward)}</div>
      <div class="bw">Why: ${Math.round(b.read.shown * 100)}% ${b.read.side} in ${b.read.h} min, that band was right ${pc(b.read.band.test.hit, 1)} on ${b.read.band.test.n.toLocaleString("en-US")} unseen calls and its plan made ${b.read.band.test.plan.netPct.toFixed(2)}% a trade after fees${b.tags.length ? " · " + esc(b.tags.join(", ")) : ""}${b.pats && b.pats.length ? " · pattern: " + esc(patWhy(b.pats)) : ""}${b.learned.why.length ? " · down-weighted: " + esc(b.learned.why.join(", ")) : ""}${nx ? `<br>Next: ${esc(nx)}` : ""}</div>`;
  }
  async function settleOthers() {
    const now = Date.now() / 1000, coins = [...new Set(S.calls.filter((c) => c.status === "open" && c.tEnd < now - 5 && (!S.mkt || c.coin !== S.mkt.base)).map((c) => c.coin))].slice(0, 3);
    for (const b of coins) { const m = resolve(S.markets, b); if (!m) continue; try { settleCalls(m, fillGaps(await bars1m(get, m))); } catch {} }
  }

  // ---------- movers: liquid USD pairs found live, read by the same model ----------
  let moverBusy = false;
  async function refreshMovers() {
    if (moverBusy || document.hidden || !S.markets.length) return; moverBusy = true;
    try {
      const tk = await spotTickers(get), min = S.settings.minLiquidityUSD;
      // liquid and alive: enough 24h volume, and a 24h range wide enough to pay fees (this also drops stablecoins, found live, no list)
      const alive = (x) => x.last > 0 && (x.high - x.low) / x.last * 100 >= S.settings.minRange24hPct;
      const liquid = S.markets.filter((m) => m.source === "spot" && m.kind === "crypto" && tk[m.key] && tk[m.key].volUSD >= min && alive(tk[m.key])).sort((a, b) => tk[b.key].volUSD - tk[a.key].volUSD).slice(0, 30);
      const stale = liquid.filter((m) => !S.moverCache[m.key] || Date.now() - S.moverCache[m.key].at > 60e3).sort((a, b) => (S.moverCache[a.key]?.at || 0) - (S.moverCache[b.key]?.at || 0)).slice(0, 10);
      for (const m of stale) {
        try {
          const bars = fillGaps(await bars1m(get, m)), col = columns(bars), f = features(col, col.n - 1);
          let pats = []; if (f) { const det = detect(col, col.n - 1); f.px = det.x; pats = patList(det.hits); }
          settleRecs(m.base, bars);
          if (f) { const r5 = read(MODEL, f, "5"), r15 = read(MODEL, f, "15"), best = [r15, r5].find((r) => r.edge) || r15;
            S.moverCache[m.key] = { at: Date.now(), m, f, r5, r15, best, pats, tags: setupTags(f), plan: plan(MODEL, f, best, settingsFor(m), instFor(m)), vol: tk[m.key].volUSD }; }
        } catch {}
        decide();
        await new Promise((r) => setTimeout(r, CONFIG.scanGapMs ?? 1500)); // stay inside Kraken's public rate limit
      }
      const keys = new Set(liquid.map((m) => m.key));
      S.movers = Object.values(S.moverCache).filter((x) => keys.has(x.m.key))
        .map((x) => ({ ...x, rank: (x.plan.ok ? 10 : 0) + (x.best.conf - 0.5) * 20 + (x.tags.includes("volume spike") ? 0.6 : 0) + (x.tags.includes("bounce from low") ? 0.6 : 0) - (x.tags.some((t) => t.startsWith("extended")) ? 1 : 0) }))
        .sort((a, b) => b.rank - a.rank).slice(0, 3);
      S.moversAt = Date.now(); S.moversLiquid = liquid.length; decide();
      if (S.tab === "movers") renderTab();
    } catch (e) { S.moversErr = e.message; } finally { moverBusy = false; }
  }

  // ---------- news (context only) ----------
  let newsAt = 0;
  async function refreshNews(force) {
    if (!S.mkt || (!force && Date.now() - newsAt < 5 * 60e3 && S.newsItems.length)) { if (S.mkt) S.news = news.read(S.newsItems, S.mkt.base); return render(); }
    newsAt = Date.now();
    const feeds = S.mkt.base === "XAU" ? news.FEEDS.gold : news.FEEDS.crypto;
    const all = await Promise.all(feeds.map((f) => msg({ type: "feed", url: f.url }).then((x) => news.parseRss(x, f.name)).catch(() => [])));
    S.newsItems = all.flat(); S.news = news.read(S.newsItems, S.mkt.base); render();
  }

  // ---------- page facts: leverage printed next to the market name (e.g. "GOLD 5x") ----------
  function readPageLeverage() {
    const base = S.detected && S.detected.base; if (!base) return;
    const names = new Set([base, ...(base === "XAU" ? ["GOLD"] : []), ...(base === "BTC" ? ["XBT"] : [])]);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n, k = 0;
    while ((n = w.nextNode()) && k++ < 4000) {
      if (host.contains(n.parentNode)) continue;
      const m = /^\s*([A-Z0-9]{2,10})(?:\/USD)?\s+(\d{1,2})x\s*$/.exec(n.nodeValue || "");
      if (m && names.has(m[1])) { const lev = +m[2]; if (!S.pageLev || S.pageLev.lev !== lev) { S.pageLev = { base, lev }; recompute(); } return; }
    }
  }

  // ---------- render ----------
  function renderPrice() {
    if (!S.mkt) return;
    $(".price").textContent = fmt(S.price);
    const ago = (Date.now() - S.lastTick) / 1000;
    $(".feed").textContent = S.mkt.source === "spot" ? (S.live === "websocket" && ago < 30 ? "live" : S.live) : "perp · polling";
    $(".feed").className = "feed " + (ago < 30 ? "on" : "off");
    chart.set({ hist: S.bars.slice(-60).map((b) => ({ t: b.t + 60, c: b.c })), price: S.price, now: Date.now() / 1000, r5: S.r5, r15: S.r15, plan: S.plan, grok: liveGrok(), pattern: (S.pats || [])[0] || null, clock: (t) => clock(t), fmt: (x) => fmt(x) });
  }
  const liveGrok = () => { const g = S.mkt && S.grokByCoin[S.mkt.base]; return g && Date.now() - g.at < 20 * 60e3 ? g : null; };
  function callHTML(r, label) {
    if (!r) return `<div class="lab">${label}</div><div class="big muted">–</div>`;
    const up = r.side === "up", v = verdict(r), sub = r.untested ? "not tested on this market" : r.edge ? `tested ${pc(r.band.test.hit, 1)} · edge` : `tested ${pc(r.band.test.hit, 1)} · no edge`;
    return `<div class="lab">${label}</div><div class="big ${up ? "up" : "dn"} ${r.edge ? "" : "soft"}"><span class="arr">${up ? "▲" : "▼"}</span>${Math.round(r.shown * 100)}<small>%</small></div>
      <div class="rng">${fmt(r.lo)} – ${fmt(r.hi)}</div><div class="tested ${r.edge ? "ok" : ""}" title="${esc(v.why)}">${sub}</div>`;
  }
  function render() {
    place();
    const m = S.mkt;
    $(".cname").textContent = m ? m.name : "–";
    $(".src").textContent = m ? (m.source === "spot" ? "Kraken spot" : "Kraken perp") + (S.override ? " · picked" : S.detected ? "" : " · default") : "";
    const inS = (() => { const a = hm(S.settings.sessionFrom), b = hm(S.settings.sessionTo), t = athensHM(); return a <= b ? t >= a && t < b : t >= a || t < b; })();
    $(".sess").innerHTML = `<span class="sdot ${inS ? "on" : ""}"></span>${inS ? "Your hours" : `Outside ${S.settings.sessionFrom}–${S.settings.sessionTo}`}`;
    $(".c5").innerHTML = callHTML(S.r5, "5 MIN"); $(".c15").innerHTML = callHTML(S.r15, "15 MIN");
    const vd = $(".verdict"), p = S.plan; vd.hidden = false; S.standWhy = null;
    if (S.err) { vd.className = "verdict warn"; vd.textContent = S.err; }
    else if (!S.f) { vd.className = "verdict"; vd.textContent = S.bars.length ? "Not enough history on this market yet." : "Reading 12 hours of Kraken candles…"; }
    else if (S.r5 && S.r5.untested) { vd.hidden = true; S.standWhy = `${m.base}: the model was trained on crypto and has no test here, so no call.`; }
    else if (p && p.ok) { vd.className = "verdict go " + (p.side === "up" ? "up" : "dn"); vd.innerHTML = `<b>${p.side === "up" ? "Long" : "Short"} setup · ${p.h} min</b> · hold up to ${p.holdMin} min`; }
    else { const r = [S.r15, S.r5].find((x) => x && x.band.dirEdge) || S.r15; vd.hidden = true;
      S.standWhy = `${m.base}: ${p && p.reason && !p.reason.startsWith("no edge") ? p.reason : verdict(r).why.replace(/^no edge, stand aside /, "no edge after fees ")}.`; }
    renderBest();
    const pl = $(".plan");
    if (p && p.ok) {
      pl.hidden = false;
      pl.innerHTML = [["Entry", `${fmt(p.zone[0])}–${fmt(p.zone[1])}`, raw(p.entry)], ["Stop", fmt(p.stop), raw(p.stop), "dn"], ["Target", fmt(p.tp), raw(p.tp), "up"],
        ["Size", `${+p.qty.toFixed(8)}`, String(+p.qty.toFixed(8))]].map(([k, v, c, cls]) => `<button class="cell ${cls || ""}" data-copy="${esc(c)}" title="Copy ${k.toLowerCase()}"><span>${k}</span><b>${v}</b></button>`).join("") +
        `<div class="pfine">Risk ${usd(p.risk)} incl. fees · reward ${usd(p.reward)} · ${usd(p.notional)} at ${p.lev}x = ${usd(p.margin)} margin · left today ${usd(p.limits.remDaily)}</div>`;
      pl.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copy(b.dataset.copy, b)));
    } else pl.hidden = true;
    // pill
    const r = S.r5;
    $(".pcoin").textContent = m ? m.base : "–";
    $(".parrow").textContent = r ? (r.side === "up" ? "▲" : "▼") : ""; $(".parrow").className = "parrow " + (r ? (r.side === "up" ? "up" : "dn") : "");
    $(".ppct").textContent = r ? `${Math.round(r.shown * 100)}%` : ""; $(".pdot").className = "pdot " + (p && p.ok ? "go" : "");
    $(".lg").style.opacity = liveGrok() ? 1 : 0.35;
    renderPrice(); renderTab(); renderFooter();
  }
  function renderFooter() {
    $(".clock").textContent = clock(Date.now() / 1000, true) + " Athens";
    const u = S.update, up = $(".upd");
    if (u && u.state === "ready") { up.innerHTML = `<button class="updbtn">Update ready · build ${esc(u.build)}</button>`;
      up.querySelector("button").onclick = async () => { try { await msg({ type: "download" }); up.innerHTML = `<span class="fine">Downloaded. Unzip it over the old folder, then reload supercomputer in chrome://extensions.</span>`; } catch (e) { up.textContent = e.message; } }; }
    else up.textContent = "";
  }
  function renderTab() {
    markTabs(); const b = $(".tabbody"); if (!S.tab) { b.hidden = true; return; } b.hidden = false;
    if (S.tab === "movers") {
      if (!S.movers.length) { b.innerHTML = `<p class="fine">${S.moversErr ? esc(S.moversErr) : "Reading the liquid Kraken USD pairs…"}</p>`; return; }
      b.innerHTML = S.movers.map((x) => { const r = x.best, up = r.side === "up";
        return `<div class="mv"><div class="mvh"><b>${x.m.name}</b><span class="${up ? "up" : "dn"}">${up ? "▲" : "▼"} ${Math.round(r.shown * 100)}% · ${r.h}m</span></div>
        <div class="mvt">${[...x.tags, ...(x.pats || []).map((p) => p.label)].slice(0, 2).map((t) => `<em>${esc(t)}</em>`).join("") || "<em>quiet</em>"}<span>$${(x.vol / 1e6).toFixed(1)}M 24h</span></div>
        ${x.plan.ok ? `<div class="mvp">In ${fmt(x.plan.entry, decOf(x.m.tick))} · SL ${fmt(x.plan.stop, decOf(x.m.tick))} · TP ${fmt(x.plan.tp, decOf(x.m.tick))} · ${+x.plan.qty.toFixed(6)}</div>` : `<div class="mvp muted">${esc(x.plan.reason)}</div>`}</div>`; }).join("") +
        `<p class="fine">${S.moversLiquid} pairs over $${(S.settings.minLiquidityUSD / 1e6).toFixed(0)}M volume · updated ${clock(S.moversAt / 1000)}</p>`;
    } else if (S.tab === "news") {
      const n = S.news;
      if (!n || !n.items.length) { b.innerHTML = `<p class="fine">No fresh headline about ${esc(S.mkt ? S.mkt.base : "this coin")} in the last 12 hours.</p>`; return; }
      b.innerHTML = `<div class="nl ${n.lean > 0 ? "up" : n.lean < 0 ? "dn" : ""}">${n.label}${n.scope === "market" ? " (market-wide)" : ""}</div>` + n.items.map((x) => `<a class="nw" href="${esc(x.link)}" target="_blank" rel="noopener"><span class="nd ${x.score > 0 ? "up" : x.score < 0 ? "dn" : ""}"></span><span class="nt">${esc(x.title)}</span><span class="nm">${esc(x.source)} · ${clock(x.t / 1000)}</span></a>`).join("") +
        `<p class="fine">Context only. Headlines have no tested link to the next 15 minutes, so they never change the call.</p>`;
    } else if (S.tab === "grok") {
      const g = S.mkt && S.grokByCoin[S.mkt.base];
      b.innerHTML = `<div class="grow"><button class="gcopy">Copy prompt for Grok</button></div>
        <textarea class="gpaste" placeholder="Paste Grok's whole reply here"></textarea>
        <div class="gres">${g ? grokHTML(g) : `<p class="fine">Grok ends its reply with a GROK {…} line. Paste it and its call appears here and on the chart.</p>`}</div>`;
      b.querySelector(".gcopy").onclick = (e) => copy(grok.prompt({ coin: S.mkt ? S.mkt.name : "?", price: S.price, atAthens: clock(Date.now() / 1000), r5: S.r5, r15: S.r15, f: S.f }), e.target);
      b.querySelector(".gpaste").oninput = (e) => { const g2 = grok.parse(e.target.value);
        if (g2 && S.mkt) { S.grokByCoin[S.mkt.base] = { ...g2, at: Date.now() }; store.set("grok", S.grokByCoin); b.querySelector(".gres").innerHTML = grokHTML(S.grokByCoin[S.mkt.base]); render(); }
        else if (e.target.value.trim()) b.querySelector(".gres").innerHTML = `<p class="fine warn">No GROK {…} line found yet.</p>`; };
    } else if (S.tab === "score") {
      const T = tally(S.calls), E = tally(S.calls, Date.now(), (c) => c.edge), row = (k, h) => { const x = T[k + h]; return `<td>${x.rate == null ? "–" : pc(x.rate)}</td><td class="n">${x.hit}/${x.hit + x.miss}${x.open ? ` · ${x.open} open` : ""}</td>`; };
      const band = (h) => MODEL.horizons[h].bands.map((bd) => `<tr><td>${Math.round(bd.lo * 100)}–${Math.min(100, Math.round(bd.hi * 100))}%</td><td>${pc(bd.test.hit, 1)}</td><td class="n">${bd.test.n.toLocaleString("en-US")}</td><td class="${bd.edge ? "ok" : "muted"}">${bd.edge ? "edge" : bd.dirEdge ? "fees eat it" : "none"}</td></tr>`).join("");
      b.innerHTML = `<table class="sc"><tr><th></th><th colspan="2">5 min</th><th colspan="2">15 min</th></tr><tr><td>Today</td>${row("today", 5)}${row("today", 15)}</tr><tr><td>All time</td>${row("all", 5)}${row("all", 15)}</tr></table>
        <p class="fine">Live calls logged here, marked when each window closes. Edge-band calls so far: ${E.all5.hit + E.all15.hit}/${E.all5.hit + E.all5.miss + E.all15.hit + E.all15.miss}.</p>
        <div class="bt"><b>Tested on unseen data</b> · ${esc(MODEL.split.testFrom.slice(0, 10))} to ${esc(MODEL.to.slice(0, 10))}</div>
        <table class="sc bands"><tr><th>Sure</th><th>5m right</th><th>calls</th><th></th></tr>${band("5")}</table>
        <table class="sc bands"><tr><th>Sure</th><th>15m right</th><th>calls</th><th></th></tr>${band("15")}</table>
        <p class="fine">${esc(MODEL.coins.join(", "))} · ${esc(MODEL.source.split("(")[0])}· fees ${(MODEL.feePerSide * 100).toFixed(2)}% a side.</p>`;
    }
  }
  function grokHTML(g) {
    const side = (s, p) => (s ? `<span class="${s === "up" ? "up" : s === "down" ? "dn" : ""}">${s === "up" ? "▲" : s === "down" ? "▼" : "•"} ${p != null ? Math.round(p * 100) + "%" : ""}</span>` : "–");
    const agree = (gs, r) => (!gs || !r ? "" : gs === r.side ? `<em class="ok">agrees</em>` : `<em class="warn">disagrees</em>`);
    return `<table class="sc"><tr><th></th><th>Grok</th><th>Model</th><th></th></tr>
      <tr><td>5 min</td><td>${side(g.h5, g.p5)}</td><td>${S.r5 ? side(S.r5.side, S.r5.shown) : "–"}</td><td>${agree(g.h5, S.r5)}</td></tr>
      <tr><td>15 min</td><td>${side(g.h15, g.p15)}</td><td>${S.r15 ? side(S.r15.side, S.r15.shown) : "–"}</td><td>${agree(g.h15, S.r15)}</td></tr></table>
      ${g.entry || g.stop || g.tp ? `<p class="fine">Grok: in ${fmt(g.entry)} · SL ${fmt(g.stop)} · TP ${fmt(g.tp)}</p>` : ""}${g.note ? `<p class="fine">“${esc(g.note)}”</p>` : ""}
      <p class="fine">Pasted ${clock(g.at / 1000)} · shown on the chart for 20 min.</p>`;
  }
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
    btn.classList.add("copied"); setTimeout(() => btn.classList.remove("copied"), 900);
  }

  // ---------- clockwork: everything refreshes by itself ----------
  (async () => {
    const [st, pos, ov, calls, gk, upd] = await Promise.all(["settings", "pos", "override", "calls", "grok", "update"].map(store.get));
    if (st) S.settings = { ...DEFAULTS, ...st };
    if (pos) { S.corner = pos.corner || "bl"; S.collapsed = !!pos.collapsed; S.tab = pos.tab || null; }
    S.recs = (await store.get("recs")) || [];
    S.override = ov || null; S.calls = calls || []; S.grokByCoin = gk || {}; S.update = upd || null;
    render();
    try { await loadAll(); } catch (e) { S.err = `Kraken markets: ${e.message}`; render(); }
    pickMarket();
    let lastUrl = location.href + document.title;
    setInterval(() => { const u = location.href + document.title; if (u !== lastUrl) { lastUrl = u; pickMarket(); } }, 1000);
    // a closed candle every minute: re-read 2 s after it closes, plus a light refresh every 15 s so a missed beat heals
    const beat = () => { const ms = 60000 - (Date.now() % 60000) + 2000; setTimeout(() => { refreshBars(); settleOthers(); beat(); }, ms); };
    beat(); setInterval(() => !document.hidden && refreshBars(), 15000);
    setInterval(() => { renderFooter(); if (S.mkt && Date.now() - S.lastTick > 30000) renderPrice(); }, 1000);
    setInterval(readPageLeverage, 5000); readPageLeverage();
    setInterval(() => refreshNews(), 5 * 60e3);
    setTimeout(refreshMovers, CONFIG.moversDelayMs ?? 4000); setInterval(refreshMovers, 10e3); setInterval(() => decide(), 5000);
    chrome.storage.onChanged.addListener((ch) => { if (ch.update) { S.update = ch.update.newValue; renderFooter(); } });
  })();
}

const ICON = {
  gear: `<svg viewBox="0 0 20 20" width="15" height="15"><path fill="currentColor" d="M10 6.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Zm0 5.3a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8Zm7.3-3.1-1.5-.3a6 6 0 0 0-.6-1.4l.9-1.3a.8.8 0 0 0-.1-1l-.8-.8a.8.8 0 0 0-1-.1l-1.3.9a6 6 0 0 0-1.4-.6l-.3-1.5a.8.8 0 0 0-.8-.7H9.6a.8.8 0 0 0-.8.7l-.3 1.5a6 6 0 0 0-1.4.6l-1.3-.9a.8.8 0 0 0-1 .1l-.8.8a.8.8 0 0 0-.1 1l.9 1.3a6 6 0 0 0-.6 1.4l-1.5.3a.8.8 0 0 0-.7.8v1.1c0 .4.3.7.7.8l1.5.3c.1.5.3 1 .6 1.4l-.9 1.3a.8.8 0 0 0 .1 1l.8.8c.3.3.7.3 1 .1l1.3-.9c.4.3.9.5 1.4.6l.3 1.5c.1.4.4.7.8.7h1.1c.4 0 .7-.3.8-.7l.3-1.5c.5-.1 1-.3 1.4-.6l1.3.9c.3.2.7.2 1-.1l.8-.8c.3-.3.3-.7.1-1l-.9-1.3c.3-.4.5-.9.6-1.4l1.5-.3c.4-.1.7-.4.7-.8V9.6a.8.8 0 0 0-.7-.8Z"/></svg>`,
  min: `<svg viewBox="0 0 20 20" width="15" height="15"><path fill="currentColor" d="M5 10.75h10a.75.75 0 0 0 0-1.5H5a.75.75 0 0 0 0 1.5Z"/></svg>`,
};

if (!window.__supercomputer) {
  window.__supercomputer = true;
  start();
}
