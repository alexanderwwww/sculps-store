// Paper trading on Kalshi's real 15-minute crypto up/down markets, at Kalshi's real ask prices.
// Buys a side only when Kalshi sells it cheaper than its fair chance (live price vs target, recent volatility).
// Settles from Kalshi's own result. Fee: Kalshi + Phantom $0.02 per contract.
export const K = { series: { BTC: "KXBTC15M", ETH: "KXETH15M", SOL: "KXSOL15M" }, stake: 10, fee: 0.02, minEdge: 0.06, minLeftSec: 60, maxLeftSec: 600 };
const API = "https://api.elections.kalshi.com/trade-api/v2";
const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const cdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

export const freshK = () => ({ balance: 100, start: 100, on: true, bets: [], open: [], log: [], market: null });

export async function kalshiTick(coin, s, { getJSON, price, vol1m, move5, nowSec }) {
  const say = m => s.log.unshift({ at: nowSec, m });
  // settle finished bets from Kalshi's own result
  for (const b of [...s.open]) {
    if (nowSec < b.closeSec) continue;
    const m = (await getJSON(`${API}/markets/${b.ticker}`)).market;
    if (!m || !m.result) continue;
    const won = m.result === b.side;
    const pnl = +((won ? b.contracts * (1 - b.price) : -b.contracts * b.price) - b.contracts * K.fee).toFixed(2);
    s.balance = +(s.balance + pnl).toFixed(2);
    s.bets.push({ ...b, won, pnl }); s.bets = s.bets.slice(-300);
    s.open = s.open.filter(x => x !== b);
    say(`${won ? "Won" : "Lost"} ${b.side.toUpperCase()} at $${b.price}: ${pnl >= 0 ? "+" : ""}$${pnl}`);
  }
  const list = (await getJSON(`${API}/markets?series_ticker=${K.series[coin]}&status=open&limit=5`)).markets || [];
  const m = list.sort((a, b) => Date.parse(a.close_time) - Date.parse(b.close_time))[0];
  if (!m) { s.market = null; return s; }
  const closeSec = Date.parse(m.close_time) / 1000, left = closeSec - nowSec;
  const yesAsk = +m.yes_ask_dollars, noAsk = +m.no_ask_dollars, strike = +m.floor_strike;
  s.market = { ticker: m.ticker, strike: strike || null, yesAsk, noAsk, closeSec, title: m.title };
  if (!s.on || !strike || !(price > 0) || left < 30) return s;
  // One entry every 5 minutes on every coin: slots at 15-10, 10-5, 5-0 minutes left.
  const slot = m.ticker + ":" + Math.floor(Math.max(0, left - 1) / 300);
  if (s.open.some(b => b.slot === slot) || s.balance < K.stake) return s;
  const sd = Math.max(vol1m, 0.0002) * Math.sqrt(left / 60);
  const pYes = cdf(Math.log(price / strike) / sd);
  const edgeYes = pYes - yesAsk - K.fee, edgeNo = (1 - pYes) - noAsk - K.fee;
  // Aquarius lesson 1 (never chase strength): with no clear value, take the side against the last 5-minute move.
  let side, why;
  if (Math.max(edgeYes, edgeNo) >= 0.03) { side = edgeYes >= edgeNo ? "yes" : "no"; why = "value"; }
  else { side = (move5 || 0) > 0 ? "no" : "yes"; why = "fade"; }
  const ask = side === "yes" ? yesAsk : noAsk;
  if (!(ask > 0.01 && ask < 0.99)) return s;
  const contracts = +(K.stake / ask).toFixed(4);
  const fair = side === "yes" ? pYes : 1 - pYes;
  s.open.push({ ticker: m.ticker, slot, side, price: ask, contracts, strike, at: price, fair: +fair.toFixed(3), why, left, move5: +(move5 * 100).toFixed(3), vol: +vol1m.toFixed(5), closeSec, placed: nowSec });
  say(`Bet ${side === "yes" ? "UP" : "DOWN"} $${K.stake} at $${ask} (${why}, fair ${(100 * fair).toFixed(0)}%, pays ×${(1 / ask).toFixed(1)}, ${Math.round(left / 60)} min left)`);
  s.log = s.log.slice(0, 80);
  return s;
}
