# supercomputer · STATUS (build 1, 2026-11-21)

## The answer first
The model reads direction a little better than a coin flip on data it never saw (51-57% by band), but **no band made money after Kraken Prop's 0.08% round-trip fee**. So today the card always ends in **"No trade now · waiting"** and shows no plan. That is the measured truth, not a bug. It will show a trade only after a retrain finds a band that pays after fees on two separate unseen periods.

## Data and method
- History: Coinbase Exchange public 1-minute candles, USD pairs, 10 coins (BTC ETH SOL XRP DOGE ADA LINK AVAX LTC SUI), 2026-06-24 to 2026-11-21. Kraken's public OHLC returns only the last 720 bars (12 h of 1m), too short to train on (read in Kraken's docs and live).
- Features (19, all scaled by the coin's own volatility): 1/5/15/60/240-minute moves, volatility regime, RSI on 1m/5m/15m, 5m ATR, distance to 1 h and 4 h VWAP, volume spike, position in the 1 h and 4 h range, distance to 1 h / 4 h EMA, time of day. Same code (`src/lib/features.js`) in training and in the extension.
- Model: logistic regression (IRLS, L2), one per horizon. Time split, never shuffled, 1-day gaps: TRAIN to 2026-09-07, VALID to 2026-10-07, TEST 2026-10-07 to 2026-11-21 (about 210,000 calls per horizon).
- The % on the card is the band's VALID hit rate (calibrated), "tested" is its TEST hit rate.
- A band is "edge" only if: above 50% AND above the naive side with 95% confidence on VALID and on TEST, and its trade plan (stop, target, hold chosen on VALID; replayed on real 1m bars, stop first when a bar hits both, 0.04% fee each side) made money on both.

## Measured out-of-sample (TEST) accuracy by band
| Sure | 5 min right | calls | 15 min right | calls |
|---|---|---|---|---|
| 50-52% | 50.3% | 108,734 | 50.5% | 86,184 |
| 52-54% | 51.7% | 66,414 | 51.9% | 66,203 |
| 54-57% | 53.3% | 29,410 | 53.4% | 46,662 |
| 57-60% | 55.3% | 3,850 | 54.6% | 9,966 |
| 60%+ | 56.0% | 500 | 56.7% | 1,593 |
| All | 51.3% | 208,908 | 51.8% | 210,608 |

The period's down share was 51.3% (5 min) / 51.7% (15 min), so "always say down" scored about the same overall; only the 54%+ bands beat that with confidence ("direction edge"). Plan replay after fees on TEST (all calls 52%+): 5 min -0.16% a trade over 291 trades, 15 min -0.25% a trade over 1,099 trades. One cell was positive (5 min 57-60%: +0.39% a trade) on 30 trades: noise by Aquarius lesson 6, and VALID did not confirm it.
Likely range: the 80% band held 81.0% of the time on TEST for both horizons.

## Chart patterns, measured (TEST hit rate in the pattern's own direction, 15 min; 5 min within 1-2 points)
| Pattern | calls | right | | Pattern | calls | right |
|---|---|---|---|---|---|---|
| double bottom | 46,413 | 47.4% | | double top | 49,335 | 50.8% |
| higher low after sell-off | 39,042 | 47.1% | | lower high after rally | 38,174 | 50.0% |
| range breakout on volume | 1,561 | 39.1% | | range breakdown on volume | 2,570 | 44.3% |
| bullish engulfing at support | 2,751 | 48.9% | | bearish engulfing at resistance | 2,216 | 55.5% |
| hammer at support | 3,007 | 50.7% | | shooting star at resistance | 2,526 | 54.6% |
| bullish RSI divergence | 14,706 | 47.5% | | bearish RSI divergence | 13,057 | 51.3% |
| VWAP reclaim | 9,388 | 45.2% | | VWAP rejection | 9,539 | 48.7% |
| Fib pullback in up-leg | 17,328 | 48.4% | | Fib pullback in down-leg | 20,472 | 53.5% |

Base rate to beat: 51.7% (down share). Hammer, shooting star and both Fib pullbacks passed VALID, but adding them to the model lowered TEST accuracy (5 min -0.01, 15 min -0.04 points), so **no pattern changes the call**: they are drawn on the chart and named in the "why" as context. Breakouts were right only 39-44% (Aquarius lesson 1 holds here too).

## Proven (run here)
- 11 unit tests (`node --test test/unit.test.mjs`): indicators, features (same at any price scale), model inference, sizing ($10 stop incl. fees, daily/drawdown floors, leverage cap, pair minimum), plan guards (no edge, chasing), scorecard, Grok parsing, news, Kraken parsing, recommendation replay and learning, patterns (no look-ahead).
- End to end (`test/e2e.mjs`, 26 checks): the built extension in Playwright's Chromium on a local stand-in for the Kraken Prop page, live Kraken data. Price matches Kraken REST within 0.5%, Prop URL detection (`/prop/account/<id>/trade/btc-usd` and `gold-usd`), GOLD price equals Kraken Futures `PF_XAUUSD`, WebSocket live feed, chart drawn, movers scan (15-20 liquid pairs found live), news, Grok paste, scorecard, coin picker, pill, corner snap, position remembered after reload, no page errors. Screenshots: `dist/shots/`.
- **Release build on the real pro.kraken.com**: unzipped from the zip, loaded in Chromium, opened `https://pro.kraken.com/app/trade/btc-usd` (signed out): the card appeared, detected BTC/USD, live WebSocket price, no errors (`dist/shots/11-real-pro-kraken.png`).
- Eyes only: the bundle has no private API path, no order call, no synthetic click (checked by `pack.sh`).

## Not proven
- **The Kraken Prop page itself** (`/prop/account/<id>/trade/...`): needs his login. URL format and title come from his screen; tested on a stand-in page only. Leverage is read from text like "GOLD 5x" on the page; if not found, the setting is used.
- **GOLD**: price source is Kraken Futures `PF_XAUUSD` (3,517 vs 3,513.5 on his screen; PAXG and XAUT spot were 3,500). The model was never tested on gold or fiat, so those markets get no call and no plan.
- **No trade plan has been shown live**, because no band has an edge. The plan math is unit-tested only.
- Scorecard settling of real calls over hours, and the learning ("down-weight what loses"), are unit-tested; the e2e run is shorter than one 5-minute window.
- Daily loss: Kraken Prop measures it from the balance at 00:30 UTC (02:30 Athens in winter, 03:30 in summer). The card cannot see the account: Alex types "Equity now" and "Balance at 02:30 Athens" in Settings.
- News is context only: there is no archive of these headlines to test against prices.

## Self-update (rule 35), honestly
Chrome cannot replace an unpacked extension by itself. Built: the background checks `SC_UPDATE_URL` (a `version.json` with `{build, zip}`) every 6 hours; when the published build differs from the running one (either direction) the footer shows **Update ready · build N**, one click downloads the zip, Alex unzips it over the folder and presses reload. **The update address is not set in build 1** (nothing was deployed), so the check is off until a `version.json` is hosted and the extension rebuilt with `SC_UPDATE_URL`. `pack.sh` writes `dist/version.json`.

## Limits and rules to tell Alex
- **Kraken Prop rules forbid "copying third-party trade ideas and signals" and "third-party strategy"** (kraken.com/legal/program-rules). Using this card's calls, or Grok's, could fall under that. He should read that clause before trading from it.
- Fees 0.04% per side, drawdown static 3% from $5,000 ($4,850 floor), daily loss 3% of the 00:30 UTC balance, leverage fixed per market (BTC 10x, ETH 5x, others 2-5x).
- Public data only: Kraken REST about one call a second while scanning, WebSocket for the coin in view.
