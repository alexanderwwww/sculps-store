---
name: supercomputer
description: supercomputer — Alex's eyes-only trading assistant: a Chrome extension on Kraken Pro that shows 5/15-min predictions, trade plans sized to a $10 stop, movers and Grok's view. Load when he says supercomputer, Kraken prop, "be my eyes", or predictions on his chart.
---
# supercomputer (Alex, 2026-11-21)
- "I don't want you to trade for me, I just want you to be my eyes… trims the fat and gives me predictions… make it legit." Name: "supercomputer".
- Eyes only: never clicks, never places orders, never reads his account.
- On Kraken Pro: next 5 min / 15 min Up-Down with calibrated %, price range, trade plan (entry, stop, target, size) sized so the stop costs max $10; movers (top 3 setups, coins discovered live); scorecard of every call; Grok's call beside ours (paste box until a Grok key exists).
- His account: Kraken Prop $5K Advanced ($20): target $450, daily loss $150, max drawdown $150, up to 10x. Best hours 15:30-23:00 Athens.
- If the model has no measured edge, it says "stand aside". Code: tools/supercomputer.
- Look (Alex): "perfect UI like Apple made it… blue line moving". Draws its own chart: live price as a smooth moving blue line (#0A84FF), prediction drawn ahead of now for 5 and 15 min in other colors with a shaded range, entry / stop (red) / target (green) lines, Grok's call as its own marker. Frosted glass, system font, 60fps.

## Facts read live, 2026-11-21 (build 1)
- Kraken Prop program rules (kraken.com/legal/program-rules): fees 0.04% per side; daily loss from BALANCE at 00:30 UTC (02:30 Athens winter), breach checked on equity; max drawdown STATIC from the start balance (Advanced 3%); leverage fixed per market (BTC 10x, ETH 5x, others 2-5x, GOLD 5x on his screen). The rules forbid "third-party strategy" and "copying third-party trade ideas and signals": tell Alex this before he trades from the card.
- Page URLs: `pro.kraken.com/app/trade/btc-usd` (title "56,068.5 | BTC/USD Spot Trading | Kraken Pro", proven with the release build in Chromium) and `pro.kraken.com/prop/account/<id>/trade/gold-usd` (title "3,513.4 | GOLD Kraken Prop", from his screen; not opened by an agent).
- Prop GOLD tracks Kraken Futures `PF_XAUUSD` (3,517 vs his 3,513; PAXG/XAUT spot were 3,500). Futures 1m candles: `futures.kraken.com/api/charts/v1/trade/PF_XAUUSD/1m?from&to` (720 max).
- Kraken spot OHLC gives only 720 bars, so training uses Coinbase 1m USD candles (150 days, 10 coins). WebSocket v2 ticker works inside the content script on the real page.
- Measured: direction accuracy 51-57% by band on unseen data, but NO band made money after 0.08% round-trip fees; chart patterns did not beat the base rate (breakouts were right only 39-46%: lesson 1 holds). The card therefore says "No trade now · waiting" until a retrain finds a real edge. Code: tools/supercomputer, STATUS.md has the numbers.
