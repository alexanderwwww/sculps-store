/**
 * Order detail: the four states, tracking, refund, and the permanent timeline.
 *
 * Every button here writes an order_events row in the same call that makes the
 * change. Nothing is ever deleted. That record is the evidence that wins a
 * payment-processor review, so it is not optional and not left to the caller.
 */
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/admin.orders.$id";
import { requireUser } from "~/lib/auth.server";
import {
  resolveAdminStore,
  cancelOrder,
  loadOrder,
  setOrderState,
  setTracking,
  addOrderNote,
  recordOrderEvent,
} from "~/lib/admin.server";
import { money } from "~/lib/money";
import { sendShippingNotice, sendRefundNotice, emailReady, trackingUrl } from "~/lib/email.server";
import { orders } from "~/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { recomputeCustomerTotals } from "~/lib/customers.server";
import { providerForStore, PaymentsNotConfigured } from "~/lib/payments.server";
import { centsFromInput } from "~/lib/money";
import { primaryButton, secondaryButton, criticalButton, input } from "~/admin/ui";
import type { BadgeKind } from "~/admin/ui";

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

const CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "YunExpress", "4PX", "China Post", "Other"];

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.order ? `Order #${data.order.number} — Shop Admin` : "Order — Shop Admin" }];
}

export async function loader({ context, request, params }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const { store: scope } = await resolveAdminStore(context.db, new URL(request.url));
  const loaded = await loadOrder(context.db, params.id, scope?.id);
  if (!loaded) throw new Response("Order not found", { status: 404 });

  const { order, store, items, timeline } = loaded;

  // The chargeback banner and the evidence card exist only when Stripe has
  // actually opened a dispute on this order — that is the "chargeback" event
  // the Stripe webhook writes.
  const chargebackEvent = timeline.filter((event) => event.type === "chargeback").at(-1) ?? null;

  // "3 orders" under the customer's name: how many orders this email has left
  // on this store, counted rather than guessed.
  const [{ count: customerOrderCount }] = await context.db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(and(eq(orders.storeId, store.id), eq(orders.email, order.email)));

  return {
    store: {
      slug: store.slug,
      name: store.name,
      currency: store.currency,
      color: store.color,
      initial: store.name.slice(0, 1).toUpperCase(),
    },
    chargeback: chargebackEvent
      ? { reason: chargebackEvent.text.replace(/^Chargeback opened · /, ""), at: chargebackEvent.at }
      : null,
    customerOrderCount,
    order: {
      id: order.id,
      number: order.number,
      state: order.state,
      createdAt: order.createdAt,
      customerName: order.customerName,
      email: order.email,
      phone: order.phone,
      address: [order.address1, order.address2, order.city, order.region, order.postalCode, order.country]
        .filter(Boolean)
        .join(", "),
      subtotal: money(order.subtotalCents, order.currency),
      tax: money(order.taxCents, order.currency),
      shipping: money(order.shippingCents, order.currency),
      total: money(order.totalCents, order.currency),
      refunded: order.refundedCents ? money(order.refundedCents, order.currency) : null,
      remaining: ((order.totalCents - order.refundedCents) / 100).toFixed(2),
      remainingFormatted: money(order.totalCents - order.refundedCents, order.currency),
      paymentStatus: order.paymentStatus,
      paymentProvider: order.paymentProvider,
      paymentRef: order.paymentRef,
      tracking: order.tracking,
      carrier: order.carrier,
      trackingUrl: order.tracking ? trackingUrl(order.carrier, order.tracking) : null,
      source: order.source,
      campaign: order.campaign,
      metaEventId: order.metaEventId,
      note: order.note,
      city: order.city,
      region: order.region,
      postalCode: order.postalCode,
      country: order.country,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      shippingIsFree: order.shippingCents === 0,
      taxRate:
        order.subtotalCents > 0 ? `${((order.taxCents / order.subtotalCents) * 100).toFixed(2)}%` : "—",
    },
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      label: item.label,
      quantity: item.quantity,
      unitPrice: money(item.unitPriceCents, order.currency),
      lineTotal: money(item.unitPriceCents * item.quantity, order.currency),
    })),
    timeline: timeline.map((event) => ({
      id: event.id,
      type: event.type,
      text: event.text,
      at: event.at,
    })),
  };
}

export async function action({ context, request, params }: Route.ActionArgs) {
  const user = await requireUser(context.db, request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const orderId = params.id;

  // Every write on this screen is scoped to the store being viewed, the same
  // way the loader is, so a hand-made POST cannot reach another store's order.
  const { store: scope } = await resolveAdminStore(context.db, new URL(request.url));
  const scoped = await loadOrder(context.db, orderId, scope?.id);
  if (!scoped) return { error: "That order is not on this store." };

  if (intent === "mark-ordered") {
    await setOrderState(context.db, orderId, "ordered", "Marked as ordered with supplier", user.email);
    return { ok: true };
  }

  if (intent === "cancel") {
    const result = await cancelOrder(context.db, orderId, String(form.get("reason") || "").trim(), user.email);
    return result.ok ? { ok: true } : { error: result.reason };
  }

  if (intent === "tracking") {
    const tracking = String(form.get("tracking") || "").trim();
    const carrier = String(form.get("carrier") || "").trim();
    if (!tracking) return { error: "Paste the tracking number first." };
    if (!carrier) return { error: "Choose the carrier — the customer's tracking link depends on it." };

    await setTracking(context.db, orderId, tracking, carrier, user.email);

    // Telling the customer is the point of adding a tracking number, so it
    // happens here rather than being a second thing to remember.
    const loaded = await loadOrder(context.db, orderId);
    if (loaded) {
      if (emailReady(context.cloudflare.env)) {
        await sendShippingNotice(context.db, context.cloudflare.env, orderId, {
          to: loaded.order.email,
          customerName: loaded.order.customerName,
          storeName: loaded.store.name,
          fromAddress: loaded.store.emailFrom,
          replyTo: loaded.store.contactEmail,
          orderNumber: loaded.order.number,
          tracking,
          carrier: carrier || null,
        });
      } else {
        await recordOrderEvent(
          context.db,
          orderId,
          "email:skipped",
          "Tracking added but no email sent: email is not configured on this Worker yet.",
        );
      }
    }
    return { ok: true };
  }

  if (intent === "note") {
    await addOrderNote(context.db, orderId, String(form.get("note") || ""), user.email);
    return { ok: true };
  }

  if (intent === "refund") {
    const { order, store } = scoped;
    const reason = String(form.get("reason") || "").trim();
    const notify = form.get("notify") === "on";

    if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") {
      return { error: `Only a paid order can be refunded. This one is ${order.paymentStatus}.` };
    }
    if (!order.paymentRef) {
      return { error: "This order has no payment reference, so there is nothing to refund at the provider." };
    }

    const remaining = order.totalCents - order.refundedCents;
    const typed = String(form.get("amount") || "").trim();
    const requested = typed ? centsFromInput(typed) : remaining;
    if (requested === null) {
      return { error: `Enter the amount like 12.50. Nothing was refunded.` };
    }
    if (requested <= 0 || requested > remaining) {
      return { error: `Refund amount must be between $0.01 and ${money(remaining, order.currency)}. Nothing was refunded.` };
    }

    // Claim the amount in the ledger before asking Stripe, guarded so two
    // submits cannot both pass the "remaining" check. If Stripe then refuses,
    // the claim is released.
    const [claimed] = await context.db
      .update(orders)
      .set({ refundedCents: sql`${orders.refundedCents} + ${requested}`, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), sql`${orders.refundedCents} + ${requested} <= ${orders.totalCents}`))
      .returning({ refundedCents: orders.refundedCents });
    if (!claimed) {
      return { error: "That amount is no longer available to refund — reload the order." };
    }

    let result;
    try {
      const provider = await providerForStore(context.db, context.cloudflare.env, store.id);
      result = await provider.refund(
        order.paymentRef,
        requested,
        `refund:${order.id}:${claimed.refundedCents}`,
      );
    } catch (error) {
      await context.db
        .update(orders)
        .set({ refundedCents: sql`${orders.refundedCents} - ${requested}` })
        .where(eq(orders.id, orderId));
      const why =
        error instanceof PaymentsNotConfigured
          ? error.message
          : error instanceof Error
            ? error.message
            : "unknown error";
      await recordOrderEvent(
        context.db,
        orderId,
        "refund:failed",
        `Refund of ${money(requested, order.currency)} attempted by ${user.email} but Stripe refused · ${why}`,
        { reason, requestedBy: user.email, amountCents: requested },
      );
      return { error: `The refund did not go through: ${why}. The order is unchanged.` };
    }

    // Refunding is a payment fact. Whether the parcel shipped is a separate
    // fact and stays exactly as it was.
    const full = claimed.refundedCents >= order.totalCents;
    await context.db
      .update(orders)
      .set({ paymentStatus: full ? "refunded" : "partially_refunded", updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    // Lifetime spend is net of refunds.
    await recomputeCustomerTotals(context.db, store.id, order.email).catch(() => undefined);

    await recordOrderEvent(
      context.db,
      orderId,
      "refund:issued",
      `Refund of ${money(result.amountCents, order.currency)} issued via Stripe · ${result.id}${
        reason ? ` · ${reason}` : ""
      } · by ${user.email}`,
      { reason, requestedBy: user.email, refundId: result.id, amountCents: result.amountCents },
    );

    if (notify) {
      if (emailReady(context.cloudflare.env)) {
        await sendRefundNotice(context.db, context.cloudflare.env, orderId, {
          to: order.email,
          customerName: order.customerName,
          storeName: store.name,
          fromAddress: store.emailFrom,
          replyTo: store.contactEmail,
          orderNumber: order.number,
          amountCents: result.amountCents,
          currency: order.currency,
          full,
        });
      } else {
        await recordOrderEvent(context.db, orderId, "email:skipped", "Refund email not sent: email is not configured on this Worker yet.");
      }
    }
    return { ok: true };
  }

  return { error: "Unknown action." };
}

function formatWhen(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLong(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The dot colour on a timeline row, by what the event was. */
function dotFor(type: string): string {
  if (type === "chargeback" || type.startsWith("refund")) return "var(--critical)";
  if (type.startsWith("state") || type.startsWith("tracking")) return "var(--link)";
  if (type.startsWith("email")) return "#22C55E";
  return "var(--ink-3)";
}

const menuItem: CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "7px 10px",
  border: 0,
  borderRadius: 7,
  background: "transparent",
  cursor: "pointer",
  fontSize: 13,
  color: "var(--ink)",
  textDecoration: "none",
  display: "block",
};

const deadMenuItem: CSSProperties = {
  ...menuItem,
  cursor: "not-allowed",
  opacity: 0.5,
};

const cardStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "var(--shadow)",
  overflow: "hidden",
};

const cardHead: CSSProperties = {
  padding: "12px 16px",
  fontWeight: 650,
  borderBottom: "1px solid var(--border)",
};

function Chip({ kind, children }: { kind: string; children: ReactNode }) {
  return (
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
        background: `var(--b-${kind}-bg)`,
        color: `var(--b-${kind}-fg)`,
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.8 }}
      />
      {children}
    </span>
  );
}

export default function OrderDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { order, store, items, timeline, chargeback, customerOrderCount } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const [params] = useSearchParams();

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(params.get("refund") === "1");
  const [noteEditing, setNoteEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const close = () => setMoreMenuOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // Refunding is only possible while there is money left on a paid order.
  const canRefund =
    (order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded") &&
    Number(order.remaining) > 0;
  const isRefunded = order.paymentStatus === "refunded";
  const canFulfill = order.state === "new" || order.state === "ordered";
  const isFulfilled = order.state === "fulfilled";

  const payKind = order.paymentStatus === "paid" ? "success" : "neutral";
  const payLabel =
    order.paymentStatus === "paid"
      ? "Paid"
      : order.paymentStatus === "partially_refunded"
        ? "Partially refunded"
        : order.paymentStatus === "refunded"
          ? "Refunded"
          : order.paymentStatus;
  const stateKind = STATE_KIND[order.state] ?? "neutral";
  const stateLabel = STATE_LABEL[order.state] ?? order.state;

  const stripeUrl =
    order.paymentProvider === "stripe" && order.paymentRef
      ? `https://dashboard.stripe.com/payments/${order.paymentRef}`
      : null;

  const evidence: { label: string; value: string }[] = [
    { label: "Order details", value: `#${order.number} · ${order.total}` },
    { label: "Tracking number", value: order.tracking || "Added when fulfilled" },
    {
      label: "Delivery confirmation",
      value: isFulfilled ? "Marked fulfilled on this order" : "Pending carrier scan",
    },
    { label: "Customer communications", value: `Order + shipping emails to ${order.email}` },
    {
      label: "Billing/shipping match",
      value: [order.city, order.region].filter(Boolean).join(", ") || "No address on this order",
    },
  ];

  return (
    <div style={{ maxWidth: 998, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        .k-order-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}
        @media (max-width: 720px){ .k-order-grid{grid-template-columns:1fr} }
      `}</style>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <Link
          to={`/admin/orders?store=${store.slug}`}
          className="k-hover"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--ink)",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            flex: "none",
            boxShadow: "var(--shadow)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m10 4-4 4 4 4" />
          </svg>
        </Link>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                lineHeight: "28px",
                fontWeight: 650,
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              #{order.number}
            </h1>
            <Chip kind={payKind}>{payLabel}</Chip>
            <Chip kind={stateKind}>{stateLabel}</Chip>
          </div>
          <div style={{ color: "var(--ink-2)", fontSize: 12 }}>
            {formatLong(order.createdAt)} · {store.name}
            {order.source ? ` · from ${order.source}` : ""}
          </div>
        </div>
        <div
          style={{ display: "flex", gap: 8, position: "relative" }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setRefundOpen(true)}
            disabled={!canRefund}
            title={canRefund ? undefined : "There is nothing left to refund on this order"}
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
              cursor: canRefund ? "pointer" : "not-allowed",
              boxShadow: "var(--shadow)",
              opacity: canRefund ? 1 : 0.5,
            }}
          >
            Refund
          </button>
          <button
            type="button"
            onClick={() => setMoreMenuOpen(!moreMenuOpen)}
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
              gap: 6,
            }}
          >
            More actions
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>
          {moreMenuOpen ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 34,
                width: 230,
                background: "var(--elev)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                boxShadow: "var(--shadow-lg)",
                padding: 6,
                zIndex: 20,
                animation: "kPop .14s ease-out",
              }}
            >
              {/* No packing-slip document exists yet. */}
              <button
                type="button"
                disabled
                title="There is no packing-slip document to print yet"
                style={deadMenuItem}
              >
                Print packing slip
              </button>
              {/* The order-confirmation email is sent by checkout; there is no
                  resend path on this route yet. */}
              <button
                type="button"
                disabled
                title="Resending the order confirmation is not wired up — only the shipping and refund emails can be sent from here"
                style={deadMenuItem}
              >
                Resend order confirmation
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  setCopied(true);
                  setMoreMenuOpen(false);
                }}
                className="k-hover"
                style={{ ...menuItem, background: "transparent" }}
              >
                {copied ? "Order link copied" : "Copy order link"}
              </button>
              {stripeUrl ? (
                <a
                  href={stripeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="k-hover"
                  style={menuItem}
                >
                  View payment in Stripe
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  title="This order has no Stripe payment reference to open"
                  style={deadMenuItem}
                >
                  View payment in Stripe
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {actionData?.error ? (
        <div
          style={{
            background: "var(--b-critical-bg)",
            color: "var(--b-critical-fg)",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          {actionData.error}
        </div>
      ) : null}

      {chargeback ? (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            padding: "12px 16px",
            borderRadius: 12,
            background: "var(--critical-bg)",
            border: "1px solid var(--critical)",
            color: "var(--ink)",
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--critical)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 12,
              flex: "none",
            }}
          >
            !
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 650 }}>Chargeback opened · {chargeback.reason}</div>
            <div style={{ color: "var(--ink-2)" }}>
              Opened <strong style={{ color: "var(--ink)" }}>{formatWhen(chargeback.at)}</strong>. Stripe's
              response deadline is not recorded on this order — check the dispute in Stripe. Evidence is
              listed below.
            </div>
          </div>
        </div>
      ) : null}

      <div className="k-order-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={cardStyle}>
            <div
              style={{ ...cardHead, display: "flex", alignItems: "center", gap: 8 }}
            >
              Items
              <Chip kind={stateKind}>{stateLabel}</Chip>
            </div>
            {items.map((item) => (
              <div
                key={item.id}
                style={{ display: "flex", gap: 14, padding: "14px 16px", alignItems: "center" }}
              >
                <span
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 10,
                    background: store.color,
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 18,
                    flex: "none",
                  }}
                >
                  {store.initial}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 550 }}>{item.title}</div>
                  <div style={{ color: "var(--ink-2)", fontSize: 12 }}>{item.label}</div>
                </div>
                <div style={{ color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                  {item.unitPrice} × {item.quantity}
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 70,
                    textAlign: "right",
                  }}
                >
                  {item.lineTotal}
                </div>
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <div style={{ ...cardHead, display: "flex", alignItems: "center", gap: 8 }}>
              Payment
              <Chip kind={payKind}>{payLabel}</Chip>
            </div>
            <div
              style={{
                padding: "12px 16px",
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: "6px 24px",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span>Subtotal</span>
              <span style={{ color: "var(--ink-2)" }}>
                {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
              </span>
              <span style={{ textAlign: "right" }}>{order.subtotal}</span>
              <span>Tax</span>
              <span style={{ color: "var(--ink-2)" }}>
                {order.region ? `${order.region} state · ${order.taxRate}` : order.taxRate}
              </span>
              <span style={{ textAlign: "right" }}>{order.tax}</span>
              <span>Shipping</span>
              <span style={{ color: "var(--ink-2)" }}>{order.shippingIsFree ? "Free shipping" : ""}</span>
              <span style={{ textAlign: "right" }}>{order.shipping}</span>
              <span style={{ fontWeight: 650, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                Total
              </span>
              <span style={{ paddingTop: 6, borderTop: "1px solid var(--border)" }} />
              <span
                style={{
                  fontWeight: 650,
                  textAlign: "right",
                  paddingTop: 6,
                  borderTop: "1px solid var(--border)",
                }}
              >
                {order.total}
              </span>
              {order.refunded ? (
                <>
                  <span>Refunded</span>
                  <span style={{ color: "var(--ink-2)" }}>
                    {order.remainingFormatted} left to refund
                  </span>
                  <span style={{ textAlign: "right" }}>− {order.refunded}</span>
                </>
              ) : null}
            </div>
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                color: "var(--ink-2)",
                fontSize: 12,
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              <span>
                {order.paymentProvider ? `Paid via ${order.paymentProvider}` : "No payment provider recorded"}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{order.paymentRef ?? "—"}</span>
            </div>
          </div>

          {chargeback ? (
            <div style={cardStyle}>
              <div style={cardHead}>Evidence</div>
              <div style={{ padding: "8px 16px 12px", color: "var(--ink-2)" }}>
                Assembled from this order. Nothing is filed with Stripe from here yet.
              </div>
              {evidence.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 16px",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="var(--success)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 8.5 6.5 12 13 4.5" />
                  </svg>
                  <span style={{ flex: 1 }}>{row.label}</span>
                  <span style={{ color: "var(--ink-2)", fontSize: 12 }}>{row.value}</span>
                </div>
              ))}
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                {/* Nothing uploads evidence to Stripe yet, so this cannot pretend to. */}
                <button
                  type="button"
                  disabled
                  title="Submitting dispute evidence to Stripe is not implemented — file it in the Stripe dashboard"
                  style={{
                    height: 28,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: 0,
                    background: "var(--accent)",
                    color: "var(--accent-ink)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "not-allowed",
                    opacity: 0.5,
                  }}
                >
                  Submit evidence
                </button>
              </div>
            </div>
          ) : null}

          <div style={cardStyle} id="tracking">
            <div style={cardHead}>Fulfillment</div>
            {canFulfill ? (
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <Form method="post" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <input type="hidden" name="intent" value="tracking" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10 }}>
                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 550,
                        color: "var(--ink-2)",
                      }}
                    >
                      Tracking number
                      <input
                        name="tracking"
                        defaultValue={order.tracking ?? ""}
                        placeholder="e.g. 9400 1112 0620 …"
                        style={{
                          height: 36,
                          padding: "0 12px",
                          borderRadius: 8,
                          border: "1px solid var(--input-border)",
                          background: "var(--input)",
                          fontSize: 14,
                          fontFamily: "'JetBrains Mono',monospace",
                          color: "var(--ink)",
                        }}
                      />
                    </label>
                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 550,
                        color: "var(--ink-2)",
                      }}
                    >
                      Carrier
                      <select
                        name="carrier"
                        defaultValue={order.carrier ?? ""}
                        style={{
                          height: 36,
                          borderRadius: 8,
                          border: "1px solid var(--input-border)",
                          background: "var(--input)",
                          padding: "0 8px",
                          fontSize: 13,
                          color: "var(--ink)",
                        }}
                      >
                        <option value="">Choose…</option>
                        {CARRIERS.map((carrier) => (
                          <option key={carrier} value={carrier}>
                            {carrier}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="submit"
                      disabled={busy}
                      className="k-btn-primary"
                      style={{
                        height: 32,
                        padding: "0 14px",
                        borderRadius: 8,
                        border: 0,
                        background: "var(--accent)",
                        color: "var(--accent-ink)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Mark fulfilled &amp; email customer
                    </button>
                  </div>
                </Form>
                {order.state === "new" ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="mark-ordered" />
                    <button
                      type="submit"
                      disabled={busy}
                      className="k-hover"
                      style={{
                        height: 32,
                        padding: "0 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--ink)",
                        fontSize: 12,
                        fontWeight: 550,
                        cursor: "pointer",
                        boxShadow: "var(--shadow)",
                      }}
                    >
                      Mark as ordered with supplier
                    </button>
                  </Form>
                ) : null}
              </div>
            ) : null}
            {isFulfilled ? (
              <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 550 }}>Shipped via {order.carrier ?? "—"}</div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 12,
                      color: "var(--ink-2)",
                    }}
                  >
                    {order.tracking ?? "—"}
                    {order.trackingUrl ? (
                      <>
                        {" "}
                        <a href={order.trackingUrl} target="_blank" rel="noreferrer">
                          Track ↗
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
                {/* Resending is the same write as adding it: it re-sends the
                    shipping email with the tracking already on the order. */}
                <Form method="post">
                  <input type="hidden" name="intent" value="tracking" />
                  <input type="hidden" name="tracking" value={order.tracking ?? ""} />
                  <input type="hidden" name="carrier" value={order.carrier ?? ""} />
                  <button
                    type="submit"
                    disabled={busy || !order.tracking || !order.carrier}
                    title={
                      order.tracking && order.carrier
                        ? undefined
                        : "Add a tracking number and carrier before a tracking email can be sent"
                    }
                    style={{
                      height: 28,
                      padding: "0 10px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--ink)",
                      fontSize: 12,
                      fontWeight: 550,
                      cursor: order.tracking && order.carrier ? "pointer" : "not-allowed",
                      opacity: order.tracking && order.carrier ? 1 : 0.5,
                    }}
                  >
                    Resend tracking
                  </button>
                </Form>
              </div>
            ) : null}
            {isRefunded ? (
              <div style={{ padding: "14px 16px", color: "var(--ink-2)" }}>
                This order was refunded. No fulfillment needed.
              </div>
            ) : null}
            {order.state !== "fulfilled" && order.state !== "cancelled" ? (
              <Form
                method="post"
                onSubmit={(event) => {
                  if (!confirm("Cancel this order? Only unpaid or fully refunded orders can be cancelled.")) {
                    event.preventDefault();
                  }
                }}
                style={{
                  padding: "12px 16px",
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <input type="hidden" name="intent" value="cancel" />
                <input
                  name="reason"
                  placeholder="Why? (optional)"
                  style={{ ...input, flex: 1, minWidth: 160 }}
                />
                <button type="submit" disabled={busy} style={criticalButton}>
                  Cancel order
                </button>
              </Form>
            ) : null}
          </div>

          <div style={cardStyle}>
            <div style={cardHead}>Timeline</div>
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                gap: 10,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "#A78BFA",
                  color: "#14102A",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: 650,
                  flex: "none",
                }}
              >
                ·
              </span>
              {/* The timeline is the system's own record; there is nowhere to
                  save a staff comment yet, so the box is visibly dead. */}
              <div style={{ flex: 1, display: "flex", gap: 8 }}>
                <input
                  disabled
                  placeholder="Leave a comment…"
                  title="Staff comments are not stored yet — the timeline only records what the system did"
                  style={{
                    flex: 1,
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: "1px solid var(--input-border)",
                    background: "var(--input)",
                    fontSize: 13,
                    color: "var(--ink)",
                    opacity: 0.5,
                    cursor: "not-allowed",
                  }}
                />
                <button
                  type="button"
                  disabled
                  title="Staff comments are not stored yet — the timeline only records what the system did"
                  style={{
                    height: 32,
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
                  Post
                </button>
              </div>
            </div>
            <div style={{ padding: "12px 16px 4px", display: "flex", flexDirection: "column" }}>
              {timeline.length === 0 ? (
                <div style={{ color: "var(--ink-2)", paddingBottom: 8 }}>Nothing recorded yet.</div>
              ) : (
                [...timeline].reverse().map((event) => (
                  <div
                    key={event.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "20px 1fr auto",
                      gap: "0 10px",
                      position: "relative",
                    }}
                  >
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: dotFor(event.type),
                          marginTop: 6,
                          flex: "none",
                          border: "2px solid var(--surface)",
                          boxShadow: "0 0 0 1px var(--border)",
                        }}
                      />
                      <span
                        style={{ flex: 1, width: 1, background: "var(--border)", margin: "2px 0" }}
                      />
                    </span>
                    <span style={{ paddingBottom: 14, color: "var(--ink)" }}>{event.text}</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--ink-2)",
                        whiteSpace: "nowrap",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatWhen(event.at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={cardStyle}>
            <div style={cardHead}>Customer</div>
            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 550 }}>{order.customerName}</span>
              <span style={{ color: "var(--ink-2)", fontSize: 12 }}>
                {customerOrderCount === 1 ? "First order" : `${customerOrderCount} orders`}
              </span>
            </div>
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Contact</span>
              <a href={`mailto:${order.email}`} style={{ wordBreak: "break-all" }}>
                {order.email}
              </a>
              <span>{order.phone ?? "—"}</span>
            </div>
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>
                Shipping address
              </span>
              {order.address ? (
                <>
                  <span>{order.customerName}</span>
                  <span>{order.address}</span>
                </>
              ) : (
                <span style={{ color: "var(--ink-2)" }}>No address on this order</span>
              )}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={cardHead}>Meta attribution</div>
            <div
              style={{
                padding: "10px 16px",
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "6px 12px",
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--ink-2)" }}>Ad</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 500 }}>
                {order.source ?? "—"}
              </span>
              <span style={{ color: "var(--ink-2)" }}>Campaign</span>
              <span>{order.campaign ?? "—"}</span>
              <span style={{ color: "var(--ink-2)" }}>Event ID</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--ink-2)" }}>
                {order.metaEventId ?? "—"}
              </span>
              <span style={{ color: "var(--ink-2)" }}>Purchase event</span>
              {order.metaEventId ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
                  Browser + server, deduplicated
                </span>
              ) : (
                <span style={{ color: "var(--ink-2)" }}>No event ID on this order</span>
              )}
            </div>
          </div>

          <div style={cardStyle}>
            <div
              style={{
                ...cardHead,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              Notes
              {noteEditing ? null : (
                <button
                  type="button"
                  onClick={() => setNoteEditing(true)}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "var(--link)",
                    fontSize: 12,
                    fontWeight: 550,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Edit
                </button>
              )}
            </div>
            {noteEditing ? (
              <Form method="post" onSubmit={() => setNoteEditing(false)} style={{ padding: "12px 16px" }}>
                <input type="hidden" name="intent" value="note" />
                <textarea
                  name="note"
                  defaultValue={order.note}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--input-border)",
                    background: "var(--input)",
                    fontSize: 13,
                    resize: "vertical",
                    color: "var(--ink)",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setNoteEditing(false)}
                    style={secondaryButton}
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={busy} style={primaryButton}>
                    Save
                  </button>
                </div>
              </Form>
            ) : (
              <div
                style={{
                  padding: "12px 16px",
                  color: order.note ? "var(--ink)" : "var(--ink-2)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {order.note || "No notes on this order"}
              </div>
            )}
          </div>
        </div>
      </div>

      {refundOpen ? (
        <div
          onClick={() => setRefundOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            animation: "kFade .12s",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(560px,100%)",
              background: "var(--elev)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
              animation: "kModal .16s ease-out",
            }}
          >
            {/* Same POST the action already expects: intent, amount, reason, notify. */}
            <Form method="post" onSubmit={() => setRefundOpen(false)}>
              <input type="hidden" name="intent" value="refund" />
              <input type="hidden" name="amount" value={order.remaining} />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontWeight: 650, fontSize: 15 }}>Refund #{order.number}</span>
                <button
                  type="button"
                  onClick={() => setRefundOpen(false)}
                  className="k-hover"
                  style={{
                    width: 28,
                    height: 28,
                    border: 0,
                    borderRadius: 7,
                    background: "transparent",
                    color: "var(--ink-2)",
                    cursor: "pointer",
                    fontSize: 16,
                  }}
                >
                  ✕
                </button>
              </div>
              <div
                style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}
              >
                {items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                    }}
                  >
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        background: store.color,
                        flex: "none",
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 550 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{item.label}</div>
                    </div>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {item.unitPrice} × {item.quantity}
                    </span>
                  </div>
                ))}
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 550,
                    color: "var(--ink-2)",
                  }}
                >
                  Reason for refund
                  <select
                    name="reason"
                    defaultValue="Customer changed mind"
                    style={{
                      height: 34,
                      borderRadius: 8,
                      border: "1px solid var(--input-border)",
                      background: "var(--input)",
                      padding: "0 8px",
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    <option>Customer changed mind</option>
                    <option>Item damaged in transit</option>
                    <option>Item never arrived</option>
                    <option>Duplicate order</option>
                    <option>Other</option>
                  </select>
                  <span style={{ fontWeight: 450 }}>Only you and other staff can see this reason.</span>
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "4px 16px",
                    fontVariantNumeric: "tabular-nums",
                    padding: 12,
                    borderRadius: 10,
                    background: "var(--bg)",
                  }}
                >
                  <span>Subtotal</span>
                  <span style={{ textAlign: "right" }}>{order.subtotal}</span>
                  <span>Tax</span>
                  <span style={{ textAlign: "right" }}>{order.tax}</span>
                  <span>Shipping</span>
                  <span style={{ textAlign: "right" }}>{order.shipping}</span>
                  {order.refunded ? (
                    <>
                      <span>Already refunded</span>
                      <span style={{ textAlign: "right" }}>− {order.refunded}</span>
                    </>
                  ) : null}
                  <span style={{ fontWeight: 650, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                    Refund amount
                  </span>
                  <span
                    style={{
                      fontWeight: 650,
                      textAlign: "right",
                      paddingTop: 6,
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    {order.remainingFormatted}
                  </span>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    name="notify"
                    defaultChecked
                    style={{ width: 16, height: 16, accentColor: "var(--focus)" }}
                  />
                  Send a notification to the customer
                </label>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  padding: "12px 20px",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setRefundOpen(false)}
                  style={{
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 550,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 8,
                    border: 0,
                    background: "var(--critical)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Refund {order.remainingFormatted}
                </button>
              </div>
            </Form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
