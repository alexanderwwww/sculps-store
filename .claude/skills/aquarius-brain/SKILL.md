---
name: aquarius-brain
description: The Aquarius brain. What the training arena's mass paper trades have taught so far (the knowledge), how the bot behaves because of it (the character), and the list of fixes found but not yet applied. Use whenever the work touches what the bot has learned, the training data, "the brain", lessons, or changing a trading rule because of data.
---
# aquarius-brain

Alex, 2026-11-17, once the arena reached 700 paper trades a minute: "Now we're gonna build the brain, the knowledge, the behavior, the character of it from massive data... gather all the information, keep notes, find potential fixes, don't apply them yet. Or you can apply them. So now you're gonna build crazy skills about it."

The law of training is in `aquarius-trader` (liquid like water, fix on the spot, 700 a minute, 0.8 to 1 SOL, 1,000 SOL paper). This skill is what that training has produced.

## What the arena is for (Alex, 2026-11-17)
> "It is meant to lose. We collect data. We are not trying to win. It is impossible to have all this SOL and be up if you trade so fast. Collecting data is a different type of process. You still try to win, but you get what I mean."
- The training wallet falling is the price of the data, not a failure. Never report it to him as a problem.
- What counts is what each rule did against a coin-flip entry, and what that teaches. Still raise the win rate where the data shows how.

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

## Learn from pain (Alex, 2026-11-17)
> "Any trade you take is a lesson... We get hurt right now, so we never do it again. We learn from pain. Why did I lose this coin? What was the holders? What was everything? And through pattern, you are learning."
- Every losing trade is asked WHY, with the coin's facts at entry: holders and top-holder share, pool size, age, volume, where in the move the entry was, what X said, the hour, the market mood.
- The answer is a pattern across many losers, never a story about one. The pattern becomes a rule the bot refuses next time.
- NOT BUILT YET: the arena keeps counts per rule and tier, not the coin facts of each loss. Fix 8 below.

## Fibonacci, as observation (Alex, 2026-11-17: "apply the Fibonacci rules there, even as observation, this is going to give us some nice weapon")
Live in the arena since 2026-11-17 01:30 Athens: entries `fib382`, `fib50`, `fib618` (golden pocket), `fib786` = the price sitting in that retracement band of the last up-leg (lowest low of the 45-minute window, then the highest high after it, leg at least 2x ATR). Observation only: they trade on paper in the arena and are compared with random. First numbers at the next read.

## Fixes found, NOT applied yet
1. Drop coins that do not move (stablecoins, ATR under the round-trip cost) from the training list, so trades are spent on coins that can teach something.
2. Add a "fade" rule: sell-side mirror of momentum is impossible on spot, so instead test "wait for the pullback after a breakout fails" and "buy the dip only when the 1-hour trend is up".
3. Give the dip rules more settings (depth 1.5 and 3 ATR, bounce confirmation candle) since they are the only family above random.
4. Brackets scaled to the coin's ATR instead of fixed 1/2/3%, since fixed brackets made no difference.
5. On the main paper bot: keep R6 breakout off, keep R7; do not raise thin-coin size.
6. Score Grok's heat as a warning signal (it lost more than random) until 1,000+ trades say otherwise.
8. Pain log: store the coin facts at entry for a sample of losing and winning trades each minute (holders, top-10 share, liquidity, age, volume, distance from the high, Grok heat), then mine which facts separate losers from winners.
7. Record the hour of day properly (the report shows one bucket) so time-of-day lessons become possible.

## Log
- 2026-11-17 01:20: first read, 16,800 trades. Skill created.
- 2026-11-17 01:50: FIX 1 APPLIED (Alex: "as you fix, try to raise your winning rate... observe and write and feed the brain"): coins whose 5-minute ATR is under 0.5% no longer trade in the arena. First three batches after it: 652 wins in 2,101 trades = 31.0% (was 12.7% before). HINT only: three minutes, one market hour. Still 700 a minute. Whether the average result per trade improved, not just the win rate, is for the next report read.
- 2026-11-17 01:50: Grok asked (Alex's order) to run his own 700-a-minute paper data collection on his xAI machine and post aggregated lessons into the brain. He needs Alex's confirmation in his own chat.

### Read 2: 2026-11-17 02:24 Athens, 58,802 trades (still one day: nothing here is KNOWLEDGE yet)
- **Fibonacci pullbacks are the first rules in the green after costs.** fib786 +0.23% a trade (1,182, 30.1% wins), fib618 +0.09% (1,919), fib50 +0.03% (2,188), recipe r3 +0.51% (608, 52.3% wins). fib382 loses like random (-0.50%, 3,107): a shallow pullback is not a dip. The deeper the pullback, the better the result. LEAD (under an hour of data, one market mood).
- **The Fibonacci edge is on the thinner pools (tier B):** r3 +0.91% (487), fib786 +0.65% (789), fib618 +0.36% (1,447), fib50 +0.28% (1,483). This contradicts read 1's "thin coins cost double" for this family: thin coins cost more AND move more, so a good entry is paid better there.
- **Random is now -0.54% a trade (13,594)**, total win rate 18.0% (was 12.7%) after fix 1 dropped coins that do not move.
- **Held from read 1:** momentum and breakouts are below random (mom1 -0.70, brk -0.75, mom2 -0.69). rev1 beats random (-0.30 vs -0.54) but does not make money.
- **Flipped from read 1:** r7 was +0.51% on 107 trades and is -0.67% on 549. That is what a HINT is worth. brkpb went from worst (-1.16) to near flat (-0.22, 1,009).
- **Stops:** wider is slightly better (s1 -0.55, s2 -0.48, s3 -0.47). Tight stops get hit by noise.
- **Fresh minutes are worse than replay** (-0.73% in "extreme fear" on 17,789 fresh trades vs -0.40% on replay): tonight's market is harder than the last days, or replay flatters. Trust fresh.
- **Grok heat still loses** (-1.19%, 1,205).
- **Grok's own arena (his machine, reported 02:22, 4,429 trades):** his best is "xorg" = X heat from organic authors only, +0.72% above his random on 193 trades (HINT). His dips LOSE on new and thin pairs (newdip -3.98% a trade on 176). His costs run harsher (random -1.83%). His challenge: the dip edge is for established pools, not new pairs. Our Fibonacci result is on established 45-minute structure, so both can be true: test age as a split.
- **Generic drainer spam** ("dev stream happening now… CA:") rides every active coin: weight zero, not a signal (Grok, corrected by himself).

New fixes found, not applied:
9. Split every result by coin age (new pair vs established) to settle Grok's challenge.
10. Fibonacci variants to add: require the leg to be 3x and 4x ATR; require a green minute off the level (bounce confirmation); a 88.6% band.
11. When Fibonacci holds on a second day: move fib618/fib786 on tier B into the main paper bot as the first graduated rule.
12. Feed Grok's "organic authors only" heat into our arena as its own entry (xorg) instead of raw heat.

- 2026-11-17 02:24: read 2 written. Grok's machine is live and reporting into the panel window.

### Read 3: 2026-11-17 04:20 Athens, 136,502 trades (two calendar days in the data, but one continuous night: still not KNOWLEDGE)
- **The Fibonacci lead from read 2 did NOT hold.** With 3 to 5 times the trades: fib786 -1.54% a trade (4,072; was +0.23% on 1,182), fib618 -0.52% (6,197; was +0.09%), recipe r3 -1.07% (1,184; was +0.51%). On fresh minutes only, the deep bands on thin pools are the least bad of the family (fib786 tier B -0.14% on 892, fib618 tier B -0.19% on 1,682) but they do not make money. Lesson about the brain itself: a result on about 1,000 trades in one hour flipped sign. The LEAD bar is raised to 5,000 trades.
- **What held on both days, fresh minutes only:** buying a 1 ATR dip (rev1) beats random: -0.28% vs -0.72% on 11-16 (5,029 trades), +0.04% vs -0.53% on 11-17 (1,702). It is the only rule above random on both days. It breaks even at best: an edge over random of about 0.45 to 0.55 points, almost exactly the cost.
- **What held, the other way:** breakout and momentum lose more than random on both days (brk -0.82 and -0.98; mom1 -0.69 and -0.84). Chasing strength is the most reliable loser in the data.
- **Random is -0.51% a trade (31,326).** Overall win rate 23.0% (12.7% in read 1, 18.0% in read 2).
- **Replay disagrees with fresh on Fibonacci** (replay fib786 -2.34%, fresh -0.30% blended): replay uses today's costs and liquidity tier on older minutes. Fresh is the one to trust; replay is for volume, not for verdicts.
- **grok_pick: 50 trades, 84% wins, +1.49% a trade.** Far too few (HINT), but it is the only positive line and it is Grok's own picks: watch it.
- **Grok heat improved to 37.6% wins but still -0.75% a trade (3,380).**

Fix list changes: fix 11 (graduate Fibonacci) is WITHDRAWN. New:
13. Mine rev1: it is the one rule that survives. Split it by dip depth, by tier, by hold, by whether the hour trend is up, to find the part that clears the cost.
14. Cost is the wall (0.5% a round trip eats the whole rev1 edge): test rev1 with a limit-style entry (enter only if the next minute trades lower) to cut the entry cost.
15. Report fresh and replay separately everywhere (panel and report), verdicts on fresh only.
- 2026-11-17 04:20: read 3 written. Read 2's Fibonacci claim corrected.

### Read 3b: 2026-11-17 04:50 Athens, fix 13 (mining the dip rule), fresh minutes only (56,604 fresh trades; rev1 7,771)
- **The dip edge lives on the smaller pools with a 10 to 20 minute hold.** rev1 on tier B: -0.10% a trade at 10 min (975) and -0.12% at 20 min (1,000), where random on the same pools and holds loses -0.68% and -0.90%. That is an edge of 0.6 to 0.8 points over random. On tier A the edge is only 0.1 to 0.3 points (rev1 about -0.24 to -0.31, random -0.36 to -0.59).
- **Still not profitable:** the best cell loses 0.10% a trade. The edge is real against random and still smaller than the round-trip cost.
- **Brackets barely matter for the dip:** best is the wide stop with the near target (s3 r1.5, -0.13%, 1,306); worst the tight stop with the far target (s1 r3, -0.29%, 1,313).
- **2 minutes is too short everywhere** (win rate 11 to 21%): a trade needs time to cover its cost. 45 minutes gives the edge back on thin pools.
- Each cell is 500 to 1,000 trades: HINT. Next: a deeper dip between 1 and 2 ATR, the hour-trend filter, and the cheaper entry of fix 14, all on tier B at 10 to 20 minutes.
