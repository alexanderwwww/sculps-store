// The accessibility tree from GET /source?format=json, made small.
// Keys used: type, label, name, value, rect{x,y,width,height}, children, isVisible, isEnabled
// (WebDriverAgentLib/Categories/XCUIApplication+FBHelpers.m:239-245,276 and
//  Categories/XCUIElement+FBWebDriverAttributes.m:287-290 in the pinned commit).
// isVisible / isEnabled arrive as the strings "1" and "0": the attribute blocks return
// [@(BOOL) stringValue] (XCUIApplication+FBHelpers.m:302-307) and the keys get the "is"
// prefix (:57-62, :259-266). Whether a wallet built with React Native sets them truthfully
// is unread until M4.
// Rects are in points.
import { createHash } from 'node:crypto';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
// WDA always sends both keys for /source?format=json; a tree without them reads as shown.
const yes = (v) => !(v === false || v === 0 || v === '0' || v === 'false');

// Every element with text and a real rect, hidden ones included (each says "visible").
// "box" is the rect of the nearest Button around the element (its own rect when there is
// none): a button whose word sits in a child text is protected as a whole (guard.mjs).
export function flatten(root) {
  const out = [];
  const walk = (n, around) => {
    if (!n || typeof n !== 'object') return;
    const r = n.rect || {};
    const rect = { x: num(r.x), y: num(r.y), w: num(r.width), h: num(r.height) };
    const label = typeof n.label === 'string' && n.label !== '' ? n.label : (typeof n.name === 'string' ? n.name : '');
    const value = n.value === null || n.value === undefined ? '' : String(n.value);
    const usable = rect.x !== null && rect.y !== null && rect.w > 0 && rect.h > 0;
    const box = usable && n.type === 'Button' ? rect : around;
    if (usable && (label.trim() !== '' || value.trim() !== '')) {
      out.push({ type: typeof n.type === 'string' ? n.type : 'Other', label, value, rect, box: box || rect, visible: yes(n.isVisible), enabled: yes(n.isEnabled) });
    }
    if (Array.isArray(n.children)) n.children.forEach((c) => walk(c, box));
  };
  walk(root, null);
  return out;
}

// What is really on the screen. Labels are tapped, and the confirm screen is read, from
// these only; the guard looks at everything.
export const shown = (elements) => elements.filter((e) => e.visible);

export function line(el) {
  const v = el.value !== '' && el.value !== el.label ? ` =${JSON.stringify(el.value)}` : '';
  return `${el.type} ${JSON.stringify(el.label)}${v} @${el.rect.x},${el.rect.y},${el.rect.w},${el.rect.h}${el.enabled ? '' : ' (off)'}`;
}

export const lines = (elements) => shown(elements).map(line);

// Changes when anything readable on the screen changes: text, values or positions.
export function fingerprint(elements) {
  return createHash('sha256').update(lines(elements).join('\n')).digest('hex').slice(0, 16);
}

export function findByLabel(elements, label) {
  const want = String(label).trim();
  return shown(elements).filter((e) => e.label.trim() === want);
}

// Keeps a tree small enough to send: at most maxLines lines and maxBytes bytes, and a last
// line that says how many were left out.
export function capLines(all, maxLines, maxBytes) {
  const kept = [];
  let bytes = 0;
  for (const l of all) {
    const size = Buffer.byteLength(l, 'utf8') + 4;
    if (kept.length >= maxLines || bytes + size > maxBytes) break;
    kept.push(l);
    bytes += size;
  }
  if (kept.length < all.length) kept.push(`... ${all.length - kept.length} more lines not shown`);
  return kept;
}

export const centre = (rect) => ({ x: Math.round(rect.x + rect.w / 2), y: Math.round(rect.y + rect.h / 2) });
