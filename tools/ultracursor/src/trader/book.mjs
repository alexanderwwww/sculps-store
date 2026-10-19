/*
 * The paper book: setups, fills, exits, sizing and day stops of the gmgn-fib
 * plan, driven only by candles. PAPER ONLY: there is no wallet, no key, no
 * signing and no order anywhere in this module or its callers. "Fill" means
 * "the plan would have bought here", nothing more.
 *
 * Every event goes to `log(event)` (the JSONL ledger). The book is pure apart
 * from that callback, so the replay test drives it with recorded candles.
 *
 * Conservative fills, decided once and kept:
 *  - the entry is a limit at the 0.618 level, filled when a candle's low reaches it;
 *  - in one candle the stop is checked before any take-profit (worst case first);
 *  - the candle that fills an entry can stop it out, but cannot take profit;
 *  - after TP1 the stop moves to the entry price (the plan's "trailing stop");
 *  - 6% round trip = 3% off the notional on entry and 3% off every exit.
 */
import { PLAN, levels, nextFraction, dayStop, sizeEntry } from "./fib.mjs";

const MIN = 60_000;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

export class Book {
  constructor({ start = 10, plan = PLAN, log = () => {}, state = null } = {}) {
    this.plan = plan;
    this.log = log;
    this.start = start;
    this.cash = start;
    this.f = plan.f0;
    this.open = new Map();     // addr -> position
    this.setups = new Map();   // addr -> armed entry
    this.marks = new Map();    // addr -> last price
    this.lastT = new Map();    // addr -> last processed candle open time
    this.trades = [];          // closed: {addr, symbol, pnl, won, ...}
    this.day = null;           // {key, startEquity, halted}
    this.seq = 0;
    if (state) Object.assign(this, Book.revive(state));
  }

  // ---- persistence -------------------------------------------------------
  toJSON() {
    return {
      start: this.start, cash: this.cash, f: this.f, day: this.day, seq: this.seq, trades: this.trades,
      open: [...this.open.entries()], setups: [...this.setups.entries()],
      marks: [...this.marks.entries()], lastT: [...this.lastT.entries()],
    };
  }
  static revive(s) {
    return {
      start: s.start, cash: s.cash, f: s.f, day: s.day, seq: s.seq || 0, trades: s.trades || [],
      open: new Map(s.open || []), setups: new Map(s.setups || []),
      marks: new Map(s.marks || []), lastT: new Map(s.lastT || []),
    };
  }

  // ---- numbers -----------------------------------------------------------
  equity() {
    let e = this.cash;
    for (const [a, p] of this.open) e += p.units * (this.marks.get(a) ?? p.entry);
    return e;
  }
  /** Sum of the cost of what is still open (the size that counts against the 61.8% cap). */
  openNotional() {
    let n = 0;
    for (const p of this.open.values()) n += p.notional * (p.units / p.units0);
    return n;
  }
  summary() {
    const n = this.trades.length, wins = this.trades.filter((t) => t.won).length;
    return {
      trades: n, wins, losses: n - wins, p: n ? wins / n : null,
      balance: +this.equity().toFixed(4), cash: +this.cash.toFixed(4),
      open: this.open.size, armed: this.setups.size, f: +this.f.toFixed(4),
      halted: this.day?.halted || null,
    };
  }

  // ---- the day -------------------------------------------------------------
  /** Roll the UTC day and apply the day stop on marked equity. */
  checkDay(now) {
    const key = dayKey(now);
    if (!this.day || this.day.key !== key) {
      this.day = { key, startEquity: this.equity(), halted: null };
      this.log({ type: "day", t: now, key, startEquity: +this.day.startEquity.toFixed(4) });
    }
    if (this.day.halted) return this.day.halted;
    const hit = dayStop(this.day.startEquity, this.equity(), this.plan);
    if (hit) {
      for (const a of [...this.open.keys()]) this.#closeRest(a, this.marks.get(a), now, `day-${hit}`);
      this.setups.clear();
      this.day.halted = hit;
      this.log({ type: "halt", t: now, reason: `day-${hit}`, equity: +this.equity().toFixed(4) });
    }
    return this.day.halted;
  }

  // ---- signals -----------------------------------------------------------
  /** A token passed the gate and has a swing: arm (or re-arm) the 0.618 limit. */
  arm(addr, symbol, swing, now, gate = null) {
    if (this.day?.halted || this.open.has(addr)) return false;
    const cur = this.setups.get(addr);
    if (cur && cur.high === swing.high && cur.low === swing.low) return false;
    const lv = levels(swing.low, swing.high, this.plan);
    const s = { addr, symbol, low: lv.low, high: lv.high, entry: lv.entry, stop: lv.stop, tps: lv.tps, armedAt: now, highT: swing.highT };
    this.setups.set(addr, s);
    // candles up to the confirmed high are history, not fills
    if (!this.lastT.has(addr) || this.lastT.get(addr) < swing.highT) this.lastT.set(addr, swing.highT);
    this.log({ type: "arm", t: now, addr, symbol, low: s.low, high: s.high, entry: s.entry, stop: s.stop, tps: s.tps, gate });
    return true;
  }

  /**
   * Feed candles for one token (closed candles only, oldest first) plus the
   * newest price (may be the open candle's close) for marking.
   */
  onCandles(addr, candles, lastPrice, now) {
    const from = this.lastT.get(addr) ?? -Infinity;
    for (const c of candles) {
      if (c.t <= from) continue;
      this.lastT.set(addr, c.t);
      this.marks.set(addr, c.c);
      this.#step(addr, c);
    }
    if (lastPrice > 0 && this.open.has(addr)) this.marks.set(addr, lastPrice);
    const s = this.setups.get(addr);
    if (s && now - s.armedAt > this.plan.setupTtlMs) {
      this.setups.delete(addr);
      this.log({ type: "disarm", t: now, addr, symbol: s.symbol, reason: "no fill in 21 min" });
    }
  }

  #step(addr, c) {
    const end = c.t + MIN;
    const s = this.setups.get(addr);
    if (s) {
      if (c.h > s.high) {                          // new high before a fill: swing has changed
        this.setups.delete(addr);
        this.log({ type: "disarm", t: end, addr, symbol: s.symbol, reason: "new high before fill" });
      } else if (c.l <= s.entry) {
        this.setups.delete(addr);
        if (this.day?.halted) {
          this.log({ type: "skip", t: end, addr, symbol: s.symbol, reason: `day halted (${this.day.halted})` });
        } else if (this.open.size >= this.plan.maxOpen) {
          this.log({ type: "skip", t: end, addr, symbol: s.symbol, reason: `max ${this.plan.maxOpen} open` });
        } else {
          this.#enter(s, c);
          const p = this.open.get(addr);
          if (p && c.l <= p.stop) this.#closeRest(addr, p.stop, end, "stop");
          return;
        }
      }
    }
    const p = this.open.get(addr);
    if (!p) return;
    if (c.l <= p.stop) { this.#closeRest(addr, p.stop, end, p.hit[0] ? "breakeven-stop" : "stop"); return; }
    for (let i = 0; i < p.tps.length; i++) {
      if (p.hit[i] || c.h < p.tps[i]) continue;
      p.hit[i] = true;
      if (i === p.tps.length - 1) { this.#closeRest(addr, p.tps[i], end, `tp${i + 1}`); return; }
      this.#sell(addr, p.units0 * this.plan.tpSell[i], p.tps[i], end, `tp${i + 1}`);
      if (i === 0) p.stop = p.entry;
    }
    if (!p.hit[0] && end - p.entryT >= this.plan.timeStopMs) this.#closeRest(addr, c.c, end, "time-stop-21m");
  }

  #enter(s, c) {
    const eq = this.equity();
    const sz = sizeEntry({ f: this.f, equity: eq, cash: this.cash, openNotional: this.openNotional(), plan: this.plan });
    if (!sz.ok) {
      this.log({ type: "skip", t: c.t + MIN, addr: s.addr, symbol: s.symbol, reason: sz.reason });
      return;
    }
    const notional = sz.notional;
    const half = this.plan.costRoundTrip / 2;
    const units = (notional * (1 - half)) / s.entry;
    this.cash -= notional;
    const id = ++this.seq;
    const p = {
      id, addr: s.addr, symbol: s.symbol, entry: s.entry, stop: s.stop, tps: s.tps, low: s.low, high: s.high,
      units, units0: units, notional, f: this.f, entryT: c.t, proceeds: 0, hit: s.tps.map(() => false), exits: [],
    };
    this.open.set(s.addr, p);
    this.marks.set(s.addr, s.entry);
    this.log({ type: "entry", t: c.t + MIN, id, addr: s.addr, symbol: s.symbol, price: s.entry, notional: +notional.toFixed(4), f: +this.f.toFixed(4), equity: +eq.toFixed(4), stop: s.stop, tps: s.tps, reason: sz.capped ? "0.618 retracement filled (sized down to the 61.8% cap)" : "0.618 retracement filled", exposure: +(this.openNotional() / this.equity()).toFixed(6) });
  }

  #sell(addr, units, price, t, reason) {
    const p = this.open.get(addr);
    units = Math.min(units, p.units);
    const got = units * price * (1 - this.plan.costRoundTrip / 2);
    p.units -= units;
    p.proceeds += got;
    this.cash += got;
    p.exits.push({ t, price, units, got, reason });
    this.log({ type: "exit", t, id: p.id, addr, symbol: p.symbol, price, sold: +(units / p.units0).toFixed(4), got: +got.toFixed(4), move: +(price / p.entry - 1).toFixed(4), reason });
  }

  #closeRest(addr, price, t, reason) {
    const p = this.open.get(addr);
    if (!p) return;
    if (p.units > 0) this.#sell(addr, p.units, price ?? p.entry, t, reason);
    this.open.delete(addr);
    const pnl = p.proceeds - p.notional;
    const won = pnl > 0;
    const fBefore = this.f;
    this.f = nextFraction(this.f, won, this.plan);
    const rec = { id: p.id, addr, symbol: p.symbol, entryT: p.entryT, closeT: t, notional: p.notional, pnl, ret: pnl / p.notional, won, reason, fBefore, fAfter: this.f };
    this.trades.push(rec);
    this.log({ type: "close", t, id: p.id, addr, symbol: p.symbol, pnl: +pnl.toFixed(4), ret: +(pnl / p.notional).toFixed(4), won, reason, f_next: +this.f.toFixed(4), balance: +this.equity().toFixed(4) });
  }
}
