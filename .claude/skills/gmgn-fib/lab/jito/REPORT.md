# Jito round 2 - searcher/MEV feasibility (2026-11-01)
Data: 350 sampled blocks (~140 s of chain time, ~127k txs, slots 464.126M-464.130M) via public RPC (note: tx version 1 now exists, pass maxSupportedTransactionVersion:1). Scripts: fetch3.py, analyze4.py, liq_an.py, quotes.py. SOL = $95.

## Measured
- Chain: ~900 non-vote tx/s, 32% fail. Swap txs (>=2 swap instructions): 30% FAIL on-chain (fee burnt 0.0685 SOL in 140 s = ~$4.2k/day chain-wide of burnt fees by spammers). Tipped (Jito) txs never fail (bundles are atomic, losers never land); the failures are non-bundle spam bots.
- Cyclic-arb-like txs (>=2 swaps, signer gains only SOL/stable, nothing else changes; 638 tx, 146 signers): median net 0.000025 SOL ($0.002), p90 0.00016 SOL ($0.015), max 0.0077 SOL ($0.73). ZERO txs above $1. 3% above $0.10.
- Whole-chain total of these: 0.037 SOL/min = ~$3.6/min = ~$5k/day, shared by 146 signers. Top1 10%, top5 45%, top10 67%, top20 86%. Top bot: 190 txs in 140 s, 0.0089 SOL net (= $0.006 per tx). Frequency 273/min chain-wide.
- The top 46 repeat bots also made 1,235 failed swap txs: fee 0.0223 SOL vs net 0.0474 SOL, i.e. ~32% of gross profit burnt on lost races.
- Only 32% of arbs carry a Jito tip, median tip 3 lamports (not Jito-dominated; they win by priority fee + position, from validator-adjacent infra).
- CAVEAT: detector only sees profit in the SIGNER's own accounts. Bots using program/PDA-owned vaults are undercounted, so $5k/day is a floor-ish estimate, not a ceiling for the whole market; but no single visible winner makes $1/min.
- Jupiter quotes (lite-api, ONE pass, 19 tokens x $1k/$10k/$100k = 57 round trips A->B->A; the 30-min repeat was not done): ALL negative. Best -0.000% (USDT), SOL -0.004..-0.015%, LSTs -0.01..-0.07%, alts -0.03% .. -81% at size. Nothing positive anywhere. Flash loan fee: Kamino 0.001% (docs, USDC SOL/BTC market; per reserve), so fee is not the blocker; the missing spread is. marginfi/Solend/Jupiter Lend fees: NOT verified (docs fetch had no numbers).
- Flash-loan txs: 40 in 140 s (39 Kamino, 1 marginfi) = ~25k/day, mostly Multiply/deleverage, not arbs.
- Liquidations: 0 Kamino/marginfi liquidations among 61 klend + 7 mfi txs in 140 s. Rate NOT measured (needs hours of sampling); the 50 "Liquidate" hits were other protocols (LiquidateAssets etc, perps). Bonus: per-reserve minLiquidationBonusBps..maxLiquidationBonusBps, protocol takes a % of it, ~1% near insolvency, close factor per market, cap $500k per liquidation (Kamino docs). Exact bonus numbers not read.

## Latency verdict
Winners' fills show up at the top of blocks and via priority fees; at 100-300 ms ping plus 1-3 s landing a Mac is 3-8 slots late. For backrun/cyclic arb the opportunity lives for 1 slot (0.4 s). A Mac cannot win any of them. Even same-slot winners earn $0.002 median.

## Verdicts (per day, newcomer)
1. Cyclic/atomic DEX arb: $0/day. Quotes never cross; observed winners make cents per tx and the top bot ~$0.006/tx; needs colocated validator-adjacent RPC (~$500-2,000/mo) and still loses 30% of attempts. Capital ~0 with flash loans but burn is real. First experiment: none worth money. Free check: log the Jupiter quote loop every 5 s for 24 h on 20 pairs, count any round trip > +0.02%.
2. Backrun/JIT: needs Jito bundle + searcher access (~$0 to apply, hardware/latency not) - closed club in practice; tips were 3 lamports median, so the money is in the infra edge not the idea.
3. Liquidations: only candidate with fat margin per event (bonus %), but event rate unmeasured and contested by bots with account indexers + flash loans. Capital ~0 (flash). First experiment (cheap, read-only): run liq.py-style scan for 6 h on klend/mfi logs and record events/day, bonus realized, who wins and in which slot offset. Only if >20 events/day with >$20 profit and winners not same-slot, write a Rust bot.
Blunt: for $1/min = $1,440/day, this whole visible market's cyclic-arb is ~$5k/day across 146 players. A Mac entrant gets ~0 of it. Not a path to $1/min.
