---
name: flasharb
description: The Solana flash-loan arbitrage scanner (Kamino + Jupiter, tools/flasharb): what was built, what it measured, and Alex's decision to shelve it. Load before touching flash loans, arbitrage or tools/flasharb.
---
# flasharb — shelved (Alex, 2026-11-21: "Not worth it I think")

Built and proven (simulation only, nothing can sign or send): live scanner, Kamino flash borrow/repay (program KLend2g3…gmjD, main market 7u3HeH…5PfF, fee 0.001%, ~$41M USDC available), one-transaction builder, mainnet simulation; 18 tests. Details: tools/flasharb/STATUS.md, SOURCES.md.

Measured 2026-11-21: best net $1k +$0.10, $10k +$2.87, $100k -$25, $1M ~-$950. Two-DEX gaps on liquid coins sit 2-3 bps below cost; pro bots keep them closed.

If revisited: liquidations (5-10% bonus) are the stronger flash-loan use. Live needs a paid Jupiter key, private RPC, and a minimum-balance guard (a wallet holding USDC can pay a losing trade instead of reverting).
