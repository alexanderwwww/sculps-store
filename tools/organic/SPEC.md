# Organic — the spec everybody builds to

Organic is a native macOS app (one window) that shows a white canvas of small
live screens. Each screen is a page in a **headless** real Chrome that the app
runs invisibly. Alex signs into his accounts *through* the screens, presses OK,
and the crew starts working on everything at once: market research for the
products in the brief, warming the accounts, logging what it finds.

Nothing here is shared with OrganicX. New name, bundle id, folder, address,
tables, slots. Nothing store-specific is hard-coded: everything about products
and stores comes from the brief.

## Hard rules (a build that breaks one is refused)
- **One window.** The Swift shell owns it. Chrome is headless; it never shows a window.
  Fallback if a platform rejects headless: headed Chrome with its window parked
  off-screen (`--window-position=-4000,-4000`). Still one visible window.
- **No fifth screen.** Screens: `home` (canvas itself), `instagram`, `tiktok`,
  `youtube` (only if connected), `market` (Ad Library / public research). That is all.
  Every task borrows one of these pages; none creates a new page or context.
- **No password ever stored, typed, or seen by the app.** Sign-in happens by
  forwarding Alex's own mouse/keyboard to the page. The app records only the
  platform + handle it *read* after sign-in.
- **A connection with no readable handle is not a connection.**
- **Human pace.** All scrolling/clicking in account tabs goes through `human.mjs`
  timings. Research in an account tab is browsing, not scraping: ≤ 40 items per
  pass, minutes between passes.
- **Never `pkill -f`.** Never overwrite an R2 key. No sample data.
- Every crew line goes through `say(who, what)` → ticker + control-plane log.

## Layout
```
tools/organic/
  SPEC.md
  app/Organic.app/Contents/
    Info.plist                 CFBundleIdentifier us.blackreaper.organic, exec "Organic"
    MacOS/Organic              bash launcher: compiles Shell/main.swift once, starts worker, runs shell
    Resources/AppIcon.icns     the ONLY icon file
    Resources/Shell/main.swift NSWindow + WKWebView → http://127.0.0.1:<port>/
    Resources/worker/*.mjs     copied to ~/Library/Application Support/Organic/worker on first run
    Resources/worker/ui/index.html
  worker/
    main.mjs        boot, state machine, task scheduler, control-plane client
    chrome.mjs      launch headless real Chrome (port 9444, profile ~/Library/Application Support/Organic/chrome), connectOverCDP, fallback headed off-screen
    screens.mjs     per-page CDP screencast → frames; input forwarding (mouse/key) into a page
    server.mjs      HTTP (serves ui/) + WebSocket on 127.0.0.1:<free port>; prints "PORT <n>" on stdout for the launcher
    accounts.mjs    signedIn(page, platform) via cookies + login-url; whoAmI(page, platform) (Instagram current_user API; TikTok /profile URL; YouTube /account text, never an email)
    human.mjs       (copied from organicx, pure, tested) timings, day plans, typing
    score.mjs       (copied) clip scoring
    market.mjs      product/market research: adLibrary(query), tiktokTag(tag), instagramTag(tag) → findings
    crew.mjs        the names/roles; say()
    cloud.mjs       control-plane client: status/log/brief/order/db/runtime
    package.json    deps: playwright, ws
  test/             node scripts, run serially, local Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

## Control plane (Worker route)
Base: `https://kerberos.gardenbuddystore.workers.dev/organic/6pT0ha8Y_4_VdVyzThF96kJw2rXmcVU7`
Same shape as `app/routes/organicx.$.tsx` but fresh: file `app/routes/organic.$.tsx`,
R2 slots prefixed `og-`, db ops in `app/lib/organic-db.server.ts` on tables `og_*`,
MCP tools named `organic_*`, route registered as `route("organic/*", "routes/organic.$.tsx")`.
Endpoints: `status` `order` `brief` `log` `runtime` `db` `skills` `mcp` `icon.png`.
`runtime` slot = `{ build, files: { "name.mjs": source, "ui/index.html": source, "skills/x.md": source } }` —
file names match `^(ui/)?[\w.-]+\.(mjs|json|html)$` or `^skills/[\w.-]+\.md$`. POST /runtime raw is 403; only `organic_push`.

Brief shape (`organic_brief_set`):
```json
{ "store": "Black Reaper", "products": ["Halloween Projector", "Crawling Zombie", "Grim Reaper"],
  "market": ["halloween decoration", "halloween animatronic"],
  "platforms": ["instagram","tiktok"], "lead": "instagram", "autonomy": "queue", "notes": "#tags here" }
```

## Tables (og_*) — drizzle in app/db/schema.ts AND created in Neon
- og_accounts(id uuid pk, platform, handle, connected bool, connected_at, last_seen_at, warmed_days int default 0, friction text, friction_at) unique(platform, handle)
- og_personas(id, account_id fk, who, metro, hours jsonb, interests jsonb, voice, typing jsonb, temperament jsonb, days_off jsonb, created_at)
- og_actions(id, account_id, kind, target_url, dwell_ms int, text, at timestamptz default now())
- og_findings(id, kind text 'ad'|'clip'|'seller'|'product', product text, query text, platform text, url text, who text, title text, metrics jsonb, started_at text, seen_at timestamptz default now(), note text) unique(kind, url)
- og_clips(id, platform, source_url unique, source_handle, posted_at, caption, views, likes, comments, file_key, duration_ms, seen jsonb, validated bool, validation_note, created_at)
- og_lessons(id, scope, lesson, evidence jsonb, confidence real, at)
- og_weights(id, scope, dimension, value, weight real, trials int, wins int, updated_at) unique(scope,dimension,value)
- og_tasks(id, kind, payload jsonb, state text default 'todo', attempts int default 0, not_before, last_error, created_at, done_at)
DB ops (POST /db {op,args}): accounts, accountFor, markConnected, disconnect, park, isParked, seen, warmedToday,
personaFor, savePersona, act, todayCounts, knownClip, saveClip, saveFinding, findings(product?, kind?, limit),
learn, weights, remember, lessons, addTask, nextTask, finishTask.

## Worker ⇄ UI protocol (WebSocket, JSON)
Server → UI:
- `{t:"state", phase:"setup"|"working", build, screens:[{id, platform, state:"none"|"checking"|"waiting"|"connected"|"out", handle}], brief}`
- `{t:"frame", id, jpeg:"<base64>", w, h}`  (≈8 fps per screen, jpeg q40 at 640 wide; the focused screen streams at full size q60)
- `{t:"say", who, what, at}`  (ticker; server keeps last 40 and sends them on connect)
- `{t:"cursor", id, x, y, label}` (where the crew's cursor is on a screen, normalized 0..1)
- `{t:"progress", who, doing, pct}`
UI → Server:
- `{t:"focus", id|null}`  (which screen is big; null = grid)
- `{t:"mouse", id, kind:"move"|"down"|"up"|"wheel", x, y, button, dx, dy}` (normalized 0..1)
- `{t:"key", id, kind:"down"|"up"|"char", key, code, text, modifiers}`
- `{t:"ok"}`  (setup → working)
- `{t:"connect", platform}` (navigate that screen to the login page, mark "waiting")
- `{t:"stop"}` / `{t:"pause"}` / `{t:"resume"}`
Input forwarding uses CDP `Input.dispatchMouseEvent`/`Input.dispatchKeyEvent` on that page's session, while a
crew task on that page is suspended (the page is Alex's while focused).

## Phases
- **setup**: screens instagram, tiktok, youtube exist (youtube card says optional). Each is at its login page.
  The UI shows the three cards; clicking one focuses it (big, interactive). Worker polls signedIn every 3 s on
  waiting screens; when connected → whoAmI → markConnected → card shows handle, green. OK is enabled when ≥1 connected.
- **working**: canvas grid. Scheduler runs tasks concurrently, one task per screen at a time:
  - market screen: Ad Library for each product and market term (advertiser, started, days running) → og_findings kind ad; sellers derived (advertiser names) kind seller. Every 60 min.
  - each connected account screen: persona-timed sessions (human.mjs): scroll home, watch, like sparingly;
    research passes: hashtags derived from products + notes (#tags) → og_clips + og_findings kind clip (creator, views if visible). YouTube screen only if connected.
  - status report to control plane every 10 s; orders (pause/stop/run/update) checked every 5 s; self-update: runtime.build > current → write files → exit 75 → launcher restarts worker (shell stays up, reconnects WS).
- Next launch: if any account already signed in (cookies) → skip setup, go straight to working.

## Launcher (bash) contract
1. PATH += Homebrew. Needs node (Homebrew) and Google Chrome. swiftc from Xcode CLT: if missing → alert with `xcode-select --install`.
2. $SUPPORT=~/Library/Application Support/Organic: {chrome, worker, bin, log}. Copy Resources/worker → worker when BUILD advanced (never over a newer wire build).
3. Compile Shell/main.swift → bin/OrganicShell-<build> if absent (`swiftc -O -framework Cocoa -framework WebKit`).
4. Start worker: `node worker/main.mjs` → read "PORT n" from its stdout; on exit 75 restart it (loop). Worker dies if the shell's pid dies.
5. `exec bin/OrganicShell-<build> http://127.0.0.1:n/` — exec, so the process stays the bundle's (Dock icon). The shell also sets `NSApp.applicationIconImage` from Resources/AppIcon.icns so the Dock shows the right icon even if a cache lies.
