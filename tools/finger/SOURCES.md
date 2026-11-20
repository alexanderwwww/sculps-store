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
| status | GET /status | none | Commands/FBSessionCommands.m:52 | :173-229 | reply has `ready` (:208) |
| newSession | POST /session | none | Commands/FBSessionCommands.m:44 | :91-127 | `capabilities` must be a dictionary (:266-268); `alwaysMatch` / `firstMatch` (Utilities/FBProtocolHelpers.m:18-19,121-123); reply `sessionId` (:446-453) |
| settings | POST /appium/settings | required | Commands/FBSessionCommands.m:59 | :244-256 | `settings` dictionary (:246-250) |
| source | GET /source | either | Commands/FBDebugCommands.m:26-27 | :40-72 | query `format`, value `json` (:37,44,55) |
| screenshot | GET /screenshot | either | Commands/FBScreenshotCommands.m:21-22 | :29-38 | reply is base64 (:36) |
| windowSize | GET /window/size | either | Commands/FBElementCommands.m:61,63 | :572-586 | reply `width`, `height` (:582-585) |
| activeApp | GET /wda/activeAppInfo | either | Commands/FBCustomCommands.m:60-61 | :257-269 | reply `bundleId` (:265) |
| locked | GET /wda/locked | either | Commands/FBCustomCommands.m:54-55 | :242-246 | reply is a boolean |
| alertText | GET /alert/text | either | Commands/FBAlertViewCommands.m:24-25 | :38-47 | no alert = `noAlertOpen` error (:42-44) |
| alertAccept | POST /alert/accept | either | Commands/FBAlertViewCommands.m:27-28 | :65-77 | optional `name` (:68) |
| alertDismiss | POST /alert/dismiss | either | Commands/FBAlertViewCommands.m:29-30 | :79-91 | optional `name` (:82) |
| tap | POST /wda/tap | required | Commands/FBElementCommands.m:123 | :501-511 | `x`, `y`, both or neither (:763-779) |
| doubleTap | POST /wda/doubleTap | required | Commands/FBElementCommands.m:95 | :306-316 | `x`, `y` |
| touchAndHold | POST /wda/touchAndHold | required | Commands/FBElementCommands.m:106 | :337-347 | `x`, `y`, `duration` in seconds (:345) |
| drag | POST /wda/dragfromtoforduration | required | Commands/FBElementCommands.m:114 | :449-477 | `fromX`, `fromY`, `toX`, `toY`, `duration` (:453-464) |
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
| Every route is answered on the main queue (one at a time) | Routing/FBWebServer.m:80 |
| Creating a session kills the previous one | Commands/FBSessionCommands.m:93 |
| Creating a session resets session settings | Commands/FBSessionCommands.m:281 |
| Setting name `screenshotQuality` | Utilities/FBSettings.m:17, Utilities/FBSettingsHandler.m:71 |
| `screenshotQuality`: 0 PNG, 1 and 2 JPEG, 3 HEIC; default 3 | Utilities/FBConfiguration.h:114-120, Utilities/FBScreenshot.m:48-57, Utilities/FBConfiguration.m:347 |
| Button names on an iPhone: `home`, `volumeup`, `volumedown` (others depend on the model) | Categories/XCUIDevice+FBHelpers.m:67-88 |
| Tree JSON keys `type`, `name`, `value`, `label`, `rect`, `children` | Categories/XCUIApplication+FBHelpers.m:239-245,276-279 |
| `rect` keys `x`, `y`, `width`, `height` | Categories/XCUIElement+FBWebDriverAttributes.m:287-290 |
| Defaults `waitForIdleTimeout` 10 s, `animationCoolOffTimeout` 2 s (not changed by finger; to be measured on Phantom's chart) | Utilities/FBConfiguration.m:353-354 |

Not yet traced: what `/wda/tap` and `/source` wait on before answering (PLAN section 2). The
per-route timeouts in `src/routes.mjs` are finger's own starting numbers, not from the source.

## 2. usbmux

- go-ios: https://github.com/danielpaulus/go-ios at `ce32daee2115b3d25eebb1f23cfa892df0e82503`
- usbmuxd-proto.h: libimobiledevice usbmuxd, `src/usbmuxd-proto.h`. The copy read was saved
  during research without its commit; **commit not recorded**. Only the result numbers and the
  socket path come from it, and go-ios agrees on the socket path.

| Fact | Where |
|---|---|
| Socket `/var/run/usbmuxd` | go-ios ios/usbmuxconnection.go:54; usbmuxd-proto.h:32 |
| Header: uint32 length, version, request, tag, little-endian; length includes the 16-byte header; version 1; request 8 | go-ios ios/usbmuxconnection.go:100-104,130,164 |
| Message keys `MessageType`, `ProgName`, `ClientVersionString`, `kLibUSBMuxVersion` | go-ios ios/listdevices.go:13-16, ios/connect.go:19-23, ios/listen.go:12-16 |
| `ListDevices`; reply `DeviceList` of `{DeviceID, MessageType, Properties}` | go-ios ios/listdevices.go:19-30,52-57,81 |
| `Properties`: `ConnectionType`, `DeviceID`, `SerialNumber` (the UDID) | go-ios ios/listdevices.go:66-74,88-91 |
| `Listen`; then `Attached` / `Detached` messages with `DeviceID` | go-ios ios/listen.go:19-26,42,47,53 |
| `Connect` with `DeviceID` and `PortNumber` | go-ios ios/connect.go:19-36 |
| `PortNumber` is the port with its two bytes swapped (8100 becomes 42015) | go-ios ios/connect.go:45, ios/utils.go:97-105 |
| Reply `{MessageType: "Result", Number}`; 0 is success | go-ios ios/usbmuxresponse.go:11-14, ios/connect.go:51-55 |
| Result numbers 0 ok, 1 bad command, 2 bad device, 3 connection refused | usbmuxd-proto.h:39-43 |

Notifications arriving with tag 0 is from the research notes (PLAN section 2, [B§1]); finger
does not depend on the tag of a notification, only on the reply to its own request carrying
its own tag.

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

Not read yet: Cloudflare's limits for Worker body size and Durable Object long-poll; MCP result
size and claude.ai's image and time limits (PLAN section 3). The 25 s wait and 500 ms poll are
finger's own starting numbers.

## 5. The app bundle (app/finger.app)

| Fact | Where |
|---|---|
| `LSUIElement`: "an agent app that runs in the background and doesn't appear in the Dock" | developer.apple.com/documentation/bundleresources/information-property-list/lsuielement (read 2026-11-20) |
| `CFBundleExecutable`: "The name of the bundle's executable file" | developer.apple.com/documentation/bundleresources/information-property-list/cfbundleexecutable (read 2026-11-20) |
| `CFBundlePackageType`: "The type of bundle" (`APPL` is the value the apps already shipped from this repo use: tools/plug/app/Plug.app/Contents/Info.plist) | developer.apple.com/documentation/bundleresources/information-property-list/cfbundlepackagetype |
| `open "<url>"` opens the page in his browser | used by the launchers already running on his Mac: tools/kcal/app/kcal.app/Contents/MacOS/kcal:61 |

Not read yet (so not written): Gatekeeper first-open clicks on Sequoia, the Node darwin-x64
download, `man xcode-select` for `DEVELOPER_DIR`, GitHub's macOS runner labels, the pinned
`lib/xcodebuild.ts` (needed for the runner at M3).
