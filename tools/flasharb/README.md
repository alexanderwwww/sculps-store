# flasharb — Solana flash-loan arbitrage scanner (simulation only)

Borrows USDC from Kamino in a flash loan, buys a token on one DEX, sells it on another, repays — all inside one transaction. This step only **looks** and **simulates**. There is no code that signs or sends a transaction. Your wallet is a public address only; no private key is ever asked for or read.

## Setup (once)

1. Node 22 or newer.
2. In this folder: `npm install`
3. Copy `.env.example` to `.env`. It already holds your public Phantom address as `WALLET_PUBKEY`. Change sizes or limits there if you want.

## Use

| Command | What it does |
|---|---|
| `npm run scan` | Scans forever, prints a table every round, writes every result to `logs/scans.jsonl`. `npm run scan -- --count 3` stops after 3 rounds. |
| `npm run simulate` | Scans once, takes the best route at the headline size, builds the full flash-loan transaction and simulates it on mainnet. Nothing is sent. |
| `npm run simulate -- --route "SOL,Whirlpool,Raydium CLMM" --size 1000` | Builds and simulates one exact route. |
| `npm run simulate -- --stand-in-wallet` | Simulates from a public mainnet wallet that holds USDC (found on chain), so a losing trade can still complete and show every step. |
| `npm run gold` | Checks which DEXes can trade each gold-backed token, from live quotes. |
| `npm test` | Runs the tests. |

## Settings (`.env`)

- `TRADE_SIZE_USDC` — the headline size (default 100,000). `COMPARE_SIZES_USDC` — the other sizes scanned (default 1,000, 10,000, 1,000,000).
- Tokens are picked live from Jupiter's verified list: `MIN_TOKEN_LIQUIDITY_USD` (default $5M), `MAX_TOKENS` (10), `EXCLUDE_TAGS`, `ALLOW_TOKEN_2022` (off). `PAIRS=SOL,JUP` narrows the list.
- DEXes are found live for each token. `DEXES=` pins a list instead.
- `SLIPPAGE_BPS`, `COMPUTE_UNIT_LIMIT`, `COMPUTE_UNIT_PRICE_MICROLAMPORTS`, `RPC_URL`, `JUPITER_API_KEY`, `JUPITER_RATE_PER_MIN`.

The free Jupiter API allows about 100 requests a minute, so one round over 10 tokens takes several minutes. A paid Jupiter key and a private RPC make it faster.

Every source for every address and function is in `SOURCES.md`. What has been proven is in `STATUS.md`.
