# ULTRA LAB — ROUND 2 BRIEF (2026-11-01 ~14:30 UTC): "how do we make $1 a minute (or per 2, per 5)"

Read BRIEF.md first (rules, read-only bridge access, honesty rules, folders). This round has ONE question from Alex: **find a way to make $1 per minute, or $1 per 2 or 5 minutes ($1,440 / $720 / $288 a day). He believes there is a way: mathematics, code, training and chance. Spend everything. If a way does not exist at some capital, PROVE it with numbers and say what capital and what compounding path would get there.** Hype and unproven claims are worth zero; tested numbers with costs are worth everything.

## What round 1 established (do not redo)
- Memecoin scalping/fast entries: no edge after ~4% round trip (0 of 240 combos positive; random entries -4%; live ~-2%/trade). Our old datasets were SURVIVOR-BIASED: only 2.8% of brand-new pools ever trade (Mara, unfiltered new_pools feed), so every positive "pool-birth" or "slow breakout" result is unproven.
- Round-trip cost is a property of the POOL (Kenji, real Jupiter quotes, 81 pools): pump.fun 2.5% fixed; liquidity >= $100k about 0.5%; > $2M about 0.1%; barely changes with stake from 0.003 to 0.1 SOL. Kenji is now measuring $10-$40 stakes (lab/kenji/REPORT2.md when done).
- Dead ends already measured by Mara: whale copy (-10..-13%), cross-DEX/triangular arb on Jupiter quotes (best +0.046% vs 0.1% fees), majors trend/SMA, relative value vs SOL, pool-birth sniping (we land in 1-3 s), LP/perps not tested properly, time-of-day only tells volatility.
- The only idea with cost far below its gross edge: liquid-alt mean reversion on 1H candles (buy after a 1H close <= -3%, hold 12-24 h): +0.9%/trade out of sample, 0.3% cost, 1-2 signals a day, 34 configs tried, one flat/bear regime: PAPER FIRST.
- Money math (SOL ~$95): profit/min = capital deployed x net edge per trade x trades per min. $1/min at 3 trades/min needs ~$110 in the trade at +0.3% net; at 1 trade/12 h and +0.9% it needs ~$80,000. Alex's wallet today: 0.0074 SOL (~$0.70). He can add money.
- An UNBIASED logger now runs (`tools/autotrader/lab-logger.mjs`): every new pool is logged at birth (births.jsonl, ~29/min), candles fetched at ~70 min for a random 70% (aged.jsonl), in `.claude/skills/gmgn-fib/lab/unbiased/`. First aged rows appear ~15:35 UTC. It will be the honest memecoin dataset.
- The app Ultra can sign Jupiter swaps from Alex's Mac; one wallet; no custom on-chain programs yet (a Rust/Anchor program is possible only if a specialist proves it pays).

## Rules (same as round 1, plus)
- Research only; folder `.claude/skills/gmgn-fib/lab/<your-name>/`; scripts + numbers; failures reported; <=450 words final answer incl. (a) top 3 ideas ranked by NET dollars per day per dollar of capital, with the capital needed for $1/min, $1/2 min, $1/5 min; (b) what is ruled out; (c) files. No wallet access, no swaps, no deploys, no POST to the bridge.
- Always convert to the same units: net % per trade or per day AFTER every cost, trades per day, capital needed for $1 per minute, plus the worst drawdown you saw.
