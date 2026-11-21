import { test } from 'node:test';
import assert from 'node:assert/strict';
import { address, AccountRole, type Instruction } from '@solana/kit';
import {
  computeProfit,
  enumerateRoutes,
  flashLoanFee,
  fmtUsdc,
  lamportsToUsdc,
  networkFeeLamports,
  profitable,
  scaleOut,
  SF_ONE,
  U64_MAX,
} from '../src/math.ts';
import { JupiterClient, JupiterHttpError, JupiterNoRouteError, JupiterRateLimitError } from '../src/jupiter.ts';
import { assembleInstructions, decodeRepayBorrowIndex, filterSetup, jupIxToKit, type AssembleInput } from '../src/builder.ts';
import { selectTokens, type JupToken } from '../src/tokens.ts';
import { scan } from '../src/scanner.ts';
import { config, USDC, WSOL } from '../src/config.ts';

// Real value read from the Kamino USDC reserve on 2026-11-21: flashLoanFeeSf = 11529215046068 (= 0.001%).
const REAL_SF = 11529215046068n;

test('flash fee: real Kamino rate is 0.001% and rounds up', () => {
  assert.equal(flashLoanFee(100_000_000_000n, REAL_SF), 1_000_000n); // $100k -> $1.00
  assert.equal(flashLoanFee(1_000_000_000n, REAL_SF), 10_000n); // $1k -> $0.01
  assert.equal(flashLoanFee(1_000_000_000_000n, REAL_SF), 10_000_000n); // $1M -> $10.00
  assert.equal(flashLoanFee(1n, REAL_SF), 1n); // minimum 1 unit
  assert.equal(flashLoanFee(5n, 0n), 0n); // free
  assert.equal(flashLoanFee(SF_ONE, 3n), 3n); // exact, no rounding
  assert.equal(flashLoanFee(SF_ONE + 1n, 3n), 4n); // remainder -> ceil
  assert.throws(() => flashLoanFee(1000n, U64_MAX), /disabled/);
});

test('network fee: base + priority (CU * microLamports / 1e6, ceil)', () => {
  assert.equal(networkFeeLamports({ signatures: 1, baseFeeLamportsPerSignature: 5000, computeUnitLimit: 600_000, computeUnitPriceMicroLamports: 50_000 }), 35_000n);
  assert.equal(networkFeeLamports({ signatures: 1, baseFeeLamportsPerSignature: 5000, computeUnitLimit: 1, computeUnitPriceMicroLamports: 1 }), 5001n);
  assert.equal(lamportsToUsdc(1_000_000_000n, 66.82), 66_820_000n); // 1 SOL at $66.82
  assert.equal(lamportsToUsdc(35_000n, 66.82), 2339n); // $0.002339
  assert.throws(() => lamportsToUsdc(1n, 0));
});

test('profit math: net = final - borrowed - flash fee - network fee', () => {
  const p = computeProfit({ borrowed: 100_000_000_000n, finalUsdc: 100_050_000_000n, flashLoanFeeSf: REAL_SF, networkFeeUsdc: 2339n });
  assert.equal(p.gross, 50_000_000n);
  assert.equal(p.flashFee, 1_000_000n);
  assert.equal(p.net, 50_000_000n - 1_000_000n - 2339n);
  assert.ok(Math.abs(p.spreadBps - 5) < 1e-9);
  const loss = computeProfit({ borrowed: 1_000_000_000n, finalUsdc: 999_000_000n, flashLoanFeeSf: REAL_SF, networkFeeUsdc: 0n });
  assert.equal(loss.net, -1_010_000n);
  assert.equal(fmtUsdc(loss.net), '-1.01');
  assert.equal(scaleOut(100n, 200n, 150n), 300n);
});

test('rejects negative and zero net candidates', () => {
  const c = [{ net: -1n }, { net: 0n }, { net: 1n }, { net: 500n }];
  assert.deepEqual(profitable(c).map((x) => x.net), [1n, 500n]);
});

test('direction/size enumeration covers every ordered DEX pair, both directions, no self-pairs', () => {
  const r = enumerateRoutes(['SOL', 'JUP'], [1000, 100000, 1000000], ['A', 'B', 'C']);
  assert.equal(r.length, 2 * 3 * 3 * 2); // pairs * sizes * n*(n-1)
  assert.ok(r.some((x) => x.dexA === 'A' && x.dexB === 'B') && r.some((x) => x.dexA === 'B' && x.dexB === 'A'));
  assert.ok(r.every((x) => x.dexA !== x.dexB));
  assert.equal(new Set(r.map((x) => `${x.pair}|${x.sizeUsdc}|${x.dexA}|${x.dexB}`)).size, r.length);
});

test('config: headline 100k is always scanned, plus comparison sizes', () => {
  assert.equal(config.tradeSizeUsdc, Number(process.env.TRADE_SIZE_USDC ?? 100_000));
  assert.ok(config.sizesUsdc.includes(config.tradeSizeUsdc));
  assert.deepEqual(config.sizesUsdc, [...config.sizesUsdc].sort((a, b) => a - b));
});

// ---- builder: borrow index correctness ----
const W = address('9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo');
const fakeIx = (tag: number): Instruction => ({ programAddress: W, accounts: [], data: new Uint8Array([tag]) });
const jix = (programId = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', accounts: any[] = []) => ({ programId, accounts, data: Buffer.from([7]).toString('base64') });
function swapResp(setup: any[] = [], cleanup: any = null): any {
  return { computeBudgetInstructions: [jix('ComputeBudget111111111111111111111111111111')], setupInstructions: setup, swapInstruction: jix(), cleanupInstruction: cleanup, otherInstructions: [], addressLookupTableAddresses: [] };
}
function makeFlash(idx: number) {
  const repay = new Uint8Array(17);
  repay[16] = idx;
  return { flashBorrowIx: { programAddress: W, accounts: [], data: new Uint8Array([135]) } as Instruction, flashRepayIx: { programAddress: W, accounts: [], data: repay } as Instruction };
}

test('borrow index equals the real position of flashBorrow, repay is last', () => {
  for (const preLen of [0, 2, 4, 7]) {
    const a: AssembleInput = { pre: Array.from({ length: preLen }, (_, i) => fakeIx(i)), swap1: swapResp([jix()], jix()), swap2: swapResp(), ourAtas: new Set(), makeFlash };
    const { ixs, borrowIxIndex, repayIndex } = assembleInstructions(a);
    assert.equal(borrowIxIndex, preLen);
    assert.equal((ixs[borrowIxIndex].data as Uint8Array)[0], 135);
    assert.equal(decodeRepayBorrowIndex(ixs[repayIndex].data as Uint8Array), borrowIxIndex);
    assert.equal(repayIndex, ixs.length - 1);
    // Jupiter compute-budget ixs are never copied in
    assert.ok(!ixs.some((ix) => ix.programAddress === 'ComputeBudget111111111111111111111111111111'));
  }
});

test('assembly refuses a repay that points at the wrong index', () => {
  const bad = (i: number) => makeFlash(i + 1);
  assert.throws(() => assembleInstructions({ pre: [fakeIx(0)], swap1: swapResp(), swap2: swapResp(), ourAtas: new Set(), makeFlash: bad }), /borrow index/);
});

test('jupiter ix conversion keeps roles; our ATAs are not created twice', () => {
  const k = jupIxToKit({ programId: W, data: 'AQI=', accounts: [
    { pubkey: W, isSigner: true, isWritable: true }, { pubkey: W, isSigner: true, isWritable: false },
    { pubkey: W, isSigner: false, isWritable: true }, { pubkey: W, isSigner: false, isWritable: false } ] });
  assert.deepEqual(k.accounts!.map((a) => a.role), [AccountRole.WRITABLE_SIGNER, AccountRole.READONLY_SIGNER, AccountRole.WRITABLE, AccountRole.READONLY]);
  assert.deepEqual([...(k.data as Uint8Array)], [1, 2]);
  const ata = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
  const setup = [jix(ata, [{ pubkey: W }, { pubkey: 'MINE' }]), jix(ata, [{ pubkey: W }, { pubkey: 'OTHER' }])];
  assert.equal(filterSetup(setup as any, new Set(['MINE'])).length, 1);
});

// ---- token discovery ----
test('token discovery: verified, above liquidity, no excluded tags, no USDC, sorted, capped', () => {
  const list: JupToken[] = [
    { id: USDC.mint, symbol: 'USDC', name: '', decimals: 6, liquidity: 9e9, isVerified: true },
    { id: 'a', symbol: 'A', name: '', decimals: 6, liquidity: 6e6, isVerified: true, tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
    { id: 'b', symbol: 'B', name: '', decimals: 6, liquidity: 9e6, isVerified: true },
    { id: 'c', symbol: 'C', name: '', decimals: 6, liquidity: 1e6, isVerified: true },
    { id: 'd', symbol: 'D', name: '', decimals: 6, liquidity: 8e6, isVerified: true, tags: ['yb'] },
    { id: 'e', symbol: 'E', name: '', decimals: 6, liquidity: 7e6, isVerified: true, tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' },
  ];
  const o = { minLiquidityUsd: 5e6, maxTokens: 10, excludeTags: ['yb'], allowToken2022: false };
  assert.deepEqual(selectTokens(list, o).map((t) => t.symbol), ['B', 'A']);
  assert.deepEqual(selectTokens(list, { ...o, allowToken2022: true }).map((t) => t.symbol), ['B', 'E', 'A']);
  assert.deepEqual(selectTokens(list, { ...o, maxTokens: 1 }).map((t) => t.symbol), ['B']);
  assert.deepEqual(selectTokens(list, { ...o, only: ['a'] }).map((t) => t.symbol), ['A']);
});

// ---- failure handling ----
const resp = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

test('Jupiter 429: retries, then raises JupiterRateLimitError', async () => {
  let n = 0;
  const jup = new JupiterClient('http://x', { ratePerMin: 1e6, maxRetries: 2, backoffMs: 1, fetchFn: async () => (n++, resp(429, 'Too Many Requests')) });
  await assert.rejects(jup.quote({ inputMint: 'a', outputMint: 'b', amount: 1n, dex: 'X', slippageBps: 1 }), JupiterRateLimitError);
  assert.equal(n, 3);
  assert.equal(jup.rateLimited, 3);
});

test('Jupiter 429 then 200: recovers', async () => {
  let n = 0;
  const jup = new JupiterClient('http://x', { ratePerMin: 1e6, backoffMs: 1, fetchFn: async () => (n++ === 0 ? resp(429, '') : resp(200, { outAmount: '5' })) });
  const q = await jup.quote({ inputMint: 'a', outputMint: 'b', amount: 1n, dex: 'X', slippageBps: 1 });
  assert.equal(q.outAmount, '5');
});

test('Jupiter no route -> JupiterNoRouteError; other 4xx -> JupiterHttpError; garbage -> JupiterHttpError', async () => {
  const mk = (r: Response) => new JupiterClient('http://x', { ratePerMin: 1e6, maxRetries: 0, backoffMs: 1, fetchFn: async () => r.clone() });
  const p = { inputMint: 'a', outputMint: 'b', amount: 1n, dex: 'X', slippageBps: 1 };
  await assert.rejects(mk(resp(400, { error: 'No routes found', errorCode: 'NO_ROUTES_FOUND' })).quote(p), JupiterNoRouteError);
  await assert.rejects(mk(resp(400, { error: 'bad amount' })).quote(p), JupiterHttpError);
  await assert.rejects(mk(resp(502, '<html>')).quote(p), JupiterHttpError);
});

test('Jupiter request carries the DEX filter and excludeDexes', async () => {
  let url = '';
  const jup = new JupiterClient('http://x', { ratePerMin: 1e6, fetchFn: async (u: any) => ((url = String(u)), resp(200, { outAmount: '1' })) });
  await jup.quote({ inputMint: 'a', outputMint: 'b', amount: 7n, dex: 'Raydium CLMM', excludeDexes: ['Whirlpool', 'Meteora DLMM'], slippageBps: 3, maxAccounts: 24 });
  const q = new URL(url).searchParams;
  assert.equal(q.get('dexes'), 'Raydium CLMM');
  assert.equal(q.get('excludeDexes'), 'Whirlpool,Meteora DLMM');
  assert.equal(q.get('amount'), '7');
  assert.equal(q.get('maxAccounts'), '24');
});

// Fake Jupiter market: DEX "Cheap" sells X at 1% below "Rich". Drives the whole scan loop.
function fakeMarket(opts: { noRouteDex?: string; failAll?: boolean } = {}) {
  const price: Record<string, number> = { Cheap: 99, Rich: 100, Mid: 99.5 }; // USDC per X
  return async (u: any) => {
    const url = new URL(String(u));
    if (opts.failAll) return resp(429, '');
    const q = url.searchParams;
    const amt = Number(q.get('amount'));
    const inMint = q.get('inputMint');
    const dex = q.get('dexes');
    if (!dex) {
      // unrestricted (sol price / discovery)
      const excl = (q.get('excludeDexes') ?? '').split(',').filter(Boolean);
      const left = Object.keys(price).filter((d) => !excl.includes(d) && d !== opts.noRouteDex);
      if (!left.length) return resp(400, { error: 'No routes found', errorCode: 'NO_ROUTES_FOUND' });
      return resp(200, { outAmount: String(Math.floor(amt / 66)), routePlan: [{ swapInfo: { label: left[0] } }] });
    }
    if (dex === opts.noRouteDex) return resp(400, { error: 'No routes found', errorCode: 'NO_ROUTES_FOUND' });
    const p = price[dex];
    const out = inMint === USDC.mint ? (amt / p) * 1 : amt * p; // X has 6 decimals like USDC
    return resp(200, { inAmount: String(amt), outAmount: String(Math.floor(out)), otherAmountThreshold: String(Math.floor(out * 0.999)), routePlan: [{ swapInfo: { label: dex } }] });
  };
}
const X = { symbol: 'X', mint: 'XMint', decimals: 6, tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' };
const cfgFor = (o: Partial<typeof config> = {}) => ({ ...config, dexes: [], compareSizesUsdc: [1000], tradeSizeUsdc: 100000, verifyTopK: 2, maxDexesPerToken: 5, ...o, get sizesUsdc() { return [1000, 100000]; } }) as any;

test('scan loop finds buy-cheap/sell-rich, verifies it exactly, rejects reverse direction as negative', async () => {
  const jup = new JupiterClient('http://x', { ratePerMin: 1e6, fetchFn: fakeMarket() as any });
  const r = await scan({ jup, cfg: cfgFor(), flashLoanFeeSf: REAL_SF, availableLiquidity: 10n ** 15n, tokens: [X] });
  assert.ok(r.bestAtTradeSize);
  assert.equal(r.bestAtTradeSize!.dexA, 'Cheap');
  assert.equal(r.bestAtTradeSize!.dexB, 'Rich');
  assert.equal(r.bestAtTradeSize!.verified, true);
  // scan math = market spread: 100k / 99 * 100 = 101,010.10 -> net ~ $1009.10
  const b = r.bestAtTradeSize!;
  assert.equal(b.quote2!.inAmount, b.quote1!.outAmount);
  assert.ok(b.net > 1_000_000_000n && b.net < 1_010_000_000n, String(b.net));
  // build path: leg 2 sells only leg 1's guaranteed minimum (0.999x) -> ~ $908
  const { prepareForBuild } = await import('../src/scanner.ts');
  const built = await prepareForBuild(jup, b, cfgFor(), REAL_SF);
  assert.equal(built.leg2InX, BigInt(b.quote1!.otherAmountThreshold));
  assert.equal(built.quote2!.inAmount, built.leg2InX!.toString());
  assert.ok(built.net > 900_000_000n && built.net < 910_000_000n, String(built.net));
  const rev = r.candidates.find((c) => c.dexA === 'Rich' && c.dexB === 'Cheap' && c.sizeUsdc === 100000)!;
  assert.ok(rev.net < 0n);
  assert.deepEqual(profitable(r.candidates).every((c) => c.net > 0n), true);
  assert.equal(r.candidates.filter((c) => c.sizeUsdc === 1000).length, 6); // 3 DEXes -> 6 ordered pairs
});

test('scan: a DEX with no route is dropped; sizes above Kamino liquidity are skipped', async () => {
  const jup = new JupiterClient('http://x', { ratePerMin: 1e6, fetchFn: fakeMarket({ noRouteDex: 'Mid' }) as any });
  const r = await scan({ jup, cfg: cfgFor({ dexes: ['Cheap', 'Rich', 'Mid'] }), flashLoanFeeSf: REAL_SF, availableLiquidity: 50_000_000_000n, tokens: [X] });
  assert.ok(r.candidates.every((c) => c.dexA !== 'Mid' && c.dexB !== 'Mid'));
  assert.ok(r.errors.some((e) => e.error === 'no_route' && e.dex === 'Mid'));
  assert.ok(r.errors.some((e) => e.stage === 'liquidity' && e.size === 100000));
  assert.equal(r.bestAtTradeSize, undefined);
});

test('scan: Jupiter rate-limited everywhere -> error surfaces, no crash, no fake candidates', async () => {
  const jup = new JupiterClient('http://x', { ratePerMin: 1e6, maxRetries: 0, backoffMs: 1, fetchFn: fakeMarket({ failAll: true }) as any });
  await assert.rejects(scan({ jup, cfg: cfgFor(), flashLoanFeeSf: REAL_SF, availableLiquidity: 10n ** 15n, tokens: [X] }), JupiterRateLimitError);
});

test('RPC error surfaces from simulate (unreachable RPC)', async () => {
  const { createSolanaRpc } = await import('@solana/kit');
  const { simulate } = await import('../src/simulate.ts');
  const rpc = createSolanaRpc('http://127.0.0.1:9');
  await assert.rejects(simulate(rpc as any, 'AA==' as any, [WSOL.mint as any]));
});
