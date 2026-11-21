// Configuration. Everything can be overridden from .env (see .env.example).
// No private key is ever read: WALLET_PUBKEY is a public address only.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(import.meta.dirname, '..', '.env');
if (existsSync(envPath)) {
  // Node >= 21.7 built-in .env loader (no extra dependency).
  process.loadEnvFile(envPath);
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${v}"`);
  return n;
}
function list(name: string, def: string[]): string[] {
  const v = process.env[name];
  if (!v) return def;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

// Only the two infrastructure tokens are fixed: USDC (what Kamino lends) and wSOL (prices the network fee).
// Every traded token is discovered live (src/tokens.ts). Decimals + program read on chain 2026-11-21.
export const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export interface TokenInfo { symbol: string; mint: string; decimals: number; tokenProgram: string; liquidityUsd?: number; tags?: string[] }
export const USDC: TokenInfo = { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, tokenProgram: SPL_TOKEN_PROGRAM };
export const WSOL: TokenInfo = { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', decimals: 9, tokenProgram: SPL_TOKEN_PROGRAM };


export const config = {
  rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  jupiterBase: process.env.JUPITER_BASE || 'https://lite-api.jup.ag/swap/v1',
  jupiterTokensBase: process.env.JUPITER_TOKENS_BASE || 'https://lite-api.jup.ag/tokens/v2',
  jupiterApiKey: process.env.JUPITER_API_KEY || '',
  jupiterRatePerMin: num('JUPITER_RATE_PER_MIN', 90),
  walletPubkey: process.env.WALLET_PUBKEY || '',
  // Token discovery (Jupiter /tokens/v2/tag?query=verified). PAIRS (comma list of symbols or mints) narrows it.
  pairs: list('PAIRS', []),
  minTokenLiquidityUsd: num('MIN_TOKEN_LIQUIDITY_USD', 5_000_000),
  maxTokens: num('MAX_TOKENS', 10),
  excludeTags: list('EXCLUDE_TAGS', ['jup-lend-earn', 'yb']),
  allowToken2022: (process.env.ALLOW_TOKEN_2022 ?? 'false') === 'true',
  goldQueries: list('GOLD_QUERIES', ['gold', 'XAU', 'PAXG']),
  minNetProfitUsdc: num('MIN_NET_PROFIT_USDC', 0),
  // Empty = discover live per token: every DEX Jupiter routes it through (excludeDexes peeling). Set DEXES to pin a list.
  dexes: list('DEXES', []),
  maxDexesPerToken: num('MAX_DEXES_PER_TOKEN', 8),
  dexRediscoverMs: num('DEX_REDISCOVER_MS', 10 * 60_000),
  // The trade size Alex cares about (headline row, and the size `npm run simulate` builds).
  tradeSizeUsdc: num('TRADE_SIZE_USDC', 100_000),
  // Comparison sizes scanned alongside it.
  compareSizesUsdc: list('COMPARE_SIZES_USDC', ['1000', '10000']).map(Number),
  get sizesUsdc(): number[] {
    return [...new Set([...this.compareSizesUsdc, this.tradeSizeUsdc])].sort((a, b) => a - b);
  },
  slippageBps: num('SLIPPAGE_BPS', 10),
  maxAccountsPerSwap: num('MAX_ACCOUNTS_PER_SWAP', 24),
  verifyTopK: num('VERIFY_TOP_K', 3),
  computeUnitLimit: num('COMPUTE_UNIT_LIMIT', 600_000),
  computeUnitPriceMicroLamports: num('COMPUTE_UNIT_PRICE_MICROLAMPORTS', 50_000),
  baseFeeLamportsPerSignature: 5000,
  scanIntervalMs: num('SCAN_INTERVAL_MS', 15_000),
  logPath: process.env.LOG_PATH || resolve(import.meta.dirname, '..', 'logs', 'scans.jsonl'),
  // Kamino. Main market address: klend-sdk README.md line 24 ("main market address") and
  // https://api.kamino.finance/v2/kamino-market ("isPrimary": true). Program id: SDK PROGRAM_ID.
  kaminoMarket: process.env.KAMINO_MARKET || '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF',
  // Lookup table Kamino publishes for this market (api.kamino.finance/v2/kamino-market "lookupTable").
  kaminoMarketLut: process.env.KAMINO_MARKET_LUT || 'FGMSBiyVE8TvZcdQnZETAAKw28tkQJ2ccZy6pyp95URb',
};

export type Config = typeof config;
