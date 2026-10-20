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
import { exitReason, rulesKey, rulesOf, track, realNet, TIERS } from "./exits.mjs";

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
 *   filter / explore  symbiot skips a whole combination (age+pool+hour+source) that keeps
 *              losing, but still lets `explore` of them through so a lesson can be unlearned
 *   crashMs / crashMove  build 41 (Alex: "abort numbers keep"): out when down 8% in the first 20 s
 *   deadMs / deadMove    build 41: out when never 2% up and never 2% down after 30 s (exits.mjs)
 *   tagEntry   build 41: read 34 candles instead of 2 (same one call) so every trade is tagged
 *              e:fib / e:ign / e:any, and a Fibonacci entry can be proven before real money
 */
export const DEFAULTS = { readChart: false, stake: 1.618, tp: 0.40, sl: -0.15, trailFrom: 0.25, holdMs: 120_000, maxOpen: 55, perScan: 55, maxRt: 0.30, minLq: 3_000, minAgeSec: 60, learnAfter: 13, learnWinRate: 0.236, shadowMs: 120_000, filter: true, explore: 0.125, maxTrades: 5000, crashMs: 20_000, crashMove: -0.08, deadMs: 30_000, deadMove: 0.02, tagEntry: true };
/** Build 41, the ghost proof: outcomes kept per combination and real target (a rolling window). */
const PROOF_WINDOW = 55;
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
  constructor({ src, log = () => {}, start = 10, stake = null, quote = null, onPick = null, realStakeUsd = 5.73 }) {
    this.src = src; this.log = log; this.stake = stake;
    // build 41: the stake the ledger was made with. A stake set from symbiot.json changes
    // this.stake, and comparing that on restart wiped combos, learn and mistakes.
    this.baseStake = stake;
    this.cfg = { ...DEFAULTS, ...(stake ? { stake } : {}) };
    // build 41: the real side listens to every pick (onPick) and sets the stake its proof is
    // scored at (step 1: 38.2% of $15). Neither is a setting: symbiot.json cannot reach them.
    this.onPick = onPick; this.realStakeUsd = realStakeUsd;
    this.proof = {}; this.proofPrev = null;
    this.quote = quote || ((a) => this.#measure(a)); this.costSkips = 0; this.feesPaid = 0;
    this.learn = {}; this.skips = 0; this.measured = []; this.done = new Set(); this.shadow = new Map(); this.mistakes = {}; this.combos = {}; this.rand = Math.random;
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
    // build 41: when the real side listens, a full sim still scans (it only stops buying), so
    // real is never starved of signals. Without a listener the GMGN calls are saved, as before.
    const full = () => this.open.size >= this.cfg.maxOpen || this.trades.length + this.open.size >= this.cfg.maxTrades;
    const listen = typeof this.onPick === "function";
    if (!listen && this.open.size >= this.cfg.maxOpen) return { bought: 0 };
    // build 39 (Alex: "stop only at 5000 trades"): no new buys once this many trades are done
    if (!listen && this.trades.length + this.open.size >= this.cfg.maxTrades) return { bought: 0, done: true };
    // build 19: more charts: the 1m and 5m trending lists together
    const [r1, r5] = await Promise.all([this.src.trending("1m", 200).catch(() => []), this.src.trending("5m", 200).catch(() => [])]);
    const seen = new Set(), rows = [];
    // build 29: plus every coin GMGN's own Trenches columns showed (new, almost bonded, migrated)
    const feed = typeof this.src.feed === "function" ? this.src.feed() : [];
    for (const r of [...feed, ...(r1 || []), ...(r5 || [])]) if (r && r.a && !seen.has(r.a)) { seen.add(r.a); rows.push(r); }
    const picks = rows.filter((r) => r && r.a && !this.open.has(r.a) && !(this.cool.get(r.a) > nowMs) && !this.done.has(r.a) && rugOk(r, nowSec, this.cfg)).slice(0, this.cfg.perScan);
    // readChart off: two candles, only for the live price; on: 34 to read the setup.
    // build 41: tagEntry also asks for 34, in the same one call, to tag the entry
    const read = this.cfg.readChart || this.cfg.tagEntry;
    const cands = await Promise.all(picks.map(async (r) => ({ r, cs: await this.src.candles(r.a, "1m", read ? 34 : 2).catch(() => null) })));
    let bought = 0;
    for (const { r, cs } of cands) {
      const fib = read ? fibSetup(cs) : null, ign = read && !fib ? ignition(cs) : null;
      if (!Array.isArray(cs) || !cs.length) continue;
      // build 35: symbiot files every trade by what is known without a chart (age, pool,
      // hour, where the coin came from); with a chart, the chart shape as before.
      // build 41: a tagged entry keeps the chart-free key, so symbiot's combos stay comparable
      const shape = this.cfg.readChart && cs.length >= 12 ? shapeOf(cs, r, nowMs) : liteShape(r, nowMs);
      shape.push(fib ? "e:fib" : ign ? "e:ign" : "e:any");
      // symbiot farms: its lessons are recorded, never used to refuse a coin (that blocked
      // all 7,417 coins on Alex's Mac). Only the chart side (readChart) acts on them.
      const combo = shape.join("|");
      // build 41: every pick goes to the real side before any filter or cost check, even when
      // the sim is full. A real-side error never stops the sim.
      if (listen) {
        try { const x = this.onPick({ row: r, cs, shape: [...shape], combo, fib, nowMs }); if (x && typeof x.catch === "function") x.catch(() => {}); } catch { /* the sim goes on */ }
      }
      if (full()) continue;
      if (this.cfg.readChart && !fib && !ign) continue;
      let bad = this.cfg.readChart ? this.badPart(shape) : null;
      // build 38 (Alex: "learn to filter, losing is ok, but try to make money"): symbiot
      // filters on the whole combination only, never one trait (one trait blocked everything)
      if (!bad && !this.cfg.readChart && this.cfg.filter) {
        const C = this.combos[combo];
        if (C && C.n >= this.cfg.learnAfter && C.w / C.n < this.cfg.learnWinRate && this.rand() >= this.cfg.explore) bad = combo;
      }
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
      this.open.set(r.a, { addr: r.a, symbol: r.s, cost: n, side, units: (n * (1 - side)) / price, entry: price, last: price, at: nowMs, shape, combo, hunt: true, peak: 0, why: fib ? `fib ${fib.retr}` : ign ? `ignition +${Math.round(ign.body * 100)}% x${ign.vx} vol` : "new launch (learn)" });
      this.log({ type: "entry", lane: "fast", addr: r.a, symbol: r.s, spent: +n.toFixed(4), price, why: fib ? `golden pocket ${fib.retr} of a ${Math.round(fib.move * 100)}% move` : ign ? `ignition candle +${Math.round(ign.body * 100)}% on ${ign.vx}x volume` : "new launch, bought to learn" });
      bought++;
      if (!q0) this.#settleFee(r, n, nowMs);
    }
    return this.trades.length + this.open.size >= this.cfg.maxTrades ? { bought, done: true } : { bought };
  }

  /**
   * Build 36, the post-mortem (Alex: "for every trade, pattern recognition of your mistake").
   * After a trade closes, its coin is watched for `shadowMs` more. Then the trade gets one tag:
   *   sold-too-early   exited on time/give-back/target and the coin ran 20%+ past the exit
   *   stop-then-pump   stopped out and the coin then went 20%+ above the entry
   *   bought-the-top   never went 3% up, lost
   *   gave-back        was 15%+ up, closed at a loss
   *   fee-ate-it       price moved under 2% either way, lost only to the fee
   *   cut-right        stopped, and the coin kept falling after
   *   good             a win that was not left on the table
   * The counts live in summary().mistakes, with each tag's average result.
   */
  async #shadows(nowMs) {
    for (const [a, sh] of [...this.shadow]) {
      // build 41: shadows now run after the open loop; a coin closed this very tick was just
      // read, so it waits for the next tick (the same number of GMGN calls as before)
      if (sh.exitAt >= nowMs) continue;
      const cs = await this.src.candles(a, "1m", 2).catch(() => null);
      const px = Array.isArray(cs) && cs.length ? cs[cs.length - 1].c : null;
      if (px) { sh.after.max = Math.max(sh.after.max, px); sh.after.min = Math.min(sh.after.min, px); }
      if (nowMs - sh.exitAt < this.cfg.shadowMs) continue;
      this.shadow.delete(a);
      const t = sh.trade, runAfter = sh.after.max / sh.exit - 1, aboveEntry = sh.after.max / sh.entry - 1, fellAfter = sh.after.min / sh.exit - 1;
      const tag = /stop/.test(t.why) && aboveEntry >= 0.2 ? "stop-then-pump"
        : /stop/.test(t.why) && fellAfter <= -0.05 ? "cut-right"
        : !/stop/.test(t.why) && runAfter >= 0.2 ? "sold-too-early"
        : !t.won && sh.peak >= 0.15 ? "gave-back"
        : !t.won && sh.peak < 0.03 && Math.abs(sh.exit / sh.entry - 1) >= 0.02 ? "bought-the-top"
        : !t.won && Math.abs(sh.exit / sh.entry - 1) < 0.02 ? "fee-ate-it"
        : t.won ? "good" : "bought-the-top";
      t.mistake = tag; t.runAfter = +runAfter.toFixed(3); t.peak = +sh.peak.toFixed(3);
      const M = (this.mistakes[tag] = this.mistakes[tag] || { n: 0, ret: 0 });
      M.n++; M.ret += t.ret;
      this.log({ type: "post-mortem", lane: "fast", symbol: t.symbol, tag, peak: t.peak, runAfter: t.runAfter, why: t.why, ret: +t.ret.toFixed(4), shape: sh.shape });
    }
  }

  async positionLane(nowMs) {
    // build 41: youngest first, so the coins whose crash or dead window is still open get the
    // early GMGN reads (all calls share one queue, 250 ms apart)
    for (const p of [...this.open.values()].sort((a, b) => b.at - a.at)) {
      const cs = await this.src.candles(p.addr, "1m", 2).catch(() => null);
      if (Array.isArray(cs) && cs.length) p.last = cs[cs.length - 1].c;
      const move = p.last / p.entry - 1;
      track(p, move);
      // build 20 (Alex: "fast 10% up, 20% up, with 1.6 SOL"): half off at +10% and the
      // stop moves to break-even, the rest off at +20%. Entry stays the Fibonacci pocket.
      if (p.target && !p.half && move >= 0.10) {
        const side = p.side ?? COST, u = p.units / 2, got = u * p.last * (1 - side);
        this.feesPaid += u * p.last * side; this.cash += got;
        p.units -= u; p.banked = got; p.half = true; p.stop = Math.max(p.stop, p.entry * (1 + 2 * side));
        this.log({ type: "exit", lane: "fast", symbol: p.symbol, addr: p.addr, part: "half at +10%", got: +got.toFixed(4) });
      }
      // build 41: the hunt exit is exits.mjs, the one the real trader uses (abort rules included)
      if (p.hunt) this.#ghost(p, move, nowMs);
      const why = p.hunt
        ? exitReason(p, move, nowMs - p.at, this.cfg)
        : p.target
        ? (move >= 0.20 ? "+20%" : p.last <= p.stop ? (p.half ? "rest at break-even" : "stop: under the pocket") : nowMs - p.at >= 13 * 60_000 ? "13 min time stop" : null)
        : (move >= TP ? "take profit +13%" : move <= SL ? "stop -8%" : nowMs - p.at >= HOLD_MS ? "3 min time stop" : null);
      if (why && p.hunt) this.#fileGhost(p, move, why, nowMs);
      if (!why) continue;
      const side = p.side ?? COST;
      const got = p.units * p.last * (1 - side);
      this.feesPaid += p.units * p.last * side;
      this.cash += got;
      this.open.delete(p.addr);
      this.cool.set(p.addr, nowMs + 5 * 60_000);
      const pnl = got + (p.banked || 0) - p.cost;
      const t = { symbol: p.symbol, addr: p.addr, pnl, ret: pnl / p.cost, won: pnl > 0, why, held: nowMs - p.at, ...(p.hunt ? { rules: rulesKey(this.cfg) } : {}) };
      this.trades.push(t);
      if (p.combo) { const C = (this.combos[p.combo] = this.combos[p.combo] || { n: 0, w: 0, pnl: 0 }); C.n++; if (t.won) C.w++; C.pnl += t.pnl; }
      this.shadow.set(p.addr, { trade: t, exit: p.last, exitAt: nowMs, entry: p.entry, peak: p.peakAll || 0, shape: p.shape, after: { max: p.last, min: p.last } });
      for (const k of p.shape || []) {
        const L = (this.learn[k] = this.learn[k] || { n: 0, w: 0, pnl: 0, until: 0 });
        L.n++; if (t.won) L.w++; L.pnl += t.ret;
        if (L.n >= this.cfg.learnAfter && L.w / L.n < this.cfg.learnWinRate) { L.until = this.trades.length + 21; this.log({ type: "lesson", lane: "fast", shape: k, n: L.n, wins: L.w, avg: +(L.pnl / L.n).toFixed(4) }); }
      }
      this.log({ type: "close", lane: "fast", symbol: p.symbol, addr: p.addr, pnl: +pnl.toFixed(4), ret: +t.ret.toFixed(4), why, balance: +this.equity().toFixed(4) });
    }
    // build 41: the post-mortem reads come after every exit, so they never delay one
    await this.#shadows(nowMs);
  }

  /**
   * Build 41, the ghost proof: what real money is gated on, at zero extra GMGN calls. On every
   * tick of a hunt position, each real target T gets the first exit exitReason() gives with
   * tp = T, stored once in p.ghost[T]. p.ghost.rk is the exit rules it was scored under; if
   * they change while a target is still open, the position is never filed (rules never mix).
   */
  #ghost(p, move, nowMs) {
    const rk = rulesKey(this.cfg);
    const g = (p.ghost = p.ghost || { rk });
    if (g.rk !== rk && TIERS.some((T) => !g[T])) g.rk = null;
    if (!g.rk) return;
    for (const T of TIERS) {
      if (g[T]) continue;
      const why = exitReason(p, move, nowMs - p.at, { ...this.cfg, tp: T });
      if (why) g[T] = { move: +move.toFixed(4), why, at: nowMs };
    }
  }

  /**
   * At the sim's close, every target's outcome goes into its rules bucket. A target still open
   * takes the sim's own close (every exit but take-profit is shared, and tp 0.40 > 0.34). If the
   * sim's own take-profit sits below a target (tp lowered in symbiot.json), that target's
   * outcome is unknown and is not filed: a guess never counts as proof.
   */
  #fileGhost(p, move, why, nowMs) {
    const g = p.ghost;
    if (!g || !g.rk || g.filed || !p.combo) return;
    const B = this.#bucket(g.rk);
    if (!B) return;
    const K = (B.keys[p.combo] = B.keys[p.combo] || {});
    const side = p.side ?? COST;
    for (const T of TIERS) {
      if (!g[T]) {
        if (move >= this.cfg.tp && this.cfg.tp < T) continue;
        g[T] = { move: +move.toFixed(4), why, at: nowMs };
      }
      const net = realNet(g[T].move, side, this.realStakeUsd);
      const S = (K[T] = K[T] || { n: 0, w: 0, net: 0, last: 0, rt: 0, o: [] });
      S.o.push(+net.toFixed(4));
      if (S.o.length > PROOF_WINDOW) S.o.shift();
      S.n = S.o.length; S.w = S.o.filter((x) => x > 0).length; S.net = +S.o.reduce((a, x) => a + x, 0).toFixed(4); S.last = nowMs;
      S.rt = +(S.rt + (2 * side - S.rt) / S.n).toFixed(5);       // about the window's round-trip fee, network apart
    }
    g.filed = true;
  }

  /**
   * The proof bucket for one set of exit rules: proof[rulesKey] = {rules, keys: {combo: {T:
   * {n, w, net (USD, window sum), last, rt, o (the last 55 nets)}}}}. A rules change opens a new
   * bucket and keeps the old one as proofPrev; changing back brings the old one back.
   */
  #bucket(rk) {
    // an outcome scored entirely under the rules before a change goes where those are kept,
    // and never moves the buckets (or it would swap them back and forth)
    if (rk !== rulesKey(this.cfg)) return this.proof[rk] || (this.proofPrev && this.proofPrev[rk]) || null;
    if (!this.proof[rk]) {
      const cur = this.proof, keep = Object.values(cur).some((B) => B && B.keys && Object.keys(B.keys).length);   // an empty bucket is not worth keeping
      if (this.proofPrev && this.proofPrev[rk]) { this.proof = this.proofPrev; this.proofPrev = keep ? cur : null; }
      else { if (keep) this.proofPrev = cur; this.proof = { [rk]: { rules: rulesOf(this.cfg), keys: {} } }; }
    }
    return this.proof[rk];
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
    // build 37: the open trades marked at their last price, so the money line moves every second
    let live = 0;
    for (const p of this.open.values()) live += p.units * p.last * (1 - (p.side ?? COST)) - p.cost + (p.banked || 0);
    const last = [...this.trades].reverse().find((t) => t.mistake);
    return { live: +live.toFixed(4), lastLesson: last ? `${last.symbol}: ${last.mistake}` : null, plus: +plus.toFixed(4), minus: +minus.toFixed(4), net: +(plus + minus).toFixed(4), trades: n, wins, losses: n - wins, balance: +this.equity().toFixed(4), open: this.open.size, filtered: Object.values(this.combos).filter((C) => C.n >= this.cfg.learnAfter && C.w / C.n < this.cfg.learnWinRate).length,
      bestCombos: Object.entries(this.combos).filter(([, C]) => C.n >= 5).sort((a, b) => b[1].pnl / b[1].n - a[1].pnl / a[1].n).slice(0, 3).map(([k, C]) => `${k} ${C.w}/${C.n} ${(C.pnl / C.n).toFixed(3)}`),
      fees: +this.feesPaid.toFixed(5), mistakes: Object.fromEntries(Object.entries(this.mistakes).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, { n: v.n, avg: +(v.ret / v.n).toFixed(3) }])), costSkips: this.costSkips, costWhy: this.costWhy || [], lessons: Object.values(this.learn).filter((L) => L.until > this.trades.length).length, skips: this.skips };
  }
  toJSON() { return { v: 2, plan: PLAN, start: this.start, stake: this.stake, baseStake: this.baseStake, cash: this.cash, learn: this.learn, mistakes: this.mistakes, combos: this.combos, proof: this.proof, proofPrev: this.proofPrev, open: [...this.open.values()], trades: this.trades.slice(-500) }; }
  static from(j, opts) {
    const s = new Scalp(opts);
    // a different start or stake (Alex changed the plan) starts a fresh ledger.
    // build 41: the stake compared is the one the ledger was made with (baseStake), not one
    // set later from symbiot.json; a ledger from before build 41 has only `stake`
    const base = j && typeof j === "object" && "baseStake" in j ? j.baseStake : j && j.stake;
    const same = j && j.v === 2 && j.plan === PLAN && j.start === s.start && base === s.baseStake;
    if (same) { s.cash = j.cash; for (const p of j.open || []) s.open.set(p.addr, p); s.trades = j.trades || []; for (const t of s.trades) if (t.addr) s.done.add(t.addr); for (const a of s.open.keys()) s.done.add(a); }
    if (same && j.learn) s.learn = j.learn;
    if (same && j.mistakes) s.mistakes = j.mistakes;
    if (same && j.combos) s.combos = j.combos;
    if (same && j.proof && typeof j.proof === "object") { s.proof = j.proof; s.proofPrev = j.proofPrev && typeof j.proofPrev === "object" ? j.proofPrev : null; }
    return s;
  }
}
