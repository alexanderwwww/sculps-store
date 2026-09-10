/**
 * Home.
 *
 * Transliterated from `design/port/home.html`; every style string is the
 * prototype's. Every number here is a query. With no orders the tiles read
 * $0.00 and the lists show their empty states — the design already draws them,
 * because an honest empty store is the normal first day of a store.
 *
 * The prototype's "Stores today" table is inside its all-stores scope
 * (`sc-if isAll`). This admin has no all-stores scope, so that block is not
 * rendered here.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { eq, and, gte, sql } from "drizzle-orm";
import type { Route } from "./+types/admin._index";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, dashboard, todos, listOrders } from "~/lib/admin.server";
import { domains, metaConfig, orders as ordersTable, paymentProviders, products } from "~/db/schema";
import { money, money0 } from "~/lib/money";
import { card, Empty, primaryButton } from "~/admin/ui";
import { useIsMobile } from "~/admin/use-mobile";

const RANGES: Record<string, { label: string; days: number }> = {
  today: { label: "Today", days: 1 },
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
};

export function meta() {
  return [{ title: "Home — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);

  const rangeKey = url.searchParams.get("range") || "today";
  const range = RANGES[rangeKey] ?? RANGES.today;

  if (!store) {
    return {
      store: null,
      rangeKey,
      metrics: [],
      todo: [],
      recent: [],
      chart: null,
      health: null,
      metaHealth: null,
    };
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (range.days - 1));

  const [stats, todo, recent, domainRows, providerRows, productRows, metaRow, eventRows] =
    await Promise.all([
      dashboard(context.db, store.id, range.days),
      todos(context.db, store.id),
      listOrders(context.db, { storeId: store.id, perPage: 6 }),
      context.db.select().from(domains).where(eq(domains.storeId, store.id)),
      context.db.select().from(paymentProviders).where(eq(paymentProviders.storeId, store.id)),
      context.db
        .select({ status: products.status, n: sql<number>`cast(count(*) as int)` })
        .from(products)
        .where(eq(products.storeId, store.id))
        .groupBy(products.status),
      context.db.select().from(metaConfig).where(eq(metaConfig.storeId, store.id)).limit(1),
      // Deduplication is only measurable through the shared event id that the
      // browser pixel and the server CAPI call both carry.
      context.db
        .select({
          total: sql<number>`cast(count(*) as int)`,
          withEventId: sql<number>`cast(count(${ordersTable.metaEventId}) as int)`,
        })
        .from(ordersTable)
        .where(and(eq(ordersTable.storeId, store.id), gte(ordersTable.createdAt, since))),
    ]);

  const primaryDomain = domainRows.find((d) => d.isPrimary) ?? domainRows[0] ?? null;
  const connectedProvider = providerRows.find((p) => p.connectedAt !== null) ?? null;
  const productCount = productRows.reduce((total, row) => total + row.n, 0);
  const activeProducts = productRows.find((row) => row.status === "active")?.n ?? 0;
  const config = metaRow[0] ?? null;
  const metaConnected = !!(config?.pixelId && config?.capiTokenEnc);
  const orderTotal = eventRows[0]?.total ?? 0;
  const withEventId = eventRows[0]?.withEventId ?? 0;

  return {
    store: { slug: store.slug, name: store.name, currency: store.currency, domain: store.domain },
    rangeKey,
    metrics: stats.metrics,
    todo,
    chart: { today: stats.today, yesterday: stats.yesterday },
    metaHealth: {
      connected: metaConnected,
      pixelValue: config?.pixelId ? "Connected" : "Not connected",
      capi: `${withEventId} / ${orderTotal}`,
      dedupe: metaConnected && orderTotal ? `${Math.round((withEventId / orderTotal) * 100)}%` : "—",
    },
    health: {
      note: store.domain,
      domain: primaryDomain
        ? `${primaryDomain.hostname} · ${primaryDomain.status === "connected" ? "Connected" : "Pending"}`
        : "No domain connected",
      domainOk: primaryDomain?.status === "connected",
      ssl: primaryDomain ? `SSL ${primaryDomain.ssl}` : "Connect a domain first",
      sslOk: primaryDomain?.ssl === "active",
      payments: connectedProvider
        ? `${connectedProvider.label ?? "Stripe"} connected`
        : "No provider connected",
      paymentsOk: !!connectedProvider,
      products: productCount
        ? `${productCount} product${productCount === 1 ? "" : "s"} · ${activeProducts} active`
        : "Nothing to sell yet",
      productsOk: productCount > 0,
    },
    recent: recent.rows.map((row) => ({
      id: row.order.id,
      number: row.order.number,
      customer: row.order.customerName,
      items: row.itemSummary,
      total: money(row.order.totalCents, row.order.currency),
      state: row.order.state,
      storeColor: row.storeColor,
    })),
  };
}

const STATE_LABEL: Record<string, string> = {
  new: "New",
  ordered: "Ordered with supplier",
  fulfilled: "Fulfilled",
  refunded: "Refunded",
};

const STATE_KIND: Record<string, string> = {
  new: "warning",
  ordered: "purple",
  fulfilled: "success",
  refunded: "neutral",
};

const TODO_TONE: Record<number, { bg: string; fg: string }> = {
  0: { bg: "var(--b-warning-bg)", fg: "var(--b-warning-fg)" },
  1: { bg: "var(--b-purple-bg)", fg: "var(--b-purple-fg)" },
};

const GREEN = "#22C55E";
const GREY = "var(--ink-3)";

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  const { store, rangeKey, metrics, todo, recent, chart, health, metaHealth } = loaderData;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [dateMenuOpen, setDateMenuOpen] = useState(false);

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "60px auto" }}>
        <div style={card}>
          <Empty
            title="No stores yet"
            help="A store is the thing everything else hangs off — orders, products, the storefront, its own Stripe account and its own domain. Create the first one to get going."
            action={
              <Link to="/admin/stores/new" style={{ ...primaryButton, height: 34, textDecoration: "none" }}>
                Create your first store
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const homeCols = isMobile ? "1fr" : "minmax(0,1fr) 300px";
  const recentCols = isMobile ? "72px 1fr 70px auto" : "84px 1.2fr 1.6fr 90px 150px";
  const notMobile = !isMobile;
  const range = RANGES[rangeKey] ?? RANGES.today;

  const healthRows = [
    { label: "Domain", help: health!.domain, dot: health!.domainOk ? GREEN : GREY, to: "/admin/settings?pane=domains" },
    { label: "SSL certificate", help: health!.ssl, dot: health!.sslOk ? GREEN : GREY, to: "/admin/settings?pane=domains" },
    { label: "Payments", help: health!.payments, dot: health!.paymentsOk ? GREEN : GREY, to: "/admin/settings?pane=payments" },
    { label: "Products", help: health!.products, dot: health!.productsOk ? GREEN : GREY, to: "/admin/products" },
    {
      label: "Meta",
      help: metaHealth!.connected ? "Pixel and CAPI connected" : "Pixel not connected",
      dot: metaHealth!.connected ? GREEN : GREY,
      to: "/admin/meta",
    },
  ];

  // The prototype's second list under Store health (`statusRows`) is empty in
  // its own honest zero state; the deep-links it carried are already rows in
  // healthRows above, so there is nothing left for it to hold.
  const statusRows: { text: string; to: string }[] = [];

  const pixelRows = [
    {
      label: `Meta pixel · ${store.name}`,
      value: metaHealth!.pixelValue,
      dot: metaHealth!.connected ? GREEN : GREY,
    },
  ];

  return (
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
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Home</h1>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setDateMenuOpen((open) => !open)}
            className="k-hover"
            style={{
              height: 28,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 12,
              fontWeight: 550,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              boxShadow: "var(--shadow)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
              <rect x="2" y="3" width="12" height="11" rx="2" />
              <path d="M2 7h12M5 1.5v3M11 1.5v3" />
            </svg>
            {range.label}
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>
          {dateMenuOpen ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 34,
                width: 180,
                background: "var(--elev)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                boxShadow: "var(--shadow-lg)",
                padding: 6,
                zIndex: 20,
                animation: "kPop .14s ease-out",
              }}
            >
              {Object.entries(RANGES).map(([key, option]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setDateMenuOpen(false);
                    navigate(`/admin?store=${store.slug}&range=${key}`);
                  }}
                  className="k-hover"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "7px 10px",
                    border: 0,
                    borderRadius: 7,
                    background: key === rangeKey ? "var(--accent-soft)" : "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--ink)",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: homeCols, gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--shadow)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
              overflow: "hidden",
            }}
          >
            {metrics.map((metric) => (
              <div key={metric.label} style={{ padding: "14px 16px", borderRight: "1px solid var(--border)" }}>
                <div style={{ color: "var(--ink-2)", fontSize: 12, fontWeight: 550 }}>{metric.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                  <span
                    style={{
                      fontSize: 22,
                      lineHeight: "28px",
                      fontWeight: 650,
                      letterSpacing: "-.01em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {metric.value}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", color: metric.color }}>
                    {metric.arrow} {metric.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {chart ? <SalesChart today={chart.today} yesterday={chart.yesterday} currency={store.currency} /> : null}

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--shadow)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "12px 16px", fontWeight: 650, borderBottom: "1px solid var(--border)" }}>
              Things to do
            </div>
            {todo.length === 0 ? (
              <div
                style={{
                  padding: "24px 16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  textAlign: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--ink-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10.5 8 14.5 16 5.5" />
                </svg>
                <div style={{ fontWeight: 600 }}>Nothing to do</div>
                <div style={{ color: "var(--ink-2)" }}>
                  Orders needing a supplier order or tracking number show up here.
                </div>
              </div>
            ) : null}
            {todo.map((item, index) => {
              const tone = TODO_TONE[index] ?? TODO_TONE[0];
              return (
                <Link
                  key={item.to}
                  to={`${item.to}&store=${store.slug}`}
                  className="k-hover"
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
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
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: tone.bg,
                      color: tone.fg,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 700,
                      fontSize: 13,
                      flex: "none",
                    }}
                  >
                    {item.count}
                  </span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ fontWeight: 600 }}>{item.strong}</strong> {item.rest}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 4 4 4-4 4" />
                  </svg>
                </Link>
              );
            })}
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
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ fontWeight: 650 }}>Recent orders</span>
              <Link to={`/admin/orders?store=${store.slug}`} style={{ fontSize: 12, fontWeight: 550 }}>
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <div
                style={{
                  padding: "28px 16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  textAlign: "center",
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "var(--bg)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--ink-3)",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                    <path d="M4 3h12v14l-2-1.5L12 17l-2-1.5L8 17l-2-1.5L4 17z" />
                  </svg>
                </span>
                <div style={{ fontWeight: 600 }}>No orders yet</div>
                <div style={{ color: "var(--ink-2)" }}>
                  Paid orders appear here as soon as a store is connected.
                </div>
              </div>
            ) : null}
            {recent.map((order) => (
              <Link
                key={order.id}
                to={`/admin/orders/${order.id}?store=${store.slug}`}
                className="k-hover"
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: recentCols,
                  gap: 12,
                  alignItems: "center",
                  padding: "0 16px",
                  height: 44,
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
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--link)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{ width: 6, height: 6, borderRadius: "50%", background: order.storeColor, flex: "none" }}
                  />
                  #{order.number}
                </span>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {order.customer}
                </span>
                {notMobile ? (
                  <span
                    style={{
                      color: "var(--ink-2)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {order.items}
                  </span>
                ) : null}
                <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{order.total}</span>
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
                    background: `var(--b-${STATE_KIND[order.state] ?? "neutral"}-bg)`,
                    color: `var(--b-${STATE_KIND[order.state] ?? "neutral"}-fg)`,
                    justifySelf: "start",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.8 }}
                  />
                  {STATE_LABEL[order.state] ?? order.state}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--shadow)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "12px 16px", fontWeight: 650, borderBottom: "1px solid var(--border)" }}>
              Meta ads health
            </div>
            {pixelRows.map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: row.dot, flex: "none" }} />
                <span style={{ flex: 1 }}>{row.label}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--ink-2)" }}>
                  {row.value}
                </span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: metaHealth!.connected ? GREEN : GREY,
                  flex: "none",
                }}
              />
              <span style={{ flex: 1 }}>Server events (CAPI)</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                {metaHealth!.capi} sent
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: metaHealth!.connected ? GREEN : GREY,
                  flex: "none",
                }}
              />
              <span style={{ flex: 1 }}>Deduplication</span>
              <span style={{ color: "var(--ink-2)" }}>{metaHealth!.dedupe}</span>
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
                padding: "12px 16px",
                fontWeight: 650,
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              Store health
              <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 450 }}>{health!.note}</span>
            </div>
            {healthRows.map((row) => (
              <Link
                key={row.label}
                to={`${row.to}${row.to.includes("?") ? "&" : "?"}store=${store.slug}`}
                className="k-hover"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  border: 0,
                  borderBottom: "1px solid var(--border)",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--ink)",
                  textDecoration: "none",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: row.dot, flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 550 }}>{row.label}</span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "var(--ink-2)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {row.help}
                  </span>
                </span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
                  <path d="m6 4 4 4-4 4" />
                </svg>
              </Link>
            ))}
            {statusRows.map((row) => (
              <Link
                key={row.text}
                to={row.to}
                className="k-hover"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  border: 0,
                  borderBottom: "1px solid var(--border)",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--ink)",
                  textDecoration: "none",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: GREEN, flex: "none" }} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.text}
                </span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 4 4 4-4 4" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sales over time. Drawn from the hourly totals rather than a chart library —
 * two paths, a fill, and the prototype's hover crosshair and tooltip.
 */
function SalesChart({
  today,
  yesterday,
  currency,
}: {
  today: number[];
  yesterday: number[];
  currency: string;
}) {
  const [hover, setHover] = useState(-1);

  const cumulative = (series: number[]) => {
    let running = 0;
    return series.map((value) => (running += value));
  };
  const todayLine = cumulative(today);
  const ydayLine = cumulative(yesterday);
  const max = Math.max(1, ...todayLine, ...ydayLine);

  const X = (index: number) => (index / 23) * 800;
  const Y = (value: number) => 178 - (value / max) * 170;
  const pathOf = (series: number[]) =>
    series.map((value, index) => `${index ? "L" : "M"}${X(index).toFixed(1)} ${Y(value).toFixed(1)}`).join(" ");

  const todayPath = pathOf(todayLine);
  const areaPath = `${todayPath} L${X(todayLine.length - 1).toFixed(1)} 179 L0 179 Z`;

  const tipX = hover >= 0 ? X(hover) : 0;
  const tipLeft = hover >= 0 ? `${(hover / 23) * 100}%` : "0%";
  const tipOpacity = hover >= 0 ? 1 : 0;
  const tipLabel = hover >= 0 ? `${hover % 12 || 12}${hover < 12 ? " AM" : " PM"}` : "";
  const tipToday = hover >= 0 ? money0(todayLine[hover] ?? 0, currency) : "";
  const tipYday = hover >= 0 ? money0(ydayLine[hover] ?? 0, currency) : "";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "var(--shadow)",
        padding: "14px 16px 12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 650 }}>Sales over time</span>
        <span style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--ink-2)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 2, background: "var(--chart)", borderRadius: 2 }} />
            Today
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, borderTop: "2px dashed var(--chart-2)" }} />
            Yesterday
          </span>
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "44px 1fr" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--ink-2)",
            height: 180,
            textAlign: "right",
            paddingRight: 8,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>{money0(max, currency)}</span>
          <span>{money0((max * 2) / 3, currency)}</span>
          <span>{money0(max / 3, currency)}</span>
          <span>$0</span>
        </div>
        <div
          style={{ position: "relative", height: 180 }}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const index = Math.round(((event.clientX - rect.left) / rect.width) * 23);
            const clamped = Math.max(0, Math.min(23, index));
            if (clamped !== hover) setHover(clamped);
          }}
          onMouseLeave={() => setHover(-1)}
        >
          <svg
            viewBox="0 0 800 180"
            preserveAspectRatio="none"
            style={{ width: "100%", height: 180, display: "block", overflow: "visible" }}
          >
            {[0, 60, 120, 179].map((y) => (
              <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={areaPath} fill="var(--chart-fill)" />
            <path
              d={pathOf(ydayLine)}
              fill="none"
              stroke="var(--chart-2)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={todayPath}
              fill="none"
              stroke="var(--chart)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
            <line
              x1={tipX}
              y1="0"
              x2={tipX}
              y2="180"
              stroke="var(--ink-2)"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
              style={{ opacity: tipOpacity }}
            />
          </svg>
          <div
            style={{
              position: "absolute",
              left: tipLeft,
              top: 8,
              transform: "translateX(-50%)",
              background: "var(--ink)",
              color: "var(--bg)",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: "16px",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              opacity: tipOpacity,
              transition: "opacity .1s",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ fontWeight: 600 }}>{tipLabel}</div>
            <div>Today {tipToday}</div>
            <div style={{ opacity: 0.7 }}>Yesterday {tipYday}</div>
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--ink-2)",
          margin: "6px 0 0 44px",
        }}
      >
        <span>12 AM</span>
        <span>4 AM</span>
        <span>8 AM</span>
        <span>12 PM</span>
        <span>4 PM</span>
        <span>8 PM</span>
        <span>11 PM</span>
      </div>
    </div>
  );
}
