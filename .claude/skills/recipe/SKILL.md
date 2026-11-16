---
name: recipe
description: The master trading recipe: one multi-recipe built from everything Alex has (trader-* skills and the Time Machine, gmgn-fib and the old Ultra bot, trading-lab research, and the reels and repos he sent: Grok desk, HyperGrok, Hummingbot, NautilusTrader, Freqtrade, skfolio, Kronos, GMGN API). Use whenever the work touches the trading recipe, which strategy to run, how to test it, or "combine everything into one".
---
# The master recipe (Alex, 2026-11-16: "trade the market, all tokens, ready for GTA 6, no sloppy work, no imagination, find the recipe, combine everything into one multi recipe")

Law: a recipe is only a recipe after it is tested. Combining ideas is not evidence. Every candidate below has its rules written BEFORE testing and an "abandon if" line. Nothing here is a promise of profit.

## The one machine (same for every market)
SCOUT (find) -> NEWS (why) -> SETUP (entry, stop, target) -> COST GATE (real round-trip cost; target >= 6x cost) -> SKEPTIC (replay/backtest with fees; no verdict under 100 trades) -> RISK (limits, kill switch) -> ONE EXECUTOR (paper or live inside caps) -> REVIEWER (journal; process vs outcome).
Agreement between roles is never evidence. Missing data = NO. Sentiment may veto or warn, never trigger.

## The candidate recipes (a portfolio, each tested on its own)
| # | Market | Source of the idea | Entry | Exit | Costs | Status |
|---|---|---|---|---|---|---|
| R1 | US stocks, day | trader-scanner/entry/exit + Time Machine | first bar closing above the opening-range high | stop OR midpoint, target 2R, flat by close | tiny (Alpaca 0% commission) | rules exist; Time Machine has NO cost model yet (add `--cost-bps`) |
| R2 | Crypto majors (BTC/ETH/SOL) | Freqtrade-style backtests | rules written before code (breakout / mean-reversion) | stop + target + time stop | ~0.1-0.2% per side | NOT tested yet; needs the out-of-sample split |
| R3 | Solana memecoins, all tokens | gmgn-fib + filters from Ultra | 0.618 retrace of last impulse, filters: age 15m-6h, liquidity >= $30k burned/locked, top10 < 25%, dev < 5%, not mintable, no freeze, 2+ smart wallets | TP1 +45%, TP2 +64%, TP3 +89% or trail; stop ~-12%; 21-min time stop | ~5% round trip (measured), so target must be >= 30% | old bot: 17 trades, coin flip; needs the cost gate and 100+ trades |
| R4 | Memecoin launches (GTA 6 etc.) | same as R3 + launch watcher | only tokens that pass the safety score | same as R3 | same | built on demand, not first |
| R5 | Copy-trading wallets | GMGN smart-money / copy bot, Grok reading wallet stats | follow a wallet | wallet's exits + our stop | same | survivorship bias: backtest on past data first |
Rule: R1 and R2 are the cheapest to test properly (low costs). R3-R5 have ~5% costs, so they must show a large gross edge.

## What each source contributes (nothing else is taken)
- trader-* + Time Machine: the pipeline order and the "skip a coin flip" rule.
- gmgn-fib / Ultra: memecoin filters, fib levels, phi sizing, real cost measurement (Jupiter quote), the 3-lane scan.
- trading-lab: the cost gate, the 6x rule, 100-trade and 95% CI rule, stressed-stop sizing, evidence tiers, free sentiment sources.
- HyperGrok (MIT): the 7 roles, ticket lifecycle, risk ceilings (2% per trade, 6% open, -10% day), exchange-resting stop on every entry, journal.
- Grok desk reels: same role idea; Grok's only real edge is live X search (no free equivalent).
- Freqtrade / Hummingbot / NautilusTrader / skfolio / Kronos (from the reel): real open-source tools; NOT evaluated yet (that worker was stopped). Freqtrade = backtesting + strategies; Hummingbot = market making/execution; skfolio = portfolio sizing; Kronos = a forecasting model (limits unknown). No verdicts until read.
- GMGN API (free key from gmgn.ai/ai; request-signing key is not the wallet key): the way to trade 24/7 without a browser.

## Conflicts inside our own skills (decide, do not ignore)
1. gmgn-fib sizes 23.6%-38.2% of the wallet per trade with a ~-12% stop and day stop at -38.2%: that risks ~4%+ of the wallet per trade and up to -38% a day. HyperGrok/trading-lab ceiling is 2% per trade, -10% a day. Recommendation: keep phi for scaling after wins but cap risk per trade at 2-4% and the day stop at -10 to -15%.
2. gmgn-fib says break-even win rate 32% at 6% cost; the old bot's measured payoffs give 38.3%. Use measured numbers.
3. ultra-growth wants "one trade a minute": at ~5% round-trip cost that loses money by construction. Retire it for memecoins.
4. The old "never propose paper trading unprompted" stays, but Alex now wants live-ready by launch week: backtest the filters on history (hours) instead of weeks of paper, then live tiny inside caps with the gate on.
5. Time Machine has no costs and redraws bars independently: add costs and a bootstrap p-value before it can veto or approve anything.

## How a recipe becomes real (the only path)
1. Write rules + "abandon if" (pre-registered). 2. Backtest with real costs, last 15-25% of data untouched. 3. Run live-data signals with real quotes logged. 4. At >= 100 trades read mean net return and its 95% CI. 5. Only if the lower bound > 0: tiny live inside caps, then scale. Anything else = keep testing or kill.

## Next decisions for Alex (one word each)
- Which two recipes first? (My pick: R1 stocks + R3 memecoins with the gate.)
- Risk cap per trade for memecoins: 2% / 4% / keep phi.
- GMGN API key: generate at gmgn.ai/ai (you, not me): now or later.

## Trade math (Alex, 2026-11-16: "how does a trade work, how much must it hit, calculate before")
Worked example, 1 SOL wallet, memecoin R3 (all numbers from measured costs in trading-lab):
- Round-trip cost c ~ 5% (2.4-6.8% measured). Each side ~2.5%.
- Risk per trade 4% of wallet = 0.04 SOL. Stop -12% gross => realized loss L = 12 + 5 = 17%. Position = 0.04 / 0.17 = ~0.23 SOL.
- Target +45% gross => realized win W = 45 - 5 = 40%. Break-even win rate = L/(W+L) = 17/57 = ~30%.
- Rule: target >= 6x cost (30% at c=5%). A 12% target at 8% stop needs 65% wins at c=5%.
- Expectancy at 40% wins = 0.4*40 - 0.6*17 = +5.8% of position (~0.013 SOL per trade, ~1.3% of wallet). 20 trades/week ~ +0.26 SOL if (and only if) the 40% win rate is real; it is NOT proven until >= 100 trades with a 95% CI above 0.
- Ruin check: 10 straight losses at 4% risk ~ -34% of wallet; 20 straight is not survivable. Keep a daily stop.
- Old cap of 0.05 SOL per click (tools/ultracursor/src/profiles/gmgn.json) is Alex's call to raise; position size must still follow the 4% risk rule.
- Speed: helps scanning many tokens and order latency; the fib entry is 15m-6h after launch, so first-second speed is not the edge. A cheap always-on server beats mining hardware; hashing power creates no trading edge.
