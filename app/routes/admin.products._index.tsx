/** Products list. */
import { Form, Link } from "react-router";
import type { Route } from "./+types/admin.products._index";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listProducts, unitsSold, createProduct } from "~/lib/admin.server";
import { formatMoney } from "~/lib/money";
import { card, Empty } from "~/admin/ui";

export function meta() {
  return [{ title: "Products — Shop Admin" }];
}

/** pCols, from the prototype view-model (desktop). */
const P_COLS = "40px minmax(0,1.6fr) 110px 90px 110px 100px";

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, rows: [], total: 0, query: "", status: "" };

  const query = (url.searchParams.get("q") || "").toLowerCase();
  const status = url.searchParams.get("status") || "";
  const [entries, sold] = await Promise.all([
    listProducts(context.db, store.id),
    unitsSold(context.db, store.id),
  ]);

  const rows = entries
    .filter((entry) => !query || entry.product.title.toLowerCase().includes(query))
    .filter((entry) => !status || entry.product.status === status)
    .map((entry) => {
      const prices = entry.variants.map((v) => v.priceCents);
      const units = entry.variants.reduce((total, v) => total + (sold.get(v.id) ?? 0), 0);
      return {
        id: entry.product.id,
        title: entry.product.title,
        status: entry.product.status,
        options: entry.variants.length,
        priceFrom: prices.length ? formatMoney(Math.min(...prices), store.currency) : "—",
        units,
      };
    });

  return { store: { slug: store.slug, name: store.name }, rows, total: entries.length, query, status };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };

  const existing = await listProducts(context.db, store.id);
  const handle = `product-${existing.length + 1}`;

  const product = await createProduct(context.db, store.id, {
    title: "Untitled product",
    handle,
    description: "",
    status: "draft",
    supplierName: null,
    supplierUrl: null,
    costCents: null,
  });

  return new Response(null, {
    status: 302,
    headers: { Location: `/admin/products/${product.id}?store=${store.slug}` },
  });
}

export default function Products({ loaderData }: Route.ComponentProps) {
  const { store, rows, total, query, status } = loaderData;

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Products belong to a store. Create one first." />
      </div>
    );
  }

  const pEmptyTitle = total ? "No products match" : "No products yet";
  const pEmptyBody = total
    ? "Try a different search or clear the status filter."
    : "Add your first product to set its bundle options, images and supplier cost.";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Products</h1>
        <Form method="post">
          <button
            type="submit"
            className="k-hover"
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
            Add product
          </button>
        </Form>
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
        <Form
          method="get"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            flexWrap: "wrap",
          }}
        >
          <input type="hidden" name="store" value={store.slug} />
          <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="var(--ink-3)"
              strokeWidth="1.6"
              strokeLinecap="round"
              style={{ position: "absolute", left: 10, top: 8 }}
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" />
            </svg>
            <input
              name="q"
              defaultValue={query}
              placeholder="Search products"
              style={{
                width: "100%",
                height: 32,
                padding: "0 10px 0 32px",
                borderRadius: 8,
                border: "1px solid var(--input-border)",
                background: "var(--input)",
                fontSize: 13,
              }}
            />
          </div>
          <select
            name="status"
            defaultValue={status}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            style={{
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--input-border)",
              background: "var(--input)",
              padding: "0 8px",
              fontSize: 13,
              color: "var(--ink)",
            }}
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
          </select>
        </Form>
        {rows.length === 0 ? (
          <div
            style={{
              padding: "56px 16px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "var(--bg)",
                display: "grid",
                placeItems: "center",
                color: "var(--ink-3)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <path d="M3 3h6.5l7.5 7.5-6.5 6.5L3 9.5z" />
              </svg>
            </span>
            <div style={{ fontWeight: 650, fontSize: 14 }}>{pEmptyTitle}</div>
            <div style={{ color: "var(--ink-2)", maxWidth: 340 }}>{pEmptyBody}</div>
            <Form method="post">
              <button
                type="submit"
                style={{
                  marginTop: 6,
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
                Add product
              </button>
            </Form>
          </div>
        ) : null}
        {rows.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: P_COLS,
              gap: 12,
              padding: "0 16px",
              height: 36,
              alignItems: "center",
              fontSize: 12,
              fontWeight: 550,
              color: "var(--ink-2)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span />
            <span>Product</span>
            <span>Status</span>
            <span>Options</span>
            <span style={{ textAlign: "right" }}>Price from</span>
            <span style={{ textAlign: "right" }}>Units sold</span>
          </div>
        ) : null}
        {rows.map((p) => {
          const statusKind = p.status === "active" ? "success" : "neutral";
          return (
            <Link
              key={p.id}
              to={`/admin/products/${p.id}?store=${store.slug}`}
              className="k-hover"
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: P_COLS,
                gap: 12,
                alignItems: "center",
                padding: "0 16px",
                height: 56,
                border: 0,
                borderBottom: "1px solid var(--border)",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--ink)",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                  color: "var(--ink-3)",
                  fontSize: 16,
                  fontWeight: 650,
                }}
              >
                {(p.title || "P").slice(0, 1).toUpperCase()}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.title}
                </span>
                <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>{store.name}</span>
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  height: 20,
                  padding: "0 8px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 550,
                  background: `var(--b-${statusKind}-bg)`,
                  color: `var(--b-${statusKind}-fg)`,
                  justifySelf: "start",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.8 }} />
                {p.status === "active" ? "Active" : "Draft"}
              </span>
              <span style={{ color: "var(--ink-2)" }}>
                {p.options} {p.options === 1 ? "option" : "options"}
              </span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.priceFrom}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>{p.units}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
