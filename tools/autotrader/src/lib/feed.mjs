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
/** DexScreener's newest token profiles and boosts on Solana -> their SOL pairs (no GeckoTerminal queue, so it can run every cycle) */
export async function dexNew() {
  const lists = await Promise.all(["https://api.dexscreener.com/token-profiles/latest/v1", "https://api.dexscreener.com/token-boosts/latest/v1"].map((u) => getJsonFast(u).catch(() => [])));
  const mints = [...new Set(lists.flat().filter((x) => x && x.chainId === "solana" && x.tokenAddress).map((x) => x.tokenAddress))].slice(0, 60);
  const out = [];
  for (let i = 0; i < mints.length; i += 30) {
    const pairs = await getJsonFast(`https://api.dexscreener.com/tokens/v1/solana/${mints.slice(i, i + 30).join(",")}`).catch(() => []);
    for (const p of pairs || []) {
      if (p.quoteToken?.symbol !== "SOL" || !p.pairAddress) continue;
      out.push({ pool: p.pairAddress, name: `${p.baseToken?.symbol || "?"} / SOL`, mint: p.baseToken?.address, dex: p.dexId, created: p.pairCreatedAt || Date.now(), liqUsd: p.liquidity?.usd ?? null, priceUsd: Number(p.priceUsd) || null, buys5: p.txns?.m5?.buys ?? 0, sells5: p.txns?.m5?.sells ?? 0, vol5: p.volume?.m5 ?? 0, vol1h: p.volume?.h1 ?? 0 });
    }
  }
  return out;
}
export const liveFeed = { newPools, trendingPools, pumpPools: (p = 1) => dexPools("pump-fun", p), bondedPools: (p = 1) => dexPools("pumpswap", p), trades, dexNew, candles, multi, quotes };
