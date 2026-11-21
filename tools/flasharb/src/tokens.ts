// Live token discovery. No coin list in the code (AGENTS.md rule 36).
// Source: Jupiter Tokens API v2, GET /tokens/v2/tag?query=verified (sources/jupiter-tokens-v2.yaml:106-121),
// fields isVerified, liquidity, tags, tokenProgram, decimals. Decimals + owning program re-read on chain.
import { address, type Rpc, type SolanaRpcApi } from '@solana/kit';
import { SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM, USDC, type TokenInfo } from './config.ts';

export interface JupToken {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  liquidity?: number;
  isVerified?: boolean;
  tags?: string[];
  tokenProgram?: string;
}

export interface DiscoverOpts {
  minLiquidityUsd: number;
  maxTokens: number;
  excludeTags: string[];
  allowToken2022: boolean;
  only?: string[]; // symbols or mints
}

/** Pure filter, unit-tested. Sorted by liquidity, highest first. */
export function selectTokens(list: JupToken[], o: DiscoverOpts): JupToken[] {
  const only = (o.only ?? []).map((s) => s.toLowerCase());
  return list
    .filter((t) => t.isVerified !== false)
    .filter((t) => t.id !== USDC.mint)
    .filter((t) => (t.liquidity ?? 0) >= o.minLiquidityUsd)
    .filter((t) => !(t.tags ?? []).some((g) => o.excludeTags.includes(g)))
    .filter((t) => o.allowToken2022 || t.tokenProgram !== TOKEN_2022_PROGRAM)
    .filter((t) => !only.length || only.includes(t.symbol.toLowerCase()) || only.includes(t.id.toLowerCase()))
    .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))
    .slice(0, o.maxTokens);
}

export async function fetchVerified(tokensBase: string, fetchFn: typeof fetch = fetch): Promise<JupToken[]> {
  const res = await fetchFn(`${tokensBase}/tag?query=verified`);
  if (!res.ok) throw new Error(`Jupiter tokens ${res.status}`);
  return (await res.json()) as JupToken[];
}

export async function searchTokens(tokensBase: string, query: string, fetchFn: typeof fetch = fetch): Promise<JupToken[]> {
  const res = await fetchFn(`${tokensBase}/search?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Jupiter token search ${res.status}`);
  return (await res.json()) as JupToken[];
}

/** Re-read decimals and owning program on chain; drop anything that disagrees with Jupiter. */
export async function confirmOnChain(rpc: Rpc<SolanaRpcApi>, toks: JupToken[]): Promise<TokenInfo[]> {
  const out: TokenInfo[] = [];
  for (let i = 0; i < toks.length; i += 100) {
    const chunk = toks.slice(i, i + 100);
    const { value } = await rpc.getMultipleAccounts(chunk.map((t) => address(t.id)), { encoding: 'jsonParsed' }).send();
    value.forEach((a: any, j: number) => {
      const t = chunk[j];
      const dec = a?.data?.parsed?.info?.decimals;
      const owner = a?.owner;
      if (dec !== t.decimals || (owner !== SPL_TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM)) return;
      out.push({ symbol: t.symbol, mint: t.id, decimals: dec, tokenProgram: owner, liquidityUsd: t.liquidity, tags: t.tags });
    });
  }
  return out;
}
