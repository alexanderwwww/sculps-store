/*
 * Sniper XYZ, the brain's three lanes (lanes.mjs runs them concurrently):
 *
 *   scan       GMGN trending -> prefilter -> security gate -> swing ->
 *              multi-timeframe confluence -> (when everything else holds) the
 *              fee quote -> decide() -> journal -> arm the entry ladder on FIRE
 *   narrative  for the candidates worth it: smart-money trades, holder stats,
 *              GMGN calls and community, the coin's own tweet, live X search
 *              (when a signed-in Chrome is attached) -> N
 *   positions  candles for open and armed coins -> the book (fills, exits,
 *              checkpoints, day ladder) -> heartbeat for the panel orb
 *
 * `src` is anything with GMGN's read methods: the live Gmgn reader, or a
 * recorded source in the replay test. TRAINING ONLY: nothing here can send an
 * order; live orders go through execute.mjs, which refuses.
 */
import { prefilter, gate } from "./gate.mjs";
import { findSwing, confluence, regimeOk } from "./fib.mjs";
import { decide } from "./brain.mjs";
import { smartBuys, gmgnScore, xScore, narrative, themeOf, themeHeat } from "./narrative.mjs";
import { quoteCosts, costRule } from "./fees.mjs";
import { parseXLink, tweet as xTweet } from "./x.mjs";

const MIN = 60_000;

export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = { error: String(e.message || e) }; } }
  }));
  return out;
}

export class Sniper {
  constructor({ src, book, memory = null, x = { tweet: xTweet, search: null }, quote = quoteCosts, log = () => {}, maxCandidates = 8, concurrency = 3 }) {
    Object.assign(this, { src, book, memory, x, quote, log, maxCandidates, concurrency });
    this.cands = new Map();      // addr -> {row, symbol, prefilter, gate, ...}
    this.social = new Map();     // addr -> narrative lane result
    this.buyers = new Map();     // addr -> {at, data}
    this.fees = new Map();       // addr -> {at, q}
    this.tweets = new Map();     // tweet id -> {at, t}
    this.lastKey = new Map();    // addr -> last journaled decision key
    this.callouts = null;        // {at, list}
    this.regime = null;          // {at, ...regimeOk}
    this.market = null;          // {at, gas, solUsd}
    this.heat = {};
  }

  // ------------------------------------------------------------------ scan lane
  async scanLane(nowMs) {
    const t0 = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const rows = await this.src.trending();
    this.heat = themeHeat(rows);
    if (!this.regime || nowMs - this.regime.at > MIN) this.regime = { at: nowMs, ...regimeOk(await this.src.solCandles("5m", 21).catch(() => null)) };
    if (!this.market || nowMs - this.market.at > MIN) {
      const [gas, prices] = await Promise.all([this.src.gas().catch(() => null), this.src.prices(["SOL"]).catch(() => [])]);
      this.market = { at: nowMs, gas, solUsd: Number(prices.find((p) => p.symbol === "SOL")?.price) || null };
    }
    const scored = rows.map((r) => ({ r, pf: prefilter(r, nowSec) }));
    for (const { r, pf } of scored) if (!pf.ok) this.#journal(r.a, r.s, { decision: "NO", tier: "none", reason: `NO: prefilter (${pf.why})`, features: { theme: themeOf(r.nm, r.s) } }, `pre:${pf.why}`);
    const cands = scored.filter((x) => x.pf.ok).map((x) => x.r).sort((a, b) => (b.smt + b.kol) - (a.smt + a.kol)).slice(0, this.maxCandidates);
    const addrs = cands.map((r) => r.a);
    const [full, buyers, candles] = await Promise.all([
      addrs.length ? this.src.fullInfo(addrs).catch((e) => ({ error: e.message })) : [],
      pool(addrs, this.concurrency, (a) => this.#topBuyers(a, nowMs)),
      pool(addrs, this.concurrency, (a) => this.src.candles(a, "1m", 500)),
    ]);
    const fullBy = new Map((Array.isArray(full) ? full : []).map((f) => [f.address, f]));
    let errors = (full?.error ? 1 : 0) + candles.filter((c) => !Array.isArray(c)).length + buyers.filter((b) => b?.error).length;
    const live = new Set();
    let fired = 0;
    const tiers = { none: 0, watch: 0, ready: 0, fire: 0 };
    for (let i = 0; i < cands.length; i++) {
      const row = cands[i], a = row.a, f = fullBy.get(a) || null;
      const cs = Array.isArray(candles[i]) ? candles[i].filter((c) => c.t + MIN <= nowMs) : null;
      const tb = buyers[i] && !buyers[i].error ? buyers[i] : null;
      const g = f && cs && tb ? gate({ full: f, topBuyers: tb, candles: cs, nowSec }) : null;
      const swing = cs ? findSwing(cs, this.book.plan) : null;
      const conf = cs ? confluence(cs) : null;
      const soc = this.social.get(a) || null;
      const smartNow = soc?.trades ? smartBuys(soc.trades, nowSec) : null;
      const theme = themeOf(row.nm, row.s, soc?.tweet?.text);
      const feat = { nowSec, row, full: f, prefilter: { ok: true }, gate: g, swing, confluence: conf, smartNow, narrative: soc?.result ? { ...soc.result, gmgn: soc.gmgn, x: soc.x } : null, regime: this.regime, theme };
      // the fee quote costs Jupiter calls: only when everything else already holds
      const pre = decide(feat);
      if (pre.failed.length === 1 && pre.failed[0] === "costs" && this.market?.solUsd) {
        const notional = Math.max(this.book.plan.fMin, this.book.f) * this.book.equity();
        let fc = this.fees.get(a);
        if (!fc || nowMs - fc.at > MIN) {
          const q = await this.quote({ mint: a, notionalUsd: notional, gm: { feeInfo: await this.src.feeInfo(a).catch(() => null), trades: soc.trades, gas: this.market.gas, solUsd: this.market.solUsd }, onCall: (c) => this.memory?.onCall(c) }).catch((e) => ({ ok: false, why: e.message }));
          fc = { at: nowMs, q };
          this.fees.set(a, fc);
          this.log({ type: "fee-quote", t: nowMs, addr: a, symbol: row.s, notional: +notional.toFixed(4), ...q });
        }
        feat.fees = fc.q;
        if (fc.q.ok) feat.costRule = costRule(swing, fc.q.costRt);
      }
      const d = decide(feat, { memory: this.memory, inRecovery: this.book.ladder.inRecovery() });
      tiers[d.tier]++;
      // build 9: what blocks a trade, counted, so it can be read from the status
      this.why = this.why || {};
      for (const f of d.failed || []) this.why[f] = (this.why[f] || 0) + 1;
      live.add(a);
      this.cands.set(a, { row, symbol: row.s, tier: d.tier, at: nowMs, gatePass: !!g?.pass });
      const id = this.#journal(a, row.s, d, `${d.decision}:${d.failed.join(",")}`);
      if (d.decision === "FIRE" && !this.book.open.has(a)) {
        if (this.book.arm(a, row.s, swing, nowMs, { costSide: feat.fees.costSide, decision: id || this.lastKey.get(a)?.id, features: d.features, tools: d.tools })) fired++;
      }
    }
    for (const a of [...this.cands.keys()]) if (!live.has(a)) this.cands.delete(a);
    return { ms: Date.now() - t0, seen: rows.length, cands: cands.length, tiers, fired, errors, regime: this.regime?.why };
  }

  #journal(addr, symbol, d, key) {
    const last = this.lastKey.get(addr);
    if (last && last.key === key) return null;     // journal on change, not every cycle
    const id = this.memory ? this.memory.journal({ addr, symbol, decision: d.decision, tier: d.tier, reason: d.reason, signals: d.signals, features: d.features, gut: d.gut ? { score: d.gut.score, evidence: d.gut.evidence } : undefined }) : null;
    this.lastKey.set(addr, { key, id });
    if (d.decision === "FIRE" || d.tier === "ready") this.log({ type: "decision", addr, symbol, decision: d.decision, tier: d.tier, reason: d.reason, id });
    return id;
  }

  async #topBuyers(a, nowMs) {
    const c = this.buyers.get(a);
    if (c && nowMs - c.at < 300_000) return c.data;   // a dev that sold stays sold; 5 min keeps calls low
    const data = await this.src.topBuyers(a);
    this.buyers.set(a, { at: nowMs, data });
    return data;
  }

  // -------------------------------------------------------------- narrative lane
  async narrativeLane(nowMs) {
    const t0 = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    if (!this.callouts || nowMs - this.callouts.at > 30_000) {
      const list = await this.src.callouts().catch(() => null);
      if (list) this.callouts = { at: nowMs, list };
    }
    // the gate-passing ones first, then the rest of the candidates; 30 s freshness
    const todo = [...this.cands.entries()]
      .filter(([a]) => { const s = this.social.get(a); return !s || nowMs - s.at > 30_000; })
      .sort(([, x], [, y]) => (y.gatePass ? 1 : 0) - (x.gatePass ? 1 : 0))
      .slice(0, 3);
    const dropped = this.#droppedSources();
    await pool(todo, 2, async ([a, c]) => {
      const [trades, holderStat, community, preview] = await Promise.all([
        this.src.trades(a).catch(() => null), this.src.holderStat(a).catch(() => null),
        this.src.community(a).catch(() => null), c.preview ? Promise.resolve(c.preview) : this.src.preview(a).catch(() => null),
      ]);
      c.preview = preview;
      const link = parseXLink(c.row.m_x) || parseXLink(preview?.twitter);
      let own = null, found = null;
      if (link?.id) {
        const tc = this.tweets.get(link.id);
        if (tc && nowMs - tc.at < 300_000) own = tc.t;
        else { const t1 = Date.now(); try { own = await this.x.tweet(link.id); this.memory?.onCall({ tool: "syndication tweet-result", ms: Date.now() - t1, ok: true }); } catch (e) { this.memory?.onCall({ tool: "syndication tweet-result", ms: Date.now() - t1, ok: false, error: e.message }); } this.tweets.set(link.id, { at: nowMs, t: own }); }
      }
      if (this.x.search) {
        const t1 = Date.now();
        try { const r = await this.x.search(`$${c.symbol}`); found = r?.tweets || null; this.memory?.onCall({ tool: "x.com/search", ms: Date.now() - t1, ok: !!found }); } catch (e) { this.memory?.onCall({ tool: "x.com/search", ms: Date.now() - t1, ok: false, error: e.message }); }
      }
      const gm = gmgnScore({ trades, holderStat, callouts: this.callouts?.list || null, community, addr: a, nowSec });
      const xs = xScore({ own, found, now: nowMs });
      const result = narrative({ gmgn: gm, x: xs, dropped });
      this.social.set(a, { at: nowMs, trades, holderStat, community, tweet: own, found, gmgn: gm, x: xs, result });
    });
    return { ms: Date.now() - t0, read: todo.length };
  }

  #droppedSources() {
    if (!this.memory) return [];
    const d = (tools) => tools.every((t) => this.memory.toolUse(t).dropped);
    const out = [];
    if (d(["trades", "holderStat", "callouts", "community"])) out.push("gmgn");
    if (d(["xTweet", "xSearch"])) out.push("x");
    return out;
  }

  // -------------------------------------------------------------- positions lane
  async positionLane(nowMs) {
    const t0 = Date.now();
    const watch = [...new Set([...this.book.open.keys(), ...this.book.setups.keys()])];
    const got = await pool(watch, this.concurrency, (a) => this.src.candles(a, "1m", 34));
    for (let i = 0; i < watch.length; i++) {
      const cs = Array.isArray(got[i]) ? got[i] : null;
      if (!cs?.length) continue;
      this.book.onCandles(watch[i], cs.filter((c) => c.t + MIN <= nowMs), cs[cs.length - 1].c, nowMs);
    }
    const halted = this.book.checkDay(nowMs);
    if (this.memory) this.memory.heartbeat({ open: this.book.open.size, armed: this.book.setups.size, paid: this.book.paid });
    return { ms: Date.now() - t0, watched: watch.length, halted };
  }
}
