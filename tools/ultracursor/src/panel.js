/*
 * ultracursor panel. This file runs INSIDE the page (Chrome), never in node.
 *
 * agent/host.mjs injects it on every page with context.addInitScript (right
 * after it registered the __ucAgent binding) and evaluates it once on pages
 * that were already open. It is where Alex talks to the browser agent, in a
 * bar bottom-right:
 *   needkey   a field for his Claude API key, and Save
 *   idle      "Tell ultracursor what to do…", a photo button (photos dropped on
 *             the bar count too), a chip per photo, the send arrow
 *   queued / running / paused
 *             one status line, step n/max, the cost so far, Pause (Resume), Stop
 *   card      a card above the bar (approval, wall, stuck, done, limit): the
 *             title, its lines, one button per choice; Approve is the white one
 * It keeps no state of its own that matters: every 500 ms it polls node and
 * re-renders from the answer, so navigations and restarts lose nothing.
 *
 * Safety, every rule load-bearing:
 *   - The token node checks on every call comes from the line just before this
 *     file and is taken off window at once, in every frame. It lives only here.
 *   - Playwright's binding carries its arguments through page globals
 *     (JSON.stringify, Object.is, window.__playwright__binding__, the array
 *     iterator, its controller object). A page that wrapped one could read the
 *     token. They are captured below before any page script runs and checked
 *     before every call; if one was changed the panel stops talking on that
 *     page and says so ("off"). Messages go out as one JSON string made with
 *     the captured JSON.stringify, so nothing else of ours passes through them.
 *   - Everything else that touches a secret or what Alex sees (input values,
 *     photo bytes, text and styles of the card) goes through natives captured
 *     at the same moment, so a page cannot read the key or rewrite the card.
 *   - A closed shadow root and aria-hidden on the host: the agent reads pages
 *     through the accessibility snapshot and never sees the panel.
 *   - Only the panel's own controls take the mouse. Keys typed into it never
 *     reach the page: they are stopped at the window, capture phase, before
 *     any page listener.
 *   - A button counts only for a trusted pointer click. A card's choice also
 *     not in the first 600 ms after the card appeared, and only once.
 *   - The rules of overlay.js: no <style>, no innerHTML (CSP, Trusted Types);
 *     nothing drawn on sign-in pages; back by itself when a single-page app
 *     wipes the document; black, white and greys only.
 */
(() => {
  "use strict";
  const V = 1;

  /* ---------------------------------------------------------------- config */

  // Read and remove before anything else, in subframes too (the init script
  // runs in every frame), so the token never sits on any window.
  let cfg = null;
  try { cfg = window.__ucPanelConfig; } catch (e) { cfg = null; }
  try { delete window.__ucPanelConfig; } catch (e) {}
  try { if ("__ucPanelConfig" in window) window.__ucPanelConfig = undefined; } catch (e) {}
  const TOKEN = cfg && typeof cfg.token === "string" ? cfg.token : "";
  const HID = cfg && typeof cfg.hid === "string" ? cfg.hid : "";
  const BUILD = cfg && cfg.build !== undefined && cfg.build !== null ? String(cfg.build) : "";
  cfg = null;

  let isTop = false;
  try { isTop = window.top === window; } catch (e) { isTop = false; }
  if (!isTop) return { ok: false, why: "subframe" };
  if (!TOKEN) return { ok: false, why: "no config" };

  /* ------------------------------------------ natives, taken before the page */

  const O = Object;
  const GOPD = O.getOwnPropertyDescriptor, GPO = O.getPrototypeOf, DEF = O.defineProperty, KEYS = O.keys;
  const APPLY = Reflect.apply;
  const MISSING = {};
  // A property's own data value, never through a getter or the prototype.
  const own = (o, k) => {
    try {
      const d = GOPD(o, k);
      const v = d ? GOPD(d, "value") : undefined;
      return v ? v.value : MISSING;
    } catch (e) { return MISSING; }
  };
  const acc = (o, k, which) => {
    try {
      const d = GOPD(o, k);
      const f = d ? GOPD(d, which) : undefined;
      return f && typeof f.value === "function" ? f.value : null;
    } catch (e) { return null; }
  };
  const call = (fn, self, args) => APPLY(fn, self, args || []);

  const STRINGIFY = own(JSON, "stringify");
  const JSON0 = own(window, "JSON"), OBJECT0 = own(window, "Object"), OBJIS = own(O, "is");
  const ARR_P = Array.prototype, OBJ_P = O.prototype;
  const ITER_SYM = Symbol.iterator;
  const ITER = own(ARR_P, ITER_SYM);
  const ARR_ITER_P = GPO([][ITER_SYM]());
  const NEXT = own(ARR_ITER_P, "next");
  const SET_TIMEOUT = setTimeout, CLEAR_TIMEOUT = clearTimeout, SET_INTERVAL = setInterval, CLEAR_INTERVAL = clearInterval;
  const NOW = Date.now;
  const PROMISE = Promise;
  const ADD = EventTarget.prototype.addEventListener, REM = EventTarget.prototype.removeEventListener;
  const STOP = Event.prototype.stopPropagation, STOP_NOW = Event.prototype.stopImmediatePropagation, PREVENT = Event.prototype.preventDefault;
  const TARGET = acc(Event.prototype, "target", "get");
  const CE = Document.prototype.createElement, CENS = Document.prototype.createElementNS;
  const APPEND = Node.prototype.appendChild, INSERT = Node.prototype.insertBefore;
  const REPLACE_KIDS = Element.prototype.replaceChildren, REMOVE = Element.prototype.remove;
  const SET_ATTR = Element.prototype.setAttribute, GBCR = Element.prototype.getBoundingClientRect;
  const ATTACH_SHADOW = Element.prototype.attachShadow;
  const TEXT = acc(Node.prototype, "textContent", "set");
  const STYLE_H = acc(HTMLElement.prototype, "style", "get"), STYLE_S = acc(SVGElement.prototype, "style", "get");
  const SET_PROP = CSSStyleDeclaration.prototype.setProperty;
  const VALUE_GET = acc(HTMLInputElement.prototype, "value", "get"), VALUE_SET = acc(HTMLInputElement.prototype, "value", "set");
  const FILES = acc(HTMLInputElement.prototype, "files", "get");
  const READONLY = acc(HTMLInputElement.prototype, "readOnly", "set");
  const DT = acc(DragEvent.prototype, "dataTransfer", "get");
  const DT_FILES = acc(DataTransfer.prototype, "files", "get"), DT_TYPES = acc(DataTransfer.prototype, "types", "get");
  const DT_EFFECT = acc(DataTransfer.prototype, "dropEffect", "set");
  const FL_LEN = acc(FileList.prototype, "length", "get");
  const F_NAME = acc(File.prototype, "name", "get"), B_TYPE = acc(Blob.prototype, "type", "get"), B_SIZE = acc(Blob.prototype, "size", "get");
  const B_BUF = Blob.prototype.arrayBuffer;
  const U8 = Uint8Array, TO_B64 = own(Uint8Array.prototype, "toBase64");
  const SUBARRAY = own(GPO(Uint8Array.prototype), "subarray");
  const FROM_CC = String.fromCharCode, BTOA = own(window, "btoa");
  const TRIM = String.prototype.trim, LOWER = String.prototype.toLowerCase, SLICE = String.prototype.slice;
  const FOCUS = HTMLElement.prototype.focus, BLUR = HTMLElement.prototype.blur, CLICK = HTMLElement.prototype.click;
  const ACTIVE = acc(ShadowRoot.prototype, "activeElement", "get");
  const IS_CONNECTED = acc(Node.prototype, "isConnected", "get");
  const SVG_EL = SVGElement;
  const AUDIO = own(window, "AudioContext") !== MISSING ? own(window, "AudioContext") : own(window, "webkitAudioContext");
  const LN = Math.log;
  const VISIBLE = acc(Document.prototype, "visibilityState", "get");

  // The binding and the Playwright objects its calls pass through.
  const BIND_NAME = "__playwright__binding__", CTRL_NAME = "__playwright__binding__controller__";
  const B = { agent: null, raw: MISSING, ctrl: null, ctrlProto: null, callB: MISSING, how: "none" };
  const capture = () => {
    const f = own(window, "__ucAgent");
    if (typeof f !== "function") return false;
    B.agent = f;
    B.raw = own(window, BIND_NAME);
    const c = own(window, CTRL_NAME);
    B.ctrl = c && c !== MISSING && typeof c === "object" ? c : null;
    try { B.ctrlProto = B.ctrl ? GPO(B.ctrl) : null; } catch (e) { B.ctrlProto = null; }
    B.callB = B.ctrlProto ? own(B.ctrlProto, "callBinding") : MISSING;
    return true;
  };
  // Registered with exposeBinding before this init script, so it should be here
  // now; if it is not, it is taken on first use (state().bound says which).
  if (capture()) B.how = "init";

  const PROTOS = [ARR_P, OBJ_P];
  const TRAPS = ["0", "1", "toJSON"];
  // Every global the token passes through on its way out, unchanged since the
  // capture: Playwright's callBinding (spread -> array iterator), its serializer
  // (Object.is, index stores into an array), JSON.stringify (toJSON), the raw
  // CDP binding, and the controller fields it looks up on each call.
  const intact = () => {
    try {
      if (typeof B.agent !== "function" || typeof B.raw !== "function" || !B.ctrl || typeof B.callB !== "function") return false;
      if (own(window, BIND_NAME) !== B.raw) return false;
      if (own(window, "JSON") !== JSON0 || own(JSON0, "stringify") !== STRINGIFY) return false;
      if (own(window, "Object") !== OBJECT0 || own(OBJECT0, "is") !== OBJIS) return false;
      for (let i = 0; i < PROTOS.length; i++) for (let j = 0; j < TRAPS.length; j++) if (GOPD(PROTOS[i], TRAPS[j])) return false;
      if (own(ARR_P, ITER_SYM) !== ITER || own(ARR_ITER_P, "next") !== NEXT) return false;
      if (GPO(B.ctrl) !== B.ctrlProto || GOPD(B.ctrl, "callBinding") || own(B.ctrlProto, "callBinding") !== B.callB) return false;
      if (own(B.ctrl, "_global") !== window || own(B.ctrl, "_globalBindingName") !== BIND_NAME) return false;
      return true;
    } catch (e) { return false; }
  };

  // A copy already running here. The same ultracursor (the init script got
  // here before this evaluate): keep it, it saw the page before the page ran.
  // An older one (node restarted with a new token): retire it.
  const prev = own(window, "__ucPanel");
  if (prev !== MISSING && prev && typeof prev === "object") {
    if (prev.v === V && prev.hid === HID && typeof prev.ensure === "function") {
      try { prev.ensure(); return prev.brief(); } catch (e) {}
    }
    if (typeof prev.destroy === "function") { try { prev.destroy(); } catch (e) {} }
  }

  /* ------------------------------------------------------------ dom helpers */

  const TOP = "2147483647";
  const NS = "http://www.w3.org/2000/svg";
  const ID = "ucp" + Math.random().toString(36).slice(2, 9);
  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';
  const ARROW = "M372 236 L742 520 L578 545 L486 716 Z"; // the logo's own arrow (design/ultracursor/icon.svg)

  const styleOf = (el) => call(el instanceof SVG_EL ? STYLE_S : STYLE_H, el);
  // Inside the closed shadow root no page rule reaches, so plain priority is
  // right. Only the host, which lives in the page's DOM, is set !important.
  const css = (el, s, imp) => {
    const st = styleOf(el), ks = KEYS(s);
    for (let i = 0; i < ks.length; i++) call(SET_PROP, st, [ks[i], String(s[ks[i]]), imp ? "important" : ""]);
    return el;
  };
  const put = (parent, kid) => { call(APPEND, parent, [kid]); return kid; };
  const attr = (el, k, v) => { call(SET_ATTR, el, [k, String(v)]); return el; };
  const text = (el, s) => { call(TEXT, el, [s]); return el; };
  const el = (tag, s, kids) => {
    const e = call(CE, document, [tag]);
    css(e, s || {});
    for (const k of kids || []) put(e, k);
    return e;
  };
  const sv = (tag, attrs, kids) => {
    const e = call(CENS, document, [NS, tag]);
    const ks = KEYS(attrs || {});
    for (let i = 0; i < ks.length; i++) attr(e, ks[i], attrs[ks[i]]);
    for (const k of kids || []) put(e, k);
    return e;
  };
  const stop = (offset, color, opacity) => sv("stop", { offset, "stop-color": color, "stop-opacity": opacity === undefined ? 1 : opacity });
  const on = (target, type, fn, opts) => { call(ADD, target, [type, fn, opts || false]); };
  const value = (input) => String(call(VALUE_GET, input));
  const trim = (s) => call(TRIM, String(s));
  const connected = (n) => { try { return Boolean(call(IS_CONNECTED, n)); } catch (e) { return false; } };

  // Starting point of every element: no page rule can reach in, nothing leaks out.
  const BASE = {
    "box-sizing": "border-box", margin: "0", padding: "0", border: "0",
    "pointer-events": "none", "user-select": "none", "-webkit-user-select": "none",
    "font-family": FONT, "line-height": "normal", "letter-spacing": "normal",
    "text-transform": "none", "text-shadow": "none", "text-align": "left",
    "-webkit-font-smoothing": "antialiased", "font-kerning": "normal", color: "#f5f5f5",
  };

  // Black liquid glass, the same recipe as the build-1 status pill.
  // saturate(0): what shows through keeps its light and loses its colour.
  const GLASS = {
    background:
      "radial-gradient(120% 160% at 10% -40%, rgba(255,255,255,.22) 0%, rgba(255,255,255,.07) 34%, rgba(255,255,255,0) 60%)," +
      "linear-gradient(180deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,0) 46%, rgba(0,0,0,.30) 100%)," +
      "rgba(11,11,11,.86)",
    "backdrop-filter": "blur(22px) saturate(0) brightness(.8)", "-webkit-backdrop-filter": "blur(22px) saturate(0) brightness(.8)",
    border: "0.5px solid rgba(255,255,255,.24)",
    "box-shadow":
      "inset 0 1px 0 rgba(255,255,255,.34), inset 1px 0 0 rgba(255,255,255,.08), inset 0 -1px 0 rgba(0,0,0,.55)," +
      "0 0 0 .5px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.35), 0 16px 38px -12px rgba(0,0,0,.6)",
  };
  const sheen = () => el("div", {
    ...BASE, position: "absolute", inset: "0", "border-radius": "inherit",
    background: "linear-gradient(112deg, rgba(255,255,255,0) 28%, rgba(255,255,255,.075) 42%, rgba(255,255,255,0) 56%)",
  });
  const streak = () => el("div", {
    ...BASE, position: "absolute", top: "0", left: "16%", width: "48%", height: "1px",
    background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.9), rgba(255,255,255,0))",
  });

  // Buttons: clear glass, or white with black text for the one that commits.
  const BTN_GLASS = {
    background: "linear-gradient(180deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,.07) 100%)",
    color: "#f4f4f4", border: "0.5px solid rgba(255,255,255,.26)",
    "box-shadow": "inset 0 1px 0 rgba(255,255,255,.22), inset 0 -1px 0 rgba(0,0,0,.35), 0 1px 2px rgba(0,0,0,.35)",
  };
  const BTN_WHITE = {
    background: "linear-gradient(180deg, #ffffff 0%, #f1f1f1 60%, #e4e4e4 100%)",
    color: "#0b0b0b", border: "0.5px solid rgba(0,0,0,.25)",
    "box-shadow": "inset 0 1px 0 #ffffff, inset 0 -1px 0 rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.45), 0 4px 12px -4px rgba(0,0,0,.5)",
  };
  const BTN_BASE = {
    ...BASE, "pointer-events": "auto", cursor: "pointer", appearance: "none", "-webkit-appearance": "none",
    outline: "none", display: "inline-flex", "align-items": "center", "justify-content": "center",
    "flex": "0 0 auto", "white-space": "nowrap", transition: "filter .15s ease, opacity .2s ease, transform .1s ease",
  };
  const button = (label, white, s) => {
    const b = el("button", { ...BTN_BASE, ...(white ? BTN_WHITE : BTN_GLASS), height: "32px", padding: "0 14px", "border-radius": "16px", font: `600 12.5px/1 ${FONT}`, "letter-spacing": ".01em", ...(s || {}) });
    attr(b, "type", "button");
    attr(b, "tabindex", "-1");
    if (label) text(b, label);
    on(b, "pointerenter", () => css(b, { filter: white ? "brightness(.94)" : "brightness(1.35)" }));
    on(b, "pointerleave", () => css(b, { filter: "none", transform: "none" }));
    on(b, "pointerdown", () => css(b, { transform: "scale(.97)" }));
    on(b, "pointerup", () => css(b, { transform: "none" }));
    return b;
  };
  const roundButton = (white, icon) => {
    const b = button("", white, { width: "32px", height: "32px", padding: "0", "border-radius": "50%" });
    put(b, icon);
    return b;
  };
  const icon = (paths, color, size) => {
    const s = sv("svg", { xmlns: NS, width: size || 16, height: size || 16, viewBox: "0 0 24 24", fill: "none" }, paths.map((p) => sv(p[0], { stroke: color, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", ...p[1] })));
    css(s, { ...BASE, display: "block" });
    return s;
  };

  /* ------------------------------------------------------------------ host */

  const host = call(CE, document, ["ultracursor-panel"]);
  css(host, {
    all: "initial", display: "block", position: "fixed", inset: "0", left: "0", top: "0",
    width: "auto", height: "auto", margin: "0", padding: "0", border: "0",
    background: "transparent", overflow: "visible", "pointer-events": "none",
    "z-index": TOP, contain: "none", opacity: "1", visibility: "visible",
    transform: "none", filter: "none", "color-scheme": "normal", "max-width": "none", "max-height": "none",
  }, true);
  try { attr(host, "popover", "manual"); } catch (e) {}
  attr(host, "aria-hidden", "true");
  let shadow = null;
  try {
    // Every member spelled out, so no page-made Object.prototype default
    // (serializable, clonable...) can leak into the closed root.
    shadow = call(ATTACH_SHADOW, host, [{ mode: "closed", delegatesFocus: false, slotAssignment: "named", clonable: false, serializable: false }]);
  } catch (e) { shadow = null; }
  if (!shadow) return { ok: false, why: "no shadow root" };

  const layer = el("div", { ...BASE, position: "fixed", inset: "0", overflow: "visible" });
  put(shadow, layer);

  /* ------------------------------------------------------------------ logo */

  const logo = (() => {
    const t = (cx, cy, r, o) => sv("circle", { cx, cy, r, fill: "#ffffff", opacity: o });
    const glint = (x, y, k, o) => sv("path", {
      d: `M0 -${k} L${k * 0.18} 0 L0 ${k} L-${k * 0.18} 0Z M-${k} 0 L0 ${k * 0.18} L${k} 0 L0 -${k * 0.18}Z`,
      fill: "#ffffff", opacity: o, transform: `translate(${x} ${y})`,
    });
    const s = sv("svg", { xmlns: NS, width: 32, height: 32, viewBox: "0 0 1024 1024" }, [
      sv("defs", {}, [
        sv("radialGradient", { id: ID + "lb", cx: "40%", cy: "30%", r: "85%" }, [stop(0, "#1c1c1c"), stop(0.55, "#070707"), stop(1, "#000000")]),
        sv("linearGradient", { id: ID + "lt", gradientUnits: "userSpaceOnUse", x1: 372, y1: 236, x2: 742, y2: 716 }, [stop(0, "#5e5e5e", 0.96), stop(0.45, "#151515", 0.94), stop(1, "#000000", 0.96)]),
        sv("linearGradient", { id: ID + "lr", gradientUnits: "userSpaceOnUse", x1: 372, y1: 236, x2: 742, y2: 716 }, [stop(0, "#ffffff"), stop(0.35, "#dcdcdc"), stop(0.6, "#5e5e5e"), stop(1, "#ffffff", 0.92)]),
        sv("radialGradient", { id: ID + "lh", cx: "50%", cy: "50%", r: "50%" }, [stop(0, "#ffffff", 0.18), stop(1, "#ffffff", 0)]),
        sv("clipPath", { id: ID + "lq" }, [sv("rect", { x: 0, y: 0, width: 1024, height: 1024, rx: 236 })]),
        sv("clipPath", { id: ID + "la" }, [sv("path", { d: ARROW })]),
      ]),
      sv("g", { "clip-path": `url(#${ID}lq)` }, [
        sv("rect", { width: 1024, height: 1024, fill: `url(#${ID}lb)` }),
        t(160, 180, 13, 0.55), t(250, 640, 10, 0.5), t(830, 210, 12, 0.6), t(880, 760, 11, 0.45),
        t(610, 860, 9, 0.5), t(130, 420, 9, 0.4), t(700, 120, 8, 0.45),
        glint(240, 250, 70, 0.9), glint(800, 330, 52, 0.7), glint(780, 830, 60, 0.75),
        sv("circle", { cx: 540, cy: 480, r: 360, fill: `url(#${ID}lh)` }),
        sv("path", { d: ARROW, fill: `url(#${ID}lt)` }),
        sv("g", { "clip-path": `url(#${ID}la)` }, [
          sv("path", { d: "M396 274 L700 506", stroke: "#ffffff", "stroke-opacity": 0.8, "stroke-width": 26, "stroke-linecap": "round" }),
        ]),
        sv("path", { d: ARROW, fill: "none", stroke: `url(#${ID}lr)`, "stroke-width": 40, "stroke-linejoin": "round" }),
        sv("rect", { x: 6, y: 6, width: 1012, height: 1012, rx: 232, fill: "none", stroke: "#ffffff", "stroke-opacity": 0.16, "stroke-width": 12 }),
      ]),
    ]);
    css(s, { ...BASE, display: "block", flex: "0 0 auto", width: "32px", height: "32px", "border-radius": "8px", "box-shadow": "0 1px 2px rgba(0,0,0,.5), 0 0 0 .5px rgba(255,255,255,.14)", position: "relative" });
    return s;
  })();

  /* ------------------------------------------------------------- the stack */

  // Column, bottom-right: card, photo chips, a note line, then the bar.
  const stack = el("div", {
    ...BASE, position: "fixed", right: "16px", bottom: "16px", width: "min(420px, calc(100vw - 32px))",
    display: "none", "flex-direction": "column", "align-items": "stretch", gap: "8px",
  });
  put(layer, stack);

  /* ------------------------------------------------------- the trader orb */

  // Trader mode only (node sends state.trader while the trader runs, null
  // otherwise). A small glass orb at the bottom centre whose size grows with
  // the trader's memory on disk: radius = 7 + 4.236 ln(1 + KB), clamped 7..29 px.
  // The KB sits inside once the orb is big enough, and always in its title.
  // A click mutes / unmutes the "got paid" chime.
  const orb = el("div", {
    ...BASE, position: "fixed", left: "50%", bottom: "18px", display: "none", "pointer-events": "auto", cursor: "pointer",
    "border-radius": "50%", "align-items": "center", "justify-content": "center", transform: "translateX(-50%)",
    background: "radial-gradient(circle at 34% 28%, rgba(255,255,255,.95) 0%, rgba(255,255,255,.42) 18%, rgba(255,255,255,.10) 46%, rgba(255,255,255,.04) 70%), rgba(11,11,11,.72)",
    border: "0.5px solid rgba(255,255,255,.34)",
    "box-shadow": "0 0 14px 2px rgba(255,255,255,.30), 0 0 34px 6px rgba(255,255,255,.10), inset 0 1px 0 rgba(255,255,255,.5), inset 0 -2px 6px rgba(0,0,0,.55)",
    "backdrop-filter": "blur(10px) saturate(0)", "-webkit-backdrop-filter": "blur(10px) saturate(0)",
    transition: "width .6s cubic-bezier(.2,.8,.2,1), height .6s cubic-bezier(.2,.8,.2,1), opacity .3s ease",
  });
  const orbKb = el("span", { ...BASE, font: `650 9px/1 ${FONT}`, color: "rgba(255,255,255,.92)", "letter-spacing": ".01em", "text-shadow": "0 1px 2px rgba(0,0,0,.6)" });
  put(orb, orbKb);
  put(layer, orb);
  const orbRadius = (kb) => Math.max(7, Math.min(29, 7 + 4.236 * LN(1 + Math.max(0, Number(kb) || 0))));

  // Build 5: the trader pill. Off: a small "trader" pill just above the bar.
  // On: "stop trader" beside the orb, and the bar folds away (it covered
  // Phantom's Paper switch) unless a card or a running task needs it. Only the
  // pill and the orb take the mouse; everything else on the page stays clickable.
  const pill = button("trader", false, {
    position: "fixed", bottom: "70px", right: "16px", display: "none", height: "24px", padding: "0 11px",
    "border-radius": "12px", font: `600 11px/1 ${FONT}`, color: "#ffffff", background: "rgba(11,11,11,.82)",
    border: "0.5px solid rgba(255,255,255,.34)", "box-shadow": "0 2px 10px rgba(0,0,0,.35)",
  });
  put(layer, pill);

  // "Got paid": two bright bell notes a golden ratio apart (f, then f x 1.618)
  // with a soft shimmer, ~0.6 s, synthesized here (no sample). Not a cash
  // register: no noise burst, no coin rattle, so it never sounds like Shopify.
  let audio = null;
  const chime = () => {
    S.chimes++;
    try {
      if (!AUDIO) return;
      if (!audio) audio = new AUDIO();
      if (audio.state === "suspended") audio.resume();
      const t = audio.currentTime + 0.01, f = 880, PHI_ = 1.618;
      const out = audio.createGain();
      out.gain.value = 0.16;                                 // modest
      out.connect(audio.destination);
      const bell = (freq, at, len, peak) => {
        for (const [mult, g] of [[1, 1], [2.0, 0.18], [PHI_ * PHI_, 0.08]]) {
          const o = audio.createOscillator(), e = audio.createGain();
          o.type = "sine"; o.frequency.value = freq * mult;
          e.gain.setValueAtTime(0, at);
          e.gain.linearRampToValueAtTime(peak * g, at + 0.006);
          e.gain.exponentialRampToValueAtTime(0.0001, at + len);
          o.connect(e); e.connect(out); o.start(at); o.stop(at + len + 0.02);
        }
      };
      bell(f, t, 0.42, 0.9);
      bell(f * PHI_, t + 0.12, 0.48, 0.8);
      // shimmer tail: quiet high partials at f x phi^2 and f x phi^3, detuned, fading out by 0.6 s
      for (const [freq, at] of [[f * PHI_ * PHI_, t + 0.16], [f * PHI_ * PHI_ * PHI_ * 0.997, t + 0.2], [f * PHI_ * PHI_ * 1.004, t + 0.24]]) bell(freq, at, 0.36, 0.12);
    } catch (e) { /* no audio on this page: the count still says it was due */ }
  };

  const field = (password) => {
    const wrap = el("div", { ...BASE, position: "relative", flex: "1 1 auto", "min-width": "0", height: "32px", display: "flex", "align-items": "center" });
    const input = el("input", {
      ...BASE, "pointer-events": "auto", "user-select": "text", "-webkit-user-select": "text",
      appearance: "none", "-webkit-appearance": "none", outline: "none", "box-shadow": "none",
      background: "transparent", color: "#f6f6f6", "caret-color": "#ffffff",
      font: `500 14px/20px ${FONT}`, width: "100%", height: "32px", padding: "0 4px", position: "relative",
    });
    attr(input, "type", password ? "password" : "text");
    attr(input, "autocomplete", password ? "new-password" : "off");
    attr(input, "spellcheck", "false");
    attr(input, "autocapitalize", "off");
    attr(input, "autocorrect", "off");
    // Out of the Tab order: only a click puts the caret here, so a Tab the
    // agent presses on a page form can never land in the panel.
    attr(input, "tabindex", "-1");
    // The hint is our own span, not ::placeholder: pseudo-elements need a
    // stylesheet, and strict-CSP pages drop injected stylesheets.
    const hint = el("span", {
      ...BASE, position: "absolute", left: "4px", right: "4px", top: "6px", height: "20px",
      font: `500 14px/20px ${FONT}`, color: "rgba(255,255,255,.5)",
      "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis",
    });
    put(wrap, hint);
    put(wrap, input);
    return { wrap, input, hint };
  };

  // card
  // The visible surfaces take the mouse too: a click that misses a button by a
  // hair must land on the panel, never on the page underneath it.
  const SURFACE = { "pointer-events": "auto", cursor: "default" };
  const card = el("div", { ...BASE, ...GLASS, ...SURFACE, position: "relative", display: "none", "flex-direction": "column", gap: "8px", padding: "14px 16px 12px", "border-radius": "20px", overflow: "hidden" });
  const cardTitle = el("div", { ...BASE, position: "relative", font: `650 14.5px/1.32 ${FONT}`, color: "#ffffff", "overflow-wrap": "anywhere" });
  const cardLines = el("div", {
    ...BASE, position: "relative", "pointer-events": "auto", "user-select": "text", "-webkit-user-select": "text",
    display: "flex", "flex-direction": "column", gap: "3px", "max-height": "152px", "overflow-y": "auto",
    "overscroll-behavior": "contain", "scrollbar-width": "thin", "scrollbar-color": "rgba(255,255,255,.32) transparent",
  });
  const cardFoot = el("div", { ...BASE, position: "relative", display: "flex", "flex-wrap": "wrap", "justify-content": "flex-end", gap: "8px", "margin-top": "4px" });
  put(card, sheen());
  put(card, streak());
  put(card, cardTitle);
  put(card, cardLines);
  put(card, cardFoot);

  // photo chips
  const chips = el("div", { ...BASE, display: "none", "flex-wrap": "wrap", "justify-content": "flex-end", gap: "6px" });

  // one line for errors and progress
  const note = el("div", {
    ...BASE, ...GLASS, ...SURFACE, "align-self": "flex-end", display: "none", "max-width": "100%", padding: "7px 13px",
    "border-radius": "14px", font: `500 12.5px/1.35 ${FONT}`, color: "#f4f4f4", "overflow-wrap": "anywhere",
  });

  // the bar
  const bar = el("div", {
    ...BASE, ...GLASS, ...SURFACE, position: "relative", display: "flex", "align-items": "center", gap: "8px",
    height: "46px", padding: "7px", "border-radius": "23px", overflow: "hidden", transition: "border-color .15s ease",
  });
  put(bar, sheen());
  put(bar, streak());
  put(bar, logo);

  const keyFace = el("div", { ...BASE, position: "relative", display: "none", flex: "1 1 auto", "min-width": "0", "align-items": "center", gap: "8px" });
  const key = field(true);
  text(key.hint, "Paste your Claude API key");
  const keySave = button("Save", true);
  put(keyFace, key.wrap);
  put(keyFace, keySave);

  const taskFace = el("div", { ...BASE, position: "relative", display: "none", flex: "1 1 auto", "min-width": "0", "align-items": "center", gap: "6px" });
  const task = field(false);
  text(task.hint, "Tell ultracursor what to do…");
  const attachBtn = roundButton(false, icon([
    ["rect", { x: 3.5, y: 5, width: 17, height: 14, rx: 3 }],
    ["circle", { cx: 9, cy: 10, r: 1.6, fill: "#f4f4f4", "stroke-width": 0 }],
    ["path", { d: "M4.5 17 L9.5 12.5 L13 15.5 L15.5 13 L19.5 16.5" }],
  ], "#f4f4f4", 17));
  const sendBtn = roundButton(true, icon([["path", { d: "M12 18.5 V6" }], ["path", { d: "M6.5 11.2 L12 5.7 L17.5 11.2" }]], "#0b0b0b", 17));
  put(taskFace, task.wrap);
  put(taskFace, attachBtn);
  put(taskFace, sendBtn);
  const fileInput = el("input", { ...BASE, display: "none" });
  attr(fileInput, "type", "file");
  attr(fileInput, "multiple", "");
  attr(fileInput, "accept", "image/*");
  attr(fileInput, "tabindex", "-1");
  put(taskFace, fileInput);

  const statusFace = el("div", { ...BASE, position: "relative", display: "none", flex: "1 1 auto", "min-width": "0", "align-items": "center", gap: "8px" });
  const col = el("div", { ...BASE, display: "flex", "flex-direction": "column", "justify-content": "center", gap: "2px", "min-width": "0", flex: "1 1 auto", "padding-left": "2px" });
  const line1 = el("div", { ...BASE, display: "flex", "align-items": "center", gap: "5px", "white-space": "nowrap", "min-width": "0" });
  const meta = el("span", { ...BASE, font: `600 10.5px/1.2 ${FONT}`, "letter-spacing": ".02em", color: "rgba(255,255,255,.58)", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap", "min-width": "0" });
  const dot = el("span", { ...BASE, display: "none", width: "5px", height: "5px", "border-radius": "50%", background: "#ffffff", "box-shadow": "0 0 6px 1px rgba(255,255,255,.7)", flex: "0 0 auto" });
  const statusLine = el("div", { ...BASE, font: `500 13px/1.3 ${FONT}`, "letter-spacing": ".005em", color: "#f4f4f4", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis", "max-width": "100%" });
  put(line1, meta);
  put(line1, dot);
  put(col, line1);
  put(col, statusLine);
  const pauseBtn = button("Pause", false);
  const resumeBtn = button("Resume", false);
  const stopBtn = button("Stop", false);
  put(statusFace, col);
  put(statusFace, pauseBtn);
  put(statusFace, resumeBtn);
  put(statusFace, stopBtn);

  put(bar, keyFace);
  put(bar, taskFace);
  put(bar, statusFace);

  put(stack, card);
  put(stack, chips);
  put(stack, note);
  put(stack, bar);

  /* ----------------------------------------------------------------- state */

  const ARM_MS = 600; // a card's buttons wait this long, so a click meant for the last one never lands on the next
  const OFFLINE_AFTER = 8; // polls without an answer (4 s) before the bar says node is gone
  const MAX_FILES = 12, MAX_BYTES = 20 * 1024 * 1024;
  const IMG_EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff" };
  const MODES = { needkey: 1, idle: 1, queued: 1, running: 1, paused: 1, card: 1, status: 1, offline: 1, off: 1 };

  const S = {
    state: null, everOk: false, fails: 0, rejected: false, tampered: false, inflight: false,
    mode: "", sending: false, files: [], filesVer: 0, chipsVer: -1,
    cardKey: "", cardId: null, cardAt: 0, decided: null,
    note: "", noteKind: "", noteAt: 0,
    href: "", destroyed: false, attaches: 0, recent: [], mountedOnce: false,
    topLayer: false, noTop: false, above: [], drop: false, vis: {}, txt: {},
    paidSeen: null, chimes: 0, orbR: 0, orbKb: 0, muted: false, traderMode: false,
  };

  const vis = (name, e, show, disp) => {
    const want = show ? disp || "block" : "none";
    if (S.vis[name] !== want) { S.vis[name] = want; css(e, { display: want }); }
  };
  const say = (name, e, s) => {
    const t = s === null || s === undefined ? "" : String(s);
    if (S.txt[name] !== t) { S.txt[name] = t; text(e, t); }
  };
  const showNote = (s, kind) => {
    S.note = s ? String(s) : "";
    S.noteKind = kind || "";
    S.noteAt = NOW();
    render();
  };
  const errText = (r, fallback) => {
    const e = r && typeof r === "object" && typeof r.error === "string" ? r.error : "";
    return e && e !== "off" ? call(SLICE, e, [0, 240]) : fallback;
  };
  const rid = () => {
    let s = "";
    try { const a = new U8(12); crypto.getRandomValues(a); for (let i = 0; i < a.length; i++) s += (a[i] + 256).toString(16).slice(1); }
    catch (e) { s = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2); }
    return s;
  };

  /* ------------------------------------------------------------- talk to node */

  const send = (msg, ms) => new PROMISE((resolve) => {
    if (!B.agent && capture()) B.how = "lazy";
    if (!B.agent) { resolve({ ok: false, error: "not connected" }); return; }
    if (!intact()) {
      if (!S.tampered) { S.tampered = true; SET_TIMEOUT(render, 0); }
      resolve({ ok: false, error: "off" });
      return;
    }
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = SET_TIMEOUT(() => finish({ ok: false, error: "ultracursor did not answer" }), ms || 15000);
    let p;
    try { p = B.agent(TOKEN, STRINGIFY(msg)); }
    catch (e) { CLEAR_TIMEOUT(timer); finish({ ok: false, error: "not connected" }); return; }
    try {
      p.then((v) => { CLEAR_TIMEOUT(timer); finish(v); }, () => { CLEAR_TIMEOUT(timer); finish({ ok: false, error: "not connected" }); });
    } catch (e) { CLEAR_TIMEOUT(timer); finish({ ok: false, error: "not connected" }); }
  });

  /* --------------------------------------------------------------- layout */

  const r1 = (v) => Math.round(v * 10) / 10;
  const rect = (e) => {
    try {
      const b = call(GBCR, e);
      if (!(b.width > 0 && b.height > 0)) return null;
      return { x: r1(b.left), y: r1(b.top), w: r1(b.width), h: r1(b.height) };
    } catch (x) { return null; }
  };
  // The rects of what is on screen, in viewport CSS px: the agent keeps its
  // clicks off the panel with them, and tests click the controls by them.
  const measure = () => {
    const out = {};
    if (!connected(host)) return out;
    const add = (k, e) => { if (S.vis[k] === undefined || S.vis[k] !== "none") { const r = rect(e); if (r) out[k] = r; } };
    if (S.vis.pill === "inline-flex") { const r = rect(pill); if (r) out.pill = { ...r, on: S.traderMode === true }; }
    if (S.vis.stack !== "flex") { if (S.vis.orb === "flex") { const r = rect(orb); if (r) out.orb = { ...r, kb: S.orbKb, r: S.orbR, muted: S.muted, chimes: S.chimes }; } return out; }
    add("panel", stack);
    add("bar", bar);
    if (S.vis.orb === "flex") { const r = rect(orb); if (r) out.orb = { ...r, kb: S.orbKb, r: S.orbR, muted: S.muted, chimes: S.chimes }; }
    if (S.mode === "needkey") { add("keyInput", key.input); add("keySave", keySave); }
    if (S.mode === "idle") { add("input", task.input); add("attach", attachBtn); add("send", sendBtn); if (S.vis.chips === "flex") add("chips", chips); }
    if (S.vis.pause === "inline-flex") add("pause", pauseBtn);
    if (S.vis.resume === "inline-flex") add("resume", resumeBtn);
    if (S.vis.stop === "inline-flex") add("stop", stopBtn);
    if (S.vis.note === "block") add("note", note);
    if (S.vis.card === "flex") {
      add("card", card);
      const ch = {};
      for (const b of S.choiceEls || []) { const r = rect(b.el); if (r) { ch[b.id] = r; if (!(b.id in out)) out[b.id] = r; } }
      out.choices = ch;
    }
    return out;
  };

  /* ---------------------------------------------------------------- render */

  const fmtUsd = (v) => `$${(Math.round(Number(v) * 100) / 100).toFixed(2)}`;
  const validCard = (c) => c && typeof c === "object" && (typeof c.id === "string" || typeof c.id === "number");

  const buildCard = (c) => {
    say("cardTitle", cardTitle, c.title === undefined || c.title === null ? "" : call(SLICE, String(c.title), [0, 300]));
    call(REPLACE_KIDS, cardLines, []);
    const lines = Array.isArray(c.lines) ? c.lines.slice(0, 80) : [];
    for (const l of lines) {
      const d = el("div", { ...BASE, "user-select": "text", "-webkit-user-select": "text", font: `500 13px/1.42 ${FONT}`, color: "rgba(255,255,255,.86)", "overflow-wrap": "anywhere", "white-space": "pre-wrap" });
      text(d, call(SLICE, String(l === null || l === undefined ? "" : l), [0, 2000]));
      put(cardLines, d);
    }
    vis("cardLines", cardLines, lines.length > 0, "flex");
    call(REPLACE_KIDS, cardFoot, []);
    S.choiceEls = [];
    const choices = Array.isArray(c.choices) ? c.choices.slice(0, 6) : [];
    const id = c.id;
    for (const ch of choices) {
      if (!ch || (typeof ch.id !== "string" && typeof ch.id !== "number")) continue;
      const cid = String(ch.id);
      const b = button(call(SLICE, String(ch.label === undefined || ch.label === null ? cid : ch.label), [0, 40]), cid === "approve");
      on(b, "click", (e) => choose(id, cid, e, b));
      put(cardFoot, b);
      S.choiceEls.push({ id: cid, el: b });
    }
  };

  const render = () => {
    if (S.destroyed) return;
    const st = S.state && typeof S.state === "object" ? S.state : null;
    const show = Boolean(st) && S.everOk && !S.rejected && !blockedUrl() && connected(host);
    const tm = show && st.traderMode === true;
    S.traderMode = tm;
    const raw = String((st && st.mode) || "");
    const fold = tm && (raw === "idle" || raw === "needkey");
    vis("stack", stack, show && !fold, "flex");
    // off: only above an idle bar with nothing stacked on it, so it never sits on a card or a note
    vis("pill", pill, show && (tm || (raw === "idle" && S.vis.note !== "block" && S.vis.chips !== "flex")), "inline-flex");
    if (show) {
      say("pill", pill, tm ? "stop trader" : "trader");
      css(pill, tm ? { right: "auto", left: "calc(50% + 40px)", bottom: "22px" } : { left: "auto", right: "16px", bottom: "70px" });
      attr(pill, "title", tm ? "Trader mode is on (training, fake money). Click to stop it." : "Start trader mode (training, fake money)");
    }
    const tr = show && st.trader && typeof st.trader === "object" && st.trader.on === true ? st.trader : null;
    vis("orb", orb, Boolean(tr), "flex");
    if (tr) {
      const kb = Math.max(0, Math.round(Number(tr.kb) || 0));
      const r = orbRadius(kb);
      S.orbR = r; S.orbKb = kb; S.muted = tr.muted === true;
      css(orb, { width: `${(2 * r).toFixed(1)}px`, height: `${(2 * r).toFixed(1)}px`, opacity: S.muted ? "0.62" : "1" });
      say("orbKb", orbKb, r >= 12 ? `${kb}` : "");
      attr(orb, "title", `trader memory ${kb} KB${S.muted ? " · muted (click to unmute)" : " · click to mute"}`);
      const paid = Math.max(0, Number(tr.paid) || 0);
      let visible = true;
      try { visible = call(VISIBLE, document) === "visible"; } catch (e) { visible = true; }
      if (S.paidSeen === null) S.paidSeen = paid;            // first sight: no chime for old wins
      else if (paid > S.paidSeen) { S.paidSeen = paid; if (!S.muted && visible) chime(); }
    } else S.paidSeen = null;
    if (!show) return;

    let mode = S.tampered ? "off" : S.fails >= OFFLINE_AFTER ? "offline" : String(st.mode || "");
    if (!MODES[mode]) mode = "status";
    if (mode === "card" && !validCard(st.card)) mode = "status";
    const was = S.mode;
    S.mode = mode;

    /* bar faces */
    vis("keyFace", keyFace, mode === "needkey", "flex");
    vis("taskFace", taskFace, mode === "idle", "flex");
    const statusy = mode !== "needkey" && mode !== "idle";
    vis("statusFace", statusFace, statusy, "flex");
    if (statusy) {
      const parts = [];
      if (mode === "queued") parts.push("Queued");
      if (mode === "paused") parts.push("Paused");
      if (mode !== "off" && mode !== "offline") {
        const sp = st.step;
        if (sp && typeof sp === "object" && isFinite(Number(sp.n))) parts.push(isFinite(Number(sp.max)) && sp.max !== null ? `step ${Number(sp.n)}/${Number(sp.max)}` : `step ${Number(sp.n)}`);
        const u = st.usd;
        if (u && typeof u === "object" && isFinite(Number(u.spent)) && u.spent !== null) parts.push(isFinite(Number(u.cap)) && u.cap !== null ? `${fmtUsd(u.spent)} of ${fmtUsd(u.cap)}` : fmtUsd(u.spent));
      }
      say("meta", meta, parts.length ? parts.join(" · ") : `ultracursor${BUILD ? ` · build ${BUILD}` : ""}`);
      let line = typeof st.status === "string" ? st.status.replace(/\s+/g, " ").trim() : "";
      if (mode === "off") line = "ultracursor is off on this page";
      else if (mode === "offline") line = "ultracursor is not connected";
      else if (!line) line = mode === "queued" ? "Waiting for the last job to finish" : mode === "paused" ? "Paused" : mode === "running" ? "Working…" : "";
      say("status", statusLine, line);
      vis("dot", dot, mode === "running" || mode === "queued" || mode === "paused", "inline-block");
      if (mode !== was) {
        try { if (S.pulse) S.pulse.cancel(); } catch (e) {}
        S.pulse = null;
        if (mode === "running" || mode === "queued") {
          try { S.pulse = dot.animate([{ opacity: 0.3 }, { opacity: 1 }, { opacity: 0.3 }], { duration: 1800, iterations: Infinity, easing: "ease-in-out" }); } catch (e) {}
        } else css(dot, { opacity: mode === "paused" ? "0.45" : "1" });
      }
    }
    const working = mode === "queued" || mode === "running";
    vis("pause", pauseBtn, working, "inline-flex");
    vis("resume", resumeBtn, mode === "paused", "inline-flex");
    vis("stop", stopBtn, working || mode === "paused", "inline-flex");

    /* card */
    if (mode === "card") {
      const c = st.card;
      let k = "";
      try { k = STRINGIFY([c.id, c.title, c.lines, c.choices]); } catch (e) { k = String(c.id); }
      if (k !== S.cardKey) {
        S.cardKey = k;
        buildCard(c);
      }
      if (S.cardId !== c.id) {
        S.cardId = c.id;
        S.cardAt = NOW();
        S.decided = null;
        try { card.animate([{ opacity: 0, transform: "translateY(8px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" }); } catch (e) {}
        // The buttons come up over the arming time, so the wait is visible.
        for (const b of S.choiceEls || []) { try { b.el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: ARM_MS, easing: "ease-out" }); } catch (e) {} }
      }
      const off = S.decided !== null && S.decided === c.id;
      for (const b of S.choiceEls || []) css(b.el, { opacity: off ? "0.45" : "1", cursor: off ? "default" : "pointer" });
      vis("card", card, true, "flex");
    } else {
      vis("card", card, false);
      S.cardId = null;
      S.cardKey = "";
    }

    /* photo chips */
    const chipsOn = mode === "idle" && S.files.length > 0;
    if (chipsOn && S.chipsVer !== S.filesVer) {
      S.chipsVer = S.filesVer;
      call(REPLACE_KIDS, chips, []);
      S.files.forEach((f, i) => {
        const c = el("div", { ...BASE, ...GLASS, ...SURFACE, display: "inline-flex", "align-items": "center", gap: "6px", height: "28px", padding: "0 5px 0 12px", "border-radius": "14px", "max-width": "220px" });
        const n = el("span", { ...BASE, font: `500 12px/1 ${FONT}`, color: "#f4f4f4", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis", "min-width": "0" });
        text(n, f.name);
        const x = button("", false, { width: "18px", height: "18px", padding: "0", "border-radius": "50%" });
        put(x, icon([["path", { d: "M7 7 L17 17" }], ["path", { d: "M17 7 L7 17" }]], "#f4f4f4", 10));
        on(x, "click", (e) => { if (!pointer(e)) return; S.files.splice(i, 1); S.filesVer++; blurAll(); render(); });
        put(c, n);
        put(c, x);
        put(chips, c);
      });
    }
    vis("chips", chips, chipsOn, "flex");

    /* note line */
    if (S.note && S.noteKind === "info" && NOW() - S.noteAt > 6000 && !S.sending) { S.note = ""; S.noteKind = ""; }
    say("note", note, S.note);
    vis("note", note, Boolean(S.note) && mode !== "off" && mode !== "offline", "block");

    /* busy while sending */
    const busy = S.sending;
    try { call(READONLY, key.input, [busy]); call(READONLY, task.input, [busy]); } catch (e) {}
    css(sendBtn, { opacity: busy ? "0.45" : "1" });
    css(keySave, { opacity: busy ? "0.45" : "1" });
    css(attachBtn, { opacity: busy ? "0.45" : "1" });
    css(bar, { "border-color": S.drop ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.24)" });
    hints();
  };

  const hints = () => {
    vis("keyHint", key.hint, value(key.input) === "", "block");
    vis("taskHint", task.hint, value(task.input) === "", "block");
  };

  /* ------------------------------------------------------------- actions */

  // A real press of a real pointer: isTrusted, and detail >= 1 (a click made
  // from the keyboard has detail 0, so a key the agent presses cannot hit us).
  const pointer = (e) => Boolean(e) && e.isTrusted === true && Number(e.detail) >= 1;
  const blurAll = () => {
    try { const a = call(ACTIVE, shadow); if (a) call(BLUR, a); } catch (e) {}
  };

  const choose = (cardId, choiceId, e, btn) => {
    if (!pointer(e)) return;
    try { call(BLUR, btn); } catch (x) {}
    if (S.mode !== "card" || S.cardId !== cardId || S.decided === cardId) return;
    if (NOW() - S.cardAt < ARM_MS) return;
    S.decided = cardId;
    render();
    send({ type: "decide", card: cardId, choice: choiceId }, 15000).then((r) => {
      if (!(r && r.ok === true) && S.decided === cardId) {
        S.decided = null;
        showNote(errText(r, "That did not go through. Try again."), "error");
      }
    });
  };

  const control = (cmd, e, btn) => {
    if (!pointer(e)) return;
    try { call(BLUR, btn); } catch (x) {}
    send({ type: "control", cmd }, 15000).then((r) => { if (!(r && r.ok === true)) showNote(errText(r, "ultracursor did not take that. Try again."), "error"); });
  };
  on(pauseBtn, "click", (e) => control("pause", e, pauseBtn));
  on(resumeBtn, "click", (e) => control("resume", e, resumeBtn));
  on(stopBtn, "click", (e) => control("stop", e, stopBtn));
  // the orb: a real click toggles the chime's mute (kept by node in the trader's memory folder)
  on(orb, "click", (e) => { if (!pointer(e)) return; send({ type: "traderMute", muted: !S.muted }, 8000).then(() => {}); });
  // the trader pill: a real click switches trader mode (node keeps it in the trader's mode.json)
  on(pill, "click", (e) => { if (!pointer(e)) return; try { call(BLUR, pill); } catch (x) {} send({ type: "traderMode", on: !S.traderMode }, 8000).then((r) => { if (!(r && r.ok === true)) showNote(errText(r, "ultracursor did not take that. Try again."), "error"); }); });

  const saveKey = () => {
    if (S.sending) return;
    const k = trim(value(key.input));
    if (!k) { showNote("Paste the key first", "error"); return; }
    S.sending = true;
    render();
    send({ type: "setKey", key: k }, 20000).then((r) => {
      S.sending = false;
      if (r && r.ok === true) {
        call(VALUE_SET, key.input, [""]);
        blurAll();
        showNote("", "");
      } else showNote(errText(r, "That key did not work"), "error");
    });
  };
  on(keySave, "click", (e) => { if (pointer(e)) { call(BLUR, keySave); saveKey(); } });

  const mimeOf = (name, type) => {
    if (typeof type === "string" && /^image\/[\w.+-]+$/i.test(type)) return call(LOWER, type);
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ""));
    return m ? IMG_EXT[call(LOWER, m[1])] || "" : "";
  };
  const addFiles = (list) => {
    let n = 0, skipped = "";
    try { n = list ? Number(call(FL_LEN, list)) : 0; } catch (e) { n = 0; }
    for (let i = 0; i < n; i++) {
      const f = list[i];
      if (!f) continue;
      const name = String(call(F_NAME, f) || "photo");
      const type = mimeOf(name, call(B_TYPE, f));
      const size = Number(call(B_SIZE, f)) || 0;
      if (!type) { skipped = `Only photos: ${name}`; continue; }
      if (size > MAX_BYTES) { skipped = `Too big (20 MB max): ${name}`; continue; }
      if (S.files.length >= MAX_FILES) { skipped = `${MAX_FILES} photos at most`; break; }
      if (S.files.some((x) => x.name === name && x.size === size)) continue;
      S.files.push({ file: f, name, type, size });
      S.filesVer++;
    }
    if (skipped) showNote(skipped, "error");
    else render();
  };

  const b64 = async (f) => {
    const buf = await call(B_BUF, f);
    const u = new U8(buf);
    if (typeof TO_B64 === "function") return call(TO_B64, u);
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += APPLY(FROM_CC, null, call(SUBARRAY, u, [i, Math.min(u.length, i + 0x8000)]));
    return call(BTOA, window, [s]);
  };

  const sendTask = async () => {
    if (S.sending) return;
    const t = trim(value(task.input));
    if (!t) { showNote(S.files.length ? "Say what to do with the photos" : "Type what ultracursor should do", "error"); return; }
    S.sending = true;
    render();
    // One draft id per attempt: a retry never mixes with photos node already took.
    const draft = rid();
    const files = S.files.slice();
    let ok = true, why = "";
    try {
      for (let i = 0; i < files.length; i++) {
        showNote(files.length > 1 ? `Sending photo ${i + 1} of ${files.length}…` : "Sending the photo…", "info");
        let data;
        try { data = await b64(files[i].file); } catch (e) { ok = false; why = `Could not read ${files[i].name}`; break; }
        const r = await send({ type: "file", draft, name: files[i].name, mime: files[i].type, b64: data }, 120000);
        if (!(r && r.ok === true)) { ok = false; why = errText(r, `Could not send ${files[i].name}`); break; }
      }
      if (ok) {
        const r = await send({ type: "task", draft, text: t }, 20000);
        if (!(r && r.ok === true)) { ok = false; why = errText(r, "Could not send that. Try again."); }
      }
    } catch (e) { ok = false; why = "Could not send that. Try again."; }
    S.sending = false;
    if (ok) {
      call(VALUE_SET, task.input, [""]);
      S.files = [];
      S.filesVer++;
      blurAll();
      showNote("", "");
    } else showNote(why, "error");
  };
  on(sendBtn, "click", (e) => { if (pointer(e)) { call(BLUR, sendBtn); sendTask(); } });
  on(attachBtn, "click", (e) => {
    if (!pointer(e) || S.sending) return;
    call(BLUR, attachBtn);
    try { call(CLICK, fileInput); } catch (x) {}
  });
  on(fileInput, "change", () => {
    let list = null;
    try { list = call(FILES, fileInput); } catch (e) { list = null; }
    addFiles(list);
    try { call(VALUE_SET, fileInput, [""]); } catch (e) {}
  });

  // Photos dropped on the bar. dragover must be cancelled for a drop to happen;
  // anywhere on the panel it is, so a missed drop never opens the file instead.
  const hasFiles = (e) => {
    try { const dt = call(DT, e); const ts = dt ? call(DT_TYPES, dt) : null; return Boolean(ts) && Array.prototype.indexOf.call(ts, "Files") >= 0; } catch (x) { return false; }
  };
  const dragOver = (e) => {
    if (!hasFiles(e)) return;
    call(PREVENT, e);
    const okHere = S.mode === "idle" && !S.sending;
    try { call(DT_EFFECT, call(DT, e), [okHere ? "copy" : "none"]); } catch (x) {}
    if (okHere !== S.drop) { S.drop = okHere; render(); }
  };
  on(stack, "dragenter", dragOver);
  on(stack, "dragover", dragOver);
  on(stack, "dragleave", () => { if (S.drop) { S.drop = false; render(); } });
  on(stack, "drop", (e) => {
    if (!hasFiles(e)) return;
    call(PREVENT, e);
    S.drop = false;
    if (e.isTrusted !== true || S.mode !== "idle" || S.sending) { render(); return; }
    let list = null;
    try { list = call(DT_FILES, call(DT, e)); } catch (x) { list = null; }
    addFiles(list);
  });

  // Clicking anywhere on a field (its wrap included) puts the caret there, even
  // if the page cancels mousedown to keep its own focus.
  on(key.wrap, "pointerdown", (e) => { if (e.isTrusted) SET_TIMEOUT(() => { try { call(FOCUS, key.input); } catch (x) {} }, 0); });
  on(task.wrap, "pointerdown", (e) => { if (e.isTrusted) SET_TIMEOUT(() => { try { call(FOCUS, task.input); } catch (x) {} }, 0); });

  /* -------------------------------------------- keys stay inside the panel */

  // Registered on the window in the capture phase before any page script, so
  // nothing of the page sees a key typed here (retargeted, its target is the
  // host). Enter and Escape are handled here because the event never gets
  // further in; the browser still types the character, which no listener does.
  const onKey = (e) => {
    let a = null;
    try { a = call(ACTIVE, shadow); } catch (x) { a = null; }
    if (e.key === "Enter" && e.isTrusted === true && !e.isComposing) {
      if (a === task.input) { call(PREVENT, e); sendTask(); }
      else if (a === key.input) { call(PREVENT, e); saveKey(); }
    } else if (e.key === "Escape" && a) {
      try { call(BLUR, a); } catch (x) {}
    }
  };
  const SHIELD = ["keydown", "keyup", "keypress", "input", "beforeinput", "textInput", "compositionstart", "compositionupdate", "compositionend", "paste", "copy", "cut", "focusin", "focusout", "focus", "blur", "select"];
  const shield = (e) => {
    let t = null;
    try { t = call(TARGET, e); } catch (x) { return; }
    if (t !== host) return;
    if (e.type === "keydown") onKey(e);
    if (e.type === "input" || e.type === "keyup" || e.type === "paste") SET_TIMEOUT(hints, 0);
    try { call(STOP_NOW, e); } catch (x) {}
  };
  const SHIELD_OPTS = { capture: true };
  const listen = () => { for (const t of SHIELD) { try { call(ADD, window, [t, shield, SHIELD_OPTS]); } catch (x) {} } };
  // Pointer events end at the shadow root, after our own controls had them.
  for (const t of ["click", "dblclick", "auxclick", "contextmenu", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "wheel", "dragenter", "dragover", "dragleave", "drop"]) {
    on(shadow, t, (e) => { try { call(STOP, e); } catch (x) {} });
  }

  /* ----------------------------------------------------------------- rules */

  const blockedUrl = () => {
    try {
      const h = String(location.hostname || "").toLowerCase();
      if (h === "accounts.google.com" || h === "appleid.apple.com") return true;
      return String(location.href || "").toLowerCase().includes("/login");
    } catch (e) { return false; }
  };
  const htmlDoc = () => {
    try {
      const ct = String(document.contentType || "text/html").toLowerCase();
      return ct.includes("html") && document.documentElement instanceof HTMLElement;
    } catch (e) { return false; }
  };

  /* ----------------------------------------------------------------- mount */

  // The top layer keeps the panel above the page's own modal <dialog>s and
  // popovers. If a page rule paints every ::backdrop, leave the top layer for
  // this document and stay a plain fixed element at the highest z-index.
  const isOpen = () => { try { return host.matches(":popover-open"); } catch (e) { return false; } };
  const backdropPainted = () => {
    try {
      const b = getComputedStyle(host, "::backdrop");
      const bg = String(b.backgroundColor || "").replace(/\s+/g, "");
      const clear = bg === "" || bg === "transparent" || /^rgba\(\d+,\d+,\d+,0\)$/.test(bg);
      const bf = String(b.backdropFilter || b.webkitBackdropFilter || "none");
      const bi = String(b.backgroundImage || "none");
      return !clear || (bf !== "none" && bf !== "") || (bi !== "none" && bi !== "");
    } catch (e) { return false; }
  };
  const showTop = () => {
    S.topLayer = false;
    if (S.noTop || typeof host.showPopover !== "function") return;
    try {
      if (!isOpen()) host.showPopover();
      S.topLayer = isOpen();
      if (S.topLayer && backdropPainted()) { S.noTop = true; host.hidePopover(); S.topLayer = false; }
    } catch (e) { S.topLayer = false; }
  };
  const others = () => {
    let list = [];
    try { list = Array.from(document.querySelectorAll(":modal, :popover-open")); }
    catch (e) { try { list = Array.from(document.querySelectorAll("dialog[open]")); } catch (e2) { list = []; } }
    try { if (document.fullscreenElement) list.push(document.fullscreenElement); } catch (e) {}
    return list.filter((x) => x !== host);
  };
  // Something the page put in the top layer after us sits above us: step back on top.
  const raise = () => {
    if (!S.topLayer || !connected(host)) return;
    if (backdropPainted()) { S.noTop = true; S.topLayer = false; try { host.hidePopover(); } catch (e) {} return; }
    const now = others();
    const fresh = now.some((x) => S.above.indexOf(x) < 0);
    S.above = now;
    if (!fresh) return;
    try { host.hidePopover(); host.showPopover(); S.topLayer = isOpen(); } catch (e) {}
  };

  const unmount = () => { if (connected(host)) { try { call(REMOVE, host); } catch (e) {} } };

  const mount = () => {
    if (S.destroyed) return false;
    if (blockedUrl() || !htmlDoc()) { unmount(); return false; }
    const root = document.documentElement;
    if (!root) return false;
    if (document.readyState === "loading" && !S.mountedOnce) return false; // waits for DOMContentLoaded
    if (host.parentNode !== root) {
      try { put(root, host); } catch (e) { return false; }
      S.attaches++;
      S.above = [];
      observe();
      listen();
      if (!S.mountedOnce) {
        S.mountedOnce = true;
        try { bar.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }); } catch (e) {}
      }
    }
    showTop();
    raise();
    render();
    return true;
  };

  // A framework re-rendered the whole document: put the panel back, but never
  // fight a page in a tight loop (25 times in five seconds, then the tick).
  const reattachSoon = () => {
    const now = NOW();
    S.recent = S.recent.filter((t) => now - t < 5000);
    if (S.recent.length >= 25) return;
    S.recent.push(now);
    SET_TIMEOUT(mount, 0);
  };
  let mo = null, watched = null;
  const observe = () => {
    try {
      const root = document.documentElement;
      if (mo && watched === root) return;
      if (!mo) {
        mo = new MutationObserver(() => {
          if (S.destroyed) return;
          if (watched !== document.documentElement) observe();
          if (!connected(host) && !blockedUrl()) reattachSoon();
        });
      }
      mo.disconnect();
      mo.observe(document, { childList: true });
      if (root) mo.observe(root, { childList: true });
      watched = root;
    } catch (e) {}
  };

  /* ------------------------------------------------------------------ poll */

  const poll = () => {
    if (S.destroyed || S.inflight || S.tampered || S.rejected || blockedUrl()) return;
    S.inflight = true;
    const msg = { type: "poll", layout: measure(), seen: { v: V, bound: B.how, mounted: connected(host), mode: S.mode, card: S.vis.card === "flex" ? S.cardId : null } };
    send(msg, 4000).then((r) => {
      S.inflight = false;
      if (S.destroyed) return;
      if (r && typeof r === "object" && typeof r.mode === "string") {
        S.state = r; S.everOk = true; S.fails = 0;
      } else if (r && r.ok === false && r.error === "bad token") {
        S.rejected = true; // a newer ultracursor took over; this copy steps down
      } else S.fails++;
      render();
    });
  };

  const tick = () => {
    if (S.destroyed) return;
    if (location.href !== S.href) S.href = location.href;
    if (blockedUrl()) { unmount(); return; }
    if (!connected(host)) mount();
    else if (!S.noTop && typeof host.showPopover === "function" && !isOpen()) showTop();
    else raise();
    poll();
  };

  on(document, "DOMContentLoaded", () => mount());
  on(window, "popstate", () => SET_TIMEOUT(tick, 0));
  on(window, "hashchange", () => SET_TIMEOUT(tick, 0));
  listen();
  const timer = SET_INTERVAL(tick, 500);

  /* ------------------------------------------------------------------- api */

  // On window only what a second copy needs to replace this one. No token, no
  // state: page scripts can read this.
  const brief = () => ({ ok: true, v: V, mounted: connected(host), blocked: blockedUrl(), bound: B.how });
  const api = O.freeze({
    v: V,
    hid: HID,
    brief,
    ensure() { observe(); return mount(); },
    destroy() {
      if (S.destroyed) return;
      S.destroyed = true;
      CLEAR_INTERVAL(timer);
      try { if (mo) mo.disconnect(); } catch (e) {}
      for (const t of SHIELD) { try { call(REM, window, [t, shield, SHIELD_OPTS]); } catch (e) {} }
      unmount();
      try { if (own(window, "__ucPanel") === api) delete window.__ucPanel; } catch (e) {}
    },
  });

  try { DEF(window, "__ucPanel", { value: api, configurable: true, enumerable: false, writable: false }); } catch (e) {}

  S.href = location.href;
  observe();
  mount();
  poll();
  return brief();
})()
