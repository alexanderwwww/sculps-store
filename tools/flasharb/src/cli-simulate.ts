// npm run simulate: scan once, take the best exact candidate (even if negative), build the flash-loan tx, simulate it.
// Never signs, never sends.
import { address } from '@solana/kit';
import { config, TOKENS } from './config.ts';
import { athens, setup, table } from './common.ts';
import { buildArbTx, FLASH_BORROW_DISCRIMINATOR, FLASH_REPAY_DISCRIMINATOR, hasDiscriminator } from './builder.ts';
import { fmtUsdc } from './math.ts';
import { logScan, scan } from './scanner.ts';
import { findFundedWallet, simulate } from './simulate.ts';

const { rpc, jup, kamino } = await setup();
console.log(`Kamino USDC reserve ${kamino.reserveAddress} flash fee ${(kamino.flashLoanFeeRate * 100).toFixed(4)}%, available ${fmtUsdc(kamino.availableLiquidity)} USDC`);

let wallet = config.walletPubkey;
let walletNote = 'WALLET_PUBKEY from .env';
if (!wallet) {
  const found = await findFundedWallet(rpc, TOKENS.USDC.mint, kamino.reserveAddress);
  wallet = found.wallet;
  walletNote = `WALLET_PUBKEY not set -> stand-in public wallet ${wallet}: ${found.how}`;
}
console.log(walletNote);

const r = await scan({ jup, cfg: config, flashLoanFeeSf: kamino.flashLoanFeeSf, availableLiquidity: kamino.availableLiquidity });
logScan(config.logPath, r);
console.log(`scan @ ${athens(new Date(r.ts))}, ${r.candidates.length} routes, ${r.jupiterCalls} calls`);
console.log(table(r, 6));
const best = r.best;
if (!best?.quote1 || !best.quote2) {
  console.log('No verified candidate to build.');
  process.exit(1);
}
console.log(`\nbuilding: ${best.pair} ${best.sizeUsdc} USDC, buy on ${best.dexA}, sell on ${best.dexB}, expected net $${fmtUsdc(best.net)}`);

const swap1 = await jup.swapInstructions(best.quote1, wallet);
const swap2 = await jup.swapInstructions(best.quote2, wallet);
const built = await buildArbTx({
  rpc,
  kamino,
  wallet,
  borrowAmount: best.borrowed,
  xMint: TOKENS[best.pair].mint,
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
