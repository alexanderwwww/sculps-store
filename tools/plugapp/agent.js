/**
 * The hands.
 *
 * One object that drives a real page the way a person does: a visible cursor
 * that travels to the thing, real mouse events (isTrusted, so the site cannot
 * tell a hand from this), real keystrokes, real scrolling. Nothing here knows
 * about Depop or Vestiaire — a shop is just a webContents. That is deliberate:
 * the same hands work on any site, and every site-specific guess lives in a
 * recipe that uses them, where it can be corrected without touching this.
 *
 * WHAT A COMMAND LOOKS LIKE
 *
 *   snap                       what is on the page: numbered things to press
 *   click   { i }              press number i          (or { text } / { selector })
 *   type    { i, text }        click it, then type     ({ clear: true } empties first)
 *   press   { key }            Enter, Tab, Escape, Backspace, ArrowDown ...
 *   scroll  { dy }             wheel, at the cursor
 *   upload  { i, files }       hand files to a file input
 *   goto    { url }
 *   wait    { ms }
 *   shot    { }                a picture of exactly what he sees, cursor included
 *
 * The numbers come from `snap` and are valid until the page changes. A click
 * on a stale number says so instead of pressing whatever moved into its place.
 *
 * Speed is the requirement, so: no fixed sleeps between actions, a move is
 * 180-420 ms however far it goes, and typing is a burst, not a crawl. The only
 * waiting is for the page itself.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The cursor. Injected into every page; follows the real mouse events. */
const OVERLAY = `
(function () {
  if (window.__plugCursor) return;
  window.__plugCursor = true;
  var el = document.createElement("div");
  el.id = "__plug_cursor";
  el.setAttribute("style", "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px);will-change:transform");
  el.innerHTML =
    '<svg width="26" height="30" viewBox="0 0 26 30" style="position:absolute;left:-2px;top:-2px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))">' +
    '<path d="M3 2 L3 23 L8.6 18.2 L12.4 27 L16.2 25.3 L12.4 16.8 L19.8 16.6 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>' +
    '<div style="position:absolute;left:20px;top:22px;padding:3px 9px;border-radius:999px;font:600 11px/1.2 -apple-system,Helvetica,Arial,sans-serif;color:#fff;background:rgba(17,17,17,.82);white-space:nowrap;letter-spacing:.02em">plug</div>';
  function put(x, y) { el.style.transform = "translate(" + x + "px," + y + "px)"; }
  function ring(x, y) {
    var r = document.createElement("div");
    r.setAttribute("style", "position:fixed;left:" + (x - 14) + "px;top:" + (y - 14) + "px;width:28px;height:28px;border-radius:50%;border:2px solid #F9A01B;z-index:2147483646;pointer-events:none;opacity:.9;transition:transform .35s ease-out,opacity .35s ease-out");
    document.documentElement.appendChild(r);
    requestAnimationFrame(function () { r.style.transform = "scale(2.1)"; r.style.opacity = "0"; });
    setTimeout(function () { r.remove(); }, 420);
  }
  addEventListener("mousemove", function (e) { put(e.clientX, e.clientY); }, true);
  addEventListener("mousedown", function (e) { ring(e.clientX, e.clientY); }, true);
  window.__plugSet = put;
  function mount() { if (document.documentElement && !el.isConnected) document.documentElement.appendChild(el); }
  mount();
  new MutationObserver(mount).observe(document, { childList: true, subtree: false });
})();
`;

/** Numbered, visible, pressable things — the page as a list of choices. */
const SNAPSHOT = `
(function () {
  var sel = 'a[href],button,input,textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[onclick],[tabindex]:not([tabindex="-1"]),label[for]';
  var seen = new Set(), out = [], n = 0;
  document.querySelectorAll("[data-plug]").forEach(function (e) { e.removeAttribute("data-plug"); });
  function label(e) {
    var t = e.getAttribute("aria-label") || (e.labels && e.labels[0] && e.labels[0].innerText) || e.innerText || e.value || e.placeholder || e.alt || e.title || e.name || "";
    return String(t).replace(/\\s+/g, " ").trim().slice(0, 90);
  }
  document.querySelectorAll(sel).forEach(function (e) {
    if (seen.has(e)) return; seen.add(e);
    var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none" || e.disabled && e.type !== "file") return;
    var type = e.type || "";
    if (type === "file" || r.width > 0) {
      n += 1; e.setAttribute("data-plug", String(n));
      out.push({
        i: n, tag: e.tagName.toLowerCase(), type: type, text: label(e),
        value: (type === "password" ? "" : (e.value || "")).slice(0, 60),
        checked: e.checked === true ? true : undefined,
        inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)
      });
    }
  });
  return {
    url: location.href, title: document.title,
    scroll: { y: Math.round(scrollY), max: Math.max(0, Math.round(document.documentElement.scrollHeight - innerHeight)) },
    text: (document.body ? document.body.innerText : "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 2500),
    things: out.slice(0, 300)
  };
})()
`;

const KEYS = {
  Enter: "Return", Tab: "Tab", Escape: "Escape", Backspace: "Backspace", Delete: "Delete",
  ArrowDown: "Down", ArrowUp: "Up", ArrowLeft: "Left", ArrowRight: "Right", Space: "Space", End: "End", Home: "Home", PageDown: "PageDown", PageUp: "PageUp",
};

class Hands {
  /** @param {Electron.WebContents} wc */
  constructor(wc) {
    this.wc = wc;
    this.pos = { x: 60, y: 60 };
    this.snapshotAt = 0; // the page generation the numbers belong to
    this.gen = 0;
    const bump = () => { this.gen += 1; };
    wc.on("did-navigate", bump);
    wc.on("did-navigate-in-page", bump);
    wc.on("dom-ready", () => { this.inject().catch(() => {}); });
    wc.on("did-frame-finish-load", () => { this.inject().catch(() => {}); });
  }

  async inject() {
    await this.wc.executeJavaScript(OVERLAY, true);
    await this.wc.executeJavaScript(`window.__plugSet && window.__plugSet(${this.pos.x}, ${this.pos.y})`, true).catch(() => {});
  }

  async run(cmd) {
    const started = Date.now();
    const fn = this[`do_${cmd.cmd}`];
    if (typeof fn !== "function") return { ok: false, why: `no such command: ${cmd.cmd}` };
    try {
      const result = await fn.call(this, cmd);
      return { ok: true, ms: Date.now() - started, ...(result ?? {}) };
    } catch (error) {
      return { ok: false, ms: Date.now() - started, why: error?.message ?? String(error) };
    }
  }

  /* ------------------------------------------------------------ movement */

  async moveTo(x, y) {
    x = Math.round(x); y = Math.round(y);
    const from = this.pos;
    const dx = x - from.x, dy = y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return;
    const dur = clamp(150 + dist * 0.28, 180, 420);
    const steps = Math.max(6, Math.round(dur / 9));
    /* A gentle arc, not a ruler line: the control point sits off to one side. */
    const bend = clamp(dist * 0.08, 4, 36) * (dx >= 0 ? -1 : 1);
    const cx = from.x + dx / 2 + (-dy / dist) * bend;
    const cy = from.y + dy / 2 + (dx / dist) * bend;
    const t0 = Date.now();
    for (let s = 1; s <= steps; s++) {
      const t = ease(s / steps);
      const px = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * x;
      const py = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * y;
      this.wc.sendInputEvent({ type: "mouseMove", x: Math.round(px), y: Math.round(py) });
      const due = t0 + (dur * s) / steps - Date.now();
      if (due > 1) await sleep(due);
    }
    this.pos = { x, y };
  }

  async pressAt(x, y, { double = false } = {}) {
    await this.moveTo(x, y);
    const b = { x: Math.round(x), y: Math.round(y), button: "left" };
    this.wc.focus();
    this.wc.sendInputEvent({ type: "mouseDown", ...b, clickCount: double ? 2 : 1 });
    await sleep(35);
    this.wc.sendInputEvent({ type: "mouseUp", ...b, clickCount: double ? 2 : 1 });
  }

  /** Resolve { i } | { text } | { selector } to the element's centre, scrolled into view. */
  async locate(c) {
    let find;
    if (c.i != null) {
      if (this.snapshotAt !== this.gen) throw new Error("the page changed since the last snap — snap again");
      find = `document.querySelector('[data-plug="${Number(c.i)}"]')`;
    } else if (c.selector) {
      find = `document.querySelector(${JSON.stringify(c.selector)})`;
    } else if (c.text) {
      const t = JSON.stringify(String(c.text).toLowerCase());
      find = `(function(){var t=${t},best=null,bl=1e9;document.querySelectorAll('a,button,[role=button],[role=link],label,input[type=submit],summary').forEach(function(e){var r=e.getBoundingClientRect();if(r.width<2||r.height<2)return;var s=((e.innerText||e.value||e.getAttribute('aria-label')||'')+'').toLowerCase().replace(/\\s+/g,' ').trim();if(s.indexOf(t)>=0&&s.length<bl){best=e;bl=s.length}});return best})()`;
    } else {
      throw new Error("say which one: i, text or selector");
    }
    const box = await this.wc.executeJavaScript(`(function(){var e=${find};if(!e)return null;e.scrollIntoView({block:"center",inline:"center"});var r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}})()`, true);
    if (!box) throw new Error(`nothing matches ${JSON.stringify(c.i ?? c.text ?? c.selector)}`);
    return box;
  }

  /* ----------------------------------------------------------- commands */

  async do_snap() {
    const snap = await this.wc.executeJavaScript(SNAPSHOT, true);
    this.snapshotAt = this.gen;
    return snap;
  }

  async do_click(c) {
    const b = await this.locate(c);
    await this.pressAt(b.x, b.y, { double: c.double });
    return { at: [Math.round(b.x), Math.round(b.y)] };
  }

  async do_type(c) {
    if (c.i != null || c.selector) {
      const b = await this.locate({ i: c.i, selector: c.selector });
      await this.pressAt(b.x, b.y);
      /* The click focuses the field a moment AFTER it lands. Typing straight
         away lost the first three letters ("Chrome" arrived as "ome"), found
         by the test and not by eye. So: wait until the page says this field
         has focus, and take focus by hand if the click did not. */
      const sel = c.i != null ? '[data-plug="' + Number(c.i) + '"]' : c.selector;
      const focused = await this.wc.executeJavaScript(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;if(e.tagName==="LABEL"&&e.control)e=e.control;function ok(){var a=document.activeElement;return !!a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA"||a.tagName==="SELECT"||a.isContentEditable)}if(!ok())e.focus();return ok()})()`, true);
      if (!focused) throw new Error("could not put the cursor in that field");
    }
    if (c.clear) {
      this.wc.selectAll();
      this.wc.sendInputEvent({ type: "keyDown", keyCode: "Backspace" });
      this.wc.sendInputEvent({ type: "keyUp", keyCode: "Backspace" });
    }
    const text = String(c.text ?? "");
    /* A burst: characters in small groups, a breath between groups. It reads as
       typing, and it is fast. */
    for (let k = 0; k < text.length; k += 3) {
      await this.wc.insertText(text.slice(k, k + 3));
      await sleep(6);
    }
    return { typed: text.length };
  }

  async do_press(c) {
    const key = KEYS[c.key] ?? c.key;
    this.wc.sendInputEvent({ type: "keyDown", keyCode: key });
    if (key === "Return") this.wc.sendInputEvent({ type: "char", keyCode: "\r" });
    this.wc.sendInputEvent({ type: "keyUp", keyCode: key });
    return {};
  }

  async do_scroll(c) {
    const dy = Number(c.dy ?? 400);
    const { x, y } = this.pos;
    const steps = clamp(Math.round(Math.abs(dy) / 120), 1, 12);
    for (let s = 0; s < steps; s++) {
      this.wc.sendInputEvent({ type: "mouseWheel", x, y, deltaX: 0, deltaY: -dy / steps, canScroll: true });
      await sleep(14);
    }
    return {};
  }

  async do_upload(c) {
    const files = Array.isArray(c.files) ? c.files : [c.files];
    if (!files.length || !files[0]) throw new Error("no files given");
    const b = await this.locate({ i: c.i, selector: c.selector });
    await this.moveTo(b.x, b.y);
    const dbg = this.wc.debugger;
    const attached = !dbg.isAttached();
    if (attached) dbg.attach("1.3");
    try {
      const { root } = await dbg.sendCommand("DOM.getDocument", { depth: 0 });
      const sel = c.i != null ? `[data-plug="${Number(c.i)}"]` : c.selector;
      const { nodeId } = await dbg.sendCommand("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
      if (!nodeId) throw new Error("the file input is gone");
      await dbg.sendCommand("DOM.setFileInputFiles", { nodeId, files });
    } finally {
      if (attached) dbg.detach();
    }
    return { files: files.length };
  }

  async do_goto(c) {
    await this.wc.loadURL(String(c.url));
    await this.inject();
    return { url: this.wc.getURL() };
  }

  async do_wait(c) {
    await sleep(clamp(Number(c.ms ?? 500), 0, 30000));
    return {};
  }

  async do_shot(c) {
    const img = await this.wc.capturePage();
    const png = img.toPNG();
    if (c.path) {
      require("node:fs").writeFileSync(c.path, png);
      return { path: c.path, bytes: png.length };
    }
    return { png: png.toString("base64") };
  }
}

module.exports = { Hands, OVERLAY, SNAPSHOT };
