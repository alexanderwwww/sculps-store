// Organic's window. One window, a web view, nothing else.
//
// Everything that moves lives in the worker (Node) and is drawn by the page
// this loads from 127.0.0.1. This file exists so that what Alex opens is a
// real Mac app: its own icon in the Dock, Cmd-Q, a window that remembers
// where it was — and no browser chrome anywhere on screen.
//
// Compiled once on the Mac by the launcher (swiftc from the Command Line
// Tools), because there is no Mac in the place this was written.
import Cocoa
import WebKit

let arguments = CommandLine.arguments
let pageURL = URL(string: arguments.count > 1 ? arguments[1] : "http://127.0.0.1:1/")!
let iconPath: String? = arguments.count > 2 ? arguments[2] : nil

final class Delegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
  var window: NSWindow!
  var web: WKWebView!
  var retryArmed = false

  func applicationDidFinishLaunching(_ note: Notification) {
    // The Dock draws what it cached for whatever bundle it last saw at this
    // path. Setting the icon on the running app makes it draw ours, whatever
    // the cache says. The bundle's icon still covers the tile when not running.
    if let path = iconPath, let image = NSImage(contentsOfFile: path) {
      NSApp.applicationIconImage = image
    }

    let frame = NSRect(x: 0, y: 0, width: 1280, height: 820)
    window = NSWindow(
      contentRect: frame,
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered, defer: false)
    window.title = "Organic"
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .hidden
    window.minSize = NSSize(width: 1000, height: 700)
    window.backgroundColor = .white
    window.isReleasedWhenClosed = false
    // Centered on the first run; from then on the autosave name restores where Alex left it.
    window.center()
    window.setFrameAutosaveName("OrganicMain")

    let config = WKWebViewConfiguration()
    config.preferences.setValue(true, forKey: "developerExtrasEnabled")
    web = WKWebView(frame: frame, configuration: config)
    web.autoresizingMask = [.width, .height]
    web.navigationDelegate = self
    web.uiDelegate = self
    web.setValue(false, forKey: "drawsBackground")
    window.contentView = web
    web.load(URLRequest(url: pageURL))

    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  // The worker restarts itself on every update; the page comes back within
  // a second or two. Keep asking rather than showing a dead window.
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { retry() }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { retry() }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { retry() }
  func retry() {
    if retryArmed { return }
    retryArmed = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
      self.retryArmed = false
      self.web.load(URLRequest(url: pageURL))
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.setActivationPolicy(.regular)

// A menu bar, so Cmd-Q, Cmd-C, Cmd-V and Cmd-A do what they do in every Mac
// app — pasting a password into a sign-in screen included.
let menubar = NSMenu()
let appItem = NSMenuItem(); menubar.addItem(appItem)
let appMenu = NSMenu()
appMenu.addItem(withTitle: "Hide Organic", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
appMenu.addItem(NSMenuItem.separator())
appMenu.addItem(withTitle: "Quit Organic", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
appItem.submenu = appMenu
let editItem = NSMenuItem(); menubar.addItem(editItem)
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
