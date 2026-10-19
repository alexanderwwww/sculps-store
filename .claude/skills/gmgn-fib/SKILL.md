---
name: gmgn-fib
description: Alex's GMGN memecoin plan — Fibonacci entries/exits and golden-ratio position sizing on a separate $10 wallet. Paper first. Use when he says GMGN, memecoin, trade, fib, golden ratio, grow the $10.
---
# GMGN Fibonacci plan (Alex, 2026-10-19)
Never hold or ask for a seed phrase or private key. Run paper trades first (ultracursor logs the trades it would make). Go live only with a separate Phantom wallet holding the $10, and only when the paper win rate is at least 40% after costs.

## Filters (all must pass)
- Token age: 15 minutes to 6 hours.
- Liquidity: at least $30k, burned or locked.
- Top 10 holders own under 25%. Dev wallet holds under 5% and has not sold.
- Not mintable, no freeze authority, rug and honeypot checks green.
- Volume rising, and 2 or more smart or KOL wallets bought in the last hour.

## Entry and exit: Fibonacci levels of the last impulse swing (low to high)
- Buy at the 0.618 retracement. Stop under the 0.786 retracement, about -12%.
- TP1: retest of the high, about +45%. Sell 38.2% of the position.
- TP2: 1.272 extension, about +64%. Sell another 38.2%.
- TP3: 1.618 extension, about +89%, or a trailing stop. Sell the rest.
- Time stop: no move within 21 minutes means sell.
- Break-even win rate with 6% costs is about 32%.

## Golden-ratio sizing (the most important place for phi)
- Base trade = 23.6% of the wallet.
- After a win, the next trade is ×1.618, capped at 38.2% of the wallet.
- After a loss, the next trade is ÷1.618, floored at 14.6% of the wallet.
- Max 3 trades open at once (Alex, 2026-10-19; was 2).
- Total exposure cap: open position sizes together never exceed 61.8% of the wallet. A new entry that would break it is sized down to fit; if what fits is under the 14.6% floor, it is skipped.

## Day rules
- Stop for the day at +61.8% (target) or -38.2% (stop).
- Because 1.618 × 0.618 = 1, one green day cancels one red day exactly. The wallet grows only when green days outnumber red ones.
- 10 days from $10:
  - 5 green / 5 red: $10
  - 6 green / 4 red: $26
  - 7 green / 3 red: $69
  - 8 green / 2 red: $179
  - 10 green / 0 red: $1,230

## Paper trader (built 2026-10-19, `tools/ultracursor/src/trader/`)
PAPER ONLY: no wallet, no key, no signing, no order anywhere. GMGN is read through a read-only path allowlist (`gmgn.mjs`).
- Run: `cd tools/ultracursor && node src/trader/paper.mjs` (Ctrl-C to stop) or `--minutes 30`. `--status` prints trades, wins, p, balance from the saved ledger. `--fresh` restarts at $10 (old ledger kept). `--record file.jsonl` saves every GMGN response for replay.
- Ledger: `tools/ultracursor/runtime/trader/ledger.jsonl` (every gate result, arm, entry, partial exit, close with reason) and `state.json` (resumes on restart). Gitignored.
- Tests: `node test/trader.test.mjs` (math, book, 3-open + 61.8% cap, day stops, gate on recorded GMGN data, replay of recorded GMGN candles through the real scan loop). pack.sh runs it.
- Data, proven from this container on 2026-10-19: gmgn.ai has NO documented public API, and its JSON endpoints answer curl with a Cloudflare 403. A headless Chromium that loads gmgn.ai passes, and the endpoints are called from inside that page (40-170 ms each):
  - `POST /rrs/api/v1/trending_multichain` (the trenches list, ~110 Solana tokens, abbreviated keys: a, s, ct/ot, lq, t10, smt, kol)
  - `POST /mrwapi/v1/multi_token_full_info` (security: renounced_mint, renounced_freeze_account, burn_status, lock_summary; top_10_holder_rate, creator_hold_rate, liquidity, trade_stat smart/renowned wallets, rug_ratio)
  - `GET /api/v1/tokens/top_buyers/sol/<mint>` (first 70 buyers with status: used for "dev has not sold")
  - `GET /api/v1/token_mcap_candles/sol/<mint>?pool_type=tpool&resolution=1m|5m&limit=N` (MARKET-CAP candles; fib ratios are the same as on price)
  - Bursts get a Cloudflare 429 "Just a moment". Calls are paced 250 ms apart and a 429 reloads the page and retries once. Recorded samples: `tools/ultracursor/test/fixtures/gmgn/`.
- Filters real vs approximate: age, liquidity >= $30k, LP burned/locked, top10 < 25%, dev < 5%, mint and freeze renounced, 15m volume rising (last 15 one-minute candles vs the 15 before) are real. "Dev has not sold" is real only when the creator is among the first 70 buyers; otherwise it is unknown and FAILS. Honeypot: GMGN returns null on Solana, so the gate uses can_not_sell and GMGN's alert flag (approx). Smart/KOL: GMGN gives lifetime counts, not "last hour"; on a token under 6 h that is close but not exact (approx). Missing data always fails.
- Fills are conservative: limit at 0.618, stop checked before take-profit inside a candle, the fill candle can stop out but not take profit, the stop moves to entry after TP1, 3% cost on entry and 3% on every exit. The stop is 1% under 0.786 (about -13% on a 2x impulse). A swing needs a high at least 1.5x the low with 2 candles after it.
- First live run (5 min, 22:20 UTC 19 Oct): 98 cycles, ~1.3 s each, 0 errors, 0 trades. Of ~108 trending tokens 4 passed the prefilter and all failed the gate (dev sold, falling volume). p is not known until enough trades are logged.
