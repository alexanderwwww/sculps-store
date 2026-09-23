# Organic — the phone. The spec everybody builds to.

Alex's words: "It's just a phone. Flowing around. Just the iframe flowing around
my screen." The window IS an iPhone. Not a window containing a phone.

He opens it, picks Instagram inside the glass, signs in inside the glass, and
then watches the crew work the real mobile site — the green cursor gliding to a
like, pressing it, typing a comment at human speed. One window. Zero lag.

## What changes from the old build
OUT: Playwright, Chromium, the screencast, the JPEG frames, the CDP input
forwarding, the four-screen grid, the white canvas. All of it. That stack is
where the lag and the "executable doesn't exist" failures came from.

IN: one WKWebView — Apple's own engine, the one iOS Safari uses — in a
borderless phone-shaped window. The page is real, so scrolling is real.

## The three pieces
1. `app/Organic.app/Contents/Resources/Shell/main.swift` — the window and the
   web view. As small as it can be: there is no Mac here to compile it on, so
   anything that can live in JavaScript does.
2. `worker/agent/*.js` — everything injected into the page: the cursor, the
   hands (scroll, tap, type), the panel, the per-platform recipes.
3. `worker/*.mjs` — the brain: schedule, personas, memory, control plane,
   research. Node, no browser dependency, `ws` only.

## The window (Swift)
- Borderless (`.borderless`), transparent, no title bar, no traffic lights,
  `isMovableByWindowBackground = true`, resizable by dragging any edge (custom
  hit-test: outer 8px = resize, the rest = drag), shadow on, level normal,
  remembers its frame.
- Aspect locked to 390:844. Minimum 300 wide, maximum 520.
- One `WKWebView` filling it, transparent background, `isOpaque = false`,
  corner radius on the layer so the page is clipped to the phone's glass.
- Custom user agent: the iPhone one. `WKWebViewConfiguration` with a
  **persistent** `WKWebsiteDataStore.default()` so sign-ins survive a quit.
- `allowsBackForwardNavigationGestures = true`, inline media, no user gesture
  needed for playback (reels autoplay), `suppressesIncrementalRendering = false`.
- ⌘Q quits. ⌘W hides. No other chrome.
- The bezel (body, island, home bar) is drawn IN THE PAGE by the agent, not in
  Swift — so it can be changed over the wire without a new download.
- The bridge, both ways:
  - JS to Swift: `window.webkit.messageHandlers.organic.postMessage({...})`.
  - Swift to JS: `webView.evaluateJavaScript("window.__organic.fromApp(<json>)")`.
  - Swift keeps one WebSocket to the worker (`ws://127.0.0.1:<port>/ws`, port
    passed as argv[1]) and relays: everything from the socket goes to the page,
    everything from the page goes to the socket. Swift adds nothing and reads
    nothing. It is a wire, not a brain.
  - One exception, because only Swift can do it: `{t:"window", ...}` messages —
    move, resize, front, quit — are handled in Swift.
- If the socket drops: retry every second, and show nothing but the page.
- Any startup failure: an `NSAlert` with the reason, then exit 1.

## The page (the agent, injected)
The web view loads the platform directly — `https://www.instagram.com/` — and
the agent is injected into every page with `WKUserScript` at document start.
It is one bundle, served by the worker so it can be pushed over the wire.

- `bezel.js` — draws the phone: rounded frame, island, home indicator, drawn as
  fixed-position elements over the page, pointer-events none.
- `cursor.js` — the green cursor: glowing dot with a ring, a name label, and a
  press animation. `moveTo(x, y)` glides with eased, slightly wobbly steps and
  a human arc; `press()` pulses. Nothing about it is instant.
- `hands.js` — scroll(amount, pace), tapAt(x, y), tapEl(el), type(text) with
  typos and backspaces, dwell(ms). Every one moves the cursor first, then acts.
  A tap is `el.dispatchEvent(pointerdown/mousedown/mouseup/click)` plus
  `el.click()` — React listens for those, and where a site refuses a scripted
  press the app says so rather than pretending it worked.
- `panel.js` — the panel inside the glass: a small sheet that slides up from the
  home bar. Accounts (Instagram / TikTok / YouTube, connect or switch), what the
  crew is doing, a Stop. Nothing outside the glass.
- `read.js` — reading the page for the crew: posts, handles, view counts,
  hashtags, whether we are signed in, what our handle is.
- Per-platform recipes in `sites/instagram.js`, `sites/tiktok.js`: where the
  like button is, how to open a reel, how to find the caption, how to comment.
  Selectors are found by ROLE and TEXT first, never by a generated class name.

## The brain (worker)
Unchanged in spirit, minus the browser. `human.mjs`, `score.mjs`, `store.mjs`,
`discover.mjs`, `cloud.mjs`, `claudelink.mjs` stay as they are. `main.mjs`
drives the page through the bridge instead of Playwright. `screens.mjs`,
`chrome.mjs` are deleted.

## Hard rules
- One window. Nothing is ever drawn outside the phone.
- The app never types a password and never stores one.
- A connection with no readable handle is not a connection.
- Human pace everywhere: `human.mjs` decides every wait, every budget, every
  day off. Nothing acts twice in a row without a pause a person would take.
- Nothing store-specific in the code; it all comes from the brief.
- Never `pkill -f`. Never overwrite an R2 key.
