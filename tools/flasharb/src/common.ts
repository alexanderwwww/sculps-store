import { createSolanaRpc } from '@solana/kit';
import { config } from './config.ts';
import { JupiterClient } from './jupiter.ts';
import { loadKaminoUsdc } from './kamino.ts';
import { fmtUsdc } from './math.ts';
import type { Candidate, ScanResult } from './scanner.ts';
import { confirmOnChain, fetchVerified, selectTokens } from './tokens.ts';

export async function setup() {
  const rpc = createSolanaRpc(config.rpcUrl);
  const jup = new JupiterClient(config.jupiterBase, { ratePerMin: config.jupiterRatePerMin, apiKey: config.jupiterApiKey });
  const labels = new Set(Object.values(await jup.labels()));
  const unknown = config.dexes.filter((d) => !labels.has(d));
  if (unknown.length) throw new Error(`DEX labels not known to Jupiter: ${unknown.join(', ')} (see /program-id-to-label)`);
  const kamino = await loadKaminoUsdc(rpc, config.kaminoMarket);
  if (!kamino.flashLoansEnabled) throw new Error('Kamino USDC reserve has flash loans disabled');
  const picked = selectTokens(await fetchVerified(config.jupiterTokensBase), {
    minLiquidityUsd: config.minTokenLiquidityUsd,
    maxTokens: config.maxTokens,
    excludeTags: config.excludeTags,
    allowToken2022: config.allowToken2022,
    only: config.pairs,
  });
  const tokens = await confirmOnChain(rpc, picked);
  if (!tokens.length) throw new Error('No tokens passed discovery (check MIN_TOKEN_LIQUIDITY_USD / PAIRS)');
  return { rpc, jup, kamino, tokens };
}

export function athens(d = new Date()): string {
  return d.toLocaleString('en-GB', { timeZone: 'Europe/Athens', hour12: false }) + ' Athens';
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
const lpad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);

export function table(cands: Candidate[], rows = 12): string {
  const head = `${pad('pair', 8)} ${lpad('size', 7)} ${pad('buy on (A)', 15)} ${pad('sell on (B)', 15)} ${lpad('spread bps', 10)} ${lpad('gross $', 10)} ${lpad('flash $', 7)} ${lpad('net $', 10)} chk`;
  const line = (c: Candidate) =>
    `${pad(c.pair, 8)} ${lpad(String(c.sizeUsdc), 7)} ${pad(c.dexA, 15)} ${pad(c.dexB, 15)} ${lpad(c.spreadBps.toFixed(2), 10)} ${lpad(fmtUsdc(c.gross), 10)} ${lpad(fmtUsdc(c.flashFee), 7)} ${lpad(fmtUsdc(c.net), 10)} ${c.verified ? 'exact' : 'est'}`;
  return [head, '-'.repeat(head.length), ...cands.slice(0, rows).map(line)].join('\n');
}

export function describe(c: Candidate | undefined): string {
  if (!c) return 'none verified';
  return `${c.pair} ${c.sizeUsdc} USDC: buy on ${c.dexA}, sell on ${c.dexB}, spread ${c.spreadBps.toFixed(2)} bps, net $${fmtUsdc(c.net)} ${c.net > 0n ? 'PROFITABLE' : '(negative, not tradable)'}`;
}
