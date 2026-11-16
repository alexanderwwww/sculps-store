---
name: trading-lab
description: Trading research notes for the Desk (tools/desk) and the trader skills. Verdicts on the Grok trading-desk repos on GitHub, how a Grok Bot desk really works, which sentiment data is free, why the old GMGN bot lost (with the arithmetic), and the concrete changes to merge into trader-master, trader-timemachine, gmgn-fib and the Desk's Skeptic. Use when the work touches the Desk, the Skeptic, Grok, sentiment, fees/break-even, or "why did the bot lose".
---
# trading-lab: Grok desk research (2026-11-16)

Alex: "research how they do it with Grok, see if there is anything on GitHub; we already have crazy trader skills, the Time Machine and the formulas; we will perfect them." Trading is the only focus this week. NO live trading, no signups, no keys, no real money. Every claim below is from the project's own README/code/docs (clones in /home/user/trading-research/) or a request run on 2026-11-16. "Not found" means not found, not "probably".

## 1. Verdict table

| Repo | License | Verdict | Why (one line) |
|---|---|---|---|
| galleonlabs/hypergrok-trading-desk v1.7.3 | MIT | **Steal the process, not a strategy** | Best role/risk/ticket design found. Its own FAQ: "It contains no strategies or signals and makes no profit or return claim." Hyperliquid perps only. |
| nolancacheux/AI-Agent-Grok-Trading-System | MIT | **Skip** | One Grok call picks trades from Yahoo "trending"; fixed -10% stop / +15% take-profit; 3 test functions; no results. Only reusable idea: Grok Live Search with `sources: web, news, x`. |
| HammerGPT/Hyper-Alpha-Arena | Apache-2.0 | **Skip as a platform, borrow the factor idea** | Hyperliquid + Binance futures, leverage 1-50x, LLM trader. 86 "factors" scored by IC/ICIR (the right way to test a signal). No published returns. Hosted login/membership service shut down (README banner). |
| ADWilkinson/hlprivateer.xyz (the 7-LLM-role desk) | **No LICENSE file** (README has a License heading only) | **Study only, do not copy code** | Site status "Experiment concluded" but no post-mortem or results anywhere I could find. Only PnL numbers are sample API outputs (+2.84%, +1.92%) shown as illustrations. Same author as HyperGrok (Andrew Wilkinson). |
| Senpi-ai/senpi-skills | MIT | **Skip for now** | Runs only on Senpi's hosted harness with `SENPI_AUTH_TOKEN` (signup, off limits). 144 strategy folders, "forward-tested across $10M+ notional" = volume, not profit. Its own disclaimer: "Nothing here is a promise of returns." Useful as a checklist of leak types (quant-desk). |

Adversarial summary: **no repo publishes a net-of-fees, out-of-sample profit record.** The only independent evidence found is against LLM trading agents: an arXiv study of two fleets (3,505 vaults on Base memecoins plus 500-599 agents on Hyperliquid perps, ~6 months, 14,596 fills) says "neither fleet shows a directional edge" and the Hyperliquid fleet "is not profitable and trails a matched retail benchmark (41% vs 50% roundtrip win rate)". It also found 43.2% of positions had +300 bps favorable excursion within 24h, yet 49.3% of those closed negative, and "a mechanical bracket recovers +39.0 bps per position" (https://arxiv.org/abs/2609.05663). Lesson: the exit and sizing layer matters more than the model's opinion.

### Per-repo detail

**hypergrok-trading-desk** (https://github.com/galleonlabs/hypergrok-trading-desk, release 1.7.3, 2026-11-15)
- Roles (agents/*.md, 7): Desk Lead (routes, never trades), Market Analyst (exchange data), Research Analyst (news/catalysts/social, "primary source before secondary, secondary before social", tags every claim verified / reported / claimed / inferred), Strategist (idea to explicit rules, honest backtest, "ships no strategies"), Risk Manager (limits file, sizing, the veto), Execution Trader (only role with a key), Trade Reviewer (journal, grades process and outcome separately).
- Risk rules (skills/desk-risk-limits): ceilings max 2% equity risk per trade, 6% total open risk, 20x leverage, -10% daily loss stop, exchange-resting stop mandatory on every entry, never a standing approval for anything that opens or grows exposure. A limits file looser than a ceiling is rejected. Sizing is on a **stressed stop** (stop distance + slippage + fees, example ticket: 100 + 3.00 + 2.65 = 105.65 per ETH). Correlated majors count as one cluster (max 2 positions).
- Strategist rules (skills/desk-strategy-lab): rules written before code; fees, funding and slippage in the backtest; only information available at each bar; 15-25% most recent data held out untouched; report trade counts, drawdown and the distribution, "not just a return figure"; abandon rule written up front.
- Execution: via Hyperliquid API wallet, one ticket id approved by the user (`approve HG-...`), enforced outside the chat by Grok Bot's native approval; in Claude Code a PreToolUse hook (hooks/exchange_write_gate.py) asks before a Bash command that looks like a signed `/exchange` request. The hook's own docstring says it is "a backstop, not the approval" and does not follow imports. Starts research-only, testnet before mainnet.
- Claude Code install (docs/hyperliquid-claude-code.md): `/plugin marketplace add galleonlabs/hypergrok-trading-desk`, then `/plugin install hypergrok@hypergrok`. Seven roles become subagents. Not run here (no plugin install, no network use beyond reading).
- Free and keyless: `python3 scripts/opening_bell.py --coin ETH` (public Hyperliquid /info: price, funding, open interest, spread, depth) and `scripts/research_dataset.py` (hashed, verifiable candle + funding history).
- Unsupported / hype: none of its marketing claims returns; the FAQ explicitly warns that videos or posts promising returns "do not come from this project". Weakness: the Grok-Bot-specific guarantees (native approval) do not exist in Claude Code; only the weak hook does.

**AI-Agent-Grok-Trading-System** (https://github.com/nolancacheux/AI-Agent-Grok-Trading-System, last commit 2026-02-11, 1 commit in the clone)
- Flow: `trading_agent.py` pulls Yahoo trending tickers, top 5 with 5d/1h history, asks Grok for a BUY/SELL/KEEP JSON decision with `risk_score`, sends via Interactive Brokers (ib_insync). Hard rules in code: close if P&L < -10%, take profit if > +15%.
- Grok's edge in the code: `chat_with_live_search` calls the xAI API with `search_parameters={"mode":"on","sources":["web","news","x"],...}`. xAI's docs page I read now talks about server-side "Web Search / X Search" tools instead (https://docs.x.ai/docs/models) and I could not confirm Live Search still works. Per-call prices for these tools are not on the pages I could read.
- No backtest, no results, 3 test functions (connection tests). README: "for educational purposes only". Needs an xAI key and an IBKR account: both off limits.

**Hyper-Alpha-Arena** (https://github.com/HammerGPT/Hyper-Alpha-Arena, Apache-2.0)
- AI Trader (LLM reads data and decides) or Program Trader (Python rules with backtest). Signals pool monitors order flow, OI changes and funding extremes. Factors scored by IC / ICIR / win rate. Derived from nof1 Alpha Arena (NOTICE credits etrobot/open-alpha-arena).
- Real money path: Hyperliquid mainnet 1-50x or Binance Futures. No published performance numbers in the README. Hosted login/registration/membership shut down (banner), so "features that depend on hosted membership checks" need your own integration.

**hlprivateer** (https://github.com/ADWilkinson/hlprivateer.xyz, last commit 2026-03-23)
- Seven LLM roles (docs/SPEC.md): scout (feeds), research (regime, hypotheses), risk (explains GREEN/YELLOW/RED, "cannot bypass hard-gates"), strategist (long/short with size, SL, TP), execution (structured StrategyProposal, slicing within slippage caps), scribe (audit narrative), ops (health, auto-halt). A deterministic fail-closed risk engine gates every proposal; SL/TP placed on the exchange at entry; no trailing stops, no runtime rebalancing (per its site as quoted by search).
- **Why it concluded: not published.** I searched the repo (README, AGENT.md, docs/, SPEC), the ClawHub listing and the web: nothing states a reason or a final result. I will not invent one. The only context is the independent study above (LLM fleets show no edge) and the fact that its own docs treat the LLMs as proposers and the code as the gate. Ask the author or read hlprivateer.xyz directly if Alex wants the reason (the site host was not reachable from this sandbox).
- No LICENSE file in the clone: all-rights-reserved by default. Read for ideas only.

**senpi-skills** (https://github.com/Senpi-ai/senpi-skills, MIT)
- 12 skills + 144 strategy folders (names are animals). Runs on the proprietary "Samurai" model and MCP backend (62 tools) via senpi.ai, with `SENPI_AUTH_TOKEN`. `quant-desk` reads any public Hyperliquid address (90 days of fills, leaks priced as counterfactual dollars, protection audit). `senpi-improve-trades` reviews PnL net of fees, exit quality, peak-to-exit giveback, missed signals.
- Claims: "$10M+ notional forward-tested", "$30M+ notional volume in the Arena" = volume traded, not profit. No per-strategy net return table in the README.

## 2. How a "Grok Bot desk" works, and what we copy

What it is (from the HyperGrok SETUP.md and docs/ARCHITECTURE.md, which are the only primary sources I could read): in the consumer Grok Bot app you create several Bots, each with a name, job, description and system prompt. A group chat ("Trading Floor") holds **up to six Bots** (SETUP.md); the seventh (Trade Reviewer) works by DM. Each Bot shares a workspace (`/workspace/trading-desk/`) with files: `risk-limits.md`, proposals, journal, research. Bots hand evidence along a fixed lifecycle: idea, evidence, risk sign-off, user approval, one send, reconciliation, review. Only one Bot holds the exchange key, and approval is enforced by the app, not by chat text ("an approval a Bot can read is one a Bot could have written", ARCHITECTURE.md).

Grok's one real advantage is **live X search** (xAI docs: "enable server-side search tools (Web Search / X Search)"). Nothing else in the desk needs Grok; the roles are prompts plus Python scripts reading public APIs.

What we replicate with Claude plus free data, and what we cannot:
| Piece | Replicable? |
|---|---|
| 7 role prompts, ticket, veto, journal | Yes. Claude subagents or the Desk's own roles. |
| Free market data (price, funding, OI, depth, candles) | Yes: Hyperliquid /info (keyless), Yahoo chart JSON, Jupiter quote, DexScreener, GeckoTerminal. |
| Live X search | **No free equivalent.** X API is pay-per-usage ("No subscriptions", post read $0.005 each, https://docs.x.com/x-api/getting-started/pricing); no free tier listed there. Grok's X search needs an xAI key (paid, price not found). Alex's own signed-in Chrome via ultracursor `x.mjs search` is the only free route already in the repo (gmgn-fib: parser not yet verified against live X). |
| A group of bots agreeing | Do not copy as evidence. HyperGrok's own Desk Lead prompt: never treat agreement between Bots as evidence. |

## 2b. Free sentiment sources: tested 2026-11-16 from this sandbox (HTTP code, no key)

| Source | Result | What it gives | Limits |
|---|---|---|---|
| StockTwits public stream `api.stocktwits.com/api/2/streams/trending.json` and `/streams/symbol/NVDA.json` | **200** | Latest posts with a user-tagged `Bullish`/`Bearish` label. NVDA sample: 30 posts, 8 Bullish, 3 Bearish, 19 untagged. | Unofficial public JSON; no limit stated in headers; can be blocked or rate-limited from other IPs. Only labelled posts count. Stocks and crypto tickers (`BTC.X`). Retail crowd, not smart money. |
| DexScreener `token-boosts/latest/v1`, `token-profiles/latest/v1`, `metas/trending/v1` | **200** | Boosted/trending Solana tokens, new profiles, trending "metas" (narratives like Cat). | Docs: 60 requests/min on profiles, metas; boosts and search have no stated limit. Boosts are **paid promotion**: a boosted token is an ad, treat as a warning flag, not a signal. |
| Google Trends `trends.google.com/trending/rss?geo=US` | **200** | What the public is searching right now (US). | Mostly sports/news; weak for specific tickers. |
| Alternative.me Fear and Greed `api.alternative.me/fng/` | **200** | Crypto market mood, one number a day. Today: **10, Extreme Fear**. | Daily, market-wide, not a trade trigger. |
| CoinGecko `api/v3/search/trending` | **200** | Most-searched coins. | Keyless tier is rate-limited; terms not read. |
| MarketWatch headlines RSS `feeds.content.dowjones.io/public/rss/mw_realtimeheadlines` | **200** | Real-time market headlines (trader-news already reads news). | Headlines only, copyright. |
| Reddit `reddit.com/r/wallstreetbets/new.json` | **403 Blocked** from this IP; Reddit's wiki page also 403 | Official API needs OAuth app (signup). | Not available here; skip. |
| Google News RSS search | 302 redirect (not followed) | Possible with redirect handling | Untested. |
| X / Twitter | No free tier found | | See above. |

Honest bottom line: free data gives **crowd mood** (StockTwits labels, Fear and Greed, trending lists), not Grok's "what is being said on X in the last hour". Treat all of it as a veto/context input only (the Research Analyst rule "sentiment clearly labelled as sentiment"), never as the entry trigger. Not proven to predict returns; nobody has shown a net-of-fees edge from it in the sources above.

## 3. Why the old GMGN bot lost (tools/autotrader/data/last-backtest.json)

Data: 144 pools, 17 trades, costs assumed 1.5% slippage + 1% fee each side (strategy.mjs), stake 12% of equity.

- Round-trip cost: (1 - 0.015)/(1 + 0.015) - 1 - 2 x 0.01 = -2.96% - 2.00% = **-4.96% per trade** (~5%).
- Result: wins 7 of 17 = **41.2%**; average win **+22.5%**, average loss **-14.0%** (net of costs). Expectancy = 0.412 x 22.5 - 0.588 x 14.0 = 9.27 - 8.23 = **+1.04% per trade**. Equity 100 to 102.12.
- Break-even win rate with those payoffs = L/(W+L) = 14.0/(22.5+14.0) = **38.3%**. The bot cleared it by 2.9 points.
- Gross edge before costs = 1.04 + 4.96 = **6.0% per trade; costs ate 83% of it.**
- It is a coin flip statistically: stdev of trade returns 21.95%, standard error 5.32%, t = 0.20, 95% confidence interval **-9.4% to +11.5% per trade**. If true win rate were only 50% (a literal coin), 7 or more wins in 17 happens 83% of the time. Seventeen trades cannot show an edge.
- How it lost its trades: 7 hit the stop (-15% setting, -18.3% after costs), 6 time stops, 4 trailing stops. The backtest rows show -15% stops; the current strategy.mjs defaults are `sl -0.08, tp 0.12`. Either shape needs a high hit rate to pay 5% of costs (see the 12%/8% example below: 65% wins).
- gmgn-fib says "Break-even win rate with 6% costs is about 32%". That holds only if winners reach the Fibonacci ladder average. The old bot's real winners averaged +22.5%, which gives 38.3%. Use measured payoffs, not planned ones.

### Small wallet ($10-$100): what costs and what does not
- Network fee is tiny and fixed: measured **$0.0015-$0.0067 per trade** (gmgn-fib "Real costs"; GMGN auto priority suggestion 0.000244 SOL). On $10 that is under 0.07%, so it is **not** the problem. Size does not rescue or kill the edge; percentage costs do.
- Percentage costs per side measured by Jupiter at $2.36: round trip **2.4-6.8%** (Pump AMM pool fee 1.1-1.15%, Raydium V4 0.25%, one token had 1%/1% tax). GMGN's own swap fee is not readable from any endpoint (gmgn-fib), so it is **unmeasured**: do not assume it is 0.
- Minimum edge to survive: with round trip cost c, average gross winner G and average gross loser Lg, break-even win rate = (Lg + c)/(G + Lg). Examples at c = 5%: a 12% target / 8% stop plan needs (8+5)/(12+8) = **65% wins** (impossible for a breakout scalper). A 3:1 plan (+30% / -10%) needs (10+5)/(30+10) = **37.5%**. At c = 2.4% (best measured) it needs 31%. Rule: **never take a trade whose target is less than 6x the round-trip cost** (30% target at 5% cost) and where cost > 1/6 of the expected move, skip. gmgn-fib already encodes this as `W >= 3|L|` after real costs, allowing at most ~4.4% round trip on a clean 2x swing. Keep it, and require the measured Jupiter round trip before every entry.
- Position size: because costs are percentages, a $10 and a $100 wallet need the same edge. Smaller size only helps by (a) lower price impact on thin pools and (b) capping dollar loss. Dollar math at the old bot's 12% stake: expected profit per trade = 12% x 1.04% = 0.125% of the wallet, i.e. **$0.0125 on $10, $0.125 on $100**. Not worth the risk of ruin.

## 4. What to merge

**Desk's Skeptic (tools/desk), concrete checks that return PASS/BLOCK with the number:**
1. **Cost gate:** compute round-trip cost c from the real quote (Jupiter for tokens; spread + fee for stocks). BLOCK unless target >= 6c and measured c <= 1/6 of the expected move. Print the break-even win rate (L+c)/(W+L).
2. **Stressed stop sizing** (from HyperGrok desk-risk-limits): size the loss as stop distance + slippage + fees; max risk per trade 2% of equity hard ceiling, total open risk 6%, daily stop -10%, a limits file may only be stricter than the ceilings.
3. **Sample-size gate:** a backtest or live record under 100 trades, or a 95% CI for mean return that includes 0 (print the CI: old bot -9.4% to +11.5%), is labelled "no evidence", never "edge". Time Machine verdict must say the same.
4. **Out-of-sample:** require the latest 15-25% of history untouched until rules freeze (HyperGrok strategy-lab). Rules written to a RULES.md with an "abandon if" line before any code.
5. **Evidence tiers** (HyperGrok Research Analyst): every input labelled verified / reported / claimed / inferred; sentiment can veto or flag, never trigger. Agreement between agents is not evidence.
6. **Process vs outcome grading** per closed trade (Trade Reviewer): fill price vs signal price, fees paid, whether the plan was followed, one repeatable finding. Peak-to-exit giveback and missed-signal counts (Senpi `senpi-improve-trades`).
7. **Fail-closed:** missing data is a NO (already in gmgn-fib); add a hard stop on stale data (age of last candle/quote) and a kill switch that is a file the Desk checks before every action.
8. **Two-key rule for any order:** keep trader-broker (paper default, user types yes, Claude Allow card) and the AGENTS.md limits (rule 26 scope is GMGN only).

**Existing skills:**
- trader-timemachine: it has **no fee/slippage modelling** (no cost terms in SKILL.md or timemachine.py) and its Monte Carlo redraws 5-minute bars independently by time of day, which by construction erases any momentum between bars. Add: `--cost-bps` (entry+exit) deducted from every replay's R; report "average R after costs"; add a permutation/bootstrap p-value for the history line; show the sample size next to the verdict. Do not let a green Time Machine alone justify an entry.
- trader-master: add step 5b "cost gate" (above) before budget; add the 100-trade/CI rule to the report line; keep "paper first".
- gmgn-fib: replace "32% break-even" with the measured formula using real Jupiter cost; keep W >= 3|L|. Make `edgeMinN`/`edgeFloor` meaningful again (currently off: `edgeMinN: 1e9`, strategy.mjs) for the paper lane only: block when the last 20 paper signals average worse than -2% each, because 17 trades proved nothing.
- Old bot parameters to fix before any rerun: the scalp shape (+12% target, -8% stop) needs 65% wins at 5% cost; test wider targets or drop the scalp.

## 5. Best next step
Build and run a **cost-aware paper evaluation on the Desk**: log every signal from the existing GMGN/Time Machine pipeline for 2+ weeks with real Jupiter round-trip cost attached, and only after >= 100 trades read the mean net return and its 95% CI. Add the DexScreener boost list as a *negative* flag and StockTwits/Fear and Greed as context labels. No live money until the CI lower bound is above 0.
