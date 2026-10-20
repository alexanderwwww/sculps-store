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
