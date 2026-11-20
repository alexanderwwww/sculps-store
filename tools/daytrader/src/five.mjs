// 5-minute BTC up/down bot, paper money. Runs every minute.
// Bet at minute 3-4 of a round on the side BTC is already on, only when the move is big enough.
// Contract price is modelled as the fair probability of that side winning (normal model on recent
// 1-minute volatility), plus a $0.02 fee: the paper result is what an honest market would pay.
export const FIVE = { stake: 1, fee: 0.02, minEdgeMove: 0.0004, maxPrice: 0.85 };

const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const cdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

export function freshFive() { return { balance: 100, start: 100, on: true, bets: [], open: null, log: [] }; }

// candles: [{t,o,c}] 1-minute, oldest first
export function fiveTick(s, candles, nowSec) {
  const round = Math.floor(nowSec / 300) * 300;
  const byT = new Map(candles.map(x => [x.t, x]));
  // settle
  if (s.open && nowSec >= s.open.round + 300) {
    const first = { o: s.open.open }, last = byT.get(s.open.round + 240) || (nowSec >= s.open.round + 420 ? candles.filter(x => x.t < s.open.round + 300).at(-1) : null);
    if (first && last) {
      const up = last.c >= first.o, won = (s.open.side === "up") === up;
      const contracts = s.open.contracts;
      const pnl = +((won ? contracts * (1 - s.open.price) : -contracts * s.open.price) - contracts * FIVE.fee).toFixed(2);
      s.balance = +(s.balance + pnl).toFixed(2);
      s.bets.push({ ...s.open, won, pnl, close: last.c });
      s.bets = s.bets.slice(-300);
      s.log.unshift({ at: nowSec, m: `${won ? "Won" : "Lost"} ${s.open.side.toUpperCase()} round ${pnl >= 0 ? "+" : ""}$${pnl}` });
      s.open = null;
    }
  }
  // place: minute 3 of the round, last closed candle is round+120
  const into = nowSec - round;
  if (s.on && !s.open && into >= 150 && into < 270 && s.skipped !== round) {
    const first = byT.get(round) || candles.filter(x => x.t < round).at(-1);
    const cur = candles.filter(x => x.t >= round + 60).at(-1);
    if (first && cur) {
      const move = (cur.c - first.o) / first.o;
      const rets = candles.slice(-61).map((x, i, a) => i ? Math.log(x.c / a[i - 1].c) : 0).slice(1);
      const sd = Math.sqrt(rets.reduce((a, r) => a + r * r, 0) / Math.max(1, rets.length)) || 0.0005;
      const z = move / (sd * Math.sqrt(2)); // 2 minutes left
      const side = move >= 0 ? "up" : "down";
      const price = +cdf(Math.abs(z)).toFixed(2);
      if (Math.abs(move) >= FIVE.minEdgeMove && price <= FIVE.maxPrice && s.balance >= FIVE.stake) {
        const contracts = Math.max(1, Math.floor(FIVE.stake / price));
        s.open = { round, side, price, contracts, open: first.o, at: cur.c, move: +(move * 100).toFixed(3) };
        s.log.unshift({ at: nowSec, m: `Bet ${side.toUpperCase()} ${contracts}× at $${price} (${move >= 0 ? "+" : ""}${(move * 100).toFixed(3)}% this round)` });
      } else { s.skipped = round; s.log.unshift({ at: nowSec, m: `Skip round: move ${(move * 100).toFixed(3)}%, price $${price}` }); }
    }
  }
  s.log = s.log.slice(0, 80);
  s.last = nowSec; s.btc = candles.at(-1)?.c;
  return s;
}
