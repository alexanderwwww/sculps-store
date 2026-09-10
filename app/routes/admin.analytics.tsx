/**
 * Analytics.
 *
 * Where there is nothing to measure the figure is a dash, not a zero. A zero
 * reads like a measurement; a dash reads like "no data yet", which is the
 * truth on a store that has not launched.
 */
import { Link } from "react-router";
import type { Route } from "./+types/admin.analytics";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, analytics } from "~/lib/admin.server";
import { formatMoney } from "~/lib/money";
import { card, cardHeader, Empty, PageTitle, secondaryButton } from "~/admin/ui";

export function meta() {
  return [{ title: "Analytics — Shop Admin" }];
}

const RANGES: Record<string, { label: string; days: number }> = {
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
};

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, data: null, rangeKey: "30d" };

  const rangeKey = url.searchParams.get("range") || "30d";
  const range = RANGES[rangeKey] ?? RANGES["30d"];
  const data = await analytics(context.db, store.id, range.days);

  return {
    store: { slug: store.slug, name: store.name, currency: store.currency },
    rangeKey,
    data,
  };
}

export default function Analytics({ loaderData }: Route.ComponentProps) {
  const { store, data, rangeKey } = loaderData;

  if (!store || !data) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const currency = store.currency;
  const nothingYet = data.orderCount === 0 && data.sessions === 0;

  const tiles = [
    { label: "Revenue", value: data.orderCount ? formatMoney(data.revenue, currency) : "—" },
    { label: "Orders", value: data.orderCount ? String(data.orderCount) : "—" },
    {
      label: "Average order",
      value: data.averageOrder === null ? "—" : formatMoney(data.averageOrder, currency),
    },
    { label: "Sessions", value: data.sessions ? String(data.sessions) : "—" },
    {
      label: "Conversion",
      value: data.conversion === null ? "—" : `${data.conversion.toFixed(2)}%`,
    },
    { label: "Refunded", value: data.refunded ? formatMoney(data.refunded, currency) : "—" },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageTitle
        title={`Analytics · ${store.name}`}
        actions={
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(RANGES).map(([key, range]) => (
              <Link
                key={key}
                to={`/admin/analytics?store=${store.slug}&range=${key}`}
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

      {nothingYet ? (
        <div style={{ background: "var(--b-info-bg)", color: "var(--b-info-fg)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          Nothing to measure in this period. Figures appear once the storefront has visitors and
          orders — a dash here means no data, not zero sales.
        </div>
      ) : null}

      <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        {tiles.map((tile) => (
          <div key={tile.label} style={{ padding: "14px 16px", borderRight: "1px solid var(--border)" }}>
            <div style={{ color: "var(--ink-2)", fontSize: 12, fontWeight: 550 }}>{tile.label}</div>
            <div style={{ fontSize: 22, lineHeight: "28px", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={cardHeader}>Funnel</div>
        {data.funnel.sessions === 0 ? (
          <Empty title="No sessions yet" help="The funnel fills in once visitors reach the storefront." />
        ) : (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Sessions", value: data.funnel.sessions },
              { label: "Reached the product page", value: data.funnel.views },
              { label: "Added to cart", value: data.funnel.carts },
              { label: "Started checkout", value: data.funnel.checkouts },
              { label: "Bought", value: data.funnel.purchases },
            ].map((step) => {
              const width = data.funnel.sessions
                ? Math.max(2, (step.value / data.funnel.sessions) * 100)
                : 0;
              return (
                <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 200, fontSize: 13, color: "var(--ink-2)" }}>{step.label}</span>
                  <span style={{ flex: 1, height: 22, background: "var(--bg)", borderRadius: 6, overflow: "hidden" }}>
                    <span style={{ display: "block", height: 22, width: `${width}%`, background: "var(--chart)", borderRadius: 6 }} />
                  </span>
                  <span style={{ width: 70, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {step.value}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
        <div style={card}>
          <div style={cardHeader}>Where orders came from</div>
          {data.bySource.length === 0 ? (
            <Empty title="No orders yet" help="Once orders arrive, the ad or link that brought them shows here." />
          ) : (
            data.bySource.map((row) => (
              <div
                key={row.source}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ flex: 1 }}>{row.source}</span>
                <span style={{ color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>{row.orders}</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 90, textAlign: "right" }}>
                  {formatMoney(row.revenue, currency)}
                </span>
              </div>
            ))
          )}
        </div>

        <div style={card}>
          <div style={cardHeader}>Best selling options</div>
          {data.topVariants.length === 0 ? (
            <Empty title="Nothing sold yet" help="Bundle options appear here ranked by revenue." />
          ) : (
            data.topVariants.map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ flex: 1 }}>{row.label}</span>
                <span style={{ color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>{row.units} sold</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 90, textAlign: "right" }}>
                  {formatMoney(row.revenue, currency)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={card}>
        <div style={cardHeader}>By day</div>
        {data.byDay.length === 0 ? (
          <Empty title="No days with orders" help="Each day with an order gets a row here." />
        ) : (
          data.byDay.map((row) => (
            <div
              key={row.day}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 16px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ width: 120, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>{row.day}</span>
              <span style={{ flex: 1, color: "var(--ink-2)" }}>{row.orders} order{row.orders === 1 ? "" : "s"}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(row.revenue, currency)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
