// Scanner: borrow USDC, buy X on DEX A, sell X on DEX B, repay. Every ordered (A, B) pair, every size.
//
// Pass 1 (cheap): per (pair, size) quote USDC->X on every DEX, and X->USDC on every DEX using the best leg-1
//   output as the input. Each (A, B) leg-2 result is linearly rescaled to A's actual leg-1 output.
// Pass 2 (exact): the top-K candidates are re-quoted with the exact leg-1 output as the leg-2 input.
// Only exact (verified) numbers are used to pick the best candidate.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { JupiterClient, JupiterNoRouteError, JupiterRateLimitError, type QuoteResponse } from './jupiter.ts';
import { computeProfit, lamportsToUsdc, networkFeeLamports, scaleOut, type Profit } from './math.ts';
import { USDC, WSOL, type Config, type TokenInfo } from './config.ts';

export interface Candidate extends Profit {
  pair: string;
  mint?: string;
  sizeUsdc: number;
  dexA: string;
  dexB: string;
  borrowed: bigint;
  midX: bigint; // X out of leg1
  finalUsdc: bigint;
  verified: boolean;
  quote1?: QuoteResponse;
  quote2?: QuoteResponse;
}

export interface ScanResult {
  scanId: string;
  ts: string;
  candidates: Candidate[]; // sorted by net desc, verified first
  best?: Candidate;
  bestAtTradeSize?: Candidate; // the headline (TRADE_SIZE_USDC)
  tradeSizeUsdc: number;
  dexesUsed: Record<string, string[]>;
  errors: { stage: string; pair: string; dex: string; size: number; error: string }[];
  jupiterCalls: number;
  usdcPerSol: number;
  networkFeeUsdc: bigint;
  durationMs: number;
}

export interface ScanDeps {
  jup: JupiterClient;
  cfg: Config;
  flashLoanFeeSf: bigint;
  availableLiquidity: bigint;
  tokens: TokenInfo[];
  log?: (s: string) => void;
}


async function tryQuote(
  deps: ScanDeps,
  errors: ScanResult['errors'],
  stage: string,
  pair: string,
  dex: string,
  size: number,
  inputMint: string,
  outputMint: string,
  amount: bigint,
): Promise<QuoteResponse | null> {
  try {
    return await deps.jup.quote({
      inputMint,
      outputMint,
      amount,
      dex,
      slippageBps: deps.cfg.slippageBps,
      maxAccounts: deps.cfg.maxAccountsPerSwap,
    });
  } catch (e: any) {
    if (e instanceof JupiterNoRouteError) {
      errors.push({ stage, pair, dex, size, error: 'no_route' });
      return null;
    }
    if (e instanceof JupiterRateLimitError) {
      errors.push({ stage, pair, dex, size, error: 'rate_limited' });
      return null;
    }
    errors.push({ stage, pair, dex, size, error: String(e?.message ?? e) });
    return null;
  }
}

/** SOL price in USDC from an unrestricted USDC->SOL quote (used only to price the network fee). */
export async function solPrice(deps: ScanDeps): Promise<number> {
  const q = await deps.jup.quote({ inputMint: USDC.mint, outputMint: WSOL.mint, amount: 100_000_000n, slippageBps: 50 });
  return 100 / (Number(q.outAmount) / 1e9);
}

/**
 * Live DEX discovery for one token: quote USDC->X unrestricted, record every DEX label in the route,
 * exclude those labels (excludeDexes), repeat until Jupiter has no route or `max` labels are found.
 */
export async function discoverDexes(jup: JupiterClient, X: TokenInfo, amount: bigint, max: number): Promise<string[]> {
  const found: string[] = [];
  for (let i = 0; i < max; i++) {
    try {
      const q = await jup.quote({ inputMint: USDC.mint, outputMint: X.mint, amount, excludeDexes: found, slippageBps: 50 });
      const labels = [...new Set(q.routePlan.map((r) => r.swapInfo.label))].filter((l) => !found.includes(l));
      if (!labels.length) break;
      found.push(...labels);
      if (found.length >= max) break;
    } catch (e) {
      if (e instanceof JupiterNoRouteError) break;
      throw e;
    }
  }
  return found.slice(0, max);
}

const dexCache = new Map<string, { at: number; dexes: string[] }>();

const byNet = (a: Candidate, b: Candidate) => (b.net > a.net ? 1 : b.net < a.net ? -1 : 0);

export async function scan(deps: ScanDeps): Promise<ScanResult> {
  const t0 = Date.now();
  const callsBefore = deps.jup.calls;
  const { cfg } = deps;
  const errors: ScanResult['errors'] = [];
  const usdcPerSol = await solPrice(deps);
  const feeLamports = networkFeeLamports({
    signatures: 1,
    baseFeeLamportsPerSignature: cfg.baseFeeLamportsPerSignature,
    computeUnitLimit: cfg.computeUnitLimit,
    computeUnitPriceMicroLamports: cfg.computeUnitPriceMicroLamports,
  });
  const networkFeeUsdc = lamportsToUsdc(feeLamports, usdcPerSol);
  const all: Candidate[] = [];
  const dexesUsed: Record<string, string[]> = {};
  const sizes = [...cfg.sizesUsdc].sort((a, b) => a - b);

  for (const X of deps.tokens) {
    const pair = X.symbol;
    let liveDexes: string[];
    if (cfg.dexes.length) liveDexes = [...cfg.dexes];
    else {
      const c = dexCache.get(X.mint);
      if (c && Date.now() - c.at < cfg.dexRediscoverMs) liveDexes = c.dexes;
      else {
        try {
          liveDexes = await discoverDexes(deps.jup, X, BigInt(sizes[0] * 10 ** USDC.decimals), cfg.maxDexesPerToken);
          dexCache.set(X.mint, { at: Date.now(), dexes: liveDexes });
        } catch (e: any) {
          errors.push({ stage: 'discover', pair, dex: '-', size: sizes[0], error: String(e?.message ?? e) });
          continue;
        }
      }
    }
    dexesUsed[pair] = liveDexes;
    if (liveDexes.length < 2) {
      errors.push({ stage: 'discover', pair, dex: '-', size: 0, error: `only ${liveDexes.length} DEX routes this token` });
      continue;
    }
    for (const size of sizes) {
      const borrowed = BigInt(Math.round(size * 10 ** USDC.decimals));
      if (borrowed > deps.availableLiquidity) {
        errors.push({ stage: 'liquidity', pair, dex: '-', size, error: 'size exceeds Kamino available liquidity' });
        continue;
      }
      // Leg 1 on every DEX.
      const leg1 = new Map<string, QuoteResponse>();
      for (const dex of liveDexes) {
        const q = await tryQuote(deps, errors, 'leg1', pair, dex, size, USDC.mint, X.mint, borrowed);
        if (q) leg1.set(dex, q);
      }
      // A DEX with no USDC->X route at the smallest size is dropped for this pair (saves calls).
      if (size === sizes[0])
        liveDexes = liveDexes.filter(
          (d) => leg1.has(d) || !errors.some((e) => e.stage === 'leg1' && e.pair === pair && e.dex === d && e.size === size && e.error === 'no_route'),
        );
      if (leg1.size < 1) continue;
      const refIn = [...leg1.values()].reduce((m, q) => (BigInt(q.outAmount) > m ? BigInt(q.outAmount) : m), 0n);
      // Leg 2 on every DEX at the reference amount.
      const leg2 = new Map<string, QuoteResponse>();
      for (const dex of liveDexes) {
        const q = await tryQuote(deps, errors, 'leg2', pair, dex, size, X.mint, USDC.mint, refIn);
        if (q) leg2.set(dex, q);
      }
      for (const [dexA, q1] of leg1)
        for (const [dexB, q2] of leg2) {
          if (dexA === dexB) continue;
          const midX = BigInt(q1.outAmount);
          const finalUsdc = scaleOut(refIn, BigInt(q2.outAmount), midX);
          const p = computeProfit({ borrowed, finalUsdc, flashLoanFeeSf: deps.flashLoanFeeSf, networkFeeUsdc });
          all.push({ pair, mint: X.mint, sizeUsdc: size, dexA, dexB, borrowed, midX, finalUsdc, verified: false, quote1: q1, ...p });
        }
    }
  }

  // Pass 2: exact. Fresh leg-1 quote, then leg-2 quoted with exactly that output. Keep verifying the leader
  // (overall and at the headline size) until the leader is an exact number, at most verifyTopK+5 times each.
  const verify = async (c: Candidate) => {
    const X = deps.tokens.find((t) => t.mint === c.mint)!;
    c.verified = true; // attempted; failed attempts are removed below
    const q1 = await tryQuote(deps, errors, 'verify1', c.pair, c.dexA, c.sizeUsdc, USDC.mint, X.mint, c.borrowed);
    if (!q1) return void (c.net = -(1n << 62n));
    const q2 = await tryQuote(deps, errors, 'verify2', c.pair, c.dexB, c.sizeUsdc, X.mint, USDC.mint, BigInt(q1.outAmount));
    if (!q2) return void (c.net = -(1n << 62n));
    c.quote1 = q1;
    c.quote2 = q2;
    c.midX = BigInt(q1.outAmount);
    c.finalUsdc = BigInt(q2.outAmount);
    Object.assign(c, computeProfit({ borrowed: c.borrowed, finalUsdc: c.finalUsdc, flashLoanFeeSf: deps.flashLoanFeeSf, networkFeeUsdc }));
  };
  for (const subset of [all, all.filter((c) => c.sizeUsdc === cfg.tradeSizeUsdc)]) {
    for (const c of [...subset].sort(byNet).slice(0, cfg.verifyTopK)) if (!c.verified) await verify(c);
    for (let i = 0; i < 5; i++) {
      const lead = [...subset].sort(byNet)[0];
      if (!lead || lead.verified) break;
      await verify(lead);
    }
  }
  const failed = (c: Candidate) => c.verified && !c.quote2;
  const sorted = all.filter((c) => !failed(c)).sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return byNet(a, b);
  });
  const best = sorted.find((c) => c.verified);
  const bestAtTradeSize = sorted.find((c) => c.verified && c.sizeUsdc === cfg.tradeSizeUsdc);
  return {
    scanId: `${t0}`,
    ts: new Date(t0).toISOString(),
    candidates: sorted,
    best,
    bestAtTradeSize,
    tradeSizeUsdc: cfg.tradeSizeUsdc,
    dexesUsed,
    errors,
    jupiterCalls: deps.jup.calls - callsBefore,
    usdcPerSol,
    networkFeeUsdc,
    durationMs: Date.now() - t0,
  };
}

export function logScan(path: string, r: ScanResult) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = r.candidates.map((c) =>
    JSON.stringify({
      ts: r.ts,
      scanId: r.scanId,
      pair: c.pair,
      sizeUsdc: c.sizeUsdc,
      dexA: c.dexA,
      dexB: c.dexB,
      verified: c.verified,
      spreadBps: Number(c.spreadBps.toFixed(3)),
      borrowed: c.borrowed.toString(),
      finalUsdc: c.finalUsdc.toString(),
      gross: c.gross.toString(),
      flashFee: c.flashFee.toString(),
      networkFeeUsdc: c.networkFeeUsdc.toString(),
      net: c.net.toString(),
    }),
  );
  lines.push(
    JSON.stringify({
      ts: r.ts,
      scanId: r.scanId,
      summary: true,
      candidates: r.candidates.length,
      tradeSizeUsdc: r.tradeSizeUsdc,
      headlineNet: r.bestAtTradeSize?.net.toString() ?? null,
      headlineRoute: r.bestAtTradeSize ? `${r.bestAtTradeSize.pair} ${r.bestAtTradeSize.dexA}->${r.bestAtTradeSize.dexB}` : null,
      headlineSpreadBps: r.bestAtTradeSize ? Number(r.bestAtTradeSize.spreadBps.toFixed(3)) : null,
      bestNet: r.best?.net.toString() ?? null,
      bestRoute: r.best ? `${r.best.pair} ${r.best.sizeUsdc} ${r.best.dexA}->${r.best.dexB}` : null,
      jupiterCalls: r.jupiterCalls,
      errors: r.errors.length,
      usdcPerSol: r.usdcPerSol,
      durationMs: r.durationMs,
      dexesUsed: r.dexesUsed,
      errorKinds: r.errors.reduce((m: Record<string, number>, e) => ((m[e.error] = (m[e.error] ?? 0) + 1), m), {}),
    }),
  );
  appendFileSync(path, lines.join('\n') + '\n');
}
