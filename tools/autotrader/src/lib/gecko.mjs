import { getJson } from "./net.mjs";
const B = "https://api.geckoterminal.com/api/v2/networks/solana";
const num = (x) => (x == null ? null : Number(x));
function shape(p) {
  const a = p.attributes, t = a.transactions || {}, v = a.volume_usd || {};
  return {
    pool: a.address, name: a.name, mint: p.relationships.base_token.data.id.replace(/^solana_/, ""),
    dex: p.relationships.dex.data.id, created: Date.parse(a.pool_created_at),
    liqUsd: num(a.reserve_in_usd), fdvUsd: num(a.fdv_usd), priceUsd: num(a.base_token_price_usd),
    buys5: t.m5?.buys ?? 0, sells5: t.m5?.sells ?? 0, buyers5: t.m5?.buyers ?? 0, sellers5: t.m5?.sellers ?? 0,
    buys1h: t.h1?.buys ?? 0, sells1h: t.h1?.sells ?? 0, vol5: num(v.m5) ?? 0, vol1h: num(v.h1) ?? 0, vol24: num(v.h24) ?? 0,
  };
}
export const newPools = async (page = 1) => (await getJson(`${B}/new_pools?page=${page}`)).data.map(shape);
export const trendingPools = async (page = 1) => (await getJson(`${B}/trending_pools?page=${page}`)).data.map(shape);
/** minute candles, oldest first: {t(ms), o, h, l, c, v}. `before` is a unix-second cursor for older pages. */
export async function candles(pool, { aggregate = 1, limit = 1000, before } = {}) {
  const q = `aggregate=${aggregate}&limit=${limit}&currency=usd${before ? `&before_timestamp=${before}` : ""}`;
  const j = await getJson(`${B}/pools/${pool}/ohlcv/minute?${q}`);
  return j.data.attributes.ohlcv_list.map(([t, o, h, l, c, v]) => ({ t: t * 1000, o, h, l, c, v })).sort((x, y) => x.t - y.t);
}
/** Fresh numbers for up to 30 pools in ONE call (liquidity, 5-minute flow). */
export async function multi(addresses) {
  if (!addresses.length) return [];
  return (await getJson(`${B}/pools/multi/${addresses.join(",")}`)).data.map(shape);
}
