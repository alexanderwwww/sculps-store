/**
 * Order detail: the four states, tracking, refund, and the permanent timeline.
 *
 * Every button here writes an order_events row in the same call that makes the
 * change. Nothing is ever deleted. That record is the evidence that wins a
 * payment-processor review, so it is not optional and not left to the caller.
 */
import { Form, Link, useNavigation } from "react-router";
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
import { providerForStore, PaymentsNotConfigured } from "~/lib/payments.server";
import { centsFromInput } from "~/lib/money";
import {
  card,
  cardHeader,
  Badge,
  primaryButton,
  secondaryButton,
  criticalButton,
  input,
  textarea,
} from "~/admin/ui";
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
  return {
    store: { slug: store.slug, name: store.name, currency: store.currency },
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

export default function OrderDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { order, store, items, timeline } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  return (
    <div style={{ maxWidth: 998, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link to={`/admin/orders?store=${store.slug}`} style={{ ...secondaryButton, textDecoration: "none" }}>
          ←
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650, fontFamily: "'JetBrains Mono',monospace" }}>
          #{order.number}
        </h1>
        <Badge kind={STATE_KIND[order.state] ?? "neutral"}>{STATE_LABEL[order.state] ?? order.state}</Badge>
        <Badge kind={order.paymentStatus === "paid" ? "success" : "neutral"}>
          {order.paymentStatus === "paid"
            ? "Paid"
            : order.paymentStatus === "partially_refunded"
              ? "Partially refunded"
              : order.paymentStatus === "refunded"
                ? "Refunded"
                : order.paymentStatus}
        </Badge>
        <span style={{ color: "var(--ink-2)", fontSize: 12 }}>{formatWhen(order.createdAt)}</span>
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

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={card}>
            <div style={cardHeader}>Items</div>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 550 }}>{item.title}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>{item.label}</span>
                </span>
                <span style={{ color: "var(--ink-2)" }}>
                  {item.unitPrice} × {item.quantity}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 550, minWidth: 80, textAlign: "right" }}>
                  {item.lineTotal}
                </span>
              </div>
            ))}
            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
              <Row label="Subtotal" value={order.subtotal} />
              <Row label="Shipping" value={order.shipping} />
              <Row label="Tax" value={order.tax} />
              <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
              <Row label="Total" value={order.total} strong />
              {order.refunded ? <Row label="Refunded" value={`− ${order.refunded}`} /> : null}
            </div>
          </div>

          <div style={card}>
            <div style={cardHeader}>Fulfilment</div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {order.state === "new" ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="mark-ordered" />
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ flex: 1, color: "var(--ink-2)" }}>
                      Place this with the supplier, then mark it here.
                    </span>
                    <button type="submit" disabled={busy} style={primaryButton}>
                      Mark as ordered with supplier
                    </button>
                  </div>
                </Form>
              ) : null}

              {order.tracking ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--ink-2)" }}>Tracking</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{order.tracking}</span>
                  {order.carrier ? <Badge kind="neutral">{order.carrier}</Badge> : null}
                  {order.trackingUrl ? (
                    <a href={order.trackingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 550 }}>
                      Track ↗
                    </a>
                  ) : null}
                </div>
              ) : null}

              <Form method="post" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <input type="hidden" name="intent" value="tracking" />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)", display: "block", marginBottom: 4 }}>
                    {order.tracking ? "Correct the tracking number" : "Tracking number"}
                  </label>
                  <input name="tracking" defaultValue={order.tracking ?? ""} style={input} placeholder="9400 1112 0620 …" />
                </div>
                <div style={{ width: 160 }}>
                  <label style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)", display: "block", marginBottom: 4 }}>
                    Carrier
                  </label>
                  <select name="carrier" defaultValue={order.carrier ?? ""} style={{ ...input, padding: "0 8px" }}>
                    <option value="">Choose…</option>
                    {CARRIERS.map((carrier) => (
                      <option key={carrier} value={carrier}>
                        {carrier}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={busy} style={primaryButton}>
                  {order.tracking ? "Update tracking" : "Add tracking & email customer"}
                </button>
              </Form>

              {order.state !== "fulfilled" && order.state !== "cancelled" ? (
                <Form
                  method="post"
                  onSubmit={(event) => {
                    if (!confirm("Cancel this order? Only unpaid or fully refunded orders can be cancelled.")) event.preventDefault();
                  }}
                  style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--border)" }}
                >
                  <input type="hidden" name="intent" value="cancel" />
                  <input name="reason" placeholder="Why? (optional)" style={{ ...input, flex: 1, minWidth: 160 }} />
                  <button type="submit" disabled={busy} style={criticalButton}>
                    Cancel order
                  </button>
                </Form>
              ) : null}
            </div>
          </div>

          <div style={card}>
            <div style={cardHeader}>Timeline</div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {timeline.length === 0 ? (
                <div style={{ color: "var(--ink-2)" }}>Nothing recorded yet.</div>
              ) : (
                timeline.map((event) => (
                  <div key={event.id} style={{ display: "flex", gap: 10 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: event.type.startsWith("refund")
                          ? "var(--critical)"
                          : event.type.startsWith("state")
                            ? "var(--link)"
                            : "var(--ink-3)",
                        marginTop: 6,
                        flex: "none",
                      }}
                    />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block" }}>{event.text}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>
                        {formatWhen(event.at)}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={card}>
            <div style={cardHeader}>Customer</div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontWeight: 550 }}>{order.customerName}</div>
              <a href={`mailto:${order.email}`} style={{ wordBreak: "break-all" }}>
                {order.email}
              </a>
              {order.phone ? <div style={{ color: "var(--ink-2)" }}>{order.phone}</div> : null}
              {order.address ? (
                <div style={{ color: "var(--ink-2)", lineHeight: "18px" }}>{order.address}</div>
              ) : null}
            </div>
          </div>

          <div style={card}>
            <div style={cardHeader}>Payment</div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <KeyValue label="Provider" value={order.paymentProvider ?? "—"} />
              <KeyValue label="Reference" value={order.paymentRef ?? "—"} mono />
              <KeyValue label="Status" value={order.paymentStatus} />
            </div>
            {order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded" ? (
              <Form
                method="post"
                onSubmit={(event) => {
                  const amount = (event.currentTarget.elements.namedItem("amount") as HTMLInputElement | null)?.value || order.remaining;
                  if (!confirm(`Refund $${amount} through Stripe now? This moves money and cannot be undone.`)) {
                    event.preventDefault();
                  }
                }}
                style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}
              >
                <input type="hidden" name="intent" value="refund" />
                <label style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Amount to refund</label>
                <input name="amount" defaultValue={order.remaining} inputMode="decimal" style={input} />
                <label style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Reason</label>
                <select name="reason" defaultValue="Customer request" style={{ ...input, padding: "0 8px" }}>
                  <option>Customer request</option>
                  <option>Item damaged in transit</option>
                  <option>Item not received</option>
                  <option>Wrong item sent</option>
                  <option>Duplicate order</option>
                  <option>Other</option>
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" name="notify" defaultChecked style={{ width: 16, height: 16, accentColor: "var(--focus)" }} />
                  Email the customer about this refund
                </label>
                <button type="submit" disabled={busy} style={{ ...criticalButton, width: "100%", justifyContent: "center" }}>
                  Refund via Stripe
                </button>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  Up to {order.remainingFormatted} left on this order. The order only changes once Stripe confirms.
                </span>
              </Form>
            ) : null}
          </div>

          <div style={card}>
            <div style={cardHeader}>Where it came from</div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <KeyValue label="Source" value={order.source ?? "—"} />
              <KeyValue label="Campaign" value={order.campaign ?? "—"} />
              <KeyValue label="Meta event" value={order.metaEventId ?? "—"} mono />
            </div>
          </div>

          <div style={card}>
            <div style={cardHeader}>Note</div>
            <Form method="post" style={{ padding: 16 }}>
              <input type="hidden" name="intent" value="note" />
              <textarea name="note" defaultValue={order.note} style={textarea} placeholder="Private note about this order" />
              <button type="submit" disabled={busy} style={{ ...secondaryButton, marginTop: 8 }}>
                Save note
              </button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: strong ? 650 : 400 }}>
      <span style={{ color: strong ? "var(--ink)" : "var(--ink-2)" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function KeyValue({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--ink-2)" }}>{label}</span>
      <span
        style={{
          fontFamily: mono ? "'JetBrains Mono',monospace" : undefined,
          fontSize: mono ? 12 : undefined,
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}
