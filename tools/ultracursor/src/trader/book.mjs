/*
 * The training book (brain v2): setups, ladder fills, Fibonacci exits, sizing,
 * the daily ladder and milestones, driven only by candles. TRAINING ONLY:
 * there is no wallet, no key, no signing and no order anywhere in this module.
 * "Fill" means "the plan would have bought here", nothing more. The live layer
 * is execute.mjs, which refuses until a live wallet is connected.
 *
 * Every event goes to `log(event)` (the JSONL ledger). The book is pure apart
 * from that callback, so the tests drive it with plain candles.
 *
 * Rules (knowledge-base.md sections 1, 7, 8):
 *  - entry ladder: 38.2% at the 0.5, 38.2% at the 0.618, 23.6% at the 0.705
 *    retracement; each part is a limit filled when a candle's low reaches it;
 *  - stop 1% under the 0.786 retracement; break-even after T1;
 *  - exits: 38.2% at T1 (the swing high), 38.2% at 1.272; the last 23.6% trails:
 *    stop to T1 after T2, to 1.272 once 1.618 trades, sold at 2.618;
 *  - checkpoints at 3, 5, 8, 13 min; no T1 by 21 min = exit at the close;
 *  - worst case first: in one candle the stop is checked before any target, and
 *    a candle that fills a part may stop it out but never takes profit;
 *  - size f moves by phi on the ladder 14.6 / 23.6 / 38.2%; after a loss it goes
 *    /phi and never up (martingale banned); open slots 1 -> 2 -> 3 by win streak;
 *    sum of open <= 61.8% of tradable equity; no trade may risk the day's P&L
 *    below the last checkpoint - 0.382u (ladder.mjs);
 *  - costs are per side, from the setup's real fee quote (fees.mjs).
 */
import { PLAN, nextFraction, dayStop, ladderLevels, positionsAllowed, V2 } from "./fib.mjs";
import { DayLadder, Milestones } from "./ladder.mjs";

const MIN = 60_000;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const r4 = (x) => +Number(x).toFixed(6);

export class Book {
  constructor({ start = 10, plan = PLAN, log = () => {}, state = null, costSide = PLAN.costRoundTrip / 2 } = {}) {
    this.plan = plan;
    this.log = log;
    this.start = start;
    this.cash = start;
    this.f = plan.f0;
    this.winStreak = 0;
    this.lossStreak = 0;
    this.defaultCost = costSide;
    this.open = new Map();     // addr -> position
    this.setups = new Map();   // addr -> armed ladder
    this.marks = new Map();
    this.lastT = new Map();
    this.trades = [];
    this.day = null;           // {key, startEquity, halted}
    this.ladder = new DayLadder();
    this.miles = new Milestones({ b0: start });
    this.seq = 0;
    this.paid = 0;             // profitable exit fills: the panel plays the "got paid" sound when this rises
    if (state) this.#revive(state);
  }

  // ---- persistence -------------------------------------------------------
  toJSON() {
    return {
      v: 2, start: this.start, cash: this.cash, f: this.f, winStreak: this.winStreak, lossStreak: this.lossStreak,
      day: this.day, seq: this.seq, paid: this.paid, trades: this.trades, ladder: this.ladder.toJSON(), miles: this.miles.toJSON(),
      open: [...this.open.entries()], setups: [...this.setups.entries()], marks: [...this.marks.entries()], lastT: [...this.lastT.entries()],
    };
  }
  #revive(s) {
    Object.assign(this, {
      start: s.start, cash: s.cash, f: s.f, winStreak: s.winStreak || 0, lossStreak: s.lossStreak || 0, day: s.day, seq: s.seq || 0, paid: s.paid || 0, trades: s.trades || [],
      open: new Map(s.v === 2 ? s.open || [] : []), setups: new Map(s.v === 2 ? s.setups || [] : []),
      marks: new Map(s.marks || []), lastT: new Map(s.lastT || []),
      ladder: new DayLadder(s.ladder || {}), miles: new Milestones(s.miles || { b0: s.start }),
    });
  }

  // ---- numbers -----------------------------------------------------------
  /** Tradable equity: cash + open positions at their marks. The locked part is outside it. */
  equity() {
    let e = this.cash;
    for (const [a, p] of this.open) e += p.units * (this.marks.get(a) ?? p.avg ?? p.parts[0].price);
    return e;
  }
  total() { return this.equity() + this.miles.locked; }
  /** What counts against the 61.8% cap: unfilled reserve plus the cost basis still held. */
  openNotional() {
    let n = 0;
    for (const p of this.open.values()) n += (p.cancelled ? 0 : p.parts.filter((x) => !x.filled).reduce((s, x) => s + x.notional, 0)) + (p.bought > 0 ? p.filledN * (p.units / p.bought) : 0);
    return n;
  }
  slots() { return Math.min(this.plan.maxOpen, positionsAllowed(this.winStreak)); }
  summary() {
    const n = this.trades.length, wins = this.trades.filter((t) => t.won).length;
    return {
      trades: n, wins, losses: n - wins, p: n ? wins / n : null,
      balance: +this.equity().toFixed(4), locked: +this.miles.locked.toFixed(4), cash: +this.cash.toFixed(4),
      open: this.open.size, armed: this.setups.size, f: +this.f.toFixed(4), slots: this.slots(),
      dayPnl: +this.ladder.pnl.toFixed(4), u: this.ladder.u === null ? null : +this.ladder.u.toFixed(4), checkpoint: this.ladder.checkpoint,
      recovery: this.ladder.recovery ? +(this.ladder.recovery.goal - this.ladder.recovery.got).toFixed(4) : null,
      halted: this.day?.halted || null,
    };
  }

  // ---- the day -------------------------------------------------------------
  checkDay(now) {
    const key = dayKey(now);
    if (!this.day || this.day.key !== key) {
      // roll the ladder only on a new UTC day (a restart on the same day keeps u, rungs and recovery)
      const sum = this.ladder.key === key ? null : this.ladder.key ? this.ladder.roll(key) : (this.ladder.roll(key), null);
      if (sum) this.log({ type: "day-summary", t: now, ...sum, trades: this.trades.filter((t) => dayKey(t.closeT) === sum.date).length });
      this.day = { key, startEquity: this.equity(), halted: null };
      this.log({ type: "day", t: now, key, startEquity: r4(this.day.startEquity), target: this.ladder.target });
    }
    if (this.day.halted) return this.day.halted;
    const hit = dayStop(this.day.startEquity, this.equity(), this.plan);
    if (hit) {
      for (const a of [...this.open.keys()]) this.#closeRest(a, this.marks.get(a), now, `day-${hit}`);
      this.setups.clear();
      this.day.halted = hit;
      this.log({ type: "halt", t: now, reason: `day-${hit}`, equity: r4(this.equity()) });
    }
    return this.day.halted;
  }

  // ---- signals -----------------------------------------------------------
  /**
   * The brain said FIRE: arm the entry ladder on this swing. ctx carries the
   * real per-side cost (fees.mjs), the decision id and the features, so the
   * trade is journaled with what the brain saw.
   */
  arm(addr, symbol, swing, now, ctx = {}) {
    if (this.day?.halted || this.open.has(addr)) return false;
    const cur = this.setups.get(addr);
    if (cur && cur.high === swing.high && cur.low === swing.low) return false;
    const L = ladderLevels(swing.low, swing.high, this.plan);
    const s = {
      addr, symbol, low: swing.low, high: swing.high, armedAt: now, highT: swing.highT,
      parts: L.parts.map((p) => ({ ...p, filled: false })), stop: L.stop, t1: L.t1, t2: L.t2, trail: L.trail,
      costSide: ctx.costSide ?? this.defaultCost, decision: ctx.decision || null, features: ctx.features || null, tools: ctx.tools || [],
    };
    this.setups.set(addr, s);
    if (!this.lastT.has(addr) || this.lastT.get(addr) < swing.highT) this.lastT.set(addr, swing.highT);
    this.log({ type: "arm", t: now, addr, symbol, low: s.low, high: s.high, ladder: s.parts.map((p) => r4(p.price)), stop: r4(s.stop), t1: r4(s.t1), t2: r4(s.t2), trail: s.trail.map(r4), costSide: s.costSide, decision: s.decision });
    return true;
  }

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
    let filledNow = false;
    const s = this.setups.get(addr);
    if (s) {
      if (c.h > s.high) {
        this.setups.delete(addr);
        this.log({ type: "disarm", t: end, addr, symbol: s.symbol, reason: "new high before fill" });
      } else if (c.l <= s.parts[0].price) {
        this.setups.delete(addr);
        if (this.day?.halted) this.log({ type: "skip", t: end, addr, symbol: s.symbol, reason: `day halted (${this.day.halted})` });
        else if (this.open.size >= this.slots()) this.log({ type: "skip", t: end, addr, symbol: s.symbol, reason: `${this.slots()} slot(s) open at win streak ${this.winStreak}` });
        else filledNow = this.#open(s, c);
      }
    }
    const p = this.open.get(addr);
    if (!p) return;
    // further ladder parts (before the stop check, still worst case: they fill, then the stop is checked)
    if (!p.cancelled) for (const part of p.parts) if (!part.filled && c.l <= part.price) { this.#fill(p, part, end); filledNow = true; }
    if (c.l <= p.stop) { this.#closeRest(addr, p.stop, end, p.hit2 ? "trail-stop" : p.hit1 ? "breakeven-stop" : "stop"); return; }
    // checkpoints 3/5/8/13 and the 21-minute time stop
    const mins = (end - p.entryT) / MIN;
    for (const cp of V2.checkpointsMin) if (mins >= cp && !p.cps.includes(cp)) {
      p.cps.push(cp);
      const mv = c.c / p.avg - 1;
      this.log({ type: "checkpoint", t: end, id: p.id, addr, symbol: p.symbol, min: cp, move: r4(mv), t1: p.hit1 });
    }
    if (filledNow) return;  // the candle that filled cannot take profit
    if (!p.hit1 && c.h >= p.t1) {
      p.hit1 = true; p.cancelled = true;
      this.#sell(addr, p.units * V2.exits[0].share, p.t1, end, "t1");
      p.stop = p.avg;   // break-even
    }
    if (p.hit1 && !p.hit2 && c.h >= p.t2) {
      p.hit2 = true;
      this.#sell(addr, p.units * (V2.exits[1].share / (1 - V2.exits[0].share)), p.t2, end, "t2-1.272");
      p.stop = Math.max(p.stop, p.t1);     // trail starts at T1
    }
    if (p.hit2 && c.h >= p.trail[0] && p.stop < p.t2) { p.stop = p.t2; this.log({ type: "trail", t: end, id: p.id, addr, symbol: p.symbol, stop: r4(p.stop), reason: "1.618 traded: stop to 1.272" }); }
    if (p.hit2 && c.h >= p.trail[1]) { this.#closeRest(addr, p.trail[1], end, "t3-2.618"); return; }
    if (!p.hit1 && mins >= this.plan.timeStopMs / MIN) this.#closeRest(addr, c.c, end, "time-stop-21m");
  }

  /** First part filled: size the whole ladder now. */
  #open(s, c) {
    const eq = this.equity();
    const cs = s.costSide;
    const want = this.f * eq;
    // 61.8% cap after this entry's own cost
    const room = (this.plan.maxExposure * eq - this.openNotional()) / (1 + this.plan.maxExposure * cs);
    // the day ladder floor: worst case = only the first (shallowest) part fills, then the stop
    const lossFrac = 1 - (s.stop / s.parts[0].price) * (1 - cs) * (1 - cs);
    const risk = this.ladder.maxRisk();
    const byFloor = risk === Infinity ? Infinity : risk / lossFrac;
    const n = Math.min(want, room, this.cash, byFloor);
    const end = c.t + MIN;
    if (n < this.plan.fMin * eq - 1e-9) {
      const why = n === byFloor ? `ladder floor: may risk only $${risk.toFixed(4)} (checkpoint ${this.ladder.checkpoint} - 0.382u)` : `exposure cap: only ${(Math.max(0, n) / eq * 100).toFixed(1)}% fits under ${this.plan.maxExposure * 100}%, below the ${this.plan.fMin * 100}% floor`;
      this.log({ type: "skip", t: end, addr: s.addr, symbol: s.symbol, reason: why });
      return false;
    }
    const id = ++this.seq;
    const p = {
      id, addr: s.addr, symbol: s.symbol, low: s.low, high: s.high, stop: s.stop, t1: s.t1, t2: s.t2, trail: s.trail, costSide: cs,
      parts: s.parts.map((x) => ({ ...x, notional: x.share * n, filled: false })),
      N: n, filledN: 0, units: 0, bought: 0, avg: null, f: this.f, entryT: c.t, proceeds: 0, cps: [], hit1: false, hit2: false, cancelled: false, exits: [],
      decision: s.decision, features: s.features, tools: s.tools,
    };
    this.open.set(s.addr, p);
    this.log({ type: "entry", t: end, id, addr: s.addr, symbol: s.symbol, reserved: r4(n), f: r4(this.f), equity: r4(eq), slots: this.slots(), capped: n < want - 1e-9, reason: n < want - 1e-9 ? "ladder sized down (61.8% cap or day floor)" : "ladder armed at 0.5 / 0.618 / 0.705", exposure: r4(this.openNotional() / eq), decision: s.decision });
    for (const part of p.parts) if (c.l <= part.price) this.#fill(p, part, end);
    return true;
  }

  #fill(p, part, t) {
    part.filled = true;
    const units = (part.notional * (1 - p.costSide)) / part.price;
    this.cash -= part.notional;
    p.filledN += part.notional;
    p.units += units;
    p.bought += units;
    p.avg = p.filledN / p.bought;  // cost per unit including the entry cost
    this.marks.set(p.addr, part.price);
    this.log({ type: "fill", t, id: p.id, addr: p.addr, symbol: p.symbol, at: part.at, price: r4(part.price), notional: r4(part.notional), cost: r4(part.notional * p.costSide), costSide: p.costSide });
  }

  #sell(addr, units, price, t, reason) {
    const p = this.open.get(addr);
    units = Math.min(units, p.units);
    if (!(units > 0)) return;
    const gross = units * price;
    const got = gross * (1 - p.costSide);
    p.units -= units;
    p.proceeds += got;
    this.cash += got;
    p.exits.push({ t, price, units, got, reason });
    if (got > units * p.avg) this.paid++;   // this fill made money after its cost
    this.log({ type: "exit", t, id: p.id, addr, symbol: p.symbol, price: r4(price), sold: r4(units / p.bought), got: r4(got), cost: r4(gross * p.costSide), move: r4(price / p.avg - 1), reason });
  }

  #closeRest(addr, price, t, reason) {
    const p = this.open.get(addr);
    if (!p) return;
    if (p.units > 0) this.#sell(addr, p.units, price ?? p.avg, t, reason);
    this.open.delete(addr);
    const pnl = p.proceeds - p.filledN;
    const won = pnl > 0;
    const fBefore = this.f;
    this.f = nextFraction(this.f, won, this.plan);      // up only after a win, /phi after a loss
    if (won) { this.winStreak++; this.lossStreak = 0; } else { this.lossStreak++; this.winStreak = 0; }
    const ladderEv = this.ladder.onClose(pnl);
    const rec = { id: p.id, addr, symbol: p.symbol, entryT: p.entryT, closeT: t, notional: p.filledN, pnl, ret: p.filledN ? pnl / p.filledN : 0, won, reason, fBefore, fAfter: this.f, costs: p.exits.reduce((s, e) => s + e.price * e.units * p.costSide, 0) + p.filledN * p.costSide, features: p.features, tools: p.tools, decision: p.decision };
    this.trades.push(rec);
    this.log({ type: "close", t, id: p.id, addr, symbol: p.symbol, pnl: r4(pnl), ret: r4(rec.ret), won, reason, f_next: r4(this.f), winStreak: this.winStreak, balance: r4(this.equity()), costs: r4(rec.costs) });
    for (const e of ladderEv) this.log({ ...e, t, kind: e.type, type: `ladder-${e.type}` });
    let lockNow = this.miles.check(this.total());
    if (lockNow > this.cash) { this.miles.locked -= lockNow - Math.max(0, this.cash); lockNow = Math.max(0, this.cash); } // only free cash can be locked
    if (lockNow > 0) {
      this.cash -= lockNow;
      this.log({ type: "milestone", t, k: this.miles.k, level: r4(this.miles.level()), locked: r4(lockNow), lockedTotal: r4(this.miles.locked) });
    }
    if (this.onClose) this.onClose(rec);
  }
}
