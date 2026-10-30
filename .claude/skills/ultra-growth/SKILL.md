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

## The living equation (build 52)
Per band b: EV_b = p_b*W_b - (1-p_b)*L_b - fee_b, from real fills (decayed, half weight ~30 closes). Coin score = combined band EV. Buy if > 0; size 1x only if every band n>=13 and EV>0, else 0.618x; never above cap; never below 0.05 SOL wallet. Idle 97 s -> buy best candidate at 0.618x (still through every filter and the rug check). Exits re-fit every 5 closes by replay, one golden step, inside sl -8..-4%, half +3..+8%, take +6..+20%. Status: `/status` -> `engine.organism`.

## Narratives (build 53, live 2026-10-29)
Ultra trades the meta like a human: `tools/autotrader/src/lib/narrative.mjs` groups coins into themes and the engine reads it in one hook. Dying theme = no entry. Strong rising theme (3+ coins, 1+ runner, coin not a copycat) = full size without the organism's score. Saturating theme or copycat = 0.618x. Caps and rug check unchanged. Shown in `/status` engine.narrative (top 3) and the app line "hot narratives". Only on the live feed. Next: exit on theme turning dying, tune thresholds on the live log. Lesson 43.

## Instant intel (build 62, live 2026-10-30)
Alex: "build extensive instant research on coins … this creates certainty and we can stay in longer, not only -2%". Code: `tools/autotrader/src/lib/intel.mjs`.
- Per candidate, in the background: RugCheck (dev %, top10 % without pool accounts, insider clusters, holders, LP lock, dev's other coins, rugged), public RPC tx rate and failed-tx share, DexScreener socials/boosts/flow, FxTwitter followers. Optional `smartWallets` in config (empty by default).
- Certainty 0..1 with reasons. < 0.4 skip. 0.4-0.7 normal -2%. >= 0.7 stop widens -2% -> -5% (at 0.9), trail 15%, hold x2. Size never changes. Rug check untouched.
- Every buy line ends "certainty 0.xx: <top 3 positives + every negative>". Status shows `engine.intel` and certainty/sl/trail per open position.
- Failure or timeout = 0.5, trading never waits.

## Whale following (build 63, live 2026-10-30)
Code: `tools/autotrader/src/lib/whales.mjs`, tests `test/whales.test.mjs`. Free sources only (GeckoTerminal trades, public Solana RPC, RugCheck); read-only, never signs.
- Discovery: one top runner (pool liq >= $20k) per minute while fewer than 8 wallets, then every 10 min. Keeps wallets that sold >= 20% above their average buy with >= $150 sold; drops bots (>40 trades), buy-only wallets, the runner's creator and RugCheck insiders. Max 24, saved as `whales` in config.json. `cfg.smartWallets` are seeded too.
- Watch: `getSignaturesForAddress` two wallets per pass (~1.5 s); first look only bookmarks. Same oldest funder counts as one wallet.
- Follow: >= 2 independent wallets buy one coin within 60 s -> full rug check, normal 0.016 SOL size, reason "following N smart wallets into X". Fib agreement moves it up, never blocks. No follow without a RugCheck report.
- Exit: any copied wallet sells -> Ultra sells first. -2% stop still checked first; half at +5%, rest to +100% unchanged.
- Score: copied PnL credited to the wallets; drop after 3 copies averaging < -2% or 2 straight losses totalling < -4%.
- Lesson: the first live discovery run picked up a runner's own creator as "smart money" (he sold well by dumping). Discovery must always exclude creator + insiders. Lag and the funder check (oldest of the last 1000 signatures only) are not proven yet; read `engine.whales` in /status.

## Build 64 (2026-10-30): cost edges
Laddered priority fee (pay only what lands), token-account rent reclaimed after every full sell plus a stray sweep, and a Token-2022 trap stop ahead of rugcheck. Settings unchanged: 0.016 SOL, stop -2%, half at +5%, rest to +100%, no pause line. Details: `.claude/skills/gmgn-fib/research-2026-10-29-lessons.md`.

## The formula (build 65, 2026-10-30) — learns from its own trips
Live cfg (bridge, confirmed in /status): `sl -0.20`, `partAt 0.08`, `partFrac 0.5`, `trailFrom 0.08`, `trail 0.05`, `lockFrom 0.08`, `lockAt 0.01`, `tp 1`, `maxHoldMin 10`. Fibonacci entries unchanged. Size 0.016 SOL, never raised.
1. Buy on the Fibonacci pullback (fibLo 0.5 .. fibHi 0.786), rug check untouched.
2. Sell half at +8% (Alex's +5% tested at -1.6% a trade over 133 trips; +8% is the closest that made money).
3. The rest rides a 5% trailing stop, the stop moves to +1% after the first take, +100% is the cap.
4. Stop -20%, wider to -30% for high-certainty intel coins; everything out after 10 minutes.
5. Every 10 closes it re-fits stop and first take on its own last 50 trips and changes only when the new set wins both halves (organism.refitExits, CLAMP sl -0.30..-0.02, partAt 0.05..0.20).
Expected: about +0.9% a trade net of 3.5% cost, ~0.0007 SOL an hour at 0.016 and 5 trips an hour. Thin edge from one sample; re-check after 30 trips on build 65. Rent is recovered (separate CloseAccount tx), not a leak. Next lever: slippage/fees (~3.5% a trip).
