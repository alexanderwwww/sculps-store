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
import { and, eq, sql } from "drizzle-orm";
import { carts, orders, paymentProviders, stores } from "~/db/schema";
import { recomputeCustomerTotals } from "~/lib/customers.server";
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

  // During a signing-secret roll Stripe sends two v1 entries. Keep them all
  // and accept any that matches, or a valid event is rejected for the whole
  // roll-over window.
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const piece of header.split(",")) {
    const [k, v] = piece.trim().split("=") as [string, string];
    if (k === "t") timestamp = v;
    else if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;

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

  return signatures.some((signature) => {
    if (expected.length !== signature.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i++) {
      difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return difference === 0;
  });
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

  // payment_intent.* events carry the intent as `id`; charge.* events carry a
  // charge id and point at the intent through `payment_intent`. Orders are
  // keyed by the intent, so everything resolves through it — including which
  // store's signing secret to check with. A Dispute object carries no
  // metadata at all, which is why looking there used to 400 every chargeback
  // for as long as Stripe kept retrying.
  const intentId: string | undefined =
    typeof object?.payment_intent === "string" ? object.payment_intent : object?.id;
  const early = intentId ? await orderByPaymentRef(context.db, intentId) : null;
  const storeId: string | undefined = early?.storeId ?? object?.metadata?.storeId;
  // Not ours, or not an order we know: acknowledge it so Stripe stops asking.
  if (!storeId) return new Response("ok", { status: 200 });

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

  if (!intentId) return new Response("ok", { status: 200 });
  const order = early ?? (await orderByPaymentRef(context.db, intentId));
  if (!order) return new Response("ok", { status: 200 });

  if (parsed.type === "payment_intent.succeeded") {
    // Exactly one of the webhook and the return page wins this; the other
    // does nothing further. Everything after the claim is best effort and
    // must not fail the webhook: the money is already recorded, and a 500
    // here would only make Stripe retry an event that is now a no-op.
    const claimed = await markOrderPaid(
      context.db,
      order.id,
      `Payment confirmed by Stripe webhook · ${intentId}`,
    );
    if (claimed) {
      const [store] = await context.db
        .select({ slug: stores.slug })
        .from(stores)
        .where(eq(stores.id, order.storeId))
        .limit(1);
      try {
        await recordVisitorEvent(context.db, storeId, {
          type: "purchase",
          sessionId: intentId,
          city: order.city,
          region: order.region,
          country: order.country,
          lat: order.lat,
          lon: order.lon,
          amountCents: order.totalCents,
          orderId: order.id,
        });
      } catch (error) {
        await recordOrderEvent(context.db, order.id, "event:failed", `Purchase event not written · ${String(error)}`).catch(() => undefined);
      }
      // The cart that produced this payment is finished, whether or not the
      // customer ever reaches the thank-you page.
      try {
        await context.db
          .update(carts)
          .set({ status: "converted", orderId: order.id, updatedAt: new Date() })
          .where(and(eq(carts.storeId, order.storeId), eq(carts.paymentIntentId, intentId)));
      } catch {
        /* the cart is a convenience; the order is the record */
      }
      try {
        await afterPaymentConfirmed(context.db, context.cloudflare.env, order.id, request);
      } catch (error) {
        await recordOrderEvent(context.db, order.id, "after-payment:failed", `After-payment steps failed · ${String(error)}`).catch(() => undefined);
      }
      // The sound on his phone and his laptop. Last, and never fatal.
      try {
        await notifyAdmins(context.db, context.cloudflare.env, {
          title: "Order paid",
          body: `#${order.number} · ${money(order.totalCents, order.currency ?? "USD")}`,
          url: `/admin/orders/${order.id}${store ? `?store=${store.slug}` : ""}`,
          tag: `order-${order.id}`,
        });
      } catch {
        /* a missed ping is not a missed order */
      }
    }
  }

  if (parsed.type === "payment_intent.payment_failed") {
    // Only a pending order can fail. A late or retried failure event must
    // never overwrite a payment that has since succeeded.
    const [flipped] = await context.db
      .update(orders)
      .set({ paymentStatus: "failed", updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.paymentStatus, "pending")))
      .returning({ id: orders.id });
    if (!flipped) return new Response("ok", { status: 200 });
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
    // Lifetime spend is net of refunds; recount it now, not at their next order.
    await recomputeCustomerTotals(context.db, order.storeId, order.email).catch(() => undefined);
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
