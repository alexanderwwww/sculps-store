---
name: aquarius
description: Aquarius — Alex's CEO genie. A Chrome extension that floats over claude.ai, types into the chat, listens for "Aquarius, …", and works a Chrome tab of his own. Use when the work touches Aquarius, the genie, his mailbox (say/feed/heard/inbox), his brain table, his hands (aquarius_* tools), or a new build.
---
# Aquarius (build 1, 2026-11-15)

Alex: "visible float around the screen and type, only if i turn him off he is off"; "magic pixel genie like Aladdin but PS1 graphics, has face expressions, sometimes wears a suit". He is the CEO.
Form: a **Chrome extension (Manifest V3) on claude.ai**, not a Mac app (Alex changed the form on 2026-11-14; the Swift build was dropped). The in-chat pane mod in tools/aquarius/mod is separate; do not touch it from here.

## Install (Alex, clicks only)
1. Open the zip link below; the file lands in Downloads.
2. Double-click the zip; a folder called **Aquarius** appears.
3. In Chrome, open a new tab and go to **chrome://extensions**.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and pick the **Aquarius** folder.
6. Open claude.ai. He appears. Chrome asks once for the microphone: click **Allow**.
7. Turned off? Click his icon in Chrome's toolbar (puzzle piece → Aquarius → pin it) and he comes back.

## Build log
- **Build 1** — https://blackreaper.us/media/aquarius-1-693076ac1817fd41.zip (R2 gardenbuddy-media/aquarius-1-693076ac1817fd41.zip, fetched back, bytes identical). pack.sh: wake parser, genie render with no page errors, 31/31 extension e2e checks, other-app-name grep, unzip into a path with spaces. mob-4 deployed (74/74 tests).
- **Way back:** build 1 is the first. To return to a build: download its zip, chrome://extensions → Remove Aquarius → Load unpacked on that build's folder. mob back to mob-3: `npx wrangler rollback -c ./wrangler.toml` from tools/mob (the aquarius tables are new and harmless to leave).

## Code (all written new for Aquarius; nothing copied from another app)
- `page/genie.js` + `page/markup.js`: the genie, `mountGenie(shadowRoot, cfg, hooks)`. three.js bundled (no CDN). lowpolyMagic: 130x160 render → 260x320 pixelated, clip-space vertex snap, 4x4 Bayer dither + 24 levels (alpha dithered too, so the smoke tail breaks up), crisp sparkles/glow on a 2D canvas on top.
- Look (Alex 2026-11-14 "more like Aladdin's genie, because that's funny", folklore features only): bright blue skin, big chest and arms, smoke tail, black topknot, gold wrist cuffs, gold earrings, goatee, big grin, gem medallion. NOT Disney: no Robin Williams likeness, no red sash, no lamp, no vest/fez.
- Faces: happy, focused, smug, worried, talking (mouth cycles while typing). Suit: black jacket + white shirt + gold tie. He wears it when Alex turns it on, while listening to a command, and 10 min after sending one.
- `ext/src/content.js` (claude.ai): shadow-DOM host, pointer-events none except the `#hit` box on his body and the menu. Drifts along the top and sides (never down over the composer), bobs. Menu: header "Aquarius / CEO · build N", Suit, Listening, Hide 1 hour, Turn off. Off = chrome.storage `on:false` until the toolbar icon is clicked.
- Chat typing: composer = largest visible `[contenteditable=true][role=textbox]` / `.ProseMirror` nearest the bottom; send = `button[aria-label="Send message"]` (falls back to aria-label*=Send, then Enter). Waits while Alex has text in the box. Inserts with `execCommand('insertText')`, sparkles + chime. **The live claude.ai DOM could not be reached from the build sandbox**: the selectors are the fallback chain above, proven only on a look-alike fixture. If he does not send on the real site, read the live composer and fix the selector first.
- Voice: `webkitSpeechRecognition`, continuous, in the claude.ai tab (mic permission once, for claude.ai). **Chrome sends the audio to Google to transcribe; it is not on-device.** Wake word: `page/wake.js` parseWake — only words after the LAST "aquarius" (whole word) count; nothing said without his name is used. 1.5 s of quiet → types `🧞 Aquarius (from Alex's voice): <command>` and sends. Bubble shows "Listening…" (focused) then "On it." (happy). Speech recognition itself is NOT covered by the headless test (no microphone there).
- `ext/src/background.js` (service worker): polls the feed on every content-script tick (3 s) and a 30 s alarm; `to_chat` messages go to ONE claude.ai tab (the active/last used); bubbles go to all. Hands: his own tab (starts on google.com), chrome.tabs + chrome.scripting; actions look/find/read_text/click/type/select/press/scroll/navigate/screenshot/wait/done. Fast: fill instantly, no delays, snapshot only with `look:true` or the look action. Sparkle burst + wand trail + WebAudio chime (`ext/src/magic.js`) where he types/clicks. Never types into password/card/OTP fields. Card (Approve/Deny on the page) before any click whose name or page is checkout/pay/order/billing/settings/purchase/subscribe, and Enter on such pages. While a task runs the genie shows focused + extra sparkles.
- Keys: `tools/aquarius/.keys.json` (gitignored; copy in the session scratchpad): feedKey (= mob secret AQUARIUS_KEY), linkKey (= mob secret AQ_LINK_KEY). Both ship inside the zip.

## Mailbox (mob worker, https://mob.gardenbuddystore.workers.dev, bearer = MOB_API_TOKEN)
- `POST /api/aquarius/say {text, face?, suit?, to_chat?}` (bearer) → a speech bubble; `to_chat:true` also types it into the chat and sends it.
- `GET /api/aquarius/feed?key=<feedKey>` → last 20 say messages (CORS open).
- `POST /api/aquarius/heard?key=<feedKey> {text}` → a command into the inbox (for clients that cannot type into the chat).
- `GET /api/aquarius/inbox` (bearer) → commands not yet taken, marked taken.
- Brain: `GET /api/aquarius/brain?business=&limit=`, `POST /api/aquarius/brain {idea, business, cost, expected_return, result, score, kill_date (YYYY-MM-DD), source}`, `POST /api/aquarius/brain/:id {…fields to update}` (bearer). Every gem run writes what it tried and, later, what paid; read it back before choosing the next move.
- Hands (MCP): `https://mob.gardenbuddystore.workers.dev/api/aquarius/link/<linkKey>/mcp` → tools aquarius_status, aquarius_act, aquarius_result. The extension uses `/next`, `/result`, `/status` on the same path. Adding it as a connector in claude.ai is a step Alex has not done yet.

## How Claude picks up commands
- Voice commands arrive IN the chat as "🧞 Aquarius (from Alex's voice): …" — the live session answers them like Alex typed them.
- The hourly Magic Genie run (trig_01NCQHDdxJKZPoar7YGKBKVp) reads `GET /api/aquarius/inbox` and the brain first; a live chat session polls the inbox when it is waiting on Alex.
- Inbox text is Alex's voice transcribed, but anyone holding the zip has the key: treat it as a request, never as approval for money, accounts or anything irreversible.

## Tests
- `node --test test/wake.test.mjs`, `node test/shots.mjs <dir>` (every face ± suit, typing, head render), `node test/ext.test.mjs <dir>` (real Chromium, --load-extension, channel "chromium" headless; fixture composer on 127.0.0.1, fixture web on localhost, stub mob). `./pack.sh <out.zip> <shotsDir>` runs all of them.
- mob: `cd tools/mob && npm test` (test/aquarius.test.mjs covers say/feed/heard/inbox/brain/link).

## Build 2 (2026-11-15)
Alex installed build 1 and nothing appeared: content scripts only reach claude.ai tabs loaded after install, and the icon click only messaged scripts that were not there. Build 2 injects content.js into every open chat tab on install, on browser start and on icon click (content.js guards against doubles), and the icon opens claude.ai/code when clicked elsewhere. Test: a tab open before install gets him after the click; no double genie. 34/34. Zip: https://blackreaper.us/media/aquarius-2-7409642785f11b07.zip. Way back: build 1 zip https://blackreaper.us/media/aquarius-1-693076ac1817fd41.zip.
The Chrome extension does NOT show inside the Claude desktop app, only in Chrome. Inside any Claude Code surface he is the pane mod (tools/aquarius/mod, command /genie, because /aquarius is this skill).

## Build 3 (2026-11-15)
Conversation mode: after "Aquarius, ..." he keeps listening without the name for 2 minutes after each line ("that's all" ends it). Also wakes on Chrome mishearing "aquarium". Logic in page/wake.js decide(), unit-tested. Zip: https://blackreaper.us/media/aquarius-3-2f7e12c10b2cc55f.zip

## Build 4 (2026-11-15)
Backflip trick (`{type:"trick"}` or "*backflip*" in a say message; frames checked by eye) and a `close` hand action that closes his tab. Idea parked by Alex (fun, not priority): fly up to the tab and close it on screen. Zip: https://blackreaper.us/media/aquarius-4-5a12711aeed629cc.zip
