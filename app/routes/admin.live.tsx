/**
 * Live View.
 *
 * The last half hour of real visitor activity, refreshing itself. There is no
 * simulator button — it was in the design and has been dropped on purpose.
 * Everything on this screen either happened or the screen is empty.
 */
import { useEffect } from "react";
import { useRevalidator } from "react-router";
import type { Route } from "./+types/admin.live";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, liveView } from "~/lib/admin.server";
import { formatMoney } from "~/lib/money";
import { card, cardHeader, Empty } from "~/admin/ui";

export function meta() {
  return [{ title: "Live View — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, live: null };

  const live = await liveView(context.db, store.id);
  return {
    store: { slug: store.slug, name: store.name, currency: store.currency },
    live: {
      activeVisitors: live.activeVisitors,
      todayOrders: live.todayOrders,
      todayRevenue: live.todayRevenue,
      recent: live.recent.map((event) => ({
        id: event.id,
        type: event.type,
        city: event.city,
        region: event.region,
        country: event.country,
        path: event.path,
        source: event.source,
        amountCents: event.amountCents,
        at: event.at,
      })),
    },
  };
}

const EVENT_LABEL: Record<string, string> = {
  view: "Looking at",
  cart: "Added to cart",
  checkout: "Started checkout",
  purchase: "Bought",
  leave: "Left",
};

const EVENT_COLOR: Record<string, string> = {
  view: "var(--ink-3)",
  cart: "#F5A623",
  checkout: "var(--link)",
  purchase: "#22C55E",
  leave: "var(--ink-3)",
};

export default function LiveViewScreen({ loaderData }: Route.ComponentProps) {
  const { store, live } = loaderData;
  const revalidator = useRevalidator();

  // Poll rather than hold a socket open: this screen is left open for hours,
  // and a poll that fails simply retries on the next tick.
  useEffect(() => {
    const timer = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 10_000);
    return () => clearInterval(timer);
  }, [revalidator]);

  if (!store || !live) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
          <Empty title="No store yet" help="Create a store first." />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "20px 24px 40px", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>Live View · {store.name}</h1>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#22C55E",
              animation: "kPulse 1.6s ease-out infinite",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Refreshing every 10 seconds
          </span>
        </div>

        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
          <Tile label="Visitors right now" value={String(live.activeVisitors)} />
          <Tile label="Orders today" value={String(live.todayOrders)} />
          <Tile label="Revenue today" value={formatMoney(live.todayRevenue, store.currency)} />
        </div>

        <div style={card}>
          <div style={cardHeader}>
            <span>Last 30 minutes</span>
            <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 450 }}>
              {live.recent.length} event{live.recent.length === 1 ? "" : "s"}
            </span>
          </div>
          {live.recent.length === 0 ? (
            <Empty
              title="Nobody on the store right now"
              help="Visitors show up here the moment the storefront gets traffic. Nothing on this screen is simulated."
            />
          ) : (
            live.recent.map((event) => (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: EVENT_COLOR[event.type] ?? "var(--ink-3)",
                    flex: "none",
                  }}
                />
                <span style={{ width: 130, fontWeight: 550 }}>
                  {EVENT_LABEL[event.type] ?? event.type}
                </span>
                <span style={{ flex: 1, color: "var(--ink-2)", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[event.city, event.region, event.country].filter(Boolean).join(", ") || "Unknown location"}
                  {event.path ? ` · ${event.path}` : ""}
                </span>
                {event.amountCents ? (
                  <span style={{ fontWeight: 650, color: "#0C5132", fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(event.amountCents, store.currency)}
                  </span>
                ) : null}
                <span style={{ fontSize: 12, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", width: 70, textAlign: "right" }}>
                  {new Date(event.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "14px 16px", borderRight: "1px solid var(--border)" }}>
      <div style={{ color: "var(--ink-2)", fontSize: 12, fontWeight: 550 }}>{label}</div>
      <div style={{ fontSize: 22, lineHeight: "28px", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}
