/*
 * ultracursor — the node side of the overlay, and the human hands.
 *
 *   attach(context, page, build)   inject overlay.js into every page of the
 *                                  context (once) and into the page open now
 *   say(page, text)                the status pill's line
 *   hover(page, target)            glide the real mouse there along a slightly
 *                                  curved path, 18-30 moves, land on a random
 *                                  point inside the element, ring it
 *   click(page, target)            hover, then a real press and release
 *   scroll(page, px[, over])       mouse wheel in 80-140px steps, small pauses
 *   pause(minMs, maxMs)            a human pause (default 0.6-2.5 s)
 *   highlight(page, target|null)   ring an element / a rect, or clear it
 *   state(page)                    what the overlay measures (tests, diagnostics)
 *
 * target = a Playwright ElementHandle, a Locator, or {x, y} (viewport px;
 * {x, y, w, h} is a rect: the mouse lands inside it and it is ringed).
 *
 * Every move goes through page.mouse, so the page receives real, trusted
 * mousemove / mousedown events, and the overlay cursor follows those events.
 * The overlay is never moved by itself: what Alex sees is where the mouse is.
 *
 * Nothing here throws. A closed page, a navigation in the middle of a call or
 * an element that vanished answers null / false, and the caller carries on.
 */
import { readFileSync } from "node:fs";

const OVERLAY = readFileSync(new URL("./overlay.js", import.meta.url), "utf8");

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// A soft bell around 0, roughly -1..1: where a hand lands inside a target.
const bell = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;

/** Contexts that already carry the init script (addInitScript cannot be undone). */
const REGISTERED = new WeakSet();
/** Pages whose navigations re-apply the last status line and cursor position. */
const HOOKED = new WeakSet();
/** Where this module last put the mouse, per page. */
const POS = new WeakMap();
/** The last status line said on each page, put back after every navigation. */
const SAID = new WeakMap();
/** The build number each page shows. */
const BUILD = new WeakMap();

const alive = (page) => {
  try { return Boolean(page) && !page.isClosed(); } catch { return false; }
};

async function safe(fn, fallback) {
  try { return await fn(); } catch { return fallback; }
}

function initSource(build) {
  const b = build === undefined || build === null || build === "" ? null : String(build);
  return `window.__ucBuild = ${JSON.stringify(b)};\n${OVERLAY}`;
}

/** Evaluate overlay.js on the page as it is now. Answers what the overlay says. */
async function inject(page, build) {
  if (!alive(page)) return null;
  return safe(() => page.evaluate(initSource(build)), null);
}

async function restore(page) {
  if (!alive(page)) return;
  const pos = POS.get(page) || null;
  const text = SAID.has(page) ? SAID.get(page) : null;
  const build = BUILD.has(page) ? BUILD.get(page) : null;
  await safe(() => page.evaluate(([p, t, b]) => {
    const uc = window.__uc;
    if (!uc) return false;
    if (b !== null) uc.build(b);
    if (t !== null) uc.status(t);
    if (p) uc.move(p.x, p.y);
    return true;
  }, [pos, text, build]), false);
}

function hook(page) {
  if (HOOKED.has(page)) return;
  HOOKED.add(page);
  // A navigation builds a new document and a fresh overlay that knows neither
  // the status line nor where the mouse is. Hand both back as soon as it exists.
  try { page.on("domcontentloaded", () => { restore(page).catch(() => {}); }); } catch {}
}

/**
 * Inject the overlay: as an init script on the context (every page, every
 * navigation, before the page's own scripts) and evaluated on `page` now.
 * Returns {mounted, blocked}: mounted false on a sign-in page (by design) or
 * when the page could not be reached.
 */
export async function attach(context, page, build) {
  let c = context || null;
  if (!c && alive(page)) { try { c = page.context(); } catch { c = null; } }
  const b = build === undefined || build === null || build === "" ? null : String(build);
  if (c && !REGISTERED.has(c)) {
    REGISTERED.add(c);
    await safe(() => c.addInitScript({ content: initSource(b) }), null);
  }
  if (!alive(page)) return { mounted: false, blocked: false };
  BUILD.set(page, b);
  hook(page);
  const r = await inject(page, b);
  if (r && r.ok) await restore(page);
  return { mounted: Boolean(r && r.mounted), blocked: Boolean(r && r.blocked) };
}

/** The status pill's one line. Remembered, and put back after a navigation. */
export async function say(page, text) {
  const t = text === null || text === undefined ? "" : String(text);
  if (!alive(page)) return false;
  SAID.set(page, t);
  let ok = await safe(() => page.evaluate((s) => (window.__uc ? window.__uc.status(s) : null), t), false);
  if (ok === null) {
    // The page has no overlay (opened before attach, or it was torn down).
    const r = await inject(page, BUILD.has(page) ? BUILD.get(page) : null);
    if (r && r.ok) ok = await safe(() => page.evaluate((s) => (window.__uc ? window.__uc.status(s) : false), t), false);
  }
  return ok === true;
}

/** Overlay measurements: cursor tip, ring, pill, ripples, status, build. */
export async function state(page) {
  if (!alive(page)) return null;
  return safe(() => page.evaluate(() => (window.__uc ? window.__uc.state() : null)), null);
}

async function viewport(page) {
  const v = await safe(() => page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight })), null);
  if (v && v.w > 0 && v.h > 0) return v;
  let vs = null;
  try { vs = page.viewportSize(); } catch { vs = null; }
  return vs && vs.width ? { w: vs.width, h: vs.height } : { w: 1280, h: 800 };
}

const isPoint = (t) => t && typeof t === "object" && typeof t.boundingBox !== "function"
  && typeof t.x === "number" && typeof t.y === "number" && isFinite(t.x) && isFinite(t.y);
const isRect = (t) => isPoint(t) && (Number(t.w ?? t.width) > 0 || Number(t.h ?? t.height) > 0);
const isLocator = (t) => t && typeof t.boundingBox === "function" && typeof t.asElement !== "function";
// A Locator that matches several elements would throw (strict mode); the hand
// goes to the first one, which is what a reader pointing at a list means.
const one = (t) => (isLocator(t) && typeof t.first === "function" ? t.first() : t);

async function boxOf(target) {
  if (!target) return null;
  if (isPoint(target)) {
    const w = Number(target.w ?? target.width) || 0, h = Number(target.h ?? target.height) || 0;
    return { x: target.x, y: target.y, width: w, height: h };
  }
  if (typeof target.boundingBox !== "function") return null;
  const b = await safe(() => (isLocator(target) ? target.boundingBox({ timeout: 4000 }) : target.boundingBox()), null);
  return b && b.width >= 0 && b.height >= 0 ? b : null;
}

/** Ring an element (follows it while the page scrolls), a rect, or clear it. */
export async function highlight(page, target) {
  if (!alive(page)) return false;
  if (!target) return safe(() => page.evaluate(() => (window.__uc ? window.__uc.highlight(null) : false)), false);
  target = one(target);
  if (!isPoint(target) && typeof target.evaluate === "function") {
    // Ring the element itself when it lives in the top document: the ring then
    // stays on it while the page scrolls. In a subframe the overlay is absent
    // (top document only), so fall back to the rect in viewport coordinates.
    const fn = (el) => (window.top === window && window.__uc ? window.__uc.highlight(el) === true : false);
    const done = await safe(() => (isLocator(target) ? target.evaluate(fn, undefined, { timeout: 4000 }) : target.evaluate(fn)), false);
    if (done === true) return true;
  }
  const b = await boxOf(target);
  if (!b || (b.width <= 0 && b.height <= 0)) return false;
  return safe(() => page.evaluate((r) => (window.__uc ? window.__uc.highlight(r) : false), { x: b.x, y: b.y, w: b.width, h: b.height }), false);
}

// Minimum-jerk timing: slow out, quick middle, slow in, the way a hand moves.
const ease = (t) => t * t * t * (10 + t * (-15 + 6 * t));

/** The human path from wherever the mouse is to (x, y). */
async function glide(page, x, y, onNear) {
  const vp = await viewport(page);
  const tx = clamp(x, 1, vp.w - 2), ty = clamp(y, 1, vp.h - 2);
  let from = POS.get(page);
  if (!from) {
    // First move on this page: the hand comes in from the lower middle.
    from = { x: vp.w * rand(0.42, 0.62), y: vp.h * rand(0.55, 0.75) };
    await page.mouse.move(from.x, from.y);
    POS.set(page, from);
  }
  const dx = tx - from.x, dy = ty - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 3) {
    await page.mouse.move(tx, ty);
    POS.set(page, { x: tx, y: ty });
    if (onNear) await onNear();
    return { x: tx, y: ty };
  }
  const steps = clamp(Math.round(18 + Math.min(10, dist / 70) + rand(-1.5, 1.5)), 18, 30);
  // One control point, pushed sideways off the straight line: a slight arc.
  const nx = -dy / dist, ny = dx / dist;
  const bow = (Math.random() < 0.5 ? -1 : 1) * dist * rand(0.05, 0.14);
  const k = rand(0.35, 0.6);
  const cx = from.x + dx * k + nx * bow, cy = from.y + dy * k + ny * bow;
  const total = clamp(240 + dist * 0.5, 280, 950) * rand(0.85, 1.15);
  const near = Math.round(steps * 0.7);
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps), u = 1 - t;
    let px = u * u * from.x + 2 * u * t * cx + t * t * tx;
    let py = u * u * from.y + 2 * u * t * cy + t * t * ty;
    if (i < steps) { px += rand(-0.6, 0.6); py += rand(-0.6, 0.6); }
    px = clamp(px, 1, vp.w - 2); py = clamp(py, 1, vp.h - 2);
    await page.mouse.move(px, py);
    POS.set(page, { x: px, y: py });
    if (i === near && onNear) await onNear();
    if (i < steps) await sleep(total / steps);
  }
  return { x: tx, y: ty };
}

/** Bring an element into the window the way a person does: with the wheel. */
async function intoView(page, target) {
  let b = await boxOf(target);
  if (!b) return null;
  if (isPoint(target)) return b;
  for (let tries = 0; tries < 4; tries++) {
    const vp = await viewport(page);
    const cy = b.y + b.height / 2;
    const inY = b.y >= 0 && b.y + Math.min(b.height, vp.h * 0.8) <= vp.h;
    const inX = b.x + b.width > 0 && b.x < vp.w;
    if (inY && inX) return b;
    if (inY) break;
    const want = cy - vp.h * rand(0.38, 0.5);
    await scroll(page, clamp(want, -vp.h * 2.5, vp.h * 2.5));
    const nb = await boxOf(target);
    if (!nb) return null;
    const moved = Math.abs(nb.y - b.y) > 2;
    b = nb;
    if (!moved) break; // the wheel does not move this one (inner scroller, fixed page)
  }
  await safe(() => (isLocator(target) ? target.scrollIntoViewIfNeeded({ timeout: 4000 }) : target.scrollIntoViewIfNeeded()), null);
  await sleep(rand(120, 260));
  return boxOf(target);
}

/**
 * Move the real mouse to the target along a human path and ring it.
 * Returns the point the mouse landed on, or null when there was nothing to hover.
 */
export async function hover(page, target) {
  if (!alive(page) || !target) return null;
  target = one(target);
  try {
    const b = await intoView(page, target);
    if (!b) return null;
    const vp = await viewport(page);
    let x = b.x, y = b.y;
    if (b.width > 0 || b.height > 0) {
      // Somewhere inside, never on the edge: a soft spread around the middle.
      const fx = b.width >= 10 ? clamp(0.5 + bell() * 0.2, 0.25, 0.75) : 0.5;
      const fy = b.height >= 10 ? clamp(0.5 + bell() * 0.18, 0.28, 0.72) : 0.5;
      // Only the part of the element that is on screen can be pointed at.
      const x0 = Math.max(b.x, 2), x1 = Math.min(b.x + b.width, vp.w - 3);
      const y0 = Math.max(b.y, 2), y1 = Math.min(b.y + b.height, vp.h - 3);
      x = x1 > x0 ? x0 + (x1 - x0) * fx : b.x + b.width / 2;
      y = y1 > y0 ? y0 + (y1 - y0) * fy : b.y + b.height / 2;
    }
    const ring = isPoint(target) && !isRect(target) ? null : () => highlight(page, target);
    return await glide(page, x, y, ring);
  } catch {
    return null;
  }
}

/** Hover, then a real press and release where the mouse landed. */
export async function click(page, target) {
  const at = await hover(page, target);
  if (!at || !alive(page)) return false;
  try {
    await sleep(rand(90, 240));
    await page.mouse.down();
    await sleep(rand(45, 120));
    await page.mouse.up();
    return true;
  } catch {
    return false;
  }
}

/**
 * Scroll with the mouse wheel: 80-140px a notch, small pauses, now and then a
 * longer one. Negative px scrolls up. `over` (optional target) is hovered first,
 * so an inner panel (a comments list) scrolls instead of the page.
 * Returns the wheel distance sent (not how far the page actually moved).
 */
export async function scroll(page, px, over) {
  const want = Number(px) || 0;
  if (!alive(page) || want === 0) return 0;
  try {
    if (over) await hover(page, over);
    else if (!POS.get(page)) {
      const vp = await viewport(page);
      await glide(page, vp.w * rand(0.4, 0.6), vp.h * rand(0.4, 0.6));
    }
    const dir = want < 0 ? -1 : 1;
    let left = Math.abs(want), sent = 0, n = 0;
    while (left > 0.5) {
      const step = Math.min(left, randInt(80, 140));
      await page.mouse.wheel(0, dir * step);
      sent += step; left -= step; n++;
      await sleep(n % randInt(4, 7) === 0 ? rand(180, 420) : rand(35, 110));
    }
    await sleep(rand(120, 260)); // let smooth scrolling settle before anyone measures
    return dir * sent;
  } catch {
    return 0;
  }
}

/** A human pause, by default 0.6-2.5 s. */
export function pause(minMs = 600, maxMs = 2500) {
  const a = Number(minMs) || 0, b = Number(maxMs);
  return sleep(rand(a, isFinite(b) && b > a ? b : a));
}

export default { attach, say, hover, click, scroll, pause, highlight, state };
