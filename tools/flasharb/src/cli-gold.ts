// npm run gold: which DEXes can route USDC <-> each gold-backed token, from live Jupiter quotes only.
// Method: quote unrestricted, record the DEX labels used, exclude them (excludeDexes), repeat until no route.
// Candidate list = Jupiter token search "gold"/"XAUT"/"PAXG" results tagged verified (lite-api /tokens/v2/search).
import { config, TOKENS } from './config.ts';
import { JupiterClient, JupiterNoRouteError } from './jupiter.ts';

const GOLD = ['XAUt0', 'GOLD', 'GLDx', 'VNXAU', 'XAUM', 'PAXG'];
const jup = new JupiterClient(config.jupiterBase, { ratePerMin: config.jupiterRatePerMin, apiKey: config.jupiterApiKey });

async function q(inputMint: string, outputMint: string, amount: bigint, exclude: string[]) {
  const p = new URLSearchParams({ inputMint, outputMint, amount: amount.toString(), slippageBps: '50' });
  if (exclude.length) p.set('excludeDexes', exclude.join(','));
  return (jup as any).request(`${config.jupiterBase}/quote?${p}`);
}

async function dexesFor(inputMint: string, outputMint: string, amount: bigint) {
  const found: { labels: string[]; out: string; impact: string }[] = [];
  const exclude: string[] = [];
  for (let i = 0; i < 8; i++) {
    try {
      const r = await q(inputMint, outputMint, amount, exclude);
      const labels = [...new Set<string>(r.routePlan.map((s: any) => s.swapInfo.label))];
      found.push({ labels, out: r.outAmount, impact: r.priceImpactPct });
      exclude.push(...labels);
    } catch (e) {
      if (e instanceof JupiterNoRouteError) break;
      throw e;
    }
  }
  return found;
}

const sizes = [1_000, 100_000];
for (const sym of GOLD) {
  const t = TOKENS[sym];
  for (const size of sizes) {
    const amt = BigInt(size) * 1_000_000n;
    const buy = await dexesFor(TOKENS.USDC.mint, t.mint, amt);
    console.log(`${sym} (${t.mint}, ${t.tokenProgram === TOKENS.USDC.tokenProgram ? 'SPL' : 'Token-2022'}) buy $${size}:`);
    if (!buy.length) console.log('   no route');
    for (const b of buy) console.log(`   via [${b.labels.join(' + ')}] out ${Number(b.out) / 10 ** t.decimals} ${sym}, impact ${(Number(b.impact) * 100).toFixed(3)}%`);
  }
}
console.log(`Jupiter calls: ${jup.calls}`);
