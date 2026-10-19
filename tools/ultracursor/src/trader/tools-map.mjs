/*
 * Every read-only tool the trader knows, mapped from gmgn.ai's own network
 * traffic (headless Chromium, 2026-10-19), the public X tweet embed, and
 * Jupiter's public quote API. Memory keeps live latency and reliability for
 * each (memory.onCall) and how often its signal preceded a win (memory.toolUse),
 * so the brain can weight or drop a tool over time, always inside the gate.
 *
 * `seenMs` = latency measured here on 2026-10-19. `used` = the brain reads it.
 * Nothing here trades: no swap, order, wallet or signing endpoint was mapped.
 */
const m = (re) => (tool) => re.test(tool);

export const TOOLS = {
  trending:       { kind: "gmgn", used: true, endpoint: "POST /rrs/api/v1/trending_multichain", returns: "~110 Solana tokens of the trenches/trending board, abbreviated keys: a, s, ct/ot, lq, mc, t10, smt (smart wallets), kol, rug, snp (snipers), m_x (X link), m_w, nt/ntg/nws, xcf/xcc/m_xctc", seenMs: 2155, match: m(/trending_multichain/) },
  fullInfo:       { kind: "gmgn", used: true, endpoint: "POST /mrwapi/v1/multi_token_full_info", returns: "security (renounced_mint/freeze, burn_status, lock_summary), top_10_holder_rate, creator_hold_rate, liquidity, trade_stat, creator_address", seenMs: 100, match: m(/multi_token_full_info/) },
  topBuyers:      { kind: "gmgn", used: true, endpoint: "GET /api/v1/tokens/top_buyers/sol/<mint>", returns: "first 70 buyers with status hold/sold/sold_part/transfered and tags; smart_pos", seenMs: 150, match: m(/top_buyers/) },
  candles:        { kind: "gmgn", used: true, endpoint: "GET /api/v1/token_mcap_candles/sol/<mint>?resolution=1m|3m|15m&limit<=500", returns: "market-cap OHLCV candles (1m used, resampled to 3/5/13/21m)", seenMs: 104, match: m(/token_mcap_candles/) },
  solCandles:     { kind: "gmgn", used: true, endpoint: "GET /api/v1/token_candles/sol/So111...112?resolution=5m", returns: "SOL price candles (regime switch)", seenMs: 85, match: m(/token_candles\//) },
  holderStat:     { kind: "gmgn", used: true, endpoint: "GET /vas/api/v1/token_holder_stat/sol/<mint>", returns: "smart_degen_count, renowned_count (KOL), insider, bundler, sniper, fresh_wallet counts among holders", seenMs: 150, match: m(/token_holder_stat/) },
  trades:         { kind: "gmgn", used: true, endpoint: "GET /vas/api/v1/token_trades/sol/<mint>?limit=50", returns: "last trades: maker, buy/sell, usd, maker_tags (smart_degen, renowned, kol ...), and the network cost each paid (gas_native SOL, priority_fee, tip_fee, gas_usd). tag= is ignored by GMGN.", seenMs: 193, match: m(/token_trades/) },
  feeInfo:        { kind: "gmgn", used: true, endpoint: "GET /api/v1/token_fee_info/sol/<mint>", returns: "pool fee_ratio per pool (Pump AMM ~1.1%, Raydium V4 0.25% seen), creator_fee_bps, buy_tax/sell_tax, security", seenMs: 198, match: m(/token_fee_info/) },
  slippage:       { kind: "gmgn", used: true, endpoint: "GET /api/v1/recommend_slippage/sol/<mint>", returns: "GMGN's recommended slippage SETTING (30% seen on every token): a tolerance, not a cost", seenMs: 158, match: m(/recommend_slippage/) },
  community:      { kind: "gmgn-social", used: true, endpoint: "GET /api/v1/token/sol/<mint>/community/messages?limit=50", returns: "GMGN community posts on the token: author, is_kol, follower_count, created_at, holdings", seenMs: 211, match: m(/community\/messages/) },
  preview:        { kind: "gmgn-social", used: true, endpoint: "GET /api/v1/live/token_preview/sol/<mint>", returns: "twitter (handle or handle/status/<id>), website, telegram, description", seenMs: 141, match: m(/token_preview/) },
  callouts:       { kind: "gmgn-social", used: true, endpoint: "POST /api/v1/notification/callout/global", returns: "the last ~50 public calls (about 1 hour): call_token, call_mc, thesis text, caller twitter_username, is_kol, is_blue_verified, holding", seenMs: 1050, match: m(/callout\/global$/) },
  gas:            { kind: "gmgn-fees", used: true, endpoint: "GET /api/v1/gas_price_list", returns: "per chain; for sol: prio, tip, auto (SOL) and low/average/high", seenMs: 164, match: m(/gas_price_list/) },
  prices:         { kind: "gmgn", used: true, endpoint: "POST /api/v1/major_coin_prices", returns: "SOL/BTC/ETH/BNB spot USD", seenMs: 136, match: m(/major_coin_prices/) },
  newPairs:       { kind: "gmgn", used: false, endpoint: "GET /api/v1/pairs/sol/new_pairs/1h", returns: "pairs opened in the last hour (most under 15 min old: too young for the age gate)", seenMs: 253, match: m(/new_pairs/) },
  walletRank:     { kind: "gmgn", used: false, endpoint: "GET /api/v1/rank/sol/wallets/1d|7d", returns: "top wallets by PnL with win counts, follow_count (a smart-wallet list for a later tracker)", seenMs: 187, match: m(/rank\/sol\/wallets/) },
  calloutSnapshot:{ kind: "gmgn-social", used: false, endpoint: "GET /api/v1/notification/callout/declaration/global_snapshot", returns: "the same calls, as declarations", seenMs: null, match: m(/global_snapshot/) },
  twitchKol:      { kind: "gmgn-social", used: false, endpoint: "GET /api/v1/live/twitch_kol", returns: "wallets of KOLs streaming on Twitch, by chain", seenMs: null, match: m(/twitch_kol/) },
  dexTrades:      { kind: "gmgn", used: false, endpoint: "GET /api/v1/dex_trades_polling?chain=sol&window=24h", returns: "chain-wide trade, volume and launch totals with change rates (market mood)", seenMs: null, match: m(/dex_trades_polling/) },
  tokenHolders:   { kind: "gmgn", used: false, endpoint: "GET /vas/api/v1/token_holders/sol/<mint>", returns: "top 100 holders with cost, PnL, tags", seenMs: null, match: m(/token_holders\//) },
  similarCoin:    { kind: "gmgn", used: false, endpoint: "GET /vas/api/v1/similar_coin", returns: "copycat tokens with the same name (theme crowding)", seenMs: null, match: m(/similar_coin/) },
  smartWallet:    { kind: "gmgn", used: false, endpoint: "GET /defi/quotation/v1/smartmoney/sol/wallet/<addr>", returns: "one wallet's PnL, win rate, tags", seenMs: null, match: m(/smartmoney\/sol\/wallet/) },
  xTweet:         { kind: "x", used: true, endpoint: "GET https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=a", returns: "the public embed of ONE tweet: text, favorite_count, conversation_count, created_at, user (screen_name, is_blue_verified). No search, no follower count.", seenMs: 140, match: m(/syndication/) },
  xSearch:        { kind: "x", used: true, endpoint: "https://x.com/search?q=<$TICKER or mint>&f=live (Alex's signed-in Chrome through ultracursor)", returns: "live tweets mentioning the coin: author, followers, verified, time, text, likes (reader: x.mjs; runs only where ultracursor's Chrome is signed in to X)", seenMs: null, match: m(/x\.com\/search/) },
  jupiterQuote:   { kind: "route", used: true, endpoint: "GET https://lite-api.jup.ag/swap/v1/quote", returns: "best route, outAmount, priceImpactPct, routePlan (AMM labels). Buy then sell quote = the real round-trip cost incl. pool fees and impact", seenMs: 335, match: m(/jup\.ag/) },
};
