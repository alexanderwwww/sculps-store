# Nansen Smart Money (Solana): what the free account shows and what it means for the bot
Collected 2026-11-16 14:40-14:52Z through Alex's free Nansen account. Data: `tools/mob/data/nansen/smart-money-2026-11-16.json`, raw page text in `tools/mob/data/nansen/raw-2026-11-16/`.
Every number below is REPORTED by Nansen. Nothing was checked on chain.

## The crawl stopped early. Read this first.
The leaderboard's Label filter opened with every option greyed out and an "Upgrade Now" button. The brief was to stop at a paywall, so the crawl ended at 49 of 700 actions.
- Have: leaderboard 30D page 1 (20 wallets), 1 wallet Profiler page (full address), tokens tab page 1 of both tables, 200 live trades (177 after identical repeats removed, about 8 hours).
- Do not have: 7D/90D/180D, leaderboard pages 2+, the ~150 Profiler pages, cap buckets, tokens pages 2+.
- So: nothing here is a multi-period finding. 20 wallets and 8 hours are a small sample. The rules below are proposals to test, not proof.

## Free vs paywalled
- Free: leaderboard table, Profiler page (full address in the URL, funder, balance, realized PnL, W/L counts, labels, holdings), Top Tokens tables, Trades feed 10 pages x 20 rows.
- Paywalled: Label filter. Categories listed: Smart Money (2), Fund (1), Behavioral (8), Public Figure, Exchange, Social (1), Deployers (2).
- Not tested: period buttons, Filter, cap buckets, trades past page 10, Profiler tabs Performance/Counterparties/History.
- Full address needs one click per wallet (about 4 browser actions each). Row text only gives 8-character prefixes.
- The older file `snapshot-2026-11-161426.json` calls its first block 7D. The click did not register; it is the 30D default.

## How Nansen's columns behave
- Leaderboard "Win Rate" is not per trade. RaRa shows 39.13% with 3,498 trades; his Profiler shows 32.4% = 1,963 wins / 4,095 losses over 6,058 trades. Leaderboard values are small fractions (25%, 33.33%, 42.86%, 66.67%), so they look like wins per token. A 100% there can be 1 token.
- Total PnL includes unrealized bags. Realized PnL is the honest column.

## Winners: consistent vs lucky (30D top 20)
- Three wallets show 100% win rate. They traded 1, 4 and 2 tokens (198, 8 and 74 trades). That is one or two good coins, not a record.
- 8 of 20 have under 100 trades: median 3 tokens, median realized $87.0K. 5 of them have under 35 trades (10, 8, 15, 28, 31).
- 12 of 20 have 100+ trades: median 17 tokens, median win rate 54.55%, median realized $72.7K.
- Realized profit per trade splits the board in two: few-trade wallets make $2,785 to $8,397 per trade (big size, few coins); high-count wallets make $6 to $93 per trade (gtsb 11,353 trades, vvs000 3,802, purplereign 1,899, onlyswz 1,994, 99M1WZdb 2,112). The second group are grinders or bots.
- Number 1, RaRa: labels "Automated" and "mihao Token Deployer"; 92.15% of his $552K balance is MIHAO, the coin he deployed. Total PnL $1.19M vs realized $751K. He is a deployer sitting on his own coin, not a trader to copy.
- Profit is concentrated in shared coins: one pump mint (4Cxj...) is in the top-5 list of 5 of the 20 wallets, another mint (A7bd...) in 5, the CLoUD... mint in 4. 9 of 20 wallets show no pump.fun mint at all in their top tokens; the high-count wallets are mostly pump mints.

## How they trade (177 feed trades, 8 hours, 39 wallets)
- Size: median $81; quarter under $34; three quarters under $314; 90% under $748; largest $5,990. 57 trades (32%) under $50; 10 at $1,000+. SOL was about $72, so the median is about 1.1 SOL.
- The feed is a few busy wallets: the top 3 made 33% of all rows (shalla555 24, SmoreGanic 25, 9CXAmZ8B 16). Many are repeated same-size clips (0.99 SOL at a time).
- 61 different tokens; only 13 were touched by 2 or more labelled wallets (DACITYCOIN 4, TTWO 3, TRUMPEDO 3, DOUG 3).

## Buying or distributing right now
- Feed, 8 hours: 99 buys of tokens for $26.6K vs 67 sells for $17.9K. Net +$8.7K into tokens, but tiny and driven by a handful of wallets.
- Stablecoins: $26.1K left stables vs $8.3K went into stables. No rush to stables in this window.
- Net sold: MIHAO -$3.2K, GTA6 -$2.7K (8 sells, 2 buys), MASK -$1.4K, ROCKSTAR -$1.4K. Net bought: NIO +$3.1K, DOUG +$2.5K, JUPSOL +$2.4K, ZCAT +$2.0K.
- Tokens tab (14:29Z, top 12 by 24H inflow, so biased to buying): the same 12 sum to +$36K over 7D and -$114K over 30D. DACITYCOIN -$128.9K and ZCAT -$130.9K over 30D while being bought today. Reading: dip-buying inside a month of distribution.
- Holdings (top 12 by holder count): ZEC $1.68M (65 holders), CARDS $1.07M, ANTHRP $895K (+628% in 24h), ANSEM $622K, PUMP $398K with balance -58.83% in 24h, TTWO -13.63%, WBTC $182K. The big bags are established or large-cap names, not fresh launches. PUMP is being dumped.
- Cannot say from this data: token age and market cap bucket of what they buy (age column arrives glued to the traders column; cap buckets not read), and trade frequency per wallet beyond the 30D trade counts.

## Against our audit (audit-2026-11-16.md)
Our whale book called 212 wallets winners; 108 had exactly 2 closed coins and 60 held under 60 seconds. Nansen's own board has the same disease: 3 of the top 20 are 1-to-4-token wallets with "100%", and number 1 is a deployer. A leaderboard rank is not a reason to follow.

## A wallet worth following (proposed, on Nansen's columns)
All must hold:
1. Present in the top list of at least 2 periods, one of them 7D (still active). Not yet checkable: only 30D was read.
2. 30D trades between 30 and 2,500. Under 30 is luck; over 2,500 is a bot (realized per trade under $50 on our data).
3. At least 8 tokens traded in the period.
4. Realized PnL positive and at least half of Total PnL (not living on one unrealized bag).
5. Leaderboard win rate 40% to 80%. 100% is rejected.
6. Realized per trade at least $100.
7. Profiler: no "Automated" or "Deployer" label, top holding under 50% of balance.
On the 30D top 20 this passes 3 on the columns we have: CAcPyBM3 (176 trades, 10 tokens, $919/trade), BoldBusyBass C2Ne4STi (159, 10, $421), 3aWs1Tnm (193, 8, $339). J3ekaUh3 (147 trades, 7 tokens) misses by one token. Their Profiler pages were not read.

## Five rules for the bot
1. **Never follow a wallet on rank or win rate alone; apply the definition above.** Numbers: 3 of 20 show 100% on 1-4 tokens; number 1 is an Automated deployer 92% in his own coin; 5 of 20 make under $50 per trade. Falsified if, over 200+ signals, wallets failing the definition give the same or better median 15-minute forward return than wallets passing it.
2. **Ignore labelled trades under $300.** Median feed trade is $81 and 32% are under $50; the bot's current floor is $50 (`NANSEN.minUsd`). Only the top quarter ($314+) is real conviction. Falsified if sub-$300 buys show a positive median forward return above control on 200+ signals.
3. **A signal needs 2 or more qualifying wallets buying the same token inside the window.** Only 13 of 61 tokens had 2+ labelled wallets; the rest is one wallet clipping. Falsified if single-wallet signals do as well as 2+ wallet signals on 200+ signals.
4. **No buy when the token's 30D smart-money flow is negative, even if 24H is positive; treat labelled sells and a falling holdings balance as an exit.** DACITYCOIN and ZCAT: bought today, -$129K and -$131K over 30D. PUMP: balance -58.83% in a day. Falsified if tokens with negative 30D flow and positive 24H flow outperform the rest over the next day in 50+ cases.
5. **Do not copy the grinders' speed.** The wallets with 1,900 to 11,353 trades in 30D make $6 to $41 per trade. Our measured round trip is 1.31% (audit) with no latency edge, so that margin is not ours to take. Follow only wallets whose profit per trade is $100+ and hold longer. Falsified if the bot's measured cost drops under 0.3% round trip, or grinder-follow signals beat control after measured cost on 200+ signals.

## To finish the job
Alex decides whether the crawl continues on the free view (periods, pages, Profiler clicks) with the Label filter left alone. About 650 actions remain; at about 4 actions per wallet that is roughly 120 full addresses, not 150, after the leaderboard and tokens pages.
