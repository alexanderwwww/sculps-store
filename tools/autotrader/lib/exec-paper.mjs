import { getJson } from "./net.mjs";
const SOL = "So11111111111111111111111111111111111111112";
/** Paper fills at the strategy's own cost model, but only for coins Jupiter can really route right now. */
export function paperExec({ cfg, quote = realQuote } = {}) {
  return {
    name: "paper",
    async buy({ mint }) {
      const q = await quote(mint).catch((e) => ({ ok: false, why: `no route: ${e.message.slice(0, 60)}` }));
      if (!q.ok) return { ok: false, why: q.why };
      if (q.impact > 0.03) return { ok: false, why: `price impact ${(q.impact * 100).toFixed(1)}% at 0.05 SOL` };
      return { ok: true, impact: q.impact };
    },
    async sell() { return { ok: true }; },
  };
}
async function realQuote(mint) {
  const j = await getJson(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL}&outputMint=${mint}&amount=50000000&slippageBps=300`, { tries: 2 });
  if (!j.outAmount) return { ok: false, why: "empty quote" };
  return { ok: true, impact: Math.abs(Number(j.priceImpactPct || 0)) };
}
