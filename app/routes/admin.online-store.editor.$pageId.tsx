/**
 * The theme editor.
 *
 * Three columns: the fifteen sections, the fields of the one you picked, and a
 * live preview of the real storefront in an iframe — desktop or phone width.
 *
 * The preview is the actual page, not a drawing of it. A mock preview that
 * drifts from the real page is worse than no preview, because it teaches you
 * to trust the wrong thing.
 *
 * The section list can hide a section and nothing else. There is no reorder
 * handle and no add button, because type and position are written in code.
 */
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/admin.online-store.editor.$pageId";
import { requireUser } from "~/lib/auth.server";
import { loadPageWithSections, saveSection, resolveAdminStore } from "~/lib/admin.server";
import { SECTIONS, type SectionDef } from "~/lib/sections";
import { input, textarea, primaryButton, secondaryButton } from "~/admin/ui";

export function meta() {
  return [{ title: "Customize — Shop Admin" }];
}

export async function loader({ context, request, params }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  const loaded = await loadPageWithSections(context.db, params.pageId);
  if (!loaded || !store) throw new Response("Page not found", { status: 404 });

  return {
    store: { slug: store.slug, name: store.name },
    page: { id: loaded.page.id, title: loaded.page.title },
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

const DEVICES = {
  desktop: { label: "Desktop", width: "100%" },
  mobile: { label: "Phone", width: "390px" },
} as const;

export default function ThemeEditor({ loaderData, actionData }: Route.ComponentProps) {
  const { store, page, sections } = loaderData;
  const [params, setParams] = useSearchParams();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const selectedId = params.get("section") || sections[0]?.id;
  const selected = sections.find((section) => section.id === selectedId) ?? sections[0];
  const definition = SECTIONS.find((s) => s.type === selected?.type);

  const device = (params.get("device") as keyof typeof DEVICES) || "desktop";
  const visibleCount = sections.filter((section) => !section.hidden).length;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { preventScrollReset: true });
  };

  // The preview is the real storefront, told which theme and to draw hidden
  // sections too so the editor and the page cannot disagree.
  const previewSrc = `/?store=${store.slug}&preview=${page.id}&t=${navigation.state}`;

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
            background: "rgba(255,255,255,.1)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            flex: "none",
            textDecoration: "none",
          }}
        >
          ←
        </Link>
        <span
          style={{
            fontWeight: 650,
            fontSize: 13,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 220,
          }}
        >
          {page.title}
        </span>

        <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.08)", borderRadius: 8, padding: 3 }}>
            {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map((key) => (
              <button
                key={key}
                onClick={() => setParam("device", key)}
                style={{
                  height: 22,
                  padding: "0 10px",
                  borderRadius: 6,
                  border: 0,
                  background: device === key ? "rgba(255,255,255,.22)" : "transparent",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {DEVICES[key].label}
              </button>
            ))}
          </div>
        </div>

        <a
          href={`/?store=${store.slug}`}
          target="_blank"
          rel="noreferrer"
          style={{
            height: 28,
            padding: "0 10px",
            borderRadius: 8,
            color: "#fff",
            fontSize: 12,
            fontWeight: 550,
            display: "inline-flex",
            alignItems: "center",
            textDecoration: "none",
            flex: "none",
          }}
        >
          View live
        </a>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div
          style={{
            width: 260,
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
            const active = section.id === selected?.id;
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
                  background: active ? "var(--sel)" : "transparent",
                  borderLeft: `2px solid ${active ? "var(--focus)" : "transparent"}`,
                }}
              >
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
                    fontWeight: active ? 650 : 500,
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
                    title={section.hidden ? "Show this section" : "Hide this section"}
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

        <div
          style={{
            width: 380,
            flex: "none",
            background: "var(--surface)",
            borderRight: "1px solid var(--border)",
            overflow: "auto",
            minHeight: 0,
          }}
        >
          {selected && definition ? (
            <SectionForm
              key={selected.id}
              pageId={page.id}
              section={selected}
              definition={definition}
              busy={busy}
              message={actionData?.ok}
              error={actionData?.error}
            />
          ) : (
            <div style={{ padding: 16, color: "var(--ink-2)" }}>Pick a section on the left.</div>
          )}
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
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
              maxWidth: DEVICES[device].width,
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
              src={previewSrc}
              title="Storefront preview"
              style={{ width: "100%", height: "100%", border: 0, display: "block" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface SectionState {
  id: string;
  type: string;
  hidden: boolean;
  values: Record<string, string>;
  blocks: { id: string; values: Record<string, string> }[];
}

function SectionForm({
  pageId,
  section,
  definition,
  busy,
  message,
  error,
}: {
  pageId: string;
  section: SectionState;
  definition: SectionDef;
  busy: boolean;
  message?: string;
  error?: string;
}) {
  const [blockRows, setBlockRows] = useState(() =>
    section.blocks.map((block, index) => ({ key: `b${index}`, id: block.id, values: block.values })),
  );

  return (
    <Form method="post" style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="sectionId" value={section.id} />
      <input type="hidden" name="sectionType" value={section.type} />
      <input type="hidden" name="hidden" value={section.hidden ? "1" : "0"} />

      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontWeight: 650 }}>{definition.label}</div>
        <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{definition.hint}</div>
      </div>

      {definition.externalSource === "reviews" ? (
        <div style={{ padding: 14, color: "var(--ink-2)", fontSize: 13, lineHeight: "19px" }}>
          This section renders from the Reviews screen, so there is one source of truth and nothing
          here can invent a review. Edit them under Reviews.
        </div>
      ) : null}

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {definition.fields.map((field) => (
          <label key={field.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>{field.label}</span>
            {field.kind === "textarea" ? (
              <textarea
                name={`field.${field.name}`}
                defaultValue={section.values[field.name] ?? ""}
                rows={4}
                style={textarea}
              />
            ) : (
              <input
                name={`field.${field.name}`}
                defaultValue={section.values[field.name] ?? ""}
                placeholder={field.kind === "image" ? "https://… or a media URL" : ""}
                style={input}
              />
            )}
            {field.help ? (
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{field.help}</span>
            ) : null}
          </label>
        ))}
      </div>

      {definition.blocks ? (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div
            style={{
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 650, fontSize: 13 }}>{definition.blocks.label}s</span>
            <button
              type="button"
              onClick={() =>
                setBlockRows((rows) => [...rows, { key: `n${Date.now()}`, id: "", values: {} }])
              }
              style={secondaryButton}
            >
              {definition.blocks.addLabel}
            </button>
          </div>

          {blockRows.length === 0 ? (
            <div style={{ padding: "0 14px 14px", color: "var(--ink-2)", fontSize: 12 }}>
              None yet. An empty section is skipped on the live page rather than filled with
              placeholder text.
            </div>
          ) : null}

          {blockRows.map((row, index) => (
            <div
              key={row.key}
              style={{
                padding: 14,
                borderTop: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                background: "var(--bg)",
              }}
            >
              <input type="hidden" name="blockId" value={row.id} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>
                  {definition.blocks!.label} {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setBlockRows((rows) => rows.filter((_, i) => i !== index))}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "var(--critical)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Remove
                </button>
              </div>
              {definition.blocks!.fields.map((field) => (
                <label key={field.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>
                    {field.label}
                  </span>
                  {field.kind === "textarea" ? (
                    <textarea
                      name={`block.${field.name}`}
                      defaultValue={row.values[field.name] ?? ""}
                      rows={3}
                      style={textarea}
                    />
                  ) : (
                    <input
                      name={`block.${field.name}`}
                      defaultValue={row.values[field.name] ?? ""}
                      style={input}
                    />
                  )}
                </label>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          marginTop: "auto",
          padding: 14,
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          position: "sticky",
          bottom: 0,
          background: "var(--surface)",
        }}
      >
        <button type="submit" disabled={busy} style={primaryButton}>
          {busy ? "Saving…" : "Save section"}
        </button>
        {message ? (
          <span style={{ color: "var(--b-success-fg)", fontSize: 12, fontWeight: 550 }}>{message}</span>
        ) : null}
        {error ? (
          <span style={{ color: "var(--critical)", fontSize: 12, fontWeight: 550 }}>{error}</span>
        ) : null}
      </div>
    </Form>
  );
}
