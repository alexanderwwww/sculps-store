// SYMBIOTE Durable Object: one instance ("main") that listens to every pump.fun launch and every curve trade, paper-trades
// each launch in two lanes (rules.mjs) and writes batches into mob_aq_sym_* every FLUSH_MS. PAPER ONLY: this file and every
// file it imports never import the wallet, the signer, live orders, payouts or Phantom (test/symbiote.test.mjs proves it).
//  Launches: PumpPortal wss://pumpportal.fun/api/data {"method":"subscribeNewToken"} (free, no key; read live 2026-11-18).
//  Trades, storage key "source" (POST /api/aq/sym/source), measured by the probe from Cloudflare on 2026-11-18:
//   "helius" logsSubscribe on the pump program, every trade with its wallet, decoded with pump.fun's own IDL:
//            234 notifications/s, ~41 GB/day = ~825,000 Helius credits/day (25M a month: the Business plan).
//   "curve"  programSubscribe on the pump program's bonding-curve accounts (Helius): the reserves after every trade, so
//            the price of every coin, but no wallet: 38/s, ~1.9 GB/day = ~38,000 credits/day (1.15M a month: Developer plan).
//            Coins are matched by their curve address from the launch (PumpPortal's bondingCurveKey).
//   "public" the free public node: it refused Cloudflare (HTTP 403) on 2026-11-18, kept only for completeness.
//   "off"    (the default) launches only; every launch is then logged as missed with that reason. Helius credits are shared
//            with the live trader's sends, so the stream is switched on only by a decision, never by default.
import { db } from "../../db.mjs";
import { eventsFromLogs } from "./decode.mjs";
import { createEngine, GTA_MAIN } from "./rules.mjs";
import { deepCheck } from "./health.mjs";
import { flush, writeRight, retention } from "./store.mjs";
import { openWs, wsText, logsSub, programSub, heliusWss, PUBLIC_WSS } from "./probe.mjs";
import { decodeCurve } from "./decode.mjs";

export const PUMPPORTAL_WSS = "wss://pumpportal.fun/api/data";
export const CREDIT_CAP_DAY = 150000;
const FRESH_VTOK = 1.0e15, RESOLVE_PER_TICK = 5; // 5 a tick, one after another = 1 call/s at most
const CURVE_TTL_MS = 6 * 3600000, CHECKED_TTL_MS = 24 * 3600000;
const FLUSH_MS = 5000, STALE_MS = 60000, FEED_MAX = 40;

export class Symbiote {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.vetoes = new Set();
    this.eng = createEngine({ isVetoed: (m) => this.vetoes.has(m) });
    this.ws = { pp: null, chain: null }; this.lastMsg = { pp: 0, chain: 0 }; this.reconnects = { pp: 0, chain: 0 };
    this.win = []; this.notes = 0; this.bytes = 0; this.feed = []; this.queue = []; this.checked = new Map();
    this.started = 0; this.lastVeto = 0; this.curves = new Map(); this.curveAt = new Map(); this.resolveQ = new Set(); this.launchQ = new Set(); this.lastPrune = 0; this.lastGta = 0; this.errors = [];
  }
  d() { return db(this.env); }
  err(where, e) { this.errors.unshift({ at: new Date().toISOString(), where, msg: String(e?.message || e).slice(0, 200) }); this.errors.length = Math.min(this.errors.length, 8); }

  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/config" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (!["public", "helius", "curve", "off"].includes(b.source)) return Response.json({ error: "source must be helius, curve, public or off" }, { status: 400 });
      await this.ctx.storage.put("source", b.source); try { this.ws.chain?.close(1000, "source changed"); } catch {} this.ws.chain = null;
    }
    await this.start();
    return Response.json(this.status());
  }

  async start() {
    if (!this.started) {
      this.started = Date.now();
      const saved = await this.ctx.storage.get("stats"); if (saved) Object.assign(this.eng.stats, saved);
      const g = await this.ctx.storage.get("guard"); if (g) { this.cday = g.day; this.cused = g.used || 0; this.paused = !!g.paused; } // the guard survives a restart
      // coins that were live when the object last stopped cannot be measured any more: logged as missed, never silently dropped
      try {
        const lost = await this.d().q(`UPDATE mob_aq_sym_coins SET done = true, end_reason = 'restart', updated_at = now() WHERE NOT done RETURNING mint, symbol, n`);
        const never = lost.filter((c) => !c.n);
        if (lost.length) await this.d().q(`INSERT INTO mob_aq_sym_missed (mint, symbol, reason) SELECT mint, symbol, 'symbiote restarted while the coin was live' FROM json_to_recordset($1::json) AS x(mint text, symbol text) ON CONFLICT (mint) DO NOTHING`, [JSON.stringify(lost)]);
        this.eng.stats.missed += never.length; if (saved) this.eng.stats.restarts = (this.eng.stats.restarts || 0) + 1; this.eng.stats.lostAtRestart = (this.eng.stats.lostAtRestart || 0) + lost.length;
      } catch (e) { this.err("restart", e); }
    }
    await this.connect();
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + FLUSH_MS);
  }

  // Decision 2026-11-18 (coordinator for Alex): curve mode ON by default on the Developer plan (10M credits a month).
  async source() { return (await this.ctx.storage.get("source")) || (this.env.HELIUS_API_KEY ? "curve" : "off"); }
  // CREDIT GUARD: symbiote may spend at most CREDIT_CAP_DAY Helius credits a UTC day (stream at 20 credits per MB + 2 per
  // resolved curve + the deep checks' calls). 150,000 a day = 4.5M a month = 45% of Developer, leaving over half for the live
  // trader's sends. At the cap the chain stream closes until the next UTC day and a brain row says so.
  credits(n) { const day = new Date().toISOString().slice(0, 10); if (this.cday !== day) { this.cday = day; this.cused = 0; this.paused = false; } this.cused += n; }
  async saveGuard() { await this.ctx.storage.put("guard", { day: this.cday, used: this.cused, paused: !!this.paused }); }

  async connect() {
    const now = Date.now();
    if (!this.ws.pp || now - this.lastMsg.pp > 10 * 60000) {
      try { this.ws.pp?.close(); } catch {}
      try {
        const ws = await openWs(PUMPPORTAL_WSS); this.ws.pp = ws; this.lastMsg.pp = now; this.reconnects.pp++;
        ws.addEventListener("message", (m) => this.onPumpPortal(wsText(m.data)));
        ws.addEventListener("close", () => { if (this.ws.pp === ws) this.ws.pp = null; });
        ws.addEventListener("error", () => { if (this.ws.pp === ws) this.ws.pp = null; });
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
      } catch (e) { this.err("pumpportal", e); this.ws.pp = null; }
    }
    const src = await this.source();
    this.credits(0);
    if (src === "off" || this.paused) { try { this.ws.chain?.close(); } catch {} this.ws.chain = null; return; }
    if (!this.ws.chain || now - this.lastMsg.chain > STALE_MS) {
      try { this.ws.chain?.close(); } catch {}
      if (src !== "public" && !this.env.HELIUS_API_KEY) { this.err("chain", "HELIUS_API_KEY is not set"); return; }
      try {
        const ws = await openWs(src === "public" ? PUBLIC_WSS : heliusWss(this.env.HELIUS_API_KEY)); this.ws.chain = ws; this.lastMsg.chain = now; this.reconnects.chain++;
        ws.addEventListener("message", (m) => (src === "curve" ? this.onCurve(wsText(m.data)) : this.onChain(wsText(m.data))));
        ws.addEventListener("close", () => { if (this.ws.chain === ws) this.ws.chain = null; });
        ws.addEventListener("error", () => { if (this.ws.chain === ws) this.ws.chain = null; });
        ws.send(src === "curve" ? programSub() : logsSub());
      } catch (e) { this.err("chain", e); this.ws.chain = null; }
    }
  }

  push(item) { this.feed.unshift(item); if (this.feed.length > FEED_MAX) this.feed.length = FEED_MAX; }

  onPumpPortal(raw) {
    this.lastMsg.pp = Date.now();
    let j; try { j = JSON.parse(raw); } catch { return; }
    if (j.txType !== "create" || !j.mint) return;
    const c = this.eng.onCreate({ mint: j.mint, name: j.name, symbol: j.symbol, uri: j.uri, creator: j.traderPublicKey, curve: j.bondingCurveKey, src: "pumpportal",
      vsol: Number.isFinite(j.vSolInBondingCurve) ? j.vSolInBondingCurve * 1e9 : null, vtok: Number.isFinite(j.vTokensInBondingCurve) ? j.vTokensInBondingCurve * 1e6 : null });
    if (j.bondingCurveKey) { this.curves.set(j.bondingCurveKey, j.mint); this.curveAt.set(j.bondingCurveKey, Date.now()); }
    if (c.n === 0 && !c.chain) this.push({ at: Date.now(), k: "launch", mint: c.mint, sym: c.symbol, gta: c.gta });
  }

  onChain(raw) {
    const now = Date.now(); this.lastMsg.chain = now; this.notes++; this.bytes += raw.length; this.credits(raw.length / 1e6 * 20);
    let j; try { j = JSON.parse(raw); } catch { return; }
    const r = j.params?.result; if (!r?.value) return;
    const e = eventsFromLogs(r.value, r.context?.slot ?? null);
    if (e.failed) { this.eng.stats.failed++; return; }
    for (const c of e.creates) { if (c.curve) { this.curves.set(c.curve, c.mint); this.curveAt.set(c.curve, now); } const had = this.eng.coins.has(c.mint); const coin = this.eng.onCreate({ ...c, src: "chain", live: true }); if (!had) this.push({ at: now, k: "launch", mint: coin.mint, sym: coin.symbol, gta: coin.gta }); }
    for (const t of e.trades) this.eng.onTrade(t, now);
    for (const x of e.completes) this.eng.onComplete(x, now);
  }

  // "curve" source: a bonding-curve account changed. The reserve change is the trade (no wallet in this source).
  onCurve(raw) {
    const now = Date.now(); this.lastMsg.chain = now; this.notes++; this.bytes += raw.length; this.credits(raw.length / 1e6 * 20);
    let j; try { j = JSON.parse(raw); } catch { return; }
    const v = j.params?.result?.value; if (!v?.pubkey) return;
    const mint = this.curves.get(v.pubkey);
    if (mint === undefined) {
      // only a curve that still holds nearly all its tokens can be a new launch (a fresh curve starts at 1,073,000,000 tokens
      // minus the dev buy); older coins are ignored without spending a credit (production 2026-11-18: 5,748 unknown curves in
      // 10 minutes, resolving them all hit Helius 429s)
      const b0 = decodeCurve(v.account?.data?.[0] || ""); this.eng.stats.unknownCurves = (this.eng.stats.unknownCurves || 0) + 1;
      if (b0 && b0.virtual_token_reserves >= FRESH_VTOK && this.resolveQ.size < 500) this.resolveQ.add(v.pubkey); else { this.curves.set(v.pubkey, null); this.curveAt.set(v.pubkey, now); }
      return;
    }
    if (mint === null) return; // a coin launched before symbiote started: not a launch we cover
    const bc = decodeCurve(v.account?.data?.[0] || ""); if (!bc) return;
    const c = this.eng.coins.get(mint); if (!c) return;
    const vq = bc.virtual_quote_reserves, vt = bc.virtual_token_reserves, pq = c.vsol ?? c.vsol0, pt = c.vtok ?? c.vtok0;
    if (bc.complete) { this.eng.onComplete({ mint }, now); return; }
    if (!(vq > 0 && vt > 0) || (vq === pq && vt === pt)) return;
    const buy = pq == null ? true : vq > pq;
    this.eng.onTrade({ mint, buy, sol: pq == null ? 0 : Math.abs(vq - pq) / 1e9, tokens: pt == null ? 0 : Math.abs(vt - pt), user: null, ts: Math.floor(now / 1000),
      vsol: vq, vtok: vt, realSol: (bc.real_quote_reserves || 0) / 1e9, px: (vq / 1e9) / (vt / 1e6), slot: j.params.result.context?.slot ?? null }, now);
  }

  rate() { const now = Date.now(); this.win.push([now, this.notes]); while (this.win.length && now - this.win[0][0] > 60000) this.win.shift(); const a = this.win[0]; return a && now > a[0] ? +((this.notes - a[1]) / ((now - a[0]) / 1000)).toFixed(1) : 0; }

  status() {
    const cov = this.eng.coverage();
    return { on: true, source: null, startedAt: new Date(this.started).toISOString(), coverage: cov, perSec: this.rate(), mbStreamed: +(this.bytes / 1e6).toFixed(1),
      sockets: { pumpportal: !!this.ws.pp, chain: !!this.ws.chain }, lastMsg: { pumpportal: this.lastMsg.pp ? new Date(this.lastMsg.pp).toISOString() : null, chain: this.lastMsg.chain ? new Date(this.lastMsg.chain).toISOString() : null },
      reconnects: this.reconnects, queue: this.queue.length, feed: this.feed.slice(0, FEED_MAX), errors: this.errors };
  }

  async alarm() {
    try { await this.connect(); } catch (e) { this.err("connect", e); }
    const now = Date.now(), d = this.d();
    this.eng.sweep(now);
    if (now - this.lastVeto > 60000) { this.lastVeto = now; try { const rows = await d.q(`SELECT text FROM mob_aq_chat WHERE from_name = 'grok' AND at > now() - interval '1 hour' AND text ~* 'VETO' UNION ALL SELECT text FROM mob_aq_helpers WHERE from_helper = 'grok' AND at > now() - interval '1 hour' AND text ~* 'VETO'`); this.vetoes = new Set(rows.map((r) => (String(r.text).match(/^[\s>*_`#~-]*VETO[\s*_`:~-]+([1-9A-HJ-NP-Za-km-z]{32,44})(?![1-9A-HJ-NP-Za-km-z])/i) || [])[1]).filter(Boolean)); } catch (e) { this.err("veto", e); } }
    if (now - this.lastGta > 60000) { this.lastGta = now; await this.gtaOffCurve(now).catch((e) => this.err("gta", e)); }
    const b = this.eng.drain();
    for (const f of b.feed) this.push(f);
    for (const x of b.explode) if (!this.checked.has(x.mint)) { this.checked.set(x.mint, now); this.queue.push(x); }
    this.prune(now);
    const src0 = await this.source(); const st = { ...this.status(), source: src0, credits: { usedToday: Math.round(this.cused || 0), capPerDay: CREDIT_CAP_DAY, paused: !!this.paused } };
    if (src0 === "curve") { this.wantLaunch(); await this.snapLaunches().catch((e) => this.err("launch facts", e)); }
    try { await flush(d, b, st); await this.ctx.storage.put("stats", this.eng.stats); } catch (e) { this.err("flush", e); }
    await this.resolveCurves().catch((e) => this.err("resolve", e));
    if (!this.paused && src0 !== "public" && this.cused >= CREDIT_CAP_DAY) { this.paused = true; try { this.ws.chain?.close(1000, "credit cap"); } catch {} this.ws.chain = null;
      await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('symbiote', 'pain', $1, $2::jsonb)`, [`PAIN symbiote stream paused: ${Math.round(this.cused)} Helius credits used today (cap ${CREDIT_CAP_DAY}). Launches after this are missed until 00:00 UTC (02:00 Athens).`, JSON.stringify({ used: Math.round(this.cused), cap: CREDIT_CAP_DAY, rule: "credit guard" })]).catch(() => {}); }
    const x = this.queue.shift();
    if (x) { try { const res = await deepCheck(this.env, d, x.mint, this.eng.streamHealth(x.mint) || {}); this.credits(res.calls || 0); await writeRight(d, x, res); } catch (e) { this.err("deep check", e); } }
    await this.saveGuard().catch(() => {});
    if (now - this.lastPrune > 3600000) { this.lastPrune = now; await retention(d).catch((e) => this.err("retention", e)); }
    await this.ctx.storage.setAlarm(Date.now() + FLUSH_MS);
  }

  // "curve" source: PumpPortal's free feed carried only 17 of 98 launches seen on chain (3 minutes, 2026-11-18), so a curve
  // nobody announced is resolved from the chain: its 5 newest signatures, the oldest of them read and decoded. A CreateEvent
  // for this curve = a new launch (covered from now); only trades = an older coin (ignored). 2 Helius credits a curve, 40 a tick.
  async resolveCurves(max = RESOLVE_PER_TICK) {
    if (!this.resolveQ.size) return;
    const { rpcFor } = await import("./health.mjs"); const rpc = rpcFor(this.env);
    const batch = [...this.resolveQ].slice(0, this.paused ? 0 : max); for (const k of batch) this.resolveQ.delete(k); 
    for (const curve of batch) {
      if (this.backoffUntil && Date.now() < this.backoffUntil) { this.resolveQ.add(curve); continue; }
      try {
        this.credits(2); const sigs = await rpc("getSignaturesForAddress", [curve, { limit: 5 }]); const old = sigs?.[sigs.length - 1]; if (!old) return;
        const tx = await rpc("getTransaction", [old.signature, { encoding: "json", maxSupportedTransactionVersion: 1 }]);
        const ev = eventsFromLogs({ signature: old.signature, err: tx?.meta?.err ?? null, logs: tx?.meta?.logMessages || [] }, tx?.slot ?? null);
        const c = ev.creates.find((x) => x.curve === curve);
        if (c) { this.curves.set(curve, c.mint); this.curveAt.set(curve, Date.now()); const coin = this.eng.onCreate({ ...c, src: "chain" }); this.push({ at: Date.now(), k: "launch", mint: coin.mint, sym: coin.symbol, gta: coin.gta }); this.eng.stats.resolved = (this.eng.stats.resolved || 0) + 1; }
        else { this.curves.set(curve, null); this.curveAt.set(curve, Date.now()); }
      } catch (e) { this.resolveQ.add(curve); if (/429/.test(String(e.message))) { this.backoffUntil = Date.now() + 30000; this.err("resolve", "Helius 429: resolving paused 30 s"); } else this.err("resolve", e); }
    }
  }

  // memory bounds (a Durable Object has 128 MB): curve->mint entries for coins no longer in memory expire after 6 h,
  // checked mints after 24 h, the queues are capped
  prune(now = Date.now()) {
    for (const [k, v] of this.curves) if (!(v && this.eng.coins.has(v)) && now - (this.curveAt.get(k) ?? 0) > CURVE_TTL_MS) { this.curves.delete(k); this.curveAt.delete(k); }
    for (const [k, t] of this.checked) if (now - t > CHECKED_TTL_MS) this.checked.delete(k);
    if (this.launchQ.size > 2000) this.launchQ = new Set([...this.launchQ].slice(-2000));
  }
  // curve source: a coin that moves (+50% from launch or 20 trades) gets its launch facts read once, while it is young
  wantLaunch() { for (const c of this.eng.coins.values()) if (!c.done && !c.launchAsked && c.curve && c.px0 && (c.hi / c.px0 >= 1.5 || c.n >= 20)) { c.launchAsked = true; this.launchQ.add(c.mint); } }
  async snapLaunches(max = 2) { // one coin after another: launch reads never burst the shared Helius key
    if (this.paused || !this.launchQ.size) return;
    const { rpcFor, launchFacts } = await import("./health.mjs"); const rpc = rpcFor(this.env);
    const batch = [...this.launchQ].slice(0, max); for (const m of batch) this.launchQ.delete(m);
    for (const m of batch) { const c = this.eng.coins.get(m); if (!c) continue; if (this.backoffUntil && Date.now() < this.backoffUntil) { this.launchQ.add(m); c.launchAsked = true; continue; }
      const f = await launchFacts(rpc, m, c.curve).catch((e) => ({ complete: false, why: String(e.message || e), calls: 1, e429: /429/.test(String(e.message)) })); this.credits(f.calls || 1);
      if (f.e429) { this.backoffUntil = Date.now() + 30000; this.launchQ.add(m); continue; } this.eng.setLaunch(m, f); }
  }

  // the main GTA 6 coin and GTA coins that left the curve keep a minute price from Jupiter for their whole life
  async gtaOffCurve(now) {
    const mints = [GTA_MAIN, ...[...this.eng.coins.values()].filter((c) => c.gta && c.migrated).map((c) => c.mint)].slice(0, 50);
    const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`); if (!r.ok) throw new Error("jupiter " + r.status);
    const j = await r.json();
    const rows = mints.filter((m) => Number.isFinite(j?.[m]?.usdPrice)).map((m) => ({ mint: m, m: Math.floor(now / 60000), o: j[m].usdPrice, h: j[m].usdPrice, l: j[m].usdPrice, c: j[m].usdPrice, n: 1, src: "jupiter_usd" }));
    if (rows.length) await flush(this.d(), { coins: [], trades: [], missed: [], lessons: [], gta: rows }, null);
  }
}
