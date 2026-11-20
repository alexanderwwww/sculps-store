// Paper trading on Polymarket's real 5-minute crypto Up/Down markets, at Polymarket's real order-book asks.
// One $10 entry per coin per 5-minute round. Settles from Polymarket's own resolution.
export const P = { slug: { BTC: "btc", ETH: "eth", SOL: "sol" }, stake: 10, feeRate: 0, enterAfter: 10, enterBefore: 270, minAsk: 0.15, maxAsk: 0.9 };
const GAMMA = "https://gamma-api.polymarket.com", CLOB = "https://clob.polymarket.com";
const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const cdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
export const freshP = () => ({ balance: 100, start: 100, on: true, bets: [], open: [], log: [], market: null });

async function bestAsk(getJSON, token) {
  const b = await getJSON(`${CLOB}/book?token_id=${token}`);
  const asks = (b.asks || []).map(a => +a.price).filter(p => p > 0);
  return asks.length ? Math.min(...asks) : null;
}

async function bestBid(getJSON, token) {
  const b = await getJSON(`${CLOB}/book?token_id=${token}`);
  const bids = (b.bids || []).map(x => +x.price).filter(p => p > 0);
  return bids.length ? Math.max(...bids) : null;
}

export async function polyTick(coin, s, { grok, getJSON, price, openPrice, vol1m, move5, nowSec }) {
  const say = m => s.log.unshift({ at: nowSec, m });
  // Cash out: sell the held side at the live bid when the profit is in hand or the bet has gone bad.
  for (const b of [...s.open]) {
    if (!b.token || nowSec >= b.closeSec - 5) continue;
    const bid = await bestBid(getJSON, b.token); if (!bid) continue;
    b.bid = bid;
    const now$ = b.contracts * (bid - b.price);            // profit if sold now
    b.peak = Math.max(b.peak ?? -99, now$);
    let why = null;
    if (now$ >= 1 && !(b.lastBid != null && bid > b.lastBid)) why = "Took profit"; // $1+ and not still climbing
    if (now$ >= 3 || bid >= 0.95) why = "Took profit";
    if (b.peak >= 1 && now$ <= b.peak - 0.5 && now$ > 0) why = "Took profit";  // it was running, now giving back
    if (now$ <= -2) why = "Cut loss";
    if (grok === "sell") why = "Grok said sell";
    b.lastBid = bid;
    if (!why) continue;
    const pnl = +(b.contracts * (bid - b.price)).toFixed(2);
    s.balance = +(s.balance + pnl).toFixed(2);
    s.bets.push({ ...b, won: pnl > 0, pnl, cashout: bid, why2: why }); s.bets = s.bets.slice(-500);
    s.open = s.open.filter(x => x !== b);
    say(`${why}: sold ${b.side === "yes" ? "UP" : "DOWN"} at $${bid} (bought $${b.price}) ${pnl >= 0 ? "+" : ""}$${pnl}`);
  }
  for (const b of [...s.open]) {
    if (nowSec < b.closeSec + 30) continue;
    const ev = (await getJSON(`${GAMMA}/events?slug=${b.slug}`))[0];
    const m = ev?.markets?.[0]; if (!m || !m.closed) continue;
    const op = JSON.parse(m.outcomePrices || "[]").map(Number);
    if (!(op[0] === 1 || op[1] === 1)) continue;
    const won = (b.side === "yes" ? op[0] : op[1]) === 1;
    const pnl = +((won ? b.contracts * (1 - b.price) : -b.contracts * b.price)).toFixed(2);
    s.balance = +(s.balance + pnl).toFixed(2);
    s.bets.push({ ...b, won, pnl }); s.bets = s.bets.slice(-500);
    s.open = s.open.filter(x => x !== b);
    say(`${won ? "Won" : "Lost"} ${b.side === "yes" ? "UP" : "DOWN"} at $${b.price}: ${pnl >= 0 ? "+" : ""}$${pnl}`);
  }
  const start = Math.floor(nowSec / 300) * 300, closeSec = start + 300, left = closeSec - nowSec, slug = `${P.slug[coin]}-updown-5m-${start}`;
  const ev = (await getJSON(`${GAMMA}/events?slug=${slug}`))[0];
  const m = ev?.markets?.[0];
  if (!m) { s.market = null; return s; }
  const [upTok, downTok] = JSON.parse(m.clobTokenIds || "[]");
  const [yesAsk, noAsk] = await Promise.all([bestAsk(getJSON, upTok), bestAsk(getJSON, downTok)]);
  s.market = { ticker: slug, strike: openPrice || null, yesAsk, noAsk, closeSec, title: ev.title };
  const into = nowSec - start;
  if (!s.on || !openPrice || !(price > 0) || into < P.enterAfter || into > P.enterBefore) return s;
  if (s.open.some(b => b.slug === slug) || s.balance < P.stake) return s;
  const sd = Math.max(vol1m, 0.0002) * Math.sqrt(left / 60);
  const pYes = cdf(Math.log(price / openPrice) / sd);
  const eY = yesAsk ? pYes - yesAsk : -1, eN = noAsk ? (1 - pYes) - noAsk : -1;
  let side, why;
  if (grok === "skip") return s;
  if (grok === "up" || grok === "down") { side = grok === "up" ? "yes" : "no"; why = "grok"; }
  else if (Math.max(eY, eN) >= 0.03) { side = eY >= eN ? "yes" : "no"; why = "value"; }
  else if (into >= 210) { side = (move5 || 0) > 0 ? "no" : "yes"; why = "fade"; }
  else return s; // no good price yet: keep watching, like a person waiting on the chart
  const ask = side === "yes" ? yesAsk : noAsk;
  if (!(ask >= P.minAsk && ask <= P.maxAsk)) { if (s.saidSkip !== slug) { s.saidSkip = slug; say(`Skip: Up $${yesAsk ?? "–"} / Down $${noAsk ?? "–"}, too lopsided`); } return s; }
  const contracts = +(P.stake / ask).toFixed(4), fair = side === "yes" ? pYes : 1 - pYes;
  s.open.push({ slug, ticker: slug, token: side === "yes" ? upTok : downTok, side, price: ask, contracts, strike: openPrice, at: price, fair: +fair.toFixed(3), why, left, move5: +((move5 || 0) * 100).toFixed(3), vol: +vol1m.toFixed(5), closeSec, placed: nowSec });
  say(`Bet ${side === "yes" ? "UP" : "DOWN"} $${P.stake} at $${ask} (${why}, ${into}s in, fair ${(100 * fair).toFixed(0)}%, pays ×${(1 / ask).toFixed(1)})`);
  s.log = s.log.slice(0, 80);
  return s;
}
