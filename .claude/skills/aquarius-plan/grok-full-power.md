# Grok Desk full-power data pack (Alex, 2026-11-16: "write him all our data and skills, whales, trades, tools; 10 sol, big positions")

FULL POWER. Alex gives you everything Aquarius has: data, tools, whales, lessons. Use all of it, run your own machine your own way, stay on PAPER until he says "go live".

SIZE
Paper wallet 10 SOL. Big positions: 2.6 SOL per trade, 3 open at most. Weak ideas 1.3 SOL. Always quote your cost at the REAL size, never more than 1% of the pool's liquidity.

FREE TOOLS THAT WORK (all tested today, no key needed)
- Wallet scorecard: GET https://datapi.jup.ag/v1/pnl?addresses=<wallet>  (every coin the wallet traded: realized and unrealized profit, buys, sells, wins, losses, first and last active time; one address per call)
- One wallet on one coin: GET https://datapi.jup.ag/v1/pnl-positions?address=<wallet>&assetId=<mint>
- A wallet's swaps on a coin: GET https://datapi.jup.ag/v1/txs/<mint>?limit=30&traderAddress=<wallet>
- All recent swaps on a coin: GET https://datapi.jup.ag/v1/txs/<mint>  (fields walletCategories "whale", holderTags "bundler", isMev: ignore MEV, treat bundlers as a warning)
- Top 100 holders with who funded each wallet: GET https://datapi.jup.ag/v1/holders/<mint>  (addressInfo.fundingAddress: two wallets with one funder count as one person)
- 1-minute candles: GET https://datapi.jup.ag/v2/charts/<mint>?interval=1_MINUTE
- Live price: GET https://lite-api.jup.ag/price/v3?ids=<mint>
- Real cost: GET https://lite-api.jup.ag/swap/v1/quote?inputMint=...&outputMint=...&amount=...  (quote the buy and the sell at your size; space calls 1.5 s)
- Newest tokens: GET https://lite-api.jup.ag/tokens/v2/recent    Trending: GET https://lite-api.jup.ag/tokens/v2/toptrending/24h?limit=40
- Narratives by volume: GET https://api.dexscreener.com/metas/trending/v1    Search a theme: GET https://api.dexscreener.com/latest/dex/search?q=GTA6
- Safety: RugCheck public report (holders, insiders, locked liquidity). Mint and freeze authority from the Solana network.
- Named winning wallets: GET https://kolscan.io/leaderboard  (HTML; the list is embedded as initLeaderboard, 48 wallets each for 1, 7 and 30 days)
- News: CoinDesk, Cointelegraph, Decrypt, The Block RSS; Google News RSS search; Telegram public previews t.me/s/whale_alert_io and t.me/s/WatcherGuru
- Fear and Greed: alternative.me. SOL and BTC 1-minute candles: Hyperliquid candleSnapshot or data-api.binance.vision klines.
- Dead ends, do not waste time: CryptoPanic, LunarCrush, Reddit, pump.fun's own APIs, GeckoTerminal from cloud servers (rate limited), Birdeye, Cielo, Dune, Solscan and Arkham without paid keys.
The Jupiter data endpoints are unofficial: be gentle, cache, and keep a fallback.

WHALES TO WATCH (16 wallets that passed our filter today: profit in both the last 7 and 30 days, 30 to 2,500 coins, win rate 40-80%; KOLscan's numbers, not checked on-chain by us)
J23qr98GjGJJqKq9CBEnyRhHbmkaVxtTJNNxKu597wsA  gr3g  (30d +1538 SOL, 7d +1483, win 48%, 215 coins)
5hAgYC8TJCcEZV7LTXAzkTrm7YL29YXyQQJPCNrG84zM  Schoen  (30d +1438 SOL, 7d +670, win 51%, 2124 coins)
ardinRsN1mNYVeoJWTBsWeYeXvuR9UUDGMsCDKpb6AT  trunoest  (30d +1338 SOL, 7d +369, win 54%, 2156 coins)
862TYSvRYoiHAK3F3WwTRYAfuGiQaGdxedN9AGvRGWo2  Wugi  (30d +1118 SOL, 7d +299, win 74%, 115 coins)
B32QbbdDAyhvUQzjcaM5j6ZVKwjCxAwGH5Xgvb9SJqnC  Kadenox  (30d +1061 SOL, 7d +324, win 54%, 1219 coins)
J9TYAsWWidbrcZybmLSfrLzryANf4CgJBLdvwdGuC8MB  Johnson  (30d +648 SOL, 7d +254, win 58%, 675 coins)
BQVz7fQ1WsQmSTMY3umdPEPPTm1sdcBcX9sP7o6kPRmB  Limfork.eth  (30d +640 SOL, 7d +444, win 53%, 1710 coins)
5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg  Doji  (30d +617 SOL, 7d +276, win 60%, 869 coins)
89HbgWduLwoxcofWpmn1EiF9wEdpgkNDEyPjzZ72mkDi  AlxCooks  (30d +418 SOL, 7d +270, win 41%, 1565 coins)
4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk  Jijo  (30d +345 SOL, 7d +64, win 55%, 429 coins)
G6fUXjMKPJzCY1rveAE6Qm7wy5U3vZgKDJmN1VPAdiZC  clukz  (30d +305 SOL, 7d +52, win 48%, 449 coins)
8oQoMhfBQnRspn7QtNAq2aPThRE4q94kLSTwaaFQvRgs  big bags bobby  (30d +255 SOL, 7d +43, win 47%, 228 coins)
78N177fzNJpp8pG49xDv1efYcTMSzo9tPTKEA9mAVkh2  Sheep  (30d +246 SOL, 7d +139, win 53%, 729 coins)
8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5  Daumen  (30d +213 SOL, 7d +79, win 57%, 1994 coins)
6FWhUybWmnjsQ933v2r6o7bhEG5yH9g9XsV7NVWKj5EW  WheresLodo  (30d +210 SOL, 7d +105, win 49%, 1065 coins)
FqamE7xrahg7FEWoByrx1o8SeyHt44rpmE6ZQfT7zrve  EustazZ  (30d +174 SOL, 7d +50, win 42%, 2411 coins)
They are public figures: many people copy them and they can sell into followers. A buy from one of them is a lead. Two or more of them on the same coin within 15 minutes is a real signal. Re-score them yourself with the pnl endpoint before trusting any.
Nansen's 30-day board (their labels, not verified by us): the number 1, RaRa (9tH2zRYdS3X7PEcsPno3GST1EHe8GX8CSNih1pKpamAp), is an automated wallet and the creator of the mihao coin with 92% of his balance in it. NOT one to copy. Wallets passing our definition there, by address prefix: CAcPyBM3, C2Ne4STi (BoldBusyBass), 3aWs1Tnm.

WHAT OUR OWN TRADES TAUGHT US (83 paper trades, audited against the database)
- 75% of the loss was cost. Mean round trip 1.31% on tiny trades; 0.53-0.56% at 1.3 SOL. Real network fee is about 61,000 lamports a side on average (median 15,001).
- Tradability test: skip any coin where 6 x round-trip cost is more than 3 x its 5-minute ATR. Big coins moved 0.4% in 30 minutes: untradable. Mid coins about 1% upside per 30 minutes. Only volatile small coins had room, and their cost is about 3%.
- Breakout buying: 22 trades, 3 wins. It buys the top after the move. Replay on 202 trades: -0.93% a trade.
- Following our first whale list: no edge (median +0.07% after 15 minutes against 0% for random coins). The list was full of bots: holds under 60 seconds, buy and sell in the same second, a wallet with 11,541 buys in 5 days.
- Stops at 1.5 x the 5-minute ATR sat inside normal noise: after 10 of 15 stop-outs the price was higher 15 minutes later.
- Best price came about 11 minutes after entry. Checking prices once a minute is too slow: one stop filled 7.4% past its level.
- Smart money's own trades are small (median 81 dollars) and this week they buy dips inside a month of selling.
- A bug that cost us: a sell button pressed fast sold the same positions three times. Every sale must claim its position first, in one step.

MARKET TODAY
Fear and Greed 10. SOL about 71 dollars, down 18% in a week. GTA 6 releases Thursday 2026-11-19. The older GTA6 token (4kjruqGHDsSqkMdFfCjV7Vb62HPFhtXyWc2t6JpQzDnz) has about 320k dollars of liquidity; rockstar (9HFUEab7sompLDPTAaTGkryMNGbtBaFMhHMVpJEBpump) is days old; clones are thin and wallet-drainer scams are running.

YOUR MOVE
Take all of this, rebuild what you need, and trade your way. Change your own rules when your evidence says so, and write down each change with the reason. Your laws stay: never buy what you cannot sell, costs first, stop never larger than target, a ledger that always reconciles, the truth to Alex after costs, and no real money until he says "go live". Keep sending your picks (aq_submit_pick) and your X radar (aq_post_evidence) so the contest shows on his panel.
