/**
 * The fast lane (build 10): many small trades a minute, fake money.
 *
 *   scan     every 3 s: GMGN trending (5m) -> rug checks (age, liquidity, top 10)
 *            -> 1m candles -> momentum: 3 rising closes, close above the 8-candle
 *            average, last volume above the 10 before it -> buy.
 *   manage   every 2 s: price from the 1m candle; take profit +13%, cut -8%,
 *            sell whatever is still open after 3 minutes.
 *   size     a fixed stake per trade when given (Alex: 1.618 SOL of a 50 SOL
 *            balance), else 23.6% of equity; at most 3 open, 61.8% of equity in play.
 *   costs    measured live per coin before each buy (build 13, Alex: "make the
 *            fees nothing"): Jupiter round trip + pool fee + tax + network, from
 *            fees.mjs. Only coins whose round trip is under 0.618% are traded,
 *            and the ledger charges exactly the measured cost.
 */

import { quoteCosts } from "./fees.mjs";

// Build 16 (Alex: "take some risk"): wider net, round trip up to 1.618%, 5 open.
const MAX_RT = 0.01618;
const TP = 0.13, SL = -0.08, HOLD_MS = 3 * 60_000, SIZE = 0.236, MAX_OPEN = 5, CAP = 0.618, COST = 0.01;
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

export function rugOk(row, nowSec) {
  const created = num(row.ct) || num(row.ot);
  const age = created ? nowSec - created : null;
  if (age === null || age < 8 * 60) return false;
  if (!(num(row.lq) >= 13_000)) return false;
  if (num(row.t10) !== null && !(num(row.t10) < 0.3)) return false;
  return true;
}

export function momentum(cs) {
  if (!Array.isArray(cs) || cs.length < 12) return false;
  const last = cs.slice(-3), prev = cs.slice(-11, -1);
  // two green candles in a row, above the 8-candle average, volume above normal
  const rising = last[1].c < last[2].c && last[0].c <= last[1].c * 1.0001;
  const avg = cs.slice(-8).reduce((s, k) => s + k.c, 0) / 8;
  const vAvg = prev.reduce((s, k) => s + k.v, 0) / prev.length;
  return rising && last[2].c > avg && last[2].v > vAvg;
}

/**
 * Learning (build 12): every closed trade is filed under the shape of its setup:
 * how hard it was rising, how much volume came in, how deep the pool was, how old
 * the coin was, and the hour. Once a shape has 5+ trades and wins under 38.2% or
 * loses money on average, the lane stops buying it. Bad shapes earn a second look
 * after 21 more trades elsewhere. No feelings: no revenge trade, no size-up after
 * a loss, the stake never changes.
 */
export function shapeOf(cs, row, nowMs) {
  const last = cs.slice(-3), prev = cs.slice(-11, -1);
  const rise = last[2].c / last[0].c - 1;
  const vr = last[2].v / Math.max(1e-9, prev.reduce((s, k) => s + k.v, 0) / prev.length);
  const created = num(row.ct) || num(row.ot);
  const ageMin = created ? (nowMs / 1000 - created) / 60 : 0;
  const b = (x, cuts) => cuts.findIndex((c) => x < c) === -1 ? cuts.length : cuts.findIndex((c) => x < c);
  return [
    `rise${b(rise, [0.02, 0.05, 0.13])}`, `vol${b(vr, [1.618, 2.618, 4.236])}`,
    `lq${b(num(row.lq) || 0, [21_000, 55_000, 144_000])}`, `age${b(ageMin, [21, 55, 144])}`,
    `h${Math.floor(new Date(nowMs).getUTCHours() / 6)}`,
  ];
}

export class Scalp {
  constructor({ src, log = () => {}, start = 10, stake = null, quote = null }) {
    this.src = src; this.log = log; this.stake = stake;
    this.quote = quote || ((a) => this.#measure(a)); this.costSkips = 0; this.feesPaid = 0;
    this.learn = {}; this.skips = 0;
    this.start = start; this.cash = start; this.open = new Map(); this.trades = []; this.cool = new Map();
  }
  equity() { let e = this.cash; for (const p of this.open.values()) e += p.units * p.last * (1 - (p.side ?? COST)); return e; }

  /** The real cost of this trade on this coin, measured now (fees.mjs). */
  async #measure({ mint, notional }) {
    const now = Date.now();
    if (!this.mkt || now - this.mkt.at > 60_000) {
      const [prices, gas] = await Promise.all([this.src.prices(["SOL"]).catch(() => []), this.src.gas().catch(() => null)]);
      this.mkt = { at: now, solUsd: Number(prices.find((p) => p.symbol === "SOL")?.price) || null, gas };
    }
    const [feeInfo, trades] = await Promise.all([this.src.feeInfo(mint).catch(() => null), this.src.trades(mint, 50).catch(() => [])]);
    return quoteCosts({ mint, notionalUsd: notional * (this.mkt.solUsd || 0), gm: { feeInfo, trades, gas: this.mkt.gas, solUsd: this.mkt.solUsd }, tip: "lowest" });
  }
  inPlay() { let n = 0; for (const p of this.open.values()) n += p.cost; return n; }

  async scanLane(nowMs) {
    const nowSec = Math.floor(nowMs / 1000);
    if (this.open.size >= MAX_OPEN) return { bought: 0 };
    const rows = (await this.src.trending("5m", 200)) || [];
    const picks = rows.filter((r) => r && r.a && !this.open.has(r.a) && !(this.cool.get(r.a) > nowMs) && rugOk(r, nowSec)).slice(0, 21);
    const cands = await Promise.all(picks.map(async (r) => ({ r, cs: await this.src.candles(r.a, "1m", 30).catch(() => null) })));
    let bought = 0;
    for (const { r, cs } of cands) {
      if (this.open.size >= MAX_OPEN || !momentum(cs)) continue;
      const shape = shapeOf(cs, r, nowMs);
      const bad = this.badPart(shape);
      if (bad) { this.skips++; this.log({ type: "learned-skip", lane: "fast", symbol: r.s, shape: bad }); continue; }
      const eq = this.equity();
      const n = Math.min(this.stake || eq * SIZE, this.cash, eq * CAP - this.inPlay());
      if (!(n > 0.05)) break;
      const q = await this.quote({ mint: r.a, notional: n }).catch((e) => ({ ok: false, why: String(e.message || e).slice(0, 80) }));
      if (!q || !q.ok || !(q.costRt <= MAX_RT)) {
        this.costSkips++;
        this.log({ type: "cost-skip", lane: "fast", symbol: r.s, why: q && q.ok ? `round trip ${(q.costRt * 100).toFixed(3)}% over 0.618%` : q?.why || "no quote" });
        this.cool.set(r.a, nowMs + 60_000);
        continue;
      }
      const side = q.costSide;
      const price = cs[cs.length - 1].c;
      this.cash -= n;
      this.feesPaid += n * side;
      this.open.set(r.a, { addr: r.a, symbol: r.s, cost: n, side, units: (n * (1 - side)) / price, entry: price, last: price, at: nowMs, shape });
      this.log({ type: "entry", lane: "fast", addr: r.a, symbol: r.s, spent: +n.toFixed(4), price });
      bought++;
    }
    return { bought };
  }

  async positionLane(nowMs) {
    for (const p of [...this.open.values()]) {
      const cs = await this.src.candles(p.addr, "1m", 2).catch(() => null);
      if (Array.isArray(cs) && cs.length) p.last = cs[cs.length - 1].c;
      const move = p.last / p.entry - 1;
      const why = move >= TP ? "take profit +13%" : move <= SL ? "stop -8%" : nowMs - p.at >= HOLD_MS ? "3 min time stop" : null;
      if (!why) continue;
      const side = p.side ?? COST;
      const got = p.units * p.last * (1 - side);
      this.feesPaid += p.units * p.last * side;
      this.cash += got;
      this.open.delete(p.addr);
      this.cool.set(p.addr, nowMs + 5 * 60_000);
      const pnl = got - p.cost;
      const t = { symbol: p.symbol, addr: p.addr, pnl, ret: pnl / p.cost, won: pnl > 0, why, held: nowMs - p.at };
      this.trades.push(t);
      for (const k of p.shape || []) {
        const L = (this.learn[k] = this.learn[k] || { n: 0, w: 0, pnl: 0, until: 0 });
        L.n++; if (t.won) L.w++; L.pnl += t.ret;
        if (L.n >= 5 && (L.w / L.n < 0.382 || L.pnl / L.n < 0)) { L.until = this.trades.length + 21; this.log({ type: "lesson", lane: "fast", shape: k, n: L.n, wins: L.w, avg: +(L.pnl / L.n).toFixed(4) }); }
      }
      this.log({ type: "close", lane: "fast", symbol: p.symbol, addr: p.addr, pnl: +pnl.toFixed(4), ret: +t.ret.toFixed(4), why, balance: +this.equity().toFixed(4) });
    }
  }

  /** The first part of a setup's shape that has proven it loses, or null. */
  badPart(shape) {
    for (const k of shape) {
      const L = this.learn[k];
      if (!L || L.n < 5) continue;
      if (L.until > this.trades.length) return k;
      if (L.until && L.until <= this.trades.length) { L.n = 0; L.w = 0; L.pnl = 0; L.until = 0; } // second look
    }
    return null;
  }

  summary() {
    const n = this.trades.length, wins = this.trades.filter((t) => t.won).length;
    return { trades: n, wins, losses: n - wins, balance: +this.equity().toFixed(4), open: this.open.size, fees: +this.feesPaid.toFixed(5), costSkips: this.costSkips, lessons: Object.values(this.learn).filter((L) => L.until > this.trades.length).length, skips: this.skips };
  }
  toJSON() { return { v: 2, start: this.start, stake: this.stake, cash: this.cash, learn: this.learn, open: [...this.open.values()], trades: this.trades.slice(-500) }; }
  static from(j, opts) {
    const s = new Scalp(opts);
    // a different start or stake (Alex changed the plan) starts a fresh ledger
    if (j && j.v === 2 && j.start === s.start && j.stake === s.stake) { s.cash = j.cash; for (const p of j.open || []) s.open.set(p.addr, p); s.trades = j.trades || []; }
    if (j && j.learn) s.learn = j.learn; // lessons survive even a new plan
    return s;
  }
}
