// Organic's window. One window, one web view, one wire.
//
// The rule for this file: it is a wire, not a brain. Everything that thinks
// lives in the worker (Node) or in the agent bundle the worker serves and we
// inject. There is no Mac where this is written, so nothing here may be
// clever: long-stable AppKit/WebKit only, no force unwraps, no async/await.
//
// Compiled once on the Mac by the launcher (swiftc from the Command Line
// Tools). Targets macOS 12.
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

let phoneAspect = NSSize(width: 390, height: 844)
let iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"

func agentURL(_ port: Int) -> URL? { return URL(string: "http://127.0.0.1:\(port)/agent.js") }
func socketURL(_ port: Int) -> URL? { return URL(string: "ws://127.0.0.1:\(port)/ws") }

func fail(_ reason: String) {
  if selfTest {
    print("SELFTEST FAILED: \(reason)")
    exit(1)
  }
  let alert = NSAlert()
  alert.messageText = "Organic"
  alert.informativeText = reason
  alert.alertStyle = .critical
  alert.runModal()
  exit(1)
}

// --- the phone's body --------------------------------------------------------
//
// The outer 8 points on every edge belong to the window, not the page: hitTest
// returns nil there, so AppKit's own resize machinery (the window is
// .resizable) gets the drag. Everywhere else the web view gets the event, and
// isMovableByWindowBackground plus performDrag move the phone around.

final class PhoneView: NSView {
  /// The outermost ring: AppKit resizes the window there.
  let edge: CGFloat = 8
  /// The phone's body. The page stops here, so this is where a drag lands.
  static let bezel: CGFloat = 16

  override func hitTest(_ point: NSPoint) -> NSView? {
    let p = convert(point, from: superview)
    if p.x < edge || p.y < edge || p.x > bounds.width - edge || p.y > bounds.height - edge {
      return nil
    }
    /*
     * Hold command and the whole phone is a handle.
     *
     * The web view covers everything inside the body, and a web view keeps
     * the mouse to itself — which is why the phone could not be moved at all.
     * The body is a real grip now, and command-drag is the one that works
     * wherever the hand happens to be.
     */
    if NSEvent.modifierFlags.contains(.command) { return self }
    return super.hitTest(point)
  }

  override func mouseDown(with event: NSEvent) {
    window?.performDrag(with: event)
  }

}

// A borderless window is not key-capable unless it says it is, and a phone
// nobody can type into cannot be signed into.

final class PhoneWindow: NSWindow {
  override var canBecomeKey: Bool { return true }
  override var canBecomeMain: Bool { return true }
}

// --- the app -----------------------------------------------------------------

final class Shell: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, URLSessionWebSocketDelegate {

  var window: NSWindow?
  var web: WKWebView?
  var body: PhoneView?

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
      fail("Organic was started without a worker port. Open Organic again from the Dock.")
      return
    }

    fetchAgent(deadline: Date().addingTimeInterval(20)) { source in
      guard let source = source else {
        fail("Organic could not reach its worker on port \(workerPort). Quit Organic and open it again.")
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
  </style><div class="b"><div class="d"></div><div>Organic</div>
  <div class="s">waking the crew…</div></div>
  """

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { return true }

  // MARK: the window

  func buildWindow() {
    let initial = NSRect(x: 0, y: 0, width: phoneAspect.width, height: phoneAspect.height)
    let win = PhoneWindow(
      contentRect: initial,
      styleMask: [.borderless, .resizable],
      backing: .buffered, defer: false)
    win.isOpaque = false
    win.backgroundColor = .clear
    win.hasShadow = true
    win.level = .normal
    win.isMovableByWindowBackground = true
    win.isReleasedWhenClosed = false
    win.titleVisibility = .hidden
    win.minSize = NSSize(width: 300, height: 650)
    win.maxSize = NSSize(width: 520, height: 520 / phoneAspect.width * phoneAspect.height)
    win.contentAspectRatio = phoneAspect

    let container = PhoneView(frame: initial)
    container.wantsLayer = true
    container.autoresizingMask = [.width, .height]
    if let layer = container.layer {
      // The phone's body: dark, so the bezel reads as a phone and the ring
      // around the page is something to take hold of.
      layer.backgroundColor = NSColor(calibratedWhite: 0.055, alpha: 1).cgColor
      layer.masksToBounds = true
      layer.cornerRadius = Shell.radius(for: initial.width)
    }
    win.contentView = container

    let config = WKWebViewConfiguration()
    config.websiteDataStore = WKWebsiteDataStore.default()
    config.suppressesIncrementalRendering = false
    config.preferences.javaScriptCanOpenWindowsAutomatically = true
    // Reels autoplay: no user gesture needed. (allowsInlineMediaPlayback is an
    // iOS-only property — on macOS every video is inline already, so there is
    // nothing to set and naming it here would not compile.)
    config.mediaTypesRequiringUserActionForPlayback = []
    config.userContentController.add(self, name: "organic")
    config.preferences.setValue(true, forKey: "developerExtrasEnabled")

    let inset = PhoneView.bezel
    let view = WKWebView(frame: container.bounds.insetBy(dx: inset, dy: inset), configuration: config)
    view.autoresizingMask = [.width, .height]
    view.navigationDelegate = self
    view.uiDelegate = self
    view.allowsBackForwardNavigationGestures = true
    view.customUserAgent = iphoneUA
    view.setValue(false, forKey: "drawsBackground")
    view.wantsLayer = true
    if let layer = view.layer {
      layer.masksToBounds = true
      layer.cornerRadius = Shell.radius(for: initial.width)
    }
    container.addSubview(view)

    /*
     * Something visible from the first frame.
     *
     * The window is transparent and the web view draws no background, so
     * about:blank in it is an invisible window: the app opened, the Dock
     * bounced, and Alex saw nothing at all. A phone that is starting has to
     * LOOK like a phone that is starting.
     */
    view.loadHTMLString(Delegate.startingHTML, baseURL: nil)

    // First run: centred. After that the autosave name puts it back where
    // Alex left it (setFrameAutosaveName restores if a saved frame exists).
    win.center()
    win.setFrameAutosaveName("OrganicPhone")

    window = win
    web = view
    body = container
    applyRadius()

    NotificationCenter.default.addObserver(
      self, selector: #selector(windowResized(_:)),
      name: NSWindow.didResizeNotification, object: win)

    win.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  static func radius(for width: CGFloat) -> CGFloat {
    let r = width * 0.114
    if r < 28 { return 28 }
    if r > 64 { return 64 }
    return r
  }

  @objc func windowResized(_ note: Notification) {
    applyRadius()
  }

  func applyRadius() {
    guard let container = body else { return }
    let r = Shell.radius(for: container.bounds.width)
    container.layer?.cornerRadius = r
    // The glass sits inside the body, with its own slightly tighter corner —
    // which is the detail that makes a drawn phone look like a phone.
    let inset = PhoneView.bezel
    web?.frame = container.bounds.insetBy(dx: inset, dy: inset)
    web?.layer?.masksToBounds = true
    web?.layer?.cornerRadius = max(10, r - inset * 0.6)
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

  func injectAgent(_ source: String) {
    guard let view = web else { return }
    let controller = view.configuration.userContentController
    controller.removeAllUserScripts()
    let script = WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false)
    controller.addUserScript(script)
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
    if handledAsWindow(text) { return }
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

  // MARK: the one thing Swift does read

  func handledAsWindow(_ text: String) -> Bool {
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
        applyRadius()
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
    default:
      break
    }
    return true
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
            if !self.handledAsAgent(text) && !self.handledAsWindow(text) {
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
appMenu.addItem(withTitle: "Hide Organic", action: #selector(NSApplication.hide(_:)), keyEquivalent: "w")
appMenu.addItem(withTitle: "Hide", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
appMenu.addItem(NSMenuItem.separator())
appMenu.addItem(withTitle: "Quit Organic", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
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
