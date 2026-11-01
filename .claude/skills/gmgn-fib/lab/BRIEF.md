# ULTRA LAB — shared brief (2026-11-01)

Alex runs **Ultra**, his own Solana memecoin trader (not a copy of any bot): real wallet, real money, Jupiter swaps signed on his Mac, one engine in `tools/autotrader/src/lib/` (engine.mjs, strategy.mjs, organism.mjs, exec-jupiter.mjs, intel.mjs, whales.mjs, narrative.mjs, chart.mjs). He wants a lab: trading psychologists, mathematicians, quants, microstructure engineers, all in one room trying to impress each other, inventing NEW ways, not tuning old ones. He accepts it takes months. He wants profit, many trades, small wins. **Be honest: an invented edge that does not survive a cost-aware, out-of-sample test is worth zero.**

## The facts so far (do not re-discover these)
- Wallet 0.0097 SOL (started the day at 0.0161). Stake now 0.003 SOL (0.318 x portfolio, golden-ratio step up after a win, down after a loss). Each open coin locks ~0.002 SOL rent (back on sell). Live scalper (build 80): momentum entry "rising in 20 s", take +0.6% on the real sell quote, stop -2%, max hold ~24 s.
- **Round-trip cost is ~3.5-5%** (buy slippage + sell slippage + priority fee + the sell quote already sitting ~2.5% under the stake). Measured live and in sims.
- Live today: 35+ closes, avg about -2.2% a close, wins small (+0.1..+5%), losses big (-3..-15%). Winners leave in 9-41 s, big losers sit 70-90 s. First real sell quote after the buy is what decides: ELON first quote -15.5%, 白いヤク -7.4%, tipr -2.5% = loss was in the BUY fill; coins whose first quote sat at the stake ended within ~1.3% of zero. Build 80 now refuses a buy whose Jupiter round-trip sell quote returns < 95% of the SOL spent.
- Backtests (1-minute candles, 144 pools Oct 26-28 in `tools/autotrader/data/pools-oct28.json`; 60 pools Oct 31-Nov 1 in `data/pools-nov.json`; cost 4% round trip): **240 short-term combos (mom 2%/4%, pullback after run, 3x volume burst, 3 green candles x tp 3-25% x sl 3-12% x hold 2-15 min) = 0 positive on train, 0 on test** (script `tools/autotrader/entry-families.mjs`). Random entries -4.2..-4.7%. Current rules -4.3..-5.1% a trade.
- Only config positive out of sample: slow breakout (lookback 10 candles, volume 1.5x, 34% green, tp +90%, sl -25%, hold 60 min, age 4-90 min, chase<=3): Oct train +6.5% n=35, Oct test +3.2% n=46, Nov +1.5% n=30. About +2.5% a trade out of sample, ~1.4 sigma. NOT proven (`tools/autotrader/nov-check.mjs`, `tune.mjs`).
- A "flow >= 700 trades in 5 min" filter looked good on one coin (Amazon +0.56% avg over 8 trades) and failed on the next (ELON -15.5%).
- Forced "idle pick" entries lose more than real signals (idle 1/5 wins, -4.5%; signals 4/12, -1.2%).
- Data on disk: `tools/autotrader/data/ledger.csv` (133 on-chain trips from Oct 29: pct, hold_s, max_up_hold, max_dn_hold, max_up_after, max_dn_after), `pools-oct28.json`, `pools-nov.json` (each pool: name, mint, created, liqUsd, cs = 1-min candles o/h/l/c/v), live bridge (read-only GET): see below. 1-second data does not exist yet; Ultra's own live log has per-trade entry text, exit kind, ret, est {ret, low, peak, kind, trig}.
- Lessons file with everything tried: `.claude/skills/gmgn-fib/research-2026-10-29-lessons.md` (read the last 15 lessons at least).

## Read-only access to the live system (never write)
Bridge: `https://kerberos.gardenbuddystore.workers.dev/ultra/<KEY>/status` and `/log` (GET only). KEY = the string in `app/routes/ultra.$.tsx` (`grep -o -E 'KEY *= *"[^"]+"'`). NEVER call `/order`, never POST, never publish, never deploy, never touch the wallet, never run wrangler. Public APIs OK for research: GeckoTerminal (rate limit ~30/min), Jupiter quote API (read-only quotes), Solana public RPC (read-only), DexScreener.

## Rules for every lab member
1. **Research only.** Do not edit anything under `app/`, `tools/autotrader/src/`, or publish anything. Work and save in `.claude/skills/gmgn-fib/lab/<your-name>/` (scripts, results, a `REPORT.md`).
2. Every claim needs a number from a script you ran; keep the scripts so another member can re-run them. Use a train/test split by POOL (never by time inside a pool) and the 4% round-trip cost (state if you use another and why).
3. Say what you tried that FAILED. Failed experiments are findings.
4. Think from first principles about WHO is on the other side of each trade and WHY a price would move after Ultra buys. Invent. But test before you claim.
5. Constraints that are real: wallet ~0.01 SOL (tiny), swaps take 1-3 s to land, quotes have ~1 s latency, Ultra runs on a Mac with a normal internet line, one wallet, Jupiter only (no custom on-chain programs, no private mempool).
6. Final answer (max 450 words): (a) your 3 best ideas ranked by expected net edge, each with hypothesis, evidence (numbers), the test that would prove it live in <1 day, what code it needs (file + function), risk; (b) what you ruled out; (c) path of your REPORT.md.
