/**
 * Analytics.
 *
 * Transliterated from `design/port/analytics.html`; every style string is the
 * prototype's. Where there is nothing to measure the figure is a dash, not a
 * zero. A zero reads like a measurement; a dash reads like "no data yet",
 * which is the truth on a store that has not launched.
 *
 * Ad spend has no source in this system yet, so the Meta strip renders the
 * prototype's own "not connected" state and the marketing table its own empty
 * state. No spend, ROAS or profit is invented.
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

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, data: null, rangeKey: "30d", extra: null, previous: null };

  const rangeKey = url.searchParams.get("range") || "30d";
  const range = RANGES[rangeKey] ?? RANGES["30d"];

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (range.days - 1));

  // The doubled window minus the current one is the previous period. Only the
  // order-derived figures are read back out of it: sums and counts subtract
  // exactly, whereas a count of distinct sessions does not, so sessions and
  // everything derived from them keep the design's neutral dash.
  const [data, doubled, refundRows, regionRows, sessionSourceRows, metaRow] = await Promise.all([
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
  ]);

  const previous = {
    orderCount: doubled.orderCount - data.orderCount,
    revenue: doubled.revenue - data.revenue,
    refunded: doubled.refunded - data.refunded,
  };

  // One point per day in the range, including the days with nothing on them —
  // byDay only carries the days that had an order.
  const byDayMap = new Map(data.byDay.map((row) => [row.day, row]));
  const series: { day: string; label: string; revenue: number }[] = [];
  for (let i = 0; i < range.days; i++) {
    const day = new Date(since);
    day.setDate(day.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    series.push({
      day: key,
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue: byDayMap.get(key)?.revenue ?? 0,
    });
  }

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
  };
}

/** The prototype's flat baseline, used wherever there is no series to draw. */
const FLAT_SPARK = "M0 26 L120 26";

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

export default function Analytics({ loaderData }: Route.ComponentProps) {
  const { store, data, rangeKey, extra, previous } = loaderData;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [gran, setGran] = useState<"Day" | "Hour">("Day");

  if (!store || !data || !extra || !previous) {
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
  const salesDelta = deltaOf(data.revenue, previous.revenue);
  const orderDelta = deltaOf(data.orderCount, previous.orderCount);
  const aovDelta = deltaOf(data.averageOrder ?? 0, previousAov);
  const refundRateNow = data.revenue ? (data.refunded / data.revenue) * 100 : 0;
  const refundRateBefore = previous.revenue ? (previous.refunded / previous.revenue) * 100 : 0;
  const refundDelta = deltaOf(refundRateNow, refundRateBefore);
  const neutral = { text: DASH, color: "var(--ink-2)" };

  // The sales sparkline, on the same 120×30 box the prototype draws.
  const peak = Math.max(1, ...extra.series.map((point) => point.revenue));
  const salesSpark = extra.series.length
    ? extra.series
        .map((point, index) => {
          const x = extra.series.length > 1 ? (index / (extra.series.length - 1)) * 120 : 0;
          const y = 28 - (point.revenue / peak) * 26;
          return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ")
    : FLAT_SPARK;

  const aCards = [
    { label: "Total sales", value: formatMoney(data.revenue, currency), delta: salesDelta, note: "gross, minus refunds", spark: salesSpark },
    { label: "Sessions", value: data.sessions ? data.sessions.toLocaleString() : DASH, delta: neutral, note: "unique visits", spark: FLAT_SPARK },
    { label: "Conversion rate", value: data.conversion === null ? DASH : `${data.conversion.toFixed(2)}%`, delta: neutral, note: "sessions → paid", spark: FLAT_SPARK },
    { label: "Average order value", value: data.averageOrder === null ? DASH : formatMoney(data.averageOrder, currency), delta: aovDelta, note: "per paid order", spark: FLAT_SPARK },
    { label: "Orders", value: String(data.orderCount), delta: orderDelta, note: "paid + pending", spark: FLAT_SPARK },
    // No customer identity is carried across orders yet, so a returning-customer
    // rate cannot be measured. The design's own dash stands in.
    { label: "Returning customer rate", value: DASH, delta: neutral, note: "second-time buyers", spark: FLAT_SPARK },
    { label: "Refund rate", value: data.revenue ? pct(data.refunded, data.revenue) : DASH, delta: refundDelta, note: "refunded / paid", spark: FLAT_SPARK },
  ];

  // The chart. Day granularity is drawn from the real per-day series; there is
  // no hourly source on this screen, so Hour keeps the prototype's baseline.
  const chartMax = Math.max(1, ...extra.series.map((point) => point.revenue));
  const dayPath = extra.series.length
    ? extra.series
        .map((point, index) => {
          const x = extra.series.length > 1 ? (index / (extra.series.length - 1)) * 760 : 0;
          const y = 157 - (point.revenue / chartMax) * 156;
          return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ")
    : "M0 157 L760 157";
  const chartPath = gran === "Day" ? dayPath : "M0 157 L760 157";

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
    // Nothing records the visitor's device, so this one has no source at all.
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

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Analytics</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setRangeOpen((open) => !open)}
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
            {rangeOpen ? (
              <div
                onClick={(event) => event.stopPropagation()}
                style={{
                  position: "absolute",
                  right: 0,
                  top: 34,
                  width: 190,
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
                      setRangeOpen(false);
                      navigate(`/admin/analytics?store=${store.slug}&range=${key}`);
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
          <button
            type="button"
            onClick={() => setCompare((on) => !on)}
            className="k-hover"
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 12,
              fontWeight: 550,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              boxShadow: "var(--shadow)",
            }}
          >
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
          <Link
            to={`/admin/orders/export?store=${store.slug}`}
            reloadDocument
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
              cursor: "pointer",
              boxShadow: "var(--shadow)",
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            Export
          </Link>
        </div>
      </div>

      {/* meta ads — no ad-spend source exists, so this is always the design's
          "not connected" state until Meta reporting is wired up */}
      {!extra.metaConnected ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--shadow)",
            padding: 16,
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
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
              flex: "none",
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            Connect Meta
          </Link>
        </div>
      ) : null}
      {extra.metaConnected ? (
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
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 650 }}>Meta ads</span>
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
                background: "var(--b-success-bg)",
                color: "var(--b-success-fg)",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
              Connected
            </span>
            <span style={{ flex: 1 }} />
            <Link
              to={`/admin/meta?store=${store.slug}`}
              style={{ border: 0, background: "transparent", color: "var(--link)", fontSize: 12, fontWeight: 550, cursor: "pointer", padding: 0 }}
            >
              Manage
            </Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            {/* Spend, attributed revenue, ROAS and profit all need Meta's
                reporting API. Until it is connected there is no number to show
                and a dash is the honest one. */}
            {[
              { label: "Ad spend", value: DASH },
              { label: "Attributed revenue", value: DASH },
              { label: "ROAS", value: DASH },
              { label: "Profit", value: DASH },
            ].map((tile, index, all) => (
              <div
                key={tile.label}
                style={{ padding: "12px 16px", borderRight: index === all.length - 1 ? undefined : "1px solid var(--border)" }}
              >
                <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 550 }}>{tile.label}</div>
                <div style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{tile.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: aCols, gap: 16 }}>
        {aCards.map((metric) => (
          <div
            key={metric.label}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--shadow)",
              padding: "14px 16px 10px",
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>{metric.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 24, lineHeight: "30px", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                {metric.value}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: metric.delta.color }}>{metric.delta.text}</span>
            </div>
            <svg viewBox="0 0 120 30" preserveAspectRatio="none" style={{ width: "100%", height: 30, display: "block", marginTop: 4 }}>
              <path d={metric.spark} fill="none" stroke="var(--chart)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{metric.note}</div>
          </div>
        ))}
      </div>

      {/* sales over time */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow)",
          padding: "14px 16px 12px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 6,
          }}
        >
          <div>
            <div style={{ fontWeight: 650 }}>Total sales over time</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 26, lineHeight: "32px", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(data.revenue, currency)}
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                {compare ? "vs previous period" : "no comparison"}
              </span>
            </div>
          </div>
          <span style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", height: 28 }}>
            <button
              type="button"
              onClick={() => setGran("Day")}
              style={{
                padding: "0 12px",
                border: 0,
                background: gran === "Day" ? "var(--accent-soft)" : "transparent",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 550,
                cursor: "pointer",
              }}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setGran("Hour")}
              style={{
                padding: "0 12px",
                border: 0,
                borderLeft: "1px solid var(--border)",
                background: gran === "Hour" ? "var(--accent-soft)" : "transparent",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 550,
                cursor: "pointer",
              }}
            >
              Hour
            </button>
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
              height: 160,
              textAlign: "right",
              paddingRight: 8,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {yTicks.map((tick, index) => (
              <span key={index}>{tick}</span>
            ))}
          </div>
          <svg viewBox="0 0 760 160" preserveAspectRatio="none" style={{ width: "100%", height: 160, display: "block" }}>
            {[1, 53, 105, 157].map((y) => (
              <line key={y} x1="0" y1={y} x2="760" y2={y} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={chartPath} fill="none" stroke="var(--chart)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-2)", margin: "6px 0 0 44px" }}>
          {xLabels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
      </div>

      {/* breakdowns */}
      <div style={{ display: "grid", gridTemplateColumns: aCols, gap: 16 }}>
        {aBreakdowns.map((breakdown) => (
          <div
            key={breakdown.title}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--shadow)",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <span style={{ fontWeight: 650 }}>{breakdown.title}</span>
              <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{breakdown.unit}</span>
            </div>
            {breakdown.rows.map((row) => (
              <div
                key={row.key}
                style={{
                  padding: "14px 16px",
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
                    background: "var(--bg)",
                    display: "block",
                  }}
                >
                  <span style={{ display: "block", height: 6, width: row.bar, background: "var(--chart)", borderRadius: 3 }} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* marketing — there is no ad-spend source, so the table keeps its markup
          and renders the design's own empty state */}
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
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: 650 }}>Marketing · sales attributed to Meta ads</span>
          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{range.label}</span>
        </div>
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
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={{ padding: "0 16px", fontWeight: 550 }}>Campaign</th>
                <th style={{ padding: "0 12px", fontWeight: 550 }}>Ad</th>
                <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "right" }}>Spend</th>
                <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "right" }}>Revenue</th>
                <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "right" }}>ROAS</th>
                <th style={{ padding: "0 16px", fontWeight: 550, textAlign: "right" }}>Profit</th>
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
              borderRadius: 11,
              background: "var(--bg)",
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
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 650 }}>
          Refunds and chargebacks
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
          {aRefunds.map((row) => (
            <div key={row.label} style={{ padding: "14px 16px", borderRight: "1px solid var(--border)" }}>
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
  );
}

/** Seven evenly spaced labels, the way the prototype's axis reads. */
function pickLabels(labels: string[]): string[] {
  if (labels.length <= 7) return labels;
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(labels[Math.round((i / 6) * (labels.length - 1))]);
  return out;
}
