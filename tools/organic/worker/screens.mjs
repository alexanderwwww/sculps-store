/**
 * The screens: one page per id, a live picture of each, and a way in.
 *
 * Four ids exist — instagram, tiktok, youtube, market — and never more. A
 * page is created only here; every task borrows one of these and none makes
 * its own. After a restart the pages already open in Chrome are adopted by
 * host, so an update never leaves a second Instagram behind, and anything
 * that is not one of ours is closed.
 *
 * The picture is CDP's own screencast: Chrome paints the page and hands over
 * a JPEG of it, which the window shows. Nothing is drawn inside the page — a
 * crew cursor is an event this class emits and the window draws it.
 *
 * The way in is CDP input: while Alex has a screen focused, his mouse and
 * keyboard are forwarded into it, so a sign-in is his own hands on the real
 * page and no password ever passes through the app.
 */
import { EventEmitter } from "node:events";
import { ask, sleep } from "./chrome.mjs";

export const IDS = ["instagram", "tiktok", "youtube", "market"];

export const HOME = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/",
  youtube: "https://www.youtube.com/",
  market: "https://www.facebook.com/ads/library/",
};

export const LOGIN = {
  instagram: "https://www.instagram.com/accounts/login/",
  tiktok: "https://www.tiktok.com/login",
  youtube: "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/",
};

/** Which id a page belongs to, judged by its host. */
export function idForUrl(url) {
  let host = "";
  try { host = new URL(url).hostname; } catch { return null; }
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)youtube\.com$/.test(host)) return "youtube";
  if (/(^|\.)facebook\.com$/.test(host)) return "market";
  // A Google sign-in page belongs to the youtube screen.
  if (/(^|\.)google\.com$/.test(host)) return "youtube";
  return null;
}

/** Test hook: a host map for stubbed sites, keyed by id → hostname. */
export function idForUrlWith(extra, url) {
  try {
    const host = new URL(url).hostname;
    for (const [id, h] of Object.entries(extra)) if (host === h) return id;
  } catch { /* fall through */ }
  return idForUrl(url);
}

// An error page (offline, DNS) has no host to adopt by; it is a blank worth reusing, not a stranger.
const isBlank = (url) => url === "about:blank" || url === "" || url === "chrome://newtab/" || url.startsWith("chrome-error://");

/** CDP modifier bits — the UI sends the same mask. */
export const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

const VK = {
  Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, Pause: 19, CapsLock: 20,
  Escape: 27, " ": 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46, Meta: 91,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117, F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
  ";": 186, "=": 187, ",": 188, "-": 189, ".": 190, "/": 191, "`": 192, "[": 219, "\\": 220, "]": 221, "'": 222,
};

/**
 * On a Mac, Chrome does not turn a synthetic ⌘V into a paste by itself: the
 * editing command has to ride along with the key event (what Playwright does
 * for its own keyboard). Without this, pasting a password into a sign-in
 * screen types nothing.
 */
const MAC_COMMANDS = {
  "Meta+KeyA": "selectAll", "Meta+KeyC": "copy", "Meta+KeyX": "cut", "Meta+KeyV": "paste",
  "Meta+KeyZ": "undo", "Shift+Meta+KeyZ": "redo",
  "Meta+Backspace": "deleteToBeginningOfLine", "Meta+ArrowLeft": "moveToLeftEndOfLine", "Meta+ArrowRight": "moveToRightEndOfLine",
  "Shift+Meta+ArrowLeft": "moveToLeftEndOfLineAndModifySelection", "Shift+Meta+ArrowRight": "moveToRightEndOfLineAndModifySelection",
};
function macCommands(code, modifiers) {
  if (process.platform !== "darwin" || !(modifiers & MOD.meta)) return [];
  const parts = [];
  if (modifiers & MOD.shift) parts.push("Shift");
  if (modifiers & MOD.ctrl) parts.push("Control");
  if (modifiers & MOD.alt) parts.push("Alt");
  parts.push("Meta", code);
  const c = MAC_COMMANDS[parts.join("+")];
  return c ? [c] : [];
}

function virtualKey(key) {
  if (!key) return 0;
  if (VK[key] !== undefined) return VK[key];
  if (key.length === 1) {
    const c = key.toUpperCase().charCodeAt(0);
    if (c >= 48 && c <= 57) return c;
    if (c >= 65 && c <= 90) return c;
    const shifted = ")!@#$%^&*(".indexOf(key);
    if (shifted >= 0) return 48 + shifted;
  }
  return 0;
}

/** Width and height from a JPEG's start-of-frame marker. */
export function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { w: 0, h: 0 };
}

/** What the market screen says it is: a Mac, not a phone. */
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/140.0.0.0 Safari/537.36";

export class Screens extends EventEmitter {
  /**
   * @param browser a Playwright browser from openChrome
   * @param opts.hosts optional id → hostname map for stubbed sites (tests)
   */
  constructor(browser, { hosts = {} } = {}) {
    super();
    this.browser = browser;
    this.hosts = hosts;
    this.pages = new Map();     // id → Page
    this.streams = new Map();   // id → { session, opts, lastAt, stopping }
    this.focused = null;
    // Four tiles at once: enough to see movement, not enough to cost the Mac
    // anything. The focused screen is where the frames are spent.
    this.grid = { width: 600, quality: 40, fps: 5 };
    this.full = { width: 1280, quality: 60, fps: 12 };
    this._pausedByFocus = new Set();
    this.spare = [];            // blank pages worth reusing (the first tab Chrome opens)
    this._ctx = null;
  }

  /** The one context. Never a second. */
  async context() {
    if (this._ctx) return this._ctx;
    const existing = this.browser.contexts();
    this._ctx = existing[0] ?? (await this.browser.newContext());
    return this._ctx;
  }

  /**
   * How many pages are actually open, right now.
   *
   * The invariant Alex can see from across the room — one per screen and no
   * strays — so it is reported rather than assumed. Synchronous on purpose:
   * the status message is built without awaiting anything.
   */
  livePages() {
    return this._ctx ? this._ctx.pages().filter((p) => !p.isClosed()).length : 0;
  }

  _idFor(url) {
    return idForUrlWith(this.hosts, url);
  }

  /**
   * Take over what is already open. Called once on boot: an update restarts
   * the worker but not Chrome, so the pages are still there with their
   * sessions. One per id is kept; duplicates and strangers are closed;
   * blank tabs are kept as spares for open().
   */
  async adopt() {
    const ctx = await this.context();
    for (const page of ctx.pages()) {
      if (page.isClosed()) continue;
      const url = page.url();
      if (isBlank(url)) { this.spare.push(page); continue; }
      const id = this._idFor(url);
      if (id && !this._live(id)) { this.pages.set(id, page); continue; }
      await page.close().catch(() => {});
    }
    return [...this.pages.keys()];
  }

  _live(id) {
    const p = this.pages.get(id);
    return p && !p.isClosed() ? p : null;
  }

  /** The page for an id, or null if it has not been opened. */
  page(id) {
    return this._live(id);
  }

  /**
   * The page for an id, created if needed. A page already on the site is
   * left where it is — navigating it away is how a sign-in gets lost. A
   * blank one is sent to `url`.
   */
  async open(id, url) {
    if (!IDS.includes(id)) throw new Error(`no such screen: ${id}`);
    let page = this._live(id);
    if (!page) {
      const ctx = await this.context();
      // A page on the right host that appeared since adopt() (a restart race).
      page = ctx.pages().find((p) => !p.isClosed() && !isBlank(p.url()) && this._idFor(p.url()) === id && ![...this.pages.values()].includes(p));
      if (!page) {
        while (this.spare.length && (this.spare[0].isClosed() || !isBlank(this.spare[0].url()))) this.spare.shift();
        page = this.spare.shift() ?? (await ctx.newPage());
      }
      this.pages.set(id, page);
      page.once("close", () => { if (this.pages.get(id) === page) this.pages.delete(id); this.stopStream(id).catch(() => {}); });
      // The browser hands out iPhones; the market screen is put back to a
      // desktop the moment it exists, before anything is loaded into it.
      if (id === "market") await this._sizePage(id, null).catch(() => {});
    }
    if (url && isBlank(page.url())) await this.navigate(id, url);
    return page;
  }

  /** Send a screen somewhere on purpose. Bounded; a failed load is not an error here. */
  async navigate(id, url, { timeout = 20000 } = {}) {
    const page = this._live(id);
    if (!page) return false;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      return true;
    } catch {
      return false;
    }
  }

  /** Close a screen (youtube, when it is not connected and not wanted). */
  async close(id) {
    await this.stopStream(id);
    const page = this._live(id);
    this.pages.delete(id);
    if (page) await page.close().catch(() => {});
  }

  /** Who holds a screen: "alex" while it is focused, else null. */
  busy(id) {
    return this.focused === id ? "alex" : null;
  }

  /** The page's own viewport, from Chrome rather than from Playwright (a CDP page has no viewportSize). */
  async viewport(id) {
    const page = this._live(id);
    const s = this.streams.get(id)?.session ?? (page ? await this._session(id) : null);
    if (!s) return { w: 1280, h: 900 };
    try {
      const m = await s.send("Page.getLayoutMetrics");
      const v = m.cssVisualViewport ?? m.visualViewport ?? {};
      const w = Math.round(v.clientWidth || m.cssLayoutViewport?.clientWidth || 1280);
      const h = Math.round(v.clientHeight || m.cssLayoutViewport?.clientHeight || 900);
      return { w, h };
    } catch {
      return { w: 1280, h: 900 };
    }
  }

  async _session(id) {
    const page = this._live(id);
    if (!page) return null;
    const have = this.streams.get(id);
    if (have?.session) return have.session;
    try {
      const session = await page.context().newCDPSession(page);
      this.streams.set(id, { session, opts: null, lastAt: 0, on: false });
      return session;
    } catch {
      return null;
    }
  }

  /* ------------------------------------------------------- the pictures */

  /**
   * Start the screencast for a screen. Frames arrive as `frame` events:
   * { id, jpeg (base64), w, h }. Every frame is acked, whether or not it is
   * forwarded, because an un-acked frame stops the stream.
   */
  async startStream(id, opts = {}) {
    const page = this._live(id);
    if (!page) return false;
    const session = await this._session(id);
    if (!session) return false;
    const st = this.streams.get(id);
    const o = { ...(this.focused === id ? this.full : this.grid), ...opts };
    if (st.on && st.opts && st.opts.width === o.width && st.opts.quality === o.quality && st.opts.fps === o.fps) return true;
    if (!st.listening) {
      st.listening = true;
      session.on("Page.screencastFrame", (ev) => this._onFrame(id, ev));
    }
    if (st.on) {
      await session.send("Page.stopScreencast").catch(() => {});
    }
    st.opts = o;
    st.on = true;
    st.lastAt = 0;
    const vp = await this.viewport(id);
    const maxHeight = Math.round((o.width * vp.h) / Math.max(1, vp.w));
    try {
      await session.send("Page.startScreencast", {
        format: "jpeg",
        quality: o.quality,
        maxWidth: o.width,
        maxHeight: Math.max(64, maxHeight),
        everyNthFrame: 1,
      });
    } catch {
      st.on = false;
      return false;
    }
    /*
     * The screencast only speaks when the page repaints. A page that has
     * settled — a login form, an error page — says nothing, so a (re)start
     * would leave the window with an old picture or none. One screenshot
     * fills the gap if no frame has come by itself.
     */
    const gen = (st.gen = (st.gen ?? 0) + 1);
    setTimeout(() => { if (st.on && st.gen === gen && !st.lastAt) this._snapshot(id, o).catch(() => {}); }, 1500);
    return true;
  }

  async _snapshot(id, o) {
    const st = this.streams.get(id);
    if (!st?.session || !st.on) return;
    const vp = await this.viewport(id);
    const scale = Math.min(1, o.width / Math.max(1, vp.w));
    const shot = await st.session.send("Page.captureScreenshot", {
      format: "jpeg", quality: o.quality,
      clip: { x: 0, y: 0, width: vp.w, height: vp.h, scale },
    });
    if (!st.on || st.lastAt) return; // a real frame arrived meanwhile
    st.lastAt = Date.now();
    let size = { w: 0, h: 0 };
    try { size = jpegSize(Buffer.from(shot.data, "base64")); } catch { /* size unknown */ }
    this.emit("frame", { id, jpeg: shot.data, w: size.w, h: size.h });
  }

  async _onFrame(id, ev) {
    const st = this.streams.get(id);
    const session = st?.session;
    if (session) session.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
    if (!st?.on) return;
    const now = Date.now();
    const gap = 1000 / (st.opts?.fps || 8);
    // Throttle to the asked fps — but never drop the first frame after a (re)start.
    if (st.lastAt && now - st.lastAt < gap) return;
    st.lastAt = now;
    let size = { w: 0, h: 0 };
    try { size = jpegSize(Buffer.from(ev.data, "base64")); } catch { /* size unknown */ }
    this.emit("frame", { id, jpeg: ev.data, w: size.w, h: size.h });
  }

  async stopStream(id) {
    const st = this.streams.get(id);
    if (!st?.on) return;
    st.on = false;
    await st.session.send("Page.stopScreencast").catch(() => {});
  }

  /**
   * Which screen is big. The focused screen streams at full size, the rest
   * at grid size; null returns everything to the grid.
   */
  /**
   * Make one screen the whole window — and make it feel like the page.
   *
   * Three things happen, and all three are about the click landing where it
   * was aimed and arriving while the hand is still there:
   *
   *   the page is resized to the window's own size, at the window's own pixel
   *   density, so the picture is sharp on a Retina screen and every coordinate
   *   maps one to one with no letterbox to guess around;
   *
   *   it is streamed at that density, so text is readable rather than a
   *   blurred-up 1280-wide photograph of it;
   *
   *   every other screen stops streaming. Nobody is looking at them, and the
   *   frames they were encoding are exactly the ones the focused screen needs.
   *
   * `view` is what the window measured: CSS pixels and devicePixelRatio.
   */
  async focus(id, view = null) {
    const next = id && IDS.includes(id) ? id : null;
    const prev = this.focused;
    this.focused = next;
    if (prev !== next) this.emit("focus", { id: next, was: prev });

    if (prev && prev !== next) await this._sizePage(prev, null);
    if (next) await this._sizePage(next, view);

    for (const [sid, st] of this.streams) {
      if (next && sid !== next) {
        // Nobody is looking: stop paying for it, and remember that it was
        // running so it comes back when the window returns to the grid.
        if (st.on) { this._pausedByFocus.add(sid); await this.stopStream(sid); }
        continue;
      }
      if (!st.on && !this._pausedByFocus.has(sid)) continue;
      this._pausedByFocus.delete(sid);
      await this.startStream(sid, sid === next ? this._fullFor(view) : this.grid);
    }
    if (!next) {
      for (const sid of [...this._pausedByFocus]) {
        this._pausedByFocus.delete(sid);
        await this.startStream(sid, this.grid);
      }
    }
    return next;
  }

  /**
   * Put Chrome's own window in front of Alex, or park it off screen again.
   *
   * For one moment — typing a password — a video of a browser is the wrong
   * thing. It is slower than the browser, it cannot show a "Continue with
   * Google" popup, and a click that arrives a second late feels broken. So
   * the sign-in happens in the real window, at the machine's own speed, and
   * the moment it is done the window goes back to -4000 where Alex never
   * sees it and the app's window is the only one again.
   */
  async showWindow(id, on) {
    const session = await this._session(id);
    if (!session) return false;
    try {
      const { windowId } = await session.send("Browser.getWindowForTarget");
      if (on) {
        await session.send("Browser.setWindowBounds", {
          windowId,
          bounds: { left: 80, top: 80, width: 1180, height: 860, windowState: "normal" },
        });
        // Raising the tab brings the window forward with it.
        await this.page(id)?.bringToFront().catch(() => {});
      } else {
        await session.send("Browser.setWindowBounds", {
          windowId,
          bounds: { left: -4000, top: -4000, width: 1280, height: 900, windowState: "normal" },
        });
      }
      return true;
    } catch {
      // Headless has no window to move. Nothing breaks; the streamed screen
      // is still there to sign in through.
      return false;
    }
  }

  /** What to stream a focused screen at, from what the window measured. */
  _fullFor(view) {
    const dpr = Math.min(2, Math.max(1, Number(view?.dpr) || 1));
    const css = Math.max(600, Math.min(1800, Math.round(Number(view?.w) || this.full.width)));
    return { width: Math.min(2400, Math.round(css * dpr)), quality: 52, fps: 15 };
  }

  /**
   * Resize the page itself. `view` null puts it back to the size the crew
   * works at, so a session after a sign-in is not laid out for whatever shape
   * the window happened to be.
   */
  /**
   * What a screen goes back to when nobody is holding it.
   *
   * Every page in this browser is an iPhone — that is how the accounts are
   * meant to look, and the mobile site is lighter to paint. The market screen
   * is the exception: the Ad Library is a desktop page and reading it through
   * a phone is reading it through a straw.
   */
  _restingView(id) {
    return id === "market"
      ? { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }
      : { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };
  }

  async _sizePage(id, view) {
    const session = await this._session(id);
    if (!session) return;
    const st = this.streams.get(id);
    if (st) { st.vp = null; st.vpAt = 0; }
    try {
      if (!view) {
        await session.send("Emulation.setDeviceMetricsOverride", this._restingView(id));
        if (id === "market") {
          /* A desktop page read on a desktop: the shape AND the name. Facebook
             serves a different Ad Library to a phone, and it is the poorer one. */
          await session.send("Emulation.setUserAgentOverride", { userAgent: DESKTOP_UA, platform: "MacIntel" }).catch(() => {});
        }
        return;
      }
      const width = Math.max(600, Math.min(1800, Math.round(Number(view.w) || 1280)));
      const height = Math.max(400, Math.min(1400, Math.round(Number(view.h) || 900)));
      await session.send("Emulation.setDeviceMetricsOverride", {
        width, height,
        deviceScaleFactor: Math.min(2, Math.max(1, Number(view.dpr) || 1)),
        mobile: false,
      });
    } catch {
      /* A page that will not be resized is still usable. */
    }
  }

  /* ------------------------------------------------------------ the way in */

  /**
   * Forward one input message from the window into a page. Coordinates are
   * normalized 0..1 over the page's viewport. Never throws.
   */
  async input(id, msg) {
    const session = await this._session(id);
    if (!session || !msg) return false;
    const modifiers = Number(msg.modifiers) || 0;
    try {
      if (msg.t === "mouse") {
        const vp = await this._vp(id);
        const x = Math.round(Math.min(1, Math.max(0, Number(msg.x) || 0)) * vp.w);
        const y = Math.round(Math.min(1, Math.max(0, Number(msg.y) || 0)) * vp.h);
        const button = ["left", "middle", "right"][Number(msg.button) || 0] ?? "left";
        if (msg.kind === "move") {
          await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, modifiers, button: msg.buttons ? button : "none" });
        } else if (msg.kind === "down" || msg.kind === "up") {
          await session.send("Input.dispatchMouseEvent", {
            type: msg.kind === "down" ? "mousePressed" : "mouseReleased",
            x, y, button, clickCount: Math.max(1, Number(msg.clicks) || 1), modifiers,
          });
        } else if (msg.kind === "wheel") {
          await session.send("Input.dispatchMouseEvent", {
            type: "mouseWheel", x, y, modifiers,
            deltaX: Number(msg.dx) || 0, deltaY: Number(msg.dy) || 0,
          });
        } else return false;
        return true;
      }
      if (msg.t === "key") {
        const key = String(msg.key ?? "");
        const code = String(msg.code ?? "");
        const text = typeof msg.text === "string" && msg.text.length ? msg.text : undefined;
        const vk = virtualKey(key);
        const base = { key, code, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
        const commands = macCommands(code, modifiers);
        if (commands.length) base.commands = commands;
        if (msg.kind === "down") {
          // With text, keyDown carries the character and Chrome inserts it.
          await session.send("Input.dispatchKeyEvent", text ? { ...base, type: "keyDown", text, unmodifiedText: text } : { ...base, type: "rawKeyDown" });
        } else if (msg.kind === "up") {
          await session.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
        } else if (msg.kind === "char") {
          if (!text) return false;
          await session.send("Input.dispatchKeyEvent", { ...base, type: "char", text, unmodifiedText: text });
        } else return false;
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  async _vp(id) {
    const st = this.streams.get(id);
    const now = Date.now();
    if (st?.vp && now - st.vpAt < 2000) return st.vp;
    const vp = await this.viewport(id);
    if (st) { st.vp = vp; st.vpAt = now; }
    return vp;
  }

  /* ------------------------------------------------------------ the crew */

  /**
   * Where the crew's hand is on a screen, for the window to draw. Nothing
   * is injected into the page. x, y in page pixels; emitted normalized.
   */
  async cursor(id, x, y, label = "") {
    const vp = await this._vp(id);
    const ev = { t: "cursor", id, x: Math.min(1, Math.max(0, x / Math.max(1, vp.w))), y: Math.min(1, Math.max(0, y / Math.max(1, vp.h))), label: String(label ?? "") };
    this.emit("cursor", ev);
    return ev;
  }

  /** Tear everything down (streams, sessions); pages stay in Chrome for the next worker. */
  async dispose() {
    for (const id of [...this.streams.keys()]) {
      await this.stopStream(id);
      const st = this.streams.get(id);
      await st?.session?.detach().catch(() => {});
    }
    this.streams.clear();
  }
}

export { ask, sleep };
