---
name: ultracursor
description: ultracursor — Alex's personal product-research Mac app (the Research app upgraded and renamed). Use whenever the work touches ultracursor, "ultra", the research app, finding products, the logo with the glass cursor, or the concept page that was made for Mark. Name, logo, look and scope are settled.
---

# ultracursor

## Settled (Alex, 16 Oct 2026)
- **Name: ultracursor.** Lowercase. ("call it ultra because it's going to be made with ultra code", then "ultracursor".) Do not suggest other names.
- **Personal only.** No sign-up, no subscriptions, no other users. ("you need to build it for personal.") The SaaS version pitched to Mark is dropped ("I'm gonna do it alone").
- **Built like Magic Wand, connected to Claude like the Wand** (Alex: "it will be connected like magic wand to you, make the research with you"). Code in `tools/ultracursor` (contract: `tools/ultracursor/SPEC.md`). It drives a REAL Google Chrome over the DevTools port (9333, profile `~/.ultracursor-chrome`) because logins only work there; the old Research app's embedded web views were never run on his Mac and had a broken message desk (mapped 16 Oct). It reuses the Research control plane `/research/<KEY>` on Kerberos (live, `research_*` MCP tools) so no Kerberos deploy is needed, and the Research skills + report counting. Claude does the judging from the evidence; the app reads and reports. Strictly read-only on every site.
- **Q4 knowledge** lives in `tools/product-research/skills/q4.md` (copied into the app): Halloween, BFCM 27–30 Nov 2026, USPS Christmas send-by 17–19 Dec, Chinese New Year 6 Feb 2027.
- **Logo:** a black liquid-glass cursor arrow with a bright white/silver rim and a specular streak, on a black squircle with stars and four small glints. Source `design/ultracursor/icon.svg`, renders `icon-1024.png`, lockup `logo-lockup.png` (icon + silver gradient wordmark "ultracursor").
- **Look:** black liquid glass with a starfield. NO blue and NO purple — both were rejected on the concept page. White/silver for accents. Real TikTok / Instagram / Google logos only where those sites are shown.
- **Concept page** (what the app should feel like): `design/ultracursor/concept-page.html`, published at https://claude.ai/artifact/QzVEfdwf7jPFEypweCzKxA. Never send anyone a kerberos.gardenbuddystore.workers.dev link for it.

## What goes inside (agreed list, 16 Oct)
1. The look above, build number on screen.
2. Goals set once: budget, daily target, niches, never-list.
3. Live research in its own window with the visible cursor: Meta Ad Library first, TikTok search + comments (buying signals: "where do I get this", "link??"), Instagram hashtags, Google search interest, competitor stores (price, offer, bundle, shipping). Signed in as Alex, human pace.
4. The brain: 6-point winner test, margin after shipping and ads, trim the fat, his past winners/losers.
5. Sourcing on Alibaba/1688, supplier messages in his style (`supplier-messages`), landed cost.
6. Report: top products with evidence + links, competitor videos, realistic revenue for his budget, "not enough seen yet" when thin.
7. Brand: name, logo, colours via Magic Wand.
8. Store built on Kerberos (15 sections); Shopify only if he asks.
9. Commanded in plain words or by Claude; runs while he sleeps; phone ping when the report is ready.

## Build 1 — shipped 2026-10-17
- Download: https://blackreaper.us/media/ultracursor-1-cfda3e00ca93c939.zip (also /media/ on kerberos.gardenbuddystore.workers.dev). R2 key `ultracursor-1-cfda3e00ca93c939.zip`.
- Source: `tools/ultracursor/src` (ultra, cloud, ui, overlay, parse, signals, q4, report, sites/{adlibrary,tiktok,instagram,trends,stores,common}). Pack: `tools/ultracursor/pack.sh <out.zip>` runs every test first.
- Proven here (235 checks): unit 51, overlay 73, pack/run.command 77, end-to-end 34 against fixture sites + stub control plane (sweep, signals, trends, stores, login wall, pause/run/stop, no re-run after restart, self-update refuse/accept + exit 97).
- NOT proven: selectors against the real Facebook/TikTok/Instagram/Trends pages. Every reader returns `how` + `diag` (title, url, text sample) — read the first live report's diag and fix from that, never guess.
- Mac setup: Node 20+ and Google Chrome; unzip, move ultracursor.app to Applications, right-click → Open the first time (unsigned); sign into TikTok, Instagram, Facebook once in the Chrome window it opens (port 9333, profile ~/.ultracursor-chrome).
- Hunt: POST /research/<KEY>/hunt `{looking, terms[], depth}`; report at /research/<KEY>/report?json=1.

## Build 2 — the general browser agent (shipped 2026-10-19)
Alex (via Codex, 19 Oct): "Keep it fully general-purpose — any task on any website. Do NOT hardcode anything Depop-specific
into the core." First real use: Depop ("take images and upload"), because ChatGPT's agent burns his credits.
- Download: https://blackreaper.us/media/ultracursor-2-f4199aeb6f4595b6.zip (R2 key `ultracursor-2-f4199aeb6f4595b6.zip`).
- How it works: a black glass bar bottom-right on every page of ultracursor's Chrome. He types a task (and attaches photos);
  Claude (Opus 5.5 via HIS Anthropic API key, pasted once into the bar, saved in
  `~/Library/Application Support/ultracursor/config.json`, mode 600) reads the page through Playwright's accessibility snapshot
  and acts on it with a human mouse/keyboard. No site selectors anywhere in the core.
- Settled: every final action (post/publish, send, buy/pay, delete, save, price change, submit, Enter in a chat box) waits for
  Approve / Skip / Stop on a card. Enforced by the harness (guard.mjs), not by the model. Never types passwords/cards/codes.
  Sign-in and captcha pause the task and it carries on by itself when they are gone. Pacing 1.2–3.2 s per action on Depop,
  limits per hour/day, $2 spend cap per task, JSONL log of every step in `runtime/logs/`.
- Site knowledge lives ONLY in `src/profiles/<site>.json` (depop.json: brand "Chrome God", sign "Alexander", flip-negotiator voice,
  no-go rules). Adding a site = adding a file. Asked Alex 19 Oct whether the shop is "Chrome Jesus" (he wrote that); no answer yet.
- Chrome 136+ ignores the debug port on Chrome's default profile, so it stays ultracursor's own permanent profile
  `~/.ultracursor-chrome`: sign into Depop there once (email login).
- Claude can also post a task: a hunt whose `looking` starts with `task:` (image URLs in `terms` become the task's photos); the
  result comes back as a report.
- Proven here (547 checks, pack.sh): agent-e2e 40 (fake marketplace + stub Claude through the real SDK: photo listing, sign-in
  wall, approvals, skip, stop, refused card number, captcha, pause/resume, spend cap, append-only history), panel 13, agent-unit
  110, brain-types 4 (request type-checked against SDK 0.125.0), stub-claude 50, shop 91, overlay 73, pack/run.command 80,
  research e2e 35, unit 51.
- NOT proven: a real Claude model driving real Depop pages. First runs = the Depop test plan below, approvals on.
- Depop test plan: 1) "Open my Depop shop and tell me how many listings are live" (read-only). 2) "Draft a reply to my newest
  unread Depop message" (Send card → Skip or Approve). 3) "Change the price of <item> to $X" (card shows old → new).
  4) Attach photos + "List this: <item>, size, condition, price, category" (Post card → check → Approve).

## Depop listing rules (Alex, 2026-10-19)
- Never "Save as a draft". When a field is missing, ask for it; when he answers, post.
- The 22K roll chain at $16,000 got "There was a problem listing your product" twice. Right after that, the form had worldwide shipping turned on at $0 and the tags Source=Vintage and Age=Antique, none of which we set. Then Depop returned 403 Forbidden. Find out what set those fields before driving Depop again. Re-read every field before pressing Post.

## Build 5 — trader mode inside the app (shipped 2026-10-20, self-update)
- Shipped through the self-update: R2 `rs-runtime.json` (served at /research/<KEY>/runtime) -> build "5", 25 files at
  https://blackreaper.us/media/uc5-<path with / as -> (ultra, ui, panel, agent/{agent,desk,guard,host}, profiles/depop.json, trader/*.mjs).
  Build 4 was uc4-*. The Mac picks it up within 60 s of the app running, node --checks, exits 97, restarts as build 5.
- **Switch trader mode on:** Alex clicks the small "trader" pill above the idle bar (bottom-right); "stop trader" beside the orb turns it off.
  Claude: put `{"on":true,"at":<Date.now()>}` to R2 `gardenbuddy-media/uc-trader.json` (`npx wrangler r2 object put ... --remote`;
  `{"on":false,...}` to stop). The app reads it every 15 s with a ?t= cache-buster; the newest `at` (pill or flag) wins.
  The pill's word is kept in `~/Library/Application Support/ultracursor/trader/mode.json`.
- When on: `src/trader/inapp.mjs` runs Sniper XYZ (training, fake money, $10 ledger, memory) in the app process; GMGN is read from a
  background tab of his own Chrome via the app's connectOverCDP (port 9333), Gmgn.attach(). Data lives in
  `.../ultracursor/trader/` (outside WORK so run.command never wipes it); empty memory is seeded from the public
  trader-memory-latest.json. Status/heartbeat carry `trader: {want, running, gmgnCalls, gmgnErrors, lastError}`.
- The orb (bottom centre, grows with memory KB, click = mute) shows while it runs; the bar folds away in trader mode unless a card or task needs it.
- Speed ×6.47 in trader mode (agent pacing and the cursor glide); a profile with `"humanPace": true` (depop.json) keeps human pace.
- Guard: while trader mode is on, clicks on gmgn.ai Buy/Sell/Swap/Max, quick amounts (0.1, 0.5 SOL, $5) and % buttons are refused (`gmgnTradeClick`).
- Proven here: headless Chromium on --remote-debugging-port as his Chrome; app started, flag on -> trader started, gmgn tab in background,
  246 GMGN calls / 0 errors in 75 s, orb heartbeat written. Headless UA got Cloudflare 403; a normal Chrome UA passes.
- Not proven: his real Mac Chrome; panel pill clicked by a real mouse (orb/panel tests pass, pill seen in test/shots/panel-orb.png).
- Next: GMGN server-side trending filters (read the filter fields the UI sends, pass our gate thresholds, record in tools map).

## Builds 6–10 (2026-10-20)
- 6: no Claude API key bar (Alex: "fuck this api key"); tasks come through the link. Zip: https://blackreaper.us/media/ultracursor-6-b83639fb46568fe3.zip
- 7: ticker above the orb (balance · trades · W/L · open · last buy/sell); status carries `trader.book`.
- 8: the trader's GMGN tab no longer blocks images/fonts. Alex watches that tab, and it looked broken.
- 9: status `trader.blocks` counts failed rules. Evidence: the Fib sniper fired 0 trades because every coin failed gate + narrative + costs + smartNow together.
- 19: wider Fibonacci (8% run, pocket 0.382-0.786, stop under 0.886), 1m+5m trending, 34 charts; slow sniper lanes parked (0 trades, starved GMGN).
- 26: hunt accepts quotes over the 2.36% impact cap at measured cost.
- 28: buys instantly; the real fee is measured right after and written into the ledger (first buy waits for one measurement); "scanning" text removed.
- 31: every GMGN read times out (8 s in page, 10 s outside); first fee check capped at 15 s. A hung GMGN read froze symbiot after one scan.
- 30: Jupiter quotes time out after 4 s (a silent Jupiter hung the first buy: 0 trades on the Mac); fallback fee = GMGN pool fee + tax + network.
- 29: symbiot: every coin from trending + GMGN Trenches (new, almost bonded, migrated; read from the pages own HTTP/websocket traffic, gmgn.mjs coinsIn/feed) traded once at 1.618 SOL; infinite balance (start 0, cash never blocks); no loss budget; money line shows + total, - total, net. Ledger symbiot29.
- 27: ULTRA (Alex): fake balance 52,000 SOL, loss budget 1,000 SOL (halts new buys), every launch bought once at 1.618 SOL (e:any when no setup) to collect lessons, 89 charts a scan, 34 open, fee cap 30%. Fresh ledger (ultra27).
- 25: HUNT mode (Alex: "lose now to learn, find the 40% in 20 seconds"): launches from 60 s, pools >= 3K, no top-10 rule, fees up to 15% (real cost charged); entry = Fibonacci pocket OR ignition candle (+4% on 2.618x volume); exits +40%, -15%, give back half of a +25% run, 2 min max; up to 8 open; learning blocks a shape only after 13 trades under 23.6% wins. Fresh ledger (hunt25).
- 24: orb + money line kept alive by a fast-lane heartbeat (the parked sniper owned it; they vanished after 15 s). Alex: trade new launches, fake money, learn: age >= 3 min, lq >= 13K, round trip up to 6.18% (real cost charged), fee bucket in the learning shape. Fresh ledger (fib24).
- 22-23: status shows fee-skip reasons; live data showed 3-5.4% round trips at 1.618 SOL on thin pools (price impact), so only pools >= $89K liquidity are charted.
- 21: liquid-glass orb (Alex): clear glass, 1px rim, specular top-left, three drifting lights inside (cyan, blue, violet), radius 18+2.618 ln(1+KB) clamped 18..36. Looked at over dark and white before shipping.
- 20: exits (Alex): half at +10% and stop to break-even, rest at +20%. Fresh ledger (PLAN fib20).
- 18: fresh ledger + lessons for the Fibonacci plan (PLAN "fib17"); older ledgers not carried over.
- 17: chart-only Fibonacci (Alex: "trade the chart, not the coin"): every scanned coin, 34 1m candles, swing low then high (>=13% move), buy in the golden pocket 0.5-0.705 on a green candle if 0.786 held; stop under 0.786, target the swing high, 13-min time stop. No hype, narrative or smart money.
- 16: more risk (Alex): 21 coins scanned, 2 green 1m candles enough, round trip up to 1.618%, 5 open.
- 15: launch opens GMGN, never Depop (run.command START_URL + first https tab redirected at first connect). Zip: https://blackreaper.us/media/ultracursor-15-1c3d468b0e5906a1.zip
- 14: lowest tip: network cost = 10th percentile of what the last 50 trades on the coin paid (fees.mjs tip:"lowest"), not the median.
- 13: fast lane measures the real fee per coin before buying (fees.mjs: Jupiter round trip + pool fee + tax + network) and only trades coins under 0.618% round trip; ledger charges the measured cost. Network fee alone is ~0.000005 SOL; pool fee and price impact cannot be zero.
- 12: fast lane learns: each trade filed by setup shape (rise, volume, liquidity, age, hour); a shape with 5+ trades under 38.2% wins or negative average is refused for 21 trades, then re-tested. Stake never changes (no emotion). Lessons persist.
- 11: fast lane runs a 50 SOL fake balance, 1.618 SOL every trade (Alex). Ticker in SOL.
- 10: fast lane `src/trader/scalp.mjs`. Momentum on 1m (3 rising closes, above the 8-avg, volume up), TP +13%, SL −8%, 3-min time stop, 23.6% size, max 3 open, ≤61.8%, 1% cost a side, 5-min cooldown. Fake money; it feeds the ticker. Test: `test/scalp.test.mjs`.
- Runner tests set `ULTRA_TRADER_FLAG` to a dead URL so the live switch never leaks into them.
- Real-money buying is NOT built (execute.mjs is a stub). Alex asked for real trades on 2026-10-20; each real buy would need his click.

## Symbiot (Alex, 2026-10-20)
The trader inside ultracursor is called **symbiot**. It's part of Alex's ecosystem. It trades everything it sees on fake money (build 27, ULTRA: 52,000 SOL, 1,000 SOL loss budget) to detect every kind of move and collect lessons. Rules for where real money goes in come later, decided by Alex from symbiot's data. Until then: no real money, and no seed phrase or keys ever held.
- The two sides (Alex, 2026-10-20): on one side **symbiot** trades everything it sees, reads no chart, and its only job is data. On the other side is **the human-style trader**, which picks its trades with judgement and the lessons symbiot found. Real money only ever goes through the trader side, under rules Alex sets from symbiot's data.
- Build 40: PS2 orb (Alex): navy-black sphere, blue rim + bloom, glowing translucent cubes rising through blue fog. Money lines: SIM (symbiot) and REAL ("not connected" until the real trader exists), then the latest lesson.
- Build 39: stops new buys at cfg.maxTrades (5000, Alex).
- Build 38: symbiot filters whole combinations (age|pool|hour|source|entry) after 13 trades under 23.6% wins, lets 12.5% through to re-test (cfg filter/explore); never blocks on one trait. Status: fast.filtered, fast.bestCombos.
- Build 37: money line refreshes every second with live P&L of open trades; second line shows the latest lesson (post-mortem tag).
- Build 36: post-mortem on every trade: coin watched 2 min after exit, tagged sold-too-early / stop-then-pump / bought-the-top / gave-back / fee-ate-it / cut-right / good; counts + avg in status fast.mistakes.
- Build 35: symbiot (readChart false) never blocks on lessons (they had blocked everything); lite shapes age/lq/hour/source.
- Build 34: checks the coin's pool fee + tax (GMGN token_fee_info) before buying; skips when over cfg.maxRt. Live settings now: maxRt 0.03, maxOpen 89, perScan 89.
- Build 33 zip: https://blackreaper.us/media/ultracursor-33-46a01c7f9aa91072.zip
- Build 32 (shipped): symbiot buys every coin with no chart (readChart false), price from 2 candles; every symbiot number lives in `DEFAULTS` in scalp.mjs and can be overridden live from R2 `symbiot.json` (no hardcoding; Alex: "flexible").
- **Super farming** (Alex, 2026-10-20): symbiot running nonstop to gather knowledge. While it runs, Claude takes a status snapshot about every 30 minutes and appends it to `design/symbiot/farm-log.md` (trades, W/L, plus/minus/net, fees, open, settings, notes on what it shows).
- The plan (Alex, 2026-10-20, "ultra genius"): the **sim** (symbiot) and the **real-money trader** run at the same time. The sim trades every new coin on fake money at 1.618 SOL each, up to 144 open, never stops even when it loses, and aborts a coin early when it looks dead or is crashing so it can move to the next. It counts what is really moving and winning. Real money goes in only where the sim shows winners. maxOpen is 144 (live setting).
- Real-money ladder (Alex, 2026-10-20): start with $15, then step to $20 → $30 → $50, and only then scale. Each step must be reached before the stake grows. Only setups the sim proves are winners get real money.
- Build 43 zip: https://blackreaper.us/media/ultracursor-43-3b51c48c2e9cdbca.zip
- Build 42 (2026-10-20): the real-money trader (src/trader/real/) is wired into inapp.mjs, with buy cards via desk.showTradeCard. The panel shows REAL · mode · step N of 76 · balance → next goal · P&L, a green progress bar, and the open real positions in green.
  - It starts in PROBE mode: it reads GMGN's trade panel and never clicks. Settings live in R2 real.json (`{"mode":"probe","startUsd":15}`), re-read every 30 s.
  - To go LIVE, Claude reads `trader.real.probeReport` from ultra_status, writes the selectors plus selectorsFrom plus the wallet address into real.json, and sets mode to "live". Every buy still needs Alex's card. Sells are automatic.
  - Real money only follows sim-proven setups (proof.mjs: at least 21 trades and at least 55% wins after fees). The stake is capped at $19.10 until Alex says scale.

## Builds 44–52 (written 2026-10-27, from git history and the live status)
- Real trader (src/trader/real/): PROBE reads GMGN's trade panel and never clicks; LIVE needs the selectors hash in R2 `real.json` (`selectorsFrom`, now `"auto"` = newest usable probe of this build). Buys the GMGN **Instant** window's preset (0.01618 SOL) and sells 100%. Sells are automatic; buys are automatic within caps when `autoBuy` is on (day cap `autoMaxDay`, floor under the day's starting SOL). Kimchi (`CSocnzcRp…pump`) is never bought.
- Build 52 (Alex: "close all the tabs and leave only one open. Don't open more"): everything the trader does runs in ONE gmgn.ai tab (`trader/onetab.mjs`: keeps the visible one, closes the other gmgn.ai tabs, never touches Alex's other sites, never opens a page); several positions at once (`maxOpen` 1–20, default 2; `perMin` default 2; capped by free SOL minus a 0.01 SOL reserve); each position exits on its own; the cursor glides at 6x the trader pace for every click; a manual stop sells every open position and buys nothing in that pass.
- Tests for it: `test/snipe.test.mjs` (30 checks against a fake GMGN Instant page in headless Chrome). On 2026-10-27 five of them failed; causes were in the TESTS, not the trader: headless Chrome reports every tab visible (test now marks the other tabs hidden, like a real Chrome); the fake wallet held $7 against a $15 step-1 peak, so the step ladder's 61.8% drawdown halt fired after the first sale (test now sets peak and start to $7); the "room again" and "manual stop" checks assumed exact counts that depend on queued picks (now they check the invariants). One real fix: the stop pass no longer buys a new coin in the same tick.
- Do not `pkill -f` / `ps | grep pattern | kill` with a pattern that appears in your own command line: it kills the shell.
- Live status read 2026-10-27 (app NOT connected, last seen about 6 days earlier, build 50): symbiot SIM 617 trades, 100 wins / 517 losses, net -69.5 SOL (fake), fees 10.2; real: probe mode, wallet 0.130 SOL (~$13.8), 0 real trades. The sim shows NO profit; the real trader's proof gate (>= 21 trades and >= 55% wins after fees) is not met by the sim.
- PUBLISHED 2026-10-27: build 52 through the self-update (R2 `rs-runtime.json` now build "52", 9 files `uc52-<path>`, each byte-checked against the repo after upload, plus the new `trader/onetab.mjs`). pack.sh passed every test. The Mac was not connected when published (last seen about 6 days earlier), so the update is picked up the next time the app runs; NOT yet seen running on the Mac.

## STANDING RULE: no approval cards for GMGN buys (Alex, 2026-10-27)
> "Don't ever ask me to approve a purchase, okay? This is the reason we have the cursor. You don't ask me to approve, you just do it. You do the trade. Even when I'm sleeping, okay?"
- Built as build 54: `profiles/gmgn.json` has `autoBuy.maxSol` 0.05; `guard.mjs autoBuyOk(url, target, autoBuy)` lets a click through with no card only when ALL hold: host gmgn.ai, the button's whole name is a plain number (an Instant-trade preset like `0.01618`) at or under the cap, not Kimchi, and the profile has a policy. `agent.mjs` is the single caller. Hour/day limits of the profile still apply (12 / 40). Bigger amounts, "Buy"/"Max"/"%" buttons and every other site still wait for his card. Profile `autoApprove` can still never list buy or delete.
- NOT covered: shop checkouts, processors, ad spend. Rules 18, 20, 22 in AGENTS.md stand.
- After a trade, say what happened in one line. Never write "please approve".
- 2026-10-27 first cursor trade: Alex asked for one trade with the cursor; the Instant window opened (presets 0.01618 / 0.1 / 0.5 / 1, Sell 10 / 25 / 50 / 100%), the click raised a card (build 52 had no auto rule) and was still waiting on his Approve.
