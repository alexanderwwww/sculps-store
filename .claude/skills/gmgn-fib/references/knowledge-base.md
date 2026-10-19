# The trader knowledge base (started by Alex, 2026-10-19)
> "Golden ratio here. It will be our guide. … treat it like your baby."

Every rule here was set by Alex or derived from his rules. Add to this file whenever something is decided. Never delete a rule; supersede it with a dated line.

## 0. Principles
1. φ = 1.618 is the guide. Every threshold is a Fibonacci number or ratio: 0.146, 0.236, 0.382, 0.5, 0.618, 0.786, 1.272, 1.618.
2. No sniping and no racing bots. We buy patience: 0.618 pullbacks on coins that survived their first minutes.
3. Paper first. Go live only when the measured p beats p* with a margin.
4. Never hold or ask for a seed phrase or private key. Live trading uses a separate wallet holding only what Alex puts in it.
5. Speed comes from data, not clicks. Read feeds directly, run analyses in parallel, and use the browser only to act.

## 1. The master equation
```
Gate      G = 1[age∈(15m,6h)]·1[L≥30k ∧ locked]·1[top10<25%]·1[dev<5% ∧ not sold]
              ·1[not mintable ∧ no freeze]·1[ΔVol15>0]·1[SM≥2]·1[N≥61.8]·1[regime ok]
Levels    D = S_H − S_L
          E = S_H − 0.618·D        stop S = S_H − 0.786·D
          T1 = S_H   T2 = S_L + 1.272·D   T3 = S_L + 1.618·D   (sell 38.2% / 38.2% / 23.6%)
Payoff    W = 0.382(T1/E−1) + 0.382(T2/E−1) + 0.236(T3/E−1) − c   ≈ +0.58
          Λ = (S/E−1) − c                                          ≈ −0.18   (c ≈ 0.06)
Edge      EV = p·W + (1−p)·Λ          p* = |Λ| / (W+|Λ|) ≈ 0.24
Size      f_k = clamp(0.236 · φ^(win streak) · φ^(−loss streak), 0.146, 0.382)
Exposure  Σ open f ≤ 0.618          max 3 open positions
Day       stop when B ≥ 1.618·B0 or B ≤ 0.618·B0
Horizon   B_n = B0 · φ^(green days − red days)        (because 1.618 × 0.618 = 1)
```

## 2. Fee engine (lowest possible fees)
- Quote every trade two ways, GMGN's own swap and a direct Jupiter route, and take the cheaper net fill. Log both quotes. Fees and routes are measured, never assumed.
- Priority fee: use the network's current minimum, never a fixed high tip.
- Slippage cap: skip a trade whose quote would lose more than the cap. The cap starts at 2.36%, tuned from paper data.
- Cost check before every entry: expected W after the real quoted costs must still be at least 3 × |Λ|. Otherwise skip.
- The strict gate is itself the biggest fee saver: fewer, better trades.

## 3. Narrative plugin (the eyes)
- Narrative score N (0–100) for each coin, built from:
  - growth rate of X mentions
  - quality of the accounts mentioning it (KOLs vs bots/new accounts)
  - how hot the theme is today (AI, politics, animals, meme of the day …)
  - GMGN KOL calls and smart-wallet clusters
- Trend radar: rising themes are found before their coins pump. New tokens are tagged with a theme on arrival.
- Two independent sources (X and on-chain smart money) must agree. N ≥ 61.8 is needed to enter.
- Data route: X needs paid API access or reading through ultracursor's Chrome. Find the fastest route that works and tell Alex before paying for anything.

## 4. Protection layers
- Regime switch: when SOL is in a sharp downtrend, stand aside for the day.
- Rug radar on open positions: if the dev wallet moves, liquidity is pulled or holders suddenly concentrate, exit at once, before the stop.
- Time stop: no move within 21 minutes means exit.
- Kill switch: one command stops everything. A drawdown of 38.2% from peak stops trading for 24 h.
- After 3 losses in a row, pause for 1 h.

## 5. Learning loop
- Journal every candidate (taken or skipped) with all its features, the reason, and the outcome.
- Every night, find which feature values predicted wins, and tighten or loosen thresholds within the φ ladder.
- Learn the hours of the day with the best p, and size up in those hours and down in dead ones.
- Report to Alex: p, EV per trade, fees paid vs saved, green and red days, and the wallet against B0·φ^(g−r).

## 6. Status
- Core paper trader: being built in tools/ultracursor/src/trader/ (3 positions, 0.618 exposure cap).
- Fee engine, narrative plugin, protection layers and learning loop: specified here; built after the core passes its tests.
