// Kraken public market data. Read-only, no key, no account. Every list comes from Kraken live.
// get(url) -> parsed JSON (the extension passes a background fetch; tests pass fetch).
export const SPOT = "https://api.kraken.com/0/public";
export const FUT = "https://futures.kraken.com";
// Kraken's own legacy asset codes in AssetPairs (XBT, XDG) vs the names its trade pages use (btc, doge),
// and Kraken Prop's GOLD market, which tracks Kraken's XAU perpetual (3,513 on Alex's screen vs PF_XAUUSD 3,517
// and PAXG 3,500 at the same hour, read 2026-11-21).
const ALIAS = { XBT: "BTC", XDG: "DOGE", GOLD: "XAU" };
export const normBase = (b) => { const u = String(b || "").toUpperCase(); return ALIAS[u] || u; };

export async function loadMarkets(get) {
  const ap = await get(`${SPOT}/AssetPairs`);
  const out = [];
  for (const [key, v] of Object.entries(ap.result || {})) {
    if (!(v.quote === "ZUSD" || v.quote === "USD") || v.status !== "online" || !v.wsname) continue;
    const base = normBase(v.wsname.split("/")[0]);
    out.push({ key, source: "spot", base, name: `${base}/USD`, tick: Number(v.tick_size) || 10 ** -v.pair_decimals,
      qtyInc: 10 ** -v.lot_decimals, minQty: Number(v.ordermin) || 0, levMax: Math.max(1, ...(v.leverage_buy || [1])) });
  }
  try {
    const ins = await get(`${FUT}/derivatives/api/v3/instruments`);
    const have = new Set(out.map((m) => m.base));
    for (const i of ins.instruments || []) {
      const m = /^PF_(.+)USD$/.exec(i.symbol || ""); if (!m || !i.tradeable) continue;
      const base = normBase(m[1]); if (have.has(base)) continue; // spot first when both exist
      out.push({ key: i.symbol, source: "futures", base, name: `${base}/USD`, tick: Number(i.tickSize) || 0.01,
        qtyInc: 10 ** -(i.contractValueTradePrecision ?? 4), minQty: 0, levMax: null });
    }
  } catch { /* futures list is a bonus; spot alone still works */ }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function resolve(markets, base) { const b = normBase(base); return markets.find((m) => m.base === b) || null; }

// The coin on the page: /app/trade/btc-usd, /prop/account/<id>/trade/gold-usd, or the tab title "3,513.4 | GOLD Kraken Prop".
export function detectBase(url, title) {
  const m = /\/trade\/([a-z0-9]+)-([a-z0-9]+)/i.exec(url || "");
  if (m) return { base: normBase(m[1]), quote: m[2].toUpperCase(), from: "url" };
  const t = /\|\s*([A-Z0-9]{2,12})(?:[\/\s-]+USD)?\b/.exec(title || "");
  if (t) return { base: normBase(t[1]), quote: "USD", from: "title" };
  return null;
}

// Closed 1-minute bars, oldest first. The last REST entry is the open bar: dropped.
export async function bars1m(get, mkt, nowSec = Date.now() / 1000) {
  if (mkt.source === "spot") {
    const j = await get(`${SPOT}/OHLC?pair=${encodeURIComponent(mkt.key)}&interval=1`);
    if (j.error && j.error.length) throw new Error(j.error.join(", "));
    const rows = Object.entries(j.result).find(([k]) => k !== "last")[1];
    return rows.slice(0, -1).map((r) => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[6] }));
  }
  const to = Math.floor(nowSec), from = to - 720 * 60;
  const j = await get(`${FUT}/api/charts/v1/trade/${mkt.key}/1m?from=${from}&to=${to}`);
  return (j.candles || []).map((c) => ({ t: c.time / 1000, o: +c.open, h: +c.high, l: +c.low, c: +c.close, v: +c.volume }))
    .filter((b) => b.t + 60 <= nowSec);
}

export async function lastPrice(get, mkt) {
  if (mkt.source === "spot") {
    const j = await get(`${SPOT}/Ticker?pair=${encodeURIComponent(mkt.key)}`);
    const v = Object.values(j.result || {})[0]; return v ? +v.c[0] : null;
  }
  const j = await get(`${FUT}/derivatives/api/v3/tickers/${mkt.key}`);
  return j.ticker ? +j.ticker.last : null;
}

// All spot USD pairs with 24h USD volume, in one call.
export async function spotTickers(get) {
  const j = await get(`${SPOT}/Ticker`);
  const out = {};
  for (const [k, v] of Object.entries(j.result || {})) out[k] = { last: +v.c[0], volUSD: +v.v[1] * +v.p[1], open: +v.o, low: +v.l[1], high: +v.h[1] };
  return out;
}
