# Sigma round 2: the capital path to $1/min (2026-11-01)
Re-run: `/usr/bin/python3 sim.py > results.txt` (numpy; ~3 min; seeded). All numbers below are in results.txt. SOL = $95.
Edge uncertainty is sampled per path (A: 35% edge<=0, else half of measured; C: 30% fully dead at -4.3%, else measured x (1-d), d~U(.5,1); D: 8% real, else -0.4%; lottery: 4 scenarios). Strategy kill switch at -60% from peak. Ruin = wealth < max($0.5, 20% of money paid in).

## Per stream (net of cost)
| stream | edge/trade posterior mean | net %/day on wallet (central = half measured) | ceiling | K for $1/min, /2min, /5min |
|---|---|---|---|---|
| A liquid-alt mean reversion, 1.5 trades/d, sd 6% | +0.19% (P<=0 35%) | +0.38% (half-Kelly f=0.62) | $135/day at $20k/trade | $375k / $188k / $75k, but ceiling $135/day => IMPOSSIBLE from this one signal |
| B staking 5.3% APY | n/a | 0.0145% | none | $9.9M / $5.0M / $2.0M |
| C slow breakout, 3/d, sd 20% | **-0.86%** (survivor bias) | +0.59% only if the edge is real | $19/day (thin pools, $500/trade) | impossible. Kelly on the posterior says NO BET at any wallet |
| D scalp +0.3% (half: +0.15%) at 3/min | -0.35% (P<=0 90%) | astronomic if real (+430%/day) | $6,480/day | $333 / $167 / $67, but 90% of paths are dead worlds that lose 60% and get killed |
| E lottery (below) | see below | | | needs no big capital, needs EV>0 |

Time to reach K (A, capacity ignored): from $1, $30, $300, $3000 with $0/wk: median never (P(reach) 3-38% in 5 y; fastest 10% reach: never / never / 1,000-1,300 d / 520-850 d). With +$100/wk: P(reach) 37-49%, fastest-10% ~560-860 d, but P(ruin of 80%) 11-13% and 60-70% of paths hit the -60% kill. Staking: not within 60 years at any start/deposit. C: same shape, worse (78-84% killed). D: reach is a coin from the 8-10% real worlds; the other 90% are killed.

## Growth-optimal stake (rent 0.002 SOL locked, min 0.003 SOL, tx fee 0.00003 SOL)
- Wallet 0.0074 SOL ($0.70): NO BET on anything. One position is stake+rent = $0.48 = 68% of the wallet; the fee is 1.0% of a 0.003 stake. Need >= ~$30 before sizing means anything.
- A (posterior-predictive): stake ~50% of wallet at $30-$3000, growth +0.04-0.05%/trade. Treated as certain: 96-100% of wallet (Kelly > 1). Use half or quarter Kelly: at sd 6% the median max drawdown at f=0.62 is 60%.
- C: no bet at any wallet size (posterior growth <= 0). D: no bet on the posterior; if +0.15% were certain, ~100% of wallet.
- Cost sweep (gross edge fixed at half-measured): A net +0.25% at 0.5% cost (doubling 590 days), NEGATIVE at 1% and 4%. D positive only at 0.5% cost, negative at 1% and 4%. C stays positive (it is 5.25% gross): 4.6%/day at 0.5% cost, 3.8% at 1%, 0.6% at 4% (doubling 123 d) - only if the gross edge is real, which it is not shown to be.

## Chance (pump.fun tiny pools)
Data: Mara's unbiased snapshot (180 new pools; 68 traded >= 4 min; lab/unbiased/aged.jsonl does not exist yet). Buy at 4th traded minute, mark last print (upper bound): 12% end <= -90%, 50% within +-5%, non-jackpot mean -9.4%, 1 of 68 closes >= 10x and it is +805x (likely a glitch); 8/68 touched 10x on a wick (not capturable). The jackpot rate is p ~ 1/68 +- 1.5 pts.
- Break-even jackpot rate p* (jackpot 10-100x log-uniform): capture 50% of peak: 0.67% at 3% cost, 0.85% at 6%; capture 25%: 1.4% / 1.8%.
- EV per ticket at 6% total cost: p=0 -14.8%; p=0.7%,cap25% -9.0%; p=1.5%,cap50% +11.5%; p=3% +37.8%. My weights 25/30/30/15 give +2.7% mean: **the sign is not resolved by the data**. Resolving p to +-0.3 pts needs ~2,000 tradable pools (~5 days of the logger).
- Stake per ticket: EV% does not depend on stake except the fixed fee ($0.003 = 1% at $0.29, 0.06% at $5). Use $1-$5 per ticket (price impact on a ~$5k-FDV curve caps size near $5). Tickets/day: limited by ~15,900 candidates/day; plan 100-500.
- Wallet sim (6% round trip, $5 cap, 45 min hold, 365 d): 500 tickets/day, start $30 or $300: P(reach $1/5min) 44% (= P(scenario is S2 or S3), median 8-12 days), P(reach $1/min) 3.4% (needs S3 and 3000+ tickets), P(ruin < $0.5) 54-58%, P(ending above start) 42-46%. At 100/day: $1/5min 15%. These are coin-flip-on-the-premise numbers, not a business.
- Needed EV per ticket for $288/day: N=1000 5.8%, 3000 1.9%; for $1,440/day: N=3000 9.6%, 15,000 1.9% (all candidates, impossible: we move the price and bots are on the same pools).

## THE TABLE
| target | cheapest honest path | capital | expected days | what must be true |
|---|---|---|---|---|
| $1/min ($1,440/d) | none that is demonstrated. Only candidates: (i) scalp D; (ii) lottery with 3000+ tickets/day | D: $333; E: $300 | D: 1-2 days if real, but P(real) ~8-10% and round 1 found 0/240 positive; E: 190 d median, P=3% | D: round trip <= 0.5% AND >= +0.65% gross per 30-second trade, 3/min for weeks. E: true capturable jackpot rate >= 3% with 50% capture AND no competition/impact at 3000 tickets/day. Everything else (A, B, C): impossible (capacity $135 / $19 per day, or $9.9M) |
| $1/2min ($720/d) | lottery E at ~1500+ tickets/day needs EV ~10%; D | E $300; D $167 | not demonstrated | same as above, with EV >= ~10% per ticket (p>=3%) |
| $1/5min ($288/d) | lottery E, 500 tickets/day, $5 each, after 5 days of unbiased logging confirm p >= 1% (50% capture) | $300 (start; $30 works but the min stake + rent is a bigger share) | 5 days validation + 8-45 days. P(the premise holds) ~45%; P(ruin) ~55% if not validated first | jackpot rate >= ~1.5% at 50% capture (or >= 3% at 25%); a $5 buy fills within 3 s without moving the curve >2%; the 805x-type prints are real and sellable. A needs $75k AND 2+ more independent signals to pass its $135/day ceiling |

## What is impossible, bluntly
1. $1/min from any streaming-carry or mean-reversion source at any capital Alex can reach: staking needs $9.9M; A is capacity-capped at ~$135/day.
2. Compounding from $0.70: the 0.002 SOL rent plus 0.003 minimum stake plus 1% fixed fee mean no stream has positive Kelly stake until the wallet is ~$30+. A $1 start and +$100/wk adds the money faster than any edge grows it.
3. Slow breakout (C): posterior edge is negative; its total pool capacity is ~$19/day at $500/trade.
4. The scalp D is the only stream with enough turnover, and the one with the least evidence. Do not spend on it before a cost-aware out-of-sample test passes.

## Failed / caveats
- My first kill switch (-40%) killed 97% of A paths through ordinary variance and understated it; re-run at -60%.
- A first version counted staking interest on deposits as "reaching" the target (D showed 100%); fixed by excluding killed paths.
- Lottery payoff distribution (10-100x log-uniform, 25-50% capture) is an assumption: the data has one jackpot. Scenario weights are my judgement.
- A first lottery run with Beta(2,68) gave +40% EV and 'median final $55k': that was the prior doing the work; replaced by explicit scenarios.
