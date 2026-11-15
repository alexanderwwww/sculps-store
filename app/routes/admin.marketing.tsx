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
import { useState } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/admin.marketing";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { orders as ordersTable } from "~/db/schema";
import { useIsMobile } from "~/admin/use-mobile";
import { Empty, card } from "~/admin/ui";
import { sendCampaignEmail } from "~/lib/email.server";
import { audienceEmails } from "~/lib/ma-popup.server";
import { unsubscribeUrl } from "~/lib/suppression.server";
import { isSuppressed } from "~/lib/suppression.server";
import { looksLikeEmail, normaliseEmail } from "~/lib/customers.server";

const MA_SLUG = "mysterious-archive";

/** The postal line marketing mail must carry. Built from the store, with a sensible archive default. */
function postalFor(store: { name: string; legalName?: string | null; city?: string | null; region?: string | null; country?: string | null }): string {
  const who = store.legalName || store.name;
  const where = [store.city, store.region, store.country].filter(Boolean).join(", ");
  return where ? `${who} · ${where}` : `${who} · New York, NY, United States`;
}

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

  const canSend = store.slug === MA_SLUG;
  const audienceCount = canSend ? (await audienceEmails(context.db, store.id)).length : 0;

  return {
    store: { slug: store.slug, name: store.name },
    tab,
    subs,
    subQuery: url.searchParams.get("subq") || "",
    sender,
    canSend,
    audienceCount,
  };
}

/**
 * Send an HTML email: to one customer, or to the marketing audience (checkout
 * consent + pop-up leads) the loader builds. Mysterious Archive only for now —
 * it is the store with its own verified sender through the Cloudflare EMAIL
 * binding. Admin-authenticated. Marketing sends carry one-click unsubscribe and
 * a postal address, and skip anyone who has unsubscribed.
 */
export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "No store selected." };
  if (store.slug !== MA_SLUG) {
    return { error: "Campaign sending is wired for Mysterious Archive only right now." };
  }

  const form = await request.formData();
  const subject = String(form.get("subject") ?? "").trim();
  const html = String(form.get("html") ?? "").trim();
  const mode = String(form.get("mode") ?? "single");
  const single = normaliseEmail(String(form.get("email") ?? ""));
  const marketingFlag = form.get("marketing") != null;

  if (!subject || !html) return { error: "A subject and an HTML body are both required." };

  const env = context.cloudflare.env as Env;
  const site = `https://${store.domain}`;
  // The Cloudflare EMAIL binding needs a display name on the sender, so a bare
  // address gets the store name wrapped around it (same shape the other sends use).
  const addr = store.emailFrom || `mysterious@${store.domain}`;
  const from = addr.includes("<") ? addr : `${store.name} <${addr}>`;
  const replyTo = store.contactEmail || store.emailFrom || null;
  const postal = postalFor(store);

  let recipients: string[];
  // The audience send is marketing by definition; a single send is marketing
  // only when the box is ticked (a one-off reply to a buyer need not be).
  const isMarketing = mode === "audience" ? true : marketingFlag;

  if (mode === "single") {
    if (!looksLikeEmail(single)) return { error: "Enter a valid recipient email." };
    recipients = [single];
  } else {
    recipients = await audienceEmails(context.db, store.id);
    if (!recipients.length) return { error: "No subscribers to send to yet." };
  }

  // Keep a single admin action well inside the Worker's limits.
  const CAP = 300;
  const capped = recipients.length > CAP;
  const list = recipients.slice(0, CAP);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let firstId = "";
  const errors: string[] = [];

  for (const to of list) {
    if (isMarketing && (await isSuppressed(context.db, to))) {
      skipped++;
      continue;
    }
    const unsub = isMarketing ? await unsubscribeUrl(env, site, to) : null;
    const r = await sendCampaignEmail(env, {
      storeName: store.name,
      domain: store.domain,
      logoUrl: store.logoUrl,
      brandColor: store.brandColor,
      accentColor: store.accentColor,
      from,
      replyTo,
      to,
      subject,
      html,
      marketing: isMarketing,
      unsubscribeUrl: unsub,
      postalAddress: isMarketing ? postal : null,
    });
    if (r.ok) {
      sent++;
      if (!firstId) firstId = r.id;
    } else {
      failed++;
      if (errors.length < 6) errors.push(`${to}: ${r.reason}`);
    }
  }

  return {
    ok: true,
    sent,
    failed,
    skipped,
    firstId,
    errors,
    total: recipients.length,
    capped,
    mode,
  };
}

const disabledButton = {
  cursor: "not-allowed" as const,
  opacity: 0.5,
};

export default function Marketing({ loaderData }: Route.ComponentProps) {
  const { store, tab, subs, subQuery, sender, canSend, audienceCount } = loaderData;
  const isM = useIsMobile();
  const actionData = useActionData<typeof action>() as
    | { error?: string; ok?: boolean; sent?: number; failed?: number; skipped?: number; firstId?: string; errors?: string[]; total?: number; capped?: boolean; mode?: string }
    | undefined;
  const nav = useNavigation();
  const sending = nav.state !== "idle" && nav.formMethod === "POST";

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
        {tab === "campaigns" && !canSend ? (
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Email sending is not connected for this store</span>
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
        canSend ? (
          <CampaignComposer
            sender={sender}
            audienceCount={audienceCount}
            sending={sending}
            actionData={actionData}
          />
        ) : (
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
                Email sending is connected for Mysterious Archive. Other stores need a verified sender first.
              </div>
            </div>
          </div>
        )
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

const inputStyle = {
  width: "100%",
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--input-border)",
  background: "var(--input)",
  fontSize: 14,
  boxSizing: "border-box" as const,
};

/**
 * The real campaign composer: subject + HTML body, to one customer or to the
 * whole marketing audience. Sends through the admin action above.
 */
function CampaignComposer({
  sender,
  audienceCount,
  sending,
  actionData,
}: {
  sender: string;
  audienceCount: number;
  sending: boolean;
  actionData?: { error?: string; ok?: boolean; sent?: number; failed?: number; skipped?: number; firstId?: string; errors?: string[]; total?: number; capped?: boolean };
}) {
  const [mode, setMode] = useState<"single" | "audience">("single");
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "var(--shadow)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 650 }}>Send an email</div>
      <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
        From {sender} · {audienceCount} subscriber{audienceCount === 1 ? "" : "s"} in the audience
      </div>

      {actionData?.error ? (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--b-danger-bg)", color: "var(--b-danger-fg)", fontSize: 13 }}>
          {actionData.error}
        </div>
      ) : null}
      {actionData?.ok ? (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--b-success-bg)", color: "var(--b-success-fg)", fontSize: 13 }}>
          Sent {actionData.sent} · failed {actionData.failed} · skipped {actionData.skipped}
          {actionData.firstId ? ` · first id ${actionData.firstId}` : ""}
          {actionData.capped ? ` · only the first 300 of ${actionData.total} were sent, send again for the rest` : ""}
          {actionData.errors && actionData.errors.length ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{actionData.errors.join(" · ")}</div>
          ) : null}
        </div>
      ) : null}

      <Form method="post" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 14 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="radio" name="mode" value="single" checked={mode === "single"} onChange={() => setMode("single")} />
            One customer
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="radio" name="mode" value="audience" checked={mode === "audience"} onChange={() => setMode("audience")} />
            All subscribers ({audienceCount})
          </label>
        </div>

        {mode === "single" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>Recipient email</label>
            <input name="email" type="email" placeholder="customer@example.com" style={inputStyle} />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-2)" }}>
              <input type="checkbox" name="marketing" defaultChecked /> Marketing email (adds one-tap unsubscribe + address)
            </label>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Goes to everyone who opted in. Unsubscribes are skipped automatically and every message carries one-tap unsubscribe.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--ink-2)" }}>Subject</label>
          <input name="subject" style={inputStyle} required />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--ink-2)" }}>HTML body (a full document or a fragment)</label>
          <textarea
            name="html"
            required
            rows={12}
            style={{ ...inputStyle, height: "auto", padding: "10px 12px", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5, lineHeight: 1.5 }}
          />
        </div>

        <button
          type="submit"
          disabled={sending}
          onClick={(e) => {
            if (mode === "audience" && !confirm(`Send to all ${audienceCount} subscribers?`)) e.preventDefault();
          }}
          style={{
            alignSelf: "flex-start",
            height: 34,
            padding: "0 18px",
            borderRadius: 8,
            border: 0,
            background: "var(--accent)",
            color: "var(--accent-ink)",
            fontSize: 13,
            fontWeight: 650,
            cursor: sending ? "default" : "pointer",
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? "Sending…" : mode === "single" ? "Send email" : "Send to audience"}
        </button>
      </Form>
    </div>
  );
}
