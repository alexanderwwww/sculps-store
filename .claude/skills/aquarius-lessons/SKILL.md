---
name: aquarius-lessons
description: The absolute lessons from the first training run (866,559 paper trades on two machines, 17 Nov 2026), ranked by how strongly the data proves them. Load before changing any trading rule, sizing, coin list, exit or cost setting on Aquarius or Grok, before a new training run, and before any talk of real money.
---
# aquarius-lessons

Alex, 2026-11-18: "take these data and cook, take all the absolute lessons."

Source: Aquarius 664,164 trades and Grok 202,395 trades, paper money on real Solana prices. Every number is in `aquarius-brain` (reads 1 to 8, studies 1 to 4) and the frozen files in `tools/mob/data/arena-study/`. "Edge" = points of % per trade better than a coin-flip entry on the same coins in the same minutes.

## PROVEN: both machines, tens of thousands of trades each. Treat as law.

1. **Never chase strength.** Breakout and momentum entries were the worst rules on both machines: Aquarius -0.25 to -0.46 edge on 67,000 live trades, Grok -0.55 and -0.75 on 34,000. Buying the green candle is buying the top.
2. **The cost is the enemy, not the idea.** Before costs both machines were about flat (Aquarius about zero, Grok +0.14% a trade). After costs Aquarius lost 0.53% a trade and Grok 2.07%. Every rule is judged by what is left after the round trip.
3. **Where you trade sets the cost.** Established coins with deep pools cost 0.47% a round trip; new and thin coins cost 2.19%. Grok found the bigger edges and lost four times more per trade.
4. **A trade needs room and time.** 80 to 82% of trades on both machines ended on the clock, and 2-minute holds lost everywhere. Stops fired 2.8 times as often as targets on Aquarius. A tight bracket on a short clock is a fee machine.
5. **Most coins cannot pay.** Over half of Aquarius's sample trades were on coins moving under 1% in 5 minutes, where nothing can clear a 0.47% cost. Dropping the deadest coins lifted the win rate from 12.7% to 26.4%.
6. **A few hundred trades is noise.** Three results looked like wins and reversed: Fibonacci on Aquarius (+0.23% on 1,182 trades, then -1.54% on 4,072), the dip in an up-trend (+0.20% on 404, then -0.41%), Grok's early-on-X rule (+0.69 on 868, then -0.09 on 1,657). Nothing is a lead under 5,000 trades, and nothing is knowledge until it repeats on a second day.

## STRONG: one machine on big counts, or both machines agreeing after a split.

7. **Buy dips, on established coins.** Aquarius: +0.35 edge on 28,519 live trades, in every read for 17 hours. Grok, established pairs only: +0.26 and +0.33 on 8,945 and 5,457. On brand-new pairs dips lose on both.
8. **Hold the dip longer.** Its edge grew with every step: +0.21 at 2 minutes, +0.33 at 5 and 10, +0.44 at 20, +0.46 at 45. The trend had not flattened at 45 minutes.
9. **The dip's edge is on mid-size pools.** +0.57 edge on pools from $100K to $500K against +0.08 on $500K and more.
10. **Dip depth and trend filters add nothing.** 1x, 1.5x and 2x ATR dips and the up-trend filter all landed within 0.07 points of each other.
11. **X signals did not pay on big counts.** Grok's organic-author heat +0.10 on 16,417 trades and raw heat +0.06 on 19,772, both inside the noise.
12. **Drainer spam is not a signal.** The "dev stream happening now… CA:" template rides every active coin. Weight zero.

## LEADS: promising, not yet proven. The next run is built to test these.

13. **Dips on coins that really move.** On coins with a 5-minute ATR of 2 to 4% the dip made +0.30% a trade after costs (141 trades); at 4 to 8%, +2.25% (43 trades). The only cells in the green after costs. 184 trades.
14. **Fibonacci pullbacks on NEW pairs.** Grok: 50% level +1.18 edge (492 trades, range +0.58 to +1.78), 38.2% +1.05 (526). On established coins Fibonacci gave +0.06 to +0.23 on Aquarius and nothing on Grok.
15. **Following whale buys.** Grok: +0.40 edge on 700 trades, range +0.19 to +0.61.
16. **Grok's own picks.** 50 trades, 84% won, +1.49% a trade in our arena. All replay, far too few.

## WHAT NOBODY HAS YET

17. **No rule made money after costs** on either machine over a meaningful count. The best proven rule (the dip) loses 0.16% a trade. The run found what to stop doing and where to look, not a strategy to fund.

## WHAT THIS MEANS FOR THE NEXT STEP (proposals, NOT applied)

- Coin list: only coins moving 2% or more in 5 minutes, pools of $100K or more, established pairs. That is lessons 3, 5, 9 and 13 together.
- Rule: the 1x dip gets most of the volume. No breakout, no momentum.
- Exit: hold 45 minutes and longer (test 60, 90, 120); test no stop inside the hold against the bracket.
- Cost: test a cheaper entry (enter only if the next minute trades lower).
- Second lane: Fibonacci on new pairs and whale-following, kept apart, because their cost is four times higher.
- Record per trade: pair age, pool size, ATR, holders, X facts at entry. Neither ledger had all of them, which is why "why did this coin lose" cannot be answered yet.
- Real money: not before a rule is positive after costs on 5,000 trades and again on a second day.

## HOW TO USE THIS FILE
- Before a rule change: find the lesson, quote its number and count, say which tier it is.
- A PROVEN lesson is overturned only by a larger count. A LEAD is promoted only by 5,000 trades and a second day.
- New runs append here: what held, what flipped, with counts and dates.

## How people trade through Grok (researched 2026-11-18, web search; verify on the broker's own page before connecting anything)
- Grok takes "connectors" to brokers. Found: Interactive Brokers (in Grok's connector directory; Grok drafts, the user confirms each order; eligible clients can add "IBKR Autonomous Trading" inside a separate AI partition), Robinhood (custom connector `https://agent.robinhood.com/mcp/trading`, a separate ring-fenced agent account, can trade without confirmation if told to), Public.com (connector or API key), Coinbase for Agents (crypto), Liquid (third party), MetaTrader 5 with xAI as the assistant.
- Stocks and big crypto, not small Solana coins. Our training lessons were on small Solana coins.
- Alex's framing (2026-11-18): "We do not have a bot. We have me trading from my laptop. I'm just using you and Grok as fingers."
- Not yet checked: which of these accept a Greek resident, the fees, and what each prop firm says about AI-placed orders.
