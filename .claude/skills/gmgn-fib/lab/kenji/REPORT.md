# Kenji: where Ultra loses the ~4% round trip (2026-11-01)
Scripts (re-runnable): pools.mjs (81 SOL pools, GeckoTerminal), rt.mjs (buy quote then sell quote of returned tokens, lite-api.jup.ag/swap/v1, same URL/slippage as the bot: buy 400 bps, sell 3500), analyse.py, stab.mjs (quote repeat + onlyDirectRoutes), logsplit.py (44 live closes, live-log-2026-11-01.json). Data: rt-results.json, stab-results.json, logsplit.json.

## 1. Live log split (44 closed trades with est)
- Mean realised -2.27%. Mean sell-quote at the decision -1.97%. Exit fill vs that quote: -0.30% mean (median -0.11%). So the exit fill is NOT the main leak on average.
- Takes (17): quote said +3.20%, fill +1.17% (gap -2.0). Winner's curse: quote spikes vanish before the sell lands. MARVIN quote +14.8% -> fill -10.6%; PIRATE +4.0 -> -1.0; REGRET +5.9 -> +1.2.
- Stops (14): quote -7.8%, fill -6.8%. The loss was already in the quote when the stop fired (q - trigger = -4.6 pts).
- 13 trades <= -5% sum to -105 pts; the other 31 average +0.16%. The whole loss is a tail of bad coins (ELON -15.5, BLACKED -12.9, tipr -6.9, MrBeast -7.7...), not a uniform 4% tax.
- 26 trades never traded above stake: first-ish quote -5.3%, fill -4.4%. Loss is in the entry (buy fill + pool fee + drift) before any exit decision.
- Fees (status recentClosed): buy 6-12k, sell 5-21k lamports = 0.4-1.1% of a 0.003 SOL stake round trip. Ledger (0.016 stake, 133 trips): fees 0.28%, gross -3.4%. Fees are a minor part at 0.016, a real part at 0.003.
- Build 80 round-trip gate: zero "round trip would cost" refusals anywhere in the 400-line log; BLACKED -12.9% (seq 76, after the restart) passed it. Gate is 5%, and in my 81-pool sample only 4 pools exceed 5% (all broken new pools: 96-99% = Meteora DAMM v2 / brand-new pumpswap with ~0 liquidity). Gate catches rugs-in-progress, not the 2-3% fee tier or drift. It could not have predicted the log losses (n too small to prove either way: ~5 trades under build 80).

## 2. Measured Jupiter round trip (81 pools, 67-68 routable)
Mean / median round trip %, count under 2% / routable
| Liquidity | n | 0.003 SOL | 0.01 | 0.03 | 0.1 |
|---|---|---|---|---|---|
| <5k | 27 | 8.7 / 2.5 (0/16) | 10.1 / 2.5 | 11.7 / 2.7 | 14.0 / 3.1 (0/15) |
| 5-20k | 8 | 1.8 / 2.4 (2/7) | 1.6 / 2.4 | 1.9 / 2.4 | 2.1 / 2.6 |
| 20-100k | 20 | 11.7* / 2.1 (10/20) | 11.4 / 2.0 | 11.6 / 2.0 | 11.8 / 2.3 (4/20) |
| 100-500k | 14 | 1.0 / 0.8 (12/13) | 1.1 / 0.9 | 1.1 / 1.3 | 1.2 / 1.3 (12/13) |
| 0.5-2M | 4 | 1.5 / 0.5 (3/4) | 1.6 / 0.6 | 1.9 / 0.8 | 2.0 / 0.9 |
| >2M | 8 | 0.2 / 0.1 (8/8) | 0.2 / 0.1 | 0.2 / 0.1 | 0.2 / 0.1 |
*means are dragged by 3 broken brand-new pools at 96-99%; use medians.
- Stake size 0.003 -> 0.1 SOL barely matters: median +0.25 pt for pools under $100k. The cost is the pool FEE TIER, flat in size: pump.fun bonding curve 2.5% (14/14 pools exactly 2.5%), pumpswap small-cap 2.0-2.5% (1.0-1.25% a side), pumpswap bigger coins 0.1-0.9%, Orca/Raydium/Meteora big pairs ~0.0-0.5%.
- Liquidity threshold: liq >= $100k -> 23/25 under 2%, median 0.5%. liq >= $50k -> 30/32 under 2% but median 0.6%; liq < $20k -> median 2.4-2.5%. Of the 81 pools (trending/top-volume, so biased to active coins), 25 have liq >= $100k and 12 >= $500k.
- Age: <30 min median 2.5% (2/20 under 2%); older than 1 day median 0.8% (26/33 under 2%). DEX: pump-fun 2.5%, pumpswap median 2.0% (24/39 under 2%), orca/raydium ~0, meteora DAMM v2 unpredictable (0.0% to 98%).
- Of the coins Ultra actually trades, tipr (21k liq) = 2.7%, ANSEM (57k) = 2.0%, paws (87k) = 2.0%, BLUE (47k) = 1.9%. They sit in the 2-2.7% fee tier before any drift.
- Quote stability (stab.mjs, 12 coins, 4 repeats each over ~6 s): identical for most; a route flip adds +1 to +1.5 pts now and then (BNB 1.7-2.8%, BLUE 2.1-3.6%, Leverhedge 2.0-2.8%). onlyDirectRoutes changed nothing for pump/pumpswap (single pool anyway) and made SI worse (2.46 -> 2.58). Route restrictions: no gain.
- Slippage setting: the quote's outAmount does not depend on slippageBps; it only sets how far the fill may fall below the quote before reverting. It cannot lower the cost, only cap the damage.

## 3. Verdict on levers
- Cost floor for coins Ultra trades today: ~2.0-2.5% pool fee + 0.4-1.1% tx fees at 0.003 stake = ~3% before one cent of drift. That is the "4%".
- Trade only low-tier pools (round trip <= 1.5%, mostly liq >= $100k): saves ~1.5-2 pts a trade. Evidence solid on cost, UNPROVEN on edge (the 240-combo backtest was negative at 4%; at ~1.2% a random entry would still be about -1.5%).
- Priority fee: already small (0.2-0.7% per leg at 0.003). Raising it buys landing speed, not price; cutting it saves <= 0.3 pt. Not worth it.
- Splitting: no help (cost flat in size, each leg pays tx fee). Waiting for quote to stabilise: quotes are already stable seconds apart; the move is the market, not the quote.
- Transfer-tax filter: round trip via sell quote already shows it (taxed/frozen = 8-99%); 5% gate handles these.
- Re-quote before every take: 17 takes lost avg 2.0 pts between decision quote and fill; abort/re-quote would trim some.
- Limit/DCA: Jupiter Trigger minimum is 10 USD per order (developers.jup.ag/docs/trigger-api). Quote implies SOL ~ 95 USD, wallet ~0.0097 SOL = ~0.9 USD. Ruled out. LP: same capital problem, plus fee income at 0.9 USD is nothing and a position needs rent.

## Failed / not proven
- Could not reconstruct entry fill vs buy quote per trade: the log has no buy quote. Needs journalling q.outAmount vs balance delta at buy (already read in buy(): quoteOut vs outAmount).
- My pool sample is trending/top-volume, not Ultra's thin fresh-coin set; the <5k bucket is small and noisy.
