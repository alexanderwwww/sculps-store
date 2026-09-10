/** Products list. */
import { Form, Link } from "react-router";
import type { Route } from "./+types/admin.products._index";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listProducts, unitsSold, createProduct } from "~/lib/admin.server";
import { formatMoney } from "~/lib/money";
import { card, Badge, Empty, PageTitle, primaryButton, input } from "~/admin/ui";

export function meta() {
  return [{ title: "Products — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, rows: [], query: "" };

  const query = (url.searchParams.get("q") || "").toLowerCase();
  const [entries, sold] = await Promise.all([
    listProducts(context.db, store.id),
    unitsSold(context.db, store.id),
  ]);

  const rows = entries
    .filter((entry) => !query || entry.product.title.toLowerCase().includes(query))
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

  return { store: { slug: store.slug, name: store.name }, rows, query };
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
  const { store, rows, query } = loaderData;

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Products belong to a store. Create one first." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageTitle
        title="Products"
        actions={
          <Form method="post">
            <button type="submit" style={primaryButton}>
              Add product
            </button>
          </Form>
        }
      />

      <div style={card}>
        <Form
          method="get"
          style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)" }}
        >
          <input type="hidden" name="store" value={store.slug} />
          <input name="q" defaultValue={query} placeholder="Search products" style={{ ...input, flex: 1 }} />
        </Form>

        {rows.length === 0 ? (
          <Empty
            title={query ? "No products match" : "No products yet"}
            help={
              query
                ? "Nothing on this store matches that search."
                : "Add the product this store sells. Its bundle options set the prices the storefront shows."
            }
          />
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "56px 2fr 130px 90px 110px 100px",
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
            {rows.map((row) => (
              <Link
                key={row.id}
                to={`/admin/products/${row.id}?store=${store.slug}`}
                className="k-hover"
                style={{
                  display: "grid",
                  gridTemplateColumns: "56px 2fr 130px 90px 110px 100px",
                  gap: 12,
                  alignItems: "center",
                  padding: "0 16px",
                  height: 56,
                  borderBottom: "1px solid var(--border)",
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
                    color: "var(--ink-3)",
                    fontSize: 16,
                    fontWeight: 650,
                  }}
                >
                  {row.title.charAt(0).toUpperCase()}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.title}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>{store.name}</span>
                </span>
                <span>
                  <Badge kind={row.status === "active" ? "success" : "neutral"}>
                    {row.status === "active" ? "Active" : "Draft"}
                  </Badge>
                </span>
                <span style={{ color: "var(--ink-2)" }}>{row.options}</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.priceFrom}</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                  {row.units}
                </span>
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
