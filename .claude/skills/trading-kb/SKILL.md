---
name: trading-kb
description: The central trading knowledge base. One map of everything Alex has built, learned and tested in trading (Ultra live trader and its 117 builds, the paper Sniper/symbiot lanes, gmgn-fib, the 11 trader-* skills and Time Machine, trading-lab research, the recipe, reels and repos, free data sources, measured costs), with results, what failed and why, and what is still untested. Start here for any trading question; it points to the detailed skill or file.
---
# trading-kb: the central trading knowledge (compiled 2026-11-16, from the repo only; nothing invented)

## 0. One-paragraph state of the world
We have built a lot and proven little. Ultra (live, real SOL) reached 117 builds; its only recorded live result is a loss (0.0622 SOL in, 0.0319 SOL out on 2026-11-07, partly caused by sell bugs); its only statistics file is a 17-trade backtest that is a coin flip once ~5% round-trip costs are counted. The tools and ideas are real; a net-of-cost edge has NOT been shown for any recipe yet. The path to real money is the recipe skill's: pre-registered rules, backtest with real costs, 100+ trades, 95% interval above zero, then tiny live.

## 1. Law (never break)
- AGENTS.md rules 18-26: payments law; no live test charges; rule 26: GMGN trades only through the cursor inside caps (tools/ultracursor/src/profiles/gmgn.json: autoBuy.maxSol 0.05 per click, plain preset amounts, hour/day limits, never Kimchi); never ask Alex to approve a GMGN purchase inside the caps; stocks need his yes per ticket (trader-broker).
- Never ask for or store seed phrases, private keys or passwords. GMGN_PRIVATE_KEY (Ed25519) only signs API requests; Ultra build 106 already made one on the Mac and saved the API key in secrets.json (mode 600), so a GMGN API key may already exist on Alex's Mac.
- Verify every sell ON-CHAIN, never trust the engine's "closed" (2026-11-07 lesson). Never fake a result. Missing data = NO. Kill switch before every action.
- Weekly focus (gem skill): this week is only trading. Build only when Alex says "build".

## 2. Asset map (where everything is)
| What | Where | Notes |
|---|---|---|
| Ultra: the live trader app (Mac, real SOL, Phantom wallet) | tools/autotrader/ (src/lib: strategy, narrative, intel, whales; backtest.mjs, collect*.mjs, entry-families.mjs, tune.mjs, trade-report.mjs, relay/, app/, test/, publish-live.sh, BUILD) | 117 builds. Status route: kerberos /ultra/<key>/status; relay for Jupiter/RugCheck: app/routes/ultra.$.tsx |
| Ultra skills | .claude/skills/ultra-growth (growth mode, builds 52-103 log, standing order 2026-11-07), gmgn-fib (+ references/knowledge-base.md, coin-science.md, research-2026-10-29-lessons.md) | read these before touching Ultra |
| Paper/training trader ("Sniper XYZ", symbiot, fast lane) | tools/ultracursor/src/trader/ (fib, book, ladder, lanes, brain, memory, narrative, x, scan, sniper, scalp, paper, real/*) | fake money, real GMGN coins; ultracursor builds 5-63 history; live path throws "live wallet not connected" |
| Stocks pipeline | .claude/skills/trader-master + 11 trader-* skills (scanner, news, entry, exit, timemachine, budget, risk, alerts, broker, analyst, pelosi) | source github.com/Jakeschincariol/day-trader-skill (MIT), 315 tests pass; paper by default |
| Research | .claude/skills/trading-lab (verdicts, sentiment sources, why-bot-lost arithmetic, five tools, Grok desk, reels/INDEX.md, grok-desk-prompts.md) | |
| The recipe | .claude/skills/recipe (R1-R5, trade math, conflicts) | |
| Link watching | learn-links, watch, tools/reel-reader | every reel Alex sends is watched and indexed |
| Data files | tools/autotrader/data/last-backtest.json | the only stats file |

## 3. Timeline and results
- 2026-10-19: the knowledge base starts (Fibonacci at every scale), gmgn-fib skill, paper "Sniper XYZ" trainer. 2026-10-20 Lesson 1: first 60-minute paper run = 1,192 scans, 0 trades.
- ultracursor builds 10-63: fast lane, symbiot (trades every coin once, fake 52,000 SOL plan), learning loops, real-money modules written then gated (build 42 PROBE).
- 2026-10-29: Ultra growth mode ("one trade a minute, small wins"). Builds 52-65: living equation, narratives, instant intel (RugCheck, RPC, DexScreener, FxTwitter), whale following (whales.mjs), cost edges. Build 65 formula: buy fib pullback 0.5-0.786, half off at +8%, 5% trail, stop -20%, 10-min max hold, size 0.016 SOL; expected about +0.9%/trade net of 3.5% cost, "thin edge from one sample; re-check after 30 trips" (no recorded recheck).
- 2026-11-07: standing order ("connected, fix on the spot, don't stop until profit"). Builds 89-103: wrong-TLS cert on Alex's Mac network (fixed via kerberos relay), RPC refusals, sells abandoned (7 buys on-chain, 0 sells). Session result: 0.0622 SOL in, 0.0319 SOL after sell-all. Ultra paused.
- Builds 104-117 (early Nov): smart-mode (buy only what 2+ independent smart wallets bought), wallet weights from realized profit, red-flag exit, GMGN key connect (106), fewer bigger trades (107: 2 positions, 0.45 of wallet each), up to 360 smart wallets, live websocket wallet feed (115), Send-SOL-out (117). NO results recorded for these builds in any skill or data file (unknown).
- 2026-11-14: the 11 day-trader skills installed and master skill. 2026-11-15/16: trading-lab research, recipe, knowledge base.

## 4. What failed and why (evidence)
1. Costs ate the edge: measured round trip ~5% (2.4-6.8%); backtest gross edge 6.0%/trade, costs took 83%; 17 trades, 41.2% win rate vs 38.3% break-even, +1.04%/trade, t=0.20, 95% CI -9.4% to +11.5% (coin flip). "One trade a minute" growth mode was fee-negative by design (break-even win rate ~56% at +3.5/-4.5).
2. Bugs, not strategy, lost the 2026-11-07 session: sells could not find tokens (RPC refusal), engine marked them closed while tokens stayed in the wallet.
3. Discovery picked a runner's own creator as "smart money" (he sold well by dumping): always exclude creator and RugCheck insiders.
4. Paper/symbiot "buy everything" lanes taught that fixed fees kill many tiny trades; hence build 107 fewer/bigger trades.
5. Sizing conflicts: gmgn-fib sizes 23.6-38.2% of wallet (risks ~4%+ per trade, day stop -38.2%); trading-lab ceiling is 2% per trade, -10% day. Unresolved (recipe skill lists it).
6. LLM trading fleets (arXiv 2609.05663) show no directional edge; no Grok-desk repo publishes a net-of-fees profit record.

## 5. Outside ideas, with verdicts (details in trading-lab)
HyperGrok (MIT): steal the roles and risk ceilings, it ships no strategy. Freqtrade (GPL-3): use first for crypto backtests (fees yes, slippage no). skfolio (BSD-3): use when we have several tested recipes. NautilusTrader, Hummingbot: maybe later. Kronos: skip. Grok Bot: browser at grok.com, paid plan, edge = live X search only. Reels: tatelalk funnel (hype), others in trading-lab/reels/INDEX.md. Smart money: GMGN feed for candidates, raw chain data to verify; Hyperliquid public leaderboard: 16% of 47,799 traders profitable last month; 144 mid-size steady winners; not yet studied over 90 days.

## 6. Recipe status (see recipe skill)
R1 stocks ORB + Time Machine: rules exist, Time Machine has no cost model. R2 crypto majors via Freqtrade: not tested. R3 memecoin fib: = Ultra history above, unproven. R4 launch (GTA 6): plan only, nothing built (Alex stopped the build). R5 copy wallets: Hyperliquid winners not studied; Ultra smart-wallet follow built but results unrecorded.

## 7. Measured numbers to reuse
Round-trip cost 5% (memecoins); network fee $0.0015-0.0067 per trade; Pump AMM pool fee 1.1-1.15%; Raydium V4 0.25%; Jupiter keyless quote (lite-api.jup.ag/swap/v1/quote, space calls 1.5 s); free sentiment: StockTwits, Fear and Greed (10 on 2026-11-16), DexScreener trending (boosts = paid), Google Trends RSS, MarketWatch RSS; X has no free tier.

## 8. Open questions / next (Alex decides)
1. Pull Ultra's real live results: its trade journal and on-chain history for builds 104-117 (status route / Mac journal). Until then we do not know if smart-mode worked.
2. Which two recipes first (pick: R1 + R3 with the cost gate); risk cap per memecoin trade (2%/4%/keep phi).
3. Does the GMGN API key from build 106 still exist on the Mac?
4. Study the 144 Hyperliquid steady winners over 90 days.
5. The "trading fund office" city: parked, waiting for Alex's drawing. Not built.

## 9. Ultra paper/live trade lab, read 2026-11-16 (files: gmgn-fib/lab/trades/trades.jsonl + REPORT.md)
79 closed trades, 33 wins (42%), average -2.21% per trade (report at build 88: 64 trades, 28 wins, -2.71%).
- Exits: take-profit 24 trades 88% win +1.64% avg; stop 22 trades 5% win -8.47% avg; time stop 16 trades -0.90%; stale-data 2 trades -6.02%.
- Lesson 1: tiny wins (+1.6%) against big losses (-8.5%) means one stop erases about five wins. Win rate looks great (88%) and the account still bleeds.
- Lesson 2: "idle pick" entries (49 trades, -3.33%) were worse than real signals (15 trades, -0.68%). Trading with no reason costs money.
- Lesson 3: 1-2% measured round trip still lost -6.59% (4 trades); costs were not the only leak, exits were.
- Rule for the next recipe: target must be >= 6x cost, stop distance must not exceed the target, no entry without a signal.
