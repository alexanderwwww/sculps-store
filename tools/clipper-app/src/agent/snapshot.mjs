/*
 * How the agent sees a page: Playwright's own accessibility snapshot.
 *
 *   observe(page, {max, full}) -> {url, title, text, refs}
 *   compact(yaml, max)         -> the snapshot cut down to fit `max` characters
 *   findLines(yaml, query, n)  -> the lines that mention `query`
 *   refsIn(yaml)               -> Map(ref -> {role, name}) for every [ref=…] line
 *
 * page.ariaSnapshot({mode: "ai"}) is public API in playwright-core 1.63: a YAML
 * tree of roles and accessible names, each element tagged [ref=e12] (frames
 * f1e3), and page.locator("aria-ref=e12") finds that element again. It is what
 * a screen reader hears, so it works on any site without one selector, and it
 * cannot see ultracursor's own overlay or panel (closed shadow roots).
 *
 * Real pages are long. compact() keeps what the agent acts on (buttons, links,
 * fields, options, headings, dialogs) and drops layout noise first, then plain
 * text, then shortens lines, and says how much it left out so the agent knows
 * to `find` or `read_text` instead of guessing.
 */

const INTERACTIVE = new Set([
  "button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio", "option",
  "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "switch", "slider", "spinbutton",
  "listbox", "dialog", "alertdialog", "alert", "heading", "img", "status",
]);
const LINE = /^(\s*)-\s+([a-z]+)(?:\s+"((?:[^"\\]|\\.)*)")?(.*)$/;

/** Parse one snapshot line: indent, role, name, the rest. Null for non-element lines. */
export function parseLine(line) {
  const m = LINE.exec(line);
  if (!m) return null;
  const ref = /\[ref=([a-z0-9]+)\]/.exec(m[4] || "");
  return { indent: m[1].length, role: m[2], name: m[3] === undefined ? "" : m[3].replace(/\\"/g, '"'), ref: ref ? ref[1] : null, rest: m[4] || "" };
}

export function refsIn(yaml) {
  const map = new Map();
  for (const line of String(yaml || "").split("\n")) {
    const p = parseLine(line);
    if (p && p.ref) map.set(p.ref, { role: p.role, name: p.name });
  }
  return map;
}

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function compact(yaml, max = 9000) {
  const raw = String(yaml || "").split("\n").map((l) => cut(l.replace(/\s+$/, ""), 220));
  // /url lines say where a link goes: worth keeping, but short.
  let lines = raw.map((l) => (/^\s*-\s+\/url:/.test(l) ? cut(l, 120) : l));
  const size = (ls) => ls.reduce((n, l) => n + l.length + 1, 0);
  const total = lines.length;
  if (size(lines) <= max) return { text: lines.join("\n"), hidden: 0 };

  // 1. Layout noise: nameless generic/group/list/listitem/none/presentation rows.
  lines = lines.filter((l) => {
    const p = parseLine(l);
    if (!p) return true;
    if (INTERACTIVE.has(p.role)) return true;
    const hasText = p.name || /:\s*\S/.test(p.rest);
    return hasText;
  });
  // 2. Plain text rows (paragraph / text / cell content) beyond the first 60.
  if (size(lines) > max) {
    let kept = 0;
    lines = lines.filter((l) => {
      const p = parseLine(l);
      const plain = !p || !INTERACTIVE.has(p.role);
      if (!plain) return true;
      kept++;
      return kept <= 60;
    });
  }
  // 3. Shorter lines.
  if (size(lines) > max) lines = lines.map((l) => cut(l, 110));
  // 4. Hard cut, interactive rows first.
  if (size(lines) > max) {
    const out = [];
    let n = 0;
    for (const l of lines) {
      const p = parseLine(l);
      if (p && INTERACTIVE.has(p.role) && n + l.length + 1 <= max - 200) { out.push(l); n += l.length + 1; }
    }
    lines = out;
  }
  const hidden = total - lines.length;
  return { text: lines.join("\n") + (hidden > 0 ? `\n(${hidden} more lines not shown: use find or read_text, or look with full:true)` : ""), hidden };
}

export function findLines(yaml, query, limit = 40) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];
  const out = [];
  for (const line of String(yaml || "").split("\n")) {
    if (line.toLowerCase().includes(q)) {
      out.push(cut(line.trim(), 220));
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function rawSnapshot(page) {
  for (let i = 0; i < 3; i++) {
    try { return await page.ariaSnapshot({ mode: "ai", timeout: 15000 }); }
    catch (e) {
      // A navigation in the middle of a snapshot: let the new page arrive and try again.
      await new Promise((r) => setTimeout(r, 600));
      try { await page.waitForLoadState("domcontentloaded", { timeout: 5000 }); } catch { /* keep trying */ }
      if (i === 2) throw e;
    }
  }
  return "";
}

/** The page as the agent sees it. `refs` covers the WHOLE snapshot, not only the shown part. */
export async function observe(page, { max = 9000, full = false } = {}) {
  let url = "", title = "";
  try { url = page.url(); } catch { /* closed */ }
  try { title = await page.title(); } catch { /* navigating */ }
  let yaml = "";
  try { yaml = await rawSnapshot(page); } catch (e) { yaml = `(the page could not be read: ${String(e && e.message || e).split("\n")[0]})`; }
  const shown = compact(yaml, full ? 40000 : max);
  return { url, title, text: shown.text, yaml, refs: refsIn(yaml), hidden: shown.hidden };
}

/** The block every tool result ends with (SPEC "Tool result text"). */
export function pageBlock(view) {
  return `url: ${view.url}\ntitle: ${view.title}\npage:\n${view.text}`;
}
