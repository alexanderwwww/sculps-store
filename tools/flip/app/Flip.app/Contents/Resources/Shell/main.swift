// flip's window. One window, three shapes, one wire.
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
import QuartzCore





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
  /// What it is when nobody needs anything: a small living piece of glass.
  case orb
  case pill
  case working
  case desk
}

/// The orb is square on purpose — a squircle, not a circle and not a window.
let orbSize = NSSize(width: 216, height: 216)
let pillSize = NSSize(width: 320, height: 64)
/* A phone, at the size of a real one. Not a window with a page in it — the
   bezel the agent draws expects these proportions, island and all. */
let workingSize = NSSize(width: 393, height: 852)
let deskSize = NSSize(width: 1400, height: 820)

/// The gutter around and between panes, and the height of the chrome strip
/// along the top that is always a handle.
let gutter: CGFloat = 10
let headerHeight: CGFloat = 36
/* The strip along the top of the phone that belongs to the window rather than
   the page: what you grab to move it, and what the close chip sits in. */
let handleStrip: CGFloat = 52

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
  if let home = env["FLIP_HOME"], home.count > 0 { return home }
  let user = env["HOME"] ?? "/tmp"
  return user + "/Library/Application Support/Flip"
}

func fail(_ reason: String) {
  if selfTest {
    print("SELFTEST FAILED: \(reason)")
    exit(1)
  }
  let alert = NSAlert()
  alert.messageText = "flip"
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
    /*
     * Controls come before the handle.
     *
     * Everything that is not a pane used to be a drag handle, buttons
     * included — so the chips in the header took the mouse down as the
     * beginning of a window drag and never fired. Three buttons that did
     * nothing at all, for one missing check.
     */
    if let hit = super.hitTest(point), hit is NSButton { return hit }
    for frame in paneFrames {
      if frame.contains(p) { return super.hitTest(point) }
    }
    return self
  }

  /// What to do when the mouse went down and up without going anywhere.
  var onTap: (() -> Void)?

  /*
   * A drag and a tap are the same gesture until it ends.
   *
   * performDrag blocks until the mouse comes up, so the distance travelled is
   * known by the time it returns: moved, and it was a drag; did not, and it
   * was a click. Without this the orb had to choose — take the mouse and be
   * unmovable, or hand it to the drag machinery and be unclickable. It was
   * unmovable, which is what he hit.
   */
  override func mouseDown(with event: NSEvent) {
    let start = NSEvent.mouseLocation
    window?.performDrag(with: event)
    let end = NSEvent.mouseLocation
    if abs(end.x - start.x) < 4 && abs(end.y - start.y) < 4 { onTap?() }
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
  /// The last five digits of the build, painted on the orb and the pill.
  var orbBuild: String = ""
  var statusDot: NSView?
  var statusLabel: NSTextField?

  var panes: [Pane] = []
  var activePane: Int = 0
  /// The glass face. Always built, only visible when the window is an orb.
  var orb: WKWebView?
  /// The frost between the live page and the glass. Only there when folded.
  var frost: NSVisualEffectView?
  /// The one control the open window has: a chip that folds it back.
  var collapse: NSButton?
  var passwordButton: NSButton?
  var signInButton: NSButton?
  var pasteButton: NSButton?
  /// What the page last said about whether he is signed in.
  var signedOut = true
  var shape: Shape = .orb

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
      fail("flip was started without a worker port. Open flip again from the Dock.")
      return
    }

    fetchAgent(deadline: Date().addingTimeInterval(20)) { source in
      guard let source = source else {
        fail("flip could not reach its worker on port \(workerPort). Quit flip and open it again.")
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
  </style><div class="b"><div class="d"></div><div>flip</div>
  <div class="s">waking the crew…</div></div>
  """


  /**
   * The face of the thing.
   *
   * Not a window with a page in it — a piece of glass with water under it. The
   * canvas draws slow interfering waves, tinted by whatever the status is, and
   * a ring of crew dots that only move while they are working. Everything is
   * generated, so it weighs nothing and never loads.
   *
   * Clicking it swells the window open. That is the only control it has.
   */
  static let orbHTML = """
  <!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden;background:transparent;
    font:13px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;
    -webkit-user-select:none;cursor:pointer}
  canvas{position:absolute;inset:0;width:100%;height:100%}
  .f{position:absolute;left:0;right:0;top:19%;display:flex;flex-direction:column;
    align-items:center;gap:4px;text-align:center;padding:0 18px;
    transition:transform .22s cubic-bezier(.2,.9,.3,1.3)}
  .n{font-size:11px;font-weight:700;letter-spacing:.34em;color:rgba(255,255,255,.58)}
  .s{font-size:14px;font-weight:600;letter-spacing:-.01em;color:rgba(255,255,255,.98);
    text-shadow:0 1px 3px rgba(0,0,0,.85),0 1px 14px rgba(0,0,0,.55);max-width:100%;overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap}
  .c{font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.14em;
    color:rgba(255,255,255,.45);margin-top:1px}
  /* The machine thinking out loud. Never more than four, oldest fading. */
  .t{position:absolute;left:0;right:0;bottom:16px;padding:0 20px;
    display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none}
  .t div{font:9.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;
    color:rgba(255,255,255,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    max-width:100%;transition:opacity .5s}
  body.press .f{transform:scale(.97)}
  </style>
  <canvas id="c"></canvas>
  <div class="f"><div class="n" id="n">flip{{BUILD}}</div><div class="s" id="s">waking</div>
  <div class="c" id="k"></div></div>
  <div class="t" id="t"></div>
  <script>
  (function(){
    var c=document.getElementById("c"),x=c.getContext("2d"),t=0;
    var state={working:false,doing:"waking",taken:0,budget:20};
    function size(){var r=window.devicePixelRatio||2;c.width=innerWidth*r;c.height=innerHeight*r;x.setTransform(r,0,0,r,0,0);}
    size();addEventListener("resize",size);

    /* Resting is a cold blue-violet, working a vivid mint. Slow between them,
       so waking up reads as a tide and not a light switch. */
    var rest=[70,96,150], work=[0,214,150], mix=0;
    function tint(a){
      var b=[0,1,2].map(function(i){return Math.round(rest[i]+(work[i]-rest[i])*mix)});
      return "rgba("+b[0]+","+b[1]+","+b[2]+","+a+")";
    }

    /* How hard it is being thrown around. Swift hands over every step of a
       drag; the velocity decays, so light keeps sliding after the hand stops —
       which is the whole difference between glass and a picture of glass. */
    var vx=0, vy=0, lean=0;

    function draw(){
      t+=0.0075;
      vx*=0.90; vy*=0.90;
      lean += (Math.max(-1,Math.min(1,vx/26))-lean)*0.12;
      mix += ((state.working?1:0)-mix)*0.025;
      var w=innerWidth,h=innerHeight;
      x.clearRect(0,0,w,h);

      /* A tint, never a paint. The material is the window's own blur of what
         is behind it; anything opaque here turns the glass into a tile. */
      var g=x.createLinearGradient(0,0,w*0.4,h);
      g.addColorStop(0,tint(0.05));g.addColorStop(1,tint(0.16));
      x.fillStyle=g;x.fillRect(0,0,w,h);

      /* A soft scrim under the type only, feathered out well before the edges,
         so the words hold on any desktop while the pane stays see-through. */
      var sc=x.createRadialGradient(w/2,h*0.30,4,w/2,h*0.30,w*0.62);
      sc.addColorStop(0,"rgba(6,10,18,.16)");
      sc.addColorStop(0.55,"rgba(6,10,18,.05)");
      sc.addColorStop(1,"rgba(6,10,18,0)");
      x.fillStyle=sc;x.fillRect(0,0,w,h);

      /*
       * The ribbons.
       *
       * Three sheets of light folding through the glass, additively blended, at
       * different speeds — drifting when it rests, folding fast when it works.
       * Where they cross they brighten, and that interference is what reads as
       * liquid. This replaced sixteen columns, which were an equaliser from
       * 2010: Apple does not build readouts, it builds substance.
       */
      x.save(); x.globalCompositeOperation="lighter";
      for(var i=0;i<3;i++){
        var sp=(0.26+mix*0.8)*(0.6+i*0.3);
        var amp=h*(0.10+i*0.03)*(0.7+mix*0.8);
        var mid=h*(0.46+i*0.10);
        var gr=x.createLinearGradient(0,mid-amp,0,mid+amp);
        gr.addColorStop(0,"rgba(255,255,255,0)");
        gr.addColorStop(0.5, i===1 ? tint(0.16) : tint(0.10));
        gr.addColorStop(1,"rgba(255,255,255,0)");
        x.beginPath();
        for(var px=0;px<=w;px+=3){
          var y=mid+Math.sin(px/(70-i*14)+t*sp*2.4)*amp
                   +Math.sin(px/(150+i*30)-t*sp*1.3)*amp*0.6
                   +lean*amp*1.8*(px/w-0.5)*-2;
          if(px===0) x.moveTo(px,y); else x.lineTo(px,y);
        }
        for(var px2=w;px2>=0;px2-=3){
          var y2=mid+Math.sin(px2/(70-i*14)+t*sp*2.4)*amp
                    +Math.sin(px2/(150+i*30)-t*sp*1.3)*amp*0.6
                    +lean*amp*1.8*(px2/w-0.5)*-2;
          x.lineTo(px2,y2+h*(0.06+mix*0.05));
        }
        x.closePath(); x.fillStyle=gr; x.fill();
      }
      x.restore();

      /* The rim: a bright top edge and a cool bottom one, so the glass has a
         thickness instead of being a hole cut in the desktop. */
      var r=x.createLinearGradient(0,0,0,h);
      r.addColorStop(0,"rgba(255,255,255,.16)");
      r.addColorStop(0.12,"rgba(255,255,255,0)");
      r.addColorStop(0.9,"rgba(255,255,255,0)");
      r.addColorStop(1,tint(0.10));
      x.fillStyle=r;x.fillRect(0,0,w,h);

      /* The highlight slides the opposite way to the hand and brightens while
         it moves, the way a reflection does on a thing being carried. */
      var sx=w*(0.22+Math.sin(t*0.6)*0.10)-lean*w*0.30;
      var sy=h*0.16+Math.max(-1,Math.min(1,vy/26))*h*0.16;
      var glare=0.07+Math.min(0.12,(Math.abs(vx)+Math.abs(vy))/160);
      var s2=x.createRadialGradient(sx,sy,2,sx,sy,h*0.78);
      s2.addColorStop(0,"rgba(255,255,255,"+glare+")");s2.addColorStop(1,"rgba(255,255,255,0)");
      x.fillStyle=s2;x.fillRect(0,0,w,h);

      /* And a caustic raked across the surface by the movement — the bit that
         reads as thickness. */
      if (Math.abs(lean)>0.02){
        var bx=w*(0.5-lean*0.85), bg=x.createLinearGradient(bx-w*0.34,0,bx+w*0.34,h);
        bg.addColorStop(0,"rgba(255,255,255,0)");
        bg.addColorStop(0.5,"rgba(255,255,255,"+(Math.abs(lean)*0.09)+")");
        bg.addColorStop(1,"rgba(255,255,255,0)");
        x.fillStyle=bg;x.fillRect(0,0,w,h);
      }

      if (document.hidden) { setTimeout(function(){requestAnimationFrame(draw);}, 400); }
      else if (mix < 0.02 && Math.abs(vx) + Math.abs(vy) < 0.5) {
        setTimeout(function(){requestAnimationFrame(draw);}, 24);
      } else requestAnimationFrame(draw);
    }
    draw();

    /* The telemetry. Lines arrive, push the rest up, and fade. */
    var lines=[];
    function note(line){
      if(!line) return;
      if(lines.length && lines[lines.length-1]===line) return;
      lines.push(line); if(lines.length>4) lines.shift();
      var box=document.getElementById("t"); box.textContent="";
      lines.forEach(function(l,i){
        var d=document.createElement("div");
        d.textContent=l;
        d.style.opacity=String(0.22+0.22*i);
        box.appendChild(d);
      });
    }

    window.__orb={
      move:function(dx,dy){ vx+=dx; vy+=dy; },
      note:note,
      set:function(next){
        for(var k in next) state[k]=next[k];
        document.getElementById("s").textContent = state.doing || (state.working?"minding the shop":"shop is quiet");
        document.getElementById("k").textContent = state.taken + " LISTED · " + state.budget + " LIVE";
      }};
  })();
  </script>
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
    /* Below the orb's own 216, or minSize silently widens it and the squircle
       comes out a fat pill — setFrame is constrained by this, not just the
       user's drag. Every other shape is far above it. */
    win.minSize = NSSize(width: 200, height: 56)
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
    /*
     * The material is per-shape, not fixed. `.hudWindow` is a heavy, nearly
     * opaque slab — fine behind a page, but as the orb it turned the glass
     * into a grey stone: you could not see what was behind the window, only
     * that something was. Clear glass is the thinnest stock material there
     * is, and the blur it still does is the glass part. See `materialFor`.
     */
    fx.material = Shell.materialFor(.orb)
    fx.isEmphasized = false
    fx.appearance = Shell.appearanceFor(.orb)
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

    let label = NSTextField(labelWithString: "flip")
    label.font = NSFont.systemFont(ofSize: 13, weight: .medium)
    label.textColor = NSColor.labelColor
    label.lineBreakMode = .byTruncatingTail
    label.isSelectable = false
    container.addSubview(label)

    container.onTap = { [weak self] in
      guard let self = self else { return }
      guard self.shape == .orb else { return }
      /* The orb page never receives the mouse — ChromeView takes it so the
         thing can be dragged — so the press is played from here instead. */
      self.orb?.evaluateJavaScript(
        "document.body.classList.add('press');setTimeout(function(){document.body.classList.remove('press')},150)",
        completionHandler: nil)
      self.applyShape(.working, animated: true)
    }

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
     * The orb sits above everything and takes the whole window when it is the
     * shape. It shares the message handler, so a click in there is the same
     * kind of message the agent sends — there is only one way into Swift.
     */
    /*
     * The frost.
     *
     * .withinWindow blurs what is BEHIND it inside this same window — which is
     * the live page. So folded away, the board is not a dim rectangle under
     * the glass, it is genuinely frosted: the cursor moving, a thread opening,
     * a reply going in, all of it soft and unreadable and obviously alive.
     *
     * It is added before the orb, so the order from back to front is
     * page → frost → glass.
     */
    let frosted = NSVisualEffectView(frame: container.bounds)
    frosted.material = .underPageBackground
    frosted.blendingMode = .withinWindow
    frosted.state = .active
    frosted.wantsLayer = true
    frosted.layer?.masksToBounds = true
    /* No alphaValue. Anything under 1 composites the effect view into its own
       transparency layer and the backdrop sampling degrades — which is how a
       blur turns into a flat grey sheet. Soften with the material, never with
       opacity. */
    container.addSubview(frosted)
    frost = frosted

    let orbConfig = WKWebViewConfiguration()
    orbConfig.websiteDataStore = WKWebsiteDataStore.nonPersistent()
    orbConfig.userContentController.add(self, name: "organic")
    let orbView = WKWebView(frame: container.bounds, configuration: orbConfig)
    if orbView.responds(to: NSSelectorFromString("setDrawsBackground:")) {
      orbView.setValue(false, forKey: "drawsBackground")
    }
    orbView.wantsLayer = true
    orbView.layer?.masksToBounds = true
    /*
     * Which build this is, on the glass.
     *
     * Three rounds went into arguing about fixes that were already made,
     * because the app on his desk and the app in the checkout were different
     * builds and neither of us could tell by looking. The launcher exports
     * FLIP_BUILD; the orb wears the last five digits of it beside its name.
     * Baked into the HTML rather than evaluated afterwards, because there is
     * no didFinish here and a script that races the load paints nothing.
     *
     * If the number on the glass is not the number I packed, the problem is
     * the install, not the code.
     */
    let stamp = ProcessInfo.processInfo.environment["FLIP_BUILD"] ?? ""
    orbBuild = stamp.isEmpty ? "" : String(stamp.suffix(5))
    orbView.loadHTMLString(
      Shell.orbHTML.replacingOccurrences(
        of: "{{BUILD}}", with: orbBuild.isEmpty ? "" : " \u{00B7} " + orbBuild),
      baseURL: nil)
    container.addSubview(orbView)
    orb = orbView

    /* Folding it back away. Deliberately small and quiet: the window is for
       the page, not for its own controls. */
    let back = NSButton(title: "Fold away", target: self, action: #selector(foldAway))
    back.isBordered = false
    back.wantsLayer = true
    back.font = NSFont.systemFont(ofSize: 11.5, weight: .semibold)
    back.contentTintColor = NSColor.labelColor
    back.toolTip = "Fold back into the orb (esc)"
    if let layer = back.layer {
      layer.cornerRadius = 11
      layer.cornerCurve = .continuous
      layer.backgroundColor = NSColor.labelColor.withAlphaComponent(0.09).cgColor
    }
    container.addSubview(back)
    collapse = back

    /*
     * Signing in, made into two buttons instead of an explanation.
     *
     * Google, Apple and Facebook all refuse OAuth inside an embedded browser
     * — their anti-phishing rule, and nothing this app does can change it. And
     * a login cannot be carried over from Chrome: its cookies are encrypted
     * against a Keychain key only Chrome can use, and Depop binds a session
     * to the browser that made it anyway.
     *
     * He signed up with Google, so there is no password to fall back on — and
     * a reset works anyway, even on an account that never had one. So: one
     * button opens Depop's login in his OWN browser, where "Forgot password"
     * is on screen and the reset mail can be opened; the other opens the
     * email-and-password form in here, where the session is kept.
     */
    let setPass = NSButton(title: "Reset password", target: self, action: #selector(openSecurityInBrowser))
    let signIn = NSButton(title: "Sign in to Depop", target: self, action: #selector(openDepopLogin))
    for (button, tip) in [
      (setPass, "Opens Depop in your own browser — use Forgot password there"),
      (signIn, "Opens Depop's email and password form in here"),
    ] {
      button.isBordered = false
      button.wantsLayer = true
      button.font = NSFont.systemFont(ofSize: 11.5, weight: .semibold)
      button.contentTintColor = NSColor.labelColor
      button.toolTip = tip
      button.layer?.cornerRadius = 11
      button.layer?.cornerCurve = .continuous
      button.layer?.backgroundColor = NSColor.labelColor.withAlphaComponent(0.09).cgColor
      container.addSubview(button)
    }
    let bring = NSButton(title: "Paste login", target: self, action: #selector(importCookiesFromClipboard))
    /* Shown only when the page says he is signed out. Four permanent chips
       sitting over the panel was the pile-up he had to point at twice. */
    bring.isBordered = false
    bring.wantsLayer = true
    bring.font = NSFont.systemFont(ofSize: 11.5, weight: .semibold)
    bring.contentTintColor = NSColor.labelColor
    bring.toolTip = "In Chrome on depop.com: ⌥⌘I → Application → Cookies → select the rows → copy. Then press this."
    bring.layer?.cornerRadius = 11
    bring.layer?.cornerCurve = .continuous
    bring.layer?.backgroundColor = NSColor.labelColor.withAlphaComponent(0.09).cgColor
    container.addSubview(bring)

    passwordButton = setPass
    signInButton = signIn
    pasteButton = bring

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
    /* setFrameAutosaveName only registers the name for SAVING. Restoring a
       window built in code needs setFrameUsingName, so without this it was
       centred on every launch and the saved frame was written and ignored. */
    win.setFrameAutosaveName("FlipBoard")
    if !win.setFrameUsingName("FlipBoard") { win.center() }
    applyShape(.orb, animated: false)

    /* Escape folds it away from wherever the hand is — including from inside
       a page, which is where it always is. A local monitor sees the key before
       the web view swallows it. */
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      guard let self = self else { return event }
      if event.keyCode == 53 && self.shape != .orb {
        self.foldAway()
        return nil
      }
      return event
    }

    NotificationCenter.default.addObserver(
      self, selector: #selector(windowResized(_:)),
      name: NSWindow.didResizeNotification, object: win)

    /* Real glass answers to being moved. Every step of a drag is handed to the
       orb as a delta, and the canvas leans its highlight and bends its water
       against it — so light slides across the surface while it travels and
       settles a beat after it stops, instead of being painted on. */
    NotificationCenter.default.addObserver(
      self, selector: #selector(windowMoved(_:)),
      name: NSWindow.didMoveNotification, object: win)

    win.orderFrontRegardless()
  }

  /** Every web view this app makes, made the same way. */
  func makeWebView(_ config: WKWebViewConfiguration) -> WKWebView {
    let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 400, height: 400), configuration: config)
    view.navigationDelegate = self
    view.uiDelegate = self
    view.allowsBackForwardNavigationGestures = true
    /*
     * It is a phone, because that is the thing that actually signs in.
     *
     * Google refuses OAuth to an embedded browser it can identify, and a Mac
     * WebKit is one it identifies instantly — which is every dead "Continue
     * with Google" click so far. On an iPhone user agent it is served the
     * mobile flow instead, which is the same reason the organic app signs in
     * without a fight. Set FLIP_UA=mac to go back to the desktop claim.
     */
    if ProcessInfo.processInfo.environment["FLIP_UA"] != "mac" {
      view.customUserAgent = iphoneUA
    }
    /* Private, and the only way to a transparent web view. Guarded because an
       NSUnknownKeyException from AppKit cannot be caught in Swift: the day the
       key goes, this is a launch crash with no alert, which from the outside
       looks exactly like "the window never opened". */
    if view.responds(to: NSSelectorFromString("setDrawsBackground:")) {
      view.setValue(false, forKey: "drawsBackground")
    }
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
    /*
     * One jar, always, and never conditionally.
     *
     * This used to hand out a per-pane store keyed to a UUID, and I then put a
     * guard on it — so it silently started answering with a DIFFERENT store
     * and his Depop session was left in the old one. A signed-in app became a
     * signed-out app because of a safety fix. Whatever this returns must never
     * change again: the default store is stable, survives quitting, and needs
     * no bundle identity, which this process does not have anyway.
     */
    return WKWebsiteDataStore.default()
  }

  // MARK: shapes

  func sizeFor(_ s: Shape) -> NSSize {
    switch s {
    case .orb: return orbSize
    case .pill: return pillSize
    case .working: return workingSize
    case .desk: return deskSize
    }
  }


  /**
   * Which material each shape is made of.
   *
   * He asked for both traits at once: "I want to be able to also see your chat
   * through the back ... clear transparent but also glass like transformation."
   * Those are not in tension — a blur IS still a blur when the tint over it is
   * thin. What killed it was `.hudWindow`, whose tint is nearly opaque, so the
   * blur had nothing left to show. `.underWindowBackground` is the thinnest
   * stock material macOS has: it samples and blurs the desktop the same way
   * and puts almost no colour over the top, so what is behind the window reads
   * through it, softened rather than hidden. That is liquid glass.
   *
   * Never reach for alphaValue to get here. Anything under 1 composites the
   * effect view into its own transparency layer and the backdrop sampling
   * degrades to a flat wash — clear in the wrong way, and no longer glass.
   *
   * The page shapes keep the solid material: a web view is drawn on top of it
   * anyway, and a thin material under a scrolling page is just noise.
   */
  static func materialFor(_ s: Shape) -> NSVisualEffectView.Material {
    switch s {
    case .orb, .pill: return .fullScreenUI
    default: return .hudWindow
    }
  }

  /**
   * Smoked, not milky — and the reason the last one came out white.
   *
   * A thin material takes its tint from the system appearance. His desktop is
   * light, so light mode gave the glass a WHITE tint, laid it over a white
   * page, and the blur had nothing to show through it. Clear in the wrong
   * direction: the tint went pale instead of going away.
   *
   * Pinning the effect view to dark appearance fixes it without touching the
   * blur. The tint becomes a dark smoke, everything behind the window reads
   * through it the way it does through sunglasses, and the white type on the
   * glass keeps its contrast for free. That is both traits at once — clear
   * enough to see his chat, still genuinely refracting.
   *
   * Only the glass is pinned, never the window: the page shapes have to follow
   * light and dark like anything else on the Mac.
   */
  static func appearanceFor(_ s: Shape) -> NSAppearance? {
    switch s {
    case .orb, .pill: return NSAppearance(named: .darkAqua)
    default: return nil
    }
  }
  func radiusFor(_ s: Shape) -> CGFloat {
    switch s {
    /* 26% of the side is Apple's own squircle proportion — the icon grid, the
       Watch, a Sonoma window. Rounder than that reads as a bubble toy; squarer
       reads as a dialog box. */
    case .orb: return orbSize.width * 0.26
    case .pill: return pillSize.height / 2
    case .working: return 46   // an iPhone's own corner
    case .desk: return 28
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
    /* A shape change moves the window by hundreds of points with the top edge
       pinned, and windowMoved would hand every step of that to the glass as a
       drag — so folding away threw the light across the surface and slammed
       the specular to its clamp for a second, every single time. */
    changingShape = true
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

    /*
     * Clear when it is a piece of glass, solid when it is a window onto a
     * page. Set before the frame animates so the material crosses over with
     * the shape rather than a beat after it.
     */
    effect?.material = Shell.materialFor(s)
    effect?.isEmphasized = false
    effect?.appearance = Shell.appearanceFor(s)

    let radius = radiusFor(s)
    body?.layer?.cornerRadius = radius
    effect?.layer?.cornerRadius = radius
    /* .continuous is the squircle. Without it these are circular corners and
       the whole thing reads as a bubble toy rather than a piece of Apple. */
    body?.layer?.cornerCurve = .continuous
    effect?.layer?.cornerCurve = .continuous
    orb?.layer?.cornerRadius = radius
    orb?.layer?.cornerCurve = .continuous

    lastOrigin = frame.origin
    if animated {
      /*
       * Surface tension, not a dialog box.
       *
       * The curve overshoots slightly on the way out and settles back, the way
       * a drop of water does when it lands. The corner radius rides the same
       * timing on the layers, so the shape rounds off as it closes instead of
       * snapping square the moment the frame arrives.
       */
      let curve = CAMediaTimingFunction(controlPoints: 0.22, 1.2, 0.28, 1)
      for layer in [body?.layer, effect?.layer] {
        guard let layer = layer else { continue }
        let anim = CABasicAnimation(keyPath: "cornerRadius")
        anim.fromValue = layer.cornerRadius
        anim.toValue = radius
        anim.duration = 0.44
        anim.timingFunction = curve
        layer.add(anim, forKey: "cornerRadius")
      }
      NSAnimationContext.runAnimationGroup({ context in
        context.duration = 0.44
        context.timingFunction = curve
        context.allowsImplicitAnimation = true
        win.animator().setFrame(frame, display: true)
      }, completionHandler: {
        self.lastOrigin = win.frame.origin
        self.changingShape = false
        self.layoutChrome()
      })
    } else {
      win.setFrame(frame, display: true)
      changingShape = false
    }
    layoutChrome()
  }

  @objc func windowResized(_ note: Notification) {
    layoutChrome()
  }

  /// Where it was last time it reported in, so a move is a direction.
  var lastOrigin: NSPoint?
  /// True while the window is moving because the shape changed, not the hand.
  var changingShape = false

  @objc func windowMoved(_ note: Notification) {
    guard let win = window else { return }
    let origin = win.frame.origin
    defer { lastOrigin = origin }
    guard shape == .orb, !changingShape, let previous = lastOrigin else { return }
    let dx = Double(origin.x - previous.x)
    let dy = Double(origin.y - previous.y)
    if abs(dx) < 0.5 && abs(dy) < 0.5 { return }
    orb?.evaluateJavaScript("window.__orb&&window.__orb.move(\(dx),\(dy))", completionHandler: nil)
  }

  /** Put the panes and the status line where this shape wants them. */
  func layoutChrome() {
    guard let container = body else { return }
    let bounds = container.bounds
    var frames: [NSRect] = []

    /* The orb owns the whole window and nothing else is on screen — no panes,
       no status line, no button. A piece of glass with one thing in it. */
    orb?.frame = bounds
    orb?.isHidden = shape != .orb
    frost?.isHidden = true
    collapse?.isHidden = shape == .orb || shape == .pill
    if shape == .working {
      /*
       * One control: a small X, top right, over the page.
       *
       * The sign-in chips appear only while `signedOut` is true — which the
       * worker sets from what the page actually says — and disappear the
       * moment he is in. Permanent furniture on a phone is furniture in the
       * way.
       */
      collapse?.title = "\u{2715}"
      collapse?.frame = NSRect(x: bounds.width - 40, y: bounds.height - 44, width: 28, height: 28)
      collapse?.layer?.cornerRadius = 14
      collapse?.layer?.backgroundColor = NSColor.labelColor.withAlphaComponent(0.10).cgColor

      let chipY: CGFloat = 26
      signInButton?.frame = NSRect(x: 12, y: chipY, width: 100, height: 26)
      passwordButton?.frame = NSRect(x: 116, y: chipY, width: 104, height: 26)
      pasteButton?.frame = NSRect(x: 224, y: chipY, width: 92, height: 26)
      for chip in [signInButton, passwordButton, pasteButton] {
        chip?.layer?.cornerRadius = (chip?.frame.height ?? 22) / 2
      }
    } else {
      let chipY = bounds.height - headerHeight + 5
      for chip in [collapse, signInButton, passwordButton] { chip?.layer?.cornerRadius = 11 }
      collapse?.frame = NSRect(x: bounds.width - 96, y: chipY, width: 82, height: 22)
      signInButton?.frame = NSRect(x: bounds.width - 96 - 126, y: chipY, width: 118, height: 22)
      passwordButton?.frame = NSRect(x: bounds.width - 96 - 126 - 118, y: chipY, width: 110, height: 22)
    }
    /* Only on the phone, and only while the page says he is signed out. */
    let showSignIn = shape == .working && signedOut
    passwordButton?.isHidden = !showSignIn
    signInButton?.isHidden = !showSignIn
    pasteButton?.isHidden = !showSignIn
    /* Hidden on the phone as well as the orb — left visible, the green dot and
       the word "flip" paint over the top of the 393-wide phone, exactly where
       the agent draws the island. */
    statusDot?.isHidden = shape == .orb || shape == .working
    statusLabel?.isHidden = shape == .orb || shape == .working
    if shape == .orb {
      /*
       * Nothing behind the glass but the desktop.
       *
       * The page used to run underneath at 55%, so the blur was blurring
       * Depop — which is white — and the whole thing came out as milk. Glass
       * shows what is BEHIND THE WINDOW; anything inside it is a wall. The
       * work goes on the board and in the telemetry, where it can be read,
       * rather than smeared under a tint where it cannot.
       */
      for pane in panes {
        pane.view.isHidden = true
        pane.view.layer?.borderWidth = 0
      }
      /* And no second effect view either: .withinWindow blurs the window's own
         contents, which is now nothing, and it was the other half of the milk. */
      frost?.isHidden = true
      /* Nothing here is a pane. The whole orb is a handle, so it drags — and
         ChromeView calls back on a mouse-up that never moved, which is the
         click that opens it. */
      container.paneFrames = []
      return
    }

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
        /* Edge to edge. A phone has no title bar and no gutter — the bezel,
           the island and the home bar are drawn by the agent inside the page,
           so anything native around it would read as a window again. */
        for (index, pane) in panes.enumerated() {
          if index == activePane {
            pane.view.isHidden = false
            pane.view.frame = bounds
            /*
             * The page is edge to edge, but it does not get the whole surface
             * to touch.
             *
             * paneFrames is hit-testing only, never layout, so the top strip
             * can belong to the window while the page still draws under it.
             * Without this the phone had nothing left to take hold of — the
             * pane covered every pixel, so every drag went into Depop and the
             * window could not be moved at all. The strip is the width of the
             * close chip's row, which is where a hand reaches anyway.
             */
            var hit = bounds
            hit.size.height -= handleStrip
            frames.append(hit)
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
      pane.view.layer?.cornerCurve = .continuous
      if let layer = pane.view.layer {
        // The phone keeps the window's own corner; the desk's panes are cards.
        layer.cornerRadius = shape == .working ? radiusFor(.working) : 10
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
    /* Guarded like the other two. This runs during launch, four times, and an
       NSUnknownKeyException out of AppKit cannot be caught in Swift — so the
       day this key goes it is a dead Dock icon with no alert. */
    if config.preferences.responds(to: NSSelectorFromString("setDeveloperExtrasEnabled:")) {
      config.preferences.setValue(true, forKey: "developerExtrasEnabled")
    }
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
    /* Below the frost, always. addSubview appends to the FRONT, so a rebuilt
       pane landed on top of the frost, the glass and all three chips — the orb
       showed the raw page through nothing, and every button stopped responding
       because the web view was now the frontmost thing under the mouse. */
    if let frosted = frost {
      container.addSubview(view, positioned: .below, relativeTo: frosted)
    } else {
      container.addSubview(view)
    }
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
      case "orb": applyShape(.orb, animated: true)
      case "pill": applyShape(.pill, animated: true)
      case "desk": applyShape(.desk, animated: true)
      case "working": applyShape(.working, animated: true)
      default: break
      }
    /* The line, the dot, and the day's count — for the pill and for the glass. */
    case "status":
      if let out = obj["signedOut"] as? Bool, out != signedOut {
        signedOut = out
        layoutChrome()
      }
      setStatus(obj["text"] as? String, dot: obj["dot"] as? String)
      /* A telemetry line, if this status carried one. */
      if let note = obj["note"] as? String, !note.isEmpty,
         let data = try? JSONSerialization.data(withJSONObject: [note], options: []),
         let wrapped = String(data: data, encoding: .utf8) {
        let literal = String(wrapped.dropFirst().dropLast())
        orb?.evaluateJavaScript("window.__orb&&window.__orb.note(\(literal))", completionHandler: nil)
      }
      let taken = (obj["taken"] as? Int) ?? -1
      let budget = (obj["budget"] as? Int) ?? -1
      if taken >= 0 && budget > 0 {
        orb?.evaluateJavaScript(
          "window.__orb&&window.__orb.set({taken:\(taken),budget:\(budget)})",
          completionHandler: nil)
      }
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

  /*
   * A pop-up is not a dead end.
   *
   * Sign-in flows open a second window and WebKit answers nil unless the app
   * says otherwise — so the click did nothing at all, silently, which is
   * exactly what he saw. Loading it in the same view keeps the flow alive and
   * keeps it inside the one cookie jar that is signed in.
   */
  func webView(_ view: WKWebView, createWebViewWith config: WKWebViewConfiguration,
               for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if action.targetFrame == nil, let url = action.request.url {
      view.load(URLRequest(url: url))
    }
    return nil
  }

  /** A site's own alert, shown as the app's. Unanswered dialogs hang a page. */
  func webView(_ view: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler done: @escaping () -> Void) {
    let alert = NSAlert()
    alert.messageText = "flip"
    alert.informativeText = message
    alert.runModal()
    done()
  }

  /** His own browser, at Depop's login, where Forgot password lives.
   *
   *  Not a deep link to a reset page: Depop refuses requests from here so that
   *  path could not be verified, and a button that lands on a 404 is worse
   *  than one that lands a click away. */
  @objc func openSecurityInBrowser() {
    guard let url = URL(string: "https://www.depop.com/login/") else { return }
    NSWorkspace.shared.open(url)
    note("there: Forgot password → check your mail → set one. Then Sign in to Depop here.")
  }

  /*
   * Bring the session over from Chrome, by hand, once.
   *
   * He has asked for this repeatedly and he is right that it is the shortest
   * path — Google will not do OAuth inside an embedded browser, ever, so the
   * session has to be made somewhere Google trusts and carried here.
   *
   * What cannot be done is reaching INTO Chrome: its cookies are sealed with a
   * Keychain key only Chrome can use. What can be done is this — he copies
   * them out himself and presses one button. The cookies are parsed, written
   * into the app's own persistent store for .depop.com, and the page reloads
   * signed in. Once, and it stays.
   */
  @objc func importCookiesFromClipboard() {
    let text = NSPasteboard.general.string(forType: .string) ?? ""
    guard !text.isEmpty else {
      note("copy your Depop cookies in Chrome first — then press this")
      return
    }

    /*
     * Two shapes, because the two ways a person gets this look nothing alike.
     *
     * The one that matters is the DevTools cookie table: name, value, domain,
     * … separated by TABS, with no "=" in the row at all. Splitting that on
     * the first "=" dropped every clean row and, worse, mangled the ones whose
     * value is a JWT — the "=" landed inside the value, so the name came out
     * as "sessionId<tab>eyJhbGci…" and a junk cookie was written and counted.
     * He would have read "brought 6 cookies over" and still been signed out.
     *
     * The other shape, a document.cookie string, is accepted but cannot carry
     * a session on its own: Chrome never exposes HttpOnly cookies to it, and
     * Depop's session is HttpOnly. The table is the route.
     */
    var pairs: [(String, String)] = []
    for line in text.components(separatedBy: CharacterSet(charactersIn: ";\n\r")) {
      let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmed.isEmpty { continue }
      var name = ""
      var value = ""
      if trimmed.contains("\t") {
        let columns = trimmed.components(separatedBy: "\t")
        if columns.count < 2 { continue }
        name = columns[0].trimmingCharacters(in: .whitespaces)
        value = columns[1].trimmingCharacters(in: .whitespaces)
      } else {
        guard let split = trimmed.firstIndex(of: "=") else { continue }
        name = String(trimmed[trimmed.startIndex..<split]).trimmingCharacters(in: .whitespaces)
        value = String(trimmed[trimmed.index(after: split)...]).trimmingCharacters(in: .whitespaces)
      }
      // The table's own header row comes along with a select-all.
      if name.isEmpty || value.isEmpty || name.lowercased() == "name" { continue }
      pairs.append((name, value))
    }

    guard !pairs.isEmpty else {
      note("that did not look like cookies — select the rows in DevTools and copy")
      return
    }

    /* Hoisted: enter() was unconditional and leave() only ran when the store
       existed, so a nil pane left the group unbalanced and notify never fired
       — the reload silently never happened and every press leaked another. */
    guard let store = web?.configuration.websiteDataStore.httpCookieStore else {
      note("open the window first, then paste")
      return
    }

    var written = 0
    let group = DispatchGroup()
    for (name, value) in pairs {
      guard let cookie = HTTPCookie(properties: [
        .domain: ".depop.com",
        .path: "/",
        .name: name,
        .value: value,
        .secure: "TRUE",
        .expires: Date(timeIntervalSinceNow: 60 * 60 * 24 * 365),
      ]) else { continue }
      written += 1
      group.enter()
      store.setCookie(cookie) { group.leave() }
    }

    note("brought \(written) cookies over — reloading")
    group.notify(queue: .main) {
      if let url = URL(string: "https://www.depop.com/") {
        self.web?.load(URLRequest(url: url))
      }
    }
  }

  /** Depop's email-and-password form, in here, where the session is kept. */
  @objc func openDepopLogin() {
    guard let url = URL(string: "https://www.depop.com/login/") else { return }
    applyShape(.working, animated: true)
    web?.load(URLRequest(url: url))
    reachEmailForm()
  }

  /**
   * Straight to the email form, past the two buttons that cannot work.
   *
   * Depop's sign-in sheet leads with "Continue with Google" and "Continue with
   * Apple". Neither of those can complete inside ANY embedded web view — Google
   * refuses the flow outright and Apple's needs a real browser session — so the
   * first two things on screen are dead ends, and pressing them and getting
   * nothing is exactly the "we cannot connect" he keeps hitting. The third one,
   * "Continue with email", is a plain form and works.
   *
   * So it is pressed for him. The page is a React app that mounts whenever it
   * mounts, so this looks for the control rather than waiting a fixed time, and
   * gives up after eight seconds rather than clicking something else later.
   */
  func reachEmailForm() {
    let find = """
    (function(){
      var want = /continue with email|log in with email|sign in with email/i;
      var nodes = document.querySelectorAll('button,a,[role=button]');
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!want.test((n.textContent || '').trim())) continue;
        if (!n.offsetParent && n.offsetHeight === 0) continue;
        n.click();
        return true;
      }
      return document.querySelector('input[type=password]') != null;
    })()
    """
    var tries = 0
    let timer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [weak self] t in
      tries += 1
      guard let self = self, let view = self.web, tries <= 20 else { t.invalidate(); return }
      view.evaluateJavaScript(find) { result, _ in
        if (result as? Bool) == true { t.invalidate() }
      }
    }
    /* Loose: it is looking for a button, not keeping time. */
    timer.tolerance = 0.1
  }

  /** Fold the window back into the orb. The button and the esc key both land here. */
  @objc func foldAway() {
    applyShape(.orb, animated: true)
  }

  /** The pill's dot and its one line. */
  func setStatus(_ text: String?, dot: String?) {
    if let text = text {
      statusLabel?.stringValue = text
      /* The same words on the glass. The orb is not a second screen to keep
         in sync by hand — it is told whatever the status line is told. */
      if let data = try? JSONSerialization.data(withJSONObject: [text], options: []),
         let wrapped = String(data: data, encoding: .utf8) {
        let literal = String(wrapped.dropFirst().dropLast())
        orb?.evaluateJavaScript("window.__orb&&window.__orb.set({doing:\(literal)})", completionHandler: nil)
      }
    }
    if let working = dot {
      let awake = working != "grey" && working != "gray"
      orb?.evaluateJavaScript("window.__orb&&window.__orb.set({working:\(awake)})", completionHandler: nil)
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
/* Cmd-W folds it away. It was bound to hide, which is a duplicate of Cmd-H
   and not what Cmd-W does in any other app on the machine. */
appMenu.addItem(withTitle: "Fold away", action: #selector(Shell.foldAway), keyEquivalent: "w")
appMenu.addItem(withTitle: "Hide", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
appMenu.addItem(NSMenuItem.separator())
appMenu.addItem(withTitle: "Quit flip", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
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
