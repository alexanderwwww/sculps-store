# Kenji follow-up: big stakes (0.105 / 0.21 / 0.42 SOL = $10/$20/$40), 41 pools, GET quotes only (big.mjs -> rt-big.json)
Round trip % median / p90 (impact = buy priceImpactPct, median / p90, includes the pool fee on pump pools)
| Liquidity | n | 0.105 | 0.21 | 0.42 |
|---|---|---|---|---|
| >=1M | 10 | 0.06 / 0.56 (imp 0.03/0.28) | 0.12 / 0.60 (0.03/0.13) | 0.14 / 0.60 (0.02/0.13) |
| 100k-1M | 13 | 1.10 / 1.74 (0.66/0.93) | 1.14 / 1.83 (0.67/1.07) | 1.14 / 1.87 (0.50/1.10), max 3.38 |
| 20-100k | 18 | 2.23 / 2.53 (1.75/2.18) | 2.25 / 2.69 (1.87/2.32) | 2.52 / 3.00 (1.89/2.36), max impact 3.3% |
- Size barely matters up to $40: the fee tier dominates. Impact is not the problem until a pool is under ~$50k.
- Floor for a $20 trade at <=1.5%: liq >= $100k gives 20/23 under 1.5% (p90 1.63%); liq >= $200k gives 18/18 (p90 1.11%). At $40 and $200k: 17/18. Below $100k: median 2.25%, only 2/18 pass. Use $200k to be safe, $100k plus a live quote check as the minimum.
- Coins passing now (snapshot of GeckoTerminal trending + new + top pools taken an hour ago, 81 pools): 21 pass (liq >= $100k and small-size round trip <= 1.5%), 18 at >= $200k. From trending: 25 of 48 have liq >= $100k; from new pools: 1 of 33. So the cheap set is almost all established coins, almost none of the fresh ones Ultra trades.
## Ultra caps (current file: maxImpact 0.03, maxRoundTrip 0.02, buySlippageBps 400)
- maxRoundTrip 0.02: passes all >=$200k and 22 of 23 pools >=$100k at $40; refuses nearly every 20-100k pool (median 2.25%). Suggest 0.015 for $20 trades.
- maxImpact 0.03: refuses only SIS at $40 (3.3%); cheap pools max 1.85%. Suggest 0.02.
- buySlippageBps 400: too loose when the quote cost is 1%; a fill can lose 4% silently. Suggest 150 (quotes flip +1 to +1.5 pts on route changes; 150 bps absorbs that).
- Note: wallet is 0.0097 SOL; $10 needs 0.105 SOL, so these sizes need a bigger wallet first.
