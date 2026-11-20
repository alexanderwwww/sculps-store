# finger: build plan (revision 2, 2026-11-20)

finger is software on Alex's Mac that works any iPhone plugged in by USB like a finger and
a pair of eyes: see the screen, tap, swipe, type, open apps. One iPhone now, two later.
First job: the Phantom wallet's crypto Up/Down markets, BTC then SOL then ETH each round,
with Claude as the brain.

**Status: plan only. No code exists. Nothing iOS has been run.** This container is Linux;
every iOS fact below was read from source or an official page, not executed.

Tags: [A§n] WebDriverAgent (WDA) source research, [B§n] USB and signing research,
[C§n] this repo, [F#n] facts critique, [P#n] process-and-money critique.
"MAC-CHECK" = only his Mac can prove it (section 13).
"READ-FIRST" = a doc or source that must be read and cited before the line is written (rule 15).

His words, which are the specification (2026-11-20):

> "build it so it can work on any iPhone, because I might use two iPhones later, and they're
> gonna be connected with a USB ... the app is going to be able to do anything on the iPhone,
> like as a finger. I want this to be clear, without mistakes, without sloppy code, without
> old apps ... One person that makes the code, other one that it inspects, and the inspector
> for mistakes ... So the game is Phantom Wallet ... First BTC, then Sol, then Ethereum."

---

## 0. Gate zero: can his Mac drive his phone at all? (before any code)

The repo already records his Mac (`.claude/skills/shipping/SKILL.md:134-169`): MacBook Air
13-inch 2020, 1.1 GHz dual-core Intel i3, 8 GB, macOS Sequoia. [F#1, P#1]

Read today from Apple's pages by the facts reviewer (to be re-read and quoted at M0):
- support.apple.com/en-us/122867: macOS Tahoe lists only "MacBook Air (M1, 2020)" for that
  year, so an Intel 2020 Air stays on Sequoia.
- developer.apple.com/support/xcode: Xcode 26.3 is the last Xcode for Sequoia 15.6
  (iOS SDK 26.2). Xcode 26.4+ needs Tahoe 26.2. Xcode 27 needs Tahoe 26.6.

What follows:
- A spare iPhone on iOS 27 cannot be driven from this Mac.
- A spare iPhone above iOS 26.2 on Xcode 26.3 is unproven.
- Xcode must bundle the device's iOS SDK [A§4].

**The one question for Alex, asked once:** on the spare iPhone, Settings > General > About,
what number is next to "iOS Version"? And: is the MacBook Air still the Mac he will use?

Gate rule:
- iOS at or below 26.2 and Sequoia 15.6 with Xcode 26.3: go.
- Sequoia below 15.6: one macOS update click first (Software Update), then go.
- iOS above 26.2: stop before any code and tell him the one concrete fix (a spare phone on
  older iOS, or a newer Mac). Do not build towards a dead route.
- Setup turns off Automatic iOS Updates on the spare phone so it cannot update itself out
  of range (path READ-FIRST from Apple's support page).

The M1 probe then confirms the same facts by reading them off the Mac. It does not discover them.

---

## 1. Decisions

| # | Topic | Decision | Why |
|---|---|---|---|
| 1 | Window | A page on `127.0.0.1` opened in his browser. No Swift shell. | Swift cannot be compiled or tested here [C§3]. |
| 2 | Node | A Node x64 binary ships inside the app. No "find Node", no nodejs.org step. | Removes a multi-click step and a first-launch failure [F#18, P#2]. Version and download URL READ-FIRST from nodejs.org. |
| 3 | npm dependencies | None. Node built-ins only. | Nothing to install on first launch. |
| 4 | WDA source | One repo and one exact commit chosen at M0: `appium/appium-ios`, `packages/webdriveragent` (the live source [B]). The route table is re-derived from that commit before the fake WDA is written. | Research A's citations are from the old repo at 16.15.3; a fake built from them could encode the wrong version [F#4]. |
| 5 | WDA version | The latest tag the support tables allow for his Xcode (WDA 16.12.9+ has full support for Xcode 26.0+ [A§4]). Fall back to an older tag only on a recorded failure. | "Last fully tested" is not "must use" [F#3]. |
| 6 | Launch | `xcodebuild`, never `devicectl` (broken on newer stacks [B§4]). First run `build-for-testing test-without-building`; restarts use `test-without-building` only [A§1 lines 413-422]. | Restarts must not rebuild on an i3 [F#30]. |
| 7 | Builds | One build at a time across all phones. | Dual-core, 8 GB [F#30, P#22]. |
| 8 | USB | Own usbmux client; HTTP sent straight down a `Connect` socket. No port forwarder, no third-party tool. | Protocol is small and fully read [B§1]. |
| 9 | Ready signal | `GET /status` returns `ready`. xcodebuild output is still captured: phase, log tail, exit code, classified errors. | `/status` alone cannot tell "untrusted" from "still building" [F#7]. Error strings are collected at M3 from real runs, never invented. |
| 10 | Health check | Goes through the lane's serial queue, only when the lane is idle. Never during a command. Never during a buy. | WDA serves every route on the main queue (`FBWebServer.m:80`); a slow `/source` would look like a dead WDA [F#2]. |
| 11 | Image, first version | `/screenshot` only, with `screenshotQuality` set on purpose, magic bytes sniffed on every image (JPEG `FF D8`, PNG, HEIC `ftyp`), anything else refused. | Default is HEIC [A§2]; the bytes on his iOS are unread [F#23]. |
| 12 | MJPEG | Later, after the first proven $2 round trip. | Cuts scope before he sees his phone move [P#23]. Settings are session-only, global and reset on WDA restart [F#15]. |
| 13 | Coordinates | X ratio and Y ratio computed separately from `/window/size` and the image size; refuse if they differ by more than 1%. Phone locked to portrait. | Rotation or a non-full-screen app frame breaks a single ratio [F#16]. |
| 14 | Stale taps | Every `lookId` stores a tree fingerprint and a time. A coordinate tap is refused if the current fingerprint differs or the look is older than the limit. | Time alone is not enough [P#15]. |
| 15 | Link | New worker `finger-link` with a SQLite Durable Object queue, written fresh. Long-poll if Cloudflare's docs support it (READ-FIRST), else 500 ms poll. | R2 list+delete has no lock [C§5.9]. |
| 16 | Queue safety | Refuse when the heartbeat is older than 30 s; every command has a lifetime; the command id is journaled before it runs. | No late or double-delivered action. |
| 17 | Devices | Everything keyed by UDID. Alias (1, 2) is bound to the UDID on first sight and stored forever. Every result shows name and the last 4 of the UDID. A buy must carry the UDID, never an alias. | A replug must never swap wallets [F#25, P#14]. |
| 18 | Bundle id | finger generates one bundle id once, stores it forever, and uses it for every phone and every WDA tag. | Free accounts get 10 App IDs per 7 days, shared with everything on that Apple ID [F#9]. |
| 19 | Signing | Alex's clicks in Xcode. No command-line bundle-id or team override. | The override is unverified on a free account [A§1]. |
| 20 | WDA folder | Copied once to `~/Library/Application Support/finger/wda/<tag>/`; never overwritten while the tag is unchanged. finger creates `Resources/WebDriverAgent.bundle` itself. All child arguments are arrays, never a shell string. | The docs need that folder made "in the terminal" [F#5]; the path has a space [F#26]. |
| 21 | Xcode location | The probe finds Xcode.app and sets `DEVELOPER_DIR` in the child environment (READ-FIRST `man xcode-select`). | No `xcode-select -s` in a terminal [F#6]. |
| 22 | Profile expiry | Read from the built runner's `embedded.mobileprovision` and shown as a date. No "day 5 rebuild" promise until a real expiry has been crossed. | No source says a rebuild renews early [F#8]. |
| 23 | Locked phone | Say "unlock iPhone 1". finger never types a passcode, PIN or seed phrase. `/wda/unlock` is tried once only on a phone with no passcode. | It only presses Home twice [A§2, F#20]. |
| 24 | Alerts | Checked once per command and after a failed step, not before every step. No alert = the `noAlertOpen` error envelope. `respectSystemAlerts` default is read and set on purpose. Never auto-accepted. | Each check is a full snapshot on the same queue [F#14]. |
| 25 | Money rules | Live in the Mac worker, as numbers Alex types on the page. Claude cannot change them. No approval cards (rule 34). | |
| 26 | No tree, no live | If the confirm screen does not expose readable coin, side, stake and round, live mode cannot be switched on. No rectangle fallback. | A rectangle is a blind buy [F#22, P#7]. |
| 27 | Round length | Read from the screen. Never a hard-coded 5 minutes. | The repo records Phantom's markets as Kalshi 15-minute series [C§5.12, P#4]. |
| 28 | Phantom reality check | Right after the first real look (M3), read-only, before any trading code. | The existential question must not come last [P#4]. |
| 29 | Paper learning | Off the phone when the market has a public API (Kalshi's is already in the up-or-down skill). The iPhone places live bets and reads settlements only. | His Claude usage must not drain on looks [P#18]. |
| 30 | No self-update, no cloud flags, no remote code. | | [C§5.7] |
| 31 | Unattended extras | Start-at-login, keep-awake, expiry timer, 24-hour soak: after the first proven $2 round trip. | [P#23] |
| 32 | Earlier rules | See section 12. His request today is the latest instruction; it is put to him in one line, not assumed silently. | [F#29, P#5] |

---

## 2. Architecture

| Piece | Runs on | Job |
|---|---|---|
| `finger.app` (bash stub + bundled Node x64) | Mac | Installs the runtime from the bundle (bundle is the truth, different in either direction), starts one worker, opens the page. No Terminal window. |
| Node worker (built-ins only) | Mac | usbmux client, device registry, per-UDID lanes, WDA client, guard, ledger, link client, page server, journal. |
| `xcodebuild` child, one per phone | Mac | Keeps WDA alive; the "test" never ends [A§1]. |
| WebDriverAgentRunner | iPhone | HTTP on device port 8100. `USE_PORT=8100` and `MJPEG_SERVER_PORT=9100` set explicitly in the child environment and kept in the lane record [A§3, F#27]. |
| `finger-link` (Worker + SQLite Durable Object) | Cloudflare | MCP endpoint, per-UDID queue, status, journal. |
| Claude | Cloud | The brain. Sees only tool results. |

How the worker stays alive with no Terminal and no Dock app, and how an unsigned app from a
zip gets past Gatekeeper on Sequoia, are READ-FIRST items (Apple's "open an app from an
unidentified developer" page; and how the already-shipped apps got past it on his Mac,
reusing only that fact) [F#18]. The exact clicks go into setup.

Loops, each independent (the heartbeat never shares a loop with work that can wait):
heartbeat every 5 s; take; usbmux `Listen`; registry refresh. Health checks are lane work
(decision 10). No top-level `await` on WDA, xcodebuild or usbmux.

usbmux facts used [B§1]: unix socket `/var/run/usbmuxd`; 16-byte little-endian header
(length, version 1, message 8, tag) plus XML plist; `ListDevices`, `Listen` (notifications at
tag 0), `Connect` (result 0 turns the socket into the raw stream; one socket per request;
results 2 = bad device, 3 = nothing listening); port byte-swapped (8100 becomes 42015);
USB entries only; UDIDs matched case-insensitively; `DeviceID` re-read on every attach.

Registry: usbmux for presence. Name, iOS and Developer Mode from
`xcrun devicectl list devices --timeout <n> --json-output <file>`, fallback
`xcrun xcdevice list --timeout <n>` [B§3]. devicectl lists only iOS 17+ and its field names
come from Flutter's comments, so detection is best-effort until M1 captures his real JSON [F#10].

Two iPhones: each UDID has its own lane, xcodebuild child, derived-data folder, session,
queue, status line and ledger rows. Lanes run side by side; one lane is strictly serial.
`device` may be omitted for a look or a plain action only when exactly one phone is
attached. Never for a buy.

Every tool result, the heartbeat and the page header carry: build number, WDA tag, mode
(PAPER or LIVE), balance, spent today, last-look age, device name and last 4 of UDID [P#21].
The pidfile refuses a second copy and names the running one.

**One look-then-tap cycle**
1. Claude calls `finger_act {device, steps:[{tap:{label:"..."}}], then:"tree"}`.
2. The Durable Object refuses if the heartbeat is stale; otherwise queues under the UDID.
3. The worker journals the command id, then hands it to the lane.
4. The lane checks state: READY, not locked; one alert check.
5. `Connect` to 8100; ensure a session (`POST /session` with `capabilities.alwaysMatch`),
   re-applying settings after every session create [F#15].
6. Fetch the tree, resolve the label to a rect centre, `POST /session/<id>/wda/tap {x,y}`.
7. Fetch the tree again, compact it.
8. Post the result with retry; the last error goes in the heartbeat [C§5.10].
   A tap is reported "sent", with the screen after. Never "succeeded".

What `/wda/tap` and `/source` wait on (idle wait, `animationCoolOffTimeout`) is traced in
the pinned commit before coding and measured on Phantom's chart screen [F#13]. Every route
has its own timeout.

---

## 3. Tool surface (MCP, on finger-link)

| Tool | Params | Result |
|---|---|---|
| `finger_status` | none | Per device: UDID, alias, name, iOS, state, each setup step's state, foreground app, locked, alert text, profile expiry date, xcodebuild phase and log tail, last error. Global: build, WDA tag, mode, caps, spent today, balance. |
| `finger_look` | `device`, `mode: tree` (default) / `image` / `both` | `lookId`; tree as lines like `Button "label" @x,y,w,h` in points; image with its pixel size. |
| `finger_act` | `device`, `steps[]`, `then: tree/image/none` | Per-step outcome, then the after-look. Stops at the first failed step. |
| `finger_buy` | `udid`, `coin`, `side`, `stake`, `round` | Runs the whole guarded sequence on the Mac (section 7). Returns what was read off the screen and the ledger row. |
| `finger_result` | `id` | Late result of a call that outlived the wait. |
| `finger_journal` | `add:{row}` or `last:n` | Decision and bet rows. |
| `finger_selftest` | `device` | Each self-test step, pass or fail, with the raw error. |

The buy is its own tool, not a flag on a tap, so no gesture in `finger_act` can ever be a buy.

Steps and routes [A§2], each re-read in the pinned commit (decision 4):
- `tap {label}` or `tap {x,y,of:lookId}`: `/wda/tap`
- `double`: `/wda/doubleTap`; `hold {seconds}`: `/wda/touchAndHold`
- `swipe {from,to,seconds}`: `/wda/dragfromtoforduration` (`/wda/swipe` is direction-only)
- `type {text}`: `/wda/keys`, `value` as an array of characters
- `home`: `/wda/homescreen` (session-less only)
- `open {bundleId}`: `/wda/apps/activate`; `close {bundleId}`: `/wda/apps/terminate`
- `alert {accept|dismiss, name?}`: `/alert/accept`, `/alert/dismiss`
- `wait {ms}`

Tree: `/source?format=json` (gives `label` and `rect`), foreground app from
`/wda/activeAppInfo`, lock from `/wda/locked`.

Limits (READ-FIRST, before image size or wait times are fixed [F#24]): MCP result size,
Worker body size, claude.ai image handling and tool-call timeout. The 900 px / JPEG 58 house
rule is a starting target only until those are read.

---

## 4. Setup for Alex (clicks only, one step on screen at a time)

Every step has a detection or a self-test that fails with the exact step name, plus a
manual "Done" click as fallback. Each step's state is in `finger_status`, so Claude sees
where he is without a screenshot [F#10, P#19]. Final wording is written after M1 reads his
Xcode version, because menu names differ [B§4].

1. Double-click finger. First open of an unsigned app on Sequoia: exact clicks READ-FIRST.
2. If the page says so: open Xcode once and click Install / Agree (detected from the
   xcodebuild error text) [F#6].
3. Plug in the iPhone with Xcode open; tap **Trust** on the phone.
4. Developer Mode, in this order (Apple's "Enabling Developer Mode on a device" page; the
   switch appears only after pairing) [F#11]:
   a. Settings > Privacy & Security > Developer Mode > ON.
   b. The phone restarts.
   c. After restart tap **Enable** and type the phone passcode. Alex types it; finger never does.
5. Settings > Developer > Enable UI Automation > ON (the Developer menu appears after step 4).
6. Lock the phone to portrait. Turn off Automatic iOS Updates. Set Auto-Lock to Never
   (paths READ-FIRST from Apple's support pages).
7. Xcode: Settings > Apple Accounts > add his Apple Account.
8. On the finger page click **Open signing**. On target WebDriverAgentRunner >
   Signing & Capabilities: tick "Automatically manage signing", pick the Team, paste the
   Bundle Identifier the page shows (the one stored forever, decision 18).
9. Click **Start phone**. The page shows the build phase and elapsed time.
10. After the first install the page shows only: Settings > General > VPN & Device
    Management > Developer App > Trust > Allow (the phone needs internet). When he ticks it,
    finger relaunches by itself. He never presses Start twice [F#12].
11. claude.ai: add the finger connector the page shows (one paste), and choose
    "Always allow" for the finger tools so a round never stalls on a prompt [F#24].
12. On the page: type the daily cap and the daily loss limit.

Accessibility Zoom must be off [A§5]; it is off by default, so it is a self-test line with
its own message, not a step, unless the simulator run shows otherwise [P#19].

**Free or paid Apple account: he decides once, at M1, with one line.** Read so far [B§4]:
free = 7-day profiles, 3 apps per device, 10 App IDs per 7 days. Apple's page for what the
$99 account changes is READ-FIRST before that line is written [P#20]. On a free account, a
click may be needed each week; if the Trust tap repeats, finger drives it itself through
Settings (MAC-CHECK).

---

## 5. WDA: pin, build, keep alive

- **Pin:** decision 4 and 5. Repo, commit and tag are written into `src/routes.mjs` and the skill.
- **Tag change:** before building, compare the project's team setting; if empty, show step 8 [F#26].
- **Lib target:** whether `WebDriverAgentLib` signs on a free team without edits is MAC-CHECK,
  with a prepared click path if it does not [F#5].
- **Command** (composed from `lib/xcodebuild.ts:408-486` [A§1], arguments as an array):
  ```
  xcodebuild build-for-testing test-without-building
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration
    -project <WebDriverAgent.xcodeproj> -scheme WebDriverAgentRunner
    -derivedDataPath <per-UDID dir> -destination id=<UDID>
    IPHONEOS_DEPLOYMENT_TARGET=<maj.min>
    GCC_TREAT_WARNINGS_AS_ERRORS=0 COMPILER_INDEX_STORE_ENABLE=NO
  ```
  Environment: `DEVELOPER_DIR`, `USE_PORT=8100`, `MJPEG_SERVER_PORT=9100`. The UDID uses the
  letter case from `-showdestinations`. Signing comes from the project he signed.
- **Timeouts:** based on the first build measured at M3 on his i3, not assumed [F#30].
- **Restart:** only from an idle lane, after consecutive failed health checks; kill the
  xcodebuild process group, relaunch with `test-without-building`, recreate the session,
  re-apply settings. Backoff steps are set from measured launch time.
- **Exit 65:** rebuild once. **Exit 70:** stop and show the log tail [A§5].

---

## 6. Failure handling

One plain line on the page, the same code in the heartbeat.

| What happened | How finger knows | What it does | Alex sees |
|---|---|---|---|
| Cable pulled | usbmux `Detached` or Connect result 2 | Lane absent, child killed, queue failed fast; resumes on `Attached` | "iPhone 1: not plugged in" |
| WDA not started yet | Connect result 3 while xcodebuild is still building or launching | Waits, shows phase and time | "iPhone 1: starting (building, 4 min)" |
| WDA died | Idle-lane health checks fail | Restart | "iPhone 1: restarting" |
| USB path closed by iOS | xcodebuild reports the test session running and 8100 still refuses after a set time [F#17] | Stops, no hang | "This iOS blocks the USB path" + log tail |
| Phone locked | `/wda/locked` | Refuses steps | "iPhone 1: unlock it" |
| Pop-up | Alert check | Only `alert` steps allowed | "iPhone 1: pop-up: <text>" |
| Developer app untrusted / profile expired | Classified xcodebuild error (strings collected at M3) or exit 65 | One rebuild, then stop | The exact step with its path |
| Not trusted / Developer Mode off | Registry fields, or the classified error | Waits | The exact setup step |
| Xcode not ready | xcodebuild error text | Waits | "Open Xcode once and click Install" |
| Session lost | "Session does not exist" | Recreate, retry once. A buy is never retried. | nothing |
| Link unreachable | Heartbeat post fails | Lanes stay alive; expired commands dropped | "No internet to Claude" |
| Worker crash | Launcher loop | Restart; the journal prevents a re-run | Build and uptime |
| Buy outcome unknown | Reservation with no outcome row | Live buys halt on that phone. finger opens Phantom's positions/history, resolves the row itself, then resumes [P#13]. | One line after: what it found |

---

## 7. Money safety (in the Mac worker)

**Numbers on the page:** per-bet cap ($10, his largest stake), daily cap (blank until
typed; blank blocks buys), daily loss limit, consecutive-loss stop, mode (starts PAPER).
Caps are global across phones. LIVE and real balance are shown first and biggest.

**`finger_buy` is one worker-side sequence, no Claude round trip inside it [P#8]:**
1. Refuse unless: mode LIVE; UDID given; command young; stake at or under the per-bet cap;
   today's total (Athens date) plus stake at or under the daily cap; loss limits not hit;
   no UNKNOWN row open; no earlier ledger row for the same wallet + coin + round [P#14].
2. Foreground app is Phantom.
3. Enter the stake: preset chips by label if Phantom has them for $2/$5/$10; otherwise
   clear the field, type digits, read it back, refuse on mismatch [P#10, F#21]. The method
   is decided from the real tree at M4.
4. On the final confirm screen read from the tree: coin, side, stake, price, round end.
   All must equal the request, and time left must be above the set threshold [P#6].
5. Write the reservation row with what was read, not what was claimed.
6. Tap the confirm element by label/element. Budget from snapshot to tap: about 2 s; if the
   tree fetch was slower, refuse [P#8]. If confirm is a slide or hold, the guard performs it.
7. Look; write the outcome row. No outcome = UNKNOWN (section 6).

**Guarding every other gesture [P#9]:** in `finger_act`, any `tap`, `double`, `hold`,
`swipe` or coordinate tap whose point or path touches the recorded buy/confirm element is
refused. `double` on it is always refused.

**No readable confirm screen, no live mode** (decision 26). The page says exactly that.

**Biometrics:** M4 records whether Phantom asks for Face ID or a PIN at open and at
confirm. finger never satisfies either. If it does ask, live trading is not unattended, and
Alex is told before the trading layer is built [F#20].

**Wallet balance:** read from the screen before each round and reconciled to the ledger.
An unexplained difference halts live mode [P#12]. No daily chore for Alex.

**Paper never touches the wallet [P#11]:** through calibration and all paper running the
spare wallet's prediction balance is zero, and paper rounds stop at the market screen;
the stake screen is opened read-only once, with zero balance, to record it. Money goes in
only for the first $2 bet.

**First real bet [P#16]:** $2, Alex watching. It is done only when finger has read the
fill, the settlement and the payout from Phantom and the balance matches the ledger. Only
then may live mode run on its own.

**Secrets:** finger never types or stores a seed phrase, passcode or PIN. `type` inside
Phantom accepts digits and a decimal point only.

**Scope:** rules 18, 20 and 22 are untouched. finger does not reach shop checkouts,
processors or ad spend.

---

## 8. Files

```
tools/finger/
  BUILD  .keys.json  pack.sh  PLAN.md
  app/finger.app/Contents/Info.plist
  app/finger.app/Contents/MacOS/finger     launcher: install rule, bundled Node, restart loop, open page
  app/finger.app/Contents/Resources/node   Node x64 binary
  src/main.mjs        loops, pidfile
  src/plist.mjs       XML plist subset
  src/usbmux.mjs      frame codec, ListDevices, Listen, Connect, HTTP over Connect
  src/devices.mjs     UDID registry, stored aliases, devicectl/xcdevice join
  src/lane.mjs        per-UDID state machine, serial queue, idle health check
  src/routes.mjs      route table; each entry cites file:line in the pinned commit
  src/wda-client.mjs  routes, session, envelope errors, per-route timeouts
  src/wda-runner.mjs  xcodebuild supervisor, output capture, error classes, build lock
  src/provision.mjs   reads profile expiry from embedded.mobileprovision
  src/screen.mjs      /screenshot, magic-byte sniff, lookId, fingerprint, X/Y mapping
  src/tree.mjs        source JSON to text; label to point
  src/actions.mjs     step executor
  src/buy.mjs  src/guard.mjs  src/ledger.mjs  src/journal.mjs
  src/link.mjs        take, result retry, heartbeat
  src/ui.mjs  ui/index.html
  src/probe.mjs  src/selftest.mjs
  profiles/phantom.json       filled from real screens at M4
  link/worker.mjs  link/wrangler.toml      finger-link
  test/fake-usbmuxd.mjs  test/fake-wda.mjs  test/fake-xcodebuild.mjs  test/*.test.mjs  test/e2e.mjs
.github/workflows/finger-mac.yml           macOS runner jobs (section 9)
.claude/skills/finger/SKILL.md
```

---

## 9. Test plan: three places, said in these words

**A. Proven in this Linux container (Node 22)**
- plist round trip; frame codec with split and coalesced frames, tag echo, 8100 to 42015.
- Fake usbmuxd: USB/Network duplicate, attach/detach at tag 0, Connect results 0/2/3, raw passthrough.
- Fake WDA built from the pinned commit's routes: method, path, body keys, session-only
  routes, session kill on new session, envelope and error shapes, `noAlertOpen`, and
  **answering serially** like the real one [F#2].
- Lane: WDA death mid-command, session loss, lock, alert, cable pull, two phones at once,
  alias survives a replug in swapped order, no health-check kill during a slow `/source`.
- Runner against a fake xcodebuild: stays alive, exit 65, exit 70, hangs, slow build, build lock.
- Guard and buy, every branch: each cap, blank cap, paper mode, wrong app, duplicate
  wallet+coin+round, any confirm-screen field mismatch, stake read-back mismatch, slow
  tree, low time left, stale command, alias instead of UDID, every gesture across the
  confirm element, kill at every line of the buy path, UNKNOWN halts, balance mismatch
  halts, Athens midnight.
- Screen: magic bytes, X/Y ratio refusal, fingerprint refusal, stale look refusal.
- Link run locally: MCP initialize/list/call, per-UDID queue, lifetime, stale-heartbeat
  refusal, result retry, late result, image round trip.
- Registry fixtures, labelled as from Flutter's comments until his real JSON replaces them.
- `pack.sh`: tests gate the zip; unzip under a path with a space; exec bits; plist parses;
  byte compare; import audit; banned-string grep across the whole bundle including launcher
  and plist: gmgn, depop, cursor, approve/approval-card strings, self-update and
  remote-flag strings, the other apps' start URLs. Every hit is read by a person [P#25].

**B. Proven on a hosted macOS runner, before any zip reaches Alex [P#2, P#3]**
(Which Intel macOS runner label GitHub offers today is READ-FIRST from GitHub's docs. If
none exists, an Apple-silicon runner proves everything except the x64 binary, and that is
said in writing.)
- First launch from the zip itself, in a path with a space: the real launcher runs, the
  page answers, the heartbeat reaches finger-link with the build number.
- The pinned WDA built for an iOS Simulator; self-test steps 6 to 12 against the real WDA
  over localhost: routes, session, tree, tap, type, screenshot bytes, coordinates, alerts.
  (Simulator build flags READ-FIRST from the pinned `lib/xcodebuild.ts`.)

**C. Proven only on his Mac with the iPhone (self-test, one line per step)**
usbmux on his iOS, signing with his Apple account, the real phone, and Phantom's screens.
1. Build number shown; Mac, macOS, Xcode read; bundled Node runs.
2. `/var/run/usbmuxd` answers; phone listed.
3. Real devicectl / xcdevice JSON matches the parser (raw capture saved).
4. Xcode ready; xcodebuild builds and signs; duration, exit code, any keychain prompt recorded.
5. Connect to 8100 succeeds.
6. `/status` ready; bundle id and iOS match.
7. Session created; settings applied.
8. `/screenshot` bytes and format; size against the limits.
9. Coordinate check: tap a known Settings row by coordinate; the tree confirms it.
10. Tree fetch time on the home screen, with a pass limit [P#22].
11. Type into search; home; open and close an app.
12. Lock detection; Zoom-off check.
13. Unplug and replug: lane returns to READY alone, alias unchanged.
14. Kill WDA: idle health check brings it back with no rebuild.
15. Link round trip from Claude with an image.

---

## 10. Milestones

| M | What | Proof |
|---|---|---|
| M0 | Gate zero (section 0). His one-line answers (section 12). Skill files. WDA repo+commit pinned; route table re-derived with citations; READ-FIRST list read and cited. Go-live gate numbers put to him as one yes/no. | Inspector signs each route against file:line. No code if gate zero fails. |
| M1 | Launcher, page, probe, finger-link deployed (`--config`, dry-run read first, output says "Uploaded finger-link"). | Runner job B green. Then Alex double-clicks; `finger_status` shows his Mac, macOS, Xcode, iPhone iOS, build. Free/paid line given. |
| M2 | usbmux, WDA client, lanes, steps, tree look, `/screenshot`, guard core and ledger. | All of A green with two fake phones; simulator job in B green. |
| M3 | Runner, signing flow, setup page on his Mac. | Self-test 1 to 15. Claude receives his real home screen. Error strings and build time recorded. |
| M4 | Phantom, read-only, zero balance. | Saved trees and images of the market, charts, stake and confirm screens. Answers: which market and round length; opens in Greece; fee, minimum stake, early sell; tree readable; screenshots not blanked; Face ID/PIN prompts; stake entry method; tree latency on the chart. `profiles/phantom.json` filled. Decision 26 answered yes or no. |
| M5 | `finger_buy` against the real profile; paper scoring off the phone. | Guard tests green with the real profile; on his Mac a buy over the cap is refused; paper log running. |
| M6 | First $2 bet, Alex watching. | Fill, settlement, payout read from Phantom; balance matches ledger. |
| M7 | Live inside his numbers, BTC then SOL then ETH. | One line per round. |
| M8 | Second iPhone when he has it; MJPEG; start-at-login; keep-awake; profile-expiry handling across one real expiry; 24-hour soak. | Each named mechanism READ-FIRST (man page or Apple doc); login-item prompt click added to setup [F#19]. |

Lanes are per-UDID from M2 and proven with two fake phones; the real second phone is
proven when he plugs it in.

---

## 11. Trading layer

Nothing here is coded until M4 has answered what Phantom actually shows on his phone.

- **What the repo already knows** (`.claude/skills/up-or-down/SKILL.md`): Phantom's markets
  are recorded as Kalshi 15-minute series; no 5-minute Kalshi series exists; a backtest of
  1,434 real 5-minute BTC rounds had momentum, reversal, trend and always-up all losing
  after the fee. So the gate below is the real money protection.
- **Reading a round:** BTC, then SOL, then ETH. Numbers from the tree: time left, price to
  beat, current price, Up/Down prices. His order of charts (1 hour, 15 minute, 5 minute,
  live) is followed with an image only where the tree lacks the numbers.
- **Paper:** prediction and scoring run from the market's public API with no phone and no
  images (decision 29). `/grok/brief` is Polymarket's price and only a second signal [C§5.13].
- **Deciding:** the prediction (side, confidence, features) is journaled before any buy.
  A bet at price p pays only if the hit rate is above p plus the fee. No measured edge on a
  coin: skip it. Time left under the threshold: skip it.
- **Go-live gate, fixed as numbers before M5 and written into the skill** [F#28, P#17]:
  minimum paper rounds per coin; hit rate above price plus fee by a stated margin; the
  levels that unlock $5 and $10. Alex gets it once as a single yes/no. Until he answers,
  the numbers are unset and live mode cannot be switched on.
- **Stake:** $2, $5 or $10 only. $2 until the gate unlocks more.
- **Cash-out:** hold to settlement. Early sell only if M4 shows Phantom offers it, with
  rules he gives as numbers.
- **Log:** one row per coin per round: Athens time, market, prices seen, prediction,
  confidence, stake or skip, fill, result, profit or loss, running hit rate.
- **Usage:** Claude calls per round are measured in paper and reported before live.

---

## 12. Earlier rules this touches (put to Alex in one line each; nothing assumed)

1. **Rule 31** says all trading is from Aquarius. His request today asks for Phantom on the
   iPhone. Latest instruction wins for finger, but that is a reading, so he is told:
   "finger trades in Phantom on the iPhone; everything else stays on Aquarius. Yes?" [F#29]
2. **up-or-down skill** (today) says real money only through Kalshi's API and that Phantom's
   in-wallet bets cannot be placed by an outside app. finger is the answer to that gap. On
   his yes, that skill is amended and dated at M0 so the two do not contradict [P#5].

---

## 13. Read off his Mac / unproven until then

| # | Item | Where |
|---|---|---|
| 1 | Spare iPhone's iOS version; the Mac is still the 2020 Intel Air on Sequoia; exact macOS and Xcode versions | Gate zero question, confirmed by the M1 probe |
| 2 | Xcode.app location, licence accepted, iOS platform installed | M1 probe |
| 3 | Real devicectl / xcdevice JSON and `-showdestinations` output | M1 raw capture |
| 4 | Unsigned app first-open on his Sequoia; worker alive with no Terminal | Runner job B, then M1 |
| 5 | Free-account signing after the Xcode clicks; Lib target; keychain prompt; first build time on the i3 | M3 |
| 6 | Real xcodebuild error strings for untrusted app, locked phone, Developer Mode off, expired profile | M3 |
| 7 | Port 8100 over plain usbmux on his iOS (Appium calls the path a temporary fallback [B§2]) | Self-test 5 |
| 8 | `/screenshot` bytes; coordinate mapping; tree latency | Self-test 8 to 10 |
| 9 | Xcode + WDA unaffected by the EU mirroring block (an inference, no source states it [B§5]) | M3 |
| 10 | Phantom: tree readable, screenshots not blanked, biometrics, market type, region, stake entry | M4 |
| 11 | Whether a rebuild renews the profile early; whether Trust repeats each week | M8, across one real expiry |
| 12 | WDA monorepo commit matches the routes cited from the old repo | M0 re-derivation |

**READ-FIRST list (docs, before the line is written):** Apple Tahoe and Xcode support pages
(re-read and quote); Gatekeeper first-open on Sequoia; `man xcode-select`; Enabling
Developer Mode; Auto-Lock, portrait lock and Automatic Updates paths; Apple's free vs paid
membership page; Node download for darwin-x64; GitHub's macOS runner labels; Cloudflare
Durable Object long-poll and Worker body limits; MCP result size; claude.ai image and
tool-timeout handling and "Always allow"; the pinned WDA's `FBSettings.m`,
`FBConfiguration.m`, `FBAlertViewCommands.m`, `FBWebServer.m` and `lib/xcodebuild.ts`.

Not used unless read first: W3C action `duration`, `pressButton` names past line 70,
command-line bundle-id override, `devicectl` launch, `xctrace`.

---

## 14. Team

- **Coder.** Writes fresh code on the feature branch. No file copied from another app
  (rule 6). Every external call carries a comment with its source file:line or URL.
- **Inspector.** Reads the diff against the pinned sources, not the plan. Rejects any
  route, body key, flag or plist key without a citation in the pinned commit; anything
  carried over from ultracursor or organic; approval cards; remote fetches; Terminal text;
  a second bundle id; a health check outside the lane.
- **Mistake-hunter.** Runs all of A and `pack.sh`, owns the macOS runner jobs in B, then
  attacks; every break becomes a test. Protocol: split frames, slow WDA, WDA returning
  HTML, replug mid-request, stale session, two phones swapped. Money: double delivery, kill
  at every line of the buy path, cap bypass by any gesture, wrong coin/side on the confirm
  screen, Athens midnight. Packaging: first launch from the zip in a path with a space.
- **Gate.** Coder done, inspector signs, hunter signs with A and B green, Alexander C2O
  checks; only then a zip or "works" reaches Alex, with what is still unproven named in
  writing: usbmux on his iOS, signing, and Phantom's tree.

## The one unproven assumption to name to Alex in writing

Whether Phantom on his phone shows finger readable text and tappable buttons on the bet and
confirm screens. M4 answers it with zero balance in the wallet, before any money moves. If
the answer is no, finger still works his iPhone, but it does not place live bets.
