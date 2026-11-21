// npm run scan            -> scans forever, every SCAN_INTERVAL_MS
// npm run scan -- --count 3 -> 3 scans then exit
import { config } from './config.ts';
import { athens, setup, table } from './common.ts';
import { fmtUsdc } from './math.ts';
import { logScan, scan } from './scanner.ts';

const ci = process.argv.indexOf('--count');
const count = ci > 0 ? Number(process.argv[ci + 1]) : Infinity;

const { jup, kamino } = await setup();
console.log(
  `Kamino ${kamino.marketName} ${kamino.marketAddress} | USDC reserve ${kamino.reserveAddress} | flash fee ${(kamino.flashLoanFeeRate * 100).toFixed(4)}% | available ${fmtUsdc(kamino.availableLiquidity)} USDC`,
);
console.log(`pairs ${config.pairs.join(',')} | sizes ${config.sizesUsdc.join(',')} USDC | dexes ${config.dexes.join(', ')}`);
console.log(`log -> ${config.logPath}\n`);

let bestEver: bigint | null = null;
for (let i = 0; i < count; i++) {
  const r = await scan({ jup, cfg: config, flashLoanFeeSf: kamino.flashLoanFeeSf, availableLiquidity: kamino.availableLiquidity });
  logScan(config.logPath, r);
  if (r.best && (bestEver === null || r.best.net > bestEver)) bestEver = r.best.net;
  console.log(
    `scan ${i + 1} @ ${athens(new Date(r.ts))} | SOL $${r.usdcPerSol.toFixed(2)} | network fee $${fmtUsdc(r.networkFeeUsdc)} | ${r.candidates.length} routes | ${r.jupiterCalls} Jupiter calls | ${(r.durationMs / 1000).toFixed(1)}s | no-route/errors ${r.errors.length}`,
  );
  console.log(table(r));
  console.log(
    r.best
      ? `best (exact): ${r.best.pair} ${r.best.sizeUsdc} USDC ${r.best.dexA} -> ${r.best.dexB} net $${fmtUsdc(r.best.net)} ${r.best.net > 0n ? 'PROFITABLE' : '(negative, not tradable)'}`
      : 'no verified candidate this scan',
  );
  console.log(`best net seen so far: $${bestEver === null ? '-' : fmtUsdc(bestEver)}\n`);
  if (i + 1 < count) await new Promise((res) => setTimeout(res, config.scanIntervalMs));
}
