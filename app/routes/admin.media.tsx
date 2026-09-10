/**
 * Media.
 *
 * Files live in Cloudflare R2 and this table holds what they are. Until an R2
 * bucket is bound to the Worker, uploads are refused with a clear reason
 * rather than half-working — a media library that loses files is worse than
 * one that says it is not ready.
 */
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/admin.media";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listMedia, addMedia, deleteMedia } from "~/lib/admin.server";
import { card, cardHeader, Empty, PageTitle, secondaryButton, criticalButton, input } from "~/admin/ui";

export function meta() {
  return [{ title: "Media — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, rows: [], storageReady: false };

  const rows = await listMedia(context.db, store.id);
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

export default function Media({ loaderData, actionData }: Route.ComponentProps) {
  const { store, rows, storageReady } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageTitle title={`Media · ${store.name}`} />

      {actionData?.error ? (
        <div style={{ background: "var(--b-critical-bg)", color: "var(--b-critical-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          {actionData.error}
        </div>
      ) : null}
      {actionData?.ok ? (
        <div style={{ background: "var(--b-success-bg)", color: "var(--b-success-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          {actionData.ok}
        </div>
      ) : null}

      {!storageReady ? (
        <div style={{ background: "var(--b-info-bg)", color: "var(--b-info-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: "19px" }}>
          File uploads need a Cloudflare R2 bucket, which is not connected yet. Until it is, paste
          the address of an image or video that is already online and it will show up in the editor's
          picture fields.
        </div>
      ) : null}

      <Form method="post" style={card}>
        <input type="hidden" name="intent" value="link" />
        <div style={cardHeader}>Add by address</div>
        <div style={{ padding: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="url" placeholder="https://…" style={{ ...input, flex: 1, minWidth: 240 }} />
          <input name="alt" placeholder="Alt text (describes the picture)" style={{ ...input, width: 260 }} />
          <button type="submit" disabled={busy} style={secondaryButton}>
            Add
          </button>
        </div>
      </Form>

      <Form method="post" style={card}>
        <div style={cardHeader}>
          <span>Library</span>
          <button type="submit" name="intent" value="delete" disabled={busy} style={criticalButton}>
            Delete selected
          </button>
        </div>

        {rows.length === 0 ? (
          <Empty title="Nothing here yet" help="Images and videos you add show up here and in the editor." />
        ) : (
          <div
            style={{
              padding: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))",
              gap: 12,
            }}
          >
            {rows.map((item) => (
              <label
                key={item.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "var(--bg)",
                  cursor: "pointer",
                  display: "block",
                }}
              >
                <span
                  style={{
                    display: "block",
                    aspectRatio: "1",
                    backgroundImage: `url(${item.key})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <span style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--surface)" }}>
                  <input
                    type="checkbox"
                    name="mediaId"
                    value={item.id}
                    style={{ width: 15, height: 15, accentColor: "var(--focus)" }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={item.filename}
                  >
                    {item.filename}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </Form>
    </div>
  );
}
