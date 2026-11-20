// WebDriverAgent route table.
// Pinned source: github.com/appium/appium-ios, packages/webdriveragent
//   commit a20438d81ea63ce3f985497fd0759295a7ddf58c (appium-webdriveragent 17.0.12, 2026-11-20)
// Every "src" below is WebDriverAgentLib/<file>:<line> in that commit. SOURCES.md has the detail.
//
// session: 'yes'    = only under /session/<id>   (route declared without .withoutSession)
//          'no'     = only without a session
//          'either' = declared both ways; finger calls it without a session
// A route needs a session unless it says .withoutSession: Routing/FBRoute.m:106-122,153-169.
//
// standalone: true = the route is declared .standalone and is answered OFF WDA's one command
// queue (Routing/FBHTTPServer.h:58-62), so it still answers while a command is stuck.
// Every other route waits its turn on the main queue (Routing/FBWebServer.m:80).
//
// What a tap waits on: the handler calls [target tap] on an XCUICoordinate
// (Commands/FBElementCommands.m:501-511). Before XCTest sends the touch it waits for the app
// to go idle; WDA swizzles that wait and bounds it by waitForIdleTimeout
// (Categories/XCUIApplicationProcess+FBQuiescence.m:22-54,60-73), 10 s by default
// (Utilities/FBConfiguration.m:353). A value of 0 switches the wait off (:25). So on a
// screen that never goes idle (a live chart) one tap can take 10 s. The timeouts below are
// finger's own starting numbers, chosen above that; the confirm tap in buy.mjs gets a much
// shorter one of its own. Whether to lower waitForIdleTimeout for the wallet is decided at
// M4 from a measurement on Phantom's chart screen (STATUS.md).

export const WDA_PIN = {
  repo: 'https://github.com/appium/appium-ios',
  path: 'packages/webdriveragent',
  commit: 'a20438d81ea63ce3f985497fd0759295a7ddf58c',
  version: '17.0.12',
};

export const WDA_PORT = 8100; // USE_PORT set in the xcodebuild environment (PLAN section 2)

export const ROUTES = {
  status:      { method: 'GET',  path: '/status',                    session: 'no',     standalone: true, timeoutMs: 5000,  src: 'Commands/FBSessionCommands.m:52,173-229' },
  newSession:  { method: 'POST', path: '/session',                   session: 'no',     timeoutMs: 30000, body: ['capabilities'], src: 'Commands/FBSessionCommands.m:44,91-127,263-277' },
  settings:    { method: 'POST', path: '/appium/settings',           session: 'yes',    timeoutMs: 10000, body: ['settings'], src: 'Commands/FBSessionCommands.m:59,244-256' },
  source:      { method: 'GET',  path: '/source',                    session: 'either', timeoutMs: 30000, query: ['format'], src: 'Commands/FBDebugCommands.m:26-27,40-72' },
  screenshot:  { method: 'GET',  path: '/screenshot',                session: 'either', standalone: true, timeoutMs: 20000, src: 'Commands/FBScreenshotCommands.m:21-22,29-38' },
  windowSize:  { method: 'GET',  path: '/window/size',               session: 'either', timeoutMs: 10000, src: 'Commands/FBElementCommands.m:61,63,572-586' },
  activeApp:   { method: 'GET',  path: '/wda/activeAppInfo',         session: 'either', timeoutMs: 10000, src: 'Commands/FBCustomCommands.m:60-61,257-269' },
  locked:      { method: 'GET',  path: '/wda/locked',                session: 'either', timeoutMs: 10000, src: 'Commands/FBCustomCommands.m:54-55,242-246' },
  alertText:   { method: 'GET',  path: '/alert/text',                session: 'either', timeoutMs: 15000, src: 'Commands/FBAlertViewCommands.m:24-25,38-47' },
  alertAccept: { method: 'POST', path: '/alert/accept',              session: 'either', timeoutMs: 15000, body: ['name'], src: 'Commands/FBAlertViewCommands.m:27-28,65-77' },
  alertDismiss:{ method: 'POST', path: '/alert/dismiss',             session: 'either', timeoutMs: 15000, body: ['name'], src: 'Commands/FBAlertViewCommands.m:29-30,79-91' },
  tap:         { method: 'POST', path: '/wda/tap',                   session: 'yes',    timeoutMs: 20000, body: ['x', 'y'], src: 'Commands/FBElementCommands.m:123,501-511,763-779' },
  doubleTap:   { method: 'POST', path: '/wda/doubleTap',             session: 'yes',    timeoutMs: 20000, body: ['x', 'y'], src: 'Commands/FBElementCommands.m:95,306-316' },
  touchAndHold:{ method: 'POST', path: '/wda/touchAndHold',          session: 'yes',    timeoutMs: 40000, body: ['x', 'y', 'duration'], src: 'Commands/FBElementCommands.m:106,337-347' },
  drag:        { method: 'POST', path: '/wda/dragfromtoforduration', session: 'yes',    timeoutMs: 40000, body: ['fromX', 'fromY', 'toX', 'toY', 'duration'], src: 'Commands/FBElementCommands.m:114,449-477' },
  keys:        { method: 'POST', path: '/wda/keys',                  session: 'yes',    timeoutMs: 30000, body: ['value'], src: 'Commands/FBElementCommands.m:127,553-570' },
  pressButton: { method: 'POST', path: '/wda/pressButton',           session: 'yes',    timeoutMs: 15000, body: ['name'], src: 'Commands/FBCustomCommands.m:69,346-355' },
  homescreen:  { method: 'POST', path: '/wda/homescreen',            session: 'no',     timeoutMs: 15000, src: 'Commands/FBCustomCommands.m:47,121-129' },
  appActivate: { method: 'POST', path: '/wda/apps/activate',         session: 'yes',    timeoutMs: 30000, body: ['bundleId'], src: 'Commands/FBSessionCommands.m:46,139-143' },
  appTerminate:{ method: 'POST', path: '/wda/apps/terminate',        session: 'yes',    timeoutMs: 30000, body: ['bundleId'], src: 'Commands/FBSessionCommands.m:47,145-149' },
};

// Hardware buttons a real iPhone accepts on every model: Categories/XCUIDevice+FBHelpers.m:72-75.
// "action" and "camera" depend on the model (lines 77-88) and are not offered.
export const BUTTONS = ['home', 'volumeup', 'volumedown'];

// Settings finger sets on purpose after every new session (they reset with the session:
// Commands/FBSessionCommands.m:281 resetSessionSettings).
//   screenshotQuality 1 = JPEG, medium compression. 0 = PNG, 2 = JPEG highly compressed,
//   3 = HEIC and is the default.  Utilities/FBConfiguration.h:114-120, Utilities/FBScreenshot.m:48-57,
//   Utilities/FBSettings.m:17, Utilities/FBConfiguration.m:347
// NOT set yet, each waiting on a decision before M4 (STATUS.md section 4):
//   respectSystemAlerts (Utilities/FBSettings.m:36, FBSettingsHandler.m:94-97): off unless set
//     (no default is assigned in FBConfiguration.m). When on, a system pop-up is found by the
//     alert routes even while another app is in front (Routing/FBSession.m:371-374).
//   waitForIdleTimeout (Utilities/FBSettings.m:32, FBSettingsHandler.m:142-145): see the top of this file.
export const SESSION_SETTINGS = { screenshotQuality: 1 };

// Error strings in the reply envelope: Routing/FBCommandStatus.m:11-77 (names), 12-76 (HTTP codes).
export const WDA_ERRORS = {
  noAlert: 'no such alert',           // :39, HTTP 404
  noSession: 'invalid session id',    // :75, HTTP 404
  unknownCommand: 'unknown command',  // :63, HTTP 404
  invalidArgument: 'invalid argument',// :27, HTTP 400
};
