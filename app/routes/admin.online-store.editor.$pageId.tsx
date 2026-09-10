/**
 * The theme editor.
 *
 * Its own environment: this route sits outside the admin layout, so there is
 * no sidebar and no admin top bar here, and the admin stylesheet is not
 * loaded. Everything this screen draws, it draws itself — chrome, material and
 * all — from `~/admin/editor.css`.
 *
 * The look is the iOS "liquid glass" material rather than the admin's
 * Shopify-alike: translucent panels blurred and saturated over a gently
 * coloured ground, lit along their top edge, floating on soft shadows instead
 * of sitting inside hard borders. The recipe is the one already approved on
 * Live View's notification cards (`app/routes/admin.live.tsx`), scaled up to
 * panel size.
 *
 * Shopify's arrangement, though: one top bar over three columns — sections on
 * the left, the live page in the middle, the selected section's fields on the
 * right. What it can change is deliberately small: words, images and the
 * repeatable blocks inside a section. Structure is code.
 *
 * Two places where the real thing beats a drawing:
 *
 *  - the preview is the actual storefront in a same-origin iframe, not a mock
 *    of it. Clicking a section in it selects that section here.
 *  - the fifteen sections and their order are written in code, so there is no
 *    reorder handle and no add button for sections (blocks inside a section
 *    can be reordered and added — that is content, not layout).
 *
 * Undo/redo are real: they walk the edits you have made to the section you
 * are editing, before you save it.
 */
import { Form, Link, useFetcher, useNavigation, useSearchParams } from "react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "./+types/admin.online-store.editor.$pageId";
import { requireUser } from "~/lib/auth.server";
import {
  loadPageWithSections,
  saveSection,
  resolveAdminStore,
  reviewStats,
  addMedia,
} from "~/lib/admin.server";
import { SECTIONS, type SectionDef, type FieldDef } from "~/lib/sections";
import { SECTION_ICON_SET, type IconDef } from "~/admin/section-icons";
import {
  hitFor,
  installBridge,
  markPreview,
  sendPatch,
  type IndexSection,
  type PreviewHit,
} from "~/admin/editor-preview";
import editorHref from "~/admin/editor.css?url";

export function meta() {
  return [{ title: "Customize — Shop Admin" }];
}

export function links() {
  return [{ rel: "stylesheet", href: editorHref }];
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
    // Whether the R2 bucket is bound decides if Replace can really upload.
    // When it is not, the button says so rather than failing silently.
    mediaReady: "MEDIA" in context.cloudflare.env,
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

  // Upload comes first: it carries a file, not a section type. It writes the
  // file into R2 under a content-hashed key and hands back the /media/:key
  // address, which is the same value the storefront reads out of the field.
  if (intent === "upload") {
    const bucket = context.cloudflare.env.MEDIA;
    if (!bucket) return { error: "No media bucket is bound to this Worker yet." };

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };
    if (file.size > 25 * 1024 * 1024) return { error: "That file is over 25 MB." };

    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const hash = Array.from(new Uint8Array(digest).slice(0, 10))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const extension = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `${hash}.${extension}`;

    await bucket.put(key, buffer, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    // Record it in the media table so it also shows on the Media screen.
    const url = new URL(request.url);
    const { store } = await resolveAdminStore(context.db, url);
    if (store) {
      await addMedia(context.db, store.id, {
        key,
        filename: file.name,
        mime: file.type || "application/octet-stream",
        sizeBytes: file.size,
        alt: null,
      });
    }

    return { ok: "Uploaded.", url: `/media/${key}` };
  }

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
  { key: "desktop", title: "Desktop", icon: "M3 5h14v8H3zM8 16h4M10 13v3", width: 1100 },
  { key: "tablet", title: "Tablet", icon: "M5 3h10v14H5zM9 15h2", width: 780 },
  { key: "mobile", title: "Mobile", icon: "M6 3h8v14H6zM9 15h2", width: 390 },
] as const;

type DeviceKey = (typeof DEVICES)[number]["key"];

/**
 * The other four pages of the page selector. Only the product page is built,
 * so they render disabled with the reason, rather than as a switch that leads
 * nowhere.
 */
const OTHER_PAGES = [
  ["home", "Home page"],
  ["cart", "Cart"],
  ["checkout", "Checkout"],
  ["thanks", "Thank you"],
] as const;

function Glyph({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

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

/** Draft equality, ignoring the client-only row key. */
function same(a: Draft, b: Draft): boolean {
  const strip = (draft: Draft) => ({
    values: draft.values,
    blocks: draft.blocks.map((row) => ({ id: row.id, values: row.values })),
  });
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

export default function ThemeEditor({ loaderData, actionData }: Route.ComponentProps) {
  const { store, page, sections, reviews, mediaReady } = loaderData;
  const [params, setParams] = useSearchParams();
  const navigation = useNavigation();
  const saving =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "save";

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

  // Save stays dead until an edit has actually changed something.
  const dirty = Boolean(selected) && !same(draft, draftOf(selected));

  /* ------------------------------------------------------------ preview */

  const frameRef = useRef<HTMLIFrameElement>(null);
  // Stable on purpose. The preview used to be keyed on navigation state, so
  // every write threw the page away and rebuilt it. Now it is patched in
  // place while you type, and reloaded only once a write has actually changed
  // what the server would send back.
  const previewSrc = `/?store=${store.slug}&preview=${page.id}`;

  // Bumped on each iframe load: the marking pass runs once per load, and the
  // outline and patch passes need to re-run after one.
  const [loadCount, setLoadCount] = useState(0);
  const scrollBack = useRef<number | null>(null);
  const [stale, setStale] = useState(false);

  // What the last click in the preview asked to edit.
  const [focus, setFocus] = useState<
    { sectionId: string; field: string; blockId: string | null; nonce: number } | null
  >(null);

  // The marking pass needs to know which fields are pictures, so it can match
  // them on `src` instead of on text. Both come from the one section list.
  const indexSections: IndexSection[] = useMemo(
    () =>
      sections.map((section) => {
        const def = SECTIONS.find((s) => s.type === section.type);
        const kind = (field: FieldDef) => ({
          name: field.name,
          media: field.kind === "image" || field.kind === "video",
        });
        return {
          id: section.id,
          type: section.type,
          values: section.values,
          blocks: section.blocks,
          fields: (def?.fields ?? []).map(kind),
          blockFields: (def?.blocks?.fields ?? []).map(kind),
        };
      }),
    [sections],
  );

  // A click in the preview selects the section and, when the click landed on
  // something the editor could trace back to a field, opens that field.
  const openHit = useCallback(
    (hit: PreviewHit) => {
      const match =
        sections.find((section) => section.id === hit.sectionId) ??
        sections.find((section) => section.type === hit.sectionId);
      if (!match) return;
      setFocus(
        hit.field
          ? { sectionId: match.id, field: hit.field, blockId: hit.blockId, nonce: Date.now() }
          : null,
      );
      if (match.id !== selectedId) setParam("section", match.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, selectedId, params],
  );

  // Clicking a block's own text opens that block in the inspector, so the
  // field you touched is the field you land on.
  useEffect(() => {
    if (!focus || !focus.blockId || focus.sectionId !== selectedId) return;
    const index = draft.blocks.findIndex((row) => row.id === focus.blockId);
    if (index >= 0) setOpenBlock(index);
  }, [focus, selectedId, draft.blocks]);

  // The click listener is bound once per document load; the ref keeps it
  // pointing at the current handler without rebinding.
  const openHitRef = useRef(openHit);
  openHitRef.current = openHit;

  const onFrameLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    const win = frameRef.current?.contentWindow;
    if (!doc || !win) return;

    installBridge(doc);
    markPreview(doc, indexSections);

    doc.addEventListener(
      "click",
      (event) => {
        const hit = hitFor(event.target);
        if (!hit) return;
        // Links and video controls inside the preview would otherwise
        // navigate the frame away from the page being edited.
        event.preventDefault();
        openHitRef.current(hit);
      },
      true,
    );

    if (scrollBack.current != null) {
      win.scrollTo(0, scrollBack.current);
      scrollBack.current = null;
    }
    setLoadCount((count) => count + 1);
  }, [indexSections]);

  // The selected section's outline and its name tag.
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    for (const node of Array.from(doc.querySelectorAll<HTMLElement>("[data-section]"))) {
      const match = sections.find((section) => section.type === node.dataset.section);
      const isSelected = match ? match.id === selectedId : false;
      if (!node.style.position) node.style.position = "relative";
      node.style.outlineColor = isSelected ? "rgba(0,113,227,.9)" : "transparent";
      node.style.borderRadius = isSelected ? "14px" : "";

      const existing = node.querySelector<HTMLElement>("[data-editor-label]");
      if (isSelected && match) {
        const label = SECTIONS.find((s) => s.type === match.type)?.label ?? match.type;
        const tag = existing ?? doc.createElement("span");
        tag.setAttribute("data-editor-label", "1");
        tag.textContent = label;
        tag.setAttribute(
          "style",
          "position:absolute;left:10px;top:10px;background:rgba(0,113,227,.92);color:#fff;font-size:11px;font-weight:590;padding:4px 10px;border-radius:999px;z-index:2;box-shadow:0 6px 18px rgba(0,113,227,.35);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;pointer-events:none",
        );
        if (!existing) node.insertBefore(tag, node.firstChild);
      } else if (existing) {
        existing.remove();
      }
    }
  }, [sections, selectedId, loadCount]);

  // Live editing: every change to the draft is pushed into the preview as a
  // patch, debounced so a keystroke does not post a message per character.
  useEffect(() => {
    if (!selected || !definition) {
      setStale(false);
      return;
    }
    const saved = selected;
    const timer = setTimeout(() => {
      const doc = frameRef.current?.contentDocument;
      const win = frameRef.current?.contentWindow;
      if (!doc || !win) return;
      let missing = false;

      for (const field of definition.fields) {
        const value = draft.values[field.name] ?? "";
        const applied = sendPatch(doc, win, {
          sectionId: saved.id,
          field: field.name,
          blockId: null,
          value,
          media: field.kind === "image" || field.kind === "video",
        });
        if (!applied && value.trim() !== (saved.values[field.name] ?? "").trim()) missing = true;
      }

      for (const row of draft.blocks) {
        const savedBlock = saved.blocks.find((block) => block.id === row.id);
        for (const field of definition.blocks?.fields ?? []) {
          const value = row.values[field.name] ?? "";
          const applied =
            row.id &&
            sendPatch(doc, win, {
              sectionId: saved.id,
              field: field.name,
              blockId: row.id,
              value,
              media: field.kind === "image" || field.kind === "video",
            });
          if (!applied && value.trim() !== (savedBlock?.values[field.name] ?? "").trim()) {
            missing = true;
          }
        }
      }

      // Adding, deleting or reordering blocks changes the shape of the page,
      // which no patch can do — it only shows once the section is saved.
      if (draft.blocks.length !== saved.blocks.length) missing = true;

      setStale(missing);
    }, 150);
    return () => clearTimeout(timer);
  }, [draft, selected, definition, loadCount]);

  // A write is the one thing that changes what the server would render, so it
  // is the one thing that reloads the preview — quietly, keeping the scroll.
  const posting =
    navigation.state === "submitting" && (navigation.formMethod ?? "").toUpperCase() === "POST";
  const wasPosting = useRef(false);
  useEffect(() => {
    if (wasPosting.current && navigation.state === "idle") {
      const win = frameRef.current?.contentWindow;
      if (win) {
        scrollBack.current = win.scrollY;
        win.location.replace(previewSrc);
      }
    }
    wasPosting.current = posting;
  }, [posting, navigation.state, previewSrc]);

  return (
    <div className="ed">
      {/* ------------------------------------------------------- top bar */}
      <div className="ed-bar">
        <Link
          to={`/admin/online-store?store=${store.slug}`}
          className="ed-glyph"
          title="Back to Online Store"
          aria-label="Back to Online Store"
        >
          <Glyph d="M12 4 6.5 10l5.5 6" />
        </Link>

        <span className="ed-store">
          <b>{store.name}</b>
          <span>{store.domain}</span>
        </span>

        <select
          className="ed-input"
          style={{ width: "auto", height: 32, padding: "0 10px" }}
          value="product"
          onChange={() => undefined}
          title="Only the product page is built. The other pages do not exist yet."
        >
          <option value="product">{page.title || "Product page"}</option>
          {OTHER_PAGES.map(([value, label]) => (
            <option key={value} value={value} disabled>
              {label} — not built yet
            </option>
          ))}
        </select>

        <div className="ed-bar-mid">
          <div className="ed-seg" role="group" aria-label="Preview size">
            {DEVICES.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={device === item.key}
                onClick={() => setParam("device", item.key)}
                title={item.title}
                aria-label={item.title}
              >
                <Glyph d={item.icon} />
              </button>
            ))}
          </div>

          <div className="ed-zoom">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}
              disabled={zoom <= 0.5}
              aria-label="Zoom out"
            >
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(1.5, Math.round((value + 0.1) * 10) / 10))}
              disabled={zoom >= 1.5}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        </div>

        <button
          type="button"
          className="ed-glyph"
          onClick={undo}
          disabled={!past.length}
          title="Undo"
          aria-label="Undo"
        >
          <Glyph d="M7 5 4 8l3 3M4 8h7.5A4 4 0 0 1 11.5 16H9" />
        </button>
        <button
          type="button"
          className="ed-glyph"
          onClick={redo}
          disabled={!future.length}
          title="Redo"
          aria-label="Redo"
        >
          <Glyph d="m13 5 3 3-3 3M16 8H8.5A4 4 0 0 0 8.5 16H11" />
        </button>

        <a className="ed-link" href={`/?store=${store.slug}`} target="_blank" rel="noreferrer">
          Preview
        </a>

        <button
          type="submit"
          form="section-form"
          className="ed-save"
          disabled={saving || !dirty}
          title={
            selected
              ? dirty
                ? undefined
                : "Nothing to save yet"
              : "Pick a section to edit before saving"
          }
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* ---------------------------------------------------- the columns */}
      <div className="ed-body">
        {/* SECTION LIST */}
        <div className="ed-panel ed-rail">
          <div className="ed-panel-head">
            <span>Sections</span>
            <span>
              {visibleCount} of {sections.length} showing
            </span>
          </div>

          <div className="ed-scroll">
            {sections.map((section) => {
              const sectionDef = SECTIONS.find((s) => s.type === section.type);
              const active = section.id === selectedId;
              return (
                <div
                  key={section.id}
                  className="ed-row"
                  data-active={active}
                  data-hidden={section.hidden}
                >
                  <button
                    type="button"
                    className="ed-row-name"
                    onClick={() => setParam("section", section.id)}
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
                      className="ed-eye"
                      title={section.hidden ? "Show on the page" : "Hide from the page"}
                      aria-label={section.hidden ? "Show section" : "Hide section"}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
                        <path d="M1.8 10S4.8 5.2 10 5.2s8.2 4.8 8.2 4.8-3 4.8-8.2 4.8S1.8 10 1.8 10z" />
                        <circle cx="10" cy="10" r="2.1" />
                        {section.hidden ? <path d="M3.4 16.6 16.6 3.4" /> : null}
                      </svg>
                    </button>
                  </Form>
                </div>
              );
            })}
          </div>

          <div className="ed-note">
            Fifteen sections, fixed order — written in code. You can hide one and change what it
            says. Moving, adding and deleting are not possible here, and that is what stops a
            layout being overwritten by accident.
          </div>
        </div>

        {/* PREVIEW */}
        <div className="ed-stage">
          <div
            className="ed-device"
            style={{
              maxWidth: deviceDef.width,
              transform: `scale(${zoom})`,
              height: "calc(100vh - 108px)",
            }}
          >
            <iframe
              ref={frameRef}
              src={previewSrc}
              onLoad={onFrameLoad}
              title="Storefront preview"
            />
          </div>
        </div>

        {/* INSPECTOR */}
        <div className="ed-panel ed-inspector" key={selectedId || "none"}>
          {!selected || !definition ? (
            <div className="ed-empty">
              Pick a section on the left, or click one in the preview, to change its words and
              pictures.
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
              mediaReady={mediaReady}
              focus={focus && focus.sectionId === selected.id ? focus : null}
              stale={stale}
              message={actionData && "ok" in actionData ? actionData.ok : undefined}
              error={actionData && "error" in actionData ? actionData.error : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ panel */

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
  mediaReady,
  focus,
  stale,
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
  mediaReady: boolean;
  focus: { field: string; blockId: string | null; nonce: number } | null;
  stale: boolean;
  message?: string;
  error?: string;
}) {
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

  const summaryOf = (row: BlockRow, index: number) => {
    const first = (definition.blocks?.fields ?? [])
      .map((field) => row.values[field.name])
      .find((value) => value && value.trim() && !value.startsWith("data:") && !value.startsWith("/"));
    return first ? first.slice(0, 30) : `${blockLabel} ${index + 1}`;
  };

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= draft.blocks.length) return;
    const next = [...draft.blocks];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved);
    apply({ ...draft, blocks: next });
    setOpenBlock(to);
  };

  return (
    <Form id="section-form" method="post" style={{ display: "contents" }}>
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="sectionId" value={section.id} />
      <input type="hidden" name="sectionType" value={section.type} />
      <input type="hidden" name="hidden" value={section.hidden ? "1" : "0"} />

      <div className="ed-panel-head">
        <span style={{ fontSize: 13, fontWeight: 590, color: "var(--ink)" }}>
          {definition.label}
        </span>
        {section.hidden ? <span>Hidden</span> : null}
      </div>

      <div className="ed-scroll">
        {definition.fields.map((field) => (
          <FieldRow
            key={field.name}
            field={field}
            value={draft.values[field.name] ?? ""}
            inputName={`field.${field.name}`}
            onChange={(next) => setField(field.name, next)}
            mediaReady={mediaReady}
            focusKey={
              focus && !focus.blockId && focus.field === field.name ? focus.nonce : undefined
            }
          />
        ))}

        {definition.externalSource === "reviews" ? (
          <div className="ed-field">
            <span className="ed-help">
              Reviews come from the Reviews screen, not from here — {reviews.published} published,{" "}
              {reviews.drafts} still drafts.{" "}
              <Link to={`/admin/reviews?store=${storeSlug}`} style={{ color: "var(--accent)" }}>
                Manage reviews
              </Link>
            </span>
          </div>
        ) : null}

        {definition.blocks ? (
          <>
            <div className="ed-panel-head" style={{ padding: "4px 18px 8px" }}>
              <span>{definition.blocks.label}s</span>
              <span>{draft.blocks.length}</span>
            </div>

            {section.type === "specifications" ? (
              <div className="ed-field" style={{ paddingBottom: 8 }}>
                <span className="ed-help">Empty values show as “Spec pending” on the live page.</span>
              </div>
            ) : null}

            {draft.blocks.map((row, index) => (
              <div className="ed-block" key={row.key}>
                <input type="hidden" name="blockId" value={row.id} />
                <div className="ed-block-head">
                  <button
                    type="button"
                    className="ed-block-name"
                    onClick={() => setOpenBlock(openBlock === index ? -1 : index)}
                  >
                    {summaryOf(row, index)}
                  </button>
                  <button
                    type="button"
                    className="ed-eye"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    title="Move up"
                    aria-label="Move up"
                  >
                    <Glyph d="M10 15V6M6 9.5 10 5.5l4 4" size={15} />
                  </button>
                  <button
                    type="button"
                    className="ed-eye"
                    onClick={() => move(index, 1)}
                    disabled={index === draft.blocks.length - 1}
                    title="Move down"
                    aria-label="Move down"
                  >
                    <Glyph d="M10 5v9M6 10.5l4 4 4-4" size={15} />
                  </button>
                  <button
                    type="button"
                    className="ed-eye"
                    onClick={() =>
                      apply({ ...draft, blocks: draft.blocks.filter((_, i) => i !== index) })
                    }
                    title={`Delete this ${blockLabel.toLowerCase()}`}
                    aria-label="Delete block"
                  >
                    <Glyph d="M5 7h10M8 7V5h4v2M6.5 7l.7 8h5.6l.7-8" size={15} />
                  </button>
                </div>

                {openBlock === index ? (
                  <div className="ed-block-body">
                    {definition.blocks!.fields.map((field) => (
                      <FieldRow
                        key={field.name}
                        field={field}
                        value={row.values[field.name] ?? ""}
                        inputName={`block.${field.name}`}
                        onChange={(next) => setBlockField(index, field.name, next)}
                        mediaReady={mediaReady}
                        compact
                        focusKey={
                          focus && focus.blockId === row.id && focus.field === field.name
                            ? focus.nonce
                            : undefined
                        }
                      />
                    ))}
                  </div>
                ) : (
                  // Hidden twins keep a collapsed block's values in the
                  // submission — the action reads them positionally.
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

            <div style={{ padding: "2px 8px 12px" }}>
              <button
                type="button"
                className="ed-add"
                onClick={() =>
                  apply({
                    ...draft,
                    blocks: [...draft.blocks, { key: `n${Date.now()}`, id: "", values: {} }],
                  })
                }
              >
                {definition.blocks.addLabel}
              </button>
            </div>
          </>
        ) : null}
      </div>

      {stale || message || error ? (
        <div className="ed-status">
          {/* The preview shows a patch of the saved page. A change that adds
              or removes something the saved page never drew cannot be patched
              in, so it says so rather than pretending it is showing. */}
          {stale ? (
            <span style={{ color: "var(--ink-3)" }}>
              Some of this shows in the preview only after you save.
            </span>
          ) : null}
          {message ? <span style={{ color: "#1c7c3c" }}>{message}</span> : null}
          {error ? <span style={{ color: "#d0021b" }}>{error}</span> : null}
        </div>
      ) : null}
    </Form>
  );
}

/* ------------------------------------------------------------------ fields */

function FieldRow({
  field,
  value,
  inputName,
  onChange,
  mediaReady,
  compact,
  focusKey,
}: {
  field: FieldDef;
  value: string;
  inputName: string;
  onChange: (next: string) => void;
  mediaReady: boolean;
  compact?: boolean;
  /** bumped when the preview was clicked on this field's value */
  focusKey?: number;
}) {
  // `trust_icons` declares its icon as an image field, and the storefront
  // renders it with <img src>. The named-glyph picker sits above it, disabled,
  // until the storefront reads the same list — see IconPicker.
  const isIcon = field.name === "icon";

  // Touching a value in the preview brings its field into view and puts the
  // cursor in it, so nothing has to be hunted for on the right.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusKey) return;
    const row = rowRef.current;
    if (!row) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    // Re-trigger the tint on every touch, not only the first.
    row.removeAttribute("data-touched");
    void row.offsetWidth;
    row.setAttribute("data-touched", "true");
    const input = row.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "input:not([type=hidden]), textarea",
    );
    if (input) {
      input.focus();
      if (typeof input.setSelectionRange === "function") {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    }
  }, [focusKey]);

  return (
    <div
      ref={rowRef}
      className="ed-field"
      style={compact ? { padding: "0 0 4px" } : undefined}
    >
      <span className="ed-label">{field.label}</span>

      {isIcon ? <IconPicker value={value} /> : null}

      {field.kind === "textarea" ? (
        <textarea
          className="ed-area"
          name={inputName}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={compact ? 2 : 3}
        />
      ) : field.kind === "image" || field.kind === "video" ? (
        <MediaField
          name={inputName}
          value={value}
          onChange={onChange}
          mediaReady={mediaReady}
          video={field.kind === "video"}
        />
      ) : (
        <input
          className="ed-input"
          name={inputName}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {field.help ? <span className="ed-help">{field.help}</span> : null}
    </div>
  );
}

/**
 * An image or video field: thumbnail, Replace, Remove.
 *
 * Replace is a real upload — the file goes into the R2 bucket bound as MEDIA
 * and the field is filled with its /media/:key address. When no bucket is
 * bound the button is disabled and says why, and the address can still be
 * typed by hand.
 */
function MediaField({
  name,
  value,
  onChange,
  mediaReady,
  video,
}: {
  name: string;
  value: string;
  onChange: (next: string) => void;
  mediaReady: boolean;
  video?: boolean;
}) {
  const fetcher = useFetcher<{ ok?: string; error?: string; url?: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [typing, setTyping] = useState(false);
  const applied = useRef<string | null>(null);

  const uploaded = fetcher.data?.url;
  useEffect(() => {
    if (uploaded && applied.current !== uploaded) {
      applied.current = uploaded;
      onChange(uploaded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploaded]);

  const fileName = useMemo(
    () => (value ? decodeURIComponent(value.split("/").pop() ?? value).slice(0, 26) : "Nothing chosen"),
    [value],
  );

  const uploading = fetcher.state !== "idle";

  return (
    <>
      <span className="ed-media">
        <span
          className="ed-thumb"
          style={
            value && !video ? { backgroundImage: `url("${value}")` } : undefined
          }
        >
          {value ? (video ? "Video" : "") : "Empty"}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {fileName}
          </span>
          <span className="ed-media-actions">
            <button
              type="button"
              className="ed-text-btn"
              disabled={!mediaReady || uploading}
              title={mediaReady ? undefined : "No media bucket is bound to this Worker yet."}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              className="ed-text-btn"
              data-tone="danger"
              disabled={!value}
              onClick={() => onChange("")}
            >
              Remove
            </button>
            <button type="button" className="ed-text-btn" onClick={() => setTyping((on) => !on)}>
              {typing ? "Done" : "Use an address"}
            </button>
          </span>
          {!mediaReady ? (
            <span className="ed-help" style={{ display: "block", marginTop: 2 }}>
              Uploading is off until the MEDIA bucket is bound. An https:// address still works.
            </span>
          ) : null}
          {fetcher.data?.error ? (
            <span className="ed-help" style={{ display: "block", color: "#d0021b" }}>
              {fetcher.data.error}
            </span>
          ) : null}
        </span>
      </span>

      <input
        ref={fileRef}
        type="file"
        accept={video ? "video/*" : "image/*"}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const body = new FormData();
          body.append("intent", "upload");
          body.append("file", file);
          void fetcher.submit(body, { method: "post", encType: "multipart/form-data" });
          event.target.value = "";
        }}
      />

      {typing ? (
        <input
          className="ed-input"
          name={name}
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://… or /media/…"
        />
      ) : (
        <input type="hidden" name={name} value={value} />
      )}
    </>
  );
}

/**
 * The icon picker — rendered disabled, on purpose.
 *
 * The glyph names live in `~/admin/section-icons`, which is meant to be the
 * one list both sides read. The storefront does not read it yet: every glyph
 * in `app/storefronts/**` is inline SVG chosen by position, and the only icon
 * field we have is declared as an image and rendered by garden-kneeler with
 * `<img src>`. Writing "shield" into it today would put a broken image on the
 * live page, so the grid shows what will be choosable and says why it is not
 * choosable yet, instead of saving a value nothing reads.
 */
function IconPicker({ value }: { value: string }) {
  return (
    <span style={{ display: "block" }}>
      <span
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 6,
          padding: 8,
          borderRadius: 14,
          background: "rgba(255,255,255,.55)",
          boxShadow: "inset 0 0 0 1px var(--hairline)",
          opacity: 0.55,
        }}
      >
        {SECTION_ICON_SET.map((icon) => (
          <span
            key={icon.name}
            title={icon.label}
            aria-disabled="true"
            style={{
              height: 38,
              display: "grid",
              placeItems: "center",
              borderRadius: 10,
              background: value === icon.name ? "var(--accent-soft)" : "transparent",
              color: value === icon.name ? "var(--accent)" : "var(--ink-2)",
            }}
          >
            <IconArt icon={icon} />
          </span>
        ))}
      </span>
      <span className="ed-help" style={{ display: "block", marginTop: 4 }}>
        Choosing a glyph is off: the storefront still draws these in code and does not read a
        name yet. Until it does, this field takes a picture.
      </span>
    </span>
  );
}

function IconArt({ icon }: { icon: IconDef }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon.paths.map((d) => (
        <path key={d} d={d} />
      ))}
      {(icon.circles ?? []).map((c) => (
        <circle key={`${c.cx}-${c.cy}`} cx={c.cx} cy={c.cy} r={c.r} />
      ))}
      {(icon.rects ?? []).map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.width} height={r.height} rx={r.rx} />
      ))}
    </svg>
  );
}
