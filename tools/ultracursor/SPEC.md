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
