/**
 * Media.
 *
 * Files live in Cloudflare R2 and this table holds what they are. Until an R2
 * bucket is bound to the Worker, uploads are refused with a clear reason
 * rather than half-working — a media library that loses files is worse than
 * one that says it is not ready.
 */
import { useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin.media";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listMedia, addMedia, deleteMedia } from "~/lib/admin.server";
import { pages, sections, blocks } from "~/db/schema";
import { card, Empty } from "~/admin/ui";

export function meta() {
  return [{ title: "Media — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, rows: [], storageReady: false };

  const rows = await listMedia(context.db, store.id);

  /**
   * "used in n" is counted, not guessed: every section and block belonging to
   * this store's pages is searched for the file's address.
   */
  const sectionRows = await context.db
    .select({ values: sections.values })
    .from(sections)
    .innerJoin(pages, eq(sections.pageId, pages.id))
    .where(eq(pages.storeId, store.id));

  const blockRows = await context.db
    .select({ values: blocks.values })
    .from(blocks)
    .innerJoin(sections, eq(blocks.sectionId, sections.id))
    .innerJoin(pages, eq(sections.pageId, pages.id))
    .where(eq(pages.storeId, store.id));

  const haystacks = [...sectionRows, ...blockRows].map((row) => JSON.stringify(row.values ?? {}));
  const usedIn = (key: string) =>
    key ? haystacks.reduce((count, text) => (text.includes(key) ? count + 1 : count), 0) : 0;

  return {
    store: { slug: store.slug, name: store.name },
    // The R2 binding is added to wrangler.jsonc when the bucket exists.
    storageReady: "MEDIA" in context.cloudflare.env,
    rows: rows.map((row) => ({
      id: row.id,
      key: row.key,
      filename: row.filename,
      mime: row.mime,
      sizeBytes: row.sizeBytes,
      alt: row.alt ?? "",
      used: usedIn(row.key),
      createdAt: row.createdAt,
    })),
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };

  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "link") {
    // Until R2 is bound, an image already on the internet can still be
    // recorded here so the editor's image fields have somewhere to point.
    const link = String(form.get("url") || "").trim();
    if (!link) return { error: "Paste the image or video address first." };
    if (!/^https:\/\//i.test(link)) return { error: "Use a full https:// address." };

    const filename = link.split("/").pop()?.split("?")[0] || "file";
    await addMedia(context.db, store.id, {
      key: link,
      filename,
      mime: /\.(mp4|webm|mov)$/i.test(filename) ? "video/mp4" : "image/*",
      sizeBytes: 0,
      alt: String(form.get("alt") || "").trim() || null,
    });
    return { ok: "Added." };
  }

  if (intent === "delete") {
    await deleteMedia(context.db, form.getAll("mediaId").map(String));
    return { ok: "Deleted." };
  }

  return { error: "Unknown action." };
}

function fileSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const viewButton = (active: boolean): React.CSSProperties => ({
  height: 24,
  padding: "0 10px",
  borderRadius: 6,
  border: 0,
  background: active ? "var(--accent-soft)" : "transparent",
  color: "var(--ink)",
  fontSize: 12,
  fontWeight: 550,
  cursor: "pointer",
});

export default function Media({ loaderData }: Route.ComponentProps) {
  const { store, rows, storageReady } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");

  const shown = useMemo(
    () => rows.filter((row) => !query || row.filename.toLowerCase().includes(query.toLowerCase())),
    [rows, query],
  );

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const result = fetcher.data as { ok?: string; error?: string } | undefined;

  function copy(value: string) {
    void navigator.clipboard?.writeText(value);
  }

  function remove(id: string, filename: string, usedCount: number) {
    if (
      !window.confirm(
        usedCount
          ? `Delete ${filename}? It is used in ${usedCount} place(s) and will break there.`
          : `Delete ${filename}? This cannot be undone.`,
      )
    )
      return;
    const body = new FormData();
    body.append("intent", "delete");
    body.append("mediaId", id);
    fetcher.submit(body, { method: "post" });
  }

  const used = (n: number) => `${n} place${n === 1 ? "" : "s"}`;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Media</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              gap: 2,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 9,
              padding: 3,
            }}
          >
            <button onClick={() => setView("grid")} style={viewButton(view === "grid")}>
              Grid
            </button>
            <button onClick={() => setView("list")} style={viewButton(view === "list")}>
              List
            </button>
          </div>
          {/*
            Rule 2: there is no R2 bucket bound, so Upload is rendered visibly
            disabled with the reason beside it rather than as a button that
            appears to take a file and drops it.
          */}
          <span
            aria-disabled
            title="File uploads need a Cloudflare R2 bucket, which is not connected yet."
            style={{
              height: 28,
              padding: "0 12px",
              borderRadius: 8,
              border: 0,
              background: "var(--accent)",
              color: "var(--accent-ink)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "not-allowed",
              opacity: 0.45,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Upload
          </span>
        </div>
      </div>

      {result?.error ? (
        <div style={{ background: "var(--b-critical-bg)", color: "var(--b-critical-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          {result.error}
        </div>
      ) : null}
      {result?.ok ? (
        <div style={{ background: "var(--b-success-bg)", color: "var(--b-success-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          {result.ok}
        </div>
      ) : null}

      {/*
        The dropzone keeps the design's markup but is inert: no bucket, no
        upload. The working path — recording a file that is already online —
        lives inside it.
      */}
      <div
        aria-disabled={!storageReady}
        style={{
          border: "1px dashed var(--border-strong)",
          borderRadius: 12,
          background: "var(--surface)",
          padding: 22,
          textAlign: "center",
          color: "var(--ink-2)",
          cursor: storageReady ? "pointer" : "not-allowed",
          display: "block",
          opacity: storageReady ? 1 : 0.6,
        }}
      >
        <div style={{ fontWeight: 600, color: "var(--ink)" }}>Drop images or video here</div>
        <div style={{ fontSize: 12 }}>
          {storageReady
            ? "or click to choose · PNG, JPG, WEBP, MP4"
            : "Uploads are off: no Cloudflare R2 bucket is connected to this Worker yet. Paste the address of a file that is already online instead."}
        </div>
      </div>

      <fetcher.Form
        method="post"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow)",
          padding: "8px 12px",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <input type="hidden" name="intent" value="link" />
        <input
          name="url"
          placeholder="https://…"
          style={{
            flex: 1,
            minWidth: 240,
            height: 32,
            padding: "0 12px",
            borderRadius: 8,
            border: "1px solid var(--input-border)",
            background: "var(--input)",
            fontSize: 13,
          }}
        />
        <input
          name="alt"
          placeholder="Alt text (describes the picture)"
          style={{
            width: 260,
            height: 32,
            padding: "0 12px",
            borderRadius: 8,
            border: "1px solid var(--input-border)",
            background: "var(--input)",
            fontSize: 13,
          }}
        />
        <button
          type="submit"
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontSize: 12,
            fontWeight: 550,
            cursor: "pointer",
          }}
        >
          Add by address
        </button>
      </fetcher.Form>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files"
            style={{
              width: "100%",
              height: 32,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid var(--input-border)",
              background: "var(--input)",
              fontSize: 13,
            }}
          />
        </div>

        {shown.length === 0 ? (
          <div
            style={{
              padding: "52px 16px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div style={{ fontWeight: 650 }}>{rows.length ? "Nothing matches" : "Your library is empty"}</div>
            <div style={{ color: "var(--ink-2)", maxWidth: 360 }}>
              {rows.length
                ? "Try another search."
                : "Add a file by its address above. Products and the theme editor pick from here."}
            </div>
          </div>
        ) : null}

        {view === "grid" && shown.length > 0 ? (
          <div
            style={{
              padding: "14px 16px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
              gap: 12,
            }}
          >
            {shown.map((file) => (
              <div
                key={file.id}
                style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}
              >
                <span
                  style={{
                    display: "block",
                    aspectRatio: "1",
                    backgroundImage: `url("${file.key}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <span
                  style={{ display: "flex", flexDirection: "column", gap: 1, padding: "8px 10px", background: "var(--surface)" }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 550,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {file.filename}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ink-2)" }}>
                    {fileSize(file.sizeBytes)} · used in {used(file.used)}
                  </span>
                  <span style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button
                      onClick={() => copy(file.key)}
                      style={{
                        flex: 1,
                        height: 24,
                        borderRadius: 7,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--ink)",
                        fontSize: 11,
                        fontWeight: 550,
                        cursor: "pointer",
                      }}
                    >
                      Copy URL
                    </button>
                    <button
                      onClick={() => remove(file.id, file.filename, file.used)}
                      style={{
                        width: 26,
                        height: 24,
                        borderRadius: 7,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--critical)",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {view === "list" && shown.length > 0
          ? shown.map((file) => (
              <div
                key={file.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg)",
                    backgroundImage: `url("${file.key}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    flex: "none",
                  }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontWeight: 550,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {file.filename}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>
                    {fileSize(file.sizeBytes)} · {file.mime} · used in {used(file.used)}
                  </span>
                </span>
                <button
                  onClick={() => copy(file.key)}
                  style={{
                    height: 26,
                    padding: "0 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 550,
                    cursor: "pointer",
                  }}
                >
                  Copy URL
                </button>
                <button
                  onClick={() => remove(file.id, file.filename, file.used)}
                  style={{
                    height: 26,
                    padding: "0 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--critical)",
                    fontSize: 12,
                    fontWeight: 550,
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
