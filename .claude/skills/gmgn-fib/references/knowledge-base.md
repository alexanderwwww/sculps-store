# The trader knowledge base (started by Alex, 2026-10-19)
> "Golden ratio here. It will be our guide. … treat it like your baby."

Every rule here was set by Alex or derived from his rules. Add to this file whenever something is decided. Never delete a rule; supersede it with a dated line.

## 0. Principles
1. φ = 1.618 is the guide. Every threshold is a Fibonacci number or ratio: 0.146, 0.236, 0.382, 0.5, 0.618, 0.786, 1.272, 1.618.
2. We ARE snipers, elegant ones (Alex, 2026-10-19: "low-key it is sniping … we are elegant"). We don't race the bots to block 0. We snipe the 0.618 pullback on coins that survived their first minutes, with every rule checked first.
3. The default is live trading. Fake-money training happens ONLY when Alex says so (his name for the overnight training session: "Sniper XYZ"). It runs on real GMGN coins with fake money, trades all night, and feeds the learning loop. Never suggest paper trading on our own initiative.
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
- Core trader (runs in training mode until a live wallet is connected): built in tools/ultracursor/src/trader/ (3 positions, 0.618 exposure cap).
- Fee engine, narrative plugin, protection layers and learning loop: specified here; built after the core passes its tests.

## 7. Fibonacci at every scale (Alex, 2026-10-19: "Fibonacci on every micro thing … the atom, the cell, the leaf, the planet")
The same ratios govern every layer, from one candle to the whole portfolio. No number in the trader is arbitrary: each one is a Fibonacci number (1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144) or a φ ratio.

| Layer | Fibonacci rule |
|---|---|
| Timeframes | Read 1, 3, 5, 13 and 21-minute candles. A setup must agree on at least 3 of them (confluence). |
| Swing | The 0.618 entry is measured on the last impulse. Wave structure is checked on the timeframe above. |
| Entry ladder | Split one entry into parts: 38.2% at 0.5, 38.2% at 0.618, 23.6% at 0.705. |
| Exits | Sell 38.2% at T1, 38.2% at 1.272, and trail the last 23.6% toward 1.618 → 2.618. |
| Stop | Under 0.786; tightened to break-even after T1. |
| Time | Check the position at 3, 5, 8, 13 and 21 minutes. No progress by 21 minutes means exit. |
| Positions | Max 3 open (scaling 1 → 2 → 3 by win streak). |
| Size | Ladder 14.6% → 23.6% → 38.2% of the wallet, moved by φ on each win or loss. |
| Exposure | Σ open ≤ 61.8%. 38.2% always stays safe. |
| Scans | New coins ranked in 3 / 5 / 8 tiers: watch / ready / fire. |
| Learning | Win rate p measured over the last 13, 21 and 34 trades. Rules change only when all three agree. |
| Day | Target +61.8%, stop −38.2%. |
| Portfolio milestones | B0 → B0·φ → B0·φ² … ($10 → $16.18 → $26.18 → $42.36 → $68.54 → $110.90). At each milestone, 23.6% of the gain is locked away and never traded. |

## 8. Daily Fibonacci growth and Fibonacci recovery (Alex, 2026-10-19)
- **Unit u** = the first realised profit of the day, whether it takes 15 minutes or 1 hour.
- **Intraday ladder:** the rest of the day aims for Fibonacci multiples of u, cumulatively 1u, 2u, 3u, 5u, 8u, 13u. Each rung reached is banked as a checkpoint. A trade may not take the day's P&L below the last banked checkpoint minus 0.382u.
- **Day over day:** tomorrow's target is today's result × φ. A bad day resets the target to that day's level, not to zero.
- **Recovery (every lost cent is recovered):**
  - After a loss of L, the next goal is to recover φ·L (the loss plus 61.8%) before the ladder resumes.
  - Recovery comes from trade selection and targets, NEVER from bigger size. After a loss, size still goes ÷φ.
  - Size goes back up only after a win.
  - Doubling size after losses (martingale) is banned. It is the one mechanism that empties small wallets.
- **Strict brain:** every decision passes the gate. Any missing data counts as a NO. No discretionary overrides.

## 9. Senses
- **Narratives:** analyse at least 2 narratives in parallel: X/Twitter, GMGN trending, and GMGN's tracker (KOL and smart-wallet activity).
- **Fees:** lowest possible on every entry and exit.
  - Compare quotes and routes, and use the network's current minimum priority fee.
  - Skip any trade where the costs break the payoff equation.
  - Measure every fee actually paid. Never assume a fee.

## 10. The Master Equation v2 (everything together, 2026-10-19)
```
φ = 1.618…                      every constant below is a φ-power or a Fibonacci number

SENSES      N_i  = narrative score from source i ∈ {X, GMGN trending, GMGN tracker, …}   (0–100)
            N    = min(N_a, N_b) over the two strongest independent sources   (both must agree)
            I    = instinct score from memory (per-feature Bayesian win rates)  (0–100)

GATE        G = Π 1[rule_j]  (age, liquidity+lock, top10, dev, authorities, volume, smart money,
                              N ≥ 61.8, regime ok, confluence on ≥3 of {1,3,5,13,21}m, data complete)
            fire ⇔ G = 1 ∧ tier = "fire"   (watch → ready → fire)

LEVELS      D = S_H − S_L ;  entries at S_H − {0.5, 0.618, 0.705}·D weighted {.382, .382, .236}
            stop = S_H − 0.786·D (→ break-even after T1)
            exits: .382 at S_H, .382 at S_L+1.272D, .236 trailed to S_L+{1.618, 2.618}D
            time checks at {3,5,8,13,21} min, out at 21 if no progress

COSTS       c = min over routes (fee + priority_min + slippage), measured live
            require  W(c) ≥ 3·|Λ(c)|   else skip

EDGE        W = Σ w_k·(T_k/Ē − 1) − c      Λ = (stop/Ē − 1) − c
            EV = p·W + (1−p)·Λ ;   p* = |Λ|/(W+|Λ|)
            conviction κ = clamp(I/61.8, 0.618, 1)          (instinct trims, never inflates)

SIZE        f = clamp(0.236·φ^(wins) ·φ^(−losses), 0.146, 0.382) · κ
            f ≤ 0.01·L_pool/B          (never more than 1% of the pool: no self-made slippage)
            Σ open f ≤ 0.618 ;  open ≤ {1,2,3} by win streak ;  fee reserve never traded

DAY         u = first realised profit ;  rungs R_n = F_n·u  (1,2,3,5,8,13) banked as checkpoints
            floor = last checkpoint − 0.382u ;  stop day at +61.8% or −38.2%
            loss L ⇒ recovery goal φ·L by selection/targets ;  size after loss ÷φ (never ×)
            target_{d+1} = result_d · φ

PORTFOLIO   milestones B0·φ^k ;  lock 0.236·gain at each ;  drawdown 0.382 from peak ⇒ 24h halt
            B_n ≈ B0 · φ^(green − red)

MEMORY      after each trade: update I, p_13/21/34, tool usefulness ; nightly: lessons only when
            13 ∧ 21 ∧ 34 agree ; daily diary ; synced to cloud
```
Additions by Claude (2026-10-19): the 1%-of-pool size cap (on thin coins our own buy would otherwise create the slippage), a fee reserve that is never traded, conviction κ from instinct which can only trim size, and a "data complete" rule inside the gate.

## 11. The trader app: decided 2026-10-19
- **Memory:** used only by the trader, never by other ultracursor work. Saved on the app (runtime/trader/memory) and mirrored to the cloud (R2), loaded on every start. It holds:
  - the journal of every trade and skip
  - win rates p over 13/21/34 trades, and by hour and narrative
  - the instinct / gut-feel weights, trained after every trade and reviewed every night
  - lessons, applied only when 13, 21 and 34 agree
  - a daily diary
  - the GMGN tools map: every GMGN tool, and how useful each one has been
- **Orb:** a small glowing orb at the bottom of the screen that grows with the memory size and shows the KB inside. Visible in trader mode only. Ultracursor is also used for other things, which never show it.
- **Trader mode speed:** the cursor snaps straight to targets with no human pacing. Analysis happens before the cursor moves.
- **Parallel lanes:** the GMGN scan, the X narrative reading and position management run at the same time, and none blocks another.
- **X:** read through Alex's own signed-in Chrome in ultracursor, plus GMGN's social data. No paid X API ("delete this API thing").
- **Autonomy:** the trader decides on its own, in milliseconds. Claude builds it, reads its memory and improves it, and is never in the loop of a single trade. "You are him": its rules are Claude's judgement, written down.
- **Training = "Sniper XYZ":** fake money on real GMGN coins, only when Alex says. The first session ran on 2026-10-19 for 60 min on the v1 engine.
