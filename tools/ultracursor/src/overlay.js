/*
 * ultracursor overlay. This file runs INSIDE the page (Chrome), never in node.
 *
 * It is injected on every page with context.addInitScript and evaluated once on
 * the page that is already open (ui.mjs does both). It draws three things and
 * nothing else:
 *   - the cursor: the ultracursor logo arrow in black liquid glass with a white
 *     rim and a specular streak, plus a small white-glass chip "ultracursor".
 *     It follows real mousemove events, so every page.mouse.move moves it, and
 *     a clear glass ripple marks every mousedown;
 *   - the status pill, bottom-left: logo, "ultracursor · build N", and one line
 *     of what the app is doing right now;
 *   - a soft white ring around the element being read.
 *
 * Rules carried over from Magic Wand, each one paid for there:
 *   - No <style> element, no @keyframes, no innerHTML. Sites with a nonce CSP
 *     drop injected stylesheets without an error, and Google's Trusted Types
 *     throw on innerHTML. Every style is written through el.style (CSSOM, which
 *     CSP does not cover) and every animation is a transition or el.animate().
 *   - pointer-events:none on everything, so it can never take a click.
 *   - It does not draw on sign-in pages (accounts.google.com, appleid.apple.com,
 *     any URL containing /login or /accounts/login). Alex signs in there by hand.
 *   - It puts itself back when a single-page app wipes the document.
 *   - Only white, black and neutral greys. No blue, no purple, no green.
 *
 * Page API, on window.__uc:
 *   status(text)              the pill's line
 *   highlight(rect|el|null)   rect = {x,y,w,h} (or width/height) in viewport px
 *   build(n)                  the build number in the pill
 *   move(x,y), ripple(x,y)    place the cursor / draw a ripple without an event
 *   state()                   measured positions, for tests and diagnostics
 */
(() => {
  "use strict";
  const V = 5;

  let isTop = false;
  try { isTop = window.top === window; } catch (e) { isTop = false; }
  if (!isTop) return { ok: false, why: "subframe" };

  const prev = window.__uc;
  if (prev && prev.v === V && typeof prev.ensure === "function") {
    try {
      if (window.__ucBuild !== undefined && window.__ucBuild !== null) prev.build(window.__ucBuild);
      prev.ensure();
      return prev.brief();
    } catch (e) { /* fall through and rebuild */ }
  }
  if (prev && typeof prev.destroy === "function") { try { prev.destroy(); } catch (e) {} }

  const TOP = "2147483647";
  const NS = "http://www.w3.org/2000/svg";
  const ID = "uc" + Math.random().toString(36).slice(2, 9);
  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';
  const ARROW = "M372 236 L742 520 L578 545 L486 716 Z"; // the logo's own arrow (design/ultracursor/icon.svg)

  // Inside the closed shadow root no page rule can reach, so plain priority is
  // right (and lets el.animate() win over it). Only the host, which lives in
  // the page's own DOM, is written with !important.
  const css = (el, s, imp) => {
    for (const k in s) el.style.setProperty(k, String(s[k]), imp ? "important" : "");
    return el;
  };
  const div = (s) => css(document.createElement("div"), s || {});
  const span = (s, text) => { const e = css(document.createElement("span"), s || {}); if (text) e.textContent = text; return e; };
  const sv = (tag, attrs, kids) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, String(attrs[k]));
    for (const c of kids || []) e.appendChild(c);
    return e;
  };
  const stop = (offset, color, opacity) => sv("stop", { offset, "stop-color": color, "stop-opacity": opacity === undefined ? 1 : opacity });

  // Reset that every element in the overlay starts from, so no page rule can
  // reach in and no inherited value leaks out.
  const BASE = {
    "box-sizing": "border-box", margin: "0", padding: "0", border: "0",
    "pointer-events": "none", "user-select": "none", "-webkit-user-select": "none",
    "font-family": FONT, "line-height": "normal", "letter-spacing": "normal",
    "text-transform": "none", "text-shadow": "none", "text-align": "left",
    "-webkit-font-smoothing": "antialiased", "font-kerning": "normal",
  };

  const S = {
    build: window.__ucBuild === undefined ? null : window.__ucBuild,
    status: "ready",
    x: null, y: null, seen: false,
    hlEl: null, hlRect: null, hlScroll: { x: 0, y: 0 }, ringOn: false,
    attaches: 0, recent: [], topLayer: false, mountedOnce: false,
    href: "", lastRipple: 0, pillRect: null, dodging: false, destroyed: false,
    noTop: false, above: [], lastPointer: -1e9,
  };

  /* ------------------------------------------------------------------ host */

  const host = document.createElement("ultracursor-overlay");
  css(host, {
    all: "initial", display: "block", position: "fixed", inset: "0", left: "0", top: "0",
    width: "auto", height: "auto", margin: "0", padding: "0", border: "0",
    background: "transparent", overflow: "visible", "pointer-events": "none",
    "z-index": TOP, contain: "none", opacity: "1", visibility: "visible",
    transform: "none", filter: "none", "color-scheme": "normal", "max-width": "none", "max-height": "none",
  }, true);
  try { host.setAttribute("popover", "manual"); } catch (e) {}
  host.setAttribute("aria-hidden", "true");
  let shadow;
  try { shadow = host.attachShadow({ mode: "closed" }); } catch (e) { shadow = host; }

  const layer = div({ ...BASE, position: "fixed", inset: "0", overflow: "visible" });
  shadow.appendChild(layer);

  /* ---------------------------------------------------------------- cursor */

  // The arrow lives in the logo's 1024 coordinate space; s is pixels per unit.
  // At 0.056 the arrow is ~27px tall and ~21px wide.
  const s = 0.056;
  const VB = { x: 347, y: 211, w: 420, h: 530 };
  const TIP = { x: (372 - VB.x) * s, y: (236 - VB.y) * s };

  const arrowSvg = sv("svg", {
    xmlns: NS, width: (VB.w * s).toFixed(2), height: (VB.h * s).toFixed(2),
    viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, overflow: "visible",
  }, [
    sv("defs", {}, [
      sv("linearGradient", { id: ID + "b", gradientUnits: "userSpaceOnUse", x1: 372, y1: 236, x2: 742, y2: 716 }, [
        stop(0, "#5b5b5b", 0.96), stop(0.42, "#161616", 0.94), stop(1, "#000000", 0.97),
      ]),
      sv("linearGradient", { id: ID + "r", gradientUnits: "userSpaceOnUse", x1: 372, y1: 236, x2: 742, y2: 716 }, [
        stop(0, "#ffffff"), stop(0.35, "#dedede"), stop(0.62, "#6a6a6a"), stop(1, "#ffffff", 0.92),
      ]),
      sv("linearGradient", { id: ID + "s", x1: 0, y1: 0, x2: 1, y2: 0 }, [
        stop(0, "#ffffff", 0), stop(0.5, "#ffffff", 0.85), stop(1, "#ffffff", 0),
      ]),
      sv("filter", { id: ID + "f", x: "-20%", y: "-20%", width: "140%", height: "140%" }, [
        sv("feGaussianBlur", { stdDeviation: 9 }),
      ]),
      sv("filter", { id: ID + "g", x: "-20%", y: "-20%", width: "140%", height: "140%" }, [
        sv("feGaussianBlur", { stdDeviation: 4 }),
      ]),
      sv("clipPath", { id: ID + "c" }, [sv("path", { d: ARROW })]),
    ]),
    sv("path", { d: ARROW, fill: `url(#${ID}b)` }),
    sv("g", { "clip-path": `url(#${ID}c)` }, [
      sv("path", { d: "M300 300 L760 520 L760 470 L300 250Z", fill: `url(#${ID}s)`, opacity: 0.34, filter: `url(#${ID}f)` }),
      sv("ellipse", { cx: 470, cy: 360, rx: 120, ry: 40, transform: "rotate(37 470 360)", fill: "#ffffff", opacity: 0.2, filter: `url(#${ID}f)` }),
      sv("path", { d: "M398 280 L690 503", stroke: "#ffffff", "stroke-opacity": 0.85, "stroke-width": 20, "stroke-linecap": "round", filter: `url(#${ID}g)` }),
    ]),
    sv("path", { d: ARROW, fill: "none", stroke: `url(#${ID}r)`, "stroke-width": 29, "stroke-linejoin": "round" }),
    sv("path", { d: ARROW, fill: "none", stroke: "#ffffff", "stroke-opacity": 0.22, "stroke-width": 9, "stroke-linejoin": "round", transform: "translate(9 12) scale(.975)" }),
  ]);
  css(arrowSvg, {
    ...BASE, position: "absolute", left: "0", top: "0", display: "block", overflow: "visible",
    filter: "drop-shadow(0 1.5px 1.5px rgba(0,0,0,.45)) drop-shadow(0 5px 9px rgba(0,0,0,.28)) drop-shadow(0 0 6px rgba(255,255,255,.16))",
    "transform-origin": `${TIP.x}px ${TIP.y}px`,
  });

  // The chip that rides with the cursor: white glass, black text.
  const chip = div({
    ...BASE, position: "absolute", left: "20px", top: "25px", display: "block",
    padding: "3px 8px 3.5px", "border-radius": "999px", "white-space": "nowrap",
    font: `600 10.5px/1.25 ${FONT}`, "letter-spacing": ".01em", color: "#0d0d0d",
    background: "linear-gradient(180deg, rgba(255,255,255,.98) 0%, rgba(247,247,247,.95) 55%, rgba(234,234,234,.94) 100%)",
    "backdrop-filter": "blur(14px) saturate(0)", "-webkit-backdrop-filter": "blur(14px) saturate(0)",
    border: "0.5px solid rgba(0,0,0,.14)",
    "box-shadow": "inset 0 1px 0 #ffffff, inset 0 -1px 0 rgba(0,0,0,.06), 0 1px 1.5px rgba(0,0,0,.22), 0 6px 16px -6px rgba(0,0,0,.42)",
    transition: "left .18s ease, top .18s ease",
  });
  chip.textContent = "ultracursor";

  const cursor = div({
    ...BASE, position: "fixed", left: "0", top: "0", width: "1px", height: "1px",
    opacity: "0", transition: "opacity .22s ease", "will-change": "transform",
    transform: "translate3d(-100px,-100px,0)",
  });
  cursor.appendChild(arrowSvg);
  cursor.appendChild(chip);

  /* ------------------------------------------------------------------ ring */

  const RING_GLIDE = "left .28s cubic-bezier(.22,.8,.28,1), top .28s cubic-bezier(.22,.8,.28,1), width .28s cubic-bezier(.22,.8,.28,1), height .28s cubic-bezier(.22,.8,.28,1), opacity .2s ease, border-radius .2s ease";
  const ring = div({
    ...BASE, position: "fixed", left: "0", top: "0", width: "0", height: "0", opacity: "0",
    "border-radius": "10px", border: "1.5px solid rgba(255,255,255,.97)",
    background: "linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,0) 40%)",
    "box-shadow": "0 0 0 1px rgba(0,0,0,.26), inset 0 0 0 1px rgba(0,0,0,.16), 0 0 18px 2px rgba(255,255,255,.42), 0 10px 28px -8px rgba(0,0,0,.28), inset 0 0 16px rgba(255,255,255,.14)",
    transition: "opacity .2s ease",
  });

  /* ------------------------------------------------------------------ pill */

  const logoSvg = (() => {
    const t = (cx, cy, r, o) => sv("circle", { cx, cy, r, fill: "#ffffff", opacity: o });
    const glint = (x, y, k, o) => sv("path", {
      d: `M0 -${k} L${k * 0.18} 0 L0 ${k} L-${k * 0.18} 0Z M-${k} 0 L0 ${k * 0.18} L${k} 0 L0 -${k * 0.18}Z`,
      fill: "#ffffff", opacity: o, transform: `translate(${x} ${y})`,
    });
    return sv("svg", { xmlns: NS, width: 32, height: 32, viewBox: "0 0 1024 1024" }, [
      sv("defs", {}, [
        sv("radialGradient", { id: ID + "lb", cx: "40%", cy: "30%", r: "85%" }, [
          stop(0, "#1c1c1c"), stop(0.55, "#070707"), stop(1, "#000000"),
        ]),
        sv("linearGradient", { id: ID + "lt", gradientUnits: "userSpaceOnUse", x1: 372, y1: 236, x2: 742, y2: 716 }, [
          stop(0, "#5e5e5e", 0.96), stop(0.45, "#151515", 0.94), stop(1, "#000000", 0.96),
        ]),
        sv("linearGradient", { id: ID + "lr", gradientUnits: "userSpaceOnUse", x1: 372, y1: 236, x2: 742, y2: 716 }, [
          stop(0, "#ffffff"), stop(0.35, "#dcdcdc"), stop(0.6, "#5e5e5e"), stop(1, "#ffffff", 0.92),
        ]),
        sv("radialGradient", { id: ID + "lh", cx: "50%", cy: "50%", r: "50%" }, [
          stop(0, "#ffffff", 0.18), stop(1, "#ffffff", 0),
        ]),
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
  })();
  css(logoSvg, { ...BASE, display: "block", flex: "0 0 auto", width: "32px", height: "32px", "border-radius": "8px", "box-shadow": "0 1px 2px rgba(0,0,0,.5), 0 0 0 .5px rgba(255,255,255,.14)" });

  const pill = div({
    ...BASE, position: "fixed", left: "16px", bottom: "16px", display: "flex", "align-items": "center",
    gap: "10px", padding: "7px 18px 7px 7px", "border-radius": "999px", "min-width": "220px",
    "max-width": "min(560px, calc(100vw - 32px))", overflow: "hidden", color: "#f5f5f5",
    background:
      "radial-gradient(120% 160% at 10% -40%, rgba(255,255,255,.22) 0%, rgba(255,255,255,.07) 34%, rgba(255,255,255,0) 60%)," +
      "linear-gradient(180deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,0) 46%, rgba(0,0,0,.30) 100%)," +
      "rgba(11,11,11,.84)",
    // saturate(0): what shows through the glass keeps its light and shape but
    // loses its colour, so a green or blue page never tints the pill.
    "backdrop-filter": "blur(22px) saturate(0) brightness(.8)", "-webkit-backdrop-filter": "blur(22px) saturate(0) brightness(.8)",
    border: "0.5px solid rgba(255,255,255,.24)",
    "box-shadow":
      "inset 0 1px 0 rgba(255,255,255,.34), inset 1px 0 0 rgba(255,255,255,.08), inset 0 -1px 0 rgba(0,0,0,.55)," +
      "0 0 0 .5px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.35), 0 16px 38px -12px rgba(0,0,0,.6)",
    transition: "opacity .25s ease",
  });
  const sheen = div({
    ...BASE, position: "absolute", inset: "0", "border-radius": "inherit",
    background: "linear-gradient(112deg, rgba(255,255,255,0) 28%, rgba(255,255,255,.075) 42%, rgba(255,255,255,0) 56%)",
  });
  const streak = div({
    ...BASE, position: "absolute", top: "0", left: "16%", width: "48%", height: "1px",
    background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.9), rgba(255,255,255,0))",
  });
  const col = div({ ...BASE, display: "flex", "flex-direction": "column", "justify-content": "center", gap: "2px", "min-width": "0", flex: "1 1 auto", position: "relative" });
  const line1 = div({ ...BASE, display: "flex", "align-items": "center", gap: "4px", "white-space": "nowrap" });
  const brand = span({
    ...BASE, font: `600 10.5px/1.2 ${FONT}`, "letter-spacing": ".03em",
    background: "linear-gradient(180deg, #ffffff 0%, #e2e2e2 55%, #a8a8a8 100%)",
    "-webkit-background-clip": "text", "background-clip": "text", color: "transparent", "-webkit-text-fill-color": "transparent",
  }, "ultracursor");
  const buildEl = span({ ...BASE, font: `500 10.5px/1.2 ${FONT}`, "letter-spacing": ".02em", color: "rgba(255,255,255,.5)" }, "");
  const dot = span({
    ...BASE, display: "inline-block", width: "5px", height: "5px", "border-radius": "50%", background: "#ffffff",
    "box-shadow": "0 0 6px 1px rgba(255,255,255,.7)", "margin-left": "4px", "flex": "0 0 auto",
  });
  const statusEl = div({
    ...BASE, font: `500 13px/1.3 ${FONT}`, "letter-spacing": ".005em", color: "#f4f4f4",
    "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis", "max-width": "100%",
  });
  statusEl.textContent = S.status;
  line1.appendChild(brand);
  line1.appendChild(buildEl);
  line1.appendChild(dot);
  col.appendChild(line1);
  col.appendChild(statusEl);
  pill.appendChild(sheen);
  pill.appendChild(streak);
  pill.appendChild(logoSvg);
  pill.appendChild(col);

  layer.appendChild(ring);
  layer.appendChild(pill);
  layer.appendChild(cursor);

  const renderBuild = () => {
    buildEl.textContent = S.build === null || S.build === undefined || S.build === "" ? "" : `· build ${S.build}`;
  };
  renderBuild();

  let pulse = null;
  const startPulse = () => {
    try {
      if (pulse) pulse.cancel();
      pulse = dot.animate([{ opacity: 0.3 }, { opacity: 1 }, { opacity: 0.3 }], { duration: 1800, iterations: Infinity, easing: "ease-in-out" });
    } catch (e) {}
  };

  /* ----------------------------------------------------------------- rules */

  const blockedUrl = () => {
    try {
      const h = String(location.hostname || "").toLowerCase();
      if (h === "accounts.google.com" || h === "appleid.apple.com") return true;
      return String(location.href || "").toLowerCase().includes("/login");
    } catch (e) { return false; }
  };
  const htmlDoc = () => {
    const ct = String(document.contentType || "text/html").toLowerCase();
    return ct.includes("html") && document.documentElement instanceof HTMLElement;
  };

  /* ----------------------------------------------------------- positioning */

  const place = () => {
    if (S.x === null) return;
    cursor.style.setProperty("transform", `translate3d(${S.x - TIP.x}px, ${S.y - TIP.y}px, 0)`);
    const vw = window.innerWidth || 0, vh = window.innerHeight || 0;
    const cw = chip.offsetWidth || 80;
    chip.style.setProperty("left", S.x + 22 + cw > vw - 4 ? `${-cw - 6}px` : "20px");
    chip.style.setProperty("top", S.y + 46 > vh - 4 ? "-22px" : "25px");
    dodge();
  };

  // The pill steps aside (fades) when the cursor goes to work underneath it.
  const dodge = () => {
    if (S.x === null || !host.isConnected) return;
    const r = S.pillRect || (S.pillRect = pill.getBoundingClientRect());
    const m = 28;
    const near = S.x > r.left - m && S.x < r.right + m && S.y > r.top - m && S.y < r.bottom + m;
    if (near !== S.dodging) {
      S.dodging = near;
      pill.style.setProperty("opacity", near ? "0.16" : "1");
    }
  };

  const setPos = (x, y) => {
    if (typeof x !== "number" || typeof y !== "number" || !isFinite(x) || !isFinite(y)) return;
    S.x = x; S.y = y;
    place();
    if (!S.seen) { S.seen = true; cursor.style.setProperty("opacity", "1"); }
  };

  const ripple = (x, y) => {
    if (!host.isConnected || typeof x !== "number" || typeof y !== "number") return;
    const now = Date.now();
    if (now - S.lastRipple < 60) return; // pointerdown and mousedown are the same press
    S.lastRipple = now;
    const d = div({
      ...BASE, position: "fixed", left: `${x - 18}px`, top: `${y - 18}px`, width: "36px", height: "36px",
      "border-radius": "50%", border: "1.5px solid rgba(255,255,255,.96)",
      background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0) 50%, rgba(255,255,255,.2) 78%, rgba(255,255,255,.05) 100%)",
      "box-shadow": "0 0 0 1px rgba(0,0,0,.26), inset 0 0 0 1px rgba(0,0,0,.14), 0 0 16px 2px rgba(255,255,255,.38), 0 4px 14px rgba(0,0,0,.2)",
      "backdrop-filter": "blur(1.2px) brightness(1.08)", "-webkit-backdrop-filter": "blur(1.2px) brightness(1.08)",
      opacity: "0",
    });
    d.setAttribute("data-uc", "ripple");
    layer.insertBefore(d, cursor);
    const done = () => { try { d.remove(); } catch (e) {} };
    try {
      const a = d.animate(
        [
          { transform: "scale(.3)", opacity: 1 },
          { transform: "scale(1)", opacity: 0.95, offset: 0.42 },
          { transform: "scale(1.6)", opacity: 0 },
        ],
        { duration: 640, easing: "cubic-bezier(.2,.7,.2,1)" },
      );
      a.onfinish = done;
      a.oncancel = done;
    } catch (e) { setTimeout(done, 640); }
    setTimeout(done, 2000);
    try {
      arrowSvg.animate([{ transform: "scale(1)" }, { transform: "scale(.84)" }, { transform: "scale(1)" }], { duration: 260, easing: "cubic-bezier(.3,.7,.3,1)" });
    } catch (e) {}
  };

  /* ------------------------------------------------------------- highlight */

  const ringBox = () => {
    if (S.hlEl) {
      const el = S.hlEl;
      if (!el.isConnected) return null;
      const q = el.getBoundingClientRect();
      if (q.width <= 0 && q.height <= 0) return null;
      return { x: q.left, y: q.top, w: q.width, h: q.height };
    }
    if (S.hlRect) {
      const r = S.hlRect;
      return { x: r.x - (window.scrollX - S.hlScroll.x), y: r.y - (window.scrollY - S.hlScroll.y), w: r.w, h: r.h };
    }
    return null;
  };

  const radiusOf = () => {
    if (!S.hlEl) return 10;
    try {
      const v = parseFloat(getComputedStyle(S.hlEl).borderTopLeftRadius) || 0;
      return Math.max(6, Math.min(22, v + 5));
    } catch (e) { return 10; }
  };

  const placeRing = (glide) => {
    if (!S.ringOn) return;
    const b = ringBox();
    if (!b) { ring.style.setProperty("opacity", "0"); return; }
    const pad = 5;
    const vw = window.innerWidth || 0, vh = window.innerHeight || 0;
    // Keep the ring on screen even for a panel taller than the window.
    const x0 = Math.max(3, b.x - pad), y0 = Math.max(3, b.y - pad);
    const x1 = Math.min(vw - 3, b.x + b.w + pad), y1 = Math.min(vh - 3, b.y + b.h + pad);
    if (x1 - x0 < 4 || y1 - y0 < 4) { ring.style.setProperty("opacity", "0"); return; }
    ring.style.setProperty("transition", glide ? RING_GLIDE : "opacity .2s ease");
    css(ring, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px`, opacity: "1" });
  };

  let ringRaf = 0;
  const ringSoon = () => {
    if (!S.ringOn || ringRaf) return;
    ringRaf = requestAnimationFrame(() => { ringRaf = 0; placeRing(false); });
  };

  const highlight = (arg) => {
    const wasOn = S.ringOn && ring.style.getPropertyValue("opacity") === "1";
    S.hlEl = null; S.hlRect = null;
    if (arg && typeof arg === "object" && typeof arg.getBoundingClientRect === "function") {
      S.hlEl = arg;
    } else if (arg && typeof arg === "object" && typeof arg.x === "number" && typeof arg.y === "number") {
      const w = Number(arg.w !== undefined ? arg.w : arg.width) || 0;
      const h = Number(arg.h !== undefined ? arg.h : arg.height) || 0;
      S.hlRect = { x: arg.x, y: arg.y, w, h };
      S.hlScroll = { x: window.scrollX, y: window.scrollY };
    } else {
      S.ringOn = false;
      ring.style.setProperty("opacity", "0");
      return false;
    }
    S.ringOn = true;
    ring.style.setProperty("border-radius", `${radiusOf()}px`);
    placeRing(wasOn);
    return true;
  };

  /* ---------------------------------------------------------------- status */

  const status = (text) => {
    const t = text === null || text === undefined ? "" : String(text).replace(/\s+/g, " ").trim();
    if (t === S.status && statusEl.textContent === t) return true;
    S.status = t;
    statusEl.textContent = t;
    S.pillRect = null;
    if (host.isConnected) {
      try { statusEl.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" }); } catch (e) {}
    }
    requestAnimationFrame(() => { S.pillRect = null; dodge(); });
    return true;
  };

  /* ----------------------------------------------------------------- mount */

  // The top layer keeps the overlay above the page's own modal <dialog>s and
  // popovers, which no z-index can beat. One page rule could make that visible:
  // a global ::backdrop style would paint our backdrop over the whole page. If
  // that happens, leave the top layer for this document and stay a plain
  // fixed element at the highest z-index.
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
      if (S.topLayer && backdropPainted()) {
        S.noTop = true;
        host.hidePopover();
        S.topLayer = false;
      }
    } catch (e) { S.topLayer = false; }
  };

  // Anything the page puts in the top layer after us (a modal <dialog>, a
  // popover, a fullscreen element) sits above us. Step back on top of it.
  const others = () => {
    let list = [];
    try { list = Array.from(document.querySelectorAll(":modal, :popover-open")); }
    catch (e) { try { list = Array.from(document.querySelectorAll("dialog[open]")); } catch (e2) { list = []; } }
    try { if (document.fullscreenElement) list.push(document.fullscreenElement); } catch (e) {}
    return list.filter((el) => el !== host);
  };
  const raise = () => {
    if (!S.topLayer || !host.isConnected) return;
    if (backdropPainted()) { // a page rule that arrived after we were shown
      S.noTop = true; S.topLayer = false;
      try { host.hidePopover(); } catch (e) {}
      return;
    }
    const now = others();
    const fresh = now.some((el) => S.above.indexOf(el) < 0);
    S.above = now;
    if (!fresh) return;
    try { host.hidePopover(); host.showPopover(); S.topLayer = isOpen(); } catch (e) {}
  };

  const unmount = () => {
    if (host.isConnected) { try { host.remove(); } catch (e) {} }
  };

  const mount = () => {
    if (S.destroyed) return false;
    if (blockedUrl() || !htmlDoc()) { unmount(); return false; }
    const root = document.documentElement;
    if (!root) return false;
    if (document.readyState === "loading" && !S.mountedOnce) return false; // waits for DOMContentLoaded
    if (host.parentNode !== root) {
      try { root.appendChild(host); } catch (e) { return false; }
      S.attaches++;
      S.pillRect = null;
      S.above = [];
      observe();
      listen();
      if (!S.mountedOnce) {
        S.mountedOnce = true;
        try { pill.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }); } catch (e) {}
      }
      startPulse();
    }
    showTop();
    raise();
    place();
    if (S.ringOn) placeRing(false);
    return true;
  };

  // Someone removed us (a framework re-rendered the whole document). Put the
  // overlay back, but never fight a page in a tight loop: at most 25 times in
  // five seconds from here, the half-second tick covers the rest.
  const reattachSoon = () => {
    const now = Date.now();
    S.recent = S.recent.filter((t) => now - t < 5000);
    if (S.recent.length >= 25) return;
    S.recent.push(now);
    setTimeout(mount, 0);
  };

  let mo = null;
  let watched = null;
  const observe = () => {
    try {
      const root = document.documentElement;
      if (mo && watched === root) return;
      if (!mo) {
        mo = new MutationObserver(() => {
          if (S.destroyed) return;
          if (watched !== document.documentElement) observe();
          if (!host.isConnected && !blockedUrl()) reattachSoon();
        });
      }
      mo.disconnect();
      mo.observe(document, { childList: true });
      if (root) mo.observe(root, { childList: true });
      watched = root;
    } catch (e) {}
  };

  const tick = () => {
    if (S.destroyed) return;
    if (location.href !== S.href) { S.href = location.href; S.pillRect = null; }
    if (blockedUrl()) { unmount(); return; }
    if (!host.isConnected) mount();
    else if (!S.noTop && typeof host.showPopover === "function" && !isOpen()) showTop();
    else raise();
    if (S.ringOn) placeRing(false);
  };

  /* ---------------------------------------------------------------- events */

  // Every listener is (re)added on each attach: document.open() erases the
  // listeners of the window and the document, and addEventListener ignores a
  // listener that is already there, so re-adding is free.
  const L = [];
  const OPTS = { capture: true, passive: true };
  const on = (target, type, fn) => { L.push([target, type, fn]); };
  const listen = () => { for (const [t, type, fn] of L) { try { t.addEventListener(type, fn, OPTS); } catch (e) {} } };
  // pointermove carries the exact (fractional) position; the mousemove that
  // follows it carries the same point rounded, so it is only used when no
  // pointer event came first.
  const fromPointer = (e) => {
    if (!e || e.isTrusted === false) return;
    S.lastPointer = performance.now();
    setPos(e.clientX, e.clientY);
  };
  const fromMouse = (e) => {
    if (!e || e.isTrusted === false || performance.now() - S.lastPointer < 100) return;
    setPos(e.clientX, e.clientY);
  };
  on(window, "pointermove", fromPointer);
  on(window, "mousemove", fromMouse);
  const press = (e) => {
    if (!e || e.isTrusted === false) return;
    if (e.type === "pointerdown") S.lastPointer = performance.now();
    else if (performance.now() - S.lastPointer < 100) return;
    setPos(e.clientX, e.clientY);
    ripple(e.clientX, e.clientY);
  };
  on(window, "pointerdown", press);
  on(window, "mousedown", press);
  on(window, "scroll", ringSoon);
  on(window, "resize", () => { S.pillRect = null; place(); ringSoon(); });
  on(window, "popstate", () => setTimeout(tick, 0));
  on(window, "hashchange", () => setTimeout(tick, 0));
  on(window, "toggle", () => setTimeout(raise, 0));
  on(window, "fullscreenchange", () => setTimeout(raise, 0));
  on(document, "DOMContentLoaded", () => mount());
  listen();
  const timer = setInterval(tick, 500);

  /* ------------------------------------------------------------------- api */

  const r4 = (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  };
  const brief = () => ({ ok: true, v: V, mounted: host.isConnected, blocked: blockedUrl() });

  const api = {
    v: V,
    status,
    highlight,
    build(n) { S.build = n === undefined ? null : n; renderBuild(); S.pillRect = null; return true; },
    move(x, y) { setPos(Number(x), Number(y)); return true; },
    ripple(x, y) { ripple(Number(x), Number(y)); return true; },
    ensure() { observe(); return mount(); },
    brief,
    state() {
      const live = host.isConnected;
      const a = live ? r4(arrowSvg) : null;
      let ringOpacity = 0;
      try { ringOpacity = live ? parseFloat(getComputedStyle(ring).opacity) : 0; } catch (e) {}
      let pillOpacity = 0;
      try { pillOpacity = live ? parseFloat(getComputedStyle(pill).opacity) : 0; } catch (e) {}
      return {
        v: V, build: S.build, status: statusEl.textContent, buildText: buildEl.textContent,
        mounted: live, blocked: blockedUrl(), topLayer: live && S.topLayer, noTop: S.noTop,
        x: S.x, y: S.y, seen: S.seen,
        tip: a ? { x: a.x + TIP.x, y: a.y + TIP.y } : null,
        cursor: a, cursorOpacity: live ? parseFloat(getComputedStyle(cursor).opacity) : 0,
        chip: live ? r4(chip) : null,
        pill: live ? r4(pill) : null, pillOpacity,
        ring: { on: S.ringOn, opacity: ringOpacity, ...(live ? r4(ring) : {}) },
        ripples: layer.querySelectorAll('[data-uc="ripple"]').length,
        attaches: S.attaches,
      };
    },
    destroy() {
      S.destroyed = true;
      clearInterval(timer);
      try { if (mo) mo.disconnect(); } catch (e) {}
      for (const [t, type, fn] of L) { try { t.removeEventListener(type, fn, OPTS); } catch (e) {} }
      unmount();
      if (window.__uc === api) { try { delete window.__uc; } catch (e) { window.__uc = undefined; } }
    },
  };
  window.__uc = api;

  S.href = location.href;
  observe();
  mount();
  return brief();
})()
