---
name: up-or-down
description: Up or Down — Alex's bot for Kalshi's crypto up/down markets (the same markets Phantom shows in-wallet). Paper now, real money via his Kalshi API key. Use when he says Up or Down, Kalshi, Phantom 5-minute markets, the 5-minute bot, "the betting app", or daytrader /five.
---
# Up or Down

Live: https://daytrader.gardenbuddystore.workers.dev/five — Cloudflare worker `daytrader` (`tools/daytrader`, deploy with
`env -u CLOUDFLARE_WORKER_NAME npx wrangler deploy --config ./wrangler.toml` from that folder; without `--config` wrangler
picks up the Kerberos config and redeploys Kerberos — happened once on 2026-11-20, rolled back to 5c2d7802).

## Settled (Alex, 2026-11-20)
- Coins: BTC, ETH, SOL only, all at once. Live charts (2 s ticker) with the price to beat.
- Look: Phantom-style dark/purple, no Phantom logo or name.
- Paper stake: exactly $10 per bet, shown on screen.
- Enter every 5 minutes on all 3 coins (Kalshi rounds are 15 min, so 3 entries per round per coin).
- Real money only through Kalshi's API (Key ID + private key file). Test on Kalshi demo first. Phantom's in-wallet bets
  cannot be placed by an outside app.
- Grok joins when an xAI key is pasted; until then Alex pastes the Grok prompt himself.

## Facts checked
- Kalshi public API, no key: `api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC15M|KXETH15M|KXSOL15M&status=open`
  gives `floor_strike` (price to beat), `yes_ask_dollars`, `no_ask_dollars`, `close_time`; settled `result` is "yes"/"no".
- No 5-minute Kalshi series exists (KXBTC5M etc. empty). 5-minute BTC markets are Polymarket's.
- Fee used: $0.02 per contract (Phantom $0.01 + Kalshi $0.01).
- Backtest 2026-11-20, 1,434 real 5-min BTC rounds: momentum, reversal, trend and always-up all lose after the fee.

## How it picks (src/kalshi.mjs)
- Fair chance from live price vs strike and 1-minute volatility. If one side is 3+ cents cheaper than its fair chance:
  buy it ("value"). Otherwise take the side against the last 5-minute move ("fade": aquarius-lessons #1, never chase strength).
- Every bet records left, move5, vol, fair, ask, why — the data to learn which pattern pays (aquarius-lessons #6: a few
  hundred bets is noise; judge on thousands).
