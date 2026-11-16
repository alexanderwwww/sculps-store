---
name: aquarius-plan
description: DRAFT v0 plan (not agreed, nothing built) for Aquarius, Alex's living trading brain and its 3D ancient-Greece-in-the-future city: the 144 workers (12 departments x 12 jobs), the learning loop, how Claude/Grok Bot/ChatGPT connect, and the open decisions. Use before building anything for the Aquarius city or brain.
---
# Aquarius plan, draft v0 (2026-11-16). NOT AGREED. NOTHING BUILT. Alex still has videos and pictures to send.

## Design rules (from Alex and from our evidence)
1. Liquid, not versioned: strategies, limits, roles, workers are DATA (rows/JSON) read at run time; changing them never needs a new build.
2. Learning = memory + test loop judged by money results after real costs (round trip ~5% on memecoins). A worker may only change a rule through the tournament (backtest -> out-of-sample -> 100+ trades -> 95% interval above zero). Models do not update their own weights.
3. One executor places orders; the Council of Olympus veto (the Skeptics) and Risk's limits cannot be overridden; kill switch; missing data = NO.
4. 144 workers does NOT mean 144 always-on AI calls (that would burn credits in hours). Most workers are cheap code jobs on free data (cron every N seconds/minutes); an AI model is only called to read, judge or write. The LLM budget is a worker's job too (dept 12).
5. Claude is the orchestrator; Grok Bot adds live X search; ChatGPT helps as a second reader. Their output is evidence labelled verified/reported/claimed/inferred, never a trigger.
6. Sources of truth: trading-kb (facts), recipe (rules), trading-lab (research).

## The 144: 12 departments x 12 workers (jobs)
1. **Scouts, Solana:** new pairs; trending list; boosted-token flag (paid = warning); volume spikes; liquidity adds; holder growth; smart-wallet buys; launchpad graduations; dev-wallet watch; copycat-name detector; narrative clustering; top-gainer sanity check.
2. **Scouts, stocks and majors:** pre-market gappers; 20-day breakouts; bull flags; opening-range breakouts; oversold bounces; unusual volume; BTC/ETH/SOL regime; funding rates; open interest; perp basis; earnings calendar; halt list.
3. **Whales:** Hyperliquid leaderboard poller; steady-winner finder (the 144 mid-size winners); 90-day persistence tester; GMGN smart-money feed; KOL wallets; funder clustering (same owner); wash-trade detector; market-maker classifier; wallet PnL recomputed from raw fills; copy-latency tester; new-whale discovery; whale-sell alarm.
4. **News and sentiment:** headline RSS; SEC 8-K feed; Google Trends; live X search (Grok Bot); StockTwits mood; Reddit mood (when reachable); Fear and Greed; token announcements; exchange listings; regulatory news; exploit/hack alerts; event calendar (GTA 6 etc.); source-quality grader.
5. **Setups:** swing finder; Fibonacci levels; entry ladder; stop calculator; target calculator; time stop; liquidity-aware sizing; stressed-stop sizing; reward:risk after costs; multi-timeframe confluence; regime tagger; setup library keeper.
6. **Costs:** Jupiter round-trip quotes; pool fee reader; token-tax detector; slippage estimator by size; priority-fee tuner; route comparer; rent reclaim; cost-per-venue ledger; break-even calculator; the 6x-cost gate; fee-drift alarm; venue health (RPC/TLS).
7. **Council of Olympus (the Skeptics; named by Alex 2026-11-16):** backtest runner (Freqtrade); out-of-sample splitter; bootstrap/permutation p-value; 95% interval calculator; survivorship checker; rug and safety scorer; honeypot checker; overfitting detector; sample-size gate; Time Machine replay; adversarial reviewer (tries to kill every idea); veto recorder.
8. **Risk:** per-trade risk; daily stop; open-risk cap; correlation clusters; kill switch; position limits; drawdown monitor; exposure vs wallet; stale-data guard; API-health guard; loss-streak throttle; limits-file enforcer.
9. **Execution (one trader, twelve steps):** paper executor; live executor (locked); order builder; stop-loss placer; fill reconciler; on-chain verifier; sell-everything fallback; retry and backoff; wallet balance watch; failed-transaction analyzer; cap enforcer (0.05 SOL per click, hour/day limits); approval-ticket keeper.
10. **Review and journal:** trade journal; process-vs-outcome grader; fill-vs-signal slippage audit; win/loss stats; expectancy calculator; giveback analyzer; missed-signal counter; lesson extractor; daily report; weekly report; brain-row writer; mistake-pattern finder.
11. **Learning (the neurons):** link watcher (reels); repo reader; paper-trader for new ideas; hypothesis registry (rules written before testing); recipe tournament scoreboard (R1-R5); guarded parameter refitter; knowledge-base curator; contradiction finder; idea killer (abandon rules); skill writer; experiment scheduler; memory compactor.
12. **Ops and city:** data-source health; scheduler; secrets guard (nothing leaks); credit/LLM budget monitor; uptime watcher; backup to R2; deploy guard; city feed; big-screen aggregator; notifications to Alex; Grok/ChatGPT bridge; access and login guard.

## City detail (Alex, 2026-11-16)
The Council of Olympus (the Skeptics) has its own small GOLDEN building/chamber in the city: gold columns, a round council table, one seat per Skeptic, and a glowing verdict stone that shows the latest PASS/BLOCK with the deciding number. A BLOCK is visible and cannot be overridden.

## The big screen (portfolio + neurons)
Portfolio: equity, open positions, paper vs live, P&L after costs, win rate, trade count, 95% interval, "NO EVIDENCE yet" under 100 trades. Neurons: each recipe's scoreboard (alive/killed), what each department learned today, the Skeptic's last 10 vetoes with reasons, worker health.

## The city (look, not built)
Small 3D town, ancient Greece in the future: columns, marble and glass, a huge headquarters (Apple-HQ feel) at the center, twelve department buildings around it, workers walking between them with real status bubbles, Alex's office at the top. Reuse what we have: v3 style, three.js skills, the city code in tools/mob/city. Needs Alex's drawing and the videos/pictures first.

## Open decisions for Alex (answer when ready, one word each)
1. Build order: brain and loop first (can be seen as numbers), city second? (my pick)
2. Where it runs: our server (24/7) with the old laptop as the second worker?
3. Risk cap per memecoin trade: 2% / 4% / keep phi.
4. Budget for live: how much SOL goes in after tests pass.

## Concept image v1 feedback (Alex, 2026-11-16)
Liked the place; said it "looks AI" and "doesn't make sense". Decisions:
- NO genie in the city (deleted).
- Must feel like playing a game, and be an ACTUAL DATA GAME we build: every building, worker and screen is driven by real data, nothing decorative. Style = in-engine low-poly, not polished AI art.
- Statues required: Zeus, Athena, Apollo, Hermes (god of commerce), Dionysus, Hecate. Proposed roles (Alex to confirm): Zeus = hard limits and kill switch; Athena = strategy; Apollo = research and forecasts; Hermes = execution and trades; Dionysus = crowd sentiment and hype; Hecate = gatekeeper (rug and safety checks). They can be the Council of Olympus.

## LOOK APPROVED (Alex, 2026-11-16): the v4 island image. Now: playable, WoW-like, real data, not AI-looking. NOT BUILT.
Game design draft (Alex: "take your time"; build only on "build"):
- Camera/controls: third person, Alex walks his character around the island like WoW (WASD + mouse), click a building or worker to open its panel. Flip to an overview camera with one key.
- Main screen HUD (always on): top bar = equity, today's P&L after costs, open positions, PAPER or LIVE badge, evidence counter ("NO EVIDENCE yet" under 100 trades), kill switch, Council verdict. Money-moving strip with icons: each buy/sell/fee/win/loss pops as a coin icon with amount and flies from the district that caused it. Right: agent list with status bars. Bottom-left: minimap. Big wall screen at HQ = portfolio + neurons.
- Everything is data: a worker's nameplate and animation come from its real job status; a tower's height = a strategy's profit after costs; a building lights when its feed is live and goes dark when data is stale.
- Style: modeled low-poly in three.js (style v3), not AI art.

## DECISIONS (Alex, 2026-11-16, voice) - waiting only for the word "build"
- Every bot is a real worker: name, job, rules, its OWN skills. Every section, the Council and the CEO (= Alex) have their own skills. Tapping a worker shows its skills and what it is doing; Alex does not have to command them.
- Whole island playable, every building enterable, every building has a purpose (no purpose = not there). HQ interior, Council, departments, market square with public market screens.
- Look: ancient Greece + PS2 + World of Warcraft vibe, real-looking buildings and obvious statues, NOT blocky/Roblox; characters must not look ugly. (Honest limit: browser 3D, stylized hand-painted, not WoW production art.)
- Main screen like Ultra's: money made, trades taken, live. It is a website, runs on our server 24/7, always learning into the database (progressive learning, a real brain).
- Paper first; then one day of a tiny live test only inside rule-26 caps. Spawn rule: a bot may create a bot only if the Council approves.
- Usage: Alex pays for NO extra usage. Smart bots run on Claude's own usage (the hourly runs) and free sources; most workers are free code jobs.
- Risk per trade: Alex leaves it to us: use the recipe (Fibonacci, Time Machine, 6x-cost gate); ceiling 2% per trade, kill switch always.
- Grok and ChatGPT connect later through his logged-in browser, the same way the city is set up.

## ART RULES (Alex, 2026-11-16): nothing Roblox/blocky. Buildings, gods, trees, water, characters all get real hand-painted textures and vibrant World-of-Warcraft colours (not Blizzard production, but never trash). The CEO (Alex) is a nice animated 3D character he walks himself; workers share the body with different tunics. Characters from free CC0 packs (Quaternius), tested in-game before claiming they work. ChatGPT (Magic Wand) makes concept art and marble/stone textures only.

## BOT CREATOR + INVENTORY (Alex, 2026-11-16)
Main menu has an Inventory page. From it Alex creates a bot (worker) with a prompt: name, job, rules, skills, and which brain powers it (Claude, Grok or ChatGPT). The new bot appears in the city at its department's building. Inventory also holds skills, recipes, strategies and bots. A bot made by Alex needs no vote (CEO); a bot made by another bot needs the Council. Grok/ChatGPT-powered bots run through his logged-in browser (no paid API); Claude-powered ones run on Claude's own usage. Every new bot starts on paper with a budget cap. Not built.

## SURVIVAL MODE (Alex, 2026-11-16)
The island lives on the wallet: health = equity vs start. Thriving/healthy/hurt/critical/destroyed changes the world (sun to storm to ruins). At 10% or less of the start it is destroyed: trading stops, a post-mortem goes into the brain, only Alex can rebuild (memory kept). Risk tightens as health drops.

## BOT MODE LOOK (Alex, 2026-11-16, replaces Apple-style): like the ATS Matrix GROK DESK screen, even better: dark dense terminal, central agent reactor ring with handoff trails, tape, swarm PnL, trace, pricer, signal spectrogram. Real data only.

## CENTRE (Alex, 2026-11-16): the Aquarius Colosseum is his office. Inside: a giant amethyst crystal. On the ground: a pentagram inside a circle inside a triangle, in gold, with Olympian symbols around it. Bot-mode reactor = a sun with a face and the 12 departments as planets, helpers as moons. World scale and walking like World of Warcraft.
