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
  loadOrder,
  setOrderState,
  setTracking,
  addOrderNote,
  recordOrderEvent,
} from "~/lib/admin.server";
import { money } from "~/lib/money";
import { sendShippingNotice, emailReady } from "~/lib/email.server";
import { orders } from "~/db/schema";
import { eq } from "drizzle-orm";
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

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.order ? `Order #${data.order.number} — Shop Admin` : "Order — Shop Admin" }];
}

export async function loader({ context, request, params }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const loaded = await loadOrder(context.db, params.id);
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
      paymentStatus: order.paymentStatus,
      paymentProvider: order.paymentProvider,
      paymentRef: order.paymentRef,
      tracking: order.tracking,
      carrier: order.carrier,
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

  if (intent === "mark-ordered") {
    await setOrderState(context.db, orderId, "ordered", "Marked as ordered with supplier");
    return { ok: true };
  }

  if (intent === "tracking") {
    const tracking = String(form.get("tracking") || "").trim();
    const carrier = String(form.get("carrier") || "").trim();
    if (!tracking) return { error: "Paste the tracking number first." };

    await setTracking(context.db, orderId, tracking, carrier);

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
    await addOrderNote(context.db, orderId, String(form.get("note") || ""));
    return { ok: true };
  }

  if (intent === "refund") {
    const loaded = await loadOrder(context.db, orderId);
    if (!loaded) return { error: "That order no longer exists." };
    const reason = String(form.get("reason") || "").trim();

    // The money movement itself belongs to the payment provider and is wired
    // up with Stripe. Recording it here without moving money would be a lie in
    // the one record that has to be true, so the refund is marked as requested
    // and the timeline says exactly that.
    await context.db
      .update(orders)
      .set({ state: "refunded", paymentStatus: "refund_pending", updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await recordOrderEvent(
      context.db,
      orderId,
      "refund:requested",
      `Refund of ${money(loaded.order.totalCents, loaded.order.currency)} requested by ${user.email}${
        reason ? ` · ${reason}` : ""
      } · awaiting the payment provider`,
      { reason, requestedBy: user.email },
    );
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
            : order.paymentStatus === "refund_pending"
              ? "Refund pending"
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
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "var(--ink-2)" }}>Tracking</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>
                    {order.tracking}
                  </span>
                  {order.carrier ? <Badge kind="neutral">{order.carrier}</Badge> : null}
                </div>
              ) : (
                <Form method="post" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <input type="hidden" name="intent" value="tracking" />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)", display: "block", marginBottom: 4 }}>
                      Tracking number
                    </label>
                    <input name="tracking" style={input} placeholder="9400 1112 0620 …" />
                  </div>
                  <div style={{ width: 140 }}>
                    <label style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)", display: "block", marginBottom: 4 }}>
                      Carrier
                    </label>
                    <input name="carrier" style={input} placeholder="USPS" />
                  </div>
                  <button type="submit" disabled={busy} style={primaryButton}>
                    Add tracking
                  </button>
                </Form>
              )}
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
            {order.state !== "refunded" ? (
              <Form method="post" style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
                <input type="hidden" name="intent" value="refund" />
                <label style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)", display: "block", marginBottom: 4 }}>
                  Refund reason
                </label>
                <input name="reason" style={{ ...input, marginBottom: 8 }} placeholder="Item damaged in transit" />
                <button type="submit" disabled={busy} style={{ ...criticalButton, width: "100%", justifyContent: "center" }}>
                  Refund {order.total}
                </button>
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
