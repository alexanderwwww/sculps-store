import { DEFAULTS, entrySignal, managePosition } from "./strategy.mjs";
import { rugCheck } from "./rug.mjs";

export class Engine {
  constructor({ feed, exec, journal, cfg = DEFAULTS, rug = rugCheck, now = Date.now, startEq = 100, scanTop = 8 }) {
    Object.assign(this, { feed, exec, journal, cfg, rug, now, startEq, scanTop });
    const r = journal.replay();
    this.open = r.open;                       // survives restarts
    this.closed = r.closed;
    this.pending = r.pending;                 // intents with no fill: reconciled below, never forgotten
    for (const e of this.pending.values()) this.journal.write({ type: "fail", id: e.id, why: "restart before fill" });
    this.pending.clear();
    this.shadow = new Map(); this.shadowClosed = r.shadow || []; this.ready = []; this.cc = new Map(); this.live = new Map(); this.peaks = new Map(); this.closing = new Set(); this.events = []; this.seq = 0; this.watch = new Map(); this.watching = { total: 0, young: 0, thin: 0, ready: 0 }; this.paused = false; this.unknown = new Map(); this.sellTries = new Map(); this.skips = new Map(); this.recent = []; this.rugCache = new Map(); this.cool = new Map(); this.errors = []; this.hist = new Map(); this.ph = new Map(); this.lastDrop = new Map();
    this.ticks = 0; this.lastTickAt = null; this.startedAt = this.now(); this.counts = { drop: 0, block: 0, buy: 0, sell: 0, fail: 0 };
    // a restart (live update) must not forget which coins just lost: PODCAT was bought again right after a -12.5% loss
    for (const c of this.closed) if (c.ret < 0 && c.at && this.now() - c.at < (this.cfg.loserCoolMin ?? 60) * 60000) { const until = c.at + (this.cfg.loserCoolMin ?? 60) * 60000; if (c.pool) this.cool.set(c.pool, until); if (c.mint) this.cool.set(c.mint, until); }
  }
  get equity() { return this.startEq + this.closed.reduce((s, c) => s + (c.pnl || 0), 0); }
  /** The background paper book: every signal that passed the filters, taken or not, run through the same exit rules. */
  edge(n = 20) {
    const last = this.shadowClosed.slice(-n);
    const avg = last.length ? last.reduce((a, x) => a + x.ret, 0) / last.length : null;
    return { n: last.length, avg, wins: last.filter((x) => x.ret > 0).length, total: this.shadowClosed.length };
  }
  get unit() { return this.exec.name === "live" ? "SOL" : "$"; }
  #skip(name, why) { const k = why.replace(/\d+(\.\d+)?/g, "#").slice(0, 90); this.skips.set(k, (this.skips.get(k) || 0) + 1); this.recent.push({ at: this.now(), name, why }); if (this.recent.length > 40) this.recent.shift(); }
  get fastMode() { return typeof this.feed.quotes === "function"; }
  async tick() {
    if (this.fastMode) { await this.slow(); await this.fast(); return; }
    this.ticks++; this.lastTickAt = this.now();
    try { await this.#reconcile(); } catch (e) { this.#err("reconcile", e); }
    try { await this.#manage(); } catch (e) { this.#err("manage", e); }
    try { await this.#scan(); } catch (e) { this.#err("scan", e); }
  }
  /** The slow lane (a minute-chart feed that allows ~30 calls a minute): discovery, chart cache, shadow book, backstop exits. */
  async slow() {
    try { await this.#reconcile(); } catch (e) { this.#err("reconcile", e); }
    try { await this.#manage(); } catch (e) { this.#err("manage", e); }
    try {
      const list = await this.#discover();
      let n = 0;
      const want = [...list.map((m) => m.pool), ...[...this.open.values()].map((p) => p.pool)];
      for (const pool of want) {
        const hit = this.cc.get(pool);
        if (hit && this.now() - hit.at < 70000) continue;
        if (n++ >= 6) break;
        try { this.cc.set(pool, { cs: await this.feed.candles(pool, { limit: 100 }), at: this.now() }); } catch (e) { this.#err(`candles ${pool.slice(0, 6)}`, e); }
      }
      for (const [k, v] of this.cc) if (this.now() - v.at > 600000) this.cc.delete(k);
    } catch (e) { this.#err("slow", e); }
  }
  /** The fast lane (every few seconds): live prices for everything that matters -> exits first, then entries. */
  async fast() {
    this.ticks++; this.lastTickAt = this.now();
    const pools = [...new Set([...this.open.values()].map((p) => p.pool).concat(this.ready.map((m) => m.pool)))];
    let q = new Map();
    if (pools.length) { try { q = await this.feed.quotes(pools); } catch (e) { this.#err("quotes", e); } }
    for (const [pool, x] of q) { const ph = this.ph.get(pool) || []; ph.push([this.now(), x.price]); while (ph.length && this.now() - ph[0][0] > 120000) ph.shift(); this.ph.set(pool, ph); this.live.set(pool, { ...x, at: this.now() }); const w = this.watch.get(pool); if (w) { if (x.liqUsd != null) w.liqUsd = x.liqUsd; w.buys5 = x.buys5; w.sells5 = x.sells5; w.vol5 = x.vol5; } }
    for (const p of this.open.values()) { const lv = this.live.get(p.pool); if (!lv || this.now() - lv.at > 20000) continue; const h = this.hist.get(p.id) || []; h.push([this.now(), lv.price]); if (h.length > 150) h.shift(); this.hist.set(p.id, h); }   // what the trade cards draw
    try { await this.#fastExits(); } catch (e) { this.#err("exits", e); }
    try { await this.#fastEntries(); } catch (e) { this.#err("entries", e); }
  }
  async #fastExits() {
    const c = this.cfg;
    for (const p of [...this.open.values()]) {
      const lv = this.live.get(p.pool);
      if (!lv || this.now() - lv.at > 20000) continue;                       // no fresh price: the chart backstop in slow() covers it
      // lesson 6: decide on what a sale would REALLY return (Jupiter's sell quote, every ~4 s), not on a chart price.
      // FLOAT's -8% stop on the chart filled at -22%. The chart price stays as the fallback when no quote is fresh.
      if (this.exec.valueSol && p.stake > 0 && (!p.vAt || this.now() - p.vAt > 2500)) { p.vAt = this.now(); try { const v = await this.exec.valueSol(p); if (v != null) { p.val = v; p.valAt = this.now(); } } catch { /* chart fallback */ } }
      const real = p.val != null && this.now() - p.valAt < 15000;
      const entry = real ? p.stake : p.entryPx, price = real ? p.val : lv.price;
      const pk = this.peaks.get(p.id); const peak = Math.max(pk && pk.real === real ? pk.v : entry, price); this.peaks.set(p.id, { v: peak, real });
      let why = null;
      if (price <= entry * (1 + c.sl)) why = `stop ${c.sl * 100}%`;
      else if (peak >= entry * (1 + (c.lockFrom ?? 0.04)) && price <= entry * (1 + (c.lockAt ?? 0.01))) why = `locked: was up ${Math.round((peak / entry - 1) * 100)}%, out before it turns red`;   // lesson 4: a winner never becomes a loser
      else if (peak >= entry * (1 + c.trailFrom) && price <= peak * (1 - c.trail)) why = `trailing stop from +${Math.round((peak / entry - 1) * 100)}%`;
      else if (price >= entry * (1 + c.tp)) why = `take profit +${c.tp * 100}%`;
      else if (this.now() - p.at >= c.maxHoldMin * 60000) why = "time stop";
      else if (c.staleMin && this.now() - p.at >= c.staleMin * 60000 && price / entry - 1 < (c.staleRet ?? 0.01)) why = `flat after ${c.staleMin}m: money back to work`;   // lesson 2: dead money out
      if (!why) continue;
      const ret = real ? price / entry - 1 : (price * (1 - c.slippage)) / entry - 1 - 2 * c.fee;
      await this.#close(p, { ret, why, exitPx: real ? lv.price : price });
    }
  }
  /** price change over the last `secs` seconds from the live quotes (null until there is that much history) */
  #mom(pool, secs) { const ph = this.ph.get(pool) || []; if (ph.length < 2) return null; const now = ph[ph.length - 1]; const then = ph.find(([t]) => now[0] - t <= secs * 1000); if (!then || now[0] - then[0] < secs * 500) return null; return now[1] / then[1] - 1; }
  async #fastEntries() {
    if (this.paused || this.open.size >= this.cfg.maxOpen) return;
    for (const m of this.ready) {
      if (this.open.size >= this.cfg.maxOpen || this.paused) break;
      if ([...this.open.values()].some((p) => p.pool === m.pool || p.mint === m.mint) || this.cool.get(m.pool) > this.now() || this.cool.get(m.mint) > this.now()) continue;
      const lv = this.live.get(m.pool), hit = this.cc.get(m.pool);
      // every coin it looks at shows on the screen as it is filtered (Alex: constant movement), at most once per coin every 20 s
      const quiet = (k) => { this.skips.set(k, (this.skips.get(k) || 0) + 1); const t = this.lastDrop.get(m.pool) || 0; if (this.now() - t > 20000) { this.lastDrop.set(m.pool, this.now()); this.#ev("drop", m.name, k.replace(/^live: /, "")); } };
      if (!lv || this.now() - lv.at > 15000) { quiet("waiting: no live price yet"); continue; }
      if (!hit || hit.cs.length < 6) {
        // Alex 2026-10-29: never wait on a chart. Live volume + buyers ahead = buy, straight from the live price.
        const flow = (lv.buys5 || 0) + (lv.sells5 || 0);
        if (!((lv.vol5 || 0) >= (this.cfg.liveMinVol5 ?? 3000) && flow >= 15 && lv.buys5 >= lv.sells5 * (this.cfg.liveBuyRatio ?? 1.15))) { quiet("live: volume or buyers too thin"); continue; }
        // lesson 1 (2026-10-29 live data): buying a coin that is not moving = sitting at the cost of entry. Buy only a coin already rising.
        const mom = this.#mom(m.pool, this.cfg.momSecs ?? 30);
        // lesson 3: thin pools rug and slip (KIMWIFHAT -80%, Trump stop -8% filled at -19%). Only pools deep enough to get out of.
        if ((lv.liqUsd ?? 0) < (this.cfg.liveMinLiq ?? 15000)) { quiet("live: pool too thin to get out of"); continue; }
        if (mom == null) { quiet("live: watching its price first"); continue; }
        if (mom < (this.cfg.momMin ?? 0.02)) { quiet("live: not rising right now"); continue; }
        const t = Math.floor(this.now() / 60000) * 60000, c0 = { t, o: lv.price, h: lv.price, l: lv.price, c: lv.price, v: lv.vol5 / 5 };
        this.cool.set(m.pool, this.now() + 30000);
        await this.#consider(m, Array.from({ length: 6 }, (_, k) => ({ ...c0, t: t - (5 - k) * 60000 })), { ok: true, why: `rising ${(mom * 100).toFixed(1)}% in ${this.cfg.momSecs ?? 30}s, $${Math.round(lv.vol5)} volume in 5m, ${lv.buys5} buys vs ${lv.sells5} sells` });
        continue;
      }
      // the chart so far, plus the minute in progress built from the live price
      const cs = hit.cs.slice(), last = cs[cs.length - 1], minute = Math.floor(this.now() / 60000) * 60000;
      if (last.t >= minute) cs[cs.length - 1] = { ...last, c: lv.price, h: Math.max(last.h, lv.price), l: Math.min(last.l, lv.price), v: Math.max(last.v, lv.vol5 / 5) };
      else cs.push({ t: minute, o: last.c, h: Math.max(last.c, lv.price), l: Math.min(last.c, lv.price), c: lv.price, v: lv.vol5 / 5 });
      const sig = entrySignal(cs, cs.length - 1, this.cfg, { ...m, ...lv });
      if (!sig.ok) { if (!/no breakout|volume/.test(sig.why)) this.#skip(m.name, sig.why); else quiet(sig.why.startsWith("volume") ? "volume too low" : "not near its high"); continue; }        // the thousand quiet checks a minute are not news
      this.cool.set(m.pool, this.now() + 30000);
      await this.#consider(m, cs, sig);
    }
  }
  /** What the screen animates: one event per decision. type: drop | block | buy | sell | fail */
  #ev(type, name, why, extra = {}) { if (this.counts[type] != null) this.counts[type]++; this.events.push({ seq: ++this.seq, at: this.now(), type, name, why, ...extra }); if (this.events.length > 120) this.events.shift(); }
  #err(w, e) { this.errors.push({ at: this.now(), w, msg: String(e.message || e).slice(0, 140) }); if (this.errors.length > 20) this.errors.shift(); }
  /** Swaps the chain had not confirmed when polling stopped: look again until they are confirmed or dead. Never forgotten. */
  async #reconcile() {
    for (const [id, u] of [...this.unknown]) {
      const r = await this.exec.recheck(u.orderId);
      if (r.status === "pending") { if (this.now() - u.at > 15 * 60000) { this.journal.write({ type: "fail", id, why: "order never confirmed in 15 min" }); this.unknown.delete(id); } continue; }
      this.unknown.delete(id);
      if (r.status === "failed") { this.journal.write({ type: "fail", id, why: r.why }); this.#skip(u.name, `order ${r.why}`); continue; }
      const pos = { ...u.pos, stake: r.inAmount ? Number(r.inAmount) / 1e9 : u.pos.stake, tokens: r.outAmount || null };
      this.journal.write(pos); this.open.set(id, pos);
    }
  }
  /** Sell everything now, one position at a time, through the same journalled path as any exit. */
  /** Alex's Sell button on one position: sold now through the same journalled path as any exit. */
  async sellOne(id) {
    const p = this.open.get(id); if (!p) return false;
    const lv = this.live.get(p.pool), px = lv?.price ?? p.entryPx;
    return this.#close(p, { ret: (px * (1 - this.cfg.slippage)) / p.entryPx - 1 - 2 * this.cfg.fee, why: "you pressed Sell", exitPx: px });
  }
  async flatten() {
    this.paused = true;
    for (const p of [...this.open.values()]) {
      this.journal.write({ type: "sell-intent", id: p.id, name: p.name, why: "flatten (you pressed it)" });
      const r = (await this.exec.sell?.(p)) ?? { ok: true };
      if (!r.ok && !r.noBalance) { this.#err(`flatten ${p.name}`, new Error(r.why)); continue; }
      let ret = 0; if (r.ok && r.outAmount != null && r.inAmount != null && p.stake > 0) ret = Number(r.outAmount) / 1e9 / p.stake - 1;
      const pnl = p.stake * ret;
      this.journal.write({ type: "close", id: p.id, name: p.name, ret, pnl, why: "flatten", note: r.noBalance ? "the token was no longer in the wallet" : null });
      this.open.delete(p.id); this.closed.push({ ...p, type: "close", ret, pnl, why: "flatten" });
    }
  }
  async #manage() {
    for (const [pool, sp] of [...this.shadow]) {
      let cs; try { cs = await this.feed.candles(pool, { limit: 100 }); } catch { continue; }
      const x = this.#candleRule(cs, { entryPx: sp.entryPx, candleT: sp.candleT, at: sp.at });
      if (!x.open || this.now() - sp.at > this.cfg.maxHoldMin * 120000) {
        const rec = { type: "shadow-close", name: sp.name, ret: x.open ? 0 : x.ret, why: x.open ? "stale" : x.why };
        this.journal.write(rec); this.shadow.delete(pool); this.shadowClosed.push(rec);
      }
    }
    for (const p of [...this.open.values()]) {
      let cs; try { cs = await this.feed.candles(p.pool, { limit: 100 }); } catch (e) { this.#err(`candles ${p.name}`, e); continue; }
      const x = this.#candleRule(cs, p);
      const stale = this.now() - p.at > this.cfg.maxHoldMin * 60000 * 2;       // data gap: never hold forever
      if (!x.open || stale) await this.#close(p, { ret: x.ret, why: x.open ? "stale data, closed" : x.why, exitPx: x.exitPx });
    }
  }
  /** The chart's verdict on a position: candles AFTER the entry only, measured from the real entry price. */
  #candleRule(cs, p) {
    const first = cs.findIndex((c) => c.t > p.candleT);
    if (first < 0) return { open: true, ret: 0, why: "no candle since entry yet" };
    const i0 = Math.max(0, first - 1);
    return managePosition(cs, i0, this.cfg, { entryPx: p.entryPx ?? undefined, startT: p.candleT });
  }
  /** One exit, journalled before it is sent. Returns true when the position is gone. */
  async #close(p, x) {
    if (!this.open.has(p.id) || this.closing.has(p.id)) return false;
    this.closing.add(p.id);
    try {
      let ret = x.ret, why = x.why, note = null;
      const hold = this.sellTries.get(p.id) || 0;
      this.journal.write({ type: "sell-intent", id: p.id, name: p.name, why });                 // on disk BEFORE the sell goes out
      const r = (await this.exec.sell?.(p)) ?? { ok: true };
      if (!r.ok) {
        if (r.noBalance) note = "the token was no longer in the wallet (result estimated from the chart)";
        else if (hold + 1 < 4) { this.sellTries.set(p.id, hold + 1); this.#err(`sell ${p.name}`, new Error(r.why)); return false; }   // try again next tick
        else note = `sell failed 4 times (${r.why}): ${this.exec.safety || "the position is still in the wallet: press Sell everything"}`;
      } else if (r.outAmount != null && r.inAmount != null && p.stake > 0) {
        ret = Number(r.outAmount) / 1e9 / p.stake - 1;                                           // the real fill, not the model
      }
      const pnl = p.stake * ret;
      this.journal.write({ type: "close", id: p.id, name: p.name, ret, pnl, why, note, exitPx: x.exitPx });
      { const until = this.now() + (ret < 0 ? (this.cfg.loserCoolMin ?? 60) : this.cfg.cooldownMin) * 60000; this.cool.set(p.pool, until); if (p.mint) this.cool.set(p.mint, until); }   // by coin, not just by pool (PODCAT x3)   // lesson 7: a coin that just lost gets an hour off (FLOAT x4)       // never re-enter the same coin straight after an exit
      this.open.delete(p.id); this.sellTries.delete(p.id); this.peaks.delete(p.id); this.hist.delete(p.id);
      this.closed.push({ ...p, type: "close", ret, pnl, why, note, at: this.now() });
      // it teaches itself (golden ratio): losing streak -> demand more momentum before buying; winning -> relax back toward 2%
      const last = this.closed.slice(-5), avg = last.reduce((a, x) => a + (x.ret || 0), 0) / last.length;
      if (last.length >= 3) this.cfg.momMin = avg < 0 ? Math.min(0.08, (this.cfg.momMin ?? 0.02) * 1.618) : avg > 0.05 ? Math.max(0.02, (this.cfg.momMin ?? 0.02) / 1.618) : (this.cfg.momMin ?? 0.02);
      if (last.length >= 3) this.onLearn?.({ momMin: this.cfg.momMin });   // what it taught itself survives restarts
      this.#ev("sell", p.name, why, { ret, pnl, stake: p.stake });
      return true;
    } finally { this.closing.delete(p.id); }
  }
  /** Find new pools, remember them, keep their numbers fresh. Returns the ones worth a look. */
  async #discover() {
    const t = this.now();
    // Alex 2026-10-29: hunt the volume. New creations every cycle, plus one more source in turn: pump.fun bonding curve
    // (new + about to bond), bonded (PumpSwap), trending, deeper pages. The GeckoTerminal queue allows ~27 calls a minute.
    const extra = [() => this.feed.pumpPools?.(1), () => this.feed.bondedPools?.(1), () => this.feed.newPools(2), () => this.feed.pumpPools?.(2), () => this.feed.trendingPools(1), () => this.feed.bondedPools?.(2), () => this.feed.newPools(3), () => this.feed.pumpPools?.(3), () => this.feed.bondedPools?.(3)];
    this.srcI = (this.srcI || 0) + 1;
    const sources = this.watch.size ? [() => this.feed.newPools(1), extra[this.srcI % extra.length]] : [() => this.feed.newPools(1), () => this.feed.newPools(2), () => this.feed.trendingPools(1)];
    for (const f of sources) {
      try { for (const x of (await f()) || []) if (!this.watch.has(x.pool)) this.watch.set(x.pool, x); else Object.assign(this.watch.get(x.pool), x); } catch (e) { this.#err("pools", e); }
    }
    const ageMin = (m) => (t - m.created) / 60000;
    for (const [k, m] of this.watch) if (ageMin(m) > this.cfg.maxAgeMin + 10) this.watch.delete(k);
    if (this.watch.size > 400) for (const [k] of [...this.watch].sort((a, b) => a[1].created - b[1].created).slice(0, this.watch.size - 400)) this.watch.delete(k);
    if (this.feed.multi && !this.fastMode) {
      const due = [...this.watch.values()].filter((m) => ageMin(m) >= this.cfg.minAgeMin && !(this.cool.get(m.pool) > t)).sort((a, b) => b.vol5 - a.vol5).slice(0, 90);
      for (let i = 0; i < due.length; i += 30) {
        try { for (const x of await this.feed.multi(due.slice(i, i + 30).map((m) => m.pool))) Object.assign(this.watch.get(x.pool) || {}, x); } catch (e) { this.#err("refresh", e); break; }
      }
    }
    // lesson 5: only pools priced in SOL. A '/ PUMP' or '/ USDC' pool's price is a different market from the SOL route Jupiter fills (HOYEAH: 'take profit +12%' filled at -19.7%).
    const list = [...this.watch.values()].filter((m) => !/ \/ (?!SOL$)\S+$/.test(m.name || "") && ageMin(m) >= this.cfg.minAgeMin && ageMin(m) <= this.cfg.maxAgeMin && (m.liqUsd ?? 0) >= this.cfg.minLiqUsd).sort((a, b) => b.vol5 - a.vol5).slice(0, this.fastMode ? 40 : this.scanTop);
    const all = [...this.watch.values()];
    this.watching = { total: all.length, young: all.filter((m) => ageMin(m) < this.cfg.minAgeMin).length, thin: all.filter((m) => ageMin(m) >= this.cfg.minAgeMin && ageMin(m) <= this.cfg.maxAgeMin && (m.liqUsd ?? 0) < this.cfg.minLiqUsd).length, ready: list.length };
    this.ready = list;
    return list.filter((m) => !(this.cool.get(m.pool) > t));
  }
  async #scan() {
    if (this.paused) { this.#skip("-", "buying is paused"); return; }
    if (this.open.size >= this.cfg.maxOpen) { this.#skip("-", `max ${this.cfg.maxOpen} open`); return; }
    const list = (await this.#discover()).slice(0, this.scanTop);
    for (const m of list) {
      if (this.open.size >= this.cfg.maxOpen) break;
      if ([...this.open.values()].some((p) => p.pool === m.pool)) continue;
      this.cool.set(m.pool, this.now() + 60000);
      let cs; try { cs = await this.feed.candles(m.pool, { limit: 100 }); } catch (e) { this.#err(`candles ${m.name}`, e); continue; }
      if (cs.length < 6) { this.#skip(m.name, "too few candles"); this.#ev("drop", m.name, "too few candles"); continue; }
      let s = entrySignal(cs, cs.length - 1, this.cfg, m);
      // First live buy of a fresh start: skip the signal once, on a coin that is green right now, so the real click path is proven in minutes (Alex, 2026-10-29).
      if (!s.ok && this.exec.name === "live" && !this.proofDone && cs[cs.length - 1].c > cs[cs.length - 1].o) s = { ok: true, why: "first live buy: proves the click path" };
      if (!s.ok) { this.#skip(m.name, s.why); this.#ev("drop", m.name, s.why); continue; }
      await this.#consider(m, cs, s);
      if (this.open.size && s.why.startsWith("first live buy")) this.proofDone = true;
    }
  }
  /** A signal exists. Rug check, shadow book, edge gate, size, buy, record. Everything past here is on disk first. */
  async #consider(m, cs, s) {
    const i = cs.length - 1;
    if (!this.rugCache.has(m.mint)) this.rugCache.set(m.mint, await this.rug(m.mint));
    const r = this.rugCache.get(m.mint);
    if (!r.pass) { this.#skip(m.name, `rug check: ${r.reason}`); this.#ev("block", m.name, r.reason); this.cool.set(m.pool, this.now() + 3600e3); return; }
    if (!this.shadow.has(m.pool)) { const sp = { name: m.name, candleT: cs[i].t, entryPx: cs[i].c * (1 + this.cfg.slippage), at: this.now() }; this.shadow.set(m.pool, sp); this.journal.write({ type: "shadow-open", pool: m.pool, ...sp }); }
    const e = this.edge();
    if (this.exec.name === "live" && e.n >= this.cfg.edgeMinN && e.avg < this.cfg.edgeFloor) { this.#skip(m.name, `shadow edge ${(e.avg * 100).toFixed(1)}% over last ${e.n}: waiting`); this.#ev("drop", m.name, "shadow edge negative"); return; }
    const id = `${m.mint.slice(0, 6)}-${this.now()}`;
    let stake = this.equity * this.cfg.stakeFrac;
    let streak = 0; for (let k = this.closed.length - 1; k >= 0 && this.closed[k].ret > 0; k--) streak++;
    if (this.exec.sizeSol) { try { stake = (await this.exec.sizeSol({ streak })).sol; } catch (err) { this.#skip(m.name, `wallet balance: ${err.message.slice(0, 60)}`); return; } }
    this.journal.write({ type: "intent", id, name: m.name, mint: m.mint, enter: s.why });   // on disk BEFORE anything is done
    const f = await this.exec.buy({ mint: m.mint, pool: m.pool, usd: stake });
    if (!f.ok && f.unknown && f.orderId) {
      const pos0 = { type: "open", id, name: m.name, mint: m.mint, pool: m.pool, stake, orderId: f.orderId, tokens: null, entryPx: cs[i].c * (1 + this.cfg.slippage), candleT: cs[i].t, enter: s.why, rug: r.reason, at: this.now() };
      this.journal.write({ type: "pending-order", id, orderId: f.orderId, name: m.name });
      this.unknown.set(id, { orderId: f.orderId, name: m.name, at: this.now(), pos: pos0 }); this.#skip(m.name, "order sent, confirmation pending"); return;
    }
    if (!f.ok) { this.journal.write({ type: "fail", id, why: f.why }); this.#skip(m.name, `executor: ${f.why}`); this.#ev("fail", m.name, f.why); return; }
    if (f.sol != null) stake = f.sol;
    const pos = { type: "open", id, name: m.name, mint: m.mint, pool: m.pool, stake, orderId: f.orderId || null, tokens: f.outAmount || null, entryPx: cs[i].c * (1 + this.cfg.slippage), candleT: cs[i].t, enter: s.why, rug: r.reason, at: this.now() };
    this.journal.write(pos);
    this.open.set(id, pos);
    this.#ev("buy", m.name, s.why, { stake: pos.stake });
  }
  status() {
    const c = this.closed, wins = c.filter((x) => x.ret > 0);
    return {
      mode: this.exec.name, paused: this.paused, unit: this.unit, halted: this.exec.state?.halted || null, ticks: this.ticks, lastTickAt: this.lastTickAt, equity: +this.equity.toFixed(4), curve: this.closed.reduce((a, x) => (a.push(+((a[a.length - 1] ?? this.startEq) + (x.pnl || 0)).toFixed(4)), a), [this.startEq]).slice(-60), startEq: this.startEq,
      open: [...this.open.values()].map((p) => { const h = this.hist.get(p.id) || [], px = h.length ? h[h.length - 1][1] : null, e0 = p.entryPx; return { id: p.id, name: p.name, mint: p.mint, entryPx: e0, stake: +p.stake.toFixed(5), since: p.at, enter: p.enter, ret: p.val != null && this.now() - p.valAt < 15000 && p.stake > 0 ? p.val / p.stake - 1 : px && e0 ? px / e0 - 1 : null, peak: (() => { const pk = this.peaks.get(p.id); return !pk ? null : pk.real ? pk.v / p.stake - 1 : e0 ? pk.v / e0 - 1 : null; })(), path: e0 ? h.map(([, v]) => +(v / e0 - 1).toFixed(4)) : [] }; }),
      exits: { sl: this.cfg.sl, tp: this.cfg.tp, trailFrom: this.cfg.trailFrom, trail: this.cfg.trail, maxHoldMin: this.cfg.maxHoldMin },
      trades: c.length, wins: wins.length, winRate: c.length ? +(wins.length / c.length).toFixed(3) : null,
      recentClosed: c.slice(-8).map((x) => ({ name: x.name, ret: +(x.ret * 100).toFixed(1), pnl: +(x.pnl || 0).toFixed(4), why: x.why, note: x.note || null, enter: x.enter })),
      startedAt: this.startedAt, counts: this.counts, lines: this.seq, next: this.ready.slice(0, 4).map((m) => m.name), whyNot: Object.fromEntries([...this.skips].sort((a, b) => b[1] - a[1]).slice(0, 12)), events: this.events.slice(-60), watching: this.watching, edge: this.edge(), shadowOpen: this.shadow.size, recentSkips: this.recent.slice(-10), errors: this.errors.slice(-5),
    };
  }
}
