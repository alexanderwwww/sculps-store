---
name: aquarius-trader
description: The one skill that runs Aquarius's trading: whale following, market reading, Fibonacci setups, Time Machine replay, the trader-* skills, the Council and the risk limits, as one always-hunting loop that never sits idle. Use whenever the work touches how Aquarius picks, sizes, takes or learns from a trade.
---
# aquarius-trader (Alex, 2026-11-16: "one skill to manage all of them, but never stuck without trades, always slurping opportunities")

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
