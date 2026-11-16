---
name: aquarius-brain
description: The Aquarius brain. What the training arena's mass paper trades have taught so far (the knowledge), how the bot behaves because of it (the character), and the list of fixes found but not yet applied. Use whenever the work touches what the bot has learned, the training data, "the brain", lessons, or changing a trading rule because of data.
---
# aquarius-brain

Alex, 2026-11-17, once the arena reached 700 paper trades a minute: "Now we're gonna build the brain, the knowledge, the behavior, the character of it from massive data... gather all the information, keep notes, find potential fixes, don't apply them yet. Or you can apply them. So now you're gonna build crazy skills about it."

The law of training is in `aquarius-trader` (liquid like water, fix on the spot, 700 a minute, 0.8 to 1 SOL, 1,000 SOL paper). This skill is what that training has produced.

## How to read the data (do this before writing any lesson)
`DATABASE_URL=... node tools/mob/scripts/aq-brain-report.mjs` (read-only). It cuts every virtual trade by entry rule, tier, stop, target, hold, regime and day. Never write a lesson from memory or from the panel: run the report, copy the numbers, date them.

## Rules for a lesson
1. Every lesson carries its count and date. Under 1,000 trades it is a HINT. 1,000+ on one day is a LEAD. The same result on two different days is KNOWLEDGE.
2. Everything is compared with `random` (same coins, same minutes, coin-flip entry). A rule is only good if it beats random, not if it merely loses.
3. Replay trades use today's costs on past minutes. Fresh-day trades outrank replay.
4. A fix goes in the list below with the number that suggests it. It is applied to the paper bot only when it is KNOWLEDGE, or when Alex says apply.

## Knowledge so far
### Read 1: 2026-11-17 01:20 Athens, 16,800 trades (one evening, 87% replay: everything here is a LEAD at best)
Average result per trade, as % of the trade, with the win rate:
| Entry rule | Trades | Win | Avg |
|---|---|---|---|
| r7 recipe mean reversion | 107 | 43.0% | +0.51% |
| rev1 dip of 1 ATR | 2,465 | 25.4% | -0.22% |
| rev2 dip of 2 ATR | 391 | 18.9% | -0.32% |
| volume spike | 1,538 | 6.9% | -0.52% |
| **random (the baseline)** | 4,718 | 14.5% | **-0.63%** |
| breakout | 2,908 | 8.1% | -0.64% |
| momentum 2 ATR | 575 | 6.3% | -0.72% |
| momentum 1 ATR | 2,736 | 7.3% | -0.77% |
| r6 recipe breakout | 591 | 6.9% | -0.77% |
| breakout then pullback | 313 | 8.6% | -1.16% |
| Grok heat | 287 | 8.0% | -2.04% |
| r3 Fibonacci | 171 | 19.9% | -2.37% |

- **Buying dips beats buying strength.** Every dip rule beats random; every momentum and breakout rule is at or below random. Buying the green candle is buying the top. (LEAD; it matches the 2026-11-16 audit of the real paper book.)
- **Random loses 0.63% a trade: that is the cost floor.** Measured round trip at 1 SOL is about 0.50% on tier A and 0.53% on tier B. A rule has to find a move bigger than that before it earns anything.
- **Thin coins cost double.** Tier B (pool under $500K) loses 0.89% a trade against 0.39% on tier A. Random on B is -1.02%.
- **Stop width and target ratio change nothing** (1%, 2%, 3% stops all about -0.63%; 1.5x and 3x targets the same). Most trades end on the clock, so the entry and the coin decide the result, not the bracket.
- **Holding longer wins more often and loses more money**, worst on thin coins (B at 45 minutes: -1.33%).
- **Only 12.7% of trades win.** Most coins do not move enough inside the hold to cover the cost. The list holds coins that barely move (a stablecoin, USD1, was on the tape).
- **Grok heat (-2.04%, 287) and Fibonacci r3 (-2.37%, 171) are the two worst.** Both are HINTS only: too few trades.

## Character (how the bot behaves because of the above)
- Patient buyer of weakness, never a chaser of green candles.
- Counts the cost before the idea: no expected move above the round trip, no trade.
- Prefers deep pools; treats a thin pool as expensive, not as exciting.
- Believes nothing from one evening. Says the count and the date with every claim.
- Loses on paper on purpose, and writes down why.

## Fixes found, NOT applied yet
1. Drop coins that do not move (stablecoins, ATR under the round-trip cost) from the training list, so trades are spent on coins that can teach something.
2. Add a "fade" rule: sell-side mirror of momentum is impossible on spot, so instead test "wait for the pullback after a breakout fails" and "buy the dip only when the 1-hour trend is up".
3. Give the dip rules more settings (depth 1.5 and 3 ATR, bounce confirmation candle) since they are the only family above random.
4. Brackets scaled to the coin's ATR instead of fixed 1/2/3%, since fixed brackets made no difference.
5. On the main paper bot: keep R6 breakout off, keep R7; do not raise thin-coin size.
6. Score Grok's heat as a warning signal (it lost more than random) until 1,000+ trades say otherwise.
7. Record the hour of day properly (the report shows one bucket) so time-of-day lessons become possible.

## Log
- 2026-11-17 01:20: first read, 16,800 trades. Skill created.
