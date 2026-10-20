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

const PLAN = "symbiot29";
/**
 * Symbiot's settings (build 32, Alex: "don't hardcode stuff, flexible"). These are only the
 * starting values: every one can be changed live from R2 `symbiot.json` (inapp.mjs reads it
 * every 30 s) without a new build.
 *   readChart  false = buy every coin it sees (the symbiot experiment); true = only on a
 *              Fibonacci pocket or an ignition candle
 *   stake      SOL per trade        tp / sl / trailFrom / holdMs   the exits
 *   maxOpen    trades open at once  perScan   coins looked at per scan
 *   maxRt      highest round-trip fee accepted (the real measured fee is always charged)
 *   minLq      smallest pool (USD) when known      minAgeSec  youngest coin when known
 *   learnAfter / learnWinRate  a setup is blocked after N trades under this win rate
 */
export const DEFAULTS = { readChart: false, stake: 1.618, tp: 0.40, sl: -0.15, trailFrom: 0.25, holdMs: 120_000, maxOpen: 55, perScan: 55, maxRt: 0.30, minLq: 3_000, minAgeSec: 60, learnAfter: 13, learnWinRate: 0.236 };
const TP = 0.13, SL = -0.08, HOLD_MS = 3 * 60_000, SIZE = 0.236, CAP = 0.618, COST = 0.01; // older ledgers only
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

export function rugOk(row, nowSec, cfg = DEFAULTS) {
  const created = num(row.ct) || num(row.ot);
  const age = created ? nowSec - created : null;
  if (age !== null && age < cfg.minAgeSec) return false;   // unknown age is traded too
  if (num(row.lq) !== null && !(num(row.lq) >= cfg.minLq)) return false;
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

/** What symbiot knows about a coin without reading its chart. */
export function liteShape(row, nowMs) {
  const b = (x, cuts) => { const i = cuts.findIndex((c) => x < c); return i === -1 ? cuts.length : i; };
  const created = num(row.ct) || num(row.ot);
  const ageMin = created ? (nowMs / 1000 - created) / 60 : null;
  return [
    ageMin === null ? "age?" : `age${b(ageMin, [3, 13, 55, 233])}`,
    num(row.lq) === null ? "lq?" : `lq${b(num(row.lq), [8_000, 21_000, 55_000, 144_000])}`,
    `h${Math.floor(new Date(nowMs).getUTCHours() / 6)}`,
    row.seen ? "src:trenches" : "src:trending",
  ];
}

export class Scalp {
  constructor({ src, log = () => {}, start = 10, stake = null, quote = null }) {
    this.src = src; this.log = log; this.stake = stake;
    this.cfg = { ...DEFAULTS, ...(stake ? { stake } : {}) };
    this.quote = quote || ((a) => this.#measure(a)); this.costSkips = 0; this.feesPaid = 0;
    this.learn = {}; this.skips = 0; this.measured = []; this.done = new Set();
    this.start = start; this.cash = start; this.open = new Map(); this.trades = []; this.cool = new Map();
  }
  equity() { let e = this.cash; for (const p of this.open.values()) e += p.units * p.last * (1 - (p.side ?? COST)); return e; }

  /** The real cost of this trade on this coin, measured now (fees.mjs). */
  async #measure({ mint, notional }) {
    const now = Date.now();
    if (!this.mkt || now - this.mkt.at > 60_000) {
      const [prices, gas] = await Promise.all([this.src.prices(["SOL"]).catch(() => []), this.src.gas().catch(() => null)]);
      this.mkt = { at: now, solUsd: Number((prices || []).find((p) => p.symbol === "SOL")?.price) || this.mkt?.solUsd || null, gas };
    }
    const [feeInfo, trades] = await Promise.all([this.src.feeInfo(mint).catch(() => null), this.src.trades(mint, 50).catch(() => [])]);
    const notionalUsd = notional * (this.mkt.solUsd || 0);
    const q = await quoteCosts({ mint, notionalUsd, gm: { feeInfo, trades, gas: this.mkt.gas, solUsd: this.mkt.solUsd }, tip: "lowest" });
    if (q.ok || q.costSide > 0) return q;
    // build 30: Jupiter did not answer. GMGN's own numbers for this coin still give the pool
    // fee, the taxes and the network cost: a real (if partial: no price impact) fee.
    if (q.poolFee !== null && q.poolFee !== undefined && notionalUsd > 0) {
      const side = Number(q.poolFee) + ((q.buyTax || 0) + (q.sellTax || 0)) / 2 + (q.netUsdSide || 0) / notionalUsd;
      return { ok: true, partial: true, costSide: side, costRt: 2 * side, why: "pool fee + tax + network (Jupiter silent)" };
    }
    return q;
  }
  inPlay() { let n = 0; for (const p of this.open.values()) n += p.cost; return n; }

  async scanLane(nowMs) {
    const nowSec = Math.floor(nowMs / 1000);
    if (this.open.size >= this.cfg.maxOpen) return { bought: 0 };
    // build 19: more charts: the 1m and 5m trending lists together
    const [r1, r5] = await Promise.all([this.src.trending("1m", 200).catch(() => []), this.src.trending("5m", 200).catch(() => [])]);
    const seen = new Set(), rows = [];
    // build 29: plus every coin GMGN's own Trenches columns showed (new, almost bonded, migrated)
    const feed = typeof this.src.feed === "function" ? this.src.feed() : [];
    for (const r of [...feed, ...(r1 || []), ...(r5 || [])]) if (r && r.a && !seen.has(r.a)) { seen.add(r.a); rows.push(r); }
    const picks = rows.filter((r) => r && r.a && !this.open.has(r.a) && !(this.cool.get(r.a) > nowMs) && !this.done.has(r.a) && rugOk(r, nowSec, this.cfg)).slice(0, this.cfg.perScan);
    // readChart off: two candles, only for the live price; on: 34 to read the setup
    const cands = await Promise.all(picks.map(async (r) => ({ r, cs: await this.src.candles(r.a, "1m", this.cfg.readChart ? 34 : 2).catch(() => null) })));
    let bought = 0;
    for (const { r, cs } of cands) {
      const fib = this.cfg.readChart ? fibSetup(cs) : null, ign = this.cfg.readChart && !fib ? ignition(cs) : null;
      if (this.open.size >= this.cfg.maxOpen) continue;
      if (this.cfg.readChart && !fib && !ign) continue;
      if (!Array.isArray(cs) || !cs.length) continue;
      // build 35: symbiot files every trade by what is known without a chart (age, pool,
      // hour, where the coin came from); with a chart, the chart shape as before
      const shape = cs.length >= 12 ? shapeOf(cs, r, nowMs) : liteShape(r, nowMs);
      shape.push(fib ? "e:fib" : ign ? "e:ign" : "e:any");
      // symbiot farms: its lessons are recorded, never used to refuse a coin (that blocked
      // all 7,417 coins on Alex's Mac). Only the chart side (readChart) acts on them.
      const bad = this.cfg.readChart ? this.badPart(shape) : null;
      if (bad) { this.skips++; this.log({ type: "learned-skip", lane: "fast", symbol: r.s, shape: bad }); continue; }
      const eq = this.equity();
      // build 29 (Alex: "infinite balance"): the stake is always 1.618 SOL, cash never blocks a trade
      const n = this.cfg.stake || Math.min(eq * SIZE, this.cash, eq * CAP - this.inPlay());
      if (!(n > 0.05)) break;
      // build 28 (Alex: "don't think about any coin, just do it"): buy at once. The fee is
      // measured right after (live Jupiter quote) and the ledger is corrected to it; until the
      // first measurement lands, the median of the fees measured so far stands in.
      // build 34 (Alex: "lowest fees possible"): one quick GMGN read of the coin's own pool fee
      // and tax before buying; a coin whose fixed fees alone pass maxRt is skipped.
      if (typeof this.src.feeInfo === "function") {
        const fi = await this.src.feeInfo(r.a).catch(() => null);
        const pool = (fi?.pool_fee_info_list || []).slice().sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0))[0];
        const sec = fi?.security || {};
        const fixedRt = pool ? 2 * Number(pool.fee_ratio || 0) + Number(sec.buy_tax || 0) + Number(sec.sell_tax || 0) : null;
        if (fixedRt !== null && fixedRt > this.cfg.maxRt) { this.costSkip(r, { ok: true, costRt: fixedRt }, nowMs); continue; }
      }
      const known = this.feeMedian();
      let q0 = null;
      if (known === null) {
        q0 = await Promise.race([this.quote({ mint: r.a, notional: n }), new Promise((_, no) => setTimeout(() => no(new Error("fee check over 15 s")), 15_000))])
          .catch((e) => ({ ok: false, why: String(e.message || e).slice(0, 80) }));
        if (q0 && !q0.ok && q0.costSide > 0) q0 = { ...q0, ok: true, costRt: 2 * q0.costSide };
        if (!q0 || !q0.ok || !(q0.costRt <= this.cfg.maxRt)) { this.costSkip(r, q0, nowMs); continue; }
        this.measured.push(q0.costSide);
      }
      const side = q0 ? q0.costSide : known;
      const price = cs[cs.length - 1].c;
      this.cash -= n;
      this.done.add(r.a);                                           // each coin is traded once
      this.feesPaid += n * side;
      this.open.set(r.a, { addr: r.a, symbol: r.s, cost: n, side, units: (n * (1 - side)) / price, entry: price, last: price, at: nowMs, shape, hunt: true, peak: 0, why: fib ? `fib ${fib.retr}` : ign ? `ignition +${Math.round(ign.body * 100)}% x${ign.vx} vol` : "new launch (learn)" });
      this.log({ type: "entry", lane: "fast", addr: r.a, symbol: r.s, spent: +n.toFixed(4), price, why: fib ? `golden pocket ${fib.retr} of a ${Math.round(fib.move * 100)}% move` : ign ? `ignition candle +${Math.round(ign.body * 100)}% on ${ign.vx}x volume` : "new launch, bought to learn" });
      bought++;
      if (!q0) this.#settleFee(r, n, nowMs);
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
        ? (move >= this.cfg.tp ? `+${Math.round(this.cfg.tp * 100)}%` : move <= this.cfg.sl ? `stop ${Math.round(this.cfg.sl * 100)}%` : p.peak >= this.cfg.trailFrom && move <= p.peak / 2 ? `gave back half of +${Math.round(p.peak * 100)}%` : nowMs - p.at >= this.cfg.holdMs ? `${Math.round(this.cfg.holdMs / 1000)} s` : null)
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
        if (L.n >= this.cfg.learnAfter && L.w / L.n < this.cfg.learnWinRate) { L.until = this.trades.length + 21; this.log({ type: "lesson", lane: "fast", shape: k, n: L.n, wins: L.w, avg: +(L.pnl / L.n).toFixed(4) }); }
      }
      this.log({ type: "close", lane: "fast", symbol: p.symbol, addr: p.addr, pnl: +pnl.toFixed(4), ret: +t.ret.toFixed(4), why, balance: +this.equity().toFixed(4) });
    }
  }

  /** The first part of a setup's shape that has proven it loses, or null. */
  badPart(shape) {
    for (const k of shape) {
      const L = this.learn[k];
      if (!L || L.n < this.cfg.learnAfter) continue;
      if (L.until > this.trades.length) return k;
      if (L.until && L.until <= this.trades.length) { L.n = 0; L.w = 0; L.pnl = 0; L.until = 0; } // second look
    }
    return null;
  }

  feeMedian() {
    const m = (this.measured || []).slice(-21).sort((a, b) => a - b);
    return m.length ? m[m.length >> 1] : null;
  }
  costSkip(r, q, nowMs) {
    this.costSkips++;
    (this.costWhy = this.costWhy || []).push(q && q.ok ? `${r.s}: rt ${(q.costRt * 100).toFixed(2)}%` : `${r.s}: ${q?.why || "no quote"}`);
    if (this.costWhy.length > 6) this.costWhy.shift();
    this.cool.set(r.a, nowMs + 60_000);
  }
  /** After a buy: measure its real fee and correct the ledger (fire and forget). */
  #settleFee(r, n, nowMs) {
    this.quote({ mint: r.a, notional: n }).then((q) => {
      if (q && !q.ok && q.costSide > 0) q = { ...q, ok: true, costRt: 2 * q.costSide };
      if (!q || !q.ok) return;
      this.measured.push(q.costSide);
      const p = this.open.get(r.a);
      if (!p || p.feeSettled) return;
      const d = q.costSide - p.side;
      p.units = (p.cost * (1 - q.costSide)) / p.entry;
      this.feesPaid += p.cost * d;
      p.side = q.costSide; p.feeSettled = true;
      p.shape.push(`rt${q.costRt < 0.01618 ? 0 : q.costRt < 0.03 ? 1 : q.costRt < 0.1 ? 2 : 3}`);
    }).catch(() => {});
  }

  /** Live settings from R2 symbiot.json: only known keys, only numbers/booleans. */
  configure(over) {
    if (!over || typeof over !== "object") return this.cfg;
    for (const [k, v] of Object.entries(over)) if (k in DEFAULTS && typeof v === typeof DEFAULTS[k] && (typeof v !== "number" || Number.isFinite(v))) this.cfg[k] = v;
    this.stake = this.cfg.stake;
    return this.cfg;
  }

  summary() {
    const n = this.trades.length, wins = this.trades.filter((t) => t.won).length;
    const plus = this.trades.reduce((s, t) => s + (t.pnl > 0 ? t.pnl : 0), 0), minus = this.trades.reduce((s, t) => s + (t.pnl < 0 ? t.pnl : 0), 0);
    return { plus: +plus.toFixed(4), minus: +minus.toFixed(4), net: +(plus + minus).toFixed(4), trades: n, wins, losses: n - wins, balance: +this.equity().toFixed(4), open: this.open.size, fees: +this.feesPaid.toFixed(5), costSkips: this.costSkips, costWhy: this.costWhy || [], lessons: Object.values(this.learn).filter((L) => L.until > this.trades.length).length, skips: this.skips };
  }
  toJSON() { return { v: 2, plan: PLAN, start: this.start, stake: this.stake, cash: this.cash, learn: this.learn, open: [...this.open.values()], trades: this.trades.slice(-500) }; }
  static from(j, opts) {
    const s = new Scalp(opts);
    // a different start or stake (Alex changed the plan) starts a fresh ledger
    const same = j && j.v === 2 && j.plan === PLAN && j.start === s.start && j.stake === s.stake;
    if (same) { s.cash = j.cash; for (const p of j.open || []) s.open.set(p.addr, p); s.trades = j.trades || []; for (const t of s.trades) if (t.addr) s.done.add(t.addr); for (const a of s.open.keys()) s.done.add(a); }
    if (same && j.learn) s.learn = j.learn;
    return s;
  }
}
