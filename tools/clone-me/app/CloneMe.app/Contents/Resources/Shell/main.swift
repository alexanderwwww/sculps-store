// Clone Me's window. One window, three shapes, one wire.
//
// The rule for this file: it is a wire, not a brain. Everything that thinks
// lives in the worker (Node) or in the agent bundle the worker serves and we
// inject. There is no Mac where this is written, so nothing here may be
// clever: long-stable AppKit/WebKit only, no force unwraps, no async/await.
//
// Compiled once on the Mac by the launcher (swiftc from the Command Line
// Tools). Targets macOS 12.
//
// This is a desk, not a phone. The window is one of three shapes and it
// animates between them:
//
//   pill     320x64   a floating capsule: a dot and one line of text. What
//                     sits over the desktop while Alex works.
//   working  900x700  one site pane, the web view filling it.
//   desk    1400x820  three panes side by side, each on its own cookie jar,
//                     one of them active.
//
// argv[1] = worker port. argv[2] = path to AppIcon.icns (optional).
// --selftest anywhere in argv = run the diagnostic and exit.
import Cocoa
import WebKit





// --- arguments ---------------------------------------------------------------

let argv = CommandLine.arguments
let selfTest = argv.contains("--selftest")

// Everything that is not a flag, in order.
let positional: [String] = Array(argv.dropFirst()).filter { !$0.hasPrefix("--") }
let workerPort: Int = {
  if positional.count > 0, let n = Int(positional[0]), n > 0, n < 65536 { return n }
  return 0
}()
let iconPath: String? = positional.count > 1 ? positional[1] : nil

let iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"

/*
 * The three shapes, and the sizes Alex asked for.
 */
enum Shape {
  case pill
  case working
  case desk
}

let pillSize = NSSize(width: 320, height: 64)
let workingSize = NSSize(width: 900, height: 700)
let deskSize = NSSize(width: 1400, height: 820)

/// The gutter around and between panes, and the height of the chrome strip
/// along the top that is always a handle.
let gutter: CGFloat = 10
let headerHeight: CGFloat = 36

/*
 * The three slots, in the order they sit on the desk.
 *
 * The identifier is what macOS keys the cookie jar to, so it is written down
 * once and never generated: change one of these and that slot is signed out.
 */
let paneSlots: [(String, String)] = [
  ("alibaba", "7A1B0C2D-0001-4E00-9E00-000000000001"),
  ("1688",    "7A1B0C2D-0002-4E00-9E00-000000000002"),
  ("spare",   "7A1B0C2D-0003-4E00-9E00-000000000003")
]

func agentURL(_ port: Int) -> URL? { return URL(string: "http://127.0.0.1:\(port)/agent.js") }
func socketURL(_ port: Int) -> URL? { return URL(string: "ws://127.0.0.1:\(port)/ws") }

/// Where the app keeps its things. The launcher hands this over; the fallback
/// is the same path the launcher would have computed.
func supportDir() -> String {
  let env = ProcessInfo.processInfo.environment
  if let home = env["CLONE_HOME"], home.count > 0 { return home }
  let user = env["HOME"] ?? "/tmp"
  return user + "/Library/Application Support/CloneMe"
}

func fail(_ reason: String) {
  if selfTest {
    print("SELFTEST FAILED: \(reason)")
    exit(1)
  }
  let alert = NSAlert()
  alert.messageText = "Clone Me"
  alert.informativeText = reason
  alert.alertStyle = .critical
  alert.runModal()
  exit(1)
}

// --- the chrome --------------------------------------------------------------
//
// The outer 8 points on every edge belong to the window, not the page: hitTest
// returns nil there, so AppKit's own resize machinery (the window is
// .resizable) gets the drag. Inside that, anything that is not a pane — the
// top strip, the gutters, the whole pill — is a handle. Only the panes
// themselves see the mouse.

final class ChromeView: NSView {
  /// The outermost ring: AppKit resizes the window there.
  let edge: CGFloat = 8
  /// Where the panes are right now, in this view's coordinates. Everything
  /// outside them is something to take hold of.
  var paneFrames: [NSRect] = []

  override func hitTest(_ point: NSPoint) -> NSView? {
    let p = convert(point, from: superview)
    if p.x < edge || p.y < edge || p.x > bounds.width - edge || p.y > bounds.height - edge {
      return nil
    }
    /*
     * Hold command and the whole window is a handle.
     *
     * A web view keeps the mouse to itself, so without this there is no way to
     * move the window while a page covers it. Command-drag is the one that
     * works wherever the hand happens to be.
     */
    if NSEvent.modifierFlags.contains(.command) { return self }
    for frame in paneFrames {
      if frame.contains(p) { return super.hitTest(point) }
    }
    return self
  }

  override func mouseDown(with event: NSEvent) {
    window?.performDrag(with: event)
  }
}

// A borderless window is not key-capable unless it says it is, and a pane
// nobody can type into cannot be signed into.

final class ShellWindow: NSWindow {
  override var canBecomeKey: Bool { return true }
  override var canBecomeMain: Bool { return true }
}

/// One slot on the desk: a name, the cookie jar it is keyed to, and the view.
final class Pane {
  let id: String
  let storeID: String
  var view: WKWebView

  init(id: String, storeID: String, view: WKWebView) {
    self.id = id
    self.storeID = storeID
    self.view = view
  }
}

// --- the app -----------------------------------------------------------------

final class Shell: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, URLSessionWebSocketDelegate {

  var window: NSWindow?
  /// The active pane's view. Everything that used to be "the web view" still
  /// means this, so every verb that was here before behaves as it did.
  var web: WKWebView?
  var body: ChromeView?
  var effect: NSVisualEffectView?
  var statusDot: NSView?
  var statusLabel: NSTextField?

  var panes: [Pane] = []
  var activePane: Int = 0
  var shape: Shape = .working

  /** The crew's code, kept so a rebuilt view gets it too. */
  var agentSource: String?
  /** Which account's store the active pane is on. */
  var currentProfile: String = "default"

  // the wire
  var session: URLSession?
  var socket: URLSessionWebSocketTask?
  var connected = false
  var outbox: [String] = []
  let outboxCap = 200
  var stopping = false

  // selftest
  var sawBridgeMessage = false
  var selfTestHTML: String? = nil

  // MARK: launch

  func applicationDidFinishLaunching(_ note: Notification) {
    if let path = iconPath, let image = NSImage(contentsOfFile: path) {
      NSApp.applicationIconImage = image
    }

    buildWindow()

    if selfTest {
      runSelfTest()
      return
    }

    if workerPort == 0 {
      fail("Clone Me was started without a worker port. Open Clone Me again from the Dock.")
      return
    }

    fetchAgent(deadline: Date().addingTimeInterval(20)) { source in
      guard let source = source else {
        fail("Clone Me could not reach its worker on port \(workerPort). Quit Clone Me and open it again.")
        return
      }
      self.injectAgent(source)
      self.connect()
    }
  }

  /** White glass, the green dot, and what it is waiting for. */
  static let startingHTML = """
  <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;height:100%;background:#fff;color:#111;
    font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;
    display:flex;align-items:center;justify-content:center;-webkit-user-select:none}
  .b{text-align:center;padding:0 28px}
  .d{width:10px;height:10px;border-radius:50%;background:#39FF7A;margin:0 auto 16px;
    box-shadow:0 0 12px rgba(57,255,122,.9);animation:p 1.4s ease-in-out infinite}
  @keyframes p{0%,100%{opacity:.3;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}
  .s{color:#8a9097;font-size:12.5px;margin-top:8px}
  </style><div class="b"><div class="d"></div><div>Clone Me</div>
  <div class="s">waking the crew…</div></div>
  """

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { return true }

  // MARK: the window

  func buildWindow() {
    let initial = NSRect(x: 0, y: 0, width: workingSize.width, height: workingSize.height)
    let win = ShellWindow(
      contentRect: initial,
      styleMask: [.borderless, .resizable],
      backing: .buffered, defer: false)
    win.isOpaque = false
    win.backgroundColor = .clear
    win.hasShadow = true
    /*
     * Always on top, and never in the way.
     *
     * .floating keeps it over the desktop while Alex works in something else.
     * It is never activated on its own — no makeKeyAndOrderFront and no
     * NSApp.activate outside the "front" verb — so it cannot take the mouse or
     * the keyboard from whatever he is typing into. orderFrontRegardless shows
     * it without making this app the front one.
     */
    win.level = .floating
    win.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    win.isMovableByWindowBackground = true
    win.isReleasedWhenClosed = false
    win.titleVisibility = .hidden
    win.minSize = NSSize(width: 280, height: 56)
    win.maxSize = NSSize(width: 4000, height: 3000)

    let container = ChromeView(frame: initial)
    container.wantsLayer = true
    container.autoresizingMask = [.width, .height]
    if let layer = container.layer {
      layer.masksToBounds = true
      layer.cornerRadius = 16
    }
    win.contentView = container

    /*
     * A real material, not a painted rectangle.
     *
     * NSVisualEffectView behind everything is what makes the pill read as a
     * piece of macOS: it picks up whatever is under the window and blurs it,
     * and it follows light and dark on its own.
     */
    let fx = NSVisualEffectView(frame: container.bounds)
    fx.autoresizingMask = [.width, .height]
    fx.material = .hudWindow
    fx.blendingMode = .behindWindow
    fx.state = .active
    fx.wantsLayer = true
    if let layer = fx.layer {
      layer.masksToBounds = true
      layer.cornerRadius = 16
    }
    container.addSubview(fx)

    let dot = NSView(frame: NSRect(x: 0, y: 0, width: 9, height: 9))
    dot.wantsLayer = true
    if let layer = dot.layer {
      layer.cornerRadius = 4.5
      layer.backgroundColor = NSColor.systemGreen.cgColor
    }
    container.addSubview(dot)

    let label = NSTextField(labelWithString: "Clone Me")
    label.font = NSFont.systemFont(ofSize: 13, weight: .medium)
    label.textColor = NSColor.labelColor
    label.lineBreakMode = .byTruncatingTail
    label.isSelectable = false
    container.addSubview(label)

    window = win
    body = container
    effect = fx
    statusDot = dot
    statusLabel = label

    // The panes. The first one is active and is what `web` means.
    for slot in paneSlots {
      let view = makeWebView(makeConfiguration(storeFor(slot.1)))
      container.addSubview(view)
      panes.append(Pane(id: slot.0, storeID: slot.1, view: view))
    }
    activePane = 0
    web = panes.count > 0 ? panes[0].view : nil

    /*
     * Something visible from the first frame.
     *
     * The window is transparent and the web views draw no background, so
     * about:blank in them is an invisible window: the app opened, the Dock
     * bounced, and Alex saw nothing at all.
     */
    for pane in panes {
      pane.view.loadHTMLString(Shell.startingHTML, baseURL: nil)
    }

    // First run: centred. After that the autosave name puts it back where
    // Alex left it; the shape then decides the size.
    win.center()
    win.setFrameAutosaveName("CloneMeBoard")
    applyShape(.working, animated: false)

    NotificationCenter.default.addObserver(
      self, selector: #selector(windowResized(_:)),
      name: NSWindow.didResizeNotification, object: win)

    win.orderFrontRegardless()
  }

  /** Every web view this app makes, made the same way. */
  func makeWebView(_ config: WKWebViewConfiguration) -> WKWebView {
    let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 400, height: 400), configuration: config)
    view.navigationDelegate = self
    view.uiDelegate = self
    view.allowsBackForwardNavigationGestures = true
    /*
     * It stops claiming to be an iPhone when it signs in.
     *
     * A Mac's WebKit wearing an iPhone user agent is a mismatch a site can
     * see. Set CLONE_UA=phone to put the old claim back if one ever needs it.
     */
    if ProcessInfo.processInfo.environment["CLONE_UA"] == "phone" {
      view.customUserAgent = iphoneUA
    }
    view.setValue(false, forKey: "drawsBackground")
    view.wantsLayer = true
    if let layer = view.layer {
      layer.masksToBounds = true
      layer.cornerRadius = 10
    }
    return view
  }

  /*
   * One desk, three cookie jars.
   *
   * Two accounts sharing one cookie jar are one account. macOS keeps a
   * separate, PERSISTENT website store per identifier, so each pane gets its
   * own — its own cookies, its own logged-in state, all of it surviving a
   * quit. Before macOS 14 there is only one store; the app says so once rather
   * than pretending the panes are separate.
   */
  var saidOneStore = false

  func storeFor(_ idText: String) -> WKWebsiteDataStore {
    if #available(macOS 14.0, *) {
      if let uuid = UUID(uuidString: idText) {
        return WKWebsiteDataStore(forIdentifier: uuid)
      }
    } else if !saidOneStore {
      saidOneStore = true
      note("this Mac keeps one set of sign-ins (macOS 14 or newer keeps one per pane)")
    }
    return WKWebsiteDataStore.default()
  }

  // MARK: shapes

  func sizeFor(_ s: Shape) -> NSSize {
    switch s {
    case .pill: return pillSize
    case .working: return workingSize
    case .desk: return deskSize
    }
  }

  func radiusFor(_ s: Shape) -> CGFloat {
    switch s {
    case .pill: return pillSize.height / 2
    case .working: return 16
    case .desk: return 16
    }
  }

  /**
   * Change shape.
   *
   * The window grows and shrinks from its top-left corner, so the thing Alex
   * is looking at does not jump across the screen, and it is clamped back onto
   * whichever screen it is on. The resize itself is an animator resize —
   * AppKit's own ease-in-ease-out over 0.35s — and the corner radius is
   * carried with it so the pill rounds off as it closes.
   */
  func applyShape(_ s: Shape, animated: Bool) {
    guard let win = window else { return }
    shape = s
    let size = sizeFor(s)
    var frame = win.frame
    let top = frame.origin.y + frame.size.height
    frame.origin.y = top - size.height
    frame.size = size

    if let screen = win.screen ?? NSScreen.main {
      let visible = screen.visibleFrame
      if frame.origin.x + frame.size.width > visible.origin.x + visible.size.width {
        frame.origin.x = visible.origin.x + visible.size.width - frame.size.width
      }
      if frame.origin.x < visible.origin.x { frame.origin.x = visible.origin.x }
      if frame.origin.y < visible.origin.y { frame.origin.y = visible.origin.y }
      let ceiling = visible.origin.y + visible.size.height
      if frame.origin.y + frame.size.height > ceiling {
        frame.origin.y = ceiling - frame.size.height
      }
    }

    let radius = radiusFor(s)
    body?.layer?.cornerRadius = radius
    effect?.layer?.cornerRadius = radius

    if animated {
      NSAnimationContext.runAnimationGroup({ context in
        context.duration = 0.35
        context.allowsImplicitAnimation = true
        win.animator().setFrame(frame, display: true)
      }, completionHandler: {
        self.layoutChrome()
      })
    } else {
      win.setFrame(frame, display: true)
    }
    layoutChrome()
  }

  @objc func windowResized(_ note: Notification) {
    layoutChrome()
  }

  /** Put the panes and the status line where this shape wants them. */
  func layoutChrome() {
    guard let container = body else { return }
    let bounds = container.bounds
    var frames: [NSRect] = []

    if shape == .pill {
      for pane in panes { pane.view.isHidden = true }
      let dotSize: CGFloat = 9
      let left: CGFloat = 22
      statusDot?.frame = NSRect(
        x: left, y: (bounds.height - dotSize) / 2,
        width: dotSize, height: dotSize)
      statusLabel?.frame = NSRect(
        x: left + dotSize + 10, y: (bounds.height - 18) / 2,
        width: max(40, bounds.width - (left + dotSize + 10) - 20), height: 18)
    } else {
      let dotSize: CGFloat = 8
      let left: CGFloat = 16
      let midY = bounds.height - headerHeight / 2
      statusDot?.frame = NSRect(
        x: left, y: midY - dotSize / 2,
        width: dotSize, height: dotSize)
      statusLabel?.frame = NSRect(
        x: left + dotSize + 9, y: midY - 9,
        width: max(40, bounds.width - (left + dotSize + 9) - 16), height: 18)

      let paneY = gutter
      let paneH = max(40, bounds.height - headerHeight - gutter)
      if shape == .working {
        for (index, pane) in panes.enumerated() {
          if index == activePane {
            pane.view.isHidden = false
            let frame = NSRect(
              x: gutter, y: paneY,
              width: max(40, bounds.width - gutter * 2), height: paneH)
            pane.view.frame = frame
            frames.append(frame)
          } else {
            pane.view.isHidden = true
          }
        }
      } else {
        let count = CGFloat(max(1, panes.count))
        let paneW = max(40, (bounds.width - gutter * (count + 1)) / count)
        for (index, pane) in panes.enumerated() {
          pane.view.isHidden = false
          let frame = NSRect(
            x: gutter + CGFloat(index) * (paneW + gutter), y: paneY,
            width: paneW, height: paneH)
          pane.view.frame = frame
          frames.append(frame)
        }
      }
    }

    // The active pane is the bright one, and it is the one with the ring.
    for (index, pane) in panes.enumerated() {
      let isActive = index == activePane
      pane.view.alphaValue = (shape == .desk && !isActive) ? 0.72 : 1.0
      if let layer = pane.view.layer {
        layer.cornerRadius = 10
        layer.borderWidth = (shape == .desk && isActive) ? 1.5 : 0
        layer.borderColor = NSColor.controlAccentColor.cgColor
      }
    }

    container.paneFrames = frames
  }

  /** Make one slot the active pane. */
  func activatePane(_ id: String, then url: String?) {
    var found = -1
    for (index, pane) in panes.enumerated() {
      if pane.id == id { found = index }
    }
    if found < 0 { return }
    activePane = found
    web = panes[found].view
    currentProfile = panes[found].storeID
    layoutChrome()
    if let text = url, let target = URL(string: text) {
      panes[found].view.load(URLRequest(url: target))
    }
  }

  // MARK: the agent

  func fetchAgent(deadline: Date, done: @escaping (String?) -> Void) {
    guard let url = agentURL(workerPort) else { done(nil); return }
    var request = URLRequest(url: url)
    request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    request.timeoutInterval = 5
    let task = URLSession.shared.dataTask(with: request) { data, response, _ in
      var source: String? = nil
      if let data = data, data.count > 0 {
        if let http = response as? HTTPURLResponse {
          if http.statusCode >= 200 && http.statusCode < 300 {
            source = String(data: data, encoding: .utf8)
          }
        } else {
          source = String(data: data, encoding: .utf8)
        }
      }
      DispatchQueue.main.async {
        if let source = source, source.count > 0 {
          done(source)
          return
        }
        if Date() >= deadline {
          done(nil)
          return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
          self.fetchAgent(deadline: deadline, done: done)
        }
      }
    }
    task.resume()
  }

  /**
   * Every web view this app makes, configured the same way.
   *
   * The store is the only thing that changes between them.
   */
  func makeConfiguration(_ store: WKWebsiteDataStore) -> WKWebViewConfiguration {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = store
    config.suppressesIncrementalRendering = false
    config.preferences.javaScriptCanOpenWindowsAutomatically = true
    // No user gesture needed for playback. (allowsInlineMediaPlayback is an
    // iOS-only property — on macOS every video is inline already, so there is
    // nothing to set and naming it here would not compile.)
    config.mediaTypesRequiringUserActionForPlayback = []
    config.userContentController.add(self, name: "organic")
    config.preferences.setValue(true, forKey: "developerExtrasEnabled")
    /*
     * Finish the user agent.
     *
     * A WKWebView's default agent stops at "AppleWebKit/605.1.15 (KHTML, like
     * Gecko)" — no Version, no Safari. This is the supported way to complete
     * it: the engine is Safari's, and now the name says so too.
     */
    config.applicationNameForUserAgent = "Version/17.4 Safari/605.1.15"
    return config
  }

  /** Swap the active pane onto another account's store, keeping everything else. */
  func switchProfile(_ idText: String, then url: String?) {
    guard let container = body else { return }
    if activePane < 0 || activePane >= panes.count { return }
    let pane = panes[activePane]
    let old = pane.view
    if idText == currentProfile {
      if let text = url, let target = URL(string: text) { old.load(URLRequest(url: target)) }
      return
    }

    let view = makeWebView(makeConfiguration(storeFor(idText)))
    view.frame = old.frame
    view.isHidden = old.isHidden

    old.removeFromSuperview()
    container.addSubview(view)
    pane.view = view
    web = view
    currentProfile = idText
    layoutChrome()
    if let source = agentSource { injectAgent(source) }
    if let text = url, let target = URL(string: text) { view.load(URLRequest(url: target)) }
    else { view.loadHTMLString(Shell.startingHTML, baseURL: nil) }
  }

  /** A line for the log, through the page's own ticker. */
  func note(_ what: String) {
    toPage("{\"t\":\"tick\",\"who\":\"organic\",\"what\":\"" + what.replacingOccurrences(of: "\"", with: "'") + "\"}")
  }

  func injectAgent(_ source: String) {
    agentSource = source
    for pane in panes {
      let controller = pane.view.configuration.userContentController
      controller.removeAllUserScripts()
      let script = WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false)
      controller.addUserScript(script)
    }
  }

  // MARK: page -> Swift

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    let text: String
    if let s = message.body as? String {
      text = s
    } else if JSONSerialization.isValidJSONObject(message.body),
              let data = try? JSONSerialization.data(withJSONObject: message.body, options: []),
              let s = String(data: data, encoding: .utf8) {
      text = s
    } else {
      return
    }
    sawBridgeMessage = true
    if handledAsWindow(text, fromPage: true) { return }
    send(text)
  }

  // MARK: Swift -> page

  func toPage(_ text: String) {
    guard let view = web else { return }
    guard let data = try? JSONSerialization.data(withJSONObject: [text], options: []),
          let wrapped = String(data: data, encoding: .utf8) else { return }
    // wrapped is  ["<the json text, escaped>"]  — take the element out of it,
    // which is a JavaScript string literal for exactly this text.
    let literal = String(wrapped.dropFirst().dropLast())
    view.evaluateJavaScript("window.__organic&&window.__organic.fromApp(\(literal))", completionHandler: nil)
  }

  func jsonText(_ object: [String: Any]) -> String {
    if let data = try? JSONSerialization.data(withJSONObject: object, options: []),
       let text = String(data: data, encoding: .utf8) {
      return text
    }
    return "{}"
  }

  /// An answer goes back the way the question came.
  func reply(_ object: [String: Any], fromPage: Bool) {
    let text = jsonText(object)
    if fromPage { toPage(text) } else { send(text) }
  }

  // MARK: the one thing Swift does read

  func handledAsWindow(_ text: String, fromPage: Bool) -> Bool {
    guard let data = text.data(using: .utf8) else { return false }
    guard let any = try? JSONSerialization.jsonObject(with: data, options: []) else { return false }
    guard let obj = any as? [String: Any] else { return false }
    guard let t = obj["t"] as? String, t == "window" else { return false }

    // {t:"agent", source:"…"} is handled on the inbound path; this is windows only.
    let verb = (obj["do"] as? String) ?? ""
    guard let win = window else { return true }

    switch verb {
    case "move":
      let dx = numberOf(obj["dx"])
      let dy = numberOf(obj["dy"])
      var frame = win.frame
      frame.origin.x += dx
      frame.origin.y += dy
      win.setFrame(frame, display: true)
    case "size":
      let w = numberOf(obj["w"])
      let h = numberOf(obj["h"])
      if w > 0 && h > 0 {
        var frame = win.frame
        frame.size = NSSize(width: w, height: h)
        win.setFrame(frame, display: true)
        layoutChrome()
      }
    case "front":
      win.makeKeyAndOrderFront(nil)
      NSApp.activate(ignoringOtherApps: true)
    case "quit":
      NSApp.terminate(nil)
    case "load":
      if let s = obj["url"] as? String, let url = URL(string: s) {
        web?.load(URLRequest(url: url))
      }
    /*
     * One pane, several accounts.
     *
     * The pane is rebuilt on the new store, the crew is injected again, and
     * the page it was told to open loads into it.
     */
    case "profile":
      guard let idText = obj["id"] as? String else { break }
      switchProfile(idText, then: obj["url"] as? String)
    /*
     * The three shapes. {t:"window", do:"shape", to:"pill"|"working"|"desk"}.
     * "text" and "dot" are optional and set the pill's line in the same move,
     * so the worker does not have to send two messages to fold the window away
     * with something to say on it.
     */
    case "shape":
      let to = (obj["to"] as? String) ?? ""
      setStatus(obj["text"] as? String, dot: obj["dot"] as? String)
      switch to {
      case "pill": applyShape(.pill, animated: true)
      case "desk": applyShape(.desk, animated: true)
      case "working": applyShape(.working, animated: true)
      default: break
      }
    /* The pill's line on its own. */
    case "status":
      setStatus(obj["text"] as? String, dot: obj["dot"] as? String)
    /* {t:"window", do:"pane", id:"alibaba"} — which slot is active. */
    case "pane":
      guard let idText = obj["id"] as? String else { break }
      activatePane(idText, then: obj["url"] as? String)
    /* {t:"window", do:"snapshot"} — a PNG of the active pane. */
    case "snapshot":
      takeShot(obj["id"] as? String, fromPage: fromPage)
    default:
      break
    }
    return true
  }

  /** The pill's dot and its one line. */
  func setStatus(_ text: String?, dot: String?) {
    if let text = text {
      statusLabel?.stringValue = text
    }
    if let name = dot {
      var color = NSColor.systemGreen
      if name == "amber" || name == "orange" { color = NSColor.systemOrange }
      if name == "red" { color = NSColor.systemRed }
      if name == "grey" || name == "gray" { color = NSColor.systemGray }
      if name == "blue" { color = NSColor.systemBlue }
      statusDot?.layer?.backgroundColor = color.cgColor
    }
  }

  /**
   * A picture of the active pane.
   *
   * This is how a QR code and a supplier's page get out of the window and into
   * something the worker can read. WebKit draws the snapshot itself, so what
   * lands on disk is the page as rendered, not the screen.
   */
  func takeShot(_ echo: String?, fromPage: Bool) {
    guard let view = web else {
      reply(["t": "shot", "ok": false, "why": "no pane"], fromPage: fromPage)
      return
    }
    let dir = supportDir() + "/data/shots"
    do {
      try FileManager.default.createDirectory(
        atPath: dir, withIntermediateDirectories: true, attributes: nil)
    } catch {
      reply(["t": "shot", "ok": false, "why": "could not make \(dir)"], fromPage: fromPage)
      return
    }
    let stamp = DateFormatter()
    stamp.dateFormat = "yyyyMMdd-HHmmss-SSS"
    let path = dir + "/shot-" + stamp.string(from: Date()) + ".png"

    view.takeSnapshot(with: nil) { image, _ in
      guard let image = image,
            let tiff = image.tiffRepresentation,
            let rep = NSBitmapImageRep(data: tiff),
            let png = rep.representation(using: .png, properties: [:]) else {
        self.reply(["t": "shot", "ok": false, "why": "WebKit drew nothing"], fromPage: fromPage)
        return
      }
      do {
        try png.write(to: URL(fileURLWithPath: path), options: .atomic)
      } catch {
        self.reply(["t": "shot", "ok": false, "why": "could not write \(path)"], fromPage: fromPage)
        return
      }
      var answer: [String: Any] = ["t": "shot", "ok": true, "path": path]
      if self.activePane >= 0 && self.activePane < self.panes.count {
        answer["pane"] = self.panes[self.activePane].id
      }
      if let echo = echo { answer["id"] = echo }
      self.reply(answer, fromPage: fromPage)
    }
  }

  func numberOf(_ value: Any?) -> CGFloat {
    if let n = value as? NSNumber { return CGFloat(n.doubleValue) }
    if let s = value as? String, let d = Double(s) { return CGFloat(d) }
    return 0
  }

  // {t:"agent", source:"…"} — swap the crew without a new download.
  func handledAsAgent(_ text: String) -> Bool {
    guard let data = text.data(using: .utf8) else { return false }
    guard let any = try? JSONSerialization.jsonObject(with: data, options: []) else { return false }
    guard let obj = any as? [String: Any] else { return false }
    guard let t = obj["t"] as? String, t == "agent" else { return false }
    if let source = obj["source"] as? String, source.count > 0 {
      injectAgent(source)
    }
    return true
  }

  // MARK: the socket

  func connect() {
    if stopping { return }
    guard let url = socketURL(workerPort) else { return }
    let configuration = URLSessionConfiguration.default
    let s = session ?? URLSession(configuration: configuration, delegate: self, delegateQueue: OperationQueue.main)
    session = s
    let task = s.webSocketTask(with: url)
    socket = task
    task.resume()
    receive(on: task)
  }

  func reconnectSoon() {
    if stopping { return }
    connected = false
    socket = nil
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { self.connect() }
  }

  func receive(on task: URLSessionWebSocketTask) {
    task.receive { result in
      switch result {
      case .failure:
        DispatchQueue.main.async {
          if self.socket === task { self.reconnectSoon() }
        }
      case .success(let message):
        var text: String? = nil
        switch message {
        case .string(let s): text = s
        case .data(let d): text = String(data: d, encoding: .utf8)
        @unknown default: text = nil
        }
        DispatchQueue.main.async {
          if let text = text {
            if !self.handledAsAgent(text) && !self.handledAsWindow(text, fromPage: false) {
              self.toPage(text)
            }
          }
          if self.socket === task { self.receive(on: task) }
        }
      }
    }
  }

  func send(_ text: String) {
    if let task = socket, connected {
      task.send(.string(text)) { error in
        if error != nil {
          DispatchQueue.main.async {
            if self.socket === task { self.reconnectSoon() }
          }
        }
      }
      return
    }
    outbox.append(text)
    while outbox.count > outboxCap { outbox.removeFirst() }
  }

  func flush() {
    guard let task = socket, connected else { return }
    let pending = outbox
    outbox.removeAll()
    for text in pending {
      task.send(.string(text)) { _ in }
    }
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
    if socket === webSocketTask {
      connected = true
      flush()
    }
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
    if socket === webSocketTask { reconnectSoon() }
  }

  // If WebKit refuses the data: URL, the same page still goes in directly.
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    if let html = selfTestHTML {
      selfTestHTML = nil
      webView.loadHTMLString(html, baseURL: nil)
    }
  }

  // MARK: the diagnostic
  //
  // No worker, no socket: a data: page that posts one message through the
  // bridge. If it comes back, the window, the web view and the handler all
  // work. Three seconds, then a verdict on stdout.

  func runSelfTest() {
    guard let view = web else {
      print("SELFTEST FAILED: no web view")
      exit(1)
    }
    guard window != nil else {
      print("SELFTEST FAILED: no window")
      exit(1)
    }
    let page = "<!doctype html><meta charset=\"utf-8\"><body><script>"
      + "try{window.webkit.messageHandlers.organic.postMessage({t:\"selftest\",ok:1})}catch(e){}"
      + "</script></body>"
    guard let encoded = page.addingPercentEncoding(withAllowedCharacters: CharacterSet.alphanumerics),
          let url = URL(string: "data:text/html;charset=utf-8,\(encoded)") else {
      print("SELFTEST FAILED: could not build the test page")
      exit(1)
    }
    selfTestHTML = page
    view.load(URLRequest(url: url))
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
      if self.sawBridgeMessage {
        print("SELFTEST OK")
        exit(0)
      }
      print("SELFTEST FAILED: the page never reached the bridge")
      exit(1)
    }
  }
}

// --- boot --------------------------------------------------------------------

let app = NSApplication.shared
let shell = Shell()
app.delegate = shell
app.setActivationPolicy(.regular)

// A menu bar, so Cmd-Q, Cmd-C, Cmd-V, Cmd-X and Cmd-A do what they do in every
// Mac app — pasting a password into a sign-in screen included.
let menubar = NSMenu()
let appItem = NSMenuItem()
menubar.addItem(appItem)
let appMenu = NSMenu()
appMenu.addItem(withTitle: "Hide Clone Me", action: #selector(NSApplication.hide(_:)), keyEquivalent: "w")
appMenu.addItem(withTitle: "Hide", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
appMenu.addItem(NSMenuItem.separator())
appMenu.addItem(withTitle: "Quit Clone Me", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
appItem.submenu = appMenu
let editItem = NSMenuItem()
menubar.addItem(editItem)
let editMenu = NSMenu(title: "Edit")
editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
editMenu.addItem(NSMenuItem.separator())
editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
editItem.submenu = editMenu
app.mainMenu = menubar

app.run()
