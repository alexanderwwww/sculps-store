import { newPools, trendingPools, dexPools, trades, candles, multi } from "./gecko.mjs";
import { getJsonFast } from "./net.mjs";
/** Live price, liquidity and 5-minute flow for many pools in one fast call (DexScreener, 30 pools each). */
export async function quotes(pools) {
  const out = new Map();
  for (let i = 0; i < pools.length; i += 30) {
    const j = await getJsonFast(`https://api.dexscreener.com/latest/dex/pairs/solana/${pools.slice(i, i + 30).join(",")}`);
    for (const p of j.pairs || []) {
      const price = Number(p.priceUsd);
      if (!(price > 0)) continue;
      out.set(p.pairAddress, { price, liqUsd: p.liquidity?.usd ?? null, buys5: p.txns?.m5?.buys ?? 0, sells5: p.txns?.m5?.sells ?? 0, vol5: p.volume?.m5 ?? 0 });
    }
  }
  return out;
}
export const liveFeed = { newPools, trendingPools, pumpPools: (p = 1) => dexPools("pump-fun", p), bondedPools: (p = 1) => dexPools("pumpswap", p), trades, candles, multi, quotes };
