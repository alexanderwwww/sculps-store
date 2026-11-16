// Normalised candles {t,o,h,l,c,v}, oldest first. Every source is free and keyless.
import { getJson, getText } from "./http.mjs";
const ok = (x) => [x.o, x.h, x.l, x.c].every((n) => Number.isFinite(n) && n > 0);
export async function yahooCandles(sym, range = "5y", interval = "1d") {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`);
  const r = j.chart?.result?.[0]; if (!r) throw new Error(`yahoo: no data for ${sym}`);
  const q = r.indicators.quote[0];
  return r.timestamp.map((t, i) => ({ t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] ?? 0 })).filter(ok);
}
export async function stooqCandles(sym) {   // fallback for US stocks
  const csv = await getText(`https://stooq.com/q/d/l/?s=${sym.toLowerCase()}.us&i=d`);
  return csv.trim().split("\n").slice(1).map((l) => { const [d, o, h, lo, c, v] = l.split(","); return { t: Date.parse(d + "T14:30:00Z"), o: +o, h: +h, l: +lo, c: +c, v: +v || 0 }; }).filter(ok);
}
export async function binanceCandles(symbol, interval = "1d", limit = 1000) {
  const j = await getJson(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  return j.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })).filter(ok);
}
export async function geckoCandles(pool, aggregate = 5, limit = 1000, network = "solana") {
  const j = await getJson(`https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool}/ohlcv/minute?aggregate=${aggregate}&limit=${limit}&currency=usd`);
  return j.data.attributes.ohlcv_list.map(([t, o, h, l, c, v]) => ({ t: t * 1000, o, h, l, c, v })).sort((a, b) => a.t - b.t).filter(ok);
}
/** Split a candle list into completed bars and the still-forming one. Signals are only ever read from completed bars. */
export function splitForming(cs, formingMs, now = Date.now()) {
  const last = cs[cs.length - 1];
  if (last && now < last.t + formingMs) return { done: cs.slice(0, -1), live: last };
  return { done: cs, live: null };
}
