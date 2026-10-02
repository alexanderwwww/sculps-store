/**
 * Klarna and Affirm: start the payment, then finish it when the customer is
 * back.
 *
 * POST  - the checkout form's details and a method. The cart is priced on the
 *         server, the order is written (pending), the intent on the LLC's
 *         Stripe account is confirmed, and the browser is told where to go.
 * GET   - where Klarna / Affirm send the customer back to. Stripe is asked
 *         what happened; only a succeeded intent turns the order into a paid
 *         one. A declined or abandoned attempt goes back to the checkout with
 *         nothing charged.
 *
 * The amount is never taken from the browser.
 */
import type { Route } from "./+types/checkout.bnpl";
import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import { resolveStore } from "~/lib/store.server";
import { readCartToken, priceCart, markCartConverted } from "~/lib/cart.server";
import { bnplFor, createBnplIntent, confirmBnplIntent, readBnplIntent, BNPL_METHODS, type BnplMethod } from "~/lib/bnpl.server";
import { placeOrder, markOrderPaid, recordOrderEvent } from "~/lib/admin.server";
import { afterPaymentConfirmed } from "~/lib/fulfilment.server";
import { orders as ordersTable } from "~/db/schema";
import { deviceFromRequest, geoFromContext, readVisitorHuman, readVisitorSession, track } from "~/lib/visitor.server";
import { newMetaEventId, readMetaCookies } from "~/lib/meta.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Affirm will not finance under $50. Klarna's own limits are enforced by Stripe. */
const MIN_CENTS: Record<BnplMethod, number> = { klarna: 100, affirm: 5000 };

export async function action({ context, request }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) return json({ error: "No store for this domain." }, 404);

  const account = await bnplFor(context.db, context.cloudflare.env, store.id);
  if (!account) return json({ error: "Pay-over-time is not set up for this store." }, 400);

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Bad request." }, 400);

  const method = String(form.get("method") ?? "") as BnplMethod;
  if (!BNPL_METHODS.includes(method)) return json({ error: "Unknown payment method." }, 400);

  const token = readCartToken(request);
  const region = String(form.get("region") ?? "").trim().toUpperCase();
  const cart = await priceCart(context.db, store, token, region || null);
  if (!cart.lines.length) return json({ error: "Your cart is empty." }, 400);
  if (cart.totalCents < MIN_CENTS[method]) {
    return json({ error: method === "affirm" ? "Affirm is available on orders of $50 or more." : "This order is too small for Klarna." }, 400);
  }

  const field = (name: string) => String(form.get(name) ?? "").trim();
  const customer = {
    name: field("name"),
    email: field("email").toLowerCase(),
    phone: field("phone") || null,
    line1: field("address1"),
    line2: [field("company"), field("address2")].filter(Boolean).join(" · ") || null,
    city: field("city"),
    state: region,
    postalCode: field("postalCode"),
    country: field("country").toUpperCase(),
  };
  const missing: string[] = [];
  if (!customer.name) missing.push("name");
  if (!/^\S+@\S+\.\S+$/.test(customer.email)) missing.push("email");
  if (!customer.line1) missing.push("address");
  if (!customer.city) missing.push("city");
  if (!customer.state) missing.push("state");
  if (!customer.postalCode) missing.push("ZIP code");
  if (missing.length) return json({ error: `Please fill in your ${missing.join(", ")} first.` }, 400);
  if (customer.country !== "US") {
    return json({ error: "Klarna and Affirm are for delivery in the United States." }, 400);
  }

  let intentId: string;
  try {
    intentId = (
      await createBnplIntent(account, {
        amountCents: cart.totalCents,
        currency: cart.currency,
        method,
        description: `${store.name} order`,
        storeId: store.id,
      })
    ).id;
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The payment could not be started." }, 502);
  }

  const geo = geoFromContext(context, request);
  const metaCookies = readMetaCookies(request, url);
  const order = await placeOrder(context.db, {
    storeId: store.id,
    customerName: customer.name,
    email: customer.email,
    phone: customer.phone,
    address1: customer.line1,
    address2: customer.line2,
    marketingConsent: form.get("consent") === "on",
    city: customer.city,
    region: customer.state,
    postalCode: customer.postalCode,
    country: customer.country,
    subtotalCents: cart.subtotalCents,
    discountCode: cart.discount?.code ?? null,
    discountCents: cart.discount?.amountCents ?? 0,
    shippingCents: cart.shippingCents,
    taxCents: cart.taxCents,
    totalCents: cart.totalCents,
    currency: cart.currency,
    paymentProvider: "stripe_bnpl",
    paymentRef: intentId,
    paymentStatus: "pending",
    source: url.searchParams.get("utm_source") || null,
    campaign: url.searchParams.get("utm_campaign") || null,
    metaEventId: newMetaEventId(),
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
    await context.db.update(ordersTable).set({ protectionCents: cart.protectionCents }).where(eq(ordersTable.id, order.id));
  }
  await recordOrderEvent(context.db, order.id, "payment:started", `${method === "klarna" ? "Klarna" : "Affirm"} started.`).catch(() => undefined);

  try {
    const confirmed = await confirmBnplIntent(account, intentId, {
      method,
      customer,
      returnUrl: `${url.origin}/checkout/bnpl?order=${order.id}`,
      orderId: order.id,
    });
    if (!confirmed.redirectUrl) {
      return json({ error: `${method === "klarna" ? "Klarna" : "Affirm"} did not give a way to continue (${confirmed.status}).` }, 502);
    }
    track(context.db, context.cloudflare.ctx, {
      storeId: store.id,
      sessionId: readVisitorSession(request) ?? token ?? intentId,
      type: "checkout",
      path: "/checkout",
      geo,
      device: deviceFromRequest(request),
      amountCents: cart.totalCents,
      orderId: order.id,
      request,
    });
    return json({ url: confirmed.redirectUrl });
  } catch (error) {
    await context.db.update(ordersTable).set({ paymentStatus: "failed", updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
    return json({ error: error instanceof Error ? error.message : "The payment could not be started." }, 502);
  }
}

/** The customer is back from Klarna / Affirm. Ask Stripe, never assume. */
export async function loader({ context, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });

  const orderId = url.searchParams.get("order");
  const intentId = url.searchParams.get("payment_intent");
  if (!orderId || !intentId) throw redirect("/checkout");

  const [order] = await context.db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  // The intent in the address must be the one this order was started with.
  if (!order || order.storeId !== store.id || order.paymentRef !== intentId) throw redirect("/checkout");

  const account = await bnplFor(context.db, context.cloudflare.env, store.id);
  if (!account) throw redirect("/checkout");

  let intent;
  try {
    intent = await readBnplIntent(account, intentId);
  } catch {
    throw redirect(`/thanks?order=${order.id}`);
  }

  if (intent.status === "succeeded") {
    const claimed = await markOrderPaid(context.db, order.id, `Payment confirmed by Stripe (Aigis LLC) · ${intent.id}`);
    if (claimed) {
      const token = readCartToken(request);
      if (token) await markCartConverted(context.db, store.id, token, order.id).catch(() => undefined);
      const geo = geoFromContext(context, request);
      track(context.db, context.cloudflare.ctx, {
        storeId: store.id,
        sessionId: readVisitorSession(request) ?? token ?? intent.id,
        type: "purchase",
        path: "/checkout",
        geo,
        device: deviceFromRequest(request),
        human: readVisitorHuman(request),
        amountCents: order.totalCents,
        orderId: order.id,
      });
      context.cloudflare.ctx.waitUntil(
        afterPaymentConfirmed(context.db, context.cloudflare.env, order.id, request).catch(() => undefined),
      );
    }
    throw redirect(`/thanks?order=${order.id}`);
  }

  if (intent.status === "processing") throw redirect(`/thanks?order=${order.id}`);

  // Declined, cancelled or closed before finishing: nothing was charged.
  await context.db
    .update(ordersTable)
    .set({ paymentStatus: "failed", updatedAt: new Date() })
    .where(eq(ordersTable.id, order.id));
  throw redirect("/checkout?installments=declined");
}
