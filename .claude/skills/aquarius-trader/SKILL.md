---
name: aquarius-trader
description: The one skill that runs Aquarius's trading: whale following, market reading, Fibonacci setups, Time Machine replay, the trader-* skills, the Council and the risk limits, as one always-hunting loop that never sits idle. Use whenever the work touches how Aquarius picks, sizes, takes or learns from a trade.
---
# aquarius-trader (Alex, 2026-11-16: "one skill to manage all of them, but never stuck without trades, always slurping opportunities")

## RULEBOOK v2 (2026-11-18). Alex: "remake clean rules because your old rules suck... you and Grok together."
This replaces every older rule in this file where they disagree (R3 to R7, tiers, EXPLORE, the always-trading recipe). Each rule carries the lesson that backs it (`aquarius-lessons`). Status: written by Claude from 866,559 paper trades; sent to Grok to challenge; NOT yet applied to the paper engine's code.

**WHAT TO BUY**
1. **Buy weakness only.** Entry = a drop of 1 ATR or more in 5 minutes. No breakout, no momentum, no volume-spike entry, ever. (Lesson 1: worst rules on both machines, 100,000 trades. Lesson 7: the dip is the only rule that beat the coin flip all day.)
2. **Only coins that can pay.** Pool $100K or more, pair older than a day, 5-minute ATR 2% or more, safety report clean. A coin moving under 2% cannot clear the cost. (Lessons 3, 5, 9, 13.)
3. **The exact mint, never the name.** Copies share names; drainers ride every active coin. (Lesson 12.)
4. **New pairs are a separate, small lane.** No dips on pairs younger than a day (they lose on both machines). The only entries there are a Fibonacci pullback to the 38.2% or 50% level, or a whale buy, at observation size until 5,000 trades confirm them. (Lessons 14, 15; Grok's ledger.)
5. **X is a veto, not a trigger.** Heat on X did not pay on 36,000 trades. Grok's read can stop a trade (paid wave, clone, drainer, dying story); it never starts one. (Lesson 11.)

**THE COST**
6. **Cost first.** Before any entry, the measured round trip must be under 1% and the coin's ATR at least 4 times the round trip. Otherwise skip. (Lesson 2: before costs both machines were flat; after costs they lost.)

**HOW IT TRADES (Alex, 2026-11-18, overrides rules 7 and 8 below):** "Don't hard code 20 minutes or 10 minutes. You are a replica simulation of a real life human trader, you trade as them just with no emotion. You trade the chart, you Fibonacci it, with validations and data." No clock decides an entry or an exit. Entry: the 50 to 61.8% pullback of a validated up-leg, after a bounce candle. Stop: a 5-minute close below 78.6% (or the swing low). Targets: the leg high (sell half, stop to entry), then 1.272, trail to 1.618. Invalidation: a lower low, a liquidity drop, a Grok veto. Every trade recorded with its leg, levels and how it ended. Untested in the arena (it used fixed holds): it is measured live and on a paper mirror. **Built 2026-11-18** in `tools/mob/src/aq/chart.mjs` (pure functions, tests in `test/chart.test.mjs`), run by `src/aq/live.mjs` for the Aquarius wallet, the paper mirror (`mob_aq_chart_paper`, every candidate) and the Phantom signals. Settled details: the bounce is a CLOSED 5-minute bar that closes up inside 50-61.8%; stop = the closer of 78.6% and the pullback low, minus 0.25 ATR, sold on a 5-minute close; T1 sells half (stop to entry); T2 is judged on the 5-minute bar that touches 1.272 (closes above on rising volume = trail, else sell the rest); in the trail any 5-minute close back under 1.272 sells; a Grok veto is the strict form "VETO <exact mint>" in the last hour; exits ignore the 1% impact cap (entries keep it); a 'stuck' position is still managed every minute and its marked loss counts toward the daily limit. Alex's manual SELL 25/50/ALL and BUY MORE go through the same order path (reason "manual: Alex"); BUY MORE under water asks "Rulebook v2 rule 10: never add to a loser. Buy anyway?" first.

**WHEN TO SELL**
7. **Give it time.** Planned hold 45 minutes. No voluntary exit before 10 minutes. (Lesson 8: the edge grew at every step from 2 to 45 minutes; 2-minute holds lost everywhere.)
8. **One wide stop, no tight bracket.** Stop at 3 ATR under entry, between 6% and 15%. No profit target inside the hold. (Lesson 4: stops fired 2.8 times as often as targets; brackets changed nothing.)
9. **A dead story is an exit.** If Grok shows the narrative died or the coin is a paid wave, sell at the next tick.

**HOW MUCH**
10. **One size, three positions, one per coin.** Size is the limit Alex sets. Never add to a loser.
11. **The daily loss limit switches trading off** and it stays off until Alex turns it on.

**WHAT COUNTS AS TRUE**
12. **Everything is measured against a coin-flip entry** on the same coins in the same minutes. A rule that merely loses less is not a rule.
13. **5,000 trades and a second day** before anything is called a lead; a second machine agreeing before it is called proven. Three "wins" on a few hundred trades reversed in one day. (Lesson 6.)
14. **Every trade is recorded with its facts:** pair age, pool, ATR, holders, what X said, why it was taken, how it ended. A loss with no facts teaches nothing.
15. **Nothing has made money after costs yet.** Real money stays small until rule 13 is met by a rule that is positive after costs. (Lesson 17.)

**EVENT DAYS (GTA 6, 19 Nov)**
16. On a release or news day: the main coin by exact mint only, no copies, no buying the spike, dips only, half size, because no data covers event days.


## The loop (every tick, never idle)
1. **Read the market** (news dept, market square): SOL/BTC trend, Fear and Greed, trending lists (paid boosts = warning), X talk from Grok when connected.
2. **Follow the whales** (always): smart wallets that win steadily (Hyperliquid leaderboard, GMGN smart money, Solana wallets via Helius once the key is in). A buy by 2+ independent winning wallets is the strongest signal. Exclude the coin's creator and insiders (Ultra lesson). Funder clustering: two wallets with one funder count as one.
3. **Gate** (Hecate): RugCheck safety, liquidity, copycats. Fail = out.
4. **Costs**: measured Jupiter round trip. Target must be >= 6x cost.
5. **Setup** (Athena, gmgn-fib): Fibonacci retracement entry 0.382/0.5/0.618, stop under 0.786, target at the swing or 1.272. Stop never larger than target (Ultra lesson: -8.5% stops vs +1.6% wins lost money).
6. **Time Machine** (trader-timemachine): replay the setup on stored candles with costs before it may trade.
7. **Council of Olympus**: PASS or BLOCK with the deciding number. BLOCK cannot be overridden.
8. **Risk** (Zeus, trader-risk): stressed stop loses <= 2% of equity, max 3 open, daily stop -10%, kill switch.
9. **Execution** (Hermes): paper now; live only inside rule-26 caps after paper passes.
10. **Review and learn**: grade every trade, lesson into the brain, strategy scoreboard; rules change only through the tournament (100+ trades, interval above zero).

## Never stuck without trades
When nothing passes the Council, the loop does not stop: it runs a **shadow lane**, paper-only probes on the best near-miss candidates, tagged SHADOW and counted separately. They teach the brain which blocks were right and which cost money. They never touch real money and never mix into the real ledger.

## Skills it commands
gmgn-fib, trader-master and the 11 trader-* skills, recipe (R1-R5, trade math), trading-kb (facts, Ultra lessons), trading-lab (research, five tools), learn-links. Tools: Freqtrade (backtests), skfolio (allocation), Helius (fast Solana data).

## Law
Paper first. No keys in chat. AGENTS rules 18-26. Missing data = NO trade (shadow lane may still record it as unknown).

## Fibonacci order (Alex, 2026-11-16)
When Alex says "Fibonacci": 1) validate the coin first (gate, safety, costs); 2) draw the Fibonacci levels from the CURRENT swing and apply the rules from this point forward; 3) also examine the past (Time Machine replay of the same rules on the stored candles) and show both.

## Speed (Alex asked "why every minute, not every second")
Cloudflare's timer fires at most once a minute, and free APIs block per-second polling. Plan: entries checked every minute on 1-minute candles; exits on open positions every few seconds via a fast loop (Durable Object alarm or the small always-on server) with Helius. Per-second scanning of everything only with the paid fast line and own server, after paper profit.

## ALWAYS TRADING (Alex, 2026-11-16: "you didn't make a trade yet... should make trades all the time... your rules are the problem, but without breaking that... we need something faster... fix your recipe, pass it to the Council")
Zero trades in the first hours was wrong. Rules are hypotheses; paper is where they get tested, not where we wait. The fix, without dropping the lessons Ultra paid for:
1. **Hard blocks (never traded, any mode):** cannot sell (no Jupiter sell route / honeypot), mint or freeze authority still active, liquidity under $20k, stale price, stop larger than target, target under 6x the measured round-trip cost, kill switch, island destroyed.
2. **Soft rules (scored, not vetoes):** LP locked %, top-10 holder %, age, boosts, copycat name, whale presence, sentiment. They change the SIZE and the score, they do not stop a trade alone.
3. **Three tiers of coin:** A established (liquidity >= $500k, older than 7 days): LP-lock and holder rules do not apply, full size. B mid (>= $100k, older than 1 day): normal size. C new launches: smallest size, every hard block plus strict soft rules.
4. **Several strategies at once (each its own scoreboard):** R3 Fibonacci pullback; R5 whale follow; R6 momentum breakout on tier A/B; R7 oversold bounce on tier A. Costs measured on liquid coins are 0.1-0.9%, so 3-6% targets clear the 6x gate.
5. **Paper explores, live exploits.** On paper the Council must take the best-scored candidate at least every few minutes (EXPLORE trades, tagged, small), even when soft rules object. Max 5 open, 1% risk each. Every result updates the soft-rule weights through the tournament: a rule that blocks winners loses weight, a rule that blocks losers gains weight. Live money later uses only what paper proved.
6. Still true: one stop must never erase five wins; no entry without a signal (EXPLORE needs at least one: momentum, pullback, whale or bounce).

## Engine law since the 2026-11-16 audit (settled; code in tools/mob/src/aq, tests in tools/mob/test/aq.test.mjs)
1. **Ledger.** Every money move is ONE SQL statement in `ledger.mjs` (open, half sale, close, rebuild, deposit): claim + trade + cash + flows together. Never read cash, change it in code and write it back. Invariant checked every tick and on every state read: wallet base + realized P&L - open cost = cash (`state.ledger`, `state.health.ledger`). Repair: `scripts/aq-repair-ledger.mjs` (dry run first).
2. **Wallet and size are the CEO's settings** (Alex, 2026-11-16: "10 sol paper first, bigger"): wallet base 10 SOL by a recorded deposit (`scripts/aq-deposit.mjs`, idempotent by id; a deposit is a step in the base, never profit), `position_sol` 2.6 in `mob_aq_state`, EXPLORE-WEAK half, 3 open at most, never over 1% of a pool, cut only by cash / survival / pool. Round trips are quoted at the real size. Not learned results: do not tune them.
3. **Trade only what can pay**: 6x the measured round trip must fit the target AND 3x the coin's ATR5; the verdict carries the numbers. Stop and target are anchored to the fill; a fill outside them is refused; a stop is confirmed against the sell quote; stops are never inside the noise of the hold (ATR5 x sqrt(hold/5)); levels are restated at the entry SOL price.
4. **Off the real ledger until proven**: R6 until its replay with measured cost is positive (30+ trades); R5 until a signal source beats its matched control on 200+ signals (`state.whales.evidence`, sources own / nansen / kolscan, 5/15/30/60 min). They keep firing on the shadow lane. Any strategy whose own replay loses (30+ trades, whole interval under zero) is blocked.
5. **Measuring sticks**: network fee 61,000 lamports a side (measured, `trading-kb/fee-2026-11-16.md`); replays on closed candles with the cost measured per tier and stops filled past the level; shadow probes v2 only (measured cost, the blocked setup's own levels; older probes are legacy and in no number); a soft rule's weight comes only from its own record (objected vs not objected, 10+ each).
6. **Randomised arms, seeded per trade**: exit A plain / B half off at +1R; time L recipe time stop / S flat after 10 minutes. Never pick an arm by counting trades; never let an arm change the stop.
7. **Whale book**: 5+ closed coins seen whole and held over 60 s, 60% won, net positive, then Jupiter `/v1/pnl` scorecard (at most 100 swaps a day, net with open bags above zero). KOLscan names are seeds, not winners.
8. Every parameter change is a `tournament` row in the brain saying who changed it (CEO or evidence). Deploy: run the migration from the container first when the schema changed, then `npx wrangler deploy -c ./wrangler.toml`, then read `aq_state` live.
9. **Council seat (Aquarius Ultimum, 2026-11-16; code `seat.mjs`, contract in `tools/mob/aq/CONTRACT.md`).** Helpers (grok, chatgpt, codex) join through the helper MCP: `aq_council_cases`, `aq_council_vote`, `aq_alert`, `aq_chat_post`, `aq_chat_read`. They never control money. A BUY/SKIP vote is ONE soft rule (`council_seat:<helper>`): +/-10 x confidence x weight, fresh 5 minutes, one live vote per helper per coin. It can lift a partial setup to a normal entry (strength + vote >= 1) or keep a coin out of EXPLORE (net -5 or lower); it never passes a hard block, the cost/ATR gates, cash, slots, the kill switch or survival, and the size stays the CEO's. An EXIT vote is a warning: real sell quote on the next tick, then sold only at effective confidence 0.7+ with the quote under entry; otherwise the time stop moves in (5 or 10 minutes); stop and target never move. An alert is never trusted: the request takes a real sell quote and closes only when the quote-implied price is at or past the position's own stop or target, through the same ledger claim as the tick. Every vote is graded (15 minutes forward against the round-trip cost, or the trade it was part of); a helper's weight comes only from its own graded votes (10+, else 1) times its lane weight, kept in 0.2-3. Trades cut short by an exit vote are left out of the A/B and L/S arm comparisons. War room: `mob_aq_chat`; the sender comes from the sign-in (admin = alex, API token = claude), never from the message.

## TRAINING MODE (Alex, 2026-11-16: "make a switch... 1,000 SOL... 1,000 trades per minute... 2, 3 days... lower the rules... you and Grok together... we don't only go with our recipe and say it's perfect")

### The law of training (Alex, 2026-11-16, said twice, the second time angry that it was forgotten)
> "Progressive learning, liquid like water. Not stable like a rock. You fix on the spot. You notice bugs, you fix on the spot. You never stop working. You take all these trades... every minute you get 700 trades of data. Replicate this, you're gonna have like 1 million trades in 2 days of data, and you're gonna be way smarter. The brain is going to be fed insanely."
- **Final numbers:** 1,000 SOL paper wallet; **700 paper trades a minute**, every minute, 24/7; **0.8 to 1 SOL** a trade; any coin; bad trades welcome ("it's paper money, nobody cares"). About 1 million trades in 2 days.
- **Liquid, not rock:** rules, sizes and strategies change the moment the data says so. Nothing in the recipe is sacred.
- **Fix on the spot:** a bug or a stall is fixed and deployed when it is seen, not queued, not reported and left. A still screen is a bug.
- **Never stops:** the loop runs with or without LLM credits; every minute's trades write lessons into the brain.
- **He must SEE it:** Alex presses the TRAINING MODE button himself (never switch it on for him); the headline shows the 1,000 SOL balance moving up and down, TRADES, WON, LOST and trades a minute in real time.
- **Grok takes his own paper trades** in it; they are logged through the Council and scored beside ours.


A switch Alex turns on (panel + state key `training_mode`). While on, a separate TRAINING ARENA runs next to the normal paper book, with its own 1,000 SOL paper wallet and its own ledger, never mixed into the main stats.
- Volume: thousands of virtual trades per minute. Real prices only (the minute price samples and candles of every tracked coin); costs from the measured round-trip table per tier and size, not one quote per trade (the free APIs cannot quote 1,000 times a minute).
- Lowered rules: every strategy, with a wide grid of settings (entry type, stop, target, hold time, tier, signal strength, whale and Nansen and Grok signals, time of day), plus random entries as the baseline. Only data-quality rules stay (real price exists, pool has liquidity, coin can be sold).
- What it learns: for every setting, the result after costs with its interval, against the random baseline. Every hour the brain writes which settings beat random and which rules cost money.
- Honesty rule: with thousands of settings some win by luck. A setting only graduates to the main paper book after it also wins on FRESH data it was not picked on (walk-forward), and the brain says how many settings were tried.
- Grok joins: his picks, votes and X narratives are inputs in the arena, scored the same way.

### Training arena as built (2026-11-16; code `tools/mob/src/aq/arena.mjs`, tables `mob_aq_arena_*`)
- Switch: state key `training_mode`; `POST /api/aq/training {on}` with Alex's admin session, or the helper access code (header `x-aq-helper-key`) with `helper:"claude"`. Nobody else, no helper tool. `state.training` shows it.
- Runs after the main tick, outside its lock and its ledger. Up to 150 tracked coins, ONE real Jupiter price sample a minute each (no high/low inside the minute), 90-minute ring per coin. A coin needs 25 minutes of samples plus the hold before its first trade.
- No open virtual trades are stored: at minute T every trade that entered at T-hold is resolved; the entry reads samples up to its minute only.
- Grid: entry (random baseline, mom1/mom2, rev1/rev2, brk, brkpb, r3/r6/r7 recipe entries, whale, nansen, grok_pick, grok_vote, grok_skip, grok_heat) x stop 1/2/3 ATR5 x reward:risk 1.5/3 x hold 2/5/10/20/45 min, per liquidity tier (A/B/C by liquidity only), time-of-day and regime kept as buckets. 1 SOL a trade from a 1,000 SOL wallet. Volume-spike entries are NOT built: there is no per-minute volume in the free price feed.
- Costs: one real Jupiter round trip a minute on a rotating coin (1 SOL and 5 SOL in turn) -> median per tier; stops fill at the crossing sample, never better than the measured overshoot.
- Stored: totals per setting per day (35 days), 20 sample trades per setting, 7 days of cost quotes. Not one row per trade.
- Honesty: hourly brain row (kind `arena`) with top and bottom against random and the count tried; walk-forward once a day: picked on day N (edge over random above zero, 300+ trades, positive after costs, 20 at most), graduated only if the same holds on day N+1. A graduate is a `tournament` row proposing a challenger; nothing in the main book switches by itself. Trades in the same minute move together, so the intervals are too narrow: only the fresh-day repeat counts.


## Settled 2026-11-18 (Alex, via the coordinator)
- **Real money first on /aq.** Top of the page: REAL BALANCE = Aquarius wallet SOL + Phantom SOL (both on-chain) + marked open live positions; real P&L today and total; real open count (`aq/real.js`). Then the reactor, then **three live-trade slots, always shown** (empty = "waiting for a setup" + last refusal); each filled slot is a chart with entry/stop/T1/T2 lines, P&L, SELL 25/50/ALL and BUY MORE. The CONTROL STACK beside the reactor is real money only (balance, real trades in Athens time, P&L, win rate, fees, daily loss used vs limit, slots, auto trade). Every paper number is smaller, amber, tagged PAPER; paper council/survival/feeds live in the PAPER CONTROL panel below.
- **Reactor = a neuron nebula** (variant A, `?nv=b|c` shows the others): somas, forked dendrites, curved axons, a soft nebula cloud. Spikes run along axons and synapses flash ONLY on real events (verdict tickets, flows, department runs).
- **RIGHT-CALL RULE:** the live trader and the Phantom signals may only take a coin in `mob_aq_sym_right` with status `candidate` (a symbiote right call that passed its deep checks), and then every chart and live gate. No right call = refusal `no_right_call`. Code: `rightCalls()` in `src/aq/live.mjs` (`scanFib`), test in `test/live.test.mjs`. Auto trade stays OFF until symbiote is live and feeding.
- **A right call must be a HEALTHY coin** (to build with symbiote): holders (top-10 share excluding the curve/pool, dev share and whether the dev sold, holder growth), snipers/bundles (first-block share, same-funder wallets), organic flow (unique buyers, buy/sell mix, trade-size spread, no wash cycling), liquidity vs market cap, mint/freeze authority, RugCheck, socials, Grok research and no veto. Explodes but fails = logged "fake pump" (it teaches the brain too).
- **PumpPortal, read live 2026-11-18:** `wss://pumpportal.fun/api/data` `subscribeNewToken` works with NO key (about 9-10 launches a minute observed, so about 13-14k a day). `subscribeTokenTrade` answers: "only available when connecting with an API key funded with at least 0.02 SOL". Without trades there is no price after launch, so symbiote cannot paper-trade every coin. It needs that key (asked through the secure form, never in chat).

## GTA 6 is permanent (Alex, 2026-11-18)
The GTA 6 coin hunt and research never stop, even after release day. Symbiote watches every GTA-themed launch and Grok researches GTA on X every day.

## Machine mistakes become pain (Alex, 2026-11-18)
Every mistake the trading machine makes (a losing trade, a stop-out, a fake pump it took, a gate that let a bad coin through, a stuck sell) is written to the brain as a PAIN row: what happened, the numbers, and which rule or instinct should have caught it. The instinct layer reads these rows so the same pain is never taken twice. Agent mistakes are different: they cost HP (see alexander-c2o).
