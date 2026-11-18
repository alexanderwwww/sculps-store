// SYMBIOTE Durable Object: one instance ("main") that listens to every pump.fun launch and every curve trade, paper-trades
// each launch in two lanes (rules.mjs) and writes batches into mob_aq_sym_* every FLUSH_MS. PAPER ONLY: this file and every
// file it imports never import the wallet, the signer, live orders, payouts or Phantom (test/symbiote.test.mjs proves it).
//  Launches: PumpPortal wss://pumpportal.fun/api/data {"method":"subscribeNewToken"} (free, no key; read live 2026-11-18).
//  Trades:   logsSubscribe on the pump program, decoded with pump.fun's own IDL. Source in storage key "source":
//            "public" (free public node, default), "helius" (HELIUS_API_KEY, billed per MB: see probe.mjs) or "off".
import { db } from "../../db.mjs";
import { eventsFromLogs } from "./decode.mjs";
import { createEngine, GTA_MAIN } from "./rules.mjs";
import { deepCheck } from "./health.mjs";
import { flush, writeRight } from "./store.mjs";
import { openWs, wsText, logsSub, heliusWss, PUBLIC_WSS } from "./probe.mjs";

export const PUMPPORTAL_WSS = "wss://pumpportal.fun/api/data";
const FLUSH_MS = 5000, STALE_MS = 60000, FEED_MAX = 40;

export class Symbiote {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.vetoes = new Set();
    this.eng = createEngine({ isVetoed: (m) => this.vetoes.has(m) });
    this.ws = { pp: null, chain: null }; this.lastMsg = { pp: 0, chain: 0 }; this.reconnects = { pp: 0, chain: 0 };
    this.win = []; this.notes = 0; this.bytes = 0; this.feed = []; this.queue = []; this.checked = new Set();
    this.started = 0; this.lastVeto = 0; this.lastGta = 0; this.errors = [];
  }
  d() { return db(this.env); }
  err(where, e) { this.errors.unshift({ at: new Date().toISOString(), where, msg: String(e?.message || e).slice(0, 200) }); this.errors.length = Math.min(this.errors.length, 8); }

  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/config" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (!["public", "helius", "off"].includes(b.source)) return Response.json({ error: "source must be public, helius or off" }, { status: 400 });
      await this.ctx.storage.put("source", b.source); try { this.ws.chain?.close(1000, "source changed"); } catch {} this.ws.chain = null;
    }
    await this.start();
    return Response.json(this.status());
  }

  async start() {
    if (!this.started) {
      this.started = Date.now();
      const saved = await this.ctx.storage.get("stats"); if (saved) Object.assign(this.eng.stats, saved);
      // coins that were live when the object last stopped cannot be measured any more: logged as missed, never silently dropped
      try {
        const lost = await this.d().q(`UPDATE mob_aq_sym_coins SET done = true, end_reason = 'restart', updated_at = now() WHERE NOT done RETURNING mint, symbol, n`);
        const never = lost.filter((c) => !c.n);
        if (lost.length) await this.d().q(`INSERT INTO mob_aq_sym_missed (mint, symbol, reason) SELECT mint, symbol, 'symbiote restarted while the coin was live' FROM json_to_recordset($1::json) AS x(mint text, symbol text) ON CONFLICT (mint) DO NOTHING`, [JSON.stringify(lost)]);
        this.eng.stats.missed += never.length; this.eng.stats.restarts = (this.eng.stats.restarts || 0) + 1; this.eng.stats.lostAtRestart = (this.eng.stats.lostAtRestart || 0) + lost.length;
      } catch (e) { this.err("restart", e); }
    }
    await this.connect();
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + FLUSH_MS);
  }

  async source() { return (await this.ctx.storage.get("source")) || "public"; }

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
    if (src === "off") { try { this.ws.chain?.close(); } catch {} this.ws.chain = null; return; }
    if (!this.ws.chain || now - this.lastMsg.chain > STALE_MS) {
      try { this.ws.chain?.close(); } catch {}
      if (src === "helius" && !this.env.HELIUS_API_KEY) { this.err("chain", "HELIUS_API_KEY is not set"); return; }
      try {
        const ws = await openWs(src === "helius" ? heliusWss(this.env.HELIUS_API_KEY) : PUBLIC_WSS); this.ws.chain = ws; this.lastMsg.chain = now; this.reconnects.chain++;
        ws.addEventListener("message", (m) => this.onChain(wsText(m.data)));
        ws.addEventListener("close", () => { if (this.ws.chain === ws) this.ws.chain = null; });
        ws.addEventListener("error", () => { if (this.ws.chain === ws) this.ws.chain = null; });
        ws.send(logsSub());
      } catch (e) { this.err("chain", e); this.ws.chain = null; }
    }
  }

  push(item) { this.feed.unshift(item); if (this.feed.length > FEED_MAX) this.feed.length = FEED_MAX; }

  onPumpPortal(raw) {
    this.lastMsg.pp = Date.now();
    let j; try { j = JSON.parse(raw); } catch { return; }
    if (j.txType !== "create" || !j.mint) return;
    const c = this.eng.onCreate({ mint: j.mint, name: j.name, symbol: j.symbol, uri: j.uri, creator: j.traderPublicKey, curve: j.bondingCurveKey, src: "pumpportal" });
    if (c.n === 0 && !c.chain) this.push({ at: Date.now(), k: "launch", mint: c.mint, sym: c.symbol, gta: c.gta });
  }

  onChain(raw) {
    const now = Date.now(); this.lastMsg.chain = now; this.notes++; this.bytes += raw.length;
    let j; try { j = JSON.parse(raw); } catch { return; }
    const r = j.params?.result; if (!r?.value) return;
    const e = eventsFromLogs(r.value, r.context?.slot ?? null);
    if (e.failed) { this.eng.stats.failed++; return; }
    for (const c of e.creates) { const had = this.eng.coins.has(c.mint); const coin = this.eng.onCreate({ ...c, src: "chain" }); if (!had) this.push({ at: now, k: "launch", mint: coin.mint, sym: coin.symbol, gta: coin.gta }); }
    for (const t of e.trades) this.eng.onTrade(t, now);
    for (const x of e.completes) this.eng.onComplete(x, now);
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
    for (const x of b.explode) if (!this.checked.has(x.mint)) { this.checked.add(x.mint); this.queue.push(x); }
    const st = { ...this.status(), source: await this.source() };
    try { await flush(d, b, st); await this.ctx.storage.put("stats", this.eng.stats); } catch (e) { this.err("flush", e); }
    const x = this.queue.shift();
    if (x) { try { const res = await deepCheck(this.env, d, x.mint, this.eng.streamHealth(x.mint) || {}); await writeRight(d, x, res); } catch (e) { this.err("deep check", e); } }
    await this.ctx.storage.setAlarm(Date.now() + FLUSH_MS);
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
