/**
 * Customers — ported from design/port/customers.html (cut from
 * `design/prototype/Shop Admin.dc.html`, the `isCustomers` screen plus the
 * customer drawer from the drawers section).
 *
 * There is no customers table in this codebase, and the design does not need
 * one: the prototype's own view model builds `custList` by grouping its orders
 * by email. This does exactly that against the real `orders` table — name,
 * email, order count, spend, location and marketing consent all come from
 * orders, so a customer exists here only because they actually bought.
 *
 * Spend is net of refunds (`totalCents - refundedCents`) on paid orders.
 */
import { Form, Link } from "react-router";
import { useEffect, useState } from "react";
import { desc, eq, inArray } from "drizzle-orm";
import type { Route } from "./+types/admin.customers";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { orders as ordersTable, orderItems } from "~/db/schema";
import { money } from "~/lib/money";
import { Empty, card } from "~/admin/ui";

export function meta() {
  return [{ title: "Customers — Shop Admin" }];
}

const STATE_LABEL: Record<string, string> = {
  new: "Unfulfilled",
  ordered: "Ordered with supplier",
  fulfilled: "Fulfilled",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

const STATE_KIND: Record<string, string> = {
  new: "warning",
  ordered: "purple",
  fulfilled: "success",
  refunded: "neutral",
  cancelled: "neutral",
};

function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The prototype switches `cu.cols` on `window.innerWidth < 1100`. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 1100);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return narrow;
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, rows: [], total: 0, query: "", filter: "" };

  const query = (url.searchParams.get("q") || "").toLowerCase();
  const filter = url.searchParams.get("filter") || "";

  const rows = await context.db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.storeId, store.id))
    .orderBy(desc(ordersTable.createdAt));

  const items = rows.length
    ? await context.db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
    : [];
  const summaryByOrder = new Map<string, string>();
  for (const item of items) {
    const previous = summaryByOrder.get(item.orderId);
    const piece = item.quantity > 1 ? `${item.quantity} × ${item.label}` : item.label;
    summaryByOrder.set(item.orderId, previous ? `${previous}, ${piece}` : piece);
  }

  type Customer = {
    key: string;
    name: string;
    email: string;
    count: number;
    spentCents: number;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    address: string;
    marketing: boolean;
    orders: {
      id: string;
      number: string;
      date: string;
      bundle: string;
      total: string;
      state: string;
      kind: string;
    }[];
  };

  const byEmail = new Map<string, Customer>();
  for (const order of rows) {
    const key = order.email.toLowerCase();
    let entry = byEmail.get(key);
    if (!entry) {
      entry = {
        key,
        name: order.customerName,
        email: order.email,
        count: 0,
        spentCents: 0,
        city: order.city ?? "",
        region: order.region ?? "",
        postalCode: order.postalCode ?? "",
        country: order.country,
        address: [order.address1, order.address2].filter(Boolean).join(", "),
        marketing: false,
        orders: [],
      };
      byEmail.set(key, entry);
    }
    entry.count += 1;
    if (order.paymentStatus === "paid") {
      entry.spentCents += order.totalCents - order.refundedCents;
    }
    if (order.marketingConsent) entry.marketing = true;
    entry.orders.push({
      id: order.id,
      number: `#${order.number}`,
      date: formatDate(order.createdAt),
      bundle: summaryByOrder.get(order.id) ?? "—",
      total: money(order.totalCents, order.currency),
      state: STATE_LABEL[order.state] ?? order.state,
      kind: STATE_KIND[order.state] ?? "neutral",
    });
  }

  let list = [...byEmail.values()];
  const total = list.length;
  if (query) {
    list = list.filter((x) => `${x.name} ${x.email} ${x.city}`.toLowerCase().includes(query));
  }
  if (filter === "marketing") list = list.filter((x) => x.marketing);
  if (filter === "repeat") list = list.filter((x) => x.count > 1);

  return {
    store: { slug: store.slug, name: store.name },
    rows: list.map((x) => ({
      key: x.key,
      name: x.name,
      email: x.email,
      orders: String(x.count),
      spent: money(x.spentCents),
      location: [x.city, x.region].filter(Boolean).join(", ") || "—",
      marketing: x.marketing ? "Subscribed" : "No",
      mkKind: x.marketing ? "success" : "neutral",
      address: x.address,
      cityLine: [[x.city, x.region].filter(Boolean).join(", "), x.postalCode].filter(Boolean).join(" "),
      country: x.country,
      marketingLong: x.marketing ? "Subscribed" : "Not subscribed",
      orderList: x.orders,
    })),
    total,
    query: url.searchParams.get("q") || "",
    filter,
  };
}

export default function Customers({ loaderData }: Route.ComponentProps) {
  const { store, rows, total, query, filter } = loaderData;
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const narrow = useNarrow();

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const cols = narrow
    ? "minmax(90px,1fr) minmax(120px,1.3fr) 44px 76px minmax(80px,auto) 92px"
    : "minmax(140px,1.1fr) minmax(160px,1.4fr) 64px 96px minmax(110px,auto) 104px";

  const emptyTitle = total ? "Nothing matches" : "No customers yet";
  const emptyBody = total
    ? "Try another search, or clear the filter."
    : "Anyone who checks out appears here with their orders and lifetime spend.";

  const suffix = `?store=${store.slug}`;
  const drawer = openEmail ? rows.find((r) => r.key === openEmail) : null;

  return (
    <>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Customers</h1>
          {/* Export CSV: there is no customers export route yet (orders and
              events have one, customers does not), so the button renders
              visibly disabled with the reason beside it rather than toasting
              like the prototype did. */}
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Export needs a customers export route</span>
            <button
              type="button"
              disabled
              style={{
                height: 28,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 550,
                cursor: "not-allowed",
                opacity: 0.5,
              }}
            >
              Export CSV
            </button>
          </span>
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
            <input
              name="q"
              defaultValue={query}
              placeholder="Search name, email or city"
              style={{
                flex: 1,
                minWidth: 180,
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--input-border)",
                background: "var(--input)",
                fontSize: 13,
              }}
            />
            <select
              name="filter"
              defaultValue={filter}
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
              <option value="">Everyone</option>
              <option value="marketing">Accepts marketing</option>
              <option value="repeat">Repeat customers</option>
            </select>
          </Form>
          {rows.length === 0 ? (
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
              <div style={{ fontWeight: 650 }}>{emptyTitle}</div>
              <div style={{ color: "var(--ink-2)", maxWidth: 360 }}>{emptyBody}</div>
            </div>
          ) : null}
          {rows.length > 0 ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: cols,
                  gap: 10,
                  padding: "0 16px",
                  height: 36,
                  alignItems: "center",
                  fontSize: 12,
                  fontWeight: 550,
                  color: "var(--ink-2)",
                  borderBottom: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                <span>Name</span>
                <span>Email</span>
                <span style={{ textAlign: "right" }}>Orders</span>
                <span style={{ textAlign: "right" }}>Total spent</span>
                <span>Location</span>
                <span>Marketing</span>
              </div>
              {rows.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setOpenEmail(r.key)}
                  className="k-hover"
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: cols,
                    gap: 10,
                    alignItems: "center",
                    padding: "0 16px",
                    height: 44,
                    overflow: "hidden",
                    border: 0,
                    borderBottom: "1px solid var(--border)",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--ink)",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 550,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.name}
                  </span>
                  <span
                    style={{
                      color: "var(--ink-2)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.email}
                  </span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.orders}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 550 }}>
                    {r.spent}
                  </span>
                  <span style={{ color: "var(--ink-2)", whiteSpace: "nowrap" }}>{r.location}</span>
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
                      background: `var(--b-${r.mkKind}-bg)`,
                      color: `var(--b-${r.mkKind}-fg)`,
                      justifySelf: "start",
                    }}
                  >
                    {r.marketing}
                  </span>
                </button>
              ))}
            </>
          ) : null}
        </div>
      </div>

      {drawer ? (
        <>
          <div
            onClick={() => setOpenEmail(null)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 86,
              background: "rgba(0,0,0,.4)",
              animation: "kFade .12s",
            }}
          />
          <div
            style={{
              position: "fixed",
              right: 0,
              top: 0,
              bottom: 0,
              width: "min(420px,100%)",
              zIndex: 87,
              background: "var(--surface)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              flexDirection: "column",
              animation: "kDrawer .2s ease-out",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontWeight: 650, fontSize: 15 }}>{drawer.name}</span>
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{drawer.email}</span>
              </span>
              <button
                type="button"
                onClick={() => setOpenEmail(null)}
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
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <div
                style={{
                  padding: "14px 18px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Orders</span>
                  <span style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                    {drawer.orders}
                  </span>
                </span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Total spent</span>
                  <span style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                    {drawer.spent}
                  </span>
                </span>
              </div>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
                  Shipping address
                </div>
                {/* The prototype hard-codes "United States" on the third line.
                    The order carries its own country, so the real value is
                    rendered there instead of a fixed one. */}
                <div style={{ lineHeight: "19px" }}>
                  {drawer.address}
                  <br />
                  {drawer.cityLine}
                  <br />
                  {drawer.country}
                </div>
              </div>
              <div style={{ padding: "12px 18px 4px", fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>
                Orders
              </div>
              {drawer.orderList.map((o2) => (
                <Link
                  key={o2.id}
                  to={`/admin/orders/${o2.id}${suffix}`}
                  className="k-hover"
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 18px",
                    border: 0,
                    borderBottom: "1px solid var(--border)",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--ink)",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--link)",
                      }}
                    >
                      {o2.number}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>
                      {o2.date} · {o2.bundle}
                    </span>
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 550 }}>{o2.total}</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 20,
                      padding: "0 8px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 550,
                      background: `var(--b-${o2.kind}-bg)`,
                      color: `var(--b-${o2.kind}-fg)`,
                    }}
                  >
                    {o2.state}
                  </span>
                </Link>
              ))}
              <div style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13 }}>Accepts email marketing</span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 20,
                    padding: "0 8px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 550,
                    background: `var(--b-${drawer.mkKind}-bg)`,
                    color: `var(--b-${drawer.mkKind}-fg)`,
                  }}
                >
                  {drawer.marketingLong}
                </span>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
