# Hawk report, round 2 (2026-11-01). All numbers from scripts in this folder; data in data/.
Data: OKX perps 5m x 180d (BTC ETH SOL DOGE XRP LINK AVAX), 1m x 20d, 304 OKX perp listings (hourly, first 10d), Hyperliquid funding 200d x 20 coins + 1h candles, Polymarket 1094 resolved markets (12h prices) + 596 live neg-risk events, Kalshi 47 live exclusive events, 215 live Jupiter-vs-OKX quote pairs.
Not reachable from here: Binance (451), Bybit (403). Not measured: maker fill rates, real liquidation feed (only OKX recent), latency.
## Brainstorm (14): 1m-15m mean reversion, momentum, liquidation fades, CEX-DEX basis, funding extremes, funding carry, new-listing fade, PM neg-risk arb, PM long-shot, PM favourite-bond, PM resolution lag, cross-exchange perp basis (OKX/HL), Solana LP fees, stablecoin/depeg + lending-rate carry, Hyperliquid/OKX maker rebate quoting.
## Tested (script: result)
- bars_test.py 1m (res_1m): 0/54 configs positive train+test. Gross edge <=0.065% vs 0.10% taker. DEAD.
- bars_test.py 5m (res_5m): 0/54. DEAD.  15m (res_15m): 5/54 positive both halves at taker cost, best (6 bars,3.5 sigma,hold 12 bars, reversal) n=214/144, +0.35%/+0.11% per trade, ~2 trades/day.  1H (res_1h): 13/54 both halves; (6,2.5,hold 6) +0.04%/+0.36%, 1.2/day; (6,1.5,hold 12) +0.03%/+0.13%, 5.8/day, dd 41%. ALIVE BUT SMALL.
- basis.py: SOL basis sd 0.006%, max gross 0.087% vs 0.05% OKX taker + Jupiter + transfer; JUP same; WIF/BONK Jupiter round trip alone costs 0.3-0.6%. 0% of samples above 0.10%. DEAD.
- funding_test.py: extremes fade n<=75 per cell, train negative, test mixed. Carry 6.2%/yr mean (BTC 6.8%). DEAD at this size.
- listing_detail.py: short OKX perp 24h after listing, hold 96h, 30% stop, 0.4% cost: +1.7% first half / +1.7% second half, n=152 each, win 55%, 95% CI of whole [-0.2,+3.6]; unstopped worst -156%. 72 configs tried. UNPROVEN.
- pm_calib.py: long-shot NO +/-0 to negative; 97-99.5c favourite YES +0.4..0.6% net but n 13-23 and a single loss erases ~100 wins. DEAD/tiny.
- pm_arb.py + pm_depth.py: 33 apparent buy-all and 10 sell-all gaps of 596 events; they are traps: augmented neg-risk (unlisted "other" can win), and book depth erases them at 100+ shares. Kalshi: all apparent gaps are non-exhaustive events. DEAD.
