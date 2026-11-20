// Paper trading on Kalshi's real 15-minute crypto up/down markets, at Kalshi's real ask prices.
// Buys a side only when Kalshi sells it cheaper than its fair chance (live price vs target, recent volatility).
// Settles from Kalshi's own result. Fee: Kalshi + Phantom $0.02 per contract.
export const K = { series: { BTC: "KXBTC15M", ETH: "KXETH15M", SOL: "KXSOL15M" }, stake: 10, fee: 0.02, minEdge: 0.06, minLeftSec: 60, maxLeftSec: 600 };
const API = "https://api.elections.kalshi.com/trade-api/v2";
const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const cdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

export const freshK = () => ({ balance: 100, start: 100, on: true, bets: [], open: [], log: [], market: null });

export async function kalshiTick(coin, s, { getJSON, price, vol1m, nowSec }) {
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
  if (!s.on || !strike || !(price > 0) || left < K.minLeftSec || left > K.maxLeftSec) return s;
  if (s.open.some(b => b.ticker === m.ticker)) return s;
  // fair chance price ends >= strike, using 1-minute volatility scaled to the time left
  const sd = Math.max(vol1m, 0.0002) * Math.sqrt(left / 60);
  const pYes = cdf(Math.log(price / strike) / sd);
  const edgeYes = pYes - yesAsk - K.fee, edgeNo = (1 - pYes) - noAsk - K.fee;
  const side = edgeYes >= edgeNo ? "yes" : "no", ask = side === "yes" ? yesAsk : noAsk, edge = Math.max(edgeYes, edgeNo);
  if (s.lastLook !== m.ticker + Math.floor(left / 60)) {
    s.lastLook = m.ticker + Math.floor(left / 60);
    if (edge < K.minEdge || !(ask > 0.02 && ask < 0.98) || s.balance < K.stake) { if (left < 400 && !s.saidSkip?.[m.ticker]) { s.saidSkip = { [m.ticker]: 1 }; say(`No edge yet: Up $${yesAsk} / Down $${noAsk}, fair Up ${(pYes * 100).toFixed(0)}%`); } return s; }
    const contracts = Math.max(1, Math.floor(K.stake / ask));
    s.open.push({ ticker: m.ticker, side, price: ask, contracts, strike, at: price, fair: +pYes.toFixed(3), closeSec, placed: nowSec });
    say(`Bet ${side === "yes" ? "UP" : "DOWN"} ${contracts}× at $${ask} (fair ${(100 * (side === "yes" ? pYes : 1 - pYes)).toFixed(0)}%, pays ×${(1 / ask).toFixed(1)})`);
  }
  s.log = s.log.slice(0, 80);
  return s;
}
