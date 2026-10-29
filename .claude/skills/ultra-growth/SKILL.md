---
name: ultra-growth
description: Ultra's GROWTH MODE — many small scalps (target one trade a minute) to grow a small wallet until it can take bigger trades. Use when Alex says grow the portfolio, scalp, one trade a minute, $1 a minute, small profits all the time, or when the wallet is under 0.5 SOL.
---
# Ultra growth mode (Alex, 2026-10-29)

Alex: "This is when we try to grow the portfolio so we can take larger trades... one trade every minute... even if you get 50 cents, it's okay."
Alex: "The great Alexander conquered the whole world. It was possible." Treat the goal as real and work toward it; report the real numbers every time.

## The idea
A small wallet grows by MANY small, fast wins, not by waiting for one big coin. Buy size is 0.02618 SOL (0.618x for doubtful coins). Each win only needs to beat costs (~0.5% fees + slippage) by a little.

## The settings (bridge "set", applied 2026-10-29 ~18:05 UTC)
- half off at +2.5%, everything at +5%
- stop -4%; win lock at +0.5% once +1.5% is seen
- flat after 1 min -> sell; nothing held longer than 3 min
- momentum floor 1% (self-tunes upward after losses: watch it)
Keep entries loose enough that it buys most minutes (volume >= $500, 3 trades, buyers >= 0.8x sellers).

## The math to watch every check
EV per trade = win% x avg win - loss% x avg loss. With +3.5% avg win and -4.5% avg loss, break-even win rate is ~56%. If the live win rate is under that after 20 closes, tighten entries (more volume, buyers ahead) before loosening exits. Report: trades per hour, win rate, EV, wallet on-chain.

## Scale ladder (unchanged)
0.5 SOL -> base 0.1618; 1 SOL -> 0.2618; golden x1.618 per win streak (max 3 steps). Then growth mode can relax toward bigger targets.

## Never
Never fake a result. Never trade a non-SOL pool. Rug check stays. Below 0.05 SOL: pause buying and tell Alex.

## Coin science
How to read one coin (score equation, liquidity/volatility stops, real costs, the 5 ranked changes): `coin-science.md` in this folder.
