/**
 * The theme editor.
 *
 * Transliterated from design/port/editor.html: section list on the left, the
 * page in the middle, the fields of the selected section on the right, with
 * the page selector, zoom stepper and undo/redo in the black bar.
 *
 * Two places where the real thing beats the drawing:
 *
 *  - the preview is the actual storefront in a same-origin iframe, not a mock
 *    of it. A mock that drifts from the real page is worse than no preview.
 *    Clicking a section in it selects that section here, which is what the
 *    prototype's fake preview did with its own DOM.
 *  - the fifteen sections and their order are written in code, so there is no
 *    reorder handle and no add button for sections (blocks inside a section
 *    can be reordered and added — that is content, not layout).
 *
 * Undo/redo are real: they walk the edits you have made to the section you
 * are editing, before you save it.
 */
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "./+types/admin.online-store.editor.$pageId";
import { requireUser } from "~/lib/auth.server";
import {
  loadPageWithSections,
  saveSection,
  resolveAdminStore,
  reviewStats,
} from "~/lib/admin.server";
import { SECTIONS, type SectionDef } from "~/lib/sections";

export function meta() {
  return [{ title: "Customize — Shop Admin" }];
}

export async function loader({ context, request, params }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  const loaded = await loadPageWithSections(context.db, params.pageId);
  if (!loaded || !store) throw new Response("Page not found", { status: 404 });

  // The Reviews section's panel shows how many reviews it will render.
  const stats = await reviewStats(context.db, store.id);

  return {
    store: { slug: store.slug, name: store.name, domain: store.domain },
    page: { id: loaded.page.id, title: loaded.page.title },
    reviews: { published: stats.published, drafts: stats.total - stats.published },
    sections: loaded.sections.map((section) => ({
      id: section.id,
      type: section.type,
      position: section.position,
      hidden: section.hidden,
      values: (section.values ?? {}) as Record<string, string>,
      blocks: section.blocks.map((block) => ({
        id: block.id,
        values: (block.values ?? {}) as Record<string, string>,
      })),
    })),
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const sectionId = String(form.get("sectionId") || "");
  const definition = SECTIONS.find((s) => s.type === String(form.get("sectionType")));
  if (!definition) return { error: "Unknown section." };

  if (intent === "toggle") {
    const loaded = await loadPageWithSections(context.db, String(form.get("pageId")));
    const section = loaded?.sections.find((s) => s.id === sectionId);
    if (!section) return { error: "Section not found." };
    await saveSection(
      context.db,
      sectionId,
      (section.values ?? {}) as Record<string, string>,
      !section.hidden,
      section.blocks.map((block) => ({ id: block.id, values: (block.values ?? {}) as Record<string, string> })),
    );
    return { ok: section.hidden ? "Section shown." : "Section hidden." };
  }

  if (intent === "save") {
    const values: Record<string, string> = {};
    for (const field of definition.fields) {
      values[field.name] = String(form.get(`field.${field.name}`) ?? "");
    }

    const submittedBlocks: { id?: string; values: Record<string, string> }[] = [];
    if (definition.blocks) {
      const ids = form.getAll("blockId").map(String);
      const count = ids.length;
      for (let index = 0; index < count; index++) {
        const blockValues: Record<string, string> = {};
        let filled = false;
        for (const field of definition.blocks.fields) {
          const value = String(form.getAll(`block.${field.name}`)[index] ?? "");
          blockValues[field.name] = value;
          if (value.trim()) filled = true;
        }
        // An untouched empty row is not a block. Saving it would put a blank
        // item on the live page.
        if (!filled) continue;
        submittedBlocks.push({ id: ids[index] || undefined, values: blockValues });
      }
    }

    await saveSection(
      context.db,
      sectionId,
      values,
      form.get("hidden") === "1",
      submittedBlocks,
    );
    return { ok: "Saved." };
  }

  return { error: "Unknown action." };
}

/* ------------------------------------------------------------------ chrome */

const DEVICES = [
  { key: "desktop", title: "Desktop", icon: "M3 5h14v8H3zM8 16h4M10 13v3", width: "1000px" },
  { key: "tablet", title: "Tablet", icon: "M5 3h10v14H5zM9 15h2", width: "640px" },
  { key: "mobile", title: "Mobile", icon: "M6 3h8v14H6zM9 15h2", width: "390px" },
] as const;

type DeviceKey = (typeof DEVICES)[number]["key"];

/** The prototype's per-section glyphs, keyed by our section types. */
const SECTION_ICONS: Record<string, string> = {
  buy_box: "M4 4h12v13l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L4 17z",
  video_faq: "M3 5h14v10H3zM8 8l4 2-4 2z",
  social_proof_images: "M3 5h14v10H3zm0 7 4-4 4 4 3-3 3 3",
  video_clips: "M3 5h14v10H3zM7 5v10M13 5v10",
  product_grid: "M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z",
  trust_icons: "M10 3l6 2.5v5c0 3.5-2.5 5.5-6 6.5-3.5-1-6-3-6-6.5v-5z",
  three_steps: "M3 15h4V9H3zM8 15h4V5H8zM13 15h4v-4h-4z",
  benefits: "M4 10.5 8 14l8-8",
  features: "M10 3l2.2 4.5 5 .7-3.6 3.5.9 4.9L10 14.3l-4.5 2.3.9-4.9L2.8 8.2l5-.7z",
  comparison_table: "M3 4h14M3 10h14M3 16h14M10 3v14",
  reviews: "M3 5h14v8H8l-5 4z",
  who_its_for: "M10 9.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM4 16c0-2.6 2.7-4 6-4s6 1.4 6 4",
  whats_in_the_box: "M3 6.5 10 3l7 3.5v7L10 17l-7-3.5zM3 6.5 10 10l7-3.5M10 10v7",
  specifications: "M4 5h12M4 10h12M4 15h8",
  closing_cta: "M4 7h12v6H4zM7 10h6",
};

/**
 * The other four pages of the prototype's selector. Only the product page is
 * built, so they render disabled with the reason, rather than as a switch
 * that leads nowhere.
 */
const OTHER_PAGES = [
  ["home", "Home page"],
  ["cart", "Cart"],
  ["checkout", "Checkout"],
  ["thanks", "Thank you"],
] as const;

interface BlockRow {
  key: string;
  id: string;
  values: Record<string, string>;
}

interface Draft {
  values: Record<string, string>;
  blocks: BlockRow[];
}

interface SectionState {
  id: string;
  type: string;
  hidden: boolean;
  values: Record<string, string>;
  blocks: { id: string; values: Record<string, string> }[];
}

function draftOf(section: SectionState | undefined): Draft {
  if (!section) return { values: {}, blocks: [] };
  return {
    values: { ...section.values },
    blocks: section.blocks.map((block, index) => ({
      key: `b${index}`,
      id: block.id,
      values: { ...block.values },
    })),
  };
}

export default function ThemeEditor({ loaderData, actionData }: Route.ComponentProps) {
  const { store, page, sections, reviews } = loaderData;
  const [params, setParams] = useSearchParams();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const selectedId = params.get("section") || "";
  const selected = sections.find((section) => section.id === selectedId);
  const definition = SECTIONS.find((s) => s.type === selected?.type);

  const device = ((params.get("device") as DeviceKey) || "desktop") as DeviceKey;
  const deviceDef = DEVICES.find((d) => d.key === device) ?? DEVICES[0];
  const visibleCount = sections.filter((section) => !section.hidden).length;

  const [zoom, setZoom] = useState(1);
  const [openBlock, setOpenBlock] = useState(0);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { preventScrollReset: true });
  };
  const clearParam = (key: string) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next, { preventScrollReset: true });
  };

  /* --------------------------------------------------- draft + undo/redo */

  const [draft, setDraft] = useState<Draft>(() => draftOf(selected));
  const [past, setPast] = useState<Draft[]>([]);
  const [future, setFuture] = useState<Draft[]>([]);

  // Switching section, or a save coming back, starts a fresh history.
  useEffect(() => {
    setDraft(draftOf(selected));
    setPast([]);
    setFuture([]);
    setOpenBlock(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.values, selected?.blocks]);

  const apply = useCallback(
    (next: Draft) => {
      setPast((stack) => [...stack, draft]);
      setFuture([]);
      setDraft(next);
    },
    [draft],
  );

  const undo = () => {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setPast((stack) => stack.slice(0, -1));
    setFuture((stack) => [draft, ...stack]);
    setDraft(previous);
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture((stack) => stack.slice(1));
    setPast((stack) => [...stack, draft]);
    setDraft(next);
  };

  /* ------------------------------------------------------------ preview */

  const frameRef = useRef<HTMLIFrameElement>(null);
  const previewSrc = `/?store=${store.slug}&preview=${page.id}&t=${navigation.state}`;

  // The preview is same-origin, so the editor can talk to the real page: each
  // rendered section carries data-section, which is enough to make clicking
  // one select it here and to outline the selected one.
  const wireFrame = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const nodes = Array.from(doc.querySelectorAll<HTMLElement>("[data-section]"));
    for (const node of nodes) {
      const type = node.dataset.section;
      const match = sections.find((section) => section.type === type);
      node.style.cursor = "pointer";
      node.style.outlineOffset = "-2px";
      node.style.position = node.style.position || "relative";
      const isSelected = match ? match.id === selectedId : false;
      node.style.outline = isSelected ? "2px solid #2F5CF5" : "none";

      // The selected-section label overlay.
      const existing = node.querySelector<HTMLElement>("[data-editor-label]");
      if (isSelected && match) {
        const label =
          SECTIONS.find((s) => s.type === match.type)?.label ?? match.type;
        const tag = existing ?? doc.createElement("span");
        tag.setAttribute("data-editor-label", "1");
        tag.textContent = label;
        tag.setAttribute(
          "style",
          "position:absolute;left:0;top:0;background:#2F5CF5;color:#fff;font-size:10px;font-weight:600;padding:2px 7px;border-radius:0 0 6px 0;z-index:2;font-family:Inter,system-ui,sans-serif",
        );
        if (!existing) node.insertBefore(tag, node.firstChild);
      } else if (existing) {
        existing.remove();
      }

      node.onclick = (event) => {
        if (!match) return;
        event.preventDefault();
        setParam("section", match.id);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, selectedId, params]);

  useEffect(() => {
    wireFrame();
  }, [wireFrame]);

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#EDEDED" }}>
      <div
        style={{
          height: 48,
          flex: "none",
          background: "#1A1A1A",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 12px",
        }}
      >
        <Link
          to={`/admin/online-store?store=${store.slug}`}
          title="Back to Online Store"
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: 0,
            background: "rgba(255,255,255,.1)",
            color: "#fff",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            flex: "none",
            textDecoration: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m10 4-4 4 4 4" />
          </svg>
        </Link>
        <span
          style={{
            fontWeight: 650,
            fontSize: 13,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 200,
          }}
        >
          {store.name} — custom
        </span>
        <select
          value="product"
          onChange={() => undefined}
          title="Only the product page exists. The other pages are not built yet."
          style={{
            height: 28,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,.16)",
            background: "rgba(255,255,255,.08)",
            color: "#fff",
            padding: "0 8px",
            fontSize: 12,
            flex: "none",
          }}
        >
          <option value="product">Product page</option>
          {OTHER_PAGES.map(([value, label]) => (
            <option key={value} value={value} disabled>
              {label} — not built yet
            </option>
          ))}
        </select>

        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.08)", borderRadius: 8, padding: 3 }}>
            {DEVICES.map((item) => (
              <button
                key={item.key}
                onClick={() => setParam("device", item.key)}
                title={item.title}
                style={{
                  width: 28,
                  height: 22,
                  borderRadius: 6,
                  border: 0,
                  background: device === item.key ? "rgba(255,255,255,.22)" : "transparent",
                  color: "#fff",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
              </button>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(255,255,255,.08)",
              borderRadius: 8,
              padding: "3px 6px",
            }}
          >
            <button
              onClick={() => setZoom((value) => Math.max(0.6, Math.round((value - 0.1) * 10) / 10))}
              aria-label="Zoom out"
              style={{ width: 20, height: 20, border: 0, borderRadius: 5, background: "transparent", color: "#fff", cursor: "pointer", fontSize: 13, lineHeight: 1 }}
            >
              −
            </button>
            <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", minWidth: 34, textAlign: "center" }}>
              {zoomLabel}
            </span>
            <button
              onClick={() => setZoom((value) => Math.min(1.4, Math.round((value + 0.1) * 10) / 10))}
              aria-label="Zoom in"
              style={{ width: 20, height: 20, border: 0, borderRadius: 5, background: "transparent", color: "#fff", cursor: "pointer", fontSize: 13, lineHeight: 1 }}
            >
              +
            </button>
          </div>
        </div>

        <button
          onClick={undo}
          disabled={!past.length}
          title="Undo"
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: 0,
            background: "rgba(255,255,255,.1)",
            color: "#fff",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            opacity: past.length ? 1 : 0.4,
            flex: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5 3 6.5l3 3" />
            <path d="M3 6.5h6.2A3.3 3.3 0 0 1 9.2 13H7" />
          </svg>
        </button>
        <button
          onClick={redo}
          disabled={!future.length}
          title="Redo"
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: 0,
            background: "rgba(255,255,255,.1)",
            color: "#fff",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            opacity: future.length ? 1 : 0.4,
            flex: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m10 3.5 3 3-3 3" />
            <path d="M13 6.5H6.8A3.3 3.3 0 0 0 6.8 13H9" />
          </svg>
        </button>
        <a
          href={`/?store=${store.slug}`}
          target="_blank"
          rel="noreferrer"
          style={{
            height: 28,
            padding: "0 10px",
            borderRadius: 8,
            border: 0,
            background: "transparent",
            color: "#fff",
            fontSize: 12,
            fontWeight: 550,
            cursor: "pointer",
            flex: "none",
            display: "inline-flex",
            alignItems: "center",
            textDecoration: "none",
          }}
        >
          Preview
        </a>
        <button
          type="submit"
          form="section-form"
          disabled={busy || !selected}
          title={selected ? undefined : "Pick a section to edit before saving"}
          style={{
            height: 28,
            padding: "0 16px",
            borderRadius: 8,
            border: 0,
            background: "#fff",
            color: "#1A1A1A",
            fontSize: 12,
            fontWeight: 650,
            cursor: selected ? "pointer" : "default",
            flex: "none",
            opacity: selected ? 1 : 0.5,
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row", overflow: "hidden" }}>
        {/* SECTION LIST */}
        <div
          style={{
            width: 300,
            flex: "none",
            background: "var(--surface)",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "auto",
          }}
        >
          <div
            style={{
              padding: "11px 14px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontWeight: 650, fontSize: 13 }}>Sections</span>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {visibleCount} of {sections.length} showing
            </span>
          </div>

          {sections.map((section) => {
            const sectionDef = SECTIONS.find((s) => s.type === section.type);
            const active = section.id === selectedId;
            return (
              <div
                key={section.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 8px 0 12px",
                  height: 38,
                  borderBottom: "1px solid var(--border)",
                  background: active ? "var(--accent-soft)" : "transparent",
                  borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    background: "var(--bg)",
                    display: "grid",
                    placeItems: "center",
                    flex: "none",
                    color: section.hidden ? "var(--ink-3)" : "var(--ink-2)",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
                    <path d={SECTION_ICONS[section.type] ?? SECTION_ICONS.specifications} />
                  </svg>
                </span>
                <button
                  onClick={() => setParam("section", section.id)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 38,
                    border: 0,
                    background: "transparent",
                    color: section.hidden ? "var(--ink-3)" : "var(--ink)",
                    fontSize: 13,
                    fontWeight: active ? 650 : 450,
                    cursor: "pointer",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textDecoration: section.hidden ? "line-through" : "none",
                  }}
                >
                  {sectionDef?.label ?? section.type}
                </button>
                <Form method="post">
                  <input type="hidden" name="intent" value="toggle" />
                  <input type="hidden" name="pageId" value={page.id} />
                  <input type="hidden" name="sectionId" value={section.id} />
                  <input type="hidden" name="sectionType" value={section.type} />
                  <button
                    type="submit"
                    className="k-hover"
                    title={section.hidden ? "Show section" : "Hide section"}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      border: 0,
                      background: "transparent",
                      color: section.hidden ? "var(--ink-3)" : "var(--ink-2)",
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                      flex: "none",
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M1.8 10S4.8 5.2 10 5.2s8.2 4.8 8.2 4.8-3 4.8-8.2 4.8S1.8 10 1.8 10z" />
                      <circle cx="10" cy="10" r="2.1" />
                      {section.hidden ? <path d="M3.4 16.6 16.6 3.4" /> : null}
                    </svg>
                  </button>
                </Form>
              </div>
            );
          })}

          <div style={{ padding: "12px 14px", fontSize: 11, color: "var(--ink-3)", lineHeight: "16px" }}>
            The fifteen sections and their order are written in code. You can hide one, and change
            what it says. You cannot move, add or delete one — that is what stops a layout from being
            overwritten by accident.
          </div>
        </div>

        {/* PREVIEW */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: "auto",
            background: "#EDEDED",
            padding: 16,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: deviceDef.width,
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
              background: "#fff",
              border: "1px solid #DEDEDE",
              borderRadius: 10,
              overflow: "hidden",
              alignSelf: "flex-start",
              boxShadow: "0 1px 3px rgba(0,0,0,.08)",
              height: "calc(100vh - 128px)",
            }}
          >
            <iframe
              key={previewSrc}
              ref={frameRef}
              src={previewSrc}
              onLoad={wireFrame}
              title="Storefront preview"
              style={{ width: "100%", height: "100%", border: 0, display: "block" }}
            />
          </div>
        </div>

        {/* FIELDS */}
        <div
          style={{
            width: 320,
            flex: "none",
            background: "var(--surface)",
            borderLeft: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "auto",
          }}
        >
          {!selected || !definition ? (
            <div style={{ padding: "22px 16px", color: "var(--ink-2)", fontSize: 12, lineHeight: "18px" }}>
              Pick a section on the left, or click one in the preview, to edit its words and images.
              <br />
              <br />
              Design is written in code per store — the order of sections is fixed and only their
              content changes here.
            </div>
          ) : (
            <SectionPanel
              key={selected.id}
              pageId={page.id}
              storeSlug={store.slug}
              section={selected}
              definition={definition}
              draft={draft}
              apply={apply}
              openBlock={openBlock}
              setOpenBlock={setOpenBlock}
              reviews={reviews}
              onBack={() => clearParam("section")}
              message={actionData?.ok}
              error={actionData?.error}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ panel */

const inputStyle = {
  height: 34,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid var(--input-border)",
  background: "var(--input)",
  fontSize: 13,
  color: "var(--ink)",
  fontWeight: 450,
} as const;

const areaStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--input-border)",
  background: "var(--input)",
  fontSize: 13,
  resize: "vertical",
  color: "var(--ink)",
  fontFamily: "inherit",
  fontWeight: 450,
} as const;

function SectionPanel({
  pageId,
  storeSlug,
  section,
  definition,
  draft,
  apply,
  openBlock,
  setOpenBlock,
  reviews,
  onBack,
  message,
  error,
}: {
  pageId: string;
  storeSlug: string;
  section: SectionState;
  definition: SectionDef;
  draft: Draft;
  apply: (next: Draft) => void;
  openBlock: number;
  setOpenBlock: (index: number) => void;
  reviews: { published: number; drafts: number };
  onBack: () => void;
  message?: string;
  error?: string;
}) {
  const dragFrom = useRef<number | null>(null);

  const setField = (name: string, value: string) =>
    apply({ ...draft, values: { ...draft.values, [name]: value } });

  const setBlockField = (index: number, name: string, value: string) =>
    apply({
      ...draft,
      blocks: draft.blocks.map((row, i) =>
        i === index ? { ...row, values: { ...row.values, [name]: value } } : row,
      ),
    });

  const blockLabel = definition.blocks?.label ?? "";
  const blockCount = `${draft.blocks.length} ${
    draft.blocks.length === 1 ? blockLabel : `${blockLabel}s`
  }`;

  const summaryOf = (row: BlockRow) => {
    const first = (definition.blocks?.fields ?? [])
      .map((field) => row.values[field.name])
      .find((value) => value && value.trim() && !value.startsWith("data:"));
    return first ? first.slice(0, 34) : "Empty block";
  };

  const reorder = (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to) return;
    const next = [...draft.blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    apply({ ...draft, blocks: next });
  };

  return (
    <>
      <Form
        id="section-form"
        method="post"
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      >
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="pageId" value={pageId} />
        <input type="hidden" name="sectionId" value={section.id} />
        <input type="hidden" name="sectionType" value={section.type} />
        <input type="hidden" name="hidden" value={section.hidden ? "1" : "0"} />

        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            position: "sticky",
            top: 0,
            background: "var(--surface)",
            zIndex: 2,
          }}
        >
          <button
            type="button"
            onClick={onBack}
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m10 4-4 4 4 4" />
            </svg>
          </button>
          <span
            style={{
              fontWeight: 650,
              fontSize: 13,
              flex: 1,
              minWidth: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {definition.label}
          </span>
        </div>

        {definition.externalSource === "reviews" ? (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                padding: "11px 12px",
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--bg)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--ink-2)" }}>Published on this page</span>
                <span style={{ fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                  {reviews.published}
                </span>
              </span>
              <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--ink-2)" }}>Unpublished drafts</span>
                <span style={{ fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                  {reviews.drafts}
                </span>
              </span>
              <span style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: "16px" }}>
                This section has no blocks of its own — it always shows the published reviews. One
                source of truth.
              </span>
              <Link
                to={`/admin/reviews?store=${storeSlug}`}
                style={{
                  height: 28,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontSize: 12,
                  fontWeight: 550,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  textDecoration: "none",
                }}
              >
                Manage reviews
              </Link>
            </div>
          </div>
        ) : null}

        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 11 }}>
          {definition.fields.map((field) => {
            const value = draft.values[field.name] ?? "";
            return (
              <div
                key={field.name}
                style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}
              >
                {field.label}
                {field.kind === "textarea" ? (
                  <textarea
                    name={`field.${field.name}`}
                    value={value}
                    onChange={(event) => setField(field.name, event.target.value)}
                    rows={3}
                    placeholder={field.label}
                    style={areaStyle}
                  />
                ) : field.kind === "image" || field.kind === "video" ? (
                  <ImageField
                    name={`field.${field.name}`}
                    value={value}
                    onChange={(next) => setField(field.name, next)}
                  />
                ) : (
                  <input
                    name={`field.${field.name}`}
                    value={value}
                    onChange={(event) => setField(field.name, event.target.value)}
                    placeholder={field.label}
                    style={inputStyle}
                  />
                )}
                {field.help ? (
                  <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 450 }}>{field.help}</span>
                ) : null}
              </div>
            );
          })}
        </div>

        {definition.blocks ? (
          <div>
            <div
              style={{
                padding: "8px 12px 4px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--ink-2)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                Blocks
              </span>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{blockCount}</span>
            </div>
            {section.type === "specifications" ? (
              <div style={{ padding: "0 12px 8px", fontSize: 11, color: "var(--ink-3)", lineHeight: "16px" }}>
                Empty values display as “Spec pending” on the live page.
              </div>
            ) : null}

            {draft.blocks.map((row, index) => (
              <div
                key={row.key}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorder(index)}
                style={{
                  borderTop: "1px solid var(--border)",
                  background: openBlock === index ? "var(--bg)" : "transparent",
                }}
              >
                <input type="hidden" name="blockId" value={row.id} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 8px 12px" }}>
                  <span
                    draggable
                    onDragStart={() => {
                      dragFrom.current = index;
                    }}
                    title="Drag to reorder"
                    style={{ cursor: "grab", color: "var(--ink-3)", flex: "none" }}
                  >
                    ⠿
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenBlock(openBlock === index ? -1 : index)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: 0,
                      background: "transparent",
                      padding: 0,
                      textAlign: "left",
                      fontSize: 12,
                      fontWeight: 550,
                      color: "var(--ink)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {summaryOf(row)}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      apply({ ...draft, blocks: draft.blocks.filter((_, i) => i !== index) })
                    }
                    title="Delete block"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      border: 0,
                      background: "transparent",
                      color: "var(--critical)",
                      cursor: "pointer",
                      flex: "none",
                    }}
                  >
                    ✕
                  </button>
                </div>
                {/* Hidden twins keep every block's values in the submission even
                    while its summary is collapsed. */}
                {openBlock === index ? (
                  <div style={{ padding: "0 12px 10px 30px", display: "flex", flexDirection: "column", gap: 7 }}>
                    {definition.blocks!.fields.map((field) => {
                      const value = row.values[field.name] ?? "";
                      if (field.kind === "image" || field.kind === "video") {
                        return (
                          <BlockImageField
                            key={field.name}
                            name={`block.${field.name}`}
                            value={value}
                            onChange={(next) => setBlockField(index, field.name, next)}
                          />
                        );
                      }
                      if (field.kind === "textarea") {
                        return (
                          <textarea
                            key={field.name}
                            name={`block.${field.name}`}
                            value={value}
                            onChange={(event) => setBlockField(index, field.name, event.target.value)}
                            rows={2}
                            placeholder={field.label}
                            style={{
                              width: "100%",
                              padding: "7px 9px",
                              borderRadius: 8,
                              border: "1px solid var(--input-border)",
                              background: "var(--input)",
                              fontSize: 12,
                              resize: "vertical",
                              color: "var(--ink)",
                              fontFamily: "inherit",
                            }}
                          />
                        );
                      }
                      return (
                        <input
                          key={field.name}
                          name={`block.${field.name}`}
                          value={value}
                          onChange={(event) => setBlockField(index, field.name, event.target.value)}
                          placeholder={field.label}
                          style={{
                            height: 30,
                            padding: "0 9px",
                            borderRadius: 8,
                            border: "1px solid var(--input-border)",
                            background: "var(--input)",
                            fontSize: 12,
                            color: "var(--ink)",
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  definition.blocks!.fields.map((field) => (
                    <input
                      key={field.name}
                      type="hidden"
                      name={`block.${field.name}`}
                      value={row.values[field.name] ?? ""}
                    />
                  ))
                )}
              </div>
            ))}

            <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={() =>
                  apply({
                    ...draft,
                    blocks: [...draft.blocks, { key: `n${Date.now()}`, id: "", values: {} }],
                  })
                }
                style={{
                  width: "100%",
                  height: 30,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Add {blockLabel}
              </button>
            </div>
          </div>
        ) : null}

        {message || error ? (
          <div style={{ padding: "0 12px 10px", fontSize: 12, fontWeight: 550 }}>
            {message ? <span style={{ color: "var(--b-success-fg)" }}>{message}</span> : null}
            {error ? <span style={{ color: "var(--critical)" }}>{error}</span> : null}
          </div>
        ) : null}
      </Form>

      {/* Its own form: a form cannot nest inside another. */}
      <Form
        method="post"
        style={{
          marginTop: "auto",
          padding: "11px 12px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--surface)",
        }}
      >
        <input type="hidden" name="intent" value="toggle" />
        <input type="hidden" name="pageId" value={pageId} />
        <input type="hidden" name="sectionId" value={section.id} />
        <input type="hidden" name="sectionType" value={section.type} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 550 }}>Show this section</span>
        <button
          type="submit"
          role="switch"
          aria-checked={!section.hidden}
          style={{
            width: 38,
            height: 22,
            borderRadius: 11,
            border: 0,
            background: section.hidden ? "var(--border-strong)" : "var(--accent)",
            position: "relative",
            cursor: "pointer",
            flex: "none",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: section.hidden ? 2 : 18,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,.3)",
              transition: "left .18s",
            }}
          />
        </button>
      </Form>
    </>
  );
}

/**
 * An image field: thumbnail, file name, Change and Remove.
 *
 * There is no media picker on this screen, so "Change" opens the URL of the
 * image for editing rather than pretending to browse a library. The value it
 * writes is the same one the storefront reads.
 */
function ImageField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const fileName = useMemo(
    () => (value ? value.split("/").pop()!.slice(0, 24) : "No image chosen"),
    [value],
  );

  return (
    <>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: 8,
          border: "1px solid var(--border)",
          borderRadius: 9,
          background: "var(--bg)",
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 7,
            border: "1px solid var(--border)",
            backgroundColor: "var(--surface)",
            backgroundImage: value ? `url("${value}")` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
            flex: "none",
            display: "grid",
            placeItems: "center",
            color: "var(--ink-3)",
            fontSize: 9,
          }}
        >
          {value ? "" : "Empty"}
        </span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 550,
              color: "var(--ink)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {fileName}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setEditing((open) => !open)}
              style={{ border: 0, background: "transparent", padding: 0, color: "var(--link)", fontSize: 12, fontWeight: 550, cursor: "pointer" }}
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={!value}
              style={{
                border: 0,
                background: "transparent",
                padding: 0,
                color: "var(--critical)",
                fontSize: 12,
                fontWeight: 550,
                cursor: "pointer",
                opacity: value ? 1 : 0.4,
              }}
            >
              Remove
            </button>
          </span>
        </span>
      </span>
      {editing ? (
        <input
          name={name}
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://… or a media URL"
          style={inputStyle}
        />
      ) : (
        <input type="hidden" name={name} value={value} />
      )}
    </>
  );
}

/** The block form's compact image row. */
function BlockImageField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 6,
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg)",
            backgroundImage: value ? `url("${value}")` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
            flex: "none",
          }}
        />
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          style={{
            flex: 1,
            height: 30,
            borderRadius: 8,
            border: "1px dashed var(--border-strong)",
            background: "var(--bg)",
            color: "var(--ink-2)",
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {value ? "Change image" : "Choose image…"}
        </button>
      </span>
      {editing ? (
        <input
          name={name}
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://… or a media URL"
          style={{
            height: 30,
            padding: "0 9px",
            borderRadius: 8,
            border: "1px solid var(--input-border)",
            background: "var(--input)",
            fontSize: 12,
            color: "var(--ink)",
          }}
        />
      ) : (
        <input type="hidden" name={name} value={value} />
      )}
    </>
  );
}
