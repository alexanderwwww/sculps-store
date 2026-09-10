/**
 * Home.
 *
 * Every number here is a query. With no orders the tiles read $0.00 and the
 * lists show their empty states — the design already draws them, because an
 * honest empty store is the normal first day of a store.
 */
import { Link } from "react-router";
import type { Route } from "./+types/admin._index";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, dashboard, todos, listOrders } from "~/lib/admin.server";
import { money } from "~/lib/money";
import { card, cardHeader, Badge, Empty, PageTitle, primaryButton, secondaryButton } from "~/admin/ui";
import type { BadgeKind } from "~/admin/ui";

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
    return { store: null, rangeKey, metrics: [], todo: [], recent: [], chart: null };
  }

  const [stats, todo, recent] = await Promise.all([
    dashboard(context.db, store.id, range.days),
    todos(context.db, store.id),
    listOrders(context.db, { storeId: store.id, perPage: 6 }),
  ]);

  return {
    store: { slug: store.slug, name: store.name, currency: store.currency },
    rangeKey,
    metrics: stats.metrics,
    todo,
    chart: { today: stats.today, yesterday: stats.yesterday },
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

const STATE_KIND: Record<string, BadgeKind> = {
  new: "warning",
  ordered: "purple",
  fulfilled: "success",
  refunded: "neutral",
};

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  const { store, rangeKey, metrics, todo, recent, chart } = loaderData;

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

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageTitle
        title="Home"
        actions={
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(RANGES).map(([key, range]) => (
              <Link
                key={key}
                to={`/admin?store=${store.slug}&range=${key}`}
                style={{
                  ...secondaryButton,
                  textDecoration: "none",
                  background: key === rangeKey ? "var(--sel)" : "var(--surface)",
                }}
              >
                {range.label}
              </Link>
            ))}
          </div>
        }
      />

      <div
        style={{
          ...card,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
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

      {chart ? <SalesChart today={chart.today} yesterday={chart.yesterday} /> : null}

      <div style={card}>
        <div style={cardHeader}>Things to do</div>
        {todo.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--ink-2)" }}>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>Nothing to do</div>
            Orders needing a supplier order or a tracking number show up here.
          </div>
        ) : (
          todo.map((item) => (
            <Link
              key={item.to}
              to={`${item.to}&store=${store.slug}`}
              className="k-hover"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                color: "var(--ink)",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "var(--b-warning-bg)",
                  color: "var(--b-warning-fg)",
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
              <span style={{ color: "var(--ink-2)" }}>›</span>
            </Link>
          ))
        )}
      </div>

      <div style={card}>
        <div style={cardHeader}>
          <span>Recent orders</span>
          <Link to={`/admin/orders?store=${store.slug}`} style={{ fontSize: 12, fontWeight: 550 }}>
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <Empty
            title="No orders yet"
            help="Paid orders appear here the moment checkout is live and the first customer buys."
          />
        ) : (
          recent.map((order) => (
            <Link
              key={order.id}
              to={`/admin/orders/${order.id}?store=${store.slug}`}
              className="k-hover"
              style={{
                display: "grid",
                gridTemplateColumns: "90px 1.2fr 1.4fr 100px 150px",
                gap: 12,
                alignItems: "center",
                padding: "0 16px",
                height: 44,
                borderBottom: "1px solid var(--border)",
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
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: order.storeColor,
                    flex: "none",
                  }}
                />
                #{order.number}
              </span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {order.customer}
              </span>
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
              <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                {order.total}
              </span>
              <Badge kind={STATE_KIND[order.state] ?? "neutral"}>
                {STATE_LABEL[order.state] ?? order.state}
              </Badge>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Sales over time. Drawn from the hourly totals rather than a chart library —
 * two paths and a fill, which is all the design shows.
 */
function SalesChart({ today, yesterday }: { today: number[]; yesterday: number[] }) {
  const peak = Math.max(1, ...today, ...yesterday);
  const cumulative = (series: number[]) => {
    let running = 0;
    return series.map((value) => (running += value));
  };
  const todayLine = cumulative(today);
  const ydayLine = cumulative(yesterday);
  const max = Math.max(1, ...todayLine, ...ydayLine);

  const toPath = (series: number[]) =>
    series
      .map((value, index) => {
        const x = (index / 23) * 800;
        const y = 179 - (value / max) * 175;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const todayPath = toPath(todayLine);
  const areaPath = `${todayPath} L800,179 L0,179 Z`;

  return (
    <div style={{ ...card, padding: "14px 16px 12px" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "56px 1fr" }}>
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
          <span>{money(max)}</span>
          <span>{money(Math.round(max * 0.66))}</span>
          <span>{money(Math.round(max * 0.33))}</span>
          <span>$0</span>
        </div>
        <div style={{ position: "relative", height: 180 }}>
          <svg viewBox="0 0 800 180" preserveAspectRatio="none" style={{ width: "100%", height: 180, display: "block" }}>
            {[0, 60, 120, 179].map((y) => (
              <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={areaPath} fill="var(--chart-fill)" />
            <path d={toPath(ydayLine)} fill="none" stroke="var(--chart-2)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={todayPath} fill="none" stroke="var(--chart)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {peak === 1 ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: "var(--ink-3)",
                fontSize: 12,
              }}
            >
              No sales in this period
            </div>
          ) : null}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--ink-2)",
          margin: "6px 0 0 56px",
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
