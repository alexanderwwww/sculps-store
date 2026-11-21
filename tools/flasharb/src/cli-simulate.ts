// npm run simulate: scan once, take the best exact candidate (even if negative), build the flash-loan tx, simulate it.
// Never signs, never sends.
import { address } from '@solana/kit';
import { config, USDC } from './config.ts';
import { athens, describe, setup, table } from './common.ts';
import { buildArbTx, FLASH_BORROW_DISCRIMINATOR, FLASH_REPAY_DISCRIMINATOR, hasDiscriminator } from './builder.ts';
import { computeProfit, fmtUsdc } from './math.ts';
import { logScan, prepareForBuild, scan, type Candidate } from './scanner.ts';
import { findFundedWallet, simulate, usdcBalance } from './simulate.ts';

const { rpc, jup, kamino, tokens } = await setup();
console.log(`Kamino USDC reserve ${kamino.reserveAddress} flash fee ${(kamino.flashLoanFeeRate * 100).toFixed(4)}%, available ${fmtUsdc(kamino.availableLiquidity)} USDC`);

// Flags:
//   --route "SOL,Whirlpool,Raydium CLMM"  build that exact route (pair symbol, buy DEX, sell DEX) at TRADE_SIZE_USDC
//   --size 1000                            override the size for this run
//   --stand-in-wallet                      simulate with a public mainnet wallet that holds USDC (found on chain),
//                                          so a losing trade's shortfall is covered and the repay can complete.
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const size = Number(arg('--size') ?? config.tradeSizeUsdc);

// Cheap, fast route pick first, so the wallet lookup does not age the quotes.
let best: Candidate | undefined;
const route = arg('--route');
if (route) {
  const [sym, dexA, dexB] = route.split(',').map((x) => x.trim());
  const X = tokens.find((t) => t.symbol === sym || t.mint === sym);
  if (!X) throw new Error(`${sym} not in discovered tokens`);
  const borrowed = BigInt(size) * 10n ** BigInt(USDC.decimals);
  const q1 = await jup.quote({ inputMint: USDC.mint, outputMint: X.mint, amount: borrowed, dex: dexA, slippageBps: config.slippageBps, maxAccounts: config.maxAccountsPerSwap });
  const q2 = await jup.quote({ inputMint: X.mint, outputMint: USDC.mint, amount: BigInt(q1.otherAmountThreshold), dex: dexB, slippageBps: config.slippageBps, maxAccounts: config.maxAccountsPerSwap });
  const p = computeProfit({ borrowed, finalUsdc: BigInt(q2.outAmount), flashLoanFeeSf: kamino.flashLoanFeeSf, networkFeeUsdc: 0n });
  best = { pair: X.symbol, mint: X.mint, sizeUsdc: size, dexA, dexB, borrowed, midX: BigInt(q1.outAmount), leg2InX: BigInt(q1.otherAmountThreshold), finalUsdc: BigInt(q2.outAmount), verified: true, quote1: q1, quote2: q2, ...p };
} else {
  const r = await scan({ jup, cfg: { ...config, tradeSizeUsdc: size } as any, flashLoanFeeSf: kamino.flashLoanFeeSf, availableLiquidity: kamino.availableLiquidity, tokens });
  logScan(config.logPath, r);
  console.log(`scan @ ${athens(new Date(r.ts))}, ${r.candidates.length} routes, ${r.jupiterCalls} calls`);
  console.log(`HEADLINE ${size} USDC -> ${describe(r.bestAtTradeSize)}`);
  console.log(table(r.candidates.filter((c) => c.sizeUsdc === size), 6));
  best = r.bestAtTradeSize ?? r.best;
}
if (!best?.quote1 || !best.quote2) {
  console.log('No verified candidate to build.');
  process.exit(1);
}
if (!route) best = await prepareForBuild(jup, best, config, kamino.flashLoanFeeSf);

let wallet = config.walletPubkey;
let walletNote = 'WALLET_PUBKEY from .env';
if (!wallet || process.argv.includes('--stand-in-wallet')) {
  const shortfall = best.net < 0n ? -best.net + 1_000_000n : 0n;
  const found = await findFundedWallet(rpc, USDC.mint, kamino.reserveAddress, shortfall);
  wallet = found.wallet;
  walletNote = `stand-in public wallet ${wallet} (simulation only): ${found.how}`;
}
const [solInfo, usdcHeld] = await Promise.all([rpc.getBalance(address(wallet)).send(), usdcBalance(rpc, wallet, USDC.mint)]);
console.log(`${walletNote} | ${Number(solInfo.value) / 1e9} SOL, ${fmtUsdc(usdcHeld)} USDC held`);
console.log(`\nbuilding: ${best.pair} ${best.sizeUsdc} USDC, buy on ${best.dexA}, sell on ${best.dexB}, expected net $${fmtUsdc(best.net)} (USDC only; leg 2 sells leg 1's guaranteed minimum ${best.leg2InX} of ${best.midX} base units)`);

const swap1 = await jup.swapInstructions(best.quote1!, wallet);
const swap2 = await jup.swapInstructions(best.quote2!, wallet);
const built = await buildArbTx({
  rpc,
  kamino,
  wallet,
  borrowAmount: best.borrowed,
  xMint: best.mint!,
  xTokenProgram: tokens.find((t) => t.mint === best.mint)!.tokenProgram,
  swap1,
  swap2,
  computeUnitLimit: config.computeUnitLimit,
  computeUnitPriceMicroLamports: config.computeUnitPriceMicroLamports,
  extraLuts: [config.kaminoMarketLut],
});
console.log(
  `tx: ${built.ixs.length} instructions, flashBorrow at #${built.borrowIxIndex}, flashRepay at #${built.repayIndex}, ${built.lookupTables.length} lookup tables, ${built.size} bytes (limit 1232: ${built.fitsSizeLimit ? 'fits' : 'TOO BIG'})`,
);
built.ixs.forEach((ix, i) => {
  const d = ix.data as Uint8Array | undefined;
  const tag = hasDiscriminator(d, FLASH_BORROW_DISCRIMINATOR) ? ' (Kamino flashBorrow)' : hasDiscriminator(d, FLASH_REPAY_DISCRIMINATOR) ? ' (Kamino flashRepay)' : '';
  console.log(`  #${i} ${ix.programAddress}${tag}`);
});
if (!built.fitsSizeLimit) {
  console.log('Transaction too large; lower MAX_ACCOUNTS_PER_SWAP.');
  process.exit(1);
}

const watch = [built.usdcAta, built.xAta].map((a) => address(a));
const sim = await simulate(rpc, built.wire, watch);
console.log(`\nsimulation (slot ${sim.slot}, sigVerify=false, replaceRecentBlockhash=true): ${sim.ok ? 'SUCCESS' : 'FAILED'}`);
if (!sim.ok) console.log('error:', JSON.stringify(sim.err, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
console.log(`compute units: ${sim.unitsConsumed}`);
console.log(`USDC ATA ${built.usdcAta}: ${sim.pre[0]} -> ${sim.post[0]} (delta ${fmtUsdc(sim.delta[0])} USDC)`);
console.log(`${best.pair} ATA ${built.xAta}: ${sim.pre[1]} -> ${sim.post[1]} (delta ${sim.delta[1]} base units)`);
console.log('logs (tail 25):');
for (const l of sim.logs.slice(-25)) console.log('  ' + l);
const kLogs = sim.logs.filter((l) => /FlashBorrowReserveLiquidity|FlashRepayReserveLiquidity/.test(l));
console.log('Kamino flash log lines:', kLogs.length ? kLogs : 'none');
