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
import { openWs, wsText, logsSub, programSub, launchSub, heliusWss, PUBLIC_WSS } from "./probe.mjs";
import { decodeCurve } from "./decode.mjs";

export const PUMPPORTAL_WSS = "wss://pumpportal.fun/api/data";
export const CREDIT_CAP_DAY = 150000;
// a right call is re-judged every 5 minutes and watched for 6 hours; a fresh coin needs 20 SOL of real reserves in its curve
// (about $1,500 at $75 a SOL: at the live cap of 0.05 SOL a trade that is under 0.3% of the pool, inside the 1% impact gate)
export const RECHECK_MS = 5 * 60000, RIGHT_WATCH_H = 6, LIQ_FLOOR_SOL = 20;
const CURVE_TTL_MS = 6 * 3600000, CHECKED_TTL_MS = 24 * 3600000;
const FLUSH_MS = 5000, STALE_MS = 60000, FEED_MAX = 40;

export class Symbiote {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.vetoes = new Set();
    this.eng = createEngine({ isVetoed: (m) => this.vetoes.has(m) });
    this.ws = { pp: null, chain: null, launch: null }; this.lastMsg = { pp: 0, chain: 0, launch: 0 }; this.reconnects = { pp: 0, chain: 0, launch: 0 }; this.pending = new Map();
    this.win = []; this.notes = 0; this.bytes = 0; this.feed = []; this.queue = []; this.checked = new Map();
    this.started = 0; this.lastVeto = 0; this.curves = new Map(); this.curveAt = new Map(); this.launchQ = new Set(); this.lastPrune = 0; this.lastGta = 0; this.errors = [];
  }
  d() { return db(this.env); }
  err(where, e) { this.errors.unshift({ at: new Date().toISOString(), where, msg: String(e?.message || e).slice(0, 200) }); this.errors.length = Math.min(this.errors.length, 8); }

  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/config" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (!["public", "helius", "curve", "off"].includes(b.source)) return Response.json({ error: "source must be helius, curve, public or off" }, { status: 400 });
      await this.ctx.storage.put("source", b.source); this.closeChain("source changed");
    }
    await this.start();
    return Response.json(this.status());
  }

  async start() {
    if (!this.started) {
      this.started = Date.now();
      const saved = await this.ctx.storage.get("stats"); if (saved) { this.eng.stats.restarts = saved.restarts || 0; this.eng.stats.lostAtRestart = saved.lostAtRestart || 0; } // coverage counts THIS run only (production 2026-11-18: mixing runs gave -4.8%)
      const g = await this.ctx.storage.get("guard"); if (g) { this.cday = g.day; this.cused = g.used || 0; this.paused = !!g.paused; } // the guard survives a restart
      // coins that were live when the object last stopped cannot be measured any more: logged as missed, never silently dropped
      try {
        const lost = await this.d().q(`UPDATE mob_aq_sym_coins SET done = true, end_reason = 'restart', updated_at = now() WHERE NOT done RETURNING mint, symbol, n`);
        const never = lost.filter((c) => !c.n);
        if (lost.length) await this.d().q(`INSERT INTO mob_aq_sym_missed (mint, symbol, reason) SELECT mint, symbol, 'symbiote restarted while the coin was live' FROM json_to_recordset($1::json) AS x(mint text, symbol text) ON CONFLICT (mint) DO NOTHING`, [JSON.stringify(lost)]);
        void never; if (saved) this.eng.stats.restarts = (this.eng.stats.restarts || 0) + 1; this.eng.stats.lostAtRestart = (this.eng.stats.lostAtRestart || 0) + lost.length;
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
    if (src === "off" || this.paused) { this.closeChain(this.paused ? "credit cap" : "off"); return; }
    if (!this.ws.chain || now - this.lastMsg.chain > STALE_MS) {
      try { this.ws.chain?.close(); } catch {}
      if (src !== "public" && !this.env.HELIUS_API_KEY) { this.err("chain", "HELIUS_API_KEY is not set"); return; }
      try {
        const ws = await openWs(src === "public" ? PUBLIC_WSS : heliusWss(this.env.HELIUS_API_KEY)); this.ws.chain = ws; this.lastMsg.chain = now; this.reconnects.chain++;
        ws.addEventListener("message", (m) => { this.lastMsg.chain = Date.now(); src === "curve" ? this.onCurve(wsText(m.data)) : this.onChain(wsText(m.data)); });
        ws.addEventListener("close", () => { if (this.ws.chain === ws) this.ws.chain = null; });
        ws.addEventListener("error", () => { if (this.ws.chain === ws) this.ws.chain = null; });
        ws.send(src === "curve" ? programSub() : logsSub());
      } catch (e) { this.err("chain", e); this.ws.chain = null; }
    }
    // curve source: EVERY launch comes from a second, tiny subscription: logs that mention pump.fun's mint-authority PDA
    // (TSLvdd…, present only in create transactions; production evidence 2026-11-18: 31 creates in 60 s, 0 failed, ~290 MB/day,
    // ~5,800 credits/day). Each carries the CreateEvent: mint, curve, creator, slot. No guessing which curve is new.
    if (src === "curve" && (!this.ws.launch || now - this.lastMsg.launch > 5 * 60000)) {
      try { this.ws.launch?.close(); } catch {}
      try {
        const ws = await openWs(heliusWss(this.env.HELIUS_API_KEY)); this.ws.launch = ws; this.lastMsg.launch = now; this.reconnects.launch++;
        ws.addEventListener("message", (m) => { this.lastMsg.launch = Date.now(); this.onChain(wsText(m.data)); });
        ws.addEventListener("close", () => { if (this.ws.launch === ws) this.ws.launch = null; });
        ws.addEventListener("error", () => { if (this.ws.launch === ws) this.ws.launch = null; });
        ws.send(launchSub());
      } catch (e) { this.err("launch", e); this.ws.launch = null; }
    }
  }

  // 2) both Helius sockets close together (the trade stream and the launch stream), at the cap, on "off" and on a source change
  closeChain(why) { for (const k of ["chain", "launch"]) { try { this.ws[k]?.close(1000, why); } catch {} this.ws[k] = null; } }

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
    const now = Date.now(); this.notes++; this.bytes += raw.length; this.credits(raw.length / 1e6 * 20);
    let j; try { j = JSON.parse(raw); } catch { return; }
    const r = j.params?.result; if (!r?.value) return;
    const e = eventsFromLogs(r.value, r.context?.slot ?? null);
    if (e.failed) { this.eng.stats.failed++; return; }
    for (const c of e.creates) { if (c.curve) { this.curves.set(c.curve, c.mint); this.curveAt.set(c.curve, now); const pd = this.pending.get(c.curve); if (pd) { this.pending.delete(c.curve); queueMicrotask(() => this.onCurve(pd.raw)); } } const had = this.eng.coins.has(c.mint); const coin = this.eng.onCreate({ ...c, src: "chain", live: true }); if (!had) this.push({ at: now, k: "launch", mint: coin.mint, sym: coin.symbol, gta: coin.gta }); }
    for (const t of e.trades) this.eng.onTrade(t, now);
    for (const x of e.completes) this.eng.onComplete(x, now);
  }

  // "curve" source: a bonding-curve account changed. The reserve change is the trade (no wallet in this source).
  onCurve(raw) {
    const now = Date.now(); this.notes++; this.bytes += raw.length; this.credits(raw.length / 1e6 * 20);
    let j; try { j = JSON.parse(raw); } catch { return; }
    const v = j.params?.result?.value; if (!v?.pubkey) return;
    const mint = this.curves.get(v.pubkey);
    if (mint === undefined) {
      // only a curve that still holds nearly all its tokens can be a new launch (a fresh curve starts at 1,073,000,000 tokens
      // minus the dev buy); older coins are ignored without spending a credit (production 2026-11-18: 5,748 unknown curves in
      // 10 minutes, resolving them all hit Helius 429s)
      // launches arrive on the launch subscription; a curve update can beat its create by a moment, so the latest unknown
      // update is held 2 minutes and replayed when the create lands (older coins simply age out, no credit spent)
      this.eng.stats.unknownCurves = (this.eng.stats.unknownCurves || 0) + 1;
      if (this.pending.size < 30000) this.pending.set(v.pubkey, { raw, at: now });
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
      sockets: { pumpportal: !!this.ws.pp, chain: !!this.ws.chain, launch: !!this.ws.launch }, pendingCurves: this.pending.size, lastMsg: Object.fromEntries(Object.entries(this.lastMsg).map(([k, t]) => [k, t ? new Date(t).toISOString() : null])),
      reconnects: this.reconnects, queue: this.queue.length, launchQueue: this.launchQ.size, feed: this.feed.slice(0, FEED_MAX), errors: this.errors };
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
    if (!this.paused && src0 !== "public" && this.cused >= CREDIT_CAP_DAY) { this.paused = true; this.closeChain("credit cap");
      await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('symbiote', 'pain', $1, $2::jsonb)`, [`PAIN symbiote stream paused: ${Math.round(this.cused)} Helius credits used today (cap ${CREDIT_CAP_DAY}). Launches after this are missed until 00:00 UTC (02:00 Athens).`, JSON.stringify({ used: Math.round(this.cused), cap: CREDIT_CAP_DAY, rule: "credit guard" })]).catch(() => {}); }
    if (now - (this.lastRecheck || 0) > RECHECK_MS) { this.lastRecheck = now; await this.recheckRights(d).catch((e) => this.err("recheck", e)); }
    const x = this.queue.shift();
    if (x) { try { const res = await deepCheck(this.env, d, x.mint, this.eng.streamHealth(x.mint) || {}); this.credits(res.calls || 0); await writeRight(d, x, res); } catch (e) { this.err("deep check", e); } }
    await this.saveGuard().catch(() => {});
    if (now - this.lastPrune > 3600000) { this.lastPrune = now; await retention(d).catch((e) => this.err("retention", e)); }
    await this.ctx.storage.setAlarm(Date.now() + FLUSH_MS);
  }

  // RIGHT CALL upkeep: every 5 minutes each candidate is re-judged with the cheap checks (the deep facts recorded at the call
  // plus the stream's live facts, Grok's VETO and the fresh-coin liquidity floor). Healthy = checked_at renewed (so the live
  // trader's 30-minute freshness holds); failed, out of memory, or older than RIGHT_WATCH_H = 'expired' with the reason.
  async recheckRights(d) {
    const rows = await d.q(`SELECT mint, symbol, flagged_at, checks FROM mob_aq_sym_right WHERE status = 'candidate'`);
    const { judgeHealth } = await import("./rules.mjs"); const { vetoed } = await import("./health.mjs");
    for (const r of rows) {
      const c = this.eng.coins.get(r.mint), age = Date.now() - new Date(r.flagged_at).getTime();
      let why = null;
      if (age > RIGHT_WATCH_H * 3600000) why = `watched ${RIGHT_WATCH_H} hours: the call expires`;
      else if (!c) why = "symbiote no longer holds this coin's live data (restart or released)";
      else if (c.end) why = c.end === "migrated" ? "the curve completed (migration): symbiote has no price after it" : "the coin went quiet";
      else if ((c.realSol || 0) < LIQ_FLOOR_SOL) why = `liquidity under the fresh-coin floor: ${(c.realSol || 0).toFixed(1)} SOL in the curve (floor ${LIQ_FLOOR_SOL})`;
      else { const v = judgeHealth({ ...(r.checks || {}), ...this.eng.streamHealth(r.mint), launchComplete: r.checks?.launchComplete === true || c.launchComplete === true, vetoed: await vetoed(d, r.mint) });
        if (!v.ok) why = v.failed.join("; "); }
      if (why) await d.q(`UPDATE mob_aq_sym_right SET status = 'expired', checked_at = now(), checks = coalesce(checks, '{}'::jsonb) || jsonb_build_object('expired', $2::text) WHERE mint = $1`, [r.mint, why]);
      else await d.q(`UPDATE mob_aq_sym_right SET checked_at = now() WHERE mint = $1`, [r.mint]);
    }
  }

  // memory bounds (a Durable Object has 128 MB): curve->mint entries for coins no longer in memory expire after 6 h,
  // checked mints after 24 h, the queues are capped
  prune(now = Date.now()) {
    for (const [k, v] of this.curves) if (!(v && this.eng.coins.has(v)) && now - (this.curveAt.get(k) ?? 0) > CURVE_TTL_MS) { this.curves.delete(k); this.curveAt.delete(k); }
    for (const [k, t] of this.checked) if (now - t > CHECKED_TTL_MS) this.checked.delete(k);
    for (const [k, v] of this.pending) if (now - v.at > 120000) this.pending.delete(k);
    if (this.launchQ.size > 2000) this.launchQ = new Set([...this.launchQ].slice(-2000));
  }
  // curve source: a coin that rises 80% from launch gets its launch facts read once, while it is young (production
  // 2026-11-18: reading every coin with 20 trades spent ~156,000 credits a day, over the cap; only risers can become right calls)
  wantLaunch() { for (const c of this.eng.coins.values()) if (!c.done && !c.launchAsked && c.curve && c.px0 && c.hi / c.px0 >= 1.8) { c.launchAsked = true; this.launchQ.add(c.mint); } }
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
