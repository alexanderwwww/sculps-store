// The accessibility tree from GET /source?format=json, made small.
// Keys used: type, label, name, value, rect{x,y,width,height}, children
// (WebDriverAgentLib/Categories/XCUIApplication+FBHelpers.m:239-245,276 and
//  Categories/XCUIElement+FBWebDriverAttributes.m:287-290 in the pinned commit).
// Rects are in points.
import { createHash } from 'node:crypto';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

export function flatten(root) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const r = n.rect || {};
    const rect = { x: num(r.x), y: num(r.y), w: num(r.width), h: num(r.height) };
    const label = typeof n.label === 'string' && n.label !== '' ? n.label : (typeof n.name === 'string' ? n.name : '');
    const value = n.value === null || n.value === undefined ? '' : String(n.value);
    const usable = rect.x !== null && rect.y !== null && rect.w > 0 && rect.h > 0;
    if (usable && (label.trim() !== '' || value.trim() !== '')) {
      out.push({ type: typeof n.type === 'string' ? n.type : 'Other', label, value, rect });
    }
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(root);
  return out;
}

export function line(el) {
  const v = el.value !== '' && el.value !== el.label ? ` =${JSON.stringify(el.value)}` : '';
  return `${el.type} ${JSON.stringify(el.label)}${v} @${el.rect.x},${el.rect.y},${el.rect.w},${el.rect.h}`;
}

export const lines = (elements) => elements.map(line);

// Changes when anything readable on the screen changes: text, values or positions.
export function fingerprint(elements) {
  return createHash('sha256').update(lines(elements).join('\n')).digest('hex').slice(0, 16);
}

export function findByLabel(elements, label) {
  const want = String(label).trim();
  return elements.filter((e) => e.label.trim() === want);
}

export const centre = (rect) => ({ x: Math.round(rect.x + rect.w / 2), y: Math.round(rect.y + rect.h / 2) });
