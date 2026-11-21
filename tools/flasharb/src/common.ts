import { createSolanaRpc } from '@solana/kit';
import { config } from './config.ts';
import { JupiterClient } from './jupiter.ts';
import { loadKaminoUsdc } from './kamino.ts';
import { fmtUsdc } from './math.ts';
import type { Candidate, ScanResult } from './scanner.ts';

export async function setup() {
  const rpc = createSolanaRpc(config.rpcUrl);
  const jup = new JupiterClient(config.jupiterBase, { ratePerMin: config.jupiterRatePerMin, apiKey: config.jupiterApiKey });
  const labels = new Set(Object.values(await jup.labels()));
  const unknown = config.dexes.filter((d) => !labels.has(d));
  if (unknown.length) throw new Error(`DEX labels not known to Jupiter: ${unknown.join(', ')} (see /program-id-to-label)`);
  const kamino = await loadKaminoUsdc(rpc, config.kaminoMarket);
  if (!kamino.flashLoansEnabled) throw new Error('Kamino USDC reserve has flash loans disabled');
  return { rpc, jup, kamino };
}

export function athens(d = new Date()): string {
  return d.toLocaleString('en-GB', { timeZone: 'Europe/Athens', hour12: false }) + ' Athens';
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
const lpad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);

export function table(r: ScanResult, rows = 12): string {
  const head = `${pad('pair', 5)} ${lpad('size', 7)} ${pad('buy on (A)', 16)} ${pad('sell on (B)', 16)} ${lpad('spread bps', 10)} ${lpad('gross $', 9)} ${lpad('flash $', 8)} ${lpad('net $', 9)} chk`;
  const line = (c: Candidate) =>
    `${pad(c.pair, 5)} ${lpad(String(c.sizeUsdc), 7)} ${pad(c.dexA, 16)} ${pad(c.dexB, 16)} ${lpad(c.spreadBps.toFixed(2), 10)} ${lpad(fmtUsdc(c.gross), 9)} ${lpad(fmtUsdc(c.flashFee), 8)} ${lpad(fmtUsdc(c.net), 9)} ${c.verified ? 'exact' : 'est'}`;
  return [head, '-'.repeat(head.length), ...r.candidates.slice(0, rows).map(line)].join('\n');
}
