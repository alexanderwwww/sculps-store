/*
 * Daily Fibonacci ladder, Fibonacci recovery and portfolio milestones
 * (knowledge-base.md section 8 and the milestone row of section 7).
 * Pure numbers, no I/O.
 *
 *  - unit u = the first realised profit of the day;
 *  - cumulative rungs 1,2,3,5,8,13 x u, each one reached is banked as a checkpoint;
 *  - no trade may risk taking the day's P&L below (last checkpoint - 0.382u);
 *  - tomorrow's target = today's result x phi; a bad day keeps the target at
 *    its level (not zero);
 *  - after a loss L the recovery goal is phi x L, met by later realised profit.
 *    Recovery changes SELECTION only (brain.mjs): size still goes /phi after a
 *    loss and up only after a win (fib.mjs nextFraction). Martingale is banned.
 *  - milestones B0 x phi^k: on reaching one, 23.6% of that milestone's gain is
 *    locked away and never traded.
 */
import { PHI } from "./fib.mjs";

export const RUNGS = [1, 2, 3, 5, 8, 13];
const LOCK = 0.236;

export class DayLadder {
  constructor(s = {}) {
    this.key = s.key || null;
    this.u = s.u ?? null;
    this.pnl = s.pnl || 0;
    this.rung = s.rung ?? -1;                // index into RUNGS, -1 = none banked
    this.checkpoint = s.checkpoint ?? null;  // banked P&L
    this.target = s.target ?? null;          // today's target (from yesterday x phi)
    this.recovery = s.recovery || null;      // {goal, got, from}
    this.events = s.events || [];
  }
  toJSON() { return { key: this.key, u: this.u, pnl: this.pnl, rung: this.rung, checkpoint: this.checkpoint, target: this.target, recovery: this.recovery, events: this.events }; }

  /** New day: tomorrow's target = today's result x phi; a red day keeps the old target. */
  roll(key) {
    const result = this.pnl;
    const prevTarget = this.target;
    const summary = this.key ? { date: this.key, pnl: result, u: this.u, rung: this.rung >= 0 ? RUNGS[this.rung] : 0, checkpoint: this.checkpoint, recoveries: this.events.filter((e) => e.type === "recovered").length, losses: this.events.filter((e) => e.type === "loss").length } : null;
    this.key = key;
    this.target = result > 0 ? result * PHI : prevTarget;
    this.u = null; this.pnl = 0; this.rung = -1; this.checkpoint = null; this.events = [];
    // an unfinished recovery carries over: every lost cent is recovered
    return summary;
  }

  /** The lowest the day's P&L may go: last checkpoint - 0.382u (null = no checkpoint yet). */
  floor() { return this.checkpoint === null ? null : this.checkpoint - 0.382 * this.u; }
  /** How much a new trade may lose at worst. Infinity before the first checkpoint (the day stop rules then). */
  maxRisk() { const f = this.floor(); return f === null ? Infinity : Math.max(0, this.pnl - f); }
  inRecovery() { return !!this.recovery; }

  /** A closed trade's realised P&L. Returns the events it caused. */
  onClose(pnl) {
    const ev = [];
    this.pnl += pnl;
    if (pnl < 0) {
      const add = PHI * -pnl;
      if (this.recovery) this.recovery.goal += add; else this.recovery = { goal: add, got: 0 };
      ev.push({ type: "loss", loss: -pnl, recoveryGoal: this.recovery.goal - this.recovery.got });
    } else if (pnl > 0) {
      if (this.u === null) { this.u = pnl; ev.push({ type: "unit", u: pnl }); }
      if (this.recovery) {
        this.recovery.got += pnl;
        if (this.recovery.got >= this.recovery.goal - 1e-12) { ev.push({ type: "recovered", goal: this.recovery.goal }); this.recovery = null; }
      }
    }
    if (this.u !== null) {
      while (this.rung + 1 < RUNGS.length && this.pnl >= RUNGS[this.rung + 1] * this.u - 1e-12) {
        this.rung++;
        this.checkpoint = RUNGS[this.rung] * this.u;
        ev.push({ type: "rung", rung: RUNGS[this.rung], checkpoint: this.checkpoint });
      }
    }
    this.events.push(...ev);
    return ev;
  }
}

/** Portfolio milestones B0 x phi^k; lock 23.6% of each milestone's gain. */
export class Milestones {
  constructor(s = {}) {
    this.b0 = s.b0 ?? 10;
    this.k = s.k || 0;
    this.locked = s.locked || 0;
  }
  toJSON() { return { b0: this.b0, k: this.k, locked: this.locked }; }
  level(k = this.k) { return this.b0 * Math.pow(PHI, k); }
  next() { return this.level(this.k + 1); }
  /** total = everything the wallet holds (locked included). Returns the amount newly locked. */
  check(total) {
    let lockNow = 0;
    while (total >= this.next() - 1e-12) {
      const gain = this.next() - this.level();
      this.k++;
      lockNow += LOCK * gain;
    }
    this.locked += lockNow;
    return lockNow;
  }
}
