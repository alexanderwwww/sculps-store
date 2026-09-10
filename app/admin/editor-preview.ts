/**
 * The bridge between the theme editor and the storefront running inside its
 * preview iframe.
 *
 * Only `app/routes/admin.online-store.editor.$pageId.tsx` imports this.
 *
 * Why it exists here and not in the storefront: the storefront files are
 * owned elsewhere and must stay free of editor plumbing. The preview is
 * same-origin, so everything below is done from this side — the editor reads
 * the rendered page, works out which field drew which node, writes its own
 * `data-ed-*` marks onto those nodes, and injects a small listener into the
 * iframe that applies `{section, field, value}` patches in place.
 *
 * The marks are the editor's, written at runtime:
 *
 *   data-ed-section="<section id>"   the section the node belongs to
 *   data-ed-field="<field name>"     the field whose value drew it
 *   data-ed-block="<block id>"       present when the value came from a block
 *
 * They are inferred by matching the rendered text or `src` against the
 * section's own saved values. That inference is the only weak part of this,
 * and it is the part the storefront could remove — see the report.
 */

export const PATCH_TYPE = "kerberos-editor-patch";

export interface IndexField {
  name: string;
  /** image and video fields are matched and patched through `src` */
  media: boolean;
}

export interface IndexSection {
  id: string;
  type: string;
  values: Record<string, string>;
  blocks: { id: string; values: Record<string, string> }[];
  fields: IndexField[];
  blockFields: IndexField[];
}

export interface PreviewHit {
  sectionId: string;
  /** null when the click landed on a section but not on a known value */
  field: string | null;
  /** null for a section-level field */
  blockId: string | null;
}

export interface Patch {
  sectionId: string;
  field: string;
  blockId: string | null;
  value: string;
  media: boolean;
}

/* ------------------------------------------------------------- injection */

/**
 * The listener that lives inside the preview. It is injected as a script so
 * it runs in the iframe's own realm, which is what makes the patch a plain
 * postMessage rather than the editor reaching across and mutating the page.
 */
const BRIDGE = `(function(){
  if (window.__kerberosEditorBridge) return;
  window.__kerberosEditorBridge = 1;
  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    if (event.source !== window.parent) return;
    var patch = event.data;
    if (!patch || patch.type !== ${JSON.stringify(PATCH_TYPE)}) return;
    var selector =
      '[data-ed-section="' + CSS.escape(patch.sectionId) + '"]' +
      '[data-ed-field="' + CSS.escape(patch.field) + '"]' +
      (patch.blockId ? '[data-ed-block="' + CSS.escape(patch.blockId) + '"]' : ":not([data-ed-block])");
    var node = document.querySelector(selector);
    if (!node) return;
    if (patch.media) {
      if (node.getAttribute("src") !== patch.value) node.setAttribute("src", patch.value);
    } else if (node.textContent !== patch.value) {
      node.textContent = patch.value;
    }
  });
})();`;

/** The preview's own editing affordances: a hover hint on editable nodes. */
const STYLE = `
[data-ed-field] { cursor: text; }
[data-ed-field][data-ed-media] { cursor: pointer; }
[data-ed-field]:hover {
  outline: 2px solid rgba(0, 113, 227, 0.45);
  outline-offset: 2px;
  border-radius: 4px;
}
[data-section] {
  outline-style: solid;
  outline-width: 3px;
  outline-color: transparent;
  outline-offset: -3px;
  transition: outline-color 0.18s cubic-bezier(0.32, 0.72, 0, 1);
}
@media (prefers-reduced-motion: reduce) {
  [data-section] { transition-duration: 0.01ms; }
}
`;

/** Injects the listener and the hover styling. Safe to call on every load. */
export function installBridge(doc: Document): void {
  const head = doc.head || doc.documentElement;
  if (!head) return;

  if (!doc.querySelector("script[data-ed-bridge]")) {
    const script = doc.createElement("script");
    script.setAttribute("data-ed-bridge", "1");
    script.textContent = BRIDGE;
    head.appendChild(script);
  }

  if (!doc.querySelector("style[data-ed-style]")) {
    const style = doc.createElement("style");
    style.setAttribute("data-ed-style", "1");
    style.textContent = STYLE;
    head.appendChild(style);
  }
}

/* --------------------------------------------------------------- marking */

const norm = (text: string) => text.replace(/\s+/g, " ").trim();

function candidates(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("*")).filter(
    (node) => !node.closest("[data-editor-label]"),
  );
}

/**
 * The node that drew a text value: the smallest element whose whole text is
 * that value. Exact first, then whitespace-normalised — the storefront trims
 * every value before rendering it, so trimmed is the common case, not a
 * fallback for sloppiness.
 */
function matchText(pool: HTMLElement[], used: Set<Element>, value: string): HTMLElement | null {
  const want = value.trim();
  if (!want) return null;

  let best: HTMLElement | null = null;
  let bestSize = Infinity;

  for (const pass of [0, 1]) {
    for (const node of pool) {
      if (used.has(node)) continue;
      const text = node.textContent ?? "";
      const hit = pass === 0 ? text === value : norm(text) === norm(want);
      if (!hit) continue;
      const size = node.querySelectorAll("*").length;
      if (size < bestSize) {
        best = node;
        bestSize = size;
      }
    }
    if (best) return best;
  }
  return null;
}

/** The node that drew a media value: an img/video/source with that `src`. */
function matchMedia(root: Element, used: Set<Element>, value: string): HTMLElement | null {
  const want = value.trim();
  if (!want) return null;
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("img, video, source"))) {
    if (used.has(node)) continue;
    if (node.getAttribute("src") === want) return node;
  }
  return null;
}

/**
 * Walks the rendered page and marks every node it can trace back to a field.
 *
 * Call this once per iframe load, before any patch has been applied: it
 * matches against the *saved* values, which is what the freshly loaded page
 * shows. Marks survive patching; re-running it after a patch would fail to
 * find the moved values and is not needed.
 */
export function markPreview(doc: Document, sections: IndexSection[]): void {
  const taken = new Set<string>();

  for (const element of Array.from(doc.querySelectorAll<HTMLElement>("[data-section]"))) {
    const type = element.dataset.section;
    const section = sections.find((item) => item.type === type && !taken.has(item.id));
    if (!section) continue;
    taken.add(section.id);

    const used = new Set<Element>();
    const pool = candidates(element);

    const mark = (node: HTMLElement | null, field: string, blockId: string | null) => {
      if (!node) return;
      used.add(node);
      node.setAttribute("data-ed-section", section.id);
      node.setAttribute("data-ed-field", field);
      if (blockId) node.setAttribute("data-ed-block", blockId);
    };

    for (const field of section.fields) {
      const value = section.values[field.name] ?? "";
      const node = field.media
        ? matchMedia(element, used, value)
        : matchText(pool, used, value);
      if (node && field.media) node.setAttribute("data-ed-media", "1");
      mark(node, field.name, null);
    }

    for (const block of section.blocks) {
      for (const field of section.blockFields) {
        const value = block.values[field.name] ?? "";
        const node = field.media
          ? matchMedia(element, used, value)
          : matchText(pool, used, value);
        if (node && field.media) node.setAttribute("data-ed-media", "1");
        mark(node, field.name, block.id);
      }
    }
  }
}

/* ---------------------------------------------------------------- events */

/** What the editor should open for a click that landed on `target`. */
export function hitFor(target: EventTarget | null): PreviewHit | null {
  if (!(target instanceof Element)) return null;

  const field = target.closest<HTMLElement>("[data-ed-field]");
  if (field) {
    return {
      sectionId: field.getAttribute("data-ed-section") ?? "",
      field: field.getAttribute("data-ed-field"),
      blockId: field.getAttribute("data-ed-block"),
    };
  }

  const section = target.closest<HTMLElement>("[data-section]");
  if (!section) return null;
  return { sectionId: section.dataset.section ?? "", field: null, blockId: null };
}

/* --------------------------------------------------------------- patching */

function nodeFor(doc: Document, patch: Patch): Element | null {
  const escape = (value: string) =>
    typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value;
  const selector =
    `[data-ed-section="${escape(patch.sectionId)}"]` +
    `[data-ed-field="${escape(patch.field)}"]` +
    (patch.blockId ? `[data-ed-block="${escape(patch.blockId)}"]` : ":not([data-ed-block])");
  return doc.querySelector(selector);
}

/**
 * Sends one patch. Returns false when the preview has no node for that value
 * — which happens when the field was empty at load time, so nothing was drawn
 * for it, or when the block has not been saved yet. The caller shows that as
 * "appears once you save" rather than reloading: reloading would fetch the
 * same saved data and change nothing.
 */
export function sendPatch(doc: Document, win: Window, patch: Patch): boolean {
  if (!nodeFor(doc, patch)) return false;
  win.postMessage({ type: PATCH_TYPE, ...patch }, win.location.origin);
  return true;
}
