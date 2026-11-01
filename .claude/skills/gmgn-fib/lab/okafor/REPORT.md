# Dr. Okafor - crowd psychology report (2026-11-01)
Scripts (re-run in this folder, python3): common.py, life2.py (lifecycle buckets), p2.py (+20%/5min events, has a lookahead leak, kept as a failed experiment), p3.py (contrarian grid, baselines), p4.py (causal dead-cat / second leg), p5.py (stage table), p6.py (live cost + 28-strategy shadow promotion test), p7.py (spike reversal). Data: log.json, status.json (read-only GET).
Split: by pool (hash of mint), 100 train / 104 test pools of 204 with >=40 candles. Cost 4% round trip; stop fills get an extra -5% gap (live stop -2% filled -13% on BLACKED).

## Biggest caveat (my own finding)
collect.mjs takes pools from GeckoTerminal trending / top-volume / new lists AT COLLECTION TIME. A pool that is on those lists 1-72 h after creation already survived. So every "young pool" number is survivor-biased. Ages <30 min show median +17..+47% at 30-60 min net of cost in BOTH train and test - that is selection, not an edge, until measured on an unselected feed.

## 1 Lifecycle (forward return net of 4%, median / clipped mean, test pools)
- Age since creation <30 min: +14..+47% (30m) - survivor-biased. 30-60: ~0. >60 min: -3..-4 (pure cost).
- Euphoria (5-min +20%, age>=60): 30m -13.6% med, 60m -16%. train same sign (-16, -23). Pump chasers lose, consistently, both splits.
- Distribution (dd -20..-50% from peak, 3-15 min after peak): 30m -10..-16%, 60m -17..-20%.
- Death (dd<-80, volume <10% of peak): train -11% at 60m, test -3%.
- Capitulation bounce (dd<-50 + 1-min +5%): -9..-15% at 60m. Dip-buying is not safe either.
- Least negative: still-hot volume (vrel>=0.6, age>=60) gives clipped mean +0.4..+5% at 30-60m, but age>=180 turns it back to -0.4/-5.7. Nothing positive and stable.
- 1-min spike reversal (p7): after +3% / +8% candle, gross next 1-15 min median -0..-3%, mean +0..+3%. Gross move is smaller than the 4% toll. No reversal to harvest.

## 2 Bag-holders (+20% in 5 min, 568 events, 124 pools)
Above entry after 10/30/60 min: 44/41/39% (random minute baseline 43/46/46%). Below -20%: 14/27/38% (baseline 5/9/17%). Median -2.5/-5/-9% gross. Age>=60: only 38/33/32% above, -13% median at 60 m. Young (<60 min) events are the exception (+19..+38% median) = survivor bias again.
Causal rebuild (p4): first pump -8..-10% (age>=180: -9..-10%). Dead-cat bounce (after 40% dump, +5% candle): h60 tp50 sl25 train -4.3 / test -1.2; with tp uncapped train -9.7 / test +40 (tail noise, flips sign). Second leg (reclaim 80% of peak) occurs only 7 times in 527 events: untestable. My first dead-cat run showed +8..+12%; it used the future low - it was a leak, discarded.

## 3 Ultra's entries (log, 47 buys/47 sells since 08:40 UTC)
Exits: take-profit 17 (avg +1.17%), stops 14 (avg -6.87%), time stop 11 (-1.05%), stale 2 (-5.6%). Win rate 38%, mean -2.4%, median hold 28 s. Stake 0.003 trades: 27, -0.00213 SOL (22% of wallet), median -0.64%, mean -2.6%.
Entry texts: "rising 1-9% in 20 s", "idle pick", reasons carry "-70% failed txs (bot war)". Tp +0.6% vs 4% toll is negative arithmetic unless the quote beats the cost. Candle proxy of Ultra's entry (+3% candle) loses -7.6..-7.8% vs random -4.6%: buying the move costs ~3% more than a coin flip. Counterparties: faster bots front-run the spike (we fill at their price), the crowd of chasers is exhausted by the time a bot-flagged coin rises.
Contrarian cheapest version (buy dd>=50% from 30-min peak + 6% bounce, h60 tp50 sl25): train +3.2 / test +0.1 (n=76/88); with volume-exhaustion filter +1.4 / -5.3. 16 variants tried, best is noise level. Does not survive.

## 4 Operator
Constant trading: 1 trade/min = 4% x 60 = about 240% of stake per hour in toll; the live bleed is 22% of wallet in about 4 h. Patient: 3 trades/day at +2.5% on 0.003 SOL = 0.0002 SOL/day, i.e. trades are not the product at this wallet size; survival and measurement are.
Shadow lab (p6): 28 strategies (mom 2/4/8%, dips, 3x volume, breakout x 4 exits) on 204 pools: 0 of 28 positive on train, best -4.6% train / -3.8% test. Noise sd per trade 9%: to show +2.5% at t=3.5 needs about 157 trades per strategy; testing 50 strategies needs t>=3.5 (not 2) or best-of-50 luck (~+2.3 sigma) gets promoted.
Design: Busy app = scanner + 50 shadow strategies on live quotes, every tick logged with the real Jupiter round-trip quote (this includes true cost). Capital moves only when a strategy has >=157 shadow trades, pool-wise t>=3.5, positive in the last third, and live shadow cost measured; promoted one at a time with 0.001-0.003 SOL, auto-demoted after 20 trades under -1%.
