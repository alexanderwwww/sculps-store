/**
 * PayPal: create the order, then capture it.
 *
 * Two steps, one route. The button asks for an order id, the buyer approves
 * it inside PayPal's own window, and the button comes back here to capture.
 * The money moves on capture and not a moment before, so a buyer who closes
 * the window has bought nothing and owes nothing.
 *
 * PayPal hands back the payer's name, email and shipping address, which is
 * why this works like a wallet: the customer never fills the form. Everything
 * the order needs arrives with the capture.
 *
 * Nothing here trusts the browser for money. The amount is priced from the
 * cart on the server on both calls, so a tampered request buys nothing at a
 * price nobody agreed to.
 */
import type { Route } from "./+types/checkout.paypal";
import { eq } from "drizzle-orm";
import { resolveStore } from "~/lib/store.server";
import { readCartToken, priceCart, markCartConverted } from "~/lib/cart.server";
import { paypalFor } from "~/lib/paypal.server";
import { placeOrder, markOrderPaid, recordOrderEvent } from "~/lib/admin.server";
import { afterPaymentConfirmed } from "~/lib/fulfilment.server";
import { orders as ordersTable } from "~/db/schema";
import {
  deviceFromRequest,
  geoFromContext,
  readVisitorHuman,
  readVisitorSession,
  track,
} from "~/lib/visitor.server";
import { newMetaEventId, readMetaCookies } from "~/lib/meta.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function action({ context, request }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) return json({ error: "No store for this domain." }, 404);

  const client = await paypalFor(context.db, context.cloudflare.env, store.id);
  if (!client) return json({ error: "PayPal is not connected to this store." }, 400);

  let body: { step?: string; orderID?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Bad request." }, 400);
  }

  const token = readCartToken(request);
  const cart = await priceCart(context.db, store, token);
  if (!cart.lines.length) return json({ error: "Your cart is empty." }, 400);

  /* ------------------------------------------------------------- create */
  if (body.step === "create") {
    try {
      const order = await client.createOrder({
        amountCents: cart.totalCents,
        currency: store.currency,
        reference: token ?? store.slug,
        brandName: store.name,
      });
      return json({ id: order.id });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "PayPal refused the order." }, 502);
    }
  }

  /* ------------------------------------------------------------ capture */
  if (body.step === "capture") {
    if (!body.orderID) return json({ error: "No PayPal order to capture." }, 400);

    let capture;
    try {
      capture = await client.captureOrder(body.orderID);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "PayPal could not take the payment." }, 502);
    }

    if (capture.status !== "COMPLETED") {
      return json({ error: `PayPal did not complete the payment (${capture.status}).` }, 402);
    }

    /**
     * The capture is the receipt. If an order already carries this capture id
     * the button was pressed twice or the network retried — return the order
     * that exists rather than charging or writing a second one.
     */
    const [already] = await context.db
      .select({ id: ordersTable.id, number: ordersTable.number })
      .from(ordersTable)
      .where(eq(ordersTable.paymentRef, capture.captureId))
      .limit(1);
    if (already) return json({ ok: true, orderId: already.id, orderNumber: already.number });

    const geo = geoFromContext(context, request);
    const metaCookies = readMetaCookies(request);
    const metaEventId = newMetaEventId();
    const name = [capture.shipping.name, `${capture.payer.firstName ?? ""} ${capture.payer.lastName ?? ""}`.trim()]
      .find((value) => value && value.trim().length > 0) ?? "";

    const order = await placeOrder(context.db, {
      storeId: store.id,
      customerName: name,
      email: capture.payer.email ?? "",
      phone: null,
      address1: capture.shipping.line1,
      address2: capture.shipping.line2,
      marketingConsent: false,
      city: capture.shipping.city,
      region: capture.shipping.region,
      postalCode: capture.shipping.postalCode,
      country: capture.shipping.country ?? "??",
      subtotalCents: cart.subtotalCents,
      // Both worked out by priceCart, on the server, from the code on the
      // cart row — never from anything the browser sent.
      discountCode: cart.discount?.code ?? null,
      discountCents: cart.discount?.amountCents ?? 0,
      shippingCents: cart.shippingCents,
      taxCents: cart.taxCents,
      totalCents: cart.totalCents,
      currency: cart.currency,
      paymentProvider: "paypal",
      paymentRef: capture.captureId,
      paymentStatus: "pending",
      source: url.searchParams.get("utm_source") || null,
      campaign: url.searchParams.get("utm_campaign") || null,
      metaEventId,
      fbp: metaCookies.fbp,
      fbc: metaCookies.fbc,
      lat: geo.lat,
      lon: geo.lon,
      lines: cart.lines.map((line) => ({
        variantId: line.variantId,
        title: line.productTitle,
        label: line.label,
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
      })),
    });

    if (cart.protectionCents > 0) {
      await context.db
        .update(ordersTable)
        .set({ protectionCents: cart.protectionCents })
        .where(eq(ordersTable.id, order.id));
    }

    /**
     * What PayPal took, against what the cart said. They should be equal;
     * if they are not, the order is still paid — the money is real — but the
     * difference is on the timeline where a person will see it before the
     * parcel goes out.
     */
    if (capture.amountCents !== cart.totalCents) {
      await recordOrderEvent(
        context.db,
        order.id,
        "payment:mismatch",
        `PayPal captured ${(capture.amountCents / 100).toFixed(2)} ${capture.currency} but the cart was ${(cart.totalCents / 100).toFixed(2)} ${store.currency}. Check before shipping.`,
      ).catch(() => undefined);
    }

    // The capture already happened, so this order is paid now — there is no
    // webhook to wait for the way there is with a card.
    await markOrderPaid(context.db, order.id, `PayPal capture ${capture.captureId}`);

    if (!capture.shipping.line1) {
      await recordOrderEvent(
        context.db,
        order.id,
        "wallet:incomplete",
        "Paid with PayPal; it did not provide a shipping address. Message the customer before shipping.",
      ).catch(() => undefined);
    }

    if (token) await markCartConverted(context.db, store.id, token, order.id).catch(() => undefined);

    track(context.db, context.cloudflare.ctx, {
      storeId: store.id,
      sessionId: readVisitorSession(request) ?? token ?? capture.captureId,
      type: "purchase",
      path: "/checkout",
      geo,
      device: deviceFromRequest(request),
      human: readVisitorHuman(request),
      amountCents: cart.totalCents,
      orderId: order.id,
    });

    // Receipt, merchant alert, Meta. Never blocks the answer to the browser.
    context.cloudflare.ctx.waitUntil(
      afterPaymentConfirmed(context.db, context.cloudflare.env, order.id, request).catch(() => undefined),
    );

    return json({ ok: true, orderId: order.id, orderNumber: order.number });
  }

  return json({ error: "Unknown step." }, 400);
}

/** Nothing to GET. */
export async function loader() {
  return new Response(null, { status: 405 });
}
