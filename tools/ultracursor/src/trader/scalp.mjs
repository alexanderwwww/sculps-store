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
 *   costs    1% a side (fees + slippage), charged on every buy and sell.
 */

const TP = 0.13, SL = -0.08, HOLD_MS = 3 * 60_000, SIZE = 0.236, MAX_OPEN = 3, CAP = 0.618, COST = 0.01;
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
  const rising = last[0].c < last[1].c && last[1].c < last[2].c;
  const avg = cs.slice(-8).reduce((s, k) => s + k.c, 0) / 8;
  const vAvg = prev.reduce((s, k) => s + k.v, 0) / prev.length;
  return rising && last[2].c > avg && last[2].v > vAvg;
}

export class Scalp {
  constructor({ src, log = () => {}, start = 10, stake = null }) {
    this.src = src; this.log = log; this.stake = stake;
    this.start = start; this.cash = start; this.open = new Map(); this.trades = []; this.cool = new Map();
  }
  equity() { let e = this.cash; for (const p of this.open.values()) e += p.units * p.last * (1 - COST); return e; }
  inPlay() { let n = 0; for (const p of this.open.values()) n += p.cost; return n; }

  async scanLane(nowMs) {
    const nowSec = Math.floor(nowMs / 1000);
    if (this.open.size >= MAX_OPEN) return { bought: 0 };
    const rows = (await this.src.trending("5m", 200)) || [];
    const picks = rows.filter((r) => r && r.a && !this.open.has(r.a) && !(this.cool.get(r.a) > nowMs) && rugOk(r, nowSec)).slice(0, 8);
    const cands = await Promise.all(picks.map(async (r) => ({ r, cs: await this.src.candles(r.a, "1m", 30).catch(() => null) })));
    let bought = 0;
    for (const { r, cs } of cands) {
      if (this.open.size >= MAX_OPEN || !momentum(cs)) continue;
      const eq = this.equity();
      const n = Math.min(this.stake || eq * SIZE, this.cash, eq * CAP - this.inPlay());
      if (!(n > 0.05)) break;
      const price = cs[cs.length - 1].c;
      this.cash -= n;
      this.open.set(r.a, { addr: r.a, symbol: r.s, cost: n, units: (n * (1 - COST)) / price, entry: price, last: price, at: nowMs });
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
      const got = p.units * p.last * (1 - COST);
      this.cash += got;
      this.open.delete(p.addr);
      this.cool.set(p.addr, nowMs + 5 * 60_000);
      const pnl = got - p.cost;
      const t = { symbol: p.symbol, addr: p.addr, pnl, ret: pnl / p.cost, won: pnl > 0, why, held: nowMs - p.at };
      this.trades.push(t);
      this.log({ type: "close", lane: "fast", symbol: p.symbol, addr: p.addr, pnl: +pnl.toFixed(4), ret: +t.ret.toFixed(4), why, balance: +this.equity().toFixed(4) });
    }
  }

  summary() {
    const n = this.trades.length, wins = this.trades.filter((t) => t.won).length;
    return { trades: n, wins, losses: n - wins, balance: +this.equity().toFixed(4), open: this.open.size };
  }
  toJSON() { return { v: 2, start: this.start, stake: this.stake, cash: this.cash, open: [...this.open.values()], trades: this.trades.slice(-500) }; }
  static from(j, opts) {
    const s = new Scalp(opts);
    // a different start or stake (Alex changed the plan) starts a fresh ledger
    if (j && j.v === 2 && j.start === s.start && j.stake === s.stake) { s.cash = j.cash; for (const p of j.open || []) s.open.set(p.addr, p); s.trades = j.trades || []; }
    return s;
  }
}
