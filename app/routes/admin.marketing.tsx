/**
 * Marketing — ported from design/port/marketing.html (the `isMarketing`
 * screen of `design/prototype/Shop Admin.dc.html`).
 *
 * The approved design's Marketing screen is email marketing: three tabs,
 * Campaigns / Automations / Subscribers. There is no ad-spend or ROAS panel
 * in it, so none is invented here.
 *
 * What is real: **Subscribers**. Checkout consent is stored on
 * `orders.marketing_consent`, so every subscriber row below is someone who
 * actually ticked the box at checkout.
 *
 * What has no data source yet, and therefore renders the design's own empty
 * state or a visibly disabled control with the reason beside it:
 *
 *  - Campaigns. There is no campaigns table and no sending provider wired up
 *    (Resend is not connected yet), so the list shows the design's "No
 *    campaigns yet" empty state and "Create campaign" is disabled. The
 *    prototype's campaign builder and live preview are not ported: they are
 *    only reachable from that button, and every control in them would write
 *    to a store that does not exist. They come back with the campaigns table.
 *  - Automations. The five flows and their steps are the design's own copy
 *    and are shown, but nothing runs them yet — no scheduler, no sending — so
 *    every one reads Paused, the toggles and "Edit email" are disabled, and
 *    "sent" is the true count, 0.
 *  - Import CSV / Export on Subscribers: nothing to import into (no
 *    subscribers table — consent lives on the order) and no export route.
 */
import { Form, Link } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/admin.marketing";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { orders as ordersTable } from "~/db/schema";
import { useIsMobile } from "~/admin/use-mobile";
import { Empty, card } from "~/admin/ui";

export function meta() {
  return [{ title: "Marketing — Shop Admin" }];
}

/** The prototype's AUTOS table, copied exactly. */
const AUTOS: [string, string, [string, string][]][] = [
  [
    "Abandoned checkout",
    "Checkout started, no order",
    [
      ["1 hour", "Still thinking it over?"],
      ["22 hours", "Your cart is still here"],
      ["3 days", "Last call on your cart"],
    ],
  ],
  ["Post-purchase", "Order paid", [["15 minutes", "Thanks — here’s what happens next"]]],
  ["Shipping confirmation", "Tracking number added", [["Immediately", "Your order has shipped"]]],
  ["Win-back", "No order in 45 days", [["45 days", "It’s been a while"]]],
  ["Review request", "Order delivered", [["14 days", "How is it working out?"]]],
];

function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric" });
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, tab: "campaigns", subs: [], subQuery: "", sender: "" };

  const tab = url.searchParams.get("tab") || "campaigns";
  const subQuery = (url.searchParams.get("subq") || "").toLowerCase();

  // The prototype's senderFor(): the store's own from-address, falling back to
  // orders@<domain>.
  const sender = store.emailFrom || `orders@${store.domain}`;

  const rows = await context.db
    .select({
      email: ordersTable.email,
      consent: ordersTable.marketingConsent,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(eq(ordersTable.storeId, store.id))
    .orderBy(desc(ordersTable.createdAt));

  const seen = new Map<string, { email: string; date: string }>();
  for (const row of rows) {
    if (!row.consent) continue;
    const key = row.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, { email: row.email, date: formatDate(row.createdAt) });
  }

  const subs = [...seen.values()]
    .filter((x) => !subQuery || x.email.toLowerCase().includes(subQuery))
    .map((x) => ({
      email: x.email,
      source: "Checkout consent",
      status: "Subscribed",
      kind: "success",
      date: x.date,
    }));

  return {
    store: { slug: store.slug, name: store.name },
    tab,
    subs,
    subQuery: url.searchParams.get("subq") || "",
    sender,
  };
}

const disabledButton = {
  cursor: "not-allowed" as const,
  opacity: 0.5,
};

export default function Marketing({ loaderData }: Route.ComponentProps) {
  const { store, tab, subs, subQuery, sender } = loaderData;
  const isM = useIsMobile();

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const suffix = `?store=${store.slug}`;
  const subCols = isM ? "1fr auto" : "minmax(0,1.6fr) 130px 110px 110px";
  const tabs: [string, string][] = [
    ["campaigns", "Campaigns"],
    ["automations", "Automations"],
    ["subscribers", "Subscribers"],
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
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>
          Marketing · {store.name}
        </h1>
        {tab === "campaigns" ? (
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Email sending is not connected yet</span>
            <button
              type="button"
              disabled
              style={{
                height: 28,
                padding: "0 12px",
                borderRadius: 8,
                border: 0,
                background: "var(--accent)",
                color: "var(--accent-ink)",
                fontSize: 12,
                fontWeight: 600,
                ...disabledButton,
              }}
            >
              Create campaign
            </button>
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          gap: 2,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 6,
          boxShadow: "var(--shadow)",
          width: "fit-content",
        }}
      >
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            to={`/admin/marketing${suffix}&tab=${key}`}
            style={{
              height: 30,
              padding: "0 14px",
              borderRadius: 8,
              border: 0,
              background: tab === key ? "var(--accent-soft)" : "transparent",
              color: tab === key ? "var(--ink)" : "var(--ink-2)",
              fontSize: 13,
              fontWeight: 550,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "campaigns" ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--shadow)",
            overflow: "hidden",
          }}
        >
          {/* No campaigns table and no sending provider: the design's own
              empty state, with its call to action disabled. */}
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
            <div style={{ fontWeight: 650 }}>No campaigns yet</div>
            <div style={{ color: "var(--ink-2)", maxWidth: 360 }}>
              Create one to email your subscribers from your own domain.
            </div>
            <button
              type="button"
              disabled
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
                ...disabledButton,
              }}
            >
              Create campaign
            </button>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
              Connect an email provider first — nothing can be sent yet.
            </div>
          </div>
          {/* The campaigns table markup (the mk.campCols header and rows) is
              kept in design/port/marketing.html and renders here once a
              campaigns table exists. */}
        </div>
      ) : null}

      {tab === "automations"
        ? AUTOS.map(([name, trigger, steps]) => (
            <div
              key={name}
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
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 180,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                  }}
                >
                  <span style={{ fontWeight: 650 }}>{name}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Trigger: {trigger}</span>
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
                    background: "var(--b-neutral-bg)",
                    color: "var(--b-neutral-fg)",
                  }}
                >
                  Paused
                </span>
                {/* Nothing sends these yet, so the switch is disabled rather
                    than saving a flag no code reads. */}
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Not running yet</span>
                <button
                  type="button"
                  disabled
                  role="switch"
                  style={{
                    width: 38,
                    height: 22,
                    borderRadius: 11,
                    border: 0,
                    background: "var(--border-strong)",
                    position: "relative",
                    flex: "none",
                    ...disabledButton,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: "2px",
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,.3)",
                      transition: "left .18s",
                    }}
                  />
                </button>
              </div>
              {steps.map(([delay, subject]) => (
                <div
                  key={`${name}-${delay}-${subject}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "76px 1fr auto",
                    gap: 12,
                    alignItems: "center",
                    padding: "11px 16px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--ink-2)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {delay}
                  </span>
                  <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ fontWeight: 550 }}>{subject}</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--ink-2)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      Sent from {sender} · edit the copy and blocks
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled
                    style={{
                      height: 26,
                      padding: "0 10px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--ink)",
                      fontSize: 12,
                      fontWeight: 550,
                      ...disabledButton,
                    }}
                  >
                    Edit email
                  </button>
                </div>
              ))}
              <div style={{ padding: "9px 16px", fontSize: 12, color: "var(--ink-2)" }}>
                Sent from {sender} · 0 sent
              </div>
            </div>
          ))
        : null}

      {tab === "subscribers" ? (
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
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <input type="hidden" name="store" value={store.slug} />
            <input type="hidden" name="tab" value="subscribers" />
            <input
              name="subq"
              defaultValue={subQuery}
              placeholder="Search subscribers"
              style={{
                flex: 1,
                minWidth: 170,
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--input-border)",
                background: "var(--input)",
                fontSize: 13,
              }}
            />
            {/* Import CSV and Export both need a subscribers table and an
                export route; consent currently lives on the order itself. */}
            <span style={{ fontSize: 12, color: "var(--ink-2)", alignSelf: "center" }}>
              Import and export need a subscribers table
            </span>
            <button
              type="button"
              disabled
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 550,
                display: "inline-flex",
                alignItems: "center",
                ...disabledButton,
              }}
            >
              Import CSV
            </button>
            <button
              type="button"
              disabled
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 550,
                ...disabledButton,
              }}
            >
              Export
            </button>
          </Form>
          {subs.length === 0 ? (
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
              <div style={{ fontWeight: 650 }}>No subscribers yet</div>
              <div style={{ color: "var(--ink-2)", maxWidth: 360 }}>
                Checkout consent and imports both land here.
              </div>
            </div>
          ) : null}
          {subs.map((r) => (
            <div
              key={r.email}
              style={{
                display: "grid",
                gridTemplateColumns: subCols,
                gap: 12,
                alignItems: "center",
                padding: "0 16px",
                height: 44,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ fontWeight: 550 }}>{r.email}</span>
              <span style={{ color: "var(--ink-2)" }}>{r.source}</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 20,
                  padding: "0 8px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 550,
                  background: `var(--b-${r.kind}-bg)`,
                  color: `var(--b-${r.kind}-fg)`,
                  justifySelf: "start",
                }}
              >
                {r.status}
              </span>
              <span style={{ color: "var(--ink-2)", textAlign: "right" }}>{r.date}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
