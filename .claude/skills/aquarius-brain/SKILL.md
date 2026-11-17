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

## The study (Alex, 2026-11-17 05:50 Athens): WAIT FOR HIS WORD
> "You have a lot of trades now. Tomorrow, when I will tell you, you will do one giant spectrogram of what happened exactly, and we're gonna measure it. But that is just one thing. You're gonna do a lot of things with the results. This is our study. Both you and Grok will study that at the end."
- Do NOT build the spectrogram until he says so. When he does: one giant picture of the whole run (time across, rules and coins down, colour = result against random), built from the arena tables, then measured together.
- It is the first of many studies on the same data. Grok studies it too, from his own arena and the X side.
- Until then: keep the data flowing and intact (no table resets, no retention that drops per-rule, per-hour detail before the study).

### Read 4: 2026-11-17 06:22 Athens, 210,082 trades (78,225 on fresh minutes)
- **The dip rule holds, and now on 10,000+ fresh trades:** rev1 -0.20% a trade (10,087) against random -0.59% (18,626). On 11-17 alone: -0.11% (4,991) against -0.48% (9,878). Edge about 0.37 to 0.39 points on both days. This is the first LEAD under the 5,000-trade bar. Still below cost.
- **Deeper dips look better on the new day:** rev2 (2 ATR) -0.05% on 579 fresh trades of 11-17, win rate 39%. HINT.
- **Best cell so far:** rev1, smaller pools, 10-minute hold: -0.09% (1,296) against random -0.72% on the same pools and hold. Edge 0.63 points.
- **Chasing strength stays the worst on fresh minutes:** mom1 -0.82% (8,742), brk -0.84% (8,707), mom2 -1.01% (1,191). LEAD in the other direction: never buy the breakout.
- **Fibonacci on fresh minutes sits between the dip and random** (fib618 -0.35% on 3,790, fib786 -0.40% on 2,538, random -0.59%). Better than random by about 0.2 points, worse than a plain dip. So read 2 overstated it and read 3 (which mixed replay in) understated it: verdicts on fresh only.
- **grok_pick has no fresh trades yet**; its 50 trades were replay. Unproven.
- **Grok's machine FREEZES between his sweeps** (his own finding, 06:16): every process on his xAI box goes silent at once and resumes when his next sweep wakes it. His arena and main lane only run while he is awake. No watchdog on the box can fix that. His totals stay cumulative (96,452 trades at 06:20). His xearly rule: +0.69 points over his random on 868 trades.
- Overall fresh win rate 23.0%; random -0.59%.

Fix list: 16. Add rev15 and rev3 (1.5 and 3 ATR dips) and an hour-trend-up filter to the arena, since the dip family is the only one that holds. 17. Grok's box needs a wake-up from outside to run between sweeps (a scheduled ping from his side, or Alex's bot settings); until then his panel block moves in bursts.
- 2026-11-17 06:22: read 4 written.

### Read 5: 2026-11-17 08:52 Athens, 112,329 fresh trades (verdicts on fresh only)
- **Stable across three reads:** rev1 -0.22% a trade (13,307) against random -0.59% (25,340). Edge 0.37 points, unchanged from read 4. It holds in both time blocks of the data (edge 0.35 and 0.43 points).
- **Where the dip edge is:** smaller pools, 0.54 points over random (rev1 B -0.25 vs random B -0.78, 8,793 trades). On deep pools only 0.15 points (rev1 A -0.17 vs random A -0.32, 4,514). Deep pools lose less in absolute terms; thin pools give the rule more to work with.
- **rev2 (2 ATR dip) only works on thin pools:** B -0.13% (1,453), A -0.56% (356). HINT.
- **Order of the families is now steady:** dips > Fibonacci pullbacks and breakout-pullback (about -0.33 to -0.50) > random (-0.59) > recipe breakout, volume spike, bounce (-0.62 to -0.69) > breakout, momentum (-0.85 to -1.15).
- **Nothing is profitable after costs.** The best rule still loses 0.2% a trade. The data so far says what NOT to do with high confidence (do not chase), and where to look next (dips on smaller pools, cheaper entries).
- 2026-11-17 08:52: read 5 written.

### Read 6: 2026-11-17 11:50 Athens, 151,290 fresh trades
- **rev1 keeps its edge on 17,417 fresh trades:** tier B -0.20% (11,418) against random B -0.75% (19,266), edge 0.55 points; tier A -0.19% (5,999) against random A -0.33%, edge 0.14.
- **First numbers on the new dip rules (two hours, all HINTS):** the dip taken while the 40-minute trend is up (revup) on thin pools is +0.20% a trade on 404 trades, the only positive cell in the fresh data. On deep pools -0.25% (240). The 1.5x dip is -0.49% on thin pools (500) and the 3x dip -1.14% (46): deeper is not better.
- Remember read 2: a positive cell on a few hundred trades flipped. revup needs 5,000 before it is a lead.
- 2026-11-17 11:50: read 6 written.

### Read 7: 2026-11-17 13:50 Athens (fresh trades)
- **The read-6 hint flipped, as warned:** revup on thin pools went from +0.20% (404 trades) to -0.41% (780). A dip in an up-trend is no better than a plain dip. Second time a positive cell on a few hundred trades reversed: the 5,000-trade bar stands.
- **rev1 unchanged on 20,984 fresh trades:** tier B -0.21% (13,453) vs random B -0.79% (22,525), edge 0.58 points; tier A -0.17% (7,531) vs random A -0.29%, edge 0.12.
- New small cell to watch, not to believe: 1.5x dip on deep pools +0.05% (608).
- 2026-11-17 13:50: read 7 written.

### Read 8: 2026-11-17 16:50 Athens (fresh trades, about 230,000)
- **The dip family is now flat across depths:** rev1 -0.16% (26,102), rev15 -0.16% (3,023), revup -0.17% (2,578), rev2 -0.23% (2,934), against random -0.53% (49,990). Depth and the up-trend filter add nothing over a plain 1 ATR dip.
- **Hold time is the lever inside the dip rule (thin pools, each cell 3,200+ trades):** 2 min -0.31%, 5 min -0.18%, 10 min -0.13%, 20 min -0.11%, 45 min -0.05% with 42.4% wins. The longer the hold, the closer to break-even; random gets WORSE with a longer hold on the same pools (-0.64% to -0.83%). Edge over random at 45 minutes: 0.78 points. LEAD (cells are 3,000+, not yet 5,000).
- **The main paper bot shows the same thing from the other side:** its last 10 closes were all time stops, -1.02 SOL together. It exits on the clock before a dip has time to pay.
- Family order unchanged for the fifth read: dips > Fibonacci pullbacks > random > recipe breakout and volume spike > breakout and momentum (-0.78% to -0.96%).

Fix list: 18. Test longer holds for dips in the arena: 60, 90 and 120 minutes (the trend from 2 to 45 minutes has not flattened). 19. Main paper bot: its time stop is the likely leak; when the 45-minute cell passes 5,000 trades and holds, lengthen the paper bot's time stop for R7 dips. NOT applied.
- 2026-11-17 16:50: read 8 written.

## The run is over (2026-11-17 18:17 Athens): final record
- Alex stopped the training at 18:10 ("enough with the training trades... collect all the history"). Aquarius: 664,164 trades, 175,484 won (26.4%), wallet 8,485.84 of 12,000 SOL; 256,687 on live minutes, 407,477 replayed. Grok: 202,395 closed, 38,021 won (18.8%), frozen on his machine at state/archive/arena_final_20261117T1630Z/ (405,995 ledger rows, one row per trade, 1,200 left open).
- Frozen export: `tools/mob/data/arena-study/aquarius-arena-2026-11-17.json.gz` (rebuild with `scripts/aq-arena-export.mjs`). We kept totals per rule plus 13,511 sample trades, not a row per trade. Next run: keep a row per trade like Grok does.
- Study 1, the spectrogram (Alex said "Generate" at 18:30): `tools/mob/data/arena-study/spectrogram.png` and `.html`, built by `scripts/aq-spectrogram.mjs`.
- Final table, live minutes only, edge over the coin flip in points of % per trade: dip in up-trend +0.42 (3,155), dip 1.5x +0.40 (3,709), dip 2x +0.36 (3,118), dip 1x +0.35 (28,519), fib 78.6 +0.23 (8,320), breakout pullback +0.19, fib 61.8 +0.16, fib 38.2 +0.14, fib 50 +0.06, recipe bounce +0.01, COIN FLIP -0.514% a trade (56,173), Grok heat -0.04, recipe breakout -0.06, volume spike -0.14, breakout -0.25 (32,074), momentum 1x -0.37 (30,574), momentum 2x -0.46, recipe Fibonacci -0.55.
- Dip 1x by hold: +0.21 (2 min), +0.33, +0.33, +0.44, +0.46 (45 min). By pool: +0.08 on $500K+ pools, +0.57 on $100K to $500K.
- Nothing was profitable after costs. Best average: -0.09% a trade.
- Still to study when Alex says: Grok's per-trade ledger (pair age, X facts at entry), the pain log, longer holds, a cheaper entry.

### Study 2 (2026-11-17 20:50 Athens): the 13,511 individual sample trades, offline from the frozen export
- **82% of trades end on the clock** (11,137 of 13,511), 13% on the stop, 5% on the target. A time exit averages -0.32% net; a stop -2.79%; a target +2.78%. Stops outnumber targets 2.8 to 1, so the bracket loses money on its own before any rule is applied.
- **Average cost per trade: 0.47%.** Gross (before cost) the samples are about flat: the whole loss is the cost.
- **How much the coin moves decides whether a dip pays.** Dip 1x by the coin's 5-minute ATR: under 1% -0.26% net (667 trades); 1 to 2% -0.22% (289); **2 to 4% +0.30% (141); 4 to 8% +2.25% (43)**. The coin flip on the same buckets: -0.37, -0.74, -0.62, -0.88. So the dip's edge grows with volatility, and above 2% ATR it was profitable after costs. HINT only: 184 trades in the two profitable buckets.
- **Over half the samples (7,259) were on coins moving under 1% in 5 minutes**, where nothing can clear a 0.47% cost. Fix 1 cut the dead coins at 0.5%; the data says the cut should be nearer 2%.
- **By coin (60+ samples):** best VTC +1.03%, BP +0.82%, GTA6 +0.75% (348 samples), BLOB +0.59%; worst ROCCO -6.47% (71), GATO -1.73%, WASTED -1.48%, MASK -1.39%, ZCAT -1.15%. 69 coins have 60+ samples out of 142.

Fix list: 20. Next training run: trade only coins with 5-minute ATR of 2% and more, and give the dip rule most of the volume there, so the +0.30% and +2.25% cells get to 5,000 trades. 21. Replace fixed brackets with no stop inside the hold for dips (stops fire 2.8 times as often as targets) and test it against the bracket.
