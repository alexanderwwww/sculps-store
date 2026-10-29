# Ultra coin science: how to read one coin (2026-10-29)

This is a research team pass. Every number was recomputed by a second reviewer, and live read-only checks were run against GeckoTerminal, DexScreener and RugCheck on 2026-10-29. No transactions were sent.
**Status: none of this is proven on Ultra's own fills yet.** Every threshold below is a starting value, and it has to be replayed on the journal before it is trusted (section 5).

Notation: `L` = DexScreener `liquidity.usd` (both sides). `Q` = trade size in USD (0.02618 SOL ≈ $5). `σ30` = standard deviation of 1 s log returns over 30 s, taken from Ultra's own price buffer, counting only prints that changed (DexScreener repeats prints, which pushes σ too low).

## 0. What the data says before any rule
- 51 live pools, priced at +1 min: mean +0.05%, median 0.00%, and 17/51 did not move at all. **A 1-minute move does not pay the costs.** Hold for 3–5 min, and use the 1-trade-a-minute rate by running several coins in parallel, not by holding each one shorter.
- Only one feature was significant: `tx5`, with Spearman rho +0.31 (p=0.03) at +1 min and +0.30 (p=0.04) at +5 min. Even so, the median for tx5≥100 was only +0.5% at +5 min. **Use it as a gate, not as a trigger.**
- `vol5/L` was the best feature once the outlier was trimmed (top third +1.55% at +5 min), but it was not significant (p=0.16).
- Buy ratio over 5 min (`br5`) is noise (rho 0.01). Fading the pump or buying the dip did not survive testing (n=4–8).
- Fibonacci levels have no edge (Osler 2000, FRBNY: prices cluster at round numbers, not at fib levels).

## 1. Hard vetoes (cost nothing, cut the full-loss tail)
Skip the coin if any of these is true:
- the pool is not quoted in SOL (the sample included SPYx, WBTC and USDC pools);
- RugCheck `mintAuthority`, `freezeAuthority` or `transferFee.pct != 0`, or `rugged`, or `graphInsidersDetected > 0`;
- holder concentration > 30%, counted **after removing** `markets[].pubkey` and the AMM/LOCKER entries in `knownAccounts` (on the live token the "top holder" at 19.2% was the pool itself);
- a pump.fun bonding-curve coin with fill > 90%, where `V_sol = sqrt(3.219e10 × price_SOL)` and `fill = (V_sol − 30) / 85`. A completed curve rejects sells until migration, so a stop there cannot fill;
- `creatorTokens == null` must not count as a pass for the serial-launcher rule.

## 2. The per-coin score
These inputs come from data Ultra already polls (DexScreener 1 s, GeckoTerminal pool + trades). Each feature is a cross-sectional z-score over the coins seen in the last 10 min, clipped to ±3.

```
gate:  tx5 ≥ 100  AND  vol5/L ≥ 0.04  AND  vol5/L ≤ 1.0  AND  m5.buyers ≥ 1.5 × m5.sellers  AND  DI_$ ≥ 0
DI_$  = (buyUSD − sellUSD) / (buyUSD + sellUSD)            over the last 300 trades (or 60 s of the own buffer)
IR    = trades in last 30 s / (trades in last 300 s / 10)  (only with the own buffer, change 3)
S = 0.35·z(ln tx5) + 0.25·z(vol5/L) + 0.15·DI_$ + 0.15·z(ln IR) + 0.10·z(br1h) − 0.30·[countRatio>3 AND $ratio<1.5]
buy only if S ≥ 0.5 AND EV_hat > 0 (section 3)
```

Why each weight:
- `tx5` is the only significant feature, so it gets the largest weight.
- `vol5/L` is turnover. A 3% move needs net flow of 0.75% of L. At DI 0.3 that takes 5-minute turnover of about 0.04, which is why 0.04 is the floor.
- The penalty term catches volume bots: many small buys against a few large sells.
- `br1h` points in the right direction (rho ~+0.1) but is weak.

These weights are priors. Refit them by logistic regression of "hit W before stop" on the journal once n ≥ 350.

## 3. Entry, take and stop as formulas of liquidity and volatility
Costs per round trip, as fractions:
```
c_fee   = 2 × pool fee      (PumpSwap 0.25% + creator fee per side; pump.fun curve ~1%+ per side — read it from the Jupiter quote, never hardcode 0.5%)
c_prio  = 2 × prioLamports / stakeLamports     (cap 150000 lamports on 0.02618 SOL = up to 0.57% per leg, 1.15% round trip)
c_imp   = 2 × 10 / L        ($5 trade: 0.10% at L=$20k, 0.40% at L=$5k)
c       = c_fee + c_prio + c_imp                (typical PumpSwap coin, L=$20k: 0.5–0.6 + ~0.6 + 0.1 ≈ 1.3%)
```
Stop slip, meaning how far below the trigger a stop really fills:
```
S10 = 95th percentile of the USD sold in any 10 s window over the last 10 min (own trade buffer)
s   = 2 × S10 / L                    (check: 2×300×3/7500 = 24%, which matches the −19..−22% fills in the lessons file)
skip the coin if s > 1.5%            (replaces the flat liveMinLiq $15k)
```
Stop, take and time limit:
```
stopTrig = −max(3%, 2.5 × σ30 × sqrt(30))      (outside the 30 s noise, so a stop is not hit by a random print)
lossEff  = |stopTrig| + s + c                  (what a loss really costs)
take W   = max(2 × lossEff × 0.6, 4%)          (target pay ratio about 1.2:1)
time     = 3 min max hold; flat after 90 s (ret < c) → sell
p*       = lossEff / (W − c + lossEff)        (break-even win rate)
EV_hat   = p̂ × (W − c) − (1 − p̂) × lossEff,  p̂ = lower 80% bound of the Beta posterior of the score band's win rate
```
- Worked example: L=$20k, σ30 gives a 3% stop, s=1%, c=1.3%. Then lossEff=5.3%, W=6.4%, and p* = 5.3/(5.1+5.3) = **51%**.
- With the old 0.5% fee assumption the same coin shows p* ≈ 45%, so the hidden costs are worth about 6 points of win rate.
- **Exit trigger:** use the Jupiter sell quote `outAmount`, which already includes fees and impact, never the DexScreener mid. Re-quote every 2–3 s per open position, because 1 s uses up the rate limit.
- **No tight trail.** A 1.5% trail is smaller than the 1.5–5% fill slip and nets about −1%. Trail no tighter than `max(2.5%, s + c)`, armed at +W/2.
- A driftless price hits the take before the stop with probability lossTrig/(W+lossTrig). So without a real edge, EV = −c − (1−p)·s. The score has to supply drift, and the exits cannot create it.

## 4. Sizing
- Keep 0.02618 SOL, and cap the trade so that `Q ≤ 0.5% × L/2`, which gives impact ≤ 0.5%. At $5 that only matters below L ≈ $2k.
- Kelly with a ¼ fraction on p̂ (lower bound) gives f ≈ 1.3% of bankroll at p=0.68, W=4, lossEff=6.5. That is below the fixed stake, so Kelly changes nothing now. **The only sizing rule that matters is f = 0 (stop buying a band) when the 90% upper bound of its win rate < p*.**
- Size goes up (scale ladder) only after ≥ 350 closed trades with a measured p̂ > p* + 5 points.
- Dollars per win: +4.5% net is about +$0.22 at $5 and about +$0.86 at 0.1 SOL.

## 5. The five changes to Ultra, ranked by expected EV per minute
Do not edit these while another team owns the code. Hand this list over.

1. **Charge the real costs and gate on EV > 0.**
   - Where: `src/lib/strategy.mjs` DEFAULTS line 7 (`slippage`, `fee`), `src/lib/exec-jupiter.mjs` CAPS line 9 (`maxFeeLamports: 150000`), `src/lib/engine.mjs` `#gate` ~line 132.
   - Change: read the fee per coin from the Jupiter quote, log the real priority fee per fill, and compute `c` and `p*` per coin.
   - Expected gain: largest. The hidden fees (curve 1%+ per side, priority up to 1.15% round trip) alone can make every trade −EV.
2. **Replace the flat $15k pool floor with a stop-slip gate, and set the stop from volatility.**
   - Where: `engine.mjs` line 146 (`liveMinLiq`) and `#fastExits` lines 79–121 (`sl`).
   - Change: `s = 2·S10/L ≤ 1.5%`, `stopTrig = −max(3%, 2.5·σ30·√30)`.
   - Expected gain: it removes the −19..−22% stop fills, which are the single biggest loss source in the lessons file.
3. **Build Ultra's own trade buffer.**
   - Where: `src/lib/gecko.mjs`, with a new rolling store keyed by pool.
   - Change: poll `/pools/{pool}/trades` and de-duplicate by tx hash. GeckoTerminal caps a call at 300 trades, which is only 44–51 s on busy pools.
   - Expected gain: without this, DI_$, IR, S10 and buyer breadth over 5 min cannot be computed. It unlocks changes 2 and 4.
4. **Exits on the Jupiter quote: take W, a 3 min time stop, no trail tighter than slip + cost.**
   - Where: `engine.mjs` lines 117–121 (`lock`/`trail`/`take`/`time`), plus the "win lock +0.5% after +1.5%" setting in SKILL.md.
   - Expected gain: the tight lock/trail exits fill below entry plus cost, so they turn small wins into small losses.
5. **Score and kill switch.**
   - Where: `src/lib/organism.mjs` `score` line 72 and `sizeMul` line 84, plus a replay of the journal through `backtest.mjs`.
   - Change: use the section 2 equation (tx5 gate, vol5/L, DI_$) on SOL-quoted pools only, and price returns in `priceNative`. Stop a band when its 90% upper bound < p*.
   - Proof needs about 350 closed trades for ±5 points, and about 600 to separate 65% from 60%.

## Sources
- Live read-only, 2026-10-29: GeckoTerminal `/networks/solana/pools/{pool}/trades` and `trending_pools`; DexScreener `token-profiles/latest/v1` and `/latest/dex/tokens/{mint}`; RugCheck `/v1/tokens/{mint}/report`.
- Cont, Kukanov & Stoikov, arXiv 1011.6402 (order-flow imbalance; book-based, explains the same-window move and does not predict).
- Filimonov & Sornette 2012; Hardiman, Bercot & Bouchaud 2013 (Hawkes branching ratio 0.7–1, in futures and stocks).
- Osler 2000, FRBNY EPR "Support for Resistance". MacLean, Thorp & Ziemba 2010 (fractional Kelly).
- Open-source bots cited by the team but **not re-read**: warp-id/solana-trading-bot, fdundjer/solana-sniper-bot, chainstacklabs/pumpfun-bonkfun-bot.
- Tape analysis: 51-pool snapshot, Spearman correlation with a 2,000-shuffle permutation test.
