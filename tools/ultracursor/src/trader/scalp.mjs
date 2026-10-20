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
const MAX_RT = 0.30;   // build 24: fake money, trade and learn; the real measured cost is still charged
// Build 18 (Alex: "we need new data"): the Fibonacci lane keeps its own clean
// ledger and lessons; a ledger from an earlier plan is not carried over.
const PLAN = "ultra27";
// Build 27, ULTRA (Alex: "52,000 balance, 1,000 SOL you are allowed to lose, trade every new
// creation, 10,000 lessons"): every launch that passes the bare minimum is bought once at
// 1.618 SOL, setup or not (tagged e:any), so each one becomes a lesson. Trading stops for the
// day if the balance falls 1,000 SOL under where it started.
const LOSS_BUDGET = 1000;
// Build 25, the hunt (Alex: "I want you to lose now, not to win... find that one trade of 40%
// in 20 seconds"). Fake money, so it explores: brand-new launches from 60 s old, any pool
// that can fill (3K), fees up to 15% (always charged at the real measured cost). Entry is
// the chart: a Fibonacci pocket OR an ignition candle. Exit: +40% take, -15% stop, give back
// half of a +25% run and it is out, 2 minutes max. Learning only blocks a shape after 13
// trades under 23.6% wins: it is allowed to lose in order to learn.
const HUNT = { tp: 0.40, sl: -0.15, trailFrom: 0.25, holdMs: 120_000 };
const TP = 0.13, SL = -0.08, HOLD_MS = 3 * 60_000, SIZE = 0.236, MAX_OPEN = 34, CAP = 0.618, COST = 0.01;
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

export function rugOk(row, nowSec) {
  const created = num(row.ct) || num(row.ot);
  const age = created ? nowSec - created : null;
  if (age === null || age < 60) return false;            // build 24: new launches from 3 minutes old
  // build 23: pools under $89K let a 1.618 SOL buy move the price by itself (3-5% round
  // trips measured live on 2026-10-20); only deep pools are charted.
  if (!(num(row.lq) >= 3_000)) return false;                // build 24: back to 13K, Alex: "trade the new ones, it's fake money, learn"
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
  const fs = fibSetup(cs);
  const rise = last[2].c / last[0].c - 1;
  const vr = last[2].v / Math.max(1e-9, prev.reduce((s, k) => s + k.v, 0) / prev.length);
  const created = num(row.ct) || num(row.ot);
  const ageMin = created ? (nowMs / 1000 - created) / 60 : 0;
  const b = (x, cuts) => cuts.findIndex((c) => x < c) === -1 ? cuts.length : cuts.findIndex((c) => x < c);
  return [
    `rise${b(rise, [0.02, 0.05, 0.13])}`, `vol${b(vr, [1.618, 2.618, 4.236])}`,
    `lq${b(num(row.lq) || 0, [21_000, 55_000, 144_000])}`, `age${b(ageMin, [21, 55, 144])}`,
    `fib${fs ? (fs.retr < 0.618 ? "a" : "b") : "-"}`, `h${Math.floor(new Date(nowMs).getUTCHours() / 6)}`,
  ];
}

/**
 * Build 17 (Alex: "we don't trade the coin, we trade the chart, trade the Fibonacci"):
 * every scanned coin's 1m chart is read. Over the last 34 candles: the swing low,
 * then the swing high after it, a move of at least 13%. Buy when price has pulled
 * back into the golden pocket (0.5 to 0.705 of the move) and the last candle closed
 * green, and the pullback has not broken 0.786. Stop just under 0.786, target the
 * swing high. No hype, no narrative, no smart money: the chart only.
 */
/** An ignition candle: the live 1m candle up 4%+ on 2.618x the normal volume. */
export function ignition(cs) {
  if (!Array.isArray(cs) || cs.length < 4) return null;
  const k = cs[cs.length - 1], prev = cs.slice(-11, -1);
  const vAvg = prev.reduce((s, x) => s + x.v, 0) / prev.length;
  const body = k.o > 0 ? k.c / k.o - 1 : 0;
  return body >= 0.04 && k.v >= 2.618 * vAvg ? { body: +body.toFixed(3), vx: +(k.v / Math.max(1e-9, vAvg)).toFixed(1) } : null;
}

export function fibSetup(cs) {
  if (!Array.isArray(cs) || cs.length < 13) return null;
  const w = cs.slice(-34);
  let hiI = 0;
  for (let i = 1; i < w.length; i++) if (w[i].h > w[hiI].h) hiI = i;
  if (hiI < 2 || hiI > w.length - 2) return null;          // the high must have a pullback after it
  let loI = 0;
  for (let i = 1; i < hiI; i++) if (w[i].l < w[loI].l) loI = i;
  const hi = w[hiI].h, lo = w[loI].l, D = hi - lo;
  if (!(lo > 0) || hi / lo - 1 < 0.08) return null;           // build 19: an 8% run is enough
  const last = w[w.length - 1];
  const retr = (hi - last.c) / D;
  const floor = hi - 0.886 * D;                              // build 19: deep pocket allowed, stop under 0.886
  const held = w.slice(hiI + 1).every((k) => k.l >= floor);
  if (!(retr >= 0.382 && retr <= 0.786) || !(last.c > last.o) || !held) return null; // build 19: 0.382 to 0.786
  return { hi, lo, retr: +retr.toFixed(3), stop: floor * 0.995, target: hi * 0.995, move: +(hi / lo - 1).toFixed(3) };
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
    // build 19: more charts: the 1m and 5m trending lists together
    const [r1, r5] = await Promise.all([this.src.trending("1m", 200).catch(() => []), this.src.trending("5m", 200).catch(() => [])]);
    const seen = new Set(), rows = [];
    for (const r of [...(r1 || []), ...(r5 || [])]) if (r && r.a && !seen.has(r.a)) { seen.add(r.a); rows.push(r); }
    const picks = rows.filter((r) => r && r.a && !this.open.has(r.a) && !(this.cool.get(r.a) > nowMs) && rugOk(r, nowSec)).slice(0, 89);
    const cands = await Promise.all(picks.map(async (r) => ({ r, cs: await this.src.candles(r.a, "1m", 34).catch(() => null) })));
    let bought = 0;
    for (const { r, cs } of cands) {
      const fib = fibSetup(cs), ign = fib ? null : ignition(cs);
      if (this.open.size >= MAX_OPEN) continue;
      if (this.start - this.equity() >= LOSS_BUDGET) { this.log({ type: "halt", lane: "fast", why: `down ${LOSS_BUDGET} SOL: the budget Alex set` }); break; }
      if (!Array.isArray(cs) || !cs.length) continue;
      const shape = cs.length >= 12 ? shapeOf(cs, r, nowMs) : [`young`];
      shape.push(fib ? "e:fib" : ign ? "e:ign" : "e:any");
      const bad = this.badPart(shape);
      if (bad) { this.skips++; this.log({ type: "learned-skip", lane: "fast", symbol: r.s, shape: bad }); continue; }
      const eq = this.equity();
      const n = Math.min(this.stake || eq * SIZE, this.cash, eq * CAP - this.inPlay());
      if (!(n > 0.05)) break;
      let q = await this.quote({ mint: r.a, notional: n }).catch((e) => ({ ok: false, why: String(e.message || e).slice(0, 80) }));
      // hunt: the 2.36% price-impact cap is the careful lanes' rule; here the measured cost is taken as it is
      if (q && !q.ok && q.costSide > 0) q = { ...q, ok: true, costRt: 2 * q.costSide };
      if (!q || !q.ok || !(q.costRt <= MAX_RT)) {
        this.costSkips++;
        (this.costWhy = this.costWhy || []).push(q && q.ok ? `${r.s}: rt ${(q.costRt * 100).toFixed(2)}%` : `${r.s}: ${q?.why || "no quote"}`);
        if (this.costWhy.length > 6) this.costWhy.shift();
        this.log({ type: "cost-skip", lane: "fast", symbol: r.s, why: q && q.ok ? `round trip ${(q.costRt * 100).toFixed(3)}% over 0.618%` : q?.why || "no quote" });
        this.cool.set(r.a, nowMs + 60_000);
        continue;
      }
      const side = q.costSide;
      shape.push(`rt${q.costRt < 0.01618 ? 0 : q.costRt < 0.03 ? 1 : 2}`); // learning knows what the fee was
      const price = cs[cs.length - 1].c;
      this.cash -= n;
      this.feesPaid += n * side;
      this.open.set(r.a, { addr: r.a, symbol: r.s, cost: n, side, units: (n * (1 - side)) / price, entry: price, last: price, at: nowMs, shape, hunt: true, peak: 0, why: fib ? `fib ${fib.retr}` : ign ? `ignition +${Math.round(ign.body * 100)}% x${ign.vx} vol` : "new launch (learn)" });
      this.log({ type: "entry", lane: "fast", addr: r.a, symbol: r.s, spent: +n.toFixed(4), price, why: fib ? `golden pocket ${fib.retr} of a ${Math.round(fib.move * 100)}% move` : ign ? `ignition candle +${Math.round(ign.body * 100)}% on ${ign.vx}x volume` : "new launch, bought to learn" });
      bought++;
    }
    return { bought };
  }

  async positionLane(nowMs) {
    for (const p of [...this.open.values()]) {
      const cs = await this.src.candles(p.addr, "1m", 2).catch(() => null);
      if (Array.isArray(cs) && cs.length) p.last = cs[cs.length - 1].c;
      const move = p.last / p.entry - 1;
      // build 20 (Alex: "fast 10% up, 20% up, with 1.6 SOL"): half off at +10% and the
      // stop moves to break-even, the rest off at +20%. Entry stays the Fibonacci pocket.
      if (p.target && !p.half && move >= 0.10) {
        const side = p.side ?? COST, u = p.units / 2, got = u * p.last * (1 - side);
        this.feesPaid += u * p.last * side; this.cash += got;
        p.units -= u; p.banked = got; p.half = true; p.stop = Math.max(p.stop, p.entry * (1 + 2 * side));
        this.log({ type: "exit", lane: "fast", symbol: p.symbol, addr: p.addr, part: "half at +10%", got: +got.toFixed(4) });
      }
      if (p.hunt) p.peak = Math.max(p.peak || 0, move);
      const why = p.hunt
        ? (move >= HUNT.tp ? "+40%" : move <= HUNT.sl ? "stop -15%" : p.peak >= HUNT.trailFrom && move <= p.peak / 2 ? `gave back half of +${Math.round(p.peak * 100)}%` : nowMs - p.at >= HUNT.holdMs ? "2 min" : null)
        : p.target
        ? (move >= 0.20 ? "+20%" : p.last <= p.stop ? (p.half ? "rest at break-even" : "stop: under the pocket") : nowMs - p.at >= 13 * 60_000 ? "13 min time stop" : null)
        : (move >= TP ? "take profit +13%" : move <= SL ? "stop -8%" : nowMs - p.at >= HOLD_MS ? "3 min time stop" : null);
      if (!why) continue;
      const side = p.side ?? COST;
      const got = p.units * p.last * (1 - side);
      this.feesPaid += p.units * p.last * side;
      this.cash += got;
      this.open.delete(p.addr);
      this.cool.set(p.addr, nowMs + 5 * 60_000);
      const pnl = got + (p.banked || 0) - p.cost;
      const t = { symbol: p.symbol, addr: p.addr, pnl, ret: pnl / p.cost, won: pnl > 0, why, held: nowMs - p.at };
      this.trades.push(t);
      for (const k of p.shape || []) {
        const L = (this.learn[k] = this.learn[k] || { n: 0, w: 0, pnl: 0, until: 0 });
        L.n++; if (t.won) L.w++; L.pnl += t.ret;
        if (L.n >= 13 && L.w / L.n < 0.236) { L.until = this.trades.length + 21; this.log({ type: "lesson", lane: "fast", shape: k, n: L.n, wins: L.w, avg: +(L.pnl / L.n).toFixed(4) }); }
      }
      this.log({ type: "close", lane: "fast", symbol: p.symbol, addr: p.addr, pnl: +pnl.toFixed(4), ret: +t.ret.toFixed(4), why, balance: +this.equity().toFixed(4) });
    }
  }

  /** The first part of a setup's shape that has proven it loses, or null. */
  badPart(shape) {
    for (const k of shape) {
      const L = this.learn[k];
      if (!L || L.n < 13) continue;
      if (L.until > this.trades.length) return k;
      if (L.until && L.until <= this.trades.length) { L.n = 0; L.w = 0; L.pnl = 0; L.until = 0; } // second look
    }
    return null;
  }

  summary() {
    const n = this.trades.length, wins = this.trades.filter((t) => t.won).length;
    return { trades: n, wins, losses: n - wins, balance: +this.equity().toFixed(4), open: this.open.size, fees: +this.feesPaid.toFixed(5), costSkips: this.costSkips, costWhy: this.costWhy || [], lessons: Object.values(this.learn).filter((L) => L.until > this.trades.length).length, skips: this.skips };
  }
  toJSON() { return { v: 2, plan: PLAN, start: this.start, stake: this.stake, cash: this.cash, learn: this.learn, open: [...this.open.values()], trades: this.trades.slice(-500) }; }
  static from(j, opts) {
    const s = new Scalp(opts);
    // a different start or stake (Alex changed the plan) starts a fresh ledger
    const same = j && j.v === 2 && j.plan === PLAN && j.start === s.start && j.stake === s.stake;
    if (same) { s.cash = j.cash; for (const p of j.open || []) s.open.set(p.addr, p); s.trades = j.trades || []; }
    if (same && j.learn) s.learn = j.learn;
    return s;
  }
}
