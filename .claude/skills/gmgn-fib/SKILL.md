---
name: gmgn-fib
description: Alex's GMGN memecoin plan — Fibonacci entries/exits and golden-ratio position sizing on a separate wallet. Elegant sniping; fake-money training only when Alex asks. Use when he says GMGN, memecoin, trade, fib, golden ratio, grow the $10.
---
# GMGN Fibonacci plan (Alex, 2026-10-19)
Never hold or ask for a seed phrase or private key. The default is live trading from a separate Phantom wallet. Fake-money training ("Sniper XYZ") runs only when Alex asks, usually overnight while he sleeps: real GMGN coins, fake money, all night, feeding the learning loop. Never propose paper trading unprompted (Alex, 2026-10-19). The knowledge base lives in references/knowledge-base.md.

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

## Training mode engine (brain v2, 2026-10-19, `tools/ultracursor/src/trader/`)
TRAINING ONLY: fake money, real GMGN coins. There is no wallet, no key, no signing and no order anywhere. The only door to a live order is `execute.mjs`, and it throws "live wallet not connected". The live layer will act later through ultracursor in Alex's own Chrome.
- **Run:**
  - `cd tools/ultracursor && node src/trader/sniper.mjs --train` runs Sniper XYZ until Ctrl-C; add `--minutes 10` for a timed run.
  - `--status` shows the ledger, memory size and p13/21/34. `--fresh` restarts at $10; memory is kept. `--sync` uploads memory to R2. `--record f.jsonl` saves every GMGN response.
  - Old names still work: `--paper` / `--training`, and `src/trader/paper.mjs`.
  - Without `--train` the trader refuses: the live wallet is not connected.
- **Files:**
  - `fib.mjs`: levels, swing, φ sizing, resample, confluence, ladder levels, payoff W/Λ, slots, tiers, p-windows, regime.
  - `book.mjs`: the entry ladder, exits, trail, checkpoints, slots, cap, day ladder floor, milestones, real costs.
  - `ladder.mjs`: u, rungs, recovery, milestones.
  - `brain.mjs`: the strict decide().
  - `narrative.mjs`, `x.mjs`: the narrative and X senses.
  - `fees.mjs`: the fee engine.
  - `memory.mjs`, `tools-map.mjs`: memory and the tools map.
  - `lanes.mjs`, `scan.mjs`: three concurrent lanes (scan 3 s, narrative 5 s, positions 2 s).
  - `gmgn.mjs`: the read-only reader; `/vas/` paths reuse the page's own query string.
  - `gate.mjs`: the security gate.
- **The strict brain:** FIRE needs all 8 signals: prefilter, security gate, swing, confluence ≥3/5 (1/3/5/13/21m), ≥2 smart/KOL buyers in the last hour, narrative N ≥ 61.8 with GMGN and X agreeing (each ≥ 38.2), SOL regime, and a priced route with W ≥ 3|Λ| after real costs. Missing data is a NO, and there is no override. The gut and recovery can only add a NO. Every decision is journaled in memory with its reason.
- **Book (KB §7–8):**
  - Entry ladder: 38.2% at 0.5, 38.2% at 0.618, 23.6% at 0.705.
  - Exits: 38.2% at T1, then the stop goes to break-even. 38.2% at 1.272, then the stop goes to T1. When 1.618 trades, the stop goes to 1.272. Out at 2.618.
  - Checkpoints at 3/5/8/13 min; 21-minute time stop.
  - Slots 1→2→3 by win streak. Size ladder 14.6/23.6/38.2% moved by φ; it goes ÷φ after a loss and never up (a test proves no martingale over 300 trades). Σ open ≤ 61.8%.
  - Day ladder: u, rungs 1/2/3/5/8/13u, floor at checkpoint − 0.382u. Recovery goal φ·L. Tomorrow's target = today × φ.
  - Milestones B0·φ^k lock 23.6% of each gain.
- **Real costs (2026-10-19):**
  - Jupiter's keyless quote API (lite-api.jup.ag/swap/v1/quote) is reachable from here. Its rate limit answers 429 even at 1.1 s, so calls are spaced 1.5 s with backoff.
  - Cost per side = max(Jupiter buy→sell round trip / 2, the pool's fee_ratio) + token tax + network. Network = the median gas_native paid by the coin's last 50 trades, × SOL price.
  - Measured: Pump AMM pool fee 1.1–1.15% and Raydium V4 0.25%. One token had a 1% buy and 1% sell tax. Network was 0.000014–0.000064 SOL per trade ($0.0015–0.0067); GMGN's own "auto" priority suggestion is 0.000244 SOL. At $2.36 the round trip came to 2.4–6.8%.
  - GMGN's own swap fee is not exposed by any read endpoint, so the GMGN route is logged but never chosen.
  - Jupiter's priceImpactPct is not used (it barely moved between $2.36 and $100). Impact is the round-trip loss that fees do not explain; above 2.36% the trade is skipped.
  - The W ≥ 3|Λ| rule allows at most about 4.4% round trip on a clean 2x swing.
- **X:** the paid API is not used (api.x.com answers 401 without a paid key). The coin's own tweet is read through the public embed (cdn.syndication.twimg.com/tweet-result: likes, replies, blue, time; no search). Live X search runs in Alex's signed-in Chrome through ultracursor (`x.mjs search`). Its parser is not verified against live X yet: x.com shows a login wall here. nitter.net search returns no results.
- **Memory, tools map, orb and sound:** KB §10–11. The memory lives in `runtime/trader/memory/` and is mirrored to R2.
- **Tests:**
  - `node test/trader.test.mjs` (200): every rule above, a replay of recorded GMGN candles through the three real lanes, and memory across a real process restart.
  - `TMPDIR=/tmp node test/orb.test.mjs` (13): the orb only in trader mode, the KB matching disk, the orb growing, the chime only on profitable exits, and mute.
  - Fixtures are in `test/fixtures/gmgn|x|jupiter/`. pack.sh runs them all.
