/**
 * Reviews.
 *
 * Nothing here generates a review, and nothing publishes one whose source has
 * not been declared. That refusal is enforced in the database layer, not just
 * hidden in the UI, so it holds however the row got there — including rows
 * that arrive through the CSV importer below.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/admin.reviews";
import { requireUser } from "~/lib/auth.server";
import {
  resolveAdminStore,
  listReviews,
  reviewStats,
  createReview,
  updateReview,
  deleteReviews,
  publishReviews,
  listProducts,
} from "~/lib/admin.server";
import { card, Empty } from "~/admin/ui";
import { parseCsv, guessMapping, IMPORT_TARGETS } from "~/admin/review-csv";

export function meta() {
  return [{ title: "Reviews — Shop Admin" }];
}

/**
 * The two declarations a review may carry. The stored value is the database's
 * own vocabulary; the label is the design's.
 */
const SOURCES = [
  { value: "customer", label: "From my customers" },
  { value: "supplier_listing", label: "Imported from supplier listing" },
];

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, rows: [], stats: null, products: [] };

  const [rows, stats, productEntries] = await Promise.all([
    listReviews(context.db, store.id),
    reviewStats(context.db, store.id),
    listProducts(context.db, store.id),
  ]);

  return {
    store: { slug: store.slug, name: store.name },
    stats,
    products: productEntries.map((entry) => ({ id: entry.product.id, title: entry.product.title })),
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      rating: row.rating,
      title: row.title ?? "",
      body: row.body,
      country: row.country ?? "",
      imageUrl: row.imageUrl ?? "",
      verified: row.verified,
      source: row.source ?? "",
      published: row.published,
      productId: row.productId ?? "",
      reviewedOn: row.reviewedOn ? new Date(row.reviewedOn).toISOString().slice(0, 10) : "",
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
  const ids = form.getAll("reviewId").map(String);

  if (intent === "add") {
    // The design's "Add review" drops an empty row in to be filled in. It has
    // no source, so it cannot be published until one is chosen.
    await createReview(context.db, store.id, {
      name: String(form.get("name") || "").trim(),
      rating: 5,
      title: null,
      body: "",
      country: null,
      imageUrl: null,
      verified: false,
      source: "",
      productId: null,
      reviewedOn: null,
    });
    return { ok: "Blank review added — fill it in and choose a source." };
  }

  if (intent === "update") {
    const id = String(form.get("id"));
    const patch: Record<string, unknown> = {};
    if (form.has("title")) patch.title = String(form.get("title") || "").trim() || null;
    if (form.has("body")) patch.body = String(form.get("body") || "");
    if (form.has("source")) {
      const source = String(form.get("source") || "");
      patch.source = source;
      // Taking the declaration away takes the review off the page with it.
      if (!source) patch.published = false;
    }
    await updateReview(context.db, id, patch as never);
    return { ok: "Saved." };
  }

  if (intent === "reassign") {
    const productId = String(form.get("productId") || "") || null;
    await Promise.all(ids.map((id) => updateReview(context.db, id, { productId })));
    return { ok: `${ids.length} moved.` };
  }

  if (intent === "reorder") {
    const ordered = form.getAll("orderedId").map(String);
    await Promise.all(ordered.map((id, index) => updateReview(context.db, id, { position: index })));
    return { ok: "Order saved." };
  }

  if (intent === "publish" || intent === "unpublish") {
    const result = await publishReviews(context.db, ids, intent === "publish");
    if (result.refused.length) {
      return {
        error: `Not published: ${result.refused.join(", ")}. Choose a source first — a review with no declared source never goes on the page.`,
      };
    }
    return { ok: intent === "publish" ? `${result.changed} published.` : `${result.changed} unpublished.` };
  }

  if (intent === "delete") {
    await deleteReviews(context.db, ids);
    return { ok: `${ids.length} deleted.` };
  }

  if (intent === "import") {
    const source = String(form.get("source") || "");
    if (!source) {
      // The one refusal that matters. A row with no declared source is never
      // written, so it can never later be published by accident.
      return { error: "Choose a source first — every review must say where it came from." };
    }
    if (!SOURCES.some((entry) => entry.value === source)) {
      return { error: "That is not a source this understands." };
    }

    const text = String(form.get("csv") || "");
    if (!text.trim()) return { error: "That file had nothing in it." };

    let mapping: Record<string, string> = {};
    try {
      mapping = JSON.parse(String(form.get("map") || "{}")) as Record<string, string>;
    } catch {
      return { error: "The column mapping did not come through. Try the import again." };
    }

    const productId = String(form.get("productId") || "") || null;
    const { headers, rows } = parseCsv(text);
    const columnOf: Record<string, number> = {};
    headers.forEach((header, index) => {
      const target = mapping[header];
      if (target) columnOf[target] = index;
    });

    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      const at = (target: string) => {
        const index = columnOf[target];
        return index === undefined ? "" : (row[index] ?? "").trim();
      };

      const title = at("title");
      const body = at("body");
      // The prototype's own rule: a row with neither a title nor a body is
      // not a review.
      if (!title && !body) {
        skipped++;
        continue;
      }

      const rating = Math.min(5, Math.max(1, Math.round(Number(at("rating")) || 5)));
      const date = at("date");
      const parsedDate = date ? new Date(date) : null;

      await createReview(context.db, store.id, {
        name: at("name"),
        rating,
        title: title || null,
        body,
        country: at("country") || null,
        imageUrl: at("image") || null,
        verified: /^(true|yes|1)$/i.test(at("verified")),
        source,
        productId,
        reviewedOn: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
      });
      imported++;
    }

    const label = SOURCES.find((entry) => entry.value === source)?.label ?? source;
    return {
      imported,
      skipped,
      summary:
        `${imported} imported as unpublished, marked “${label}”. ` +
        (skipped ? `${skipped} rows had no title or body and were skipped. ` : "") +
        "Review them and publish when you are ready.",
    };
  }

  return { error: "Unknown action." };
}

function stars(rating: number): string {
  return "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);
}

/** The prototype swaps two column templates at these widths. */
function useNarrow(maxWidth: number): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width:${maxWidth - 1}px)`);
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [maxWidth]);
  return narrow;
}

const chip: React.CSSProperties = {
  height: 28,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 12,
  fontWeight: 550,
  cursor: "pointer",
};

const selectStyle: React.CSSProperties = {
  height: 32,
  borderRadius: 8,
  border: "1px solid var(--input-border)",
  background: "var(--input)",
  padding: "0 8px",
  fontSize: 13,
  color: "var(--ink)",
};

const bulkButton: React.CSSProperties = {
  height: 26,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 12,
  fontWeight: 550,
  cursor: "pointer",
};

const inlineField: React.CSSProperties = {
  height: 28,
  padding: "0 8px",
  borderRadius: 7,
  border: "1px solid transparent",
  background: "transparent",
};

export default function Reviews({ loaderData }: Route.ComponentProps) {
  const { store, rows, stats, products } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const isMobile = useNarrow(760);
  const isNarrowRow = useNarrow(1180);

  const [query, setQuery] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fRating, setFRating] = useState("");
  const [fState, setFState] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [order, setOrder] = useState<string[]>(() => rows.map((row) => row.id));
  const [importOpen, setImportOpen] = useState(false);
  const dragFrom = useRef<number | null>(null);

  useEffect(() => {
    setOrder(rows.map((row) => row.id));
  }, [rows]);

  const productName = useMemo(() => {
    const map = new Map(products.map((product) => [product.id, product.title]));
    return (id: string) => map.get(id) ?? "";
  }, [products]);

  const ordered = useMemo(() => {
    const at = new Map(order.map((id, index) => [id, index]));
    return [...rows].sort((a, b) => (at.get(a.id) ?? 1e9) - (at.get(b.id) ?? 1e9));
  }, [rows, order]);

  const visible = ordered.filter((row) => {
    const text = `${row.name} ${row.title} ${row.body}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (fProduct && row.productId !== fProduct) return false;
    if (fRating && row.rating !== Number(fRating)) return false;
    if (fState === "published" && !row.published) return false;
    if (fState === "hidden" && row.published) return false;
    if (fState === "photo" && !row.imageUrl) return false;
    return true;
  });

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  function submit(fields: Record<string, string>, ids: string[] = []) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    for (const id of ids) body.append("reviewId", id);
    fetcher.submit(body, { method: "post" });
  }

  function exportCsv() {
    const head = ["name", "rating", "title", "body", "date", "country", "image", "verified", "source", "published"];
    const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [head.join(",")];
    for (const row of ordered) {
      lines.push(
        [
          row.name,
          String(row.rating),
          row.title,
          row.body,
          row.reviewedOn,
          row.country,
          row.imageUrl,
          row.verified ? "true" : "false",
          row.source,
          row.published ? "true" : "false",
        ]
          .map(cell)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "reviews.csv";
    link.click();
    URL.revokeObjectURL(href);
  }

  if (!store || !stats) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const result = fetcher.data as
    | { ok?: string; error?: string; imported?: number; skipped?: number; summary?: string }
    | undefined;

  const total = stats.total;
  const photoPct = total ? `${Math.round((stats.withPhotos / total) * 100)}%` : "0%";

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Reviews · {store.name}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={exportCsv} style={chip}>
            Export CSV
          </button>
          <button onClick={() => submit({ intent: "add" })} style={chip}>
            Add review
          </button>
          <button
            onClick={() => setImportOpen(true)}
            style={{
              height: 28,
              padding: "0 12px",
              borderRadius: 8,
              border: 0,
              background: "var(--accent)",
              color: "var(--accent-ink)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Import reviews
          </button>
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

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow)",
          padding: "14px 16px",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "150px 120px 120px minmax(0,1fr)",
          gap: 16,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 550 }}>Average rating</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
              {total ? stats.average.toFixed(1) : "—"}
            </span>
            <span style={{ color: "var(--ink-3)" }}>/ 5</span>
          </div>
          <div style={{ color: "#F5A623", letterSpacing: 2 }}>
            {total ? stars(Math.round(stats.average)) : "☆☆☆☆☆"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 550 }}>Total reviews</div>
          <div style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
            {total}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 550 }}>With photos</div>
          <div style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
            {photoPct}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {stats.distribution.map((entry) => (
            <span key={entry.star} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ width: 28, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{entry.star}★</span>
              <span style={{ flex: 1, height: 6, borderRadius: 4, background: "#F2F1F5", overflow: "hidden" }}>
                <span
                  style={{
                    display: "block",
                    height: 6,
                    width: total ? `${Math.round((entry.count / total) * 100)}%` : "0%",
                    background: "#F5A623",
                    borderRadius: 4,
                  }}
                />
              </span>
              <span style={{ width: 26, textAlign: "right", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                {entry.count}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            flexWrap: "wrap",
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search review text"
            style={{
              flex: 1,
              minWidth: 170,
              height: 32,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid var(--input-border)",
              background: "var(--input)",
              fontSize: 13,
            }}
          />
          <select value={fProduct} onChange={(event) => setFProduct(event.target.value)} style={selectStyle}>
            <option value="">Any product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.title}
              </option>
            ))}
          </select>
          <select value={fRating} onChange={(event) => setFRating(event.target.value)} style={selectStyle}>
            <option value="">Any rating</option>
            <option value="5">5 stars</option>
            <option value="4">4 stars</option>
            <option value="3">3 stars</option>
            <option value="2">2 stars</option>
            <option value="1">1 star</option>
          </select>
          <select value={fState} onChange={(event) => setFState(event.target.value)} style={selectStyle}>
            <option value="">Any status</option>
            <option value="published">Published</option>
            <option value="hidden">Unpublished</option>
            <option value="photo">Has photo</option>
          </select>
        </div>

        {selectedIds.length > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              background: "var(--accent-soft)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 600 }}>{selectedIds.length} selected</span>
            <button onClick={() => submit({ intent: "publish" }, selectedIds)} style={bulkButton}>
              Publish
            </button>
            <button onClick={() => submit({ intent: "unpublish" }, selectedIds)} style={bulkButton}>
              Unpublish
            </button>
            <select
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                submit({ intent: "reassign", productId: event.target.value }, selectedIds);
                setSelected({});
              }}
              style={{
                height: 26,
                borderRadius: 8,
                border: "1px solid var(--input-border)",
                background: "var(--input)",
                padding: "0 6px",
                fontSize: 12,
                color: "var(--ink)",
              }}
            >
              <option value="">Reassign to…</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!window.confirm(`Delete ${selectedIds.length} reviews? This cannot be undone.`)) return;
                submit({ intent: "delete" }, selectedIds);
                setSelected({});
              }}
              style={{ ...bulkButton, color: "var(--critical)" }}
            >
              Delete
            </button>
            <button
              onClick={() => setSelected({})}
              style={{
                marginLeft: "auto",
                height: 26,
                padding: "0 8px",
                border: 0,
                background: "transparent",
                color: "var(--ink-2)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
        ) : null}

        {visible.length === 0 ? (
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
            <div style={{ fontWeight: 650 }}>{rows.length ? "No reviews match" : "No reviews yet"}</div>
            <div style={{ color: "var(--ink-2)", maxWidth: 400 }}>
              {rows.length
                ? "Try a different search or clear the filters."
                : "Import a CSV from your old review app, or add one by hand. Nothing is ever generated for you."}
            </div>
          </div>
        ) : null}

        {visible.map((row, index) => (
          <div
            key={row.id}
            style={{
              display: "grid",
              gridTemplateColumns: isNarrowRow
                ? "40px 40px minmax(140px,1fr) 84px minmax(150px,180px) 62px"
                : "52px 44px minmax(240px,2fr) minmax(110px,auto) minmax(160px,auto) 74px",
              gap: 10,
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              background: selected[row.id] ? "var(--accent-soft)" : "transparent",
              overflow: "hidden",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                checked={Boolean(selected[row.id])}
                onChange={() => setSelected((current) => ({ ...current, [row.id]: !current[row.id] }))}
                style={{ width: 16, height: 16, accentColor: "var(--focus)", cursor: "pointer" }}
              />
              <span
                draggable
                onDragStart={() => {
                  dragFrom.current = index;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = dragFrom.current;
                  dragFrom.current = null;
                  if (from === null || from === index) return;
                  const next = ordered.map((entry) => entry.id);
                  const fromId = visible[from].id;
                  const toId = row.id;
                  next.splice(next.indexOf(fromId), 1);
                  next.splice(next.indexOf(toId), 0, fromId);
                  setOrder(next);
                  const body = new FormData();
                  body.append("intent", "reorder");
                  for (const id of next) body.append("orderedId", id);
                  fetcher.submit(body, { method: "post" });
                }}
                title="Drag to reorder"
                style={{ cursor: "grab", color: "var(--ink-3)" }}
              >
                ⠿
              </span>
            </span>

            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                border: "1px solid var(--border)",
                backgroundColor: "var(--bg)",
                backgroundImage: row.imageUrl ? `url("${row.imageUrl}")` : "none",
                backgroundSize: "cover",
                backgroundPosition: "center",
                display: "grid",
                placeItems: "center",
                color: "var(--ink-3)",
                fontSize: 11,
              }}
            >
              {row.imageUrl ? "" : "No photo"}
            </span>

            <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>{row.name}</span>
                <span style={{ color: "#F5A623", letterSpacing: 1 }}>{stars(row.rating)}</span>
                {row.verified ? (
                  <span
                    style={{
                      height: 18,
                      padding: "0 6px",
                      borderRadius: 6,
                      background: "var(--b-success-bg)",
                      color: "var(--b-success-fg)",
                      fontSize: 11,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    Verified
                  </span>
                ) : null}
              </span>
              <input
                key={`t-${row.id}-${row.title}`}
                defaultValue={row.title}
                onBlur={(event) => {
                  if (event.target.value === row.title) return;
                  submit({ intent: "update", id: row.id, title: event.target.value });
                }}
                placeholder="Review title"
                className="k-hover"
                style={{ ...inlineField, fontSize: 13, fontWeight: 550, color: "var(--ink)" }}
              />
              <input
                key={`b-${row.id}-${row.body}`}
                defaultValue={row.body}
                onBlur={(event) => {
                  if (event.target.value === row.body) return;
                  submit({ intent: "update", id: row.id, body: event.target.value });
                }}
                placeholder="Review body"
                className="k-hover"
                style={{ ...inlineField, fontSize: 12, color: "var(--ink-2)" }}
              />
            </span>

            <span style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: "var(--ink-2)" }}>
              <span>{row.reviewedOn || "—"}</span>
              <span>{row.country || "—"}</span>
              <span>{productName(row.productId) || "—"}</span>
            </span>

            <span
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                alignItems: "stretch",
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <select
                value={row.source}
                onChange={(event) => submit({ intent: "update", id: row.id, source: event.target.value })}
                style={{
                  height: 28,
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  borderRadius: 8,
                  border: `1px solid ${row.source ? "var(--input-border)" : "var(--critical)"}`,
                  background: "var(--input)",
                  padding: "0 6px",
                  fontSize: 12,
                  color: "var(--ink)",
                }}
              >
                <option value="">Choose source…</option>
                {SOURCES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
              {!row.source ? (
                <span style={{ fontSize: 11, color: "var(--critical)", fontWeight: 600 }}>
                  Source required before publishing
                </span>
              ) : null}
            </span>

            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => submit({ intent: row.published ? "unpublish" : "publish" }, [row.id])}
                role="switch"
                aria-checked={row.published}
                title="Published"
                style={{
                  width: 38,
                  height: 22,
                  borderRadius: 11,
                  border: 0,
                  background: row.published ? "var(--accent)" : "var(--border-strong)",
                  position: "relative",
                  cursor: "pointer",
                  flex: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: row.published ? 18 : 2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,.3)",
                    transition: "left .18s",
                  }}
                />
              </button>
              <button
                onClick={() => {
                  if (!window.confirm("Delete this review? It disappears from the storefront immediately.")) return;
                  submit({ intent: "delete" }, [row.id]);
                }}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  border: 0,
                  background: "transparent",
                  color: "var(--critical)",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>

      {importOpen ? (
        <ImportWizard
          products={products}
          onClose={() => setImportOpen(false)}
          fetcher={fetcher}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ import wizard */

function ImportWizard({
  products,
  onClose,
  fetcher,
}: {
  products: { id: string; title: string }[];
  onClose: () => void;
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
}) {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<string[][]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [map, setMap] = useState<Record<string, string>>({});
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [source, setSource] = useState("");
  const [fileError, setFileError] = useState("");

  const data = fetcher.data as { imported?: number; skipped?: number; summary?: string; error?: string } | undefined;
  const running = fetcher.state !== "idle";

  useEffect(() => {
    if (step === 3 && !running && data && data.imported !== undefined) setStep(4);
  }, [step, running, data]);

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      // Rule 2: only the CSV path is real here, so a JSON or ZIP export is
      // refused with the reason instead of being half-read.
      setFileError("Only CSV is read here. Export your reviews as CSV and drop that in.");
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    setFileError("");
    setFileName(file.name);
    setCsv(text);
    setHeaders(parsed.headers);
    setPreview(parsed.rows.slice(0, 5));
    setRowCount(parsed.rows.length);
    setMap(guessMapping(parsed.headers));
    setStep(2);
  }

  function runImport() {
    if (!source) return;
    const body = new FormData();
    body.append("intent", "import");
    body.append("csv", csv);
    body.append("map", JSON.stringify(map));
    body.append("productId", productId);
    body.append("source", source);
    setStep(3);
    fetcher.submit(body, { method: "post" });
  }

  const title = step === 2 ? "Map your columns" : step >= 3 ? "Importing" : "Import reviews";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 86,
        background: "rgba(0,0,0,.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        overflow: "auto",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(760px,100%)",
          background: "var(--elev)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          margin: "auto",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontWeight: 650, fontSize: 15 }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              border: 0,
              borderRadius: 8,
              background: "transparent",
              color: "var(--ink-2)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {step === 1 ? (
          <div style={{ padding: "18px 20px" }}>
            <label
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void readFile(event.dataTransfer.files?.[0]);
              }}
              style={{
                display: "block",
                border: "1px dashed var(--border-strong)",
                borderRadius: 12,
                background: "var(--bg)",
                padding: "34px 20px",
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 650 }}>Drop a CSV here</div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 3 }}>
                Nothing is imported until you map the columns.
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={(event) => void readFile(event.target.files?.[0])}
                style={{ display: "none" }}
              />
            </label>
            {fileError ? (
              <div style={{ fontSize: 11, color: "var(--critical)", fontWeight: 600, marginTop: 3 }}>{fileError}</div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <>
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 600 }}>{fileName}</span>
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                {rowCount} rows detected · no image folder
              </span>
            </div>
            <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>Map your columns</div>
              {headers.map((header) => (
                <div
                  key={header}
                  style={{ display: "grid", gridTemplateColumns: "1fr 22px 1fr", gap: 10, alignItems: "center" }}
                >
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 12,
                      padding: "8px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background: "var(--bg)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {header}
                  </span>
                  <span style={{ color: "var(--ink-3)", textAlign: "center" }}>→</span>
                  <select
                    value={map[header] ?? ""}
                    onChange={(event) => setMap((current) => ({ ...current, [header]: event.target.value }))}
                    style={{
                      height: 34,
                      borderRadius: 8,
                      border: "1px solid var(--input-border)",
                      background: "var(--input)",
                      padding: "0 8px",
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    <option value="">Skip this column</option>
                    {IMPORT_TARGETS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}
                >
                  Assign to product
                  <select
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                    style={{
                      height: 34,
                      borderRadius: 8,
                      border: "1px solid var(--input-border)",
                      background: "var(--input)",
                      padding: "0 8px",
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    <option value="">Not linked</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}
                >
                  Source (required)
                  <select
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    style={{
                      height: 34,
                      borderRadius: 8,
                      border: `1px solid ${source ? "var(--input-border)" : "var(--critical)"}`,
                      background: "var(--input)",
                      padding: "0 8px",
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    <option value="">Choose source…</option>
                    {SOURCES.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginTop: 6 }}>
                Preview · first five rows
              </div>
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                  <thead>
                    <tr
                      style={{
                        height: 32,
                        background: "var(--bg)",
                        color: "var(--ink-2)",
                        fontSize: 11,
                        fontWeight: 600,
                        textAlign: "left",
                      }}
                    >
                      {headers.map((header) => (
                        <th key={header} style={{ padding: "0 10px", fontWeight: 600 }}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((cells, index) => (
                      <tr key={index} style={{ height: 34, borderTop: "1px solid var(--border)" }}>
                        {headers.map((header, cellIndex) => (
                          <td
                            key={header}
                            style={{
                              padding: "0 10px",
                              fontSize: 12,
                              color: "var(--ink-2)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: 150,
                            }}
                          >
                            {cells[cellIndex] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "12px 20px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <button
                onClick={onClose}
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
                Cancel
              </button>
              <button
                onClick={runImport}
                disabled={!source}
                style={{
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: 0,
                  background: "var(--accent)",
                  color: "var(--accent-ink)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: source ? "pointer" : "not-allowed",
                  opacity: source ? 1 : 0.5,
                }}
              >
                Import {rowCount} reviews
              </button>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ height: 8, borderRadius: 5, background: "#F2F1F5", overflow: "hidden" }}>
              <span
                style={{
                  display: "block",
                  height: 8,
                  width: running ? "60%" : "100%",
                  background: "var(--accent)",
                  borderRadius: 5,
                  transition: "width .2s",
                }}
              />
            </span>
            <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
              {data?.error ? data.error : `Writing ${rowCount} rows…`}
            </span>
          </div>
        ) : null}

        {step === 4 ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontWeight: 650, fontSize: 15 }}>Import finished</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <span
                style={{
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Imported</span>
                <span style={{ fontSize: 22, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                  {data?.imported ?? 0}
                </span>
              </span>
              <span
                style={{
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Skipped</span>
                <span style={{ fontSize: 22, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                  {data?.skipped ?? 0}
                </span>
              </span>
            </div>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{data?.summary ?? ""}</span>
            <button
              onClick={onClose}
              style={{
                alignSelf: "flex-start",
                height: 32,
                padding: "0 14px",
                borderRadius: 8,
                border: 0,
                background: "var(--accent)",
                color: "var(--accent-ink)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
