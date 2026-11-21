// Pure profit / fee math. All token amounts are integer base units (bigint).

/** 2^60: Kamino "scaled fraction" denominator (klend-sdk src/classes/fraction.ts, Fraction). */
export const SF_ONE = 1n << 60n;
/** u64::MAX sentinel = flash loans disabled (klend-sdk src/leverage/utils.ts:29-33). */
export const U64_MAX = 18446744073709551615n;

/**
 * Kamino flash-loan fee in base units for `amount`.
 * SDK: KaminoReserve.calculateFees (src/classes/reserve.ts:1726-1761), Exclusive mode:
 *   fee = amount * rate, then max(fee, 1). We round UP (ceil) to stay conservative.
 * rate = flashLoanFeeSf / 2^60 (reserve.ts:655-660).
 */
export function flashLoanFee(amount: bigint, flashLoanFeeSf: bigint): bigint {
  if (flashLoanFeeSf === U64_MAX) throw new Error('Flash loans are disabled on this reserve (fee sf = u64::MAX)');
  if (flashLoanFeeSf === 0n || amount === 0n) return 0n;
  const num = amount * flashLoanFeeSf;
  let fee = num / SF_ONE;
  if (num % SF_ONE !== 0n) fee += 1n;
  return fee < 1n ? 1n : fee;
}

/** Network fee in lamports: base fee per signature + priority fee (CU limit * microLamports / 1e6, rounded up). */
export function networkFeeLamports(p: {
  signatures: number;
  baseFeeLamportsPerSignature: number;
  computeUnitLimit: number;
  computeUnitPriceMicroLamports: number;
}): bigint {
  const base = BigInt(p.signatures) * BigInt(p.baseFeeLamportsPerSignature);
  const micro = BigInt(p.computeUnitLimit) * BigInt(p.computeUnitPriceMicroLamports);
  const prio = micro / 1_000_000n + (micro % 1_000_000n === 0n ? 0n : 1n);
  return base + prio;
}

/** Convert lamports to USDC base units with a SOL price expressed as usdcPerSol (float, e.g. 66.2). Rounds up. */
export function lamportsToUsdc(lamports: bigint, usdcPerSol: number): bigint {
  if (!(usdcPerSol > 0)) throw new Error('usdcPerSol must be > 0');
  // lamports * 1e-9 SOL * price USDC/SOL * 1e6 base = lamports * price / 1000
  return BigInt(Math.ceil((Number(lamports) * usdcPerSol) / 1000));
}

export interface ProfitInput {
  borrowed: bigint; // USDC base units borrowed (= leg1 input)
  finalUsdc: bigint; // USDC base units out of leg2
  flashLoanFeeSf: bigint;
  networkFeeUsdc: bigint; // USDC base units
}
export interface Profit {
  gross: bigint; // finalUsdc - borrowed
  flashFee: bigint;
  networkFeeUsdc: bigint;
  net: bigint; // gross - flashFee - networkFeeUsdc
  spreadBps: number; // gross / borrowed * 1e4
}

export function computeProfit(p: ProfitInput): Profit {
  const gross = p.finalUsdc - p.borrowed;
  const flashFee = flashLoanFee(p.borrowed, p.flashLoanFeeSf);
  const net = gross - flashFee - p.networkFeeUsdc;
  const spreadBps = p.borrowed === 0n ? 0 : (Number(gross) / Number(p.borrowed)) * 1e4;
  return { gross, flashFee, networkFeeUsdc: p.networkFeeUsdc, net, spreadBps };
}

/** Linear scaling of a quote result to a slightly different input (used for the cheap first pass only). */
export function scaleOut(refIn: bigint, refOut: bigint, newIn: bigint): bigint {
  if (refIn === 0n) return 0n;
  return (refOut * newIn) / refIn;
}

export interface Route {
  pair: string;
  sizeUsdc: number;
  dexA: string; // leg1 USDC -> X
  dexB: string; // leg2 X -> USDC
}

/**
 * Every (pair, size, dexA, dexB) with dexA != dexB.
 * "Both directions" = buy on A / sell on B and buy on B / sell on A; both appear as ordered pairs.
 */
export function enumerateRoutes(pairs: string[], sizes: number[], dexes: string[]): Route[] {
  const out: Route[] = [];
  for (const pair of pairs)
    for (const sizeUsdc of sizes)
      for (const dexA of dexes)
        for (const dexB of dexes) if (dexA !== dexB) out.push({ pair, sizeUsdc, dexA, dexB });
  return out;
}

/** Keep only candidates whose verified net profit is strictly positive. */
export function profitable<T extends { net: bigint }>(cands: T[]): T[] {
  return cands.filter((c) => c.net > 0n);
}

export function fmtUsdc(v: bigint): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const s = `${a / 1_000_000n}.${(a % 1_000_000n).toString().padStart(6, '0')}`;
  return (neg ? '-' : '') + s.replace(/(\.\d{2})\d*$/, '$1');
}
