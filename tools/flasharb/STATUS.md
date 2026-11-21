# flasharb STATUS — step 1 (simulation only), 21 Nov 2026

All times are Athens. Every number below was produced by running the code. The raw outputs are in `proof/`.

## What was proven by running it

### 1. Kamino flash loan, read from chain
- Main market `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF` (Kamino's API marks it `isPrimary`; on-chain name "SOL/BTC Market").
- USDC float reserve `D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59`. Flash fee **0.001%** (`flashLoanFeeSf` 11529215046068): $0.01 per $1k, $1 per $100k, $10 per $1M.
- **Available USDC: 40.56M–41.01M** across the runs (`totalAvailableAmount`). So **$1,000,000 can be borrowed**, about 2.5% of what is there.

### 2. Scans (`npm run scan`, `proof/scan-all-tokens.txt`, `logs/scans.jsonl`)
Tokens are picked live: Jupiter's verified list, liquidity ≥ $5M, staked-SOL/lending-receipt tags left out, Token-2022 left out. The run picked SOL, USX, USDT, WBTC, USD1, JupUSD, cbBTC, ETH, TRUMP, RAY. DEXes are found live for each token (SOL: ZeroFi, Kipseli, BisonFi, Scorch, Whirlpool, GoonFi V2, Raydium CLMM, Deriverse).

3 full rounds, 06:06–06:23 Athens, about 5–6 minutes each (450–516 Jupiter calls per round on the free API), 1,951 route results in total:

| Size | Exact-quoted routes | Best net | Median spread |
|---|---|---|---|
| **$100,000 (headline)** | 9 | **−$25.15** (JupUSD, Whirlpool → Meteora DLMM, −2.42 bps) | −2.63 bps |
| $1,000,000 | estimate only | −$953 (JupUSD, Whirlpool → JupLend AMM, −9.4 bps est.) | — |
| $10,000 | 18 | +$2.87 (SOL, ZeroFi → Kipseli, +2.98 bps) | −2.58 bps |
| $1,000 | 5 | +$0.10 (SOL, Scorch → ZeroFi, +1.13 bps) | −2.34 bps |

Real table from round 1 (headline size):
```
HEADLINE 100000 USDC -> JupUSD 100000 USDC: buy on Whirlpool, sell on Meteora DLMM, spread -2.42 bps, net $-25.15 (negative, not tradable)
best any size: SOL 1000 USDC: buy on Scorch, sell on ZeroFi, spread 1.13 bps, net $0.10 PROFITABLE
```
From the simulate run (same route, 06:28):
```
pair        size buy on (A)      sell on (B)     spread bps    gross $ flash $      net $ chk
JupUSD    100000 Whirlpool       Meteora DLMM         -2.52     -25.22    1.00     -26.22 exact
JupUSD    100000 JupLend AMM     Meteora DLMM         -2.63     -26.27    1.00     -27.27 exact
JupUSD    100000 JupLend AMM     Whirlpool            -2.73     -27.29    1.00     -28.29 exact
```
**What the scans show:** at $100k there was no profitable route in any round. Every two-DEX round trip loses 2.4 bps or more. The only positive results were $0.10 and $2.87, at $1k–$10k, on prop AMMs (Scorch, ZeroFi, Kipseli). Their quotes move every slot, and one ZeroFi leg failed in simulation with Jupiter 6001 SlippageToleranceExceeded. The network fee is about $0.0023 per transaction (600k CU at 50,000 µlamports). It does not matter next to the spreads.

### 3. Transaction build and simulation (`npm run simulate`)
One v0 transaction with 8 instructions: #0–1 compute budget, #2–3 create the USDC and token accounts (idempotent), **#4 Kamino flashBorrow**, #5 swap 1 (Jupiter), #6 swap 2 (Jupiter), **#7 Kamino flashRepay** (it carries borrow index 4, checked in code and in tests). It uses 3 lookup tables and comes to 784–957 bytes, under the 1,232-byte limit.

**Full success at the headline size** (`proof/simulate-standin-100k.txt`, slot 472005241). The fee payer was a stand-in public wallet `FcVhsspfqzFBTCSENgKJh3VSeXw9nFF91WHr9Jzcjkwp`, found on chain as the fee payer of a recent transaction that touched the Kamino USDC reserve. It holds 2,999.99 USDC and 0.54 SOL. It only stands in for the simulation; nothing moves.
```
building: JupUSD 100000 USDC, buy on Whirlpool, sell on Meteora DLMM, expected net $-526.05 (USDC only; leg 2 sells leg 1's guaranteed minimum 99535423134 of 100035601139 base units)
tx: 8 instructions, flashBorrow at #4, flashRepay at #7, 3 lookup tables, 784 bytes (limit 1232: fits)
simulation (slot 472005241, sigVerify=false, replaceRecentBlockhash=true): SUCCESS
compute units: 159213
USDC ATA 9w5Dr3mPcQFUZ9R2okLfRccnixMDCBDxiuLXDifNrn8R: 2999999442 -> 2473950536 (delta -526.04 USDC)
JupUSD ATA EBz5pR4mc5XCTUCAsPBesUS7xL586SRuGUF6jm5Fjcvo: 0 -> 500178005 (delta 500178005 base units)
Kamino flash log lines: [ 'Program log: Instruction: FlashBorrowReserveLiquidity', 'Program log: Instruction: FlashRepayReserveLiquidity' ]
```
The simulated USDC change (−$526.04) matches the builder's prediction (−$526.05) to the cent. The other $500.18 stays as JupUSD in the wallet, because swap 2 only sells what swap 1 is guaranteed to deliver (the 50 bps slippage buffer). The real loss is therefore about $26, the same as the scan.

Also a full success at $1k on SOL, Whirlpool → Raydium CLMM (`proof/simulate-standin-1k.txt`): USDC −5.90, the same as predicted.

**Alex's wallet `25x7yeU4DnQdYKWENjCMzSY24oq38zxJXrFEtmKfVX6s`** (read from chain):
- 05:45 Athens: 0.932 SOL, **no USDC token account**. Simulation at $1k (`proof/simulate-alex-route-1k.txt`): flashBorrow ok, swap 1 ok, swap 2 ok, then **flashRepay ran and failed with "insufficient funds"**. The route lost about $2 and the wallet holds no USDC to cover that. The atomic safety works: a losing trade cannot complete, and the borrowed money never leaves the transaction.
- 06:28 Athens: **0.00065 SOL left** (the SOL had been moved out). The 100k simulation now fails before running anything: `InsufficientFundsForRent` on account 0 (the fee payer). To simulate as himself he needs about 0.01 SOL in it: about 0.004 SOL for the two token-account rents plus fees.

### 4. Tests: `npm test` → **18 of 18 pass**
They cover the flash fee on the real Kamino rate (including rounding and the "disabled" sentinel), network fee, profit math, rejecting negative or zero nets, every ordered DEX pair in both directions over 4 sizes, the headline size always included, the borrow index (correct position, repay index, a wrong index is refused, Jupiter compute-budget ixs dropped), Jupiter ix role conversion and ATA de-duplication, token discovery filters, Jupiter 429 (retry then error, and recovery), no route, other 4xx and 5xx errors, the DEX/exclude parameters, a full scan loop against a fake two-price market (finds buy-cheap/sell-rich, verifies it exactly, rejects the reverse, and the build path sells only the guaranteed minimum), a DEX with no route dropped, a size above Kamino liquidity skipped, total rate limiting raising an error instead of producing fake data, and an RPC error surfacing. `npx tsc --noEmit` is clean.

### 5. Gold on Solana (`npm run gold`, `proof/gold-probe.txt`, live Jupiter quotes)
| Token | Jupiter liquidity | DEXes that can fill $1k / $100k | $100k price impact |
|---|---|---|---|
| GLDx "Gold xStock" (Token-2022, transfer hook) | $421K | 5 / 6 | 4.2% |
| GOLD (backing unclear) | $348K | 3 / 4 | 1.0% |
| XAUt0 Tether Gold | $124K | 7 / 6 | 5.4% |
| VNXAU | $28K | 4 / 2 | 9.9% |
| XAUM (Token-2022, transfer fee) | $44K | 1 / none | — |

So yes, gold tokens trade on two or more DEXes. But a $100k trade moves the price by 1–10% on the first leg alone, so there is no $100k arbitrage in gold today. GLDx and XAUM are Token-2022 tokens with transfer hooks and fees, which the scanner skips by default.

## Not done / open
- **No live sending exists, by design.** Nothing in `src/` signs or sends (grep for sendTransaction, Keypair and secretKey finds nothing).
- **Missing before any live step: a USDC balance guard.** If the wallet holds USDC, a losing trade's shortfall is paid from that balance, and the repay still succeeds (see the stand-in simulation: −$526). Kamino's repay alone only protects a wallet with zero USDC. Step 2 needs a final instruction that fails unless the USDC balance after the trade is at least the balance before it plus the minimum profit.
- $1M is scanned with estimates only. The exact re-quote is spent on the best routes overall and at the headline size.
- Prop-AMM quotes (ZeroFi, Scorch, Kipseli, BisonFi) go stale within seconds. The tiny positive results all came from them. Landing one would need a fast private RPC and Jito-style submission, which is out of scope here.
- Leftover token from the slippage buffer is reported but not counted in "net" (net is USDC only).
- The 1,000,000 size is borrowable, but every route at that size loses about 9 bps in estimates.

## Blockers
1. **Speed:** the free Jupiter API allows about 100 calls a minute, so one round over 10 tokens takes about 5–6 minutes. That is too slow for arbitrage, where windows last seconds. Unblock with a paid Jupiter key (`JUPITER_API_KEY`) or a self-hosted quote engine, plus a private RPC (`RPC_URL`). The public RPC also refuses `getTokenLargestAccounts` (429).
2. **Edge:** across 3 rounds there were no profitable $100k routes. Two-DEX spreads on liquid tokens are already closed by existing bots, to 2–3 bps under cost.
3. **Alex's wallet** needs about 0.01 SOL to be the fee payer in simulation (0.00065 SOL at 06:28).
