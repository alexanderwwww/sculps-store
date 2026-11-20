# finger: sources

Every route, body key, flag, plist key and path in finger that belongs to software we did not
write is listed here with the place it was read. Nothing is from memory. Where a source could
not be pinned to a commit, that is said.

## 1. WebDriverAgent (the pin)

- Repo: https://github.com/appium/appium-ios, folder `packages/webdriveragent`
- Commit: `a20438d81ea63ce3f985497fd0759295a7ddf58c` (main, 2026-11-20)
- Version: appium-webdriveragent 17.0.12 (`package.json`), CHANGELOG entry dated 2026-11-18
- Deployment target in the Xcode project: iOS 15.0 (`WebDriverAgent.xcodeproj/project.pbxproj:5634`),
  so iOS 17 and up is inside it.
- NOT settled by reading: whether this version builds with the Xcode 16.x on his Mac. The
  package has no Xcode support table in this commit; the 17.0.0 breaking note (CHANGELOG.md:94-98)
  is about Node and Appium only. That is a Mac check (STATUS.md). If it does not build, the
  fallback is an older tag, and this table is re-derived for it.

Paths below are under `packages/webdriveragent/WebDriverAgentLib/`.

### Routes used (src/routes.mjs)

| finger name | Method and path | Session | Route line | Handler lines | Body / query keys read by the handler |
|---|---|---|---|---|---|
| status | GET /status | none | Commands/FBSessionCommands.m:52 | :173-229 | reply has `ready` (:208). Declared `.standalone` (see Protocol facts) |
| newSession | POST /session | none | Commands/FBSessionCommands.m:44 | :91-127 | `capabilities` must be a dictionary (:266-268); `alwaysMatch` / `firstMatch` (Utilities/FBProtocolHelpers.m:18-19,121-123); reply `sessionId` (:446-453) |
| settings | POST /appium/settings | required | Commands/FBSessionCommands.m:59 | :244-256 | `settings` dictionary (:246-250) |
| source | GET /source | either | Commands/FBDebugCommands.m:26-27 | :40-72 | query `format`, value `json` (:37,44,55) |
| screenshot | GET /screenshot | either | Commands/FBScreenshotCommands.m:21-22 | :29-38 | reply is base64 (:36). Declared `.standalone` on both lines |
| windowSize | GET /window/size | either | Commands/FBElementCommands.m:61,63 | :572-586 | reply `width`, `height` (:582-585) |
| activeApp | GET /wda/activeAppInfo | either | Commands/FBCustomCommands.m:60-61 | :257-269 | reply `bundleId` (:265) |
| locked | GET /wda/locked | either | Commands/FBCustomCommands.m:54-55 | :242-246 | reply is a boolean |
| alertText | GET /alert/text | either | Commands/FBAlertViewCommands.m:24-25 | :38-47 | no alert = `noAlertOpen` error (:42-44) |
| alertAccept | POST /alert/accept | either | Commands/FBAlertViewCommands.m:27-28 | :65-77 | optional `name` (:68): with a name, the button with that label is pressed, whatever it is (`clickAlertButton:`, :71-72, FBAlert.m:342-354) |
| alertDismiss | POST /alert/dismiss | either | Commands/FBAlertViewCommands.m:29-30 | :79-91 | optional `name` (:82): with a name this presses that button too (:85-86), so inside the wallet finger sends neither accept nor a name |
| tap | POST /wda/tap | required | Commands/FBElementCommands.m:123 | :501-511 | `x`, `y`, both or neither (:763-779) |
| doubleTap | POST /wda/doubleTap | required | Commands/FBElementCommands.m:95 | :306-316 | `x`, `y` |
| touchAndHold | POST /wda/touchAndHold | required | Commands/FBElementCommands.m:106 | :337-347 | `x`, `y`, `duration` in seconds (:345) |
| drag | POST /wda/dragfromtoforduration | required | Commands/FBElementCommands.m:114 | :449-477 | `fromX`, `fromY`, `toX`, `toY` (:453-456). `duration` (:464) is NOT the swipe time: it is how long the finger presses before the drag starts (`fb_pressAtCoordinate:forDuration:thenDragToCoordinate:`, :468-472; parameter `pressDuration`, Categories/XCUIApplication+FBTouchAction.m:118-129). The drag speed is fixed at `XCUIGestureVelocityDefault` (:471). finger's step field is `holdBefore`, default 0. Whether this route can do a slide-to-confirm is unmeasured. |
| keys | POST /wda/keys | required | Commands/FBElementCommands.m:127 | :553-570 | `value`, an array joined into one string (:555) |
| pressButton | POST /wda/pressButton | required | Commands/FBCustomCommands.m:69 | :346-355 | `name` (:349) |
| homescreen | POST /wda/homescreen | none | Commands/FBCustomCommands.m:47 | :121-129 | none |
| appActivate | POST /wda/apps/activate | required | Commands/FBSessionCommands.m:46 | :139-143 | `bundleId` (:141) |
| appTerminate | POST /wda/apps/terminate | required | Commands/FBSessionCommands.m:47 | :145-149 | `bundleId`; reply is a boolean (:147-148) |

Not used, on purpose: `/wda/unlock` (finger never unlocks a phone), `/wda/swipe` (direction only),
`/wda/apps/launch`, element routes, W3C actions.

### Protocol facts

| Fact | Where |
|---|---|
| A route needs `/session/<id>` in front unless declared `.withoutSession` | Routing/FBRoute.m:29,106-122,153-169 |
| A missing or wrong session raises "Session does not exist" | Routing/FBRoute.m:171-173, Routing/FBSession.m:227-235, Routing/FBHTTPServer.m:741-746 |
| Reply envelope `{sessionId, value}`; an error is `value = {error, message, traceback}` | Routing/FBResponsePayload.m:139-154 |
| Error names: `no such alert` (:39), `invalid session id` (:75), `unknown command` (:63), `invalid argument` (:27), `unknown error` (:11) | Routing/FBCommandStatus.m |
| HTTP codes for them: 404, 404, 404, 400, 500 | Routing/FBCommandStatus.m:40,76,64,28,12 |
| Unknown paths answer `unknown command` | Commands/FBUnknownCommands.m:26-29 |
| A no-alert exception becomes the `no such alert` error | Routing/FBExceptionHandler.m:55 |
| Routes are answered on the main queue, one at a time | Routing/FBWebServer.m:80 |
| EXCEPT routes declared `.standalone`: they skip that queue, "so a handler stuck on that queue can never block" them, and run in parallel with it | Routing/FBRoute.m:130-134, Routing/FBHTTPServer.h:58-62, Routing/FBHTTPServer.m:687, Routing/FBWebServer.m:239 |
| Of finger's routes, `GET /status` and `GET /screenshot` are standalone. So `/status` answering proves only that the WDA process is alive; `GET /wda/locked` (main queue) proves commands get through. The lane's health check asks both (src/lane.mjs). | Commands/FBSessionCommands.m:52, Commands/FBScreenshotCommands.m:21-22, Commands/FBCustomCommands.m:54-55 |
| Creating a session kills the previous one | Commands/FBSessionCommands.m:93 |
| Creating a session resets session settings | Commands/FBSessionCommands.m:281 |
| Setting name `screenshotQuality` | Utilities/FBSettings.m:17, Utilities/FBSettingsHandler.m:71 |
| `screenshotQuality`: 0 PNG, 1 and 2 JPEG, 3 HEIC; default 3 | Utilities/FBConfiguration.h:114-120, Utilities/FBScreenshot.m:48-57, Utilities/FBConfiguration.m:347 |
| Button names on an iPhone: `home`, `volumeup`, `volumedown` (others depend on the model) | Categories/XCUIDevice+FBHelpers.m:67-88 |
| Tree JSON keys `type`, `name`, `value`, `label`, `rect`, `children` | Categories/XCUIApplication+FBHelpers.m:239-245,276-279 |
| Tree JSON also carries `isVisible` and `isEnabled`, as the strings `"1"` / `"0"` (`[@(BOOL) stringValue]`), present unless asked to be left out with `excluded_attributes`, which finger never sends | Categories/XCUIApplication+FBHelpers.m:45-46,57-62,259-266,302-307; Commands/FBDebugCommands.m:55-61 |
| `rect` keys `x`, `y`, `width`, `height` | Categories/XCUIElement+FBWebDriverAttributes.m:287-290 |
| Defaults `waitForIdleTimeout` 10 s, `animationCoolOffTimeout` 2 s (not changed by finger; to be measured on Phantom's chart) | Utilities/FBConfiguration.m:353-354 |
| Setting names `waitForIdleTimeout`, `animationCoolOffTimeout`, `respectSystemAlerts`; set through `/appium/settings` | Utilities/FBSettings.m:32,33,36; Utilities/FBSettingsHandler.m:94-97,142-149 |
| `respectSystemAlerts` is off unless set (no default assigned in FBConfiguration.m); when on, the alert routes look at system pop-ups first | Utilities/FBConfiguration.h:71, Routing/FBSession.m:371-374 |

### What a tap waits on (traced, PLAN section 2)

1. `POST /wda/tap` runs `handleTap:`, which calls `[target tap]` on an `XCUICoordinate`
   (Commands/FBElementCommands.m:501-511; the coordinate is built at :763-779). An `invalid
   argument` answer is returned BEFORE the tap (:503-508).
2. `tap` is XCTest's own (closed source). Before it sends the touch it waits for the app to
   go idle. WDA replaces that wait (`+load`, Categories/XCUIApplicationProcess+FBQuiescence.m:60-73)
   with one bounded by `waitForIdleTimeout` (:22-36 and :38-54): 10 s by default
   (Utilities/FBConfiguration.m:353). A timeout under `DBL_EPSILON` skips the wait (:25).
3. So one tap can be held up to 10 s on a screen that never goes idle, and it then lands on
   whatever is showing by then. finger's answers: `finger_act` refuses, from fixed recorded
   points, any touch on the wallet's buy/confirm area whatever the tree said (src/guard.mjs);
   the confirm tap of `finger_buy` gets only what is left of its 2 s budget and is UNKNOWN
   if it takes longer (src/buy.mjs).
4. NOT decided: lowering `waitForIdleTimeout` for the wallet. It needs the wait measured on
   Phantom's chart screen at M4.

`/source?format=json`: `fb_tree:` takes one standard snapshot
(Categories/XCUIApplication+FBHelpers.m:220-225 -> Categories/XCUIElement+FBUtilities.m:90-109,
`snapshotWithError:`, XCTest's own). What XCTest waits on inside that call is NOT traced
(closed source); it is measured at M3 (self-test step 10). The per-route timeouts in
`src/routes.mjs` are finger's own starting numbers, not from the source.

## 2. usbmux

- go-ios: https://github.com/danielpaulus/go-ios at `ce32daee2115b3d25eebb1f23cfa892df0e82503`
- usbmuxd: https://github.com/libimobiledevice/usbmuxd at `e0216f30e1d34812354ee0cd6e91711bbf704bbe`
  (`src/usbmuxd-proto.h`, `src/client.c`). This is the open-source daemon; the usbmuxd on his
  Mac is Apple's own and closed, so these lines describe the protocol, not his machine.
- libusbmuxd.c: a loose copy of libimobiledevice's client library read during research,
  **commit not recorded**. Used for one fact only (which reply message types it reads as a plist).

| Fact | Where |
|---|---|
| Socket `/var/run/usbmuxd` | go-ios ios/usbmuxconnection.go:54; usbmuxd src/usbmuxd-proto.h:32 |
| Header: uint32 length, version, request, tag, little-endian; length includes the 16-byte header; version 1; request 8 | go-ios ios/usbmuxconnection.go:100-104,130,164 |
| Message keys `MessageType`, `ProgName`, `ClientVersionString` on every message | go-ios ios/listdevices.go:13-17, ios/connect.go:17-25, ios/listen.go:11-17 |
| `kLibUSBMuxVersion` (3) is sent on `Connect` only. go-ios's ListDevices message has no such field, and its Listen field is unexported, so it is never written. finger does the same. | go-ios ios/connect.go:23,34; ios/listdevices.go:13-17; ios/listen.go:16 |
| `ListDevices`; reply `DeviceList` of `{DeviceID, MessageType, Properties}` | go-ios ios/listdevices.go:19-30,52-57,81 |
| `Properties`: `ConnectionType`, `DeviceID`, `SerialNumber` (the UDID) | go-ios ios/listdevices.go:66-74,88-91 |
| `Listen`; then `Attached` / `Detached` messages with `DeviceID` | go-ios ios/listen.go:19-26,42,47,53 |
| `Connect` with `DeviceID` and `PortNumber` | go-ios ios/connect.go:19-36 |
| `PortNumber` is the port with its two bytes swapped (8100 becomes 42015) | go-ios ios/connect.go:45, ios/utils.go:97-105 |
| Reply `{MessageType: "Result", Number}`; 0 is success | go-ios ios/usbmuxresponse.go:11-14, ios/connect.go:51-55 |
| Result numbers 0 ok, 1 bad command, 2 bad device, 3 connection refused | usbmuxd src/usbmuxd-proto.h:39-43 |
| The reply carries the request's tag; `Listen` is answered with its Result before any notification | usbmuxd src/client.c:692 (Listen), :734 (connect tag kept) |
| A reply is read as a plist only when its header says message type 8; the header's version is not checked by either reference client, so finger checks the type and not the version | libusbmuxd.c:436,586 (no commit, see above); go-ios ios/usbmuxconnection.go:139-150 |

Notifications arriving with tag 0 is from the research notes (PLAN section 2, [B§1]); finger
does not depend on the tag of a notification, only on the reply to its own request carrying
its own tag. A notification that arrived BEFORE the Listen result would be refused as a tag
error; the open-source daemon sends the result first (client.c:692), Apple's is unread.

## 3. Xcode on the Mac (src/probe.mjs)

appium-ios at the same commit as section 1, folder `packages/xcode/lib`:

| Fact | Where |
|---|---|
| `xcode-select --print-path` gives `<Xcode.app>/Contents/Developer` | xcode.ts:39,49 |
| Xcode's `Info.plist` is one folder above that | helpers.ts:74-77 |
| `CFBundleIdentifier` is `com.apple.dt.Xcode`; `CFBundleShortVersionString` is the version | xcode.ts:12,55-56,236 |

## 4. finger-link

| Fact | Where |
|---|---|
| MCP over HTTP: one POST per JSON-RPC message, reply `application/json`; GET may answer 405; a notification is answered 202 | modelcontextprotocol/modelcontextprotocol at `bbc31f8ded5762eae4df115b93942f5e71c8b3a7`, docs/specification/2025-06-18/basic/transports.mdx:88-99,127,212 |
| `initialize` reply: `protocolVersion`, `capabilities`, `serverInfo`; `notifications/initialized` | same commit, basic/lifecycle.mdx:59-113 |
| `tools/list` entries have `inputSchema`; `tools/call` reply has `content` and `isError`; image content is `{type, data, mimeType}` | same commit, server/tools.mdx:85,135,187,225-227,424 |
| wrangler keys `durable_objects.bindings`, `migrations[].tag`, `migrations[].new_sqlite_classes` | wrangler 4.130.0 installed in this repo, node_modules/wrangler/config-schema.json:3567-3590 |
| `ctx.storage.sql.exec(query, ...params).toArray()`, `env.<binding>.idFromName()`, `.get(id).fetch()`, `DurableObject` from `cloudflare:workers` | not cited from a document: **run** in local workerd 1.20260908.1 through `wrangler dev` (`npm run check:workerd`), which passes |

| A SQLite Durable Object allows 8 MB for a "string, BLOB or table row"; one finger-link result is one string | developers.cloudflare.com/durable-objects/platform/limits/ (read 2026-11-20, the "SQL" table). Run in local workerd: a 9 MB result is answered with a small `RESULT_TOO_BIG` result, a 3.5 MB one is kept (`npm run check:workerd`) |

finger's own numbers on top of that: a result is at most 4 MB (link/core.mjs and src/link.mjs,
`MAX_RESULT_BYTES`), a picture at most 2 MB before base64, a tree at most 500 lines and 64 KB
(src/actions.mjs `LIMITS`). They are starting numbers, not read from anywhere.

Not read yet: Cloudflare's limits for Worker request body size and Durable Object long-poll;
MCP result size and claude.ai's image and time limits (PLAN section 3), which may be smaller
than the numbers above. The 25 s wait and 500 ms poll are finger's own starting numbers.

## 5. The app bundle (app/finger.app)

| Fact | Where |
|---|---|
| `LSUIElement`: "an agent app that runs in the background and doesn't appear in the Dock" | developer.apple.com/documentation/bundleresources/information-property-list/lsuielement (read 2026-11-20) |
| `CFBundleExecutable`: "The name of the bundle's executable file" | developer.apple.com/documentation/bundleresources/information-property-list/cfbundleexecutable (read 2026-11-20) |
| `CFBundlePackageType`: "The type of bundle" (`APPL` is the value the apps already shipped from this repo use: tools/plug/app/Plug.app/Contents/Info.plist) | developer.apple.com/documentation/bundleresources/information-property-list/cfbundlepackagetype |
| `CFBundleName`: "A user-visible short name for the bundle." | developer.apple.com/documentation/bundleresources/information-property-list/cfbundlename (read 2026-11-20) |
| `CFBundleIdentifier`: "A unique identifier for a bundle." | developer.apple.com/documentation/bundleresources/information-property-list/cfbundleidentifier (read 2026-11-20) |
| `CFBundleShortVersionString`: "The release or version number of the bundle." | developer.apple.com/documentation/bundleresources/information-property-list/cfbundleshortversionstring (read 2026-11-20) |
| `CFBundleVersion`: "The version of the build that identifies an iteration of the bundle." | developer.apple.com/documentation/bundleresources/information-property-list/cfbundleversion (read 2026-11-20) |
| `open "<url>"` opens the page in his browser | used by the launchers already running on his Mac: tools/kcal/app/kcal.app/Contents/MacOS/kcal:61 |

Not read yet (so not written): Gatekeeper first-open clicks on Sequoia, the Node darwin-x64
download, `man xcode-select` for `DEVELOPER_DIR`, GitHub's macOS runner labels, the pinned
`lib/xcodebuild.ts` (needed for the runner at M3).

## 6. The wallet (profiles/phantom.json)

| Fact | Where |
|---|---|
| Phantom's iOS bundle id is `app.phantom` | App Store lookup `https://itunes.apple.com/lookup?bundleId=app.phantom&country=us`, read 2026-11-20: one result, trackId 1598432977, "Phantom: Trading Wallet", seller "Phantom Technologies Incorporated", minimum iOS 16.4 |

UNPROVEN until his phone: that `/wda/activeAppInfo` reports exactly this id with Phantom in
front (M4 reads it before anything else). Everything else about Phantom (labels, screens,
whether it confirms with a button, a slide, a pop-up or Face ID) is unread.
