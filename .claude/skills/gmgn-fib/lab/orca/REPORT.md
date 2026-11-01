# Orca (DeFi yield / market making) - Round 2 report, 2026-11-01
Scripts here re-run everything: fetch_pools.py, refetch*.py (GeckoTerminal 30d hourly OHLCV, 25 pools), sim_lp.py/run_lp.py/walkfwd.py (LP sim), lending.py (DefiLlama), funding.py/carry.py (Hyperliquid 1h funding, OKX cross-check). Raw: pools30d.json, lp_results.json, lend_*.json, funding_hl.json.
Blocked from this sandbox: Binance (451), Bybit (403), Drift API, so funding = Hyperliquid + OKX only.

## 1. Concentrated-liquidity LP (daily re-centre, 30 days, 25 pools = top by 24h volume, TVL>=$300k)
Model: hourly candles, fee = volume x pool fee x (1 - protocol cut) x in-range fraction x my share; share = C/(C + value of the pool's existing liquidity over the same range). For Orca that is computed from the pool's real active liquidity (checked: Orca's reported 30d fees on SOL/USDC = 4.6% of TVL, my volume x fee reproduces it). Raydium/Meteora use the Orca median density (assumption, not measured). IL = exact CLMM position value minus 50/50 hold. Rebalance = swap imbalance x (fee+1bp) + $0.05 tx fees/day. "NET" = fees + IL - costs = LP edge vs hold (what a delta-hedged LP would earn). Directional SOL/BTC exposure is on top of that.
- Average over ALL 19 volatile pools, any width: NET -0.32 to -0.45 %/day. Fees ~0.3-1.0, IL -0.6 to -1.2. Alt/memo pools (MPLX, CARDS, ANTFUN) lost 2.6-4.1 %/day, worst week -30 to -47 %.
- Majors basket (SOL/USDC on 3 venues, WETH/SOL, WBTC/SOL, cbBTC/USDC, cbBTC/SOL), no selection: +0.31 %/day at +-1% ($1k), +0.15 at +-3%. Worst day -1.7%, 13% losing weeks, worst week -1.7%. Single pool, Orca SOL/USDC +-1%: +0.45 %/day, 13% losing weeks, worst week -2.6%.
- $100: tx cost 0.05%/day kills it on stable pairs (NET -0.035). Stable-stable +-0.05% $1k +0.010, $10k +0.014 %/day (~4-5%/yr).
- Walk-forward (pick best pool+width on days 1-14, score days 15-28): top-1 +1.5 %/day test (HYPE/SOL Meteora), top-5 +0.95; but those are thin pools ($0.6M TVL) with assumed competitor density; a $100k position would be 15%+ of the pool. Treat as unproven.
- Regime: SOL ranged ~-28% over a worst week; volume was high. Fees scale with volume; this month's volume may not repeat. I'd haircut majors by 50%: ~0.1-0.2 %/day.

## 2. Lending / stable yield (DefiLlama, Solana, TVL>$5M)
Kamino main USDC 5.7% (30d mean 5.8), Jupiter Lend USDC $444M TVL 6.6% (30d mean 6.3, 90d range 3.8-15), Kamino PYUSD 6.9 (2.6 is rewards), Kamino 8.45% USDC pool is a non-main market (higher risk). SOL lending 3.7-4.2%. LSTs earn 0 as collateral. Risks: smart-contract/oracle bad debt, utilisation lock, depeg; rates float with borrow demand (90d low 3.1-4.1%).

## 3. Delta-neutral funding carry (Hyperliquid 1h funding, 365d)
Round-trip cost 0.24% (spot 0.15 + perp taker 0.09). Gross APR: SOL 0.8% over 365d (7-8% last 90d; 39% of 30d windows were negative, funding drawdown -2.4%), BTC 5.8, ETH 6.3, HYPE 9.9, NEAR 10.8, UNI 9.5, XMR 28 (OI $139M, no clean spot hedge). Last 90d: BTC/ETH 8.6, HYPE 10.8. Net on notional BTC/ETH/HYPE 6-10%; on total capital at 3x perp leverage x0.75 = 4.2-7.5%. Walk-forward: top-5 coins by prior 9 months earned 12.4% gross next 90d (all coins 10.7%): the positive-funding regime is only about 6 months old. OKX SOL last 33d: 3.8%. Funding drawdown tiny in 2026 (<0.3%) but the real risk is margin: SOL pumped +14% in 24h, +38.5% in 7d (3x perp liquidates near +33%), so keep margin topped up. Also exchange/venue risk.

## 5. Airdrops (facts I could not source from the web search; ranges from memory, +-2x, UNVERIFIED)
JUP (Jan 2024), JTO, PYTH, TNSR (Nov-Dec 2023), W (Apr 2024), DRIFT (May 2024), PENGU: typical ordinary active wallet received roughly $50-$1,000 at launch; heavy multi-wallet farmers 5-6 figures. Required months of activity (swaps, staking, perps, NFTs), many wallets, sybil filters cut accounts, and tokens often fell 50-90% after. Cannot be scheduled: $0/day until a drop happens; no capital relationship. Zero evidence it repeats for a $30 wallet; I will not rank it as income.

## Ranking: net $/day per $1,000 and capital for $1/min ($1,440/d), $1/2min ($720), $1/5min ($288)
| Rank | Strategy (realistic net, after cost) | $/day per $1k | $1/min | $1/2min | $1/5min |
|---|---|---|---|---|---|
| 1 | CLMM LP majors, daily re-centre, hedged-equivalent, model +0.15%/d after 50% haircut (model unhaircut 0.31) | 1.5 (3.1) | $960k ($465k) | $480k | $192k |
| 2 | Funding carry BTC/ETH/HYPE, 6-8% on total capital | 0.16-0.22 | $6.5-9M | $3.3-4.5M | $1.3-1.8M |
| 3 | Stable lending 6.5% (8.4% riskier) | 0.18 (0.23) | $8.1M | $4.0M | $1.6M |
| - | Airdrops | not schedulable | n/a | n/a | n/a |
Compounding: $3,000 at 0.15-0.3%/day needs ~1,700-2,500 days to reach $480k-$960k. None of this makes $1/min with a small wallet; honest.

## What a $30 / $300 / $3,000 wallet can earn per day (best realistic) and drawdown seen
- $30: lending $0.005; LP net of the $0.05/day tx cost ~$0.00 (cost eats it); carry impossible after 0.24% entry. About $0.005/day. Drawdown: none (lending).
- $300: lending $0.05; LP majors $0.30-0.9 (+-1% daily recenter, share is tiny so fee share scales); carry $0.05. Best about $0.3-0.9/day; LP worst week -1.7% of capital hedged, and unhedged half-exposure to SOL's -28% week (~-14%) on top.
- $3,000: lending $0.53; carry $0.4-0.7; LP majors $4.5-9 (realistic 4.5). Same drawdowns.
Regime flags: LP depends on current high volume and unchanged competitor density; carry depends on funding staying positive (only the last ~6 months; SOL 365d avg 0.8%); lending rates float; airdrops are one-off.
