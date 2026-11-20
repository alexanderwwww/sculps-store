# finger: status (build 1, 2026-11-20)

**Nothing here has run on a Mac or an iPhone.** This container is Linux. finger does not
"work" until section 2 has been seen on his Mac. Nothing is deployed. No zip exists.

Run everything: `npm test` in `tools/finger` (157 tests, Node 22, no dependencies).
Sources for every outside fact: `SOURCES.md`.

## 1. Proven here (Linux, against fakes written from the cited sources)

The fakes are `test/fake-usbmuxd.mjs` (a unix socket speaking the real usbmux framing and
plists, two phones, a Network duplicate, attach/detach, Connect results 0/2/3, raw passthrough)
and `test/fake-wda.mjs` (the 20 routes transcribed from the pinned WDA source on their own,
session rules, error envelopes, one request at a time, HEIC until the JPEG setting is applied).
A fake proves finger does what the source says. It does not prove his iPhone does.

| What | Tests (file: names start with) |
|---|---|
| plist and usbmux framing: round trip, split and glued frames, tag, 8100 becomes 42015 | protocol.test.mjs: `plist:`, `usbmux:` (7) |
| usbmux client against the fake daemon: USB-only list, Listen attach/detach, Connect 0/2/3, raw stream, byte-by-byte replies, no socket | protocol.test.mjs: `fake usbmuxd:`, `usbmux:` (6) |
| WDA client: every route in the table answered by the fake; session create with `capabilities.alwaysMatch`; settings applied and re-applied; lost session recreated and retried once; no retry for a buy; error envelope; no-alert reads as null; HTML refused; per-route timeout; REFUSED and NOT_PLUGGED; serial answering | wda.test.mjs (13) |
| **Every action end to end through a lane, on both phones**: look tree / image / both, tap by label, tap by coordinate (points and pixels), double, hold, swipe, type, home, press button, open app, close app, wait, pop-up accept and dismiss | lanes.test.mjs: each name ends `[phone 1]` / `[phone 2]` (2 x 15) |
| Lanes: stop at first failed step; locked phone; changed screen; no look / other phone's look / ambiguous label; rotated image; cable pull and replug; WDA not started; WDA dies mid-command; health check only when idle and never during a slow `/source`; DEAD after three failures and back; settings lost after a WDA restart | lanes.test.mjs: `[phone 1]` / `[phone 2]` (2 x 12) |
| Two phones side by side, each lane strictly serial | lanes.test.mjs: `two phones at once` |
| Alias bound on first sight, survives replug in swapped order and a restart; phone may be left out only with one plugged in; a buy needs the full UDID | lanes.test.mjs: `registry:` (2) |
| No gesture in finger_act can touch the confirm button (tap, double, hold, coordinate, margin, swipe through, swipe across); wallet typing is digits only | lanes.test.mjs: `gestures near the buy button`, `typing inside the wallet` |
| Screenshot path: magic bytes, sizes, HEIC and unknown refused, X/Y ratio refusal, downscale path, stale look, tree compaction and fingerprint | lanes.test.mjs: `screen:` (4), `tree:` |
| **Money guard**: over per-bet cap, stake not 2/5/10, stake locked, daily cap, blank numbers, PAPER, daily loss stop, losses in a row and reset, double submit, two buys at once, same command id twice, stale command, wrong app | money.test.mjs: `guard:` (13) |
| **Stale or wrong screen**: wrong coin / side / stake / round on the confirm screen, slow read, too little time left, unreadable confirm screen, missing button | money.test.mjs: `stale or wrong screen:` (4), `stale screen:` (4) |
| **Wrong phone**: alias or no phone or unknown UDID; bet goes only to the named phone; named phone unplugged | money.test.mjs: `wrong phone:` (3) |
| Caps shared across two phones buying at the same moment; UNKNOWN outcome halts that phone only and resumes when resolved; WDA death and lost session at the confirm tap are never retried; crash between reservation and outcome; pop-up or lock stops a buy; the empty Phantom profile blocks live | money.test.mjs: `two phones:`, `unknown outcome:` (3), `crash between`, `a pop-up`, `the empty Phantom profile` |
| Caps file and ledger: PAPER and blank by default, validation, the numbers form cannot set mode / gate / stake unlock, Athens midnight | money.test.mjs: `caps:`, `ledger:` |
| finger-link queue: stale-heartbeat refusal, single delivery, lifetime, result stored once, journal | link.test.mjs: `link core:` (5) |
| finger-link MCP: initialize, tools/list, ping, notification 202, unknown method, GET 405, key check, offline refusal, late result with image, journal, status | link.test.mjs: `mcp:` (5) |
| **Bridge round trip**: Claude-side MCP call -> finger-link -> Mac worker -> lane -> usbmux -> WDA -> back, both phones; image as MCP image content; buy refusals and one placed bet through the whole bridge; double delivery; cable pull; heartbeat alive during a slow command; link down | link.test.mjs: `bridge:` (12) |
| The real `link/worker.mjs` with its SQLite Durable Object in local workerd (not deployed) | `npm run check:workerd` (separate: it uses the wrangler installed at the repo root) |
| Page: 127.0.0.1 only, status, numbers saved and validated, live blocked, other sites cannot post, script parses | app.test.mjs: `page:` (5) |
| Probe logic with a fake `xcode-select` and Info.plist | app.test.mjs: `probe:` |
| Launcher under Linux bash: first launch from a path with a space, page answers with the build, worker restarted after a kill, second copy steps aside, bundle-is-the-truth install in both directions with data kept | app.test.mjs: `launcher:` (2), `bundle: Info.plist` |
| No dependency, no outside import, no banned strings, link config has its own name | app.test.mjs: `bundle:` (2), `link config:` |

Three real defects were found by these tests and fixed: a usbmux notification arriving in
the same packet as the Listen reply was dropped; screenshots came back HEIC because the JPEG
setting was only applied when some other step had made a session; the launcher stalled 10 s
when the worker died during its first seconds.

## 2. Written, UNPROVEN UNTIL HIS MAC

| File | Why it is unproven |
|---|---|
| `app/finger.app/Contents/MacOS/finger` (launcher) | Run only under Linux bash 5. macOS ships bash 3.2; Gatekeeper first-open on Sequoia is unread; `open` untested. There is no Node binary in the bundle yet. |
| `app/finger.app/Contents/Info.plist` | Parses; keys cited from Apple's pages. Never opened by macOS. |
| `src/probe.mjs` | `xcode-select` and Xcode's Info.plist never read for real. If that plist is binary the version is reported as not read. The macOS version is shown as Darwin kernel text only. |
| `src/usbmux.mjs` against the real `/var/run/usbmuxd` | Proven only against the fake. Port 8100 over plain usbmux on his iOS is the plan's open item 7. |
| `src/wda-client.mjs`, `src/routes.mjs` against a real WDA | Routes are read from source, never called on a device. Whether WDA 17.0.12 builds with his Xcode 16.x is not known. |
| `ui/index.html` | **Never looked at in a browser.** The script parses and the routes exist; how it looks is unseen (rule 4). Setup steps 1 to 12 of the plan are not on the page. |
| `link/worker.mjs`, `link/wrangler.toml` | Runs in local workerd. Not deployed; `FINGER_KEY` is not set anywhere. Never called by claude.ai. |

There is no Swift shell: the plan's decision 1 is a page on 127.0.0.1 and no Swift, and
`tools/flip/check-swift.mjs` does not exist in this repo, so there was nothing to validate.

## 3. Provisional (works in tests, will change at M4)

- `src/buy.mjs` and the profile shape (`flow`, `confirm.fields`, `placed`) are built against a
  made-up wallet in `test/rig.mjs`. Phantom's real screens decide the final shape.
  `profiles/phantom.json` is empty, so live mode and every buy are blocked today.
- With the empty profile there is **no gesture guard for Phantom's confirm button**, because
  its label is not known. Until M4 the protection is the plan's own: zero balance in the wallet.
- The wallet is identified by the phone's UDID (one wallet per phone).
- The daily loss stop counts money lost today, less money won, plus every stake still in play.
- An UNKNOWN bet is not resolved by finger itself yet; an outcome row has to be written.
- A buy's age is measured from finger-link's clock against the Mac's clock. A Mac clock that
  is more than 20 s off refuses every buy (it fails safe).
- A coordinate tap is refused if any text on the screen changed since the look. On a live
  price screen that will refuse often; label taps are not affected. To be judged at M4.
- Timeouts, the 25 s tool wait, the 500 ms poll, the 900 px image target: starting numbers.

## 4. Not started

M1: `pack.sh` and the zip; the bundled Node x64 binary; `.github/workflows/finger-mac.yml`
(macOS runner jobs); deploying finger-link; `.keys.json`; the setup steps on the page; the
free/paid Apple account line; devicectl / xcdevice registry join (phone name, iOS version,
Developer Mode); balance on the page.

M2: the real image resampler (no Node built-in decodes JPEG; the downscale path takes one and
is tested with a stand-in, so today a full-size JPEG is sent); the "USB path closed by iOS"
detection; tracing what `/wda/tap` and `/source` wait on; the simulator job.

M3 and later: `src/wda-runner.mjs` (xcodebuild supervisor, build lock, error classes),
`src/provision.mjs`, `src/selftest.mjs` (the tool answers "not built yet"), restart of a DEAD
lane, MJPEG, start-at-login, keep-awake, balance reconciliation, UNKNOWN resolution through
Phantom's history, the trading layer.

READ-FIRST items still unread: Gatekeeper on Sequoia, Node darwin-x64 download,
`man xcode-select`, Developer Mode / Auto-Lock / Automatic Updates paths, Apple free vs paid,
GitHub macOS runner labels, Cloudflare and MCP size and time limits, `lib/xcodebuild.ts`.
