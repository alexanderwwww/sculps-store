# finger: status (build 1, 2026-11-20, after the first review round)

**Nothing here has run on a Mac or an iPhone.** This container is Linux. finger does not
"work" until section 2 has been seen on his Mac. Nothing is deployed. No zip exists.

Run everything: `npm test` in `tools/finger` (TESTCOUNT tests, Node 22, no dependencies), and
`npm run check:workerd` (the real link worker in local workerd; nothing is deployed by it).
Sources for every outside fact: `SOURCES.md`.

## 1. Proven here (Linux, against fakes written from the cited sources)

The fakes are `test/fake-usbmuxd.mjs` (a unix socket speaking the real usbmux framing and
plists, two phones, a Network duplicate, attach/detach, Connect results 0/2/3, raw passthrough)
and `test/fake-wda.mjs` (the 20 routes transcribed from the pinned WDA source on their own,
session rules, error envelopes, one request at a time on the command queue with `/status` and
`/screenshot` answered off it as in the source, HEIC until the JPEG setting is applied).
A fake proves finger does what the source says. It does not prove his iPhone does.

| What | Tests (file: names start with) |
|---|---|
| plist and usbmux framing: round trip, split and glued frames, tag, 8100 becomes 42015 | protocol.test.mjs: `plist:`, `usbmux:` |
| usbmux client against the fake daemon: USB-only list, Listen attach/detach, Connect 0/2/3, raw stream, byte-by-byte replies, no socket; the version key goes on Connect only; a reply that is not a plist message is refused | protocol.test.mjs: `fake usbmuxd:`, `usbmux:` |
| WDA client: every route in the table answered by the fake; session create; settings applied and re-applied; lost session recreated and retried once; no retry for a buy; error envelope; no-alert reads as null; HTML refused; a 200 without the WDA envelope is not a "done"; a non-200 is an error; per-route timeout; REFUSED and NOT_PLUGGED; the command queue is serial and the two standalone routes skip it | wda.test.mjs |
| **Every action end to end through a lane, on both phones**: look tree / image / both, tap by label, tap by coordinate (points and pixels), double, hold, swipe (with `holdBefore`), type, home, press button, open app, close app, wait, pop-up accept and dismiss | lanes.test.mjs: each name ends `[phone 1]` / `[phone 2]` |
| Lanes: stop at first failed step; locked phone; changed screen; no look / other phone's look / ambiguous label; rotated image; cable pull and replug; WDA not started; WDA dies mid-command; health check only when idle; DEAD after three failures and back; **DEAD when WDA is alive but its command queue is stuck**; LOCKED from the health check; settings lost after a WDA restart | lanes.test.mjs |
| A step the phone never answers is reported as "may or may not have landed", nothing more is asked of the phone in that call, and the lane is no longer shown READY | lanes.test.mjs: `a step the phone never answers` |
| Points off the screen, numbers that are not numbers, more than 20 steps, a hold over 10 s, a wait over 10 s: refused, nothing sent | lanes.test.mjs: `coordinates off the screen`, `at most 20 steps` |
| A look is capped (500 lines / 64 KB with a "N more lines not shown" line; a picture over 2 MB refused); hidden elements are not listed and cannot be tapped by label; switched-off ones say so | lanes.test.mjs: `a look is capped`, `hidden and switched-off` |
| Two phones side by side, each lane strictly serial; alias bound on first sight; a buy needs the full UDID | lanes.test.mjs: `two phones at once`, `registry:` |
| **finger_act inside the wallet** (fake wallet): no touch on the recorded confirm rectangle whatever the tree says, including when the wallet moves to its confirm screen while the phone is holding the tap; no touch on a labelled or unlabelled confirm button, "Confirm Bet", "CONFIRM", or a hidden one; nothing at all on the confirm screen; a phone with another screen size is not touched; digits-only typing; pop-ups only dismissed | lanes.test.mjs: `race:`, `wallet guard:` (4), `gestures near the buy button`, `typing inside the wallet`; link.test.mjs: `bridge: finger_act inside the wallet` |
| **The shipped `profiles/phantom.json`** (bundle id only): inside the wallet nothing is tapped, held or swiped, only digits are typed, no pop-up is accepted; with wallet setup switched on by Alex, taps go through and typing stays digits only | lanes.test.mjs: `the shipped phantom.json` |
| Screenshot path: magic bytes, sizes, HEIC and unknown refused, X/Y ratio refusal, downscale path, stale look, tree compaction and fingerprint | lanes.test.mjs: `screen:`, `tree:` |
| **Money guard, as arithmetic over ledger rows**: over per-bet cap, stake not 2/5/10, stake locked, daily cap, blank numbers, PAPER, double submit, two buys at once (the second touches nothing), same command id twice, stale command (also one that went stale waiting in the lane), wrong app; any number that is not a number refuses | money.test.mjs: `guard:` |
| **Stale or wrong screen**: wrong coin / side / stake / round, slow read, clock past the budget before the tap, too little time left, unreadable screen, a field shown twice, a hidden stale screen underneath is not read, a hidden or switched-off confirm button is not pressed, missing button | money.test.mjs: `stale or wrong screen:`, `stale screen:`, `hidden elements:` |
| **The confirm tap**: it gets only what is left of the 2 s budget; held longer, or answered later than the budget, it is UNKNOWN; a tap the phone provably refused is recorded as not placed and does not halt buying; WDA death is UNKNOWN and never retried | money.test.mjs: `confirm tap:`, `confirm tap refused`, `unknown outcome:` |
| **Wrong phone**; caps shared across two phones; UNKNOWN halts that phone only until it is resolved (`ledger.resolve`, the page's two buttons); crash between reservation and outcome; pop-up or lock stops a buy | money.test.mjs: `wrong phone:`, `two phones:`, `unknown outcome:`, `crash between`, `a pop-up` |
| Live mode is blocked, as shipped, because no result reader exists; the empty Phantom profile blocks live; a profile finger cannot guard does not load | money.test.mjs: `guard: live stays blocked`, `the empty Phantom profile`, `profile:`; link.test.mjs: `bridge: as shipped` |
| Caps file and ledger: PAPER and blank by default; the page takes plain numbers only, inside bounds; the numbers form cannot set mode / gate / stake unlock; Athens midnight; a result frees a stake and an unsettled bet from an earlier day still counts and is named by its day | money.test.mjs: `caps:` (2), `ledger:` (2) |
| **Damaged files**: a torn last line in the ledger or the command journal is set aside and reported; any other bad ledger line stops buys only (`LEDGER_DAMAGED`); an unreadable limits file goes to PAPER with blank limits; an unreadable phone list is set aside; with all of them damaged at once finger starts, the page answers and says what is wrong, look and act work | money.test.mjs: `damaged files:`; app.test.mjs: `worker: with a torn or damaged line` |
| finger-link queue: stale-heartbeat refusal, single delivery, lifetime, result stored once, journal; **a call taken and never answered reads as lost after its deadline**; a result too big to keep ends the call with `RESULT_TOO_BIG` | link.test.mjs: `link core:` |
| finger-link MCP: initialize, tools/list, ping, notification 202, unknown method, GET 405, key check, offline refusal, late result with image, journal, status; a lost call says "may or may not have been carried out" | link.test.mjs: `mcp:` |
| The Mac's link loops: a result the link will not take stays on disk and is posted again until taken (also across a restart), its id rides in the heartbeat; an over-size result is swapped for a small one; an odd take answer does not kill the loop; one timer per loop; the take loop does not wait for a command | link.test.mjs: `link:` (4) |
| **Bridge round trip**: Claude-side MCP call -> finger-link -> Mac worker -> lane -> usbmux -> WDA -> back, both phones; image as MCP image content; buy refusals and one placed bet through the whole bridge; double delivery; a call that waited past its lifetime is not carried out; cable pull; heartbeat alive during a slow command; link down | link.test.mjs: `bridge:` |
| The real `link/worker.mjs` with its SQLite Durable Object in local workerd (not deployed), including a 9 MB result ending as `RESULT_TOO_BIG` and a 3.5 MB one kept | `npm run check:workerd` (separate: it uses the wrangler installed at the repo root) |
| Page: answers only to its own address (127.0.0.1 or localhost with its port; a rebinding site gets 403 on every route, status included), status, numbers saved and validated, live blocked, other origins and form posts refused, UNKNOWN resolved, wallet setup switched, script parses and calls only routes the server has | app.test.mjs: `page:` (7) |
| Probe logic with a fake `xcode-select` and Info.plist | app.test.mjs: `probe:` |
| Launcher under Linux bash: first launch from a path with a space, page answers with the build, worker restarted after a kill, **a second double-click opens the running copy's page and leaves its page.url and worker folder alone**, bundle-is-the-truth install in both directions with data kept, **a different build while running: the old worker is stopped first, then the new one runs and the page opens** | app.test.mjs: `launcher:` (3), `bundle: Info.plist` |
| No dependency, no outside import, no banned strings, link config has its own name | app.test.mjs: `bundle:` (2), `link config:` |

The page was opened in headless Chrome here (two states: fresh, and with a damaged ledger, an
unknown bet and wallet setup on) and looked at. It has not been seen in Safari on his Mac.

### What "proven" does NOT mean for the money stops

- **The daily loss stop and the losses-in-a-row stop are proven as arithmetic over rows the
  tests write with `ledger.settle()`. Nothing in the shipped app writes a settlement row.**
  Reading a round's result off the wallet is not built (it needs Phantom's real screens). In
  the shipped app `lossToday` and `lossRun` therefore stay 0, and that is why live mode is
  blocked in code until the reader exists (`BUILT.settlementReader` in `src/guard.mjs`).
- "UNKNOWN resumes when resolved" is proven for the page's two buttons ("It was placed" /
  "It was not placed"). finger does not resolve an UNKNOWN bet by itself.
- A placed bet with no result recorded counts against the daily loss limit on every later
  day too (`openStakes`), and the refusal names the day it is from.

## 2. Written, UNPROVEN UNTIL HIS MAC

| File | Why it is unproven |
|---|---|
| `app/finger.app/Contents/MacOS/finger` (launcher) | Run only under Linux bash 5. macOS ships bash 3.2; Gatekeeper first-open on Sequoia is unread; `open` is a stand-in script in the tests. There is no Node binary in the bundle yet. |
| `app/finger.app/Contents/Info.plist` | Parses; keys cited from Apple's pages. Never opened by macOS. |
| `src/probe.mjs` | `xcode-select` and Xcode's Info.plist never read for real. If that plist is binary the version is reported as not read. The macOS version is shown as Darwin kernel text only. |
| `src/usbmux.mjs` against the real `/var/run/usbmuxd` | Proven only against the fake. Apple's usbmuxd is closed: whether it accepts `ListDevices` / `Listen` without the version key, and what it puts in a reply header, is unread. Port 8100 over plain usbmux on his iOS is the plan's open item 7. |
| `src/wda-client.mjs`, `src/routes.mjs` against a real WDA | Routes are read from source, never called on a device. Whether WDA 17.0.12 builds with his Xcode 16.x is not known. |
| `profiles/phantom.json` bundle id `app.phantom` | Read from the App Store lookup, not from his phone. If Phantom reports another id, finger would not know the wallet is in front, and none of the wallet rules would apply. **M4's first step is to read `/wda/activeAppInfo` with Phantom open and compare.** |
| Hidden / switched-off elements | The keys are in the source. Whether Phantom (React Native) sets them truthfully is unread. |
| `ui/index.html` | Looked at in headless Chrome on Linux only. Setup steps 1 to 12 of the plan are not on the page. |
| `link/worker.mjs`, `link/wrangler.toml` | Runs in local workerd. Not deployed; `FINGER_KEY` is not set anywhere. Never called by claude.ai. |

There is no Swift shell: the plan's decision 1 is a page on 127.0.0.1 and no Swift, and
`tools/flip/check-swift.mjs` does not exist in this repo, so there was nothing to validate.

## 3. Provisional (works in tests, will change at M4)

- `src/buy.mjs` and the profile shape (`flow`, `confirm.label`, `confirm.fields`, `placed`,
  `screen`, `guardRects`, `confirmLabels`) are built against a made-up wallet in `test/rig.mjs`.
  Phantom's real screens decide the final shape.
- **Before M4 fills the profile, finger_act does not touch inside the wallet at all**
  (`WALLET_NOT_RECORDED`): it looks, types digits, dismisses pop-ups, nothing else. For M4
  itself Alex switches "wallet setup" on, on the page, with an EMPTY wallet; while it is on the
  page says in red that nothing guards the buy button and the balance must be zero. This is a
  switch only he has, like PAPER / LIVE. It does nothing once the profile is readable.
- The guard rectangles are fixed points recorded on one screen size. A phone of another size
  is not touched inside the wallet until it has its own recording (fails closed).
- "The confirm screen is showing" means: the confirm button's label is anywhere in the tree,
  or every confirm field reads. To be settled against Phantom's tree, with a test per shape.
- Inside the wallet a pop-up is only dismissed. If Phantom confirms a bet with a pop-up,
  `finger_buy` needs its own way to accept it; decided at M4.
- The wallet is identified by the phone's UDID (one wallet per phone).
- A buy's age is measured from finger-link's clock against the Mac's clock. A Mac clock that
  is more than 20 s off refuses every buy (it fails safe).
- A coordinate tap is refused if any text on the screen changed since the look. On a live
  price screen that will refuse often; label taps are not affected. To be judged at M4.
- WDA may hold any tap up to 10 s waiting for the app to go idle (SOURCES.md, "What a tap
  waits on"). With the 2 s budget, a buy on a screen that never goes idle would always end
  UNKNOWN. Lowering `waitForIdleTimeout` for the wallet is decided at M4 from a measurement.
- Timeouts, the 25 s tool wait, the 500 ms poll, the 900 px image target, the 4 MB result /
  2 MB picture / 500-line tree limits, the bounds on the page's numbers: starting numbers.

## 4. Not started, or specified by the plan and missing

**Needs a decision before M4**
- `respectSystemAlerts` (decision 24) is not read or set; it is off unless set
  (`src/routes.mjs` has the citation). On or off decides whether a system pop-up over the
  wallet is seen by the pop-up check.
- `finger_buy` has no price parameter: the price on the confirm screen is written to the
  ledger but compared with nothing (section 7 step 4).
- The stake is not read back after it is entered (section 7 step 3).

**Missing, no decision needed**
- **The settlement reader**: read a round's result from the wallet and call `ledger.settle()`.
  Live mode is blocked in code until it exists. Also UNKNOWN resolution through Phantom's
  history, and balance reconciliation.
- One global command queue in finger-link, not one per UDID (decision 16). Lanes on the Mac
  are per UDID.
- No registry refresh loop: `Usbmux.listDevices` is never called from `src`; presence comes
  from `Listen` only.
- Results carry build, WDA version, mode, spent today and last-look age; balance is always
  `null` (not read from the wallet yet).

M1: `pack.sh` and the zip; the bundled Node x64 binary; `.github/workflows/finger-mac.yml`
(macOS runner jobs); deploying finger-link; `.keys.json`; the setup steps on the page; the
free/paid Apple account line; devicectl / xcdevice registry join (phone name, iOS version,
Developer Mode); balance on the page.

M2: the real image resampler (no Node built-in decodes JPEG; the downscale path takes one and
is tested with a stand-in, so today a full-size JPEG is sent, and one over 2 MB is refused);
the "USB path closed by iOS" detection; what `/source` waits on inside XCTest; the simulator job.

M3 and later: `src/wda-runner.mjs` (xcodebuild supervisor, build lock, error classes),
`src/provision.mjs`, `src/selftest.mjs` (the tool answers "not built yet"), restart of a DEAD
lane, MJPEG, start-at-login, keep-awake, the trading layer, and the items Alex added on
2026-11-21 in the skill (live update, standing orders on the Mac, phone cards).

READ-FIRST items still unread: Gatekeeper on Sequoia, Node darwin-x64 download,
`man xcode-select`, Developer Mode / Auto-Lock / Automatic Updates paths, Apple free vs paid,
GitHub macOS runner labels, Cloudflare Worker body and long-poll limits, MCP result size and
claude.ai image and time limits, `lib/xcodebuild.ts`.
