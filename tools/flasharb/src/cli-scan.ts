// npm run scan              -> scans forever, every SCAN_INTERVAL_MS
// npm run scan -- --count 3 -> 3 scans then exit
import { config } from './config.ts';
import { athens, describe, setup, table } from './common.ts';
import { fmtUsdc } from './math.ts';
import { logScan, scan } from './scanner.ts';

const ci = process.argv.indexOf('--count');
const count = ci > 0 ? Number(process.argv[ci + 1]) : Infinity;

const { jup, kamino, tokens } = await setup();
console.log(
  `Kamino ${kamino.marketName} ${kamino.marketAddress} | USDC reserve ${kamino.reserveAddress} | flash fee ${(kamino.flashLoanFeeRate * 100).toFixed(4)}% | available ${fmtUsdc(kamino.availableLiquidity)} USDC`,
);
console.log(
  `tokens (live, verified, liquidity >= $${config.minTokenLiquidityUsd.toLocaleString('en-US')}): ${tokens.map((t) => `${t.symbol} $${((t.liquidityUsd ?? 0) / 1e6).toFixed(1)}M`).join(', ')}`,
);
console.log(`headline size ${config.tradeSizeUsdc} USDC | all sizes ${config.sizesUsdc.join(',')} | dexes ${config.dexes.length ? config.dexes.join(', ') : 'discovered live per token'}`);
console.log(`log -> ${config.logPath}\n`);

let bestEver: bigint | null = null;
for (let i = 0; i < count; i++) {
  const r = await scan({ jup, cfg: config, flashLoanFeeSf: kamino.flashLoanFeeSf, availableLiquidity: kamino.availableLiquidity, tokens });
  logScan(config.logPath, r);
  if (r.bestAtTradeSize && (bestEver === null || r.bestAtTradeSize.net > bestEver)) bestEver = r.bestAtTradeSize.net;
  console.log(
    `scan ${i + 1} @ ${athens(new Date(r.ts))} | SOL $${r.usdcPerSol.toFixed(2)} | network fee $${(Number(r.networkFeeUsdc) / 1e6).toFixed(4)} | ${r.candidates.length} routes | ${r.jupiterCalls} Jupiter calls | ${(r.durationMs / 1000).toFixed(1)}s | no-route/errors ${r.errors.length}`,
  );
  console.log('dexes: ' + Object.entries(r.dexesUsed).map(([k, v]) => `${k}[${v.join('|')}]`).join(' '));
  console.log(`HEADLINE ${config.tradeSizeUsdc} USDC -> ${describe(r.bestAtTradeSize)}`);
  console.log(table(r.candidates.filter((c) => c.sizeUsdc === config.tradeSizeUsdc), 8));
  console.log(`comparison sizes:`);
  console.log(table(r.candidates.filter((c) => c.sizeUsdc !== config.tradeSizeUsdc), 6));
  console.log(`best any size: ${describe(r.best)}`);
  console.log(`best ${config.tradeSizeUsdc} USDC net seen so far: $${bestEver === null ? '-' : fmtUsdc(bestEver)}\n`);
  if (i + 1 < count) await new Promise((res) => setTimeout(res, config.scanIntervalMs));
}
