/**
 * Analytics.
 *
 * The numbers are the ones from the approved port — nothing measured here was
 * dropped. What changed is the material: the page sits on `k-ground` and every
 * panel is `k-glass`, the recipe already in `app/admin/admin.css`. Panels are
 * proportioned on the golden ratio (1 : 1.618) rather than halves, which is
 * what makes the layout feel settled instead of split.
 *
 * Every line on this screen is a smooth curve with a soft gradient beneath it
 * (`app/admin/analytics-flow.tsx`) — monotone cubic, so it flows without ever
 * overshooting into a peak that is not in the data. It draws in once on first
 * paint and never on a re-render, and it does not move at all when the person
 * has asked for reduced motion.
 *
 * Where there is nothing to measure the figure is a dash, not a zero. A zero
 * reads like a measurement; a dash reads like "no data yet", which is the truth
 * on a store that has not launched.
 *
 * Ad spend has no source in this system yet, so the Meta strip renders the
 * prototype's own "not connected" state and the marketing table its own empty
 * state. Profit needs a cost per item, which the schema does not carry, so its
 * tile renders in its empty state with that reason on it. No spend, ROAS,
 * margin or profit is invented.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { eq, and, gte, sql } from "drizzle-orm";
import type { Route } from "./+types/admin.analytics";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, analytics } from "~/lib/admin.server";
import { events, orders, metaConfig } from "~/db/schema";
import { formatMoney } from "~/lib/money";
import { Empty, card } from "~/admin/ui";
import { useIsMobile } from "~/admin/use-mobile";
import { FlowLine, FlowStyles } from "~/admin/analytics-flow";

export function meta() {
  return [{ title: "Analytics — Shop Admin" }];
}

const RANGES: Record<string, { label: string; days: number }> = {
  today: { label: "Today", days: 1 },
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
};

const DASH = "—";

/** Neon's http driver returns `{ rows }`; keep this tolerant of either shape. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store)
    return { store: null, data: null, rangeKey: "30d", extra: null, previous: null, behaviour: null };

  const rangeKey = url.searchParams.get("range") || "30d";
  const range = RANGES[rangeKey] ?? RANGES["30d"];

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (range.days - 1));

  // The doubled window minus the current one is the previous period. Only the
  // order-derived figures are read back out of it: sums and counts subtract
  // exactly, whereas a count of distinct sessions does not, so sessions and
  // everything derived from them keep the design's neutral dash.
  const [
    data,
    doubled,
    refundRows,
    regionRows,
    sessionSourceRows,
    metaRow,
    eventDayRows,
    journeyResult,
    pathResult,
    dwellResult,
  ] = await Promise.all([
    analytics(context.db, store.id, range.days),
    analytics(context.db, store.id, range.days * 2),
    context.db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(orders)
      .where(
        and(eq(orders.storeId, store.id), gte(orders.createdAt, since), sql`${orders.refundedCents} > 0`),
      ),
    context.db
      .select({
        region: orders.region,
        revenue: sql<number>`cast(coalesce(sum(${orders.totalCents}), 0) as int)`,
      })
      .from(orders)
      .where(and(eq(orders.storeId, store.id), gte(orders.createdAt, since)))
      .groupBy(orders.region)
      .orderBy(sql`2 desc`)
      .limit(8),
    context.db
      .select({
        source: events.source,
        sessions: sql<number>`cast(count(distinct ${events.sessionId}) as int)`,
      })
      .from(events)
      .where(and(eq(events.storeId, store.id), gte(events.at, since)))
      .groupBy(events.source)
      .orderBy(sql`2 desc`)
      .limit(8),
    context.db.select().from(metaConfig).where(eq(metaConfig.storeId, store.id)).limit(1),

    // Sessions per day per event type, so the cart / checkout / purchase tiles
    // carry their own real curve instead of a decorative baseline.
    context.db
      .select({
        day: sql<string>`to_char(${events.at}, 'YYYY-MM-DD')`,
        type: events.type,
        sessions: sql<number>`cast(count(distinct ${events.sessionId}) as int)`,
      })
      .from(events)
      .where(and(eq(events.storeId, store.id), gte(events.at, since)))
      .groupBy(sql`1, 2`),

    // The journey. A step only counts when it happened *after* the step before
    // it in the same session, so this is the ordered flow and not four
    // independent counts that happen to sit next to each other.
    context.db.execute(sql`
      with s as (
        select ${events.sessionId} as sid,
               min(${events.at}) filter (where ${events.type} = 'view') as v,
               min(${events.at}) filter (where ${events.type} = 'cart') as c,
               min(${events.at}) filter (where ${events.type} = 'checkout') as k,
               min(${events.at}) filter (where ${events.type} = 'purchase') as p
        from ${events}
        where ${events.storeId} = ${store.id} and ${events.at} >= ${since}
        group by 1
      )
      select
        cast(count(*) filter (where v is not null) as int) as viewed,
        cast(count(*) filter (where v is not null and c is not null and c >= v) as int) as to_cart,
        cast(count(*) filter (where c is not null and k is not null and k >= c) as int) as to_checkout,
        cast(count(*) filter (where k is not null and p is not null and p >= k) as int) as to_purchase
      from s
    `),

    // Which pages were seen, and by how many separate sessions.
    context.db.execute(sql`
      select ${events.path} as path,
             cast(count(distinct ${events.sessionId}) as int) as sessions,
             cast(count(*) as int) as views
      from ${events}
      where ${events.storeId} = ${store.id}
        and ${events.at} >= ${since}
        and ${events.type} = 'view'
        and ${events.path} is not null
      group by 1
      order by 2 desc, 3 desc
      limit 8
    `),

    // Dwell time: the gap to the next event in the same session. The last
    // event of a session has no successor, so it is excluded rather than
    // guessed — and the number excluded is reported on the panel. Median, not
    // mean: one tab left open all night must not move the figure.
    context.db.execute(sql`
      with e as (
        select ${events.sessionId} as sid,
               ${events.path} as path,
               ${events.at} as at,
               lead(${events.at}) over (partition by ${events.sessionId} order by ${events.at}) as next_at
        from ${events}
        where ${events.storeId} = ${store.id} and ${events.at} >= ${since}
      ),
      d as (
        select path, extract(epoch from (next_at - at)) as secs, next_at
        from e
        where path is not null
      )
      select path,
             cast(count(*) filter (where next_at is not null) as int) as samples,
             cast(count(*) filter (where next_at is null) as int) as open_ended,
             cast(round(coalesce(percentile_cont(0.5) within group (
               order by case when next_at is not null then secs end
             ), 0)) as int) as median_secs
      from d
      group by 1
      order by 2 desc
      limit 8
    `),
  ]);

  const previous = {
    orderCount: doubled.orderCount - data.orderCount,
    revenue: doubled.revenue - data.revenue,
    refunded: doubled.refunded - data.refunded,
  };

  // One point per day in the range, including the days with nothing on them —
  // byDay only carries the days that had an order.
  const byDayMap = new Map(data.byDay.map((row) => [row.day, row]));
  const eventDayMap = new Map<string, number>();
  for (const row of eventDayRows) eventDayMap.set(`${row.day}|${row.type}`, row.sessions);

  const series: {
    day: string;
    label: string;
    revenue: number;
    carts: number;
    checkouts: number;
    purchases: number;
    sessions: number;
  }[] = [];
  for (let i = 0; i < range.days; i++) {
    const day = new Date(since);
    day.setDate(day.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    series.push({
      day: key,
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue: byDayMap.get(key)?.revenue ?? 0,
      carts: eventDayMap.get(`${key}|cart`) ?? 0,
      checkouts: eventDayMap.get(`${key}|checkout`) ?? 0,
      purchases: eventDayMap.get(`${key}|purchase`) ?? 0,
      sessions: eventDayMap.get(`${key}|view`) ?? 0,
    });
  }

  const journeyRow =
    rowsOf<{ viewed: number; to_cart: number; to_checkout: number; to_purchase: number }>(
      journeyResult,
    )[0] ?? null;

  const dwellRows = rowsOf<{
    path: string;
    samples: number;
    open_ended: number;
    median_secs: number;
  }>(dwellResult);

  const config = metaRow[0] ?? null;

  return {
    store: { slug: store.slug, name: store.name, currency: store.currency },
    rangeKey,
    data,
    previous,
    extra: {
      refundedOrders: refundRows[0]?.n ?? 0,
      byRegion: regionRows.map((row) => ({ region: row.region ?? "Unknown", revenue: row.revenue })),
      sessionsBySource: sessionSourceRows.map((row) => ({
        source: row.source ?? "Direct",
        sessions: row.sessions,
      })),
      series,
      metaConnected: !!(config?.pixelId && config?.capiTokenEnc),
    },
    behaviour: {
      journey: journeyRow
        ? {
            viewed: journeyRow.viewed,
            toCart: journeyRow.to_cart,
            toCheckout: journeyRow.to_checkout,
            toPurchase: journeyRow.to_purchase,
          }
        : { viewed: 0, toCart: 0, toCheckout: 0, toPurchase: 0 },
      paths: rowsOf<{ path: string; sessions: number; views: number }>(pathResult).map((row) => ({
        path: row.path,
        sessions: row.sessions,
        views: row.views,
      })),
      dwell: dwellRows
        .filter((row) => row.samples > 0)
        .map((row) => ({ path: row.path, samples: row.samples, medianSecs: row.median_secs })),
      // Last-in-session events have no successor, so no time on page can be
      // measured for them. They are excluded, and the count is shown.
      dwellExcluded: dwellRows.reduce((total, row) => total + row.open_ended, 0),
    },
  };
}

function pct(part: number, whole: number): string {
  return whole ? `${((part / whole) * 100).toFixed(2)}%` : DASH;
}

function deltaOf(now: number, before: number): { text: string; color: string } {
  if (!before) return { text: DASH, color: "var(--ink-2)" };
  const change = Math.round(((now - before) / before) * 100);
  return {
    text: `${change >= 0 ? "+" : "−"}${Math.abs(change)}%`,
    color: change >= 0 ? "var(--success)" : "var(--critical)",
  };
}

function dwellText(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

/* ------------------------------------------------------------------ chrome */

const glassPanel: React.CSSProperties = { padding: 0, minWidth: 0 };

function PanelHead({
  title,
  right,
  sub,
}: {
  title: string;
  right?: React.ReactNode;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: "14px 20px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 10,
        flexWrap: "wrap",
        borderBottom: "1px solid rgba(255,255,255,.6)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 650, letterSpacing: "-0.01em" }}>{title}</div>
        {sub ? <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}

export default function Analytics({ loaderData }: Route.ComponentProps) {
  const { store, data, rangeKey, extra, previous, behaviour } = loaderData;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [gran, setGran] = useState<"Day" | "Hour">("Day");

  if (!store || !data || !extra || !previous || !behaviour) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const currency = store.currency;
  const range = RANGES[rangeKey] ?? RANGES["30d"];
  const aCols = isMobile ? "1fr" : "repeat(auto-fit,minmax(300px,1fr))";

  const previousAov = previous.orderCount ? Math.round(previous.revenue / previous.orderCount) : 0;
  const grossSales = data.revenue;
  const netSales = data.revenue - data.refunded;
  const previousNet = previous.revenue - previous.refunded;
  const salesDelta = deltaOf(netSales, previousNet);
  const grossDelta = deltaOf(grossSales, previous.revenue);
  const orderDelta = deltaOf(data.orderCount, previous.orderCount);
  const aovDelta = deltaOf(data.averageOrder ?? 0, previousAov);
  const refundRateNow = data.revenue ? (data.refunded / data.revenue) * 100 : 0;
  const refundRateBefore = previous.revenue ? (previous.refunded / previous.revenue) * 100 : 0;
  const refundDelta = deltaOf(refundRateNow, refundRateBefore);
  const neutral = { text: DASH, color: "var(--ink-2)" };

  const revenueSeries = extra.series.map((point) => point.revenue);
  const cartSeries = extra.series.map((point) => point.carts);
  const checkoutSeries = extra.series.map((point) => point.checkouts);
  const purchaseSeries = extra.series.map((point) => point.purchases);
  const sessionSeries = extra.series.map((point) => point.sessions);
  const flat = extra.series.map(() => 0);

  // The six figures he named. Profit is the seventh and it is deliberately
  // empty: there is no cost per item in the schema, and a margin guessed here
  // would be the one number on the page nobody could trust.
  const headline: {
    label: string;
    value: string;
    delta: { text: string; color: string };
    note: string;
    series: number[];
    tint: string;
    muted?: boolean;
  }[] = [
    {
      label: "Total sales",
      value: formatMoney(netSales, currency),
      delta: salesDelta,
      note: "gross, minus refunds",
      series: revenueSeries,
      tint: "var(--chart)",
    },
    {
      label: "Gross sales",
      value: formatMoney(grossSales, currency),
      delta: grossDelta,
      note: "before refunds",
      series: revenueSeries,
      tint: "#7C5CFF",
    },
    {
      label: "Add to carts",
      value: data.funnel.carts ? data.funnel.carts.toLocaleString() : DASH,
      delta: neutral,
      note: "sessions that added",
      series: cartSeries,
      tint: "#0EA5A5",
    },
    {
      label: "Checkouts",
      value: data.funnel.checkouts ? data.funnel.checkouts.toLocaleString() : DASH,
      delta: neutral,
      note: "sessions that started",
      series: checkoutSeries,
      tint: "#F59E0B",
    },
    {
      label: "Purchases",
      value: data.orderCount ? data.orderCount.toLocaleString() : DASH,
      delta: orderDelta,
      note: "paid + pending",
      series: purchaseSeries,
      tint: "#16A34A",
    },
    {
      label: "Profit",
      value: DASH,
      delta: neutral,
      note: "needs a cost per item",
      series: flat,
      tint: "var(--ink-3)",
      muted: true,
    },
  ];

  const secondary = [
    { label: "Sessions", value: data.sessions ? data.sessions.toLocaleString() : DASH, delta: neutral, note: "unique visits", series: sessionSeries },
    { label: "Conversion rate", value: data.conversion === null ? DASH : `${data.conversion.toFixed(2)}%`, delta: neutral, note: "sessions → paid", series: flat },
    { label: "Average order value", value: data.averageOrder === null ? DASH : formatMoney(data.averageOrder, currency), delta: aovDelta, note: "per paid order", series: flat },
    { label: "Orders", value: String(data.orderCount), delta: orderDelta, note: "paid + pending", series: purchaseSeries },
    // No customer identity is carried across orders yet, so a returning-customer
    // rate cannot be measured. The design's own dash stands in.
    { label: "Returning customer rate", value: DASH, delta: neutral, note: "second-time buyers", series: flat },
    { label: "Refund rate", value: data.revenue ? pct(data.refunded, data.revenue) : DASH, delta: refundDelta, note: "refunded / paid", series: flat },
  ];

  // The chart. Day granularity is drawn from the real per-day series; there is
  // no hourly source on this screen, so Hour keeps a flat baseline and says so.
  const chartMax = Math.max(1, ...revenueSeries);
  const chartValues = gran === "Day" ? revenueSeries : extra.series.map(() => 0);

  const xLabels =
    gran === "Hour"
      ? ["12 AM", "4 AM", "8 AM", "12 PM", "4 PM", "8 PM", "11 PM"]
      : pickLabels(extra.series.map((point) => point.label));

  const yTicks = [chartMax, (chartMax * 2) / 3, chartMax / 3, 0].map((value) =>
    formatMoney(Math.round(value), currency),
  );

  const barsOf = <T,>(rows: T[], valueOf: (row: T) => number) => {
    const top = Math.max(1, ...rows.map(valueOf));
    return (row: T) => `${Math.max(2, (valueOf(row) / top) * 100)}%`;
  };

  const storeBar = barsOf([data], (d) => d.revenue);
  const variantBar = barsOf(data.topVariants, (v) => v.revenue);
  const unitsBar = barsOf(data.topVariants, (v) => v.units);
  const sourceBar = barsOf(extra.sessionsBySource, (s) => s.sessions);
  const regionBar = barsOf(extra.byRegion, (r) => r.revenue);

  const zero = (label: string) => [{ key: label, label, value: DASH, bar: "0%" }];

  const aBreakdowns = [
    {
      title: "Sales by store",
      unit: "sales",
      rows: data.revenue
        ? [{ key: store.slug, label: store.name, value: formatMoney(data.revenue, currency), bar: storeBar(data) }]
        : zero("No sales in this period"),
    },
    {
      title: "Sales by bundle option",
      unit: "sales",
      rows: data.topVariants.length
        ? data.topVariants.map((row) => ({
            key: row.label,
            label: row.label,
            value: formatMoney(row.revenue, currency),
            bar: variantBar(row),
          }))
        : zero("No sales in this period"),
    },
    {
      title: "Sessions by traffic source",
      unit: "sessions",
      rows: extra.sessionsBySource.length
        ? extra.sessionsBySource.map((row) => ({
            key: row.source,
            label: row.source,
            value: String(row.sessions),
            bar: sourceBar(row),
          }))
        : zero("No sessions in this period"),
    },
    // Nothing on this screen reads the visitor's device, so this one has no
    // source at all and keeps the design's empty row.
    { title: "Sessions by device", unit: "sessions", rows: zero("No sessions in this period") },
    {
      title: "Top products by units sold",
      unit: "units",
      rows: data.topVariants.length
        ? data.topVariants.map((row) => ({
            key: row.label,
            label: row.label,
            value: String(row.units),
            bar: unitsBar(row),
          }))
        : zero("No units sold"),
    },
    {
      title: "Sales by state",
      unit: "sales",
      rows: extra.byRegion.length
        ? extra.byRegion.map((row) => ({
            key: row.region,
            label: row.region,
            value: formatMoney(row.revenue, currency),
            bar: regionBar(row),
          }))
        : zero("No sales in this period"),
    },
  ];

  const aRefunds = [
    {
      label: "Refunds issued",
      value: formatMoney(data.refunded, currency),
      sub: `${extra.refundedOrders} order${extra.refundedOrders === 1 ? "" : "s"}`,
    },
    { label: "Refund rate", value: data.revenue ? pct(data.refunded, data.revenue) : DASH, sub: "of paid orders" },
    // Chargebacks are not recorded anywhere yet.
    { label: "Chargebacks opened", value: DASH, sub: "no history yet" },
    { label: "Chargebacks won", value: DASH, sub: "no history yet" },
  ];

  const chipButton: React.CSSProperties = {
    height: 30,
    padding: "0 13px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.7)",
    background: "rgba(255,255,255,.55)",
    backdropFilter: "blur(14px) saturate(180%)",
    WebkitBackdropFilter: "blur(14px) saturate(180%)",
    color: "var(--ink)",
    fontSize: 12,
    fontWeight: 550,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(20,16,40,.10), inset 0 1px 0 rgba(255,255,255,.9)",
    textDecoration: "none",
  };

  return (
    <div
      className="k-ground"
      style={{ margin: "-16px", padding: "16px", borderRadius: 22 }}
    >
      <FlowStyles />
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, lineHeight: "32px", fontWeight: 650, letterSpacing: "-0.02em" }}>
              Analytics
            </h1>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
              {store.name} · {range.label}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <button type="button" onClick={() => setRangeOpen((open) => !open)} style={chipButton}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                  <rect x="2" y="3" width="12" height="11" rx="2" />
                  <path d="M2 7h12M5 1.5v3M11 1.5v3" />
                </svg>
                {range.label}
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="m4 6 4 4 4-4" />
                </svg>
              </button>
              {rangeOpen ? (
                <div
                  className="k-glass k-glass--tight"
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 38,
                    width: 190,
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
                        setRangeOpen(false);
                        navigate(`/admin/analytics?store=${store.slug}&range=${key}`);
                      }}
                      className="k-hover"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        border: 0,
                        borderRadius: 10,
                        background: key === rangeKey ? "rgba(255,255,255,.75)" : "transparent",
                        cursor: "pointer",
                        fontSize: 13,
                        color: "var(--ink)",
                        position: "relative",
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" onClick={() => setCompare((on) => !on)} style={{ ...chipButton, gap: 8 }}>
              <span
                style={{
                  width: 26,
                  height: 15,
                  borderRadius: 8,
                  background: compare ? "var(--accent)" : "var(--border-strong)",
                  position: "relative",
                  flex: "none",
                  transition: "background .15s",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: compare ? 15 : 2,
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left .15s",
                  }}
                />
              </span>
              Compare to previous period
            </button>
            <Link to={`/admin/orders/export?store=${store.slug}`} reloadDocument style={chipButton}>
              Export
            </Link>
          </div>
        </div>

        {/* meta ads — no ad-spend source exists, so this is always the design's
            "not connected" state until Meta reporting is wired up */}
        {!extra.metaConnected ? (
          <div
            className="k-glass k-glass--tight k-glass--flat"
            style={{ padding: "16px 20px", display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: "var(--b-info-bg)",
                color: "var(--b-info-fg)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                flex: "none",
              }}
            >
              M
            </span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 650 }}>Meta ads · not connected</div>
              <div style={{ color: "var(--ink-2)" }}>
                Connect Meta to pull ad spend into this page. Spend, revenue, ROAS and profit per campaign
                appear in Marketing below once it&rsquo;s linked.
              </div>
            </div>
            <Link
              to={`/admin/meta?store=${store.slug}`}
              style={{
                ...chipButton,
                background: "var(--accent)",
                color: "var(--accent-ink)",
                border: "1px solid var(--accent)",
                fontWeight: 600,
                flex: "none",
              }}
            >
              Connect Meta
            </Link>
          </div>
        ) : null}
        {extra.metaConnected ? (
          <div className="k-glass k-glass--tight" style={{ ...glassPanel, overflow: "hidden" }}>
            <PanelHead
              title="Meta ads"
              right={
                <Link to={`/admin/meta?store=${store.slug}`} style={{ fontSize: 12, fontWeight: 550 }}>
                  Manage
                </Link>
              }
              sub="Connected"
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              {/* Spend, attributed revenue, ROAS and profit all need Meta's
                  reporting API. Until it is connected there is no number to show
                  and a dash is the honest one. */}
              {[
                { label: "Ad spend", value: DASH },
                { label: "Attributed revenue", value: DASH },
                { label: "ROAS", value: DASH },
                { label: "Profit", value: DASH },
              ].map((tile) => (
                <div key={tile.label} style={{ padding: "14px 20px" }}>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 550 }}>{tile.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{tile.value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* the six he named, plus profit in its empty state */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(214px,1fr))",
            gap: 16,
          }}
        >
          {headline.map((metric) => (
            <div
              key={metric.label}
              className="k-glass k-glass--tight k-lift"
              style={{ padding: "16px 18px 12px", minWidth: 0, opacity: metric.muted ? 0.86 : 1 }}
            >
              <div style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>{metric.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{
                    fontSize: 27,
                    lineHeight: "34px",
                    fontWeight: 650,
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                    color: metric.muted ? "var(--ink-3)" : "var(--ink)",
                  }}
                >
                  {metric.value}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: metric.delta.color }}>{metric.delta.text}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <FlowLine values={metric.series} width={220} height={36} stroke={metric.tint} strokeWidth={1.75} />
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{metric.note}</div>
            </div>
          ))}
        </div>

        {/* sales over time */}
        <div className="k-glass" style={{ ...glassPanel, padding: "16px 20px 14px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 650, letterSpacing: "-0.01em" }}>Total sales over time</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 30, lineHeight: "36px", fontWeight: 650, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(data.revenue, currency)}
                </span>
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  {compare ? "vs previous period" : "no comparison"}
                </span>
              </div>
            </div>
            <span
              style={{
                display: "inline-flex",
                border: "1px solid rgba(255,255,255,.7)",
                background: "rgba(255,255,255,.5)",
                borderRadius: 999,
                overflow: "hidden",
                height: 30,
              }}
            >
              {(["Day", "Hour"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setGran(option)}
                  style={{
                    padding: "0 14px",
                    border: 0,
                    background: gran === option ? "rgba(255,255,255,.9)" : "transparent",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 550,
                    cursor: "pointer",
                  }}
                >
                  {option}
                </button>
              ))}
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
                height: 190,
                textAlign: "right",
                paddingRight: 10,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {yTicks.map((tick, index) => (
                <span key={index}>{tick}</span>
              ))}
            </div>
            <div style={{ position: "relative", height: 190 }}>
              <svg
                viewBox="0 0 760 190"
                preserveAspectRatio="none"
                style={{ position: "absolute", inset: 0, width: "100%", height: 190 }}
                aria-hidden="true"
              >
                {[3, 65, 127, 187].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    y1={y}
                    x2="760"
                    y2={y}
                    stroke="rgba(20,16,40,.09)"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              <div style={{ position: "absolute", inset: 0 }}>
                <FlowLine
                  values={chartValues}
                  width={760}
                  height={190}
                  max={gran === "Day" ? chartMax : 1}
                  strokeWidth={2.4}
                  pad={{ top: 6, bottom: 3 }}
                />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-2)", margin: "8px 0 0 56px" }}>
            {xLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
          {gran === "Hour" ? (
            // Nothing on this screen groups sales by hour of day, so the Hour
            // view has no series to draw. It says so rather than reshaping the
            // daily numbers into something that looks hourly.
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, marginLeft: 56 }}>
              No hourly breakdown is recorded yet — sales are stored per day.
            </div>
          ) : null}
        </div>

        {/* ---------------------------------------------- visitor behaviour map */}
        <BehaviourMap behaviour={behaviour} isMobile={isMobile} />

        {/* secondary metrics */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(214px,1fr))", gap: 16 }}>
          {secondary.map((metric) => (
            <div key={metric.label} className="k-glass k-glass--tight k-lift" style={{ padding: "14px 18px 10px", minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>{metric.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 23, lineHeight: "30px", fontWeight: 650, letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums" }}>
                  {metric.value}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: metric.delta.color }}>{metric.delta.text}</span>
              </div>
              <div style={{ marginTop: 4 }}>
                <FlowLine values={metric.series} width={220} height={30} strokeWidth={1.6} stroke="var(--chart-2)" />
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{metric.note}</div>
            </div>
          ))}
        </div>

        {/* breakdowns */}
        <div style={{ display: "grid", gridTemplateColumns: aCols, gap: 16 }}>
          {aBreakdowns.map((breakdown) => (
            <div key={breakdown.title} className="k-glass k-glass--tight" style={{ ...glassPanel, overflow: "hidden" }}>
              <PanelHead
                title={breakdown.title}
                right={<span style={{ fontSize: 11, color: "var(--ink-2)" }}>{breakdown.unit}</span>}
              />
              {breakdown.rows.map((row) => (
                <div
                  key={row.key}
                  style={{
                    padding: "13px 20px",
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) auto",
                    gap: "6px 10px",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--ink-2)", overflowWrap: "anywhere" }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
                  <span
                    style={{
                      gridColumn: "1 / -1",
                      height: 6,
                      borderRadius: 3,
                      background: "rgba(20,16,40,.07)",
                      display: "block",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: 6,
                        width: row.bar,
                        background: "linear-gradient(90deg, var(--chart), #7C5CFF)",
                        borderRadius: 3,
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* marketing — there is no ad-spend source, so the table keeps its markup
            and renders the design's own empty state */}
        <div className="k-glass k-glass--tight" style={{ ...glassPanel, overflow: "hidden" }}>
          <PanelHead
            title="Marketing · sales attributed to Meta ads"
            right={<span style={{ fontSize: 12, color: "var(--ink-2)" }}>{range.label}</span>}
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr
                  style={{
                    height: 38,
                    color: "var(--ink-2)",
                    fontSize: 12,
                    fontWeight: 550,
                    textAlign: "left",
                    borderBottom: "1px solid rgba(255,255,255,.6)",
                  }}
                >
                  <th style={{ padding: "0 20px", fontWeight: 550 }}>Campaign</th>
                  <th style={{ padding: "0 12px", fontWeight: 550 }}>Ad</th>
                  <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "right" }}>Spend</th>
                  <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "right" }}>Revenue</th>
                  <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "right" }}>ROAS</th>
                  <th style={{ padding: "0 20px", fontWeight: 550, textAlign: "right" }}>Profit</th>
                </tr>
              </thead>
              <tbody />
            </table>
          </div>
          <div style={{ padding: "40px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 13,
                background: "rgba(255,255,255,.6)",
                display: "grid",
                placeItems: "center",
                color: "var(--ink-3)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M4 16V9M10 16V4M16 16v-5" />
              </svg>
            </span>
            <div style={{ fontWeight: 650 }}>No attributed sales yet</div>
            <div style={{ color: "var(--ink-2)", maxWidth: 420 }}>
              Campaign spend, revenue, ROAS and profit appear here once Meta ads is connected and a store
              starts taking orders.
            </div>
          </div>
        </div>

        {/* refunds */}
        <div className="k-glass k-glass--tight" style={{ ...glassPanel, overflow: "hidden" }}>
          <PanelHead title="Refunds and chargebacks" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
            {aRefunds.map((row) => (
              <div key={row.label} style={{ padding: "14px 20px" }}>
                <div style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>{row.label}</div>
                <div style={{ fontSize: 20, lineHeight: "26px", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                  {row.value}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{row.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------- visitor behaviour map --- */

type Behaviour = {
  journey: { viewed: number; toCart: number; toCheckout: number; toPurchase: number };
  paths: { path: string; sessions: number; views: number }[];
  dwell: { path: string; samples: number; medianSecs: number }[];
  dwellExcluded: number;
};

/**
 * Where people went, what they saw, and how long they stayed.
 *
 * Everything here is computed from the `events` table in the loader. Nothing is
 * modelled, sampled or filled in: an empty section says what is missing instead
 * of showing a shape with invented numbers inside it.
 */
function BehaviourMap({ behaviour, isMobile }: { behaviour: Behaviour; isMobile: boolean }) {
  const { journey, paths, dwell, dwellExcluded } = behaviour;
  const steps = [
    { label: "Viewed", value: journey.viewed, tint: "var(--chart)" },
    { label: "Added to cart", value: journey.toCart, tint: "#7C5CFF" },
    { label: "Checkout", value: journey.toCheckout, tint: "#F59E0B" },
    { label: "Purchased", value: journey.toPurchase, tint: "#16A34A" },
  ];
  const hasJourney = journey.viewed > 0;

  // Geometry for the flow. Bars sit on one baseline and each ribbon tapers from
  // the height of the step before it to the height of the step after, so the
  // drop-off is the shape of the gap rather than a number bolted on top.
  const W = 760;
  const H = 150;
  const base = H - 2;
  const barW = 84;
  const gap = (W - steps.length * barW) / (steps.length - 1);
  const peak = Math.max(1, ...steps.map((step) => step.value));
  const geo = steps.map((step, index) => {
    const x = index * (barW + gap);
    const h = Math.max(step.value > 0 ? 6 : 0, (step.value / peak) * (H - 12));
    return { ...step, x, h, y: base - h };
  });

  const panel: React.CSSProperties = { minWidth: 0 };

  return (
    <div
      style={{
        display: "grid",
        // 1 : 1.618. The flow is the thing you look at; the lists support it.
        gridTemplateColumns: isMobile ? "1fr" : "1.618fr 1fr",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div className="k-glass" style={{ ...panel, overflow: "hidden" }}>
        <PanelHead
          title="Visitor behaviour map"
          sub="Every step below is a session that reached it after the step before it"
          right={
            hasJourney ? (
              <span style={{ fontSize: 12, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                {journey.viewed.toLocaleString()} session{journey.viewed === 1 ? "" : "s"}
              </span>
            ) : null
          }
        />
        {hasJourney ? (
          <div style={{ padding: "18px 20px 16px" }}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 150, display: "block" }} aria-hidden="true">
              <defs>
                {geo.map((step, index) => (
                  <linearGradient key={step.label} id={`bmap-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={step.tint} stopOpacity="0.55" />
                    <stop offset="100%" stopColor={step.tint} stopOpacity="0.16" />
                  </linearGradient>
                ))}
              </defs>
              {/* the ribbons: one smooth cubic from each step down to the next */}
              {geo.slice(0, -1).map((step, index) => {
                const next = geo[index + 1];
                const x0 = step.x + barW;
                const x1 = next.x;
                const mid = (x1 - x0) / 2;
                const d = `M${x0} ${step.y} C${x0 + mid} ${step.y} ${x1 - mid} ${next.y} ${x1} ${next.y} L${x1} ${base} L${x0} ${base} Z`;
                return <path key={step.label} d={d} fill={step.tint} opacity="0.13" />;
              })}
              {geo.map((step, index) => (
                <rect
                  key={step.label}
                  x={step.x}
                  y={step.y}
                  width={barW}
                  height={step.h}
                  rx="10"
                  fill={`url(#bmap-${index})`}
                  stroke={step.tint}
                  strokeOpacity="0.35"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length},1fr)`, gap: 8, marginTop: 10 }}>
              {geo.map((step, index) => {
                const before = index === 0 ? null : geo[index - 1].value;
                const lost = before === null ? null : before - step.value;
                return (
                  <div key={step.label} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 550 }}>{step.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.015em" }}>
                      {step.value.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {lost === null
                        ? "reached this page"
                        : before
                          ? `${lost.toLocaleString()} stopped here · ${((step.value / before) * 100).toFixed(1)}% carried on`
                          : "nothing reached the step before"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // No session has a view event in this range, so there is no journey to
          // draw. Nothing is sketched in its place.
          <Empty
            title="No visitor journeys yet"
            help="The flow from viewed to purchased is built from tracked page views. Nothing has been recorded for this store in this period."
          />
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div className="k-glass k-glass--tight" style={{ ...panel, overflow: "hidden" }}>
          <PanelHead
            title="Where they went"
            right={<span style={{ fontSize: 11, color: "var(--ink-2)" }}>sessions</span>}
          />
          {paths.length ? (
            <div>
              {paths.map((row) => {
                const top = Math.max(1, ...paths.map((p) => p.sessions));
                return (
                  <div key={row.path} style={{ padding: "11px 20px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "5px 10px", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "var(--ink-2)", overflowWrap: "anywhere" }}>{row.path}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {row.sessions.toLocaleString()}
                    </span>
                    <span style={{ gridColumn: "1 / -1", height: 5, borderRadius: 3, background: "rgba(20,16,40,.07)", display: "block", overflow: "hidden" }}>
                      <span
                        style={{
                          display: "block",
                          height: 5,
                          width: `${Math.max(2, (row.sessions / top) * 100)}%`,
                          borderRadius: 3,
                          background: "linear-gradient(90deg, var(--chart), #7C5CFF)",
                        }}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            // No view event carries a path in this range.
            <Empty
              title="No pages recorded"
              help="Page views with a path have not been tracked for this store in this period."
            />
          )}
        </div>

        <div className="k-glass k-glass--tight" style={{ ...panel, overflow: "hidden" }}>
          <PanelHead
            title="How long they stayed"
            sub="Median time between one event and the next in the same session"
            right={<span style={{ fontSize: 11, color: "var(--ink-2)" }}>median</span>}
          />
          {dwell.length ? (
            <div>
              {dwell.map((row) => (
                <div
                  key={row.path}
                  style={{
                    padding: "11px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--ink-2)", overflowWrap: "anywhere", minWidth: 0 }}>
                    {row.path}
                    <span style={{ color: "var(--ink-3)", fontSize: 11 }}>
                      {" "}
                      · {row.samples.toLocaleString()} measured
                    </span>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 650, fontVariantNumeric: "tabular-nums", flex: "none" }}>
                    {dwellText(row.medianSecs)}
                  </span>
                </div>
              ))}
              {dwellExcluded ? (
                <div style={{ padding: "10px 20px 14px", fontSize: 11, color: "var(--ink-3)", borderTop: "1px solid rgba(255,255,255,.6)" }}>
                  {dwellExcluded.toLocaleString()} event{dwellExcluded === 1 ? " was" : "s were"} the last in
                  a session and had no next event to measure against, so {dwellExcluded === 1 ? "it is" : "they are"}{" "}
                  excluded rather than guessed.
                </div>
              ) : null}
            </div>
          ) : (
            // Every event with a path is the last one in its session, so no gap
            // can be measured. The count is still reported.
            <Empty
              title="No time on page yet"
              help={
                dwellExcluded
                  ? `${dwellExcluded.toLocaleString()} event${dwellExcluded === 1 ? " was" : "s were"} the last in a session, so there is no next event to measure a stay against. Nothing is estimated.`
                  : "Time on page is the gap between one tracked event and the next in the same session. Nothing has been recorded for this store in this period."
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Seven evenly spaced labels, the way the prototype's axis reads. */
function pickLabels(labels: string[]): string[] {
  if (labels.length <= 7) return labels;
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(labels[Math.round((i / 6) * (labels.length - 1))]);
  return out;
}
