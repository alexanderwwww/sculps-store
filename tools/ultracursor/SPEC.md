# ultracursor — build 1 spec (the contract every part is built to)

Read AGENTS.md (the rules in section 3 are law here), .claude/skills/ultracursor/SKILL.md,
.claude/skills/shipping/SKILL.md, .claude/skills/magic-wand/SKILL.md (the proven pattern we copy).

## What it is
Alex's personal product-research Mac app. Claude commands it through the existing control plane
(the live Kerberos route `/research/<KEY>`, already deployed — DO NOT change or deploy Kerberos).
It drives a REAL Google Chrome on his Mac over the DevTools protocol, exactly like Magic Wand
(tools/promptbot: `app/Magic Wand.app`, `run.command`, `live.mjs` using `chromium.connectOverCDP`).
Why real Chrome: logins (Google/Apple/TikTok/Instagram/Facebook) work there and are kept in its own
profile; embedded web views break them (AGENTS rule 14). It is READ-ONLY on every site: it never likes,
follows, comments, messages, posts or buys. It reads, scrolls, opens posts and comments, and reports.

## Layout (all under tools/ultracursor)
- `src/` — the source of truth, plain ESM Node 18+ (no TypeScript, no build step):
  - `ultra.mjs` runner entry (control loop, sweep orchestration, self-update, status/log)
  - `cloud.mjs` control-plane client
  - `ui.mjs` overlay injection + human mouse/scroll helpers (node side)
  - `overlay.js` the browser-side overlay script (injected into every page)
  - `signals.mjs` buying-signal detection on comment text
  - `q4.mjs` the Q4 dates and day arithmetic (see skills/q4.md)
  - `report.mjs` turns sweep evidence into the report object
  - `sites/adlibrary.mjs`, `sites/tiktok.mjs`, `sites/instagram.mjs`, `sites/trends.mjs`, `sites/stores.mjs`
  - `skills/*.md` copied from tools/product-research/skills (incl. q4.md) — shipped for Claude/reference
  - `package.json` — `{"type":"module","dependencies":{"playwright-core":"1.63.0"}}` (exact; same as the repo's node_modules so tests here = his Mac). NO browser download ever.
- `run.command` — what the Dock icon opens in Terminal (copy Magic Wand's run.command structure: node search, Chrome check, WORK dir in Application Support, always refresh scripts, npm install once, launch Chrome with its own profile + debug port, restart loop).
- `app/ultracursor.app/Contents/` — Info.plist (CFBundleName/DisplayName "ultracursor", CFBundleIdentifier com.blackreaper.ultracursor, CFBundleExecutable ultracursor, CFBundleIconFile AppIcon), `MacOS/ultracursor` (bash: `open -a Terminal "$HERE/run.command"`), `Resources/` (filled by pack.sh: run.command, src files, AppIcon.icns).
- `pack.sh` — stamps ONE build number everywhere (BUILD file → run.command BUILD=, ultra.mjs reads env ULTRA_BUILD), copies src into Resources, builds AppIcon.icns with `node ../plug/make-icon.mjs ../../design/ultracursor/icon-1024.png`, runs ALL tests and fails on any failure, zips to the given path with `ditto`-compatible structure (use `zip -qry` keeping exec bits), then re-opens the zip and checks the bundle inside (exec bit on MacOS/ultracursor and run.command, plist name, build number matches).
- `test/` — fixtures + tests (see Testing). `BUILD` file contains `1`.

## Constants
- Control plane base: `https://kerberos.gardenbuddystore.workers.dev/research/SUSwMWKlnnu0jiEOVkEJuF1smRni9Lvk` (env ULTRA_CLOUD overrides; tests use a local stub).
- Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, port **9333** (Wand uses 9222 — never clash), profile `$HOME/.ultracursor-chrome`.
- WORK dir: `$HOME/Library/Application Support/ultracursor/runtime`. State file WORK/state.json `{lastHuntId, lastReportAt}` — a hunt id already handled is never re-run after a restart.
- Restart exit code for self-update: **97** (same as the Wand). run.command loop restarts node on 97 only.

## Control plane (existing route, read app/routes/research.$.tsx for exact behaviour)
- GET `/hunt` → `{id, looking, targetPerDay, window, terms[], depth}` or null. New id (≠ state.lastHuntId) → run a sweep.
- GET `/order` → `{cmd}` READ-ONCE (reading clears it). cmds: run | pause | stop | update. pause/stop halt between actions within 2 s; run resumes; update = check runtime now.
- GET `/runtime` → `{build:"2", files:{"ultra.mjs":"https://…/media/<key>", …}}` or null. If build ≠ own build: download every file into WORK/.next/, each must be non-empty and every .mjs/.js must pass `node --check`; only then move them into WORK (and WORK/sites/ for sites/*), write WORK/build.txt, exit 97. Any failure: log it, keep running the current build, do not retry the same build for 10 minutes. Claude writes rs-runtime.json directly in R2; the app only reads.
- GET `/skills` → `{files:{"goals.md": "...", ...}}` or null. goals.md holds Alex's goals as simple `key: value` lines: budget, daily_target, niches (comma list), never (comma list), currency. Parse leniently; missing = null; never invent.
- POST `/status` (every 5 s and on every phase change): `{app:"ultracursor", build, state:"idle|sweeping|paused|stopped|updating|waiting-signin|error", phase, step, hunt:{id,looking}|null, progress:{done,total}, chrome:{connected:bool}, signin:{facebook,tiktok,instagram,google: true|false|null}, counts:{ads,clips,posts,comments,signals,stores}, lastError}`.
- POST `/log` `{lines:[...]}` — BATCH: buffer lines and flush at most once every 3 s, max 20 lines per POST (the server appends with read-modify-write; one POST at a time, never concurrent).
- POST `/report` `{id: hunt.id, report}` when a sweep ends (also on stop, marked partial). report shape in report.mjs below.
- Network failures never crash the runner; retry with backoff; status says what is wrong.

## The sweep (per hunt), in this order — where-to-look.md
queries = hunt.terms if any, else derived from `looking` (port `queriesFrom`/`termsFrom` from tools/product-research/worker/hunt.mjs), capped by depth (default 5, max 10).
For each query, in one tab, visibly:
1. **Meta Ad Library** `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=<q>&search_type=keyword_unordered&media_type=all`
2. **TikTok search** `https://www.tiktok.com/search/video?q=<q>` → collect clips → open the top N (default 3) clips → open comments → read up to ~40 comments each → buying signals.
3. **Instagram hashtag** `https://www.instagram.com/explore/tags/<tag>/` (tag = query lowercased, non-alnum removed) → open top N (default 2) posts → read comments → signals.
4. **Google Trends** `https://trends.google.com/trends/explore?geo=US&date=today%2012-m&q=<q>` — read the page's own data request: listen to responses whose URL contains `/trends/api/widgetdata/multiline`, strip the `)]}',` prefix, parse `default.timelineData[].{time,value[0]}`.
Then once per hunt:
5. **Competitor stores**: domains from Ad Library landing links (unwrap `l.facebook.com/l.php?u=`), plus any shop links seen, max 6 domains, skip marketplaces (amazon, temu, aliexpress, etsy, ebay, walmart, tiktok, instagram, facebook). For each: visit the homepage visibly (cursor hovers), and fetch `https://<domain>/products.json?limit=50` from Node (Shopify stores answer it) → products with title, price, compare_at_price, url; flag bundles/offers (title or variant names with bundle|pack|set|buy 2|2x|bogo|% off) and the free-shipping threshold if visible in page text.
Between actions: human pauses (0.6–2.5 s), scroll with the mouse wheel in steps, never instant jumps. Pages that show a login wall/captcha: mark signin false for that site, log one clear line ("Instagram wants a sign-in — sign in once in the ultracursor Chrome window"), skip that site for this hunt, continue. Set state "waiting-signin" only if EVERY social site is blocked.

## Site reader contract (sites/*.mjs) — readers NEVER throw
`export async function sweep(page, input, ctx)`; ctx = `{ui, log(line), shouldStop(): boolean, limits:{clips, posts, comments}}`.
Return plain JSON:
- adlibrary: `{source:"adlibrary", query, url, blocked:null|"login"|"captcha"|"empty"|"error:<msg>", ads:[{advertiser, libraryId, startedOn:"YYYY-MM-DD"|null, days:number|null, text, landing:url|null}], advertisers:number}`
- tiktok: `{source:"tiktok", query, url, blocked, clips:[{url, author, views:number|null, likes:number|null, comments:number|null, caption, commentsRead:number, signals:[{text, kind}]}], signalCount}`
- instagram: `{source:"instagram", tag, url, blocked, posts:[{url, likes:number|null, commentsRead, signals:[...]}], signalCount}`
- trends: `{source:"trends", query, url, blocked, weekly:[{t:"YYYY-MM-DD", v:number}], growth4w:number|null, yoy:number|null, peakWeek:string|null}` (growth4w = % change of the mean of the last 4 weeks vs the 4 before).
- stores: `sweep(page, domains, ctx)` → `{source:"stores", stores:[{domain, shopify:boolean, products:[{title, price:number|null, compareAt:number|null, url, offer:boolean}], freeShippingOver:number|null}]}`
Parse numbers like "1.2M", "12.3K", "4,512" → numbers. Dates "Started running on Oct 3, 2026" / "Started running on 3 Oct 2026" → ISO; days = whole days to today.
SELECTOR POLICY (rule 15, never guess): prefer structure that cannot drift — URL patterns (`a[href*="/video/"]`, `/p/`, `/reel/`), the page's own network JSON, visible text patterns ("Library ID", "Started running on") — over class names. Where a site attribute is used (e.g. TikTok `data-e2e`), ALWAYS have a text-based fallback, and record which path matched in a `how` field so a live run tells Claude what worked. Every reader also returns `diag:{title, url, textSample(first 600 chars of body text), counts}` so Claude can fix selectors from the first real run without guessing.

## The overlay (src/overlay.js, injected with context.addInitScript into every page + evaluated on the current one)
- The **cursor**: the ultracursor logo arrow — black liquid glass (dark gradient fill, white/silver rim stroke ~1.6px, a specular streak), ~26px, drop shadow, follows real `mousemove` events (so every `page.mouse.move` moves it), click ripple (clear glass ring) on mousedown. Label chip next to it: "ultracursor" (white glass, black text). NO blue, NO purple, NO green.
- A **status pill** bottom-left: black liquid glass, the logo, "ultracursor · build N", and one line of what it is doing ("TikTok · reading comments 12/40 · 3 buying signals"). Readable over white AND dark pages.
- A soft **highlight ring** (white, 1.5px, glow) around the element being read.
- pointer-events:none everywhere; never blocks the page; z-index max; survives SPA navigation (re-attach if removed). Do not draw on accounts.google.com, appleid.apple.com or any URL containing /login or /accounts/login (Wand build-72 lesson).
- API on `window.__uc`: `status(text)`, `highlight({x,y,w,h}|null)`, `build(n)`.

## ui.mjs (node side)
`attach(context, page, build)`, `say(page, text)`, `hover(page, target)` (ElementHandle | Locator | {x,y}; human path: page.mouse.move with ~18–30 steps along a slightly curved path, ends at a random point inside the element, highlight it), `click(page, target)`, `scroll(page, px)` (wheel in 80–140px steps with small pauses), `pause(minMs, maxMs)`.

## report.mjs
`buildReport({hunt, goals, evidence[], build, startedAt, endedAt, partial})` → `{looking, huntId, build, at, partial, goals, q4:{today, halloween, bfcm, christmas, uspsGroundCutoff, cny2027, daysTo:{...}}, perQuery:[{query, ads:{count, advertisers, longestDays, top:[...]}, tiktok:{clips, bestViews, comments, signals, topSignals:[...]}, instagram:{...}, trends:{growth4w, yoy, peakWeek}, verdictHints:[...]}], stores:[...], blocked:[{source, reason}], totals:{ads, clips, posts, comments, signals, stores}, notes:[...]}`.
It does NOT pretend to judge: Claude judges from this evidence with the skills. It only computes facts (counts, longest-running ad days, growth, Q4 day counts, store price ranges/offers) and says "not enough seen yet" where evidence is thin.

## Testing (rule 1, 2: nothing ships that has not run)
- `test/fixtures/`: hand-made local pages that mimic each site's structure as described above (Ad Library cards with "Library ID"/"Started running on"; TikTok search grid with `/video/` links and a video page with a comments list; Instagram tag grid with `/p/` links and a post page with comments; a Trends page that fetches a local `/trends/api/widgetdata/multiline` JSON with the `)]}',` prefix; a Shopify-like store with `/products.json`; a login-wall page).
- `test/stub-cloud.mjs`: an in-process HTTP server implementing the same routes as research.$.tsx (hunt/order read-once/runtime/skills/status/log/report) recording every call.
- `test/e2e.mjs`: launches Chromium `/opt/pw-browsers/chromium` with `--remote-debugging-port`, starts fixtures + stub, runs ultra.mjs as a child process with env pointing at both (site base URLs overridable by env for tests ONLY), posts a hunt, and asserts: status posts with build, cursor actually moved (overlay position changes) and the pill text changed, comments read + signals counted, trends parsed, stores parsed, report posted with totals, a login-walled site is reported blocked without crashing, pause/stop orders obeyed, a hunt is not re-run after restart, and self-update: stub serves runtime build 2 → files downloaded, verified, exit 97; a broken file (syntax error) is refused and the runner keeps going.
- Unit tests for signals.mjs, number/date parsing, q4.mjs.
- Screenshots of the overlay over a white page and a dark page MUST be looked at (Read the PNG) before claiming the look is right.
- Never run `playwright install`. Chromium for tests: `/opt/pw-browsers/chromium`. Run node from tools/ultracursor; import playwright-core from the repo node_modules (resolve via createRequire or relative path).

---

# Build 2 — the general browser agent (contract)

Alex, 19 Oct 2026: "Keep it fully general-purpose — it should be able to do any task on any website. Do NOT
hardcode anything Depop-specific into the core." First real use: Depop ("take images and upload"). The research
sweep from build 1 stays exactly as it is; the agent is added beside it.

## Hard rules
1. CORE IS SITE-BLIND. Nothing under `src/agent/`, `src/panel.js` or `src/ultra.mjs` names Depop or any site.
   Everything site-specific lives in `src/profiles/<name>.json`. Adding a site = adding one JSON file.
2. The agent reads the page through Playwright's own accessibility snapshot (`page.ariaSnapshot({mode:"ai"})`,
   playwright-core 1.63, public API) and acts on its refs with `page.locator("aria-ref=<ref>")`. No CSS selectors
   for site content anywhere in core. A ref that no longer resolves is refused ("stale ref"), never guessed.
3. Approval before anything final: publish/post, send, buy/pay/checkout, delete/remove, price change, and any
   submit. Enforced by the HARNESS (guard.mjs), not by the model's goodwill. The model's declared `final` is an
   extra signal, never the only one.
4. Never types a password, card number or one-time code. Sign-in is always done by Alex in the window.
5. Human pacing, action limits, pause on CAPTCHA / login wall / repeated errors, every action logged.
6. Chrome: since Chrome 136 the DevTools port is ignored on Chrome's default profile (developer.chrome.com/blog/
   remote-debugging-port), so the agent uses ultracursor's own permanent profile `~/.ultracursor-chrome`
   (unchanged from build 1). Alex signs into each site there once; it is remembered.

## Files
- `src/agent/snapshot.mjs`  `observe(page, {max})` -> `{url, title, text}` (compacted ai snapshot); `compact(yaml, max)`;
  `findLines(yaml, query, limit)`.
- `src/agent/guard.mjs`     final-action detection, Enter gating, password/card refusal, wall detection (pure functions
  + `detectWall(page, profile)`).
- `src/agent/tools.mjs`     `TOOLS` (API tool definitions) + `execute(name, input, env)` for each tool.
- `src/agent/brain.mjs`     Claude API client (official `@anthropic-ai/sdk`), request builder, cost meter.
- `src/agent/agent.mjs`     `runTask(...)`: the loop.
- `src/agent/profiles.mjs`  load `profiles/*.json`, pick by hostname, render for the prompt.
- `src/agent/limits.mjs`    pacing + counters persisted in `<WORK>/agent-limits.json`.
- `src/agent/log.mjs`       JSONL action log `<WORK>/logs/agent-YYYY-MM-DD.jsonl` (+ short line to the control plane).
- `src/agent/config.mjs`    `<WORK>/../config.json` (= `~/Library/Application Support/ultracursor/config.json`,
  outside the refreshed runtime folder, mode 600): `{anthropicApiKey, model, effort, maxUsdPerTask}`.
  Env `ULTRA_CONFIG` overrides the path (tests). The key is never logged, never posted anywhere.
- `src/agent/host.mjs`      node side of the on-page panel: binding + token + state polling.
- `src/panel.js`            browser side: the command bar, approval card, wall card, key entry, file picking.
- `src/profiles/_default.json`, `src/profiles/depop.json`.

## Tools offered to the model (names are the contract; `why` is always a short string shown on screen)
| tool | input | does |
|---|---|---|
| `look` | `{full?:bool}` | fresh snapshot of the current page (compact, or up to 40k chars if `full`) |
| `find` | `{text}` | snapshot lines containing text (case-insensitive), max 40, with refs |
| `read_text` | `{ref?}` | visible text of the page or of one element, max 6000 chars |
| `click` | `{ref, why, final}` `final` ∈ none,publish,send,buy,delete,price,other | human mouse path + real click |
| `type` | `{ref, text, why, clear?=true, enter?=false}` | click field, clear, type char by char |
| `select` | `{ref, option, why}` | native `<select>` option by label/value |
| `upload` | `{ref, files:[name], why}` | give task files to a file input / file chooser |
| `press` | `{key, why}` | one key (Enter, Tab, Escape, ArrowDown, …) |
| `scroll` | `{direction:"down"|"up", amount?:"small"|"page"}` | mouse wheel |
| `navigate` | `{url, why}` | go to a URL |
| `screenshot` | `{}` | JPEG of the viewport (CSS px) as an image block |
| `wait` | `{seconds}` 1–10 | let the page settle |
| `finish` | `{status:"done"|"blocked"|"needs_alex", summary}` | end the task; summary shown to Alex |

Tool result text (every action tool; the test stub parses this, keep it exact):
```
ok: true|false
did: <what happened>            (ok: true)
error: <why not>                (ok: false)
url: <url>
title: <title>
page:
<compact snapshot lines, each like `- button "Post listing" [ref=e17]`>
```
The first user message: text `Task: …`, `Files: a.jpg, b.jpg` (or `Files: none`), the site profile text,
`Current page:` + the same url/title/page block; then up to 6 image blocks (task photos, downscaled to ≤1024 px JPEG).

## Approval (guard.mjs + host/panel)
A `click` is FINAL when any of: model `final` ≠ none; the element's accessible name matches the generic commit
vocabulary (post, publish, list it/item/now, submit, send, buy, buy now, purchase, pay, checkout, place order,
confirm, delete, remove, save, save changes, update, accept, decline, counter, make offer, mark as sold/shipped,
refund, cancel order, archive, unlist, …) or the profile's `finalWords`. `press Enter` / `type …enter:true` is
final unless the target is a search box (role searchbox/combobox, or name contains "search"). `navigate` to a
URL containing checkout|payment|purchase|/buy|delete is final. A field whose name matches price|amount (+ profile
`priceWords`) marks a pending price change; the next final action is shown as a price change with old → new.
The run blocks until Alex answers on the card: Approve (do it), Skip (tool result `ok: false`, "Alex skipped
this"), Stop (end the task). The card shows: the kind, the button/key, the page, the model's `why`, and the
fields typed since the last approval (name → value, 160 chars max each).

## Walls
`detectWall(page, profile)` → null | {kind:"login"|"captcha", reason}. Login: URL matches /login, /signin,
/sign-in, /accounts/login or profile `login.urlPatterns`, or a visible password field. Captcha: an iframe from
recaptcha / hcaptcha / challenges.cloudflare.com / arkoselabs / funcaptcha / captcha-delivery.com / perimeterx,
or visible text like "verify you are human", "press and hold", "unusual activity". Checked before every action
and after navigations. On a wall: the loop pauses, the panel shows "Sign in / solve the check — I carry on by
myself" (the overlay never draws on /login pages, so the Terminal and control-plane status say it too), polls
every 2 s, resumes when the wall is gone (max 30 min, then the task stops), and tells the model what happened.

## Pacing and limits (profile `pacing`, `limits`; `_default.json` gives the defaults)
Pause between actions: random `minMs..maxMs` (default 900–2600). Typing: per-character random delay
`typeMinMs..typeMaxMs` (default 40–120; text over 300 chars types at 15–40). Limits: `stepsPerTask` (80),
`tasksPerHour` (20), `finalPerHour` (15), `finalPerDay` (60), and `maxUsdPerTask` from config (default 2.00).
Three tool errors in a row, or an API error after the SDK's own retries → the task pauses with a card
(Continue / Stop).

## Brain (brain.mjs)
Official SDK `@anthropic-ai/sdk` (pinned, same version as the repo's node_modules), `client.beta.messages.create`
with: `model` (config, default `claude-opus-5-5`), `max_tokens` 16000, `thinking:{type:"adaptive",
block_binding:{prefix_mismatch_behavior:"drop_block"}}`, `output_config:{effort}` (config, default `medium`),
top-level `cache_control:{type:"ephemeral"}`, a frozen `system` string with `cache_control`, the tool list (never
changes inside a task), `fallbacks:"default"`, `betas:["server-side-fallback-2026-07-01",
"thinking-binding-controls-2026-08-01"]`. History is APPEND-ONLY: the assistant `response.content` is appended
unchanged (thinking blocks included) and tool results are appended; nothing earlier is ever edited or removed.
`tool_choice` is never `any`/`tool` (400 on Opus 5.5). `stop_reason` handled: tool_use → run tools (all results in
ONE user message), end_turn → finish with its text, refusal → stop the task and say so, max_tokens → treat as error,
pause_turn → append and continue. Cost meter from `usage` (input, cache write, cache read, output) with a per-model
price table; the task stops at `maxUsdPerTask`.

## Panel (panel.js + host.mjs)
Injected like the overlay (context init script + evaluate on open pages), its own host element, CLOSED shadow
root, `aria-hidden="true"` on the host (so it never appears in the agent's snapshot), nothing drawn on blocked
URLs (same rule as the overlay: accounts.google.com, appleid.apple.com, any URL containing /login). Bottom-right,
black liquid glass like the pill, white text, NO blue / purple / green. Only the panel's own controls take the
mouse (`pointer-events:auto` on them, none elsewhere); keyboard events typed into it never reach the page.
Talks to Node through ONE binding `__ucAgent(token, msg)` registered with `context.exposeBinding` BEFORE the panel
init script, captured by the panel at init (closure), with a random per-run token that only the init script
knows. Node rejects a wrong token and any call that is not from a page's main frame. Messages:
`{type:"poll"}` → state · `{type:"file", draft, name, mime, b64}` (one file per call) · `{type:"task", draft,
text}` · `{type:"control", cmd:"pause"|"resume"|"stop"}` · `{type:"decide", card, choice}` · `{type:"setKey", key}`.
Approval clicks only count when `event.isTrusted`. The panel polls every 500 ms and re-renders from state, so it
survives navigations by itself. State (host.mjs builds it):
`{build, hasKey, mode:"needkey"|"idle"|"queued"|"running"|"paused"|"card", status, step:{n,max}|null, usd:{spent,cap}|null,
task:{id,text}|null, card:null|{id, kind:"approval"|"wall"|"stuck"|"done"|"limit", title, lines:[], choices:[{id,label}]}}`.

## Task sources
1. The panel (text + photos picked or dropped on the bar).
2. The control plane: a hunt whose `looking` starts with `task:` is an agent task (rest of the text = the task);
   `terms` entries that are http(s) image URLs are downloaded as the task's files. No Kerberos change needed.
One task at a time; a research sweep and a task never run together (the later one waits, status says queued).
