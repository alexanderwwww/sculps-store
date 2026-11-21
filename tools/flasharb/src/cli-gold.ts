// npm run gold: is any gold-backed token on Solana routable on two or more DEXes? Live data only.
// Candidates: Jupiter token search for each GOLD_QUERIES term, verified tokens whose name/symbol/tags mention gold/XAU.
// Method: quote USDC->token unrestricted, record the DEX labels used, exclude them (excludeDexes), repeat until no route.
import { createSolanaRpc } from '@solana/kit';
import { config, TOKEN_2022_PROGRAM, USDC } from './config.ts';
import { JupiterClient, JupiterNoRouteError } from './jupiter.ts';
import { searchTokens, type JupToken } from './tokens.ts';

const jup = new JupiterClient(config.jupiterBase, { ratePerMin: config.jupiterRatePerMin, apiKey: config.jupiterApiKey });
const rpc = createSolanaRpc(config.rpcUrl);

const seen = new Map<string, JupToken>();
for (const q of config.goldQueries)
  for (const t of await searchTokens(config.jupiterTokensBase, q))
    if (t.isVerified && /gold|xau/i.test(`${t.name} ${t.symbol} ${(t.tags ?? []).join(' ')}`) && (t.liquidity ?? 0) >= 1000) seen.set(t.id, t);
const gold = [...seen.values()].sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));

async function dexesFor(outputMint: string, amount: bigint) {
  const found: { labels: string[]; out: string; impact: string }[] = [];
  const exclude: string[] = [];
  for (let i = 0; i < 8; i++) {
    const p = new URLSearchParams({ inputMint: USDC.mint, outputMint, amount: amount.toString(), slippageBps: '50' });
    if (exclude.length) p.set('excludeDexes', exclude.join(','));
    try {
      const r: any = await (jup as any).request(`${config.jupiterBase}/quote?${p}`);
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

const { value: accts } = await rpc.getMultipleAccounts(gold.map((t) => t.id as any), { encoding: 'jsonParsed' }).send();
for (const [i, t] of gold.entries()) {
  const a: any = accts[i];
  const exts = (a?.data?.parsed?.info?.extensions ?? []).map((e: any) => e.extension);
  console.log(`\n${t.symbol} "${t.name}" ${t.id} | Jupiter liquidity $${Math.round(t.liquidity ?? 0).toLocaleString('en-US')} | ${a?.owner === TOKEN_2022_PROGRAM ? 'Token-2022' : 'SPL'}${exts.length ? ' [' + exts.join(',') + ']' : ''}`);
  for (const size of [config.compareSizesUsdc[0] ?? 1000, config.tradeSizeUsdc]) {
    const routes = await dexesFor(t.id, BigInt(size) * 10n ** BigInt(USDC.decimals));
    const distinct = new Set(routes.flatMap((r) => r.labels));
    console.log(`  buy $${size}: ${routes.length ? '' : 'no route'}`);
    for (const r of routes) console.log(`    via [${r.labels.join(' + ')}] out ${Number(r.out) / 10 ** t.decimals}, impact ${(Number(r.impact) * 100).toFixed(3)}%`);
    if (routes.length) console.log(`    distinct DEXes able to fill: ${distinct.size} -> ${distinct.size >= 2 ? 'TWO+ DEXes' : 'single DEX only'}`);
  }
}
console.log(`\nJupiter calls: ${jup.calls}`);
