# supercomputer

Your eyes on Kraken Pro. A small card in the corner of the trade page that reads the coin you are looking at and tells you, every few seconds, where it is likely to go in the next 5 and 15 minutes, whether that read has ever been worth trading, and if so the exact numbers to type. It never clicks, never places an order and never reads your account.

## Install (once)

1. Open Chrome and type `chrome://extensions` in the address bar.
2. Turn on **Developer mode** (top right).
3. Double-click `supercomputer-build-<n>.zip` so it becomes a `supercomputer` folder.
4. Press **Load unpacked** and pick that `supercomputer` folder. (Chrome does not install a zip dropped on the page; it needs the folder.)
5. Open Kraken Pro (or your Kraken Prop trade page). The card appears bottom-left.

## What you see

- **Coin and live price.** Taken from the page address (`/trade/btc-usd`, `/prop/account/…/trade/gold-usd`). Tap the coin name to pick another one.
- **The chart.** Blue line: the last 40 minutes and the live price. Light-blue cone: the next 5 minutes. Purple cone: the next 15 minutes. The dashed line is the expected path, the shaded area the likely high and low. Entry (white), stop (red) and target (green) appear when there is a plan. A detected chart pattern is drawn as a thin line with its name. Grok's call appears as orange diamonds.
- **5 MIN / 15 MIN.** Up or down, how sure the model is, the likely range, and how often that level of sureness was right on months of data it never saw.
- **Best trade now.** The scan looks at every liquid Kraken USD market by itself, all the time. It shows one trade only when its tested edge after fees is real. Otherwise it says *No trade now · waiting*.
- **Plan row.** Entry zone, stop, target and size. Tap any box to copy the number. The size is set so the stop costs at most $10 including fees and never breaks your daily-loss or drawdown floor.
- **Movers / News / Grok / Score** (tap a tab, tap again to close):
  - *Movers*: the top 3 reads across liquid pairs.
  - *News*: the newest headlines about this coin, green or red. Context only, they never change the call.
  - *Grok*: **Copy prompt for Grok**, paste it into Grok, paste Grok's whole answer back. Its call shows beside the model and on the chart.
  - *Score*: every 5- and 15-minute call is marked right or wrong when its window closes, today and all time, plus the tested accuracy per level of sureness.
- **Settings** (gear): your equity now, the balance at 02:30 Athens, the limits and leverage. supercomputer cannot see your account, so type your equity after each trade.
- **Minimise** (–): the card becomes a small pill with the coin and the 5-minute arrow. Drag it anywhere; it snaps to the nearest corner and stays there.

The build number and the Athens time are at the bottom. When a newer build is published the footer shows **Update ready**: press it, the new zip downloads; unzip it over the old folder and press the reload arrow on the supercomputer card in `chrome://extensions`.

## For the next agent

- Build and prove: `tools/supercomputer/pack.sh` (unit tests, end-to-end on live Kraken data with screenshots, release checks, zip in `dist/`).
- Retrain: `python3 -I model/fetch.py <dataDir> 150 BTC ETH SOL XRP DOGE ADA LINK AVAX LTC SUI` then `node --max-old-space-size=10000 model/train.mjs <dataDir> model/model.json`.
- Code: `src/lib/` holds the pure parts (features, model, plan, patterns, score, news, grok, recs), shared by training and the extension so both compute the same numbers.
