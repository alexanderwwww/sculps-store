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

// Mints from Jupiter token search (lite-api /tokens/v2/search, isVerified=true); decimals + owning token
// program read on chain (getMultipleAccounts jsonParsed, 2026-11-21).
const SPL = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const TOKENS: Record<string, { mint: string; decimals: number; tokenProgram: string }> = {
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, tokenProgram: SPL },
  SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9, tokenProgram: SPL },
  JUP: { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6, tokenProgram: SPL },
  JTO: { mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', decimals: 9, tokenProgram: SPL },
  BONK: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5, tokenProgram: SPL },
  USDT: { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, tokenProgram: SPL },
  JitoSOL: { mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', decimals: 9, tokenProgram: SPL },
  WIF: { mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6, tokenProgram: SPL },
  cbBTC: { mint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', decimals: 8, tokenProgram: SPL },
  RAY: { mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6, tokenProgram: SPL },
  // Gold-backed (Jupiter tags rwa/commodities). Token-2022 ones carry transfer fees / hooks / permanent delegate.
  XAUt0: { mint: 'AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P', decimals: 6, tokenProgram: SPL },
  GOLD: { mint: 'GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A', decimals: 6, tokenProgram: SPL },
  GLDx: { mint: 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re', decimals: 8, tokenProgram: T22 },
  VNXAU: { mint: '9TPL8droGJ7jThsq4momaoz6uhTcvX2SeMqipoPmNa8R', decimals: 9, tokenProgram: SPL },
  XAUM: { mint: '5aLhp9VnUEKcsdtkfsf2DUgpJfomx7GmYVny24dHUZoB', decimals: 9, tokenProgram: T22 },
  PAXG: { mint: '5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW', decimals: 6, tokenProgram: T22 },
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
