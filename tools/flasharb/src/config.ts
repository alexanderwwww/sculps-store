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

// Mints + decimals were read on chain (getMultipleAccounts jsonParsed, 2026-11-21): all Tokenkeg program.
export const TOKENS: Record<string, { mint: string; decimals: number }> = {
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  JUP: { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 },
  JTO: { mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', decimals: 9 },
  BONK: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
};

// DEX labels exactly as returned by GET https://lite-api.jup.ag/swap/v1/program-id-to-label (checked at start-up).
export const DEFAULT_DEXES = [
  'Whirlpool',
  'Raydium',
  'Raydium CLMM',
  'Raydium CP',
  'Meteora DLMM',
  'Meteora DAMM v2',
  'Phoenix',
  'SolFi',
  'HumidiFi',
  'TesseraV',
  'ZeroFi',
  'Obric V2',
];

export const config = {
  rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  jupiterBase: process.env.JUPITER_BASE || 'https://lite-api.jup.ag/swap/v1',
  jupiterApiKey: process.env.JUPITER_API_KEY || '',
  jupiterRatePerMin: num('JUPITER_RATE_PER_MIN', 90),
  walletPubkey: process.env.WALLET_PUBKEY || '',
  pairs: list('PAIRS', ['SOL']),
  dexes: list('DEXES', DEFAULT_DEXES),
  sizesUsdc: list('SIZES_USDC', ['1000', '10000', '100000']).map(Number),
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
