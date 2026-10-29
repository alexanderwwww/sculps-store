# Ultra live lessons (2026-10-29, real Phantom wallet, published as live updates)
1. Buying a coin that is not moving = sitting at the entry cost. Buy only coins already rising (+2% in 30 s), with buyers ahead.
2. Flat after 3 min = sell, money back to work.
3. Thin pools rug and slip (KIMWIFHAT -80%, a -8% stop filled at -19%): pools under $15k liquidity are skipped.
4. A winner never becomes a loser: once +4%, out if it falls back to +1%.
5. Only SOL-priced pools: a "/ PUMP" pool's price is a different market (take profit +12% filled at -19.7%).
6. Exits decide on Jupiter's real sell quote, not the chart (a -8% chart stop filled at -22%).
7. A coin that just lost gets an hour off (FLOAT lost 4 times in a row).
8. Size: 0.01618 SOL base, x1.618 per win in a row (max 3 steps, max 25% of wallet), back to base after any loss.
First real wins after lessons 5-6: FOMOKING +37.3%, BTS +23.5%.
Never refuse to run on a low balance: open positions must always be managed (the restart that refused cost KIMWIFHAT -80%).
9. (07:55 UTC, bridge set, no build) Winners jump past +12% in one tick (FOMOKING filled +37%, BTS +23%), so a hard +12% target cuts them short. Now: target +30%, trailing stop 5% once up 6%, stop -7% (PODCAT's -8% stop filled at -12.5%). Wallet at that moment: 0.0885 SOL (start 0.1138).
10. (08:30 UTC, build 29) One bad Jupiter quote is noise: wifbot's -7% stop fired and the sale filled +2.2%. A stop now needs two looks in a row below it, unless the price is already 1.3x past it.
11. Size tiers (Alex): wallet >= 0.5 SOL -> base buy 0.1618; >= 1 SOL -> 0.2618 (0.1618 x 1.618); below -> 0.01618. Golden-ratio steps on win streaks on top, max 35% of the wallet per buy.
Check 08:25: wallet 0.0864 SOL (07:55 was 0.0885). Trades since: PODCAT +4.7 (trailing), PODCAT 0 (locked), DEER -10.3, wifbot +2.2. Self-taught momMin rose to 3.2%.
12. (build 30) ULTRA INSTINCT (Alex's name): read the big trades (GeckoTerminal /pools/<pool>/trades, >= max($400, 2% of liquidity)) on held coins and the busiest candidates, 2 pools per slow cycle. Whale buys >= $1500 and >= 2x whale sells in the last 2 min = buy even without the momentum wait (price must not be falling). Whale sells >= $1500 and >= 2x buys on a held coin = sell ("whales leaving"). The face glows blue-white when it fires.
13. (build 31) Golden take: at +25% (only when the target is higher than that) sell 38.2% of the tokens. Banks 0.4775 of the stake; the 61.8% left rides the trail. With the +1% win lock the worst case is ~+10% on the whole trade before fees.
14. (build 31) Purpose: the first goal is 10 SOL, shown as a gold bar under Result.
Wins so far after the lessons: FOMOKING +37.3, BTS +23.5, Cockroach +41.6, PODCAT +4.7, wifbot +2.2.
15. (09:12, build 32) VICECITY peaked +103% and closed +23.2%: the sell allowed 35% slippage, so a fast coin filled far below what we saw. Sells now go 8% slippage first, 15% if that does not land, 35% only as the last resort. Buys 12% (was 20%).
16. (build 33) 리핀 went to -100% (rug). It came in through the chart path, which skipped the live liquidity floor, and the rug check was cached forever. Now: every entry path must pass the liquidity floor (entryMinLiq 15000, set over the bridge); the rug check re-runs every 10 min; RugCheck WARNINGS that predict rugs are hard stops too (top-10 holders, single holder, low liquidity, LP unlocked, creator history, holder correlation, copycat); LP must be >= 80% locked/burned when reported; risk score > 60 is skipped.
17. (Alex: "take profit constantly") Half off at +8% (banks 0.54 of the stake), the rest locked at +0.5% once +3% is seen, target +25%, trailing 5%. Worst case once +8% is touched: about +4% on the whole trade before fees.
18. (09:48, build 35) 리핀 was bought AGAIN after its -100% (and lost -9.5%): the chart path's discovery filter only checked the pool cooldown, not the coin. Now both paths check the coin, and a coin that lost >= 50% is banned for 7 days (also rebuilt from the journal on restart).
Check 09:48: wallet 0.0740 SOL (09:15: 0.0917). Self-taught momMin is at its 8% ceiling after the losing run, so it buys rarely now. Down ~35% from 0.1138 overall.
