/**
 * Stripe webhook.
 *
 * The authoritative record of what happened to a payment. The browser can be
 * closed the instant the card is charged; this is what makes the order correct
 * anyway.
 *
 * The signature is verified before anything is written, so a forged POST
 * cannot mark orders paid.
 */
import { notifyAdmins, money } from "~/lib/notify.server";
import type { Route } from "./+types/webhooks.stripe";
import { eq, sql } from "drizzle-orm";
import { orders, paymentProviders } from "~/db/schema";
import { decryptSecret } from "~/lib/crypto.server";
import { orderByPaymentRef, markOrderPaid, recordOrderEvent, recordVisitorEvent } from "~/lib/admin.server";
import { afterPaymentConfirmed } from "~/lib/fulfilment.server";

/** Stripe signs with HMAC-SHA256 over "timestamp.payload". */
async function signatureValid(
  payload: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((piece) => piece.split("=") as [string, string]),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject anything older than five minutes so a captured request cannot be
  // replayed later.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return difference === 0;
}

export async function action({ request, context }: Route.ActionArgs) {
  const payload = await request.text();
  const header = request.headers.get("Stripe-Signature");

  // The event names the store through metadata; the signing secret is that
  // store's own, so one store's secret cannot validate another's events.
  let parsed: any;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  const object = parsed?.data?.object ?? {};
  const storeId = object?.metadata?.storeId;
  if (!storeId) return new Response("No store on the event", { status: 400 });

  const [provider] = await context.db
    .select()
    .from(paymentProviders)
    .where(eq(paymentProviders.storeId, storeId))
    .limit(1);

  const signingSecret = await decryptSecret(context.cloudflare.env, provider?.webhookSecretEnc ?? null);
  if (!signingSecret) {
    return new Response("No webhook secret configured for this store", { status: 400 });
  }

  if (!(await signatureValid(payload, header, signingSecret))) {
    return new Response("Bad signature", { status: 400 });
  }

  // payment_intent.* events carry the intent as `id`; charge.* events carry
  // a charge id and point at the intent through `payment_intent`. Orders are
  // keyed by the intent, so refunds and disputes must resolve through it.
  const intentId: string | undefined =
    typeof object?.payment_intent === "string" ? object.payment_intent : object?.id;
  if (!intentId) return new Response("ok", { status: 200 });

  const order = await orderByPaymentRef(context.db, intentId);
  if (!order) return new Response("ok", { status: 200 });

  if (parsed.type === "payment_intent.succeeded" && order.paymentStatus !== "paid") {
    await markOrderPaid(context.db, order.id, `Payment confirmed by Stripe webhook · ${intentId}`);
    await recordVisitorEvent(context.db, storeId, {
      type: "purchase",
      sessionId: intentId,
      amountCents: order.totalCents,
      orderId: order.id,
    });
    await afterPaymentConfirmed(context.db, context.cloudflare.env, order.id, request);
    // The sound on his phone and his laptop. Last, and never fatal: the money
    // is already recorded by this point.
    await notifyAdmins(context.db, context.cloudflare.env, {
      title: "Order paid",
      body: `#${order.number} · ${money(order.totalCents, order.currency ?? "USD")}`,
      url: `/admin/orders/${order.id}`,
      tag: `order-${order.id}`,
    });
  }

  if (parsed.type === "payment_intent.payment_failed") {
    await context.db
      .update(orders)
      .set({ paymentStatus: "failed", updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await recordOrderEvent(
      context.db,
      order.id,
      "payment:failed",
      `Payment failed · ${object?.last_payment_error?.message ?? "no reason given"}`,
    );
  }

  if (parsed.type === "charge.refunded") {
    // Stripe reports the running total refunded on the charge. Never lower
    // what we already know, and never call a partial refund a full one.
    const reported = Number(object?.amount_refunded ?? 0);
    const [updated] = await context.db
      .update(orders)
      .set({
        refundedCents: sql`greatest(${orders.refundedCents}, ${reported})`,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning({ refundedCents: orders.refundedCents, totalCents: orders.totalCents });
    const full = (updated?.refundedCents ?? 0) >= (updated?.totalCents ?? Infinity);
    await context.db
      .update(orders)
      .set({ paymentStatus: full ? "refunded" : "partially_refunded" })
      .where(eq(orders.id, order.id));
    await recordOrderEvent(
      context.db,
      order.id,
      "refund:confirmed",
      `Stripe confirms ${((updated?.refundedCents ?? 0) / 100).toFixed(2)} ${order.currency} refunded in total${full ? " · fully refunded" : ""}`,
    );
  }

  if (parsed.type === "charge.dispute.created") {
    await recordOrderEvent(
      context.db,
      order.id,
      "chargeback",
      `Chargeback opened · ${object?.reason ?? "no reason given"}`,
    );
  }

  return new Response("ok", { status: 200 });
}

/** A GET here is someone checking the address; say so plainly. */
export function loader() {
  return new Response("This endpoint receives Stripe webhooks.", { status: 200 });
}
