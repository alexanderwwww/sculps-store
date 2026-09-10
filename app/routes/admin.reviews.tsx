/**
 * Reviews.
 *
 * Nothing here generates a review, and nothing publishes one whose source has
 * not been declared. That refusal is enforced in the database layer, not just
 * hidden in the UI, so it holds however the row got there.
 */
import { Form, useNavigation } from "react-router";
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
import { card, cardHeader, Badge, Empty, PageTitle, primaryButton, secondaryButton, criticalButton, input, textarea } from "~/admin/ui";

export function meta() {
  return [{ title: "Reviews — Shop Admin" }];
}

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
      reviewedOn: row.reviewedOn,
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
    const name = String(form.get("name") || "").trim();
    const rating = Number(form.get("rating") || 5);
    const source = String(form.get("source") || "");
    const body = String(form.get("body") || "").trim();

    if (!name) return { error: "Whose review is it? Put the customer's name in." };
    if (!source) {
      return {
        error:
          "Choose a source. Every review has to be declared either your customer's or the supplier listing's before it can go on the page.",
      };
    }
    if (rating < 1 || rating > 5) return { error: "Rating has to be 1 to 5." };

    await createReview(context.db, store.id, {
      name,
      rating,
      title: String(form.get("title") || "").trim() || null,
      body,
      country: String(form.get("country") || "").trim() || null,
      imageUrl: String(form.get("imageUrl") || "").trim() || null,
      verified: form.get("verified") === "on",
      source,
      productId: String(form.get("productId") || "") || null,
      reviewedOn: null,
    });
    return { ok: "Review added. It is not on the page until you publish it." };
  }

  if (intent === "update") {
    const id = String(form.get("id"));
    await updateReview(context.db, id, {
      title: String(form.get("title") || "").trim() || null,
      body: String(form.get("body") || ""),
      source: String(form.get("source") || ""),
      rating: Number(form.get("rating") || 5),
    });
    return { ok: "Saved." };
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

  return { error: "Unknown action." };
}

function stars(rating: number): string {
  return "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);
}

export default function Reviews({ loaderData, actionData }: Route.ComponentProps) {
  const { store, rows, stats, products } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  if (!store || !stats) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageTitle title={`Reviews · ${store.name}`} />

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

      <div
        style={{
          ...card,
          padding: "14px 16px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 16,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 550 }}>Average rating</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
              {stats.total ? stats.average.toFixed(1) : "—"}
            </span>
            <span style={{ color: "var(--ink-3)" }}>/ 5</span>
          </div>
          <div style={{ color: "#F5A623", letterSpacing: 2 }}>
            {stats.total ? stars(Math.round(stats.average)) : ""}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 550 }}>Total reviews</div>
          <div style={{ fontSize: 26, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{stats.total}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 550 }}>Published</div>
          <div style={{ fontSize: 26, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{stats.published}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {stats.distribution.map((row) => (
            <span key={row.star} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ width: 28, color: "var(--ink-2)" }}>{row.star}★</span>
              <span style={{ flex: 1, height: 6, borderRadius: 4, background: "#F2F1F5", overflow: "hidden" }}>
                <span
                  style={{
                    display: "block",
                    height: 6,
                    width: stats.total ? `${(row.count / stats.total) * 100}%` : "0%",
                    background: "#F5A623",
                    borderRadius: 4,
                  }}
                />
              </span>
              <span style={{ width: 26, textAlign: "right", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                {row.count}
              </span>
            </span>
          ))}
        </div>
      </div>

      <Form method="post" style={card}>
        <div style={cardHeader}>
          <span>Add a review</span>
        </div>
        <input type="hidden" name="intent" value="add" />
        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Customer name</span>
            <input name="name" style={input} required />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Rating</span>
            <select name="rating" defaultValue="5" style={{ ...input, padding: "0 8px" }}>
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value} star{value === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Source (required)</span>
            <select name="source" defaultValue="" style={{ ...input, padding: "0 8px" }} required>
              <option value="">Choose source…</option>
              {SOURCES.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Country</span>
            <input name="country" style={input} placeholder="US" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Product</span>
            <select name="productId" defaultValue="" style={{ ...input, padding: "0 8px" }}>
              <option value="">Not linked</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Photo URL</span>
            <input name="imageUrl" style={input} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Title</span>
            <input name="title" style={input} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Review</span>
            <textarea name="body" rows={3} style={textarea} />
          </label>
        </div>
        <div style={{ padding: "0 16px 16px", display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" name="verified" style={{ width: 16, height: 16, accentColor: "var(--focus)" }} />
            Verified buyer
          </label>
          <button type="submit" disabled={busy} style={primaryButton}>
            Add review
          </button>
          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Added unpublished. Reviews are never generated here.
          </span>
        </div>
      </Form>

      <Form method="post" style={card}>
        <div style={cardHeader}>
          <span>All reviews</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="submit" name="intent" value="publish" disabled={busy} style={secondaryButton}>
              Publish selected
            </button>
            <button type="submit" name="intent" value="unpublish" disabled={busy} style={secondaryButton}>
              Unpublish
            </button>
            <button type="submit" name="intent" value="delete" disabled={busy} style={criticalButton}>
              Delete
            </button>
          </span>
        </div>

        {rows.length === 0 ? (
          <Empty
            title="No reviews yet"
            help="Add real ones above, from your customers or from the supplier listing. Nothing here writes reviews for you."
          />
        ) : (
          rows.map((review) => (
            <div
              key={review.id}
              style={{
                display: "grid",
                gridTemplateColumns: "34px 1fr 200px 200px 120px",
                gap: 10,
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <input
                type="checkbox"
                name="reviewId"
                value={review.id}
                style={{ width: 16, height: 16, accentColor: "var(--focus)", cursor: "pointer" }}
              />
              <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{review.name}</span>
                  <span style={{ color: "#F5A623", letterSpacing: 1 }}>{stars(review.rating)}</span>
                  {review.verified ? <Badge kind="success">Verified</Badge> : null}
                </span>
                {review.title ? <span style={{ fontWeight: 550 }}>{review.title}</span> : null}
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{review.body}</span>
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{review.country}</span>
              <span style={{ fontSize: 12 }}>
                {review.source ? (
                  SOURCES.find((source) => source.value === review.source)?.label ?? review.source
                ) : (
                  <span style={{ color: "var(--critical)", fontWeight: 600 }}>
                    Source required before publishing
                  </span>
                )}
              </span>
              <span>
                <Badge kind={review.published ? "success" : "neutral"}>
                  {review.published ? "Published" : "Not published"}
                </Badge>
              </span>
            </div>
          ))
        )}
      </Form>
    </div>
  );
}
