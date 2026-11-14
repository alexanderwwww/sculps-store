---
name: trader-master
description: The master trader — runs the 11 installed day-trader skills in the right order as one pipeline (scan -> news -> entry -> exit -> Time Machine -> budget -> risk -> alerts -> broker), with Alex's own rules on top. Use when Alex says "trade", "find me a trade", "day trade", "master trader", "run the pipeline", "what should I buy today", "time machine", or anything about US stocks/day trading. For Solana memecoins use Ultra (tools/autotrader), not this.
---
# trader-master (installed 2026-11-14, Alex: "install this as well and make the master one as a skill… the time machine is good")

Source: github.com/Jakeschincariol/day-trader-skill (MIT), copied into .claude/skills/trader-* after reading the code (only free public data: Yahoo, Nasdaq Trader, SEC EDGAR, House Clerk) and running its 315 tests (all passed). Each step's own SKILL.md is the reference; this file is the order and the law.

## The pipeline (one trade, in this order — never skip a step)
1. **/trader-scanner** — pre-market scan (20-day breakout, bull flag, reclaim 20-day, oversold bounce) or intraday opening-range breakouts -> trader/watchlist.json.
2. **/trader-news** — headlines + 8-Ks on the watchlist; drop names with halts, restatements, bankruptcy, or unexplained moves. Earnings this week -> /trader-analyst first.
3. **/trader-entry** — wait for the first completed bar that CLOSES above the opening-range high (or the scanner's level). No trigger = no trade.
4. **/trader-exit** — stop (OR midpoint default) and 2R target -> trader/plan.json.
5. **/trader-timemachine** — 10,000 replays + every past time the setup fired. **Only continue if target-first odds beat stop-first and the average R is positive.** A coin flip or worse = skip, say so in one line.
6. **/trader-budget** — whole shares inside max-loss-per-trade, position cap, max order, cash buffer -> one bracket order.
7. **/trader-risk** — PASS or BLOCK. BLOCK ends it.
8. **/trader-alerts** — stop, target, flat-by-close alerts.
9. **/trader-broker** — PAPER by default. A real order only after Alex types yes for that exact ticket AND approves Claude's Allow card.

## Alex's rules on top (non-negotiable)
- Never ask for, take or store broker keys, passwords or seed phrases in chat. Alpaca keys go in the Claude Desktop MCP env vars only (see trader-broker).
- Paper first. Live money only after Alex says so for that trade. AGENTS rule 26 (auto-buy) covers GMGN memecoins only, never stocks.
- Report each run in 3 lines: the ticker, the Time Machine odds + verdict, what was placed (paper/live) or why it was skipped.
- Lessons from Ultra apply: most fast trades lose to fees and buying the top; the Time Machine gate exists to stop exactly that.
- Pelosi tracker (/trader-pelosi) is information only, never an automatic buy.
