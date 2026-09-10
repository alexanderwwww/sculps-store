/**
 * Orders.
 *
 * The screen he cannot run the business without: what sold, what still needs
 * placing with the supplier, what needs a tracking number. Filters live in the
 * URL so a filtered view can be bookmarked and shared with himself.
 */
import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/admin.orders._index";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listOrders, setOrderState } from "~/lib/admin.server";
import { money } from "~/lib/money";
import { ORDER_STATES, type OrderState } from "~/db/schema";
import { card, Badge, Empty, PageTitle, primaryButton, secondaryButton, input } from "~/admin/ui";
import type { BadgeKind } from "~/admin/ui";

export function meta() {
  return [{ title: "Orders — Shop Admin" }];
}

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "Unfulfilled" },
  { key: "ordered", label: "Ordered" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "refunded", label: "Refunded" },
  { key: "cancelled", label: "Cancelled" },
];

const STATE_LABEL: Record<string, string> = {
  new: "Unfulfilled",
  ordered: "Ordered with supplier",
  fulfilled: "Fulfilled",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

const STATE_KIND: Record<string, BadgeKind> = {
  new: "warning",
  ordered: "purple",
  fulfilled: "success",
  refunded: "neutral",
  cancelled: "neutral",
};

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, rows: [], counts: {}, total: 0, page: 0, state: "all", query: "" };

  const state = (url.searchParams.get("state") || "all") as OrderState | "all";
  const query = url.searchParams.get("q") || "";
  const page = Number(url.searchParams.get("page") || 0) || 0;

  const { rows, counts, total } = await listOrders(context.db, {
    storeId: store.id,
    state,
    query,
    page,
    perPage: 50,
  });

  return {
    store: { slug: store.slug, name: store.name },
    state,
    query,
    page,
    total,
    counts,
    rows: rows.map((row) => ({
      id: row.order.id,
      number: row.order.number,
      createdAt: row.order.createdAt,
      customer: row.order.customerName,
      city: [row.order.city, row.order.region].filter(Boolean).join(", "),
      items: row.itemSummary,
      total: money(row.order.totalCents, row.order.currency),
      paymentStatus: row.order.paymentStatus,
      state: row.order.state,
      tracking: row.order.tracking,
    })),
  };
}

/** Bulk "mark as ordered with supplier" from the selection bar. */
export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const form = await request.formData();
  const ids = form.getAll("orderId").map(String);
  const intent = String(form.get("intent") || "");

  if (intent === "bulk-ordered" && ids.length) {
    for (const id of ids) {
      await setOrderState(context.db, id, "ordered", "Marked as ordered with supplier");
    }
    return { ok: true, changed: ids.length };
  }
  return { ok: false, changed: 0 };
}

function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Orders({ loaderData }: Route.ComponentProps) {
  const { store, rows, counts, state, query, total, page } = loaderData;
  const [params] = useSearchParams();

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first — orders belong to a store." />
      </div>
    );
  }

  const link = (overrides: Record<string, string>) => {
    const next = new URLSearchParams(params);
    next.set("store", store.slug);
    for (const [key, value] of Object.entries(overrides)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `/admin/orders?${next}`;
  };

  const filtered = Boolean(query) || state !== "all";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageTitle
        title="Orders"
        actions={
          <a
            href={`/admin/orders/export?store=${store.slug}`}
            style={{ ...secondaryButton, textDecoration: "none" }}
          >
            Export CSV
          </a>
        }
      />

      <div style={card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "6px 8px",
            borderBottom: "1px solid var(--border)",
            overflowX: "auto",
          }}
        >
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              to={link({ state: tab.key === "all" ? "" : tab.key, page: "" })}
              className="k-hover"
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 8,
                background: state === tab.key ? "var(--sel)" : "transparent",
                color: "var(--ink)",
                fontSize: 13,
                fontWeight: 550,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                textDecoration: "none",
              }}
            >
              {tab.label}
              <span style={{ fontSize: 12, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                {counts[tab.key] ?? 0}
              </span>
            </Link>
          ))}
        </div>

        <Form
          method="get"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <input type="hidden" name="store" value={store.slug} />
          {state !== "all" ? <input type="hidden" name="state" value={state} /> : null}
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by order number, customer or email"
            style={{ ...input, flex: 1, minWidth: 180 }}
          />
          <button type="submit" style={secondaryButton}>
            Search
          </button>
          {filtered ? (
            <Link to={`/admin/orders?store=${store.slug}`} style={{ fontSize: 12, fontWeight: 550 }}>
              Clear
            </Link>
          ) : null}
        </Form>

        {rows.length === 0 ? (
          <Empty
            title={filtered ? "No orders match" : "No orders yet"}
            help={
              filtered
                ? "Nothing matches that search on this store. Clear it to see everything."
                : "Paid orders land here the moment checkout is live. Nothing is shown until a real one arrives."
            }
            action={
              filtered ? (
                <Link to={`/admin/orders?store=${store.slug}`} style={{ ...secondaryButton, textDecoration: "none" }}>
                  Clear search and filters
                </Link>
              ) : null
            }
          />
        ) : (
          <Form method="post">
            <input type="hidden" name="intent" value="bulk-ordered" />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead>
                  <tr
                    style={{
                      height: 40,
                      color: "var(--ink-2)",
                      fontSize: 12,
                      fontWeight: 550,
                      textAlign: "left",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <th style={{ width: 44, padding: "0 0 0 16px" }} />
                    <th style={{ padding: "0 12px", fontWeight: 550 }}>Order</th>
                    <th style={{ padding: "0 12px", fontWeight: 550 }}>Date</th>
                    <th style={{ padding: "0 12px", fontWeight: 550 }}>Customer</th>
                    <th style={{ padding: "0 12px", fontWeight: 550 }}>Items</th>
                    <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "right" }}>Total</th>
                    <th style={{ padding: "0 12px", fontWeight: 550 }}>Payment</th>
                    <th style={{ padding: "0 12px", fontWeight: 550 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order) => (
                    <tr key={order.id} className="k-hover" style={{ height: 48, borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0 0 0 16px" }}>
                        <input
                          type="checkbox"
                          name="orderId"
                          value={order.id}
                          style={{ width: 16, height: 16, accentColor: "var(--focus)", cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "0 12px" }}>
                        <Link
                          to={`/admin/orders/${order.id}?store=${store.slug}`}
                          style={{
                            fontFamily: "'JetBrains Mono',monospace",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          #{order.number}
                        </Link>
                      </td>
                      <td style={{ padding: "0 12px", color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                        {formatDate(order.createdAt)}
                      </td>
                      <td style={{ padding: "0 12px" }}>
                        <div>{order.customer}</div>
                        {order.city ? (
                          <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{order.city}</div>
                        ) : null}
                      </td>
                      <td style={{ padding: "0 12px", color: "var(--ink-2)" }}>{order.items}</td>
                      <td
                        style={{
                          padding: "0 12px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {order.total}
                      </td>
                      <td style={{ padding: "0 12px" }}>
                        <Badge kind={order.paymentStatus === "refunded" ? "neutral" : "success"}>
                          {order.paymentStatus === "refunded" ? "Refunded" : "Paid"}
                        </Badge>
                      </td>
                      <td style={{ padding: "0 12px" }}>
                        <Badge kind={STATE_KIND[order.state] ?? "neutral"}>
                          {STATE_LABEL[order.state] ?? order.state}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <button type="submit" style={secondaryButton}>
                Mark selected as ordered with supplier
              </button>
              <span style={{ marginLeft: "auto", color: "var(--ink-2)", fontSize: 12 }}>
                {total} order{total === 1 ? "" : "s"}
              </span>
            </div>
          </Form>
        )}
      </div>

      {total > 50 ? (
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {page > 0 ? (
            <Link to={link({ page: String(page - 1) })} style={{ ...secondaryButton, textDecoration: "none" }}>
              Previous
            </Link>
          ) : null}
          {(page + 1) * 50 < total ? (
            <Link to={link({ page: String(page + 1) })} style={{ ...secondaryButton, textDecoration: "none" }}>
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
