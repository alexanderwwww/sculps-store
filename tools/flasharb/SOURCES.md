# Sources: where every address, API shape and function comes from

Nothing here is from memory. Each item was read from the installed package, a saved spec in `sources/`, or a live chain/API response on 2026-11-21.

## Kamino lending (`@kamino-finance/klend-sdk` 14.0.0, pinned; it pins `@solana/kit` 8.3.0, so we pin the same)

| What | Where |
|---|---|
| `getFlashLoanInstructions({borrowIxIndex, userTransferAuthority, lendingMarketAuthority, lendingMarketAddress, reserve, amountLamports, destinationAta, referrerAccount, referrerTokenState, programId})` -> `{flashBorrowIx, flashRepayIx}` | `node_modules/@kamino-finance/klend-sdk/dist/leverage/instructions.d.ts:4`; body `src/leverage/instructions.ts:15-50` (repay uses `destinationAta` as source) |
| How the SDK itself sets `borrowIxIndex` (= number of instructions before the borrow) | `src/leverage/operations.ts:661` (and 782, 1274, ...) |
| flashBorrow account list (12 accounts, sysvar instructions, token program) | `src/@codegen/klend/instructions/flashBorrowReserveLiquidity.ts:45-80`, discriminator line 18 |
| flashRepay data layout: 8-byte discriminator, `u64 liquidityAmount`, `u8 borrowInstructionIndex` (byte 16) | `src/@codegen/klend/instructions/flashRepayReserveLiquidity.ts:18,40-42` |
| `KaminoMarket.load(rpc, marketAddress, recentSlotDurationMs, programId?, withReserves?, ...)` | `dist/classes/market.d.ts:47` |
| `getFloatRateReserveBySymbol('USDC')` (the market has 4 USDC reserves: 3 fixed-term, 1 float) | `dist/classes/market.d.ts:226` |
| `getLendingMarketAuthority()` | `dist/classes/market.d.ts:73`, `src/classes/market.ts:406-408` |
| `DEFAULT_RECENT_SLOT_DURATION_MS = 300` | `src/classes/reserve.ts:106` |
| Flash fee = `flashLoanFeeSf / 2^60`; u64::MAX = disabled | `src/classes/reserve.ts:655-660`, `src/classes/fraction.ts:29` (`FRACTIONS = 60`), `src/leverage/utils.ts:29-33`, `src/utils/constants.ts:8` |
| Fee formula (Exclusive): `amount * rate`, minimum 1 unit | `src/classes/reserve.ts:1726-1771` (`calculateFees`, `calculateFlashLoanFees`) — we round up |
| Available liquidity = `state.liquidity.totalAvailableAmount` | `src/classes/reserve.ts:506-508` |
| Program id `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` | `dist/@codegen/klend/programId.js:6` (exported as `PROGRAM_ID`) |
| Main market `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF` | SDK `README.md:24` ("main market address") and live `https://api.kamino.finance/v2/kamino-market` (`"isPrimary": true`, on-chain name "SOL/BTC Market") |
| Market lookup table `FGMSBiyVE8TvZcdQnZETAAKw28tkQJ2ccZy6pyp95URb` | same Kamino API response, field `lookupTable` |

Read from chain (KaminoMarket.load, 2026-11-21): USDC float reserve `D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59`, `flashLoanFeeSf = 11529215046068` (= 0.001%, $1 per $100k, $10 per $1M), market authority `9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo`, available liquidity 40.6–41.0M USDC across the runs.

Known install quirk: `@kamino-finance/kliquidity-sdk` requires `@orca-so/whirlpools-client` without declaring it, so it is installed explicitly; `.npmrc` sets `legacy-peer-deps=true` because that package declares `@solana/kit ^2` as a peer.

## Jupiter

| What | Where |
|---|---|
| `/quote` params `dexes`, `excludeDexes`, `maxAccounts`, `slippageBps`, `swapMode` | `sources/jupiter-swap-v1.yaml:662-720` (from github.com/jup-ag/docs `openapi-spec/swap/v1/swap.yaml`) |
| `/swap-instructions` request (`userPublicKey`, `quoteResponse`, `wrapAndUnwrapSol`) and response (`setupInstructions`, `swapInstruction`, `cleanupInstruction`, `addressLookupTableAddresses`, base64 `data`) | `sources/jupiter-swap-v1.yaml:122-167, 355-520`; checked against a live response |
| `wrapAndUnwrapSol: false` requires an initialised wSOL account (we create it) | `sources/jupiter-swap-v1.yaml:368-377` |
| DEX labels | live `GET https://lite-api.jup.ag/swap/v1/program-id-to-label` (112 labels); checked at start-up, and an unknown label is a hard error because Jupiter answers a wrong label with "No routes found" instead of an error |
| No-route response `{"error":"No routes found","errorCode":"NO_ROUTES_FOUND"}` HTTP 400 | live |
| Rate limit header `x-ratelimit-remaining: 99` | live |
| Token discovery `/tokens/v2/tag?query=verified`, `/tokens/v2/search?query=` with `isVerified`, `liquidity`, `tags`, `tokenProgram` | `sources/jupiter-tokens-v2.yaml:12-121`; live (3,782 verified tokens) |
| Program error 6001 `SlippageToleranceExceeded`, 6024 `InsufficientFunds`, 6025 `InvalidTokenAccount` | Jupiter's on-chain Anchor IDL, account `C88XWfp26heEmDkmfSzeXP7Fd7GQJ2j9dDTUsyiZbUTa`, saved as `sources/jupiter-v6-idl-onchain.json` |

## Solana kit 8.3.0 and program clients

| What | Where |
|---|---|
| `createNoopSigner(address)` (a signer that can never sign) | `node_modules/@solana/signers/dist/types/noop-signer.d.ts:49` |
| `fetchAddressesForLookupTables` | `@solana/kit/dist/types/fetch-lookup-tables.d.ts:12` |
| `compressTransactionMessageUsingAddressLookupTables`, `compileTransaction`, `getTransactionSize`, size limit 1232 | `@solana/transaction-messages/dist/types/compress-transaction-message.d.ts`, `@solana/transactions/dist/types/compile-transaction.d.ts:19`, `transaction-size-limits.d.ts:9` |
| `simulateTransaction` with `sigVerify: false`, `replaceRecentBlockhash: true`, `accounts: {addresses, encoding: 'jsonParsed'}` | `@solana/rpc-api/dist/types/simulateTransaction.d.ts:25-64` |
| `AccountRole` values 0..3 | `@solana/instructions/dist/types/roles.d.ts:15-19` |
| `getSetComputeUnitLimitInstruction`, `getSetComputeUnitPriceInstruction` (`@solana-program/compute-budget` 0.18.1) | `dist/types/generated/instructions/setComputeUnitLimit.d.ts:25-30`, `setComputeUnitPrice.d.ts:25-30` |
| `getCreateAssociatedTokenIdempotentInstruction`, `findAssociatedTokenPda` (`@solana-program/token` 0.16.1) | `dist/types/generated/instructions/createAssociatedTokenIdempotent.d.ts:48-62`, `dist/types/generated/pdas/associatedToken.d.ts:9-19` |
| Mainnet now has v1 transactions: `getTransaction` needs `maxSupportedTransactionVersion: 1` | live RPC error -32015 |

## Mints

No coin list in code. Only USDC (`EPjFWdd5...Dt1v`, 6 dp) and wSOL (`So111...112`, 9 dp) are fixed; both read on chain. Every traded token comes from Jupiter's verified list at run time and its decimals/program are re-read on chain (`src/tokens.ts`).
