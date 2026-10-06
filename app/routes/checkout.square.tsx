/**
 * Square: start the payment, then finish it when the customer is back.
 *
 * POST  - the checkout form's details. The cart is priced on the server, the
 *         order is written (pending), a Square payment link is made for
 *         exactly that total, and the browser is told where to go.
 * GET   - where Square sends the customer back to. Square is asked what
 *         happened; only a completed payment for the full amount turns the
 *         order into a paid one. An abandoned attempt goes back to the
 *         checkout with nothing charged.
 *
 * The amount is never taken from the browser.
 */
import type { Route } from "./+types/checkout.square";
import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import { resolveStore } from "~/lib/store.server";
import { readCartToken, priceCart, markCartConverted } from "~/lib/cart.server";
import { squareFor, createPaymentLink, readSquareOrder } from "~/lib/square.server";
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

export async function action({ context, request }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) return json({ error: "No store for this domain." }, 404);

  const account = await squareFor(context.db, context.cloudflare.env, store.id);
  if (!account) return json({ error: "Card payments are not set up for this store." }, 400);

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Bad request." }, 400);

  const token = readCartToken(request);
  const region = String(form.get("region") ?? "").trim().toUpperCase();
  const cart = await priceCart(context.db, store, token, region || null);
  if (!cart.lines.length) return json({ error: "Your cart is empty." }, 400);

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
    country: field("country").toUpperCase() || "US",
  };
  const missing: string[] = [];
  if (!customer.name) missing.push("name");
  if (!/^\S+@\S+\.\S+$/.test(customer.email)) missing.push("email");
  if (!customer.line1) missing.push("address");
  if (!customer.city) missing.push("city");
  if (!customer.state) missing.push("state");
  if (!customer.postalCode) missing.push("ZIP code");
  if (missing.length) return json({ error: `Please fill in your ${missing.join(", ")} first.` }, 400);

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
    paymentProvider: "square",
    // Replaced with Square's own order id as soon as the link exists.
    paymentRef: `square:pending:${crypto.randomUUID()}`,
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

  try {
    const link = await createPaymentLink(account, {
      lines: cart.lines.map((line) => ({
        // "The 16 ft Scream — The 16 ft Scream" when the variant is named like its product.
        name:
          line.label && line.label.trim().toLowerCase() !== line.productTitle.trim().toLowerCase()
            ? `${line.productTitle} — ${line.label}`
            : line.productTitle,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      })),
      shippingCents: cart.shippingCents,
      taxCents: cart.taxCents,
      protectionCents: cart.protectionCents,
      discountCents: cart.discount?.amountCents ?? 0,
      discountName: cart.discount?.code ?? null,
      totalCents: cart.totalCents,
      currency: cart.currency,
      storeName: store.name,
      referenceId: order.id,
      redirectUrl: `${url.origin}/checkout/square?order=${order.id}`,
      customer,
      supportEmail: null,
    });
    await context.db.update(ordersTable).set({ paymentRef: link.orderId }).where(eq(ordersTable.id, order.id));
    await recordOrderEvent(context.db, order.id, "payment:started", "Square checkout started.").catch(() => undefined);
    track(context.db, context.cloudflare.ctx, {
      storeId: store.id,
      sessionId: readVisitorSession(request) ?? token ?? order.id,
      type: "checkout",
      path: "/checkout",
      geo,
      device: deviceFromRequest(request),
      amountCents: cart.totalCents,
      orderId: order.id,
      request,
    });
    return json({ url: link.url });
  } catch (error) {
    await context.db.update(ordersTable).set({ paymentStatus: "failed", updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
    return json({ error: error instanceof Error ? error.message : "The payment could not be started. Nothing has been charged." }, 502);
  }
}

/** The customer is back from Square. Ask Square, never assume. */
export async function loader({ context, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });

  const orderId = url.searchParams.get("order");
  if (!orderId) throw redirect("/checkout");

  const [order] = await context.db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order || order.storeId !== store.id || order.paymentProvider !== "square" || !order.paymentRef) throw redirect("/checkout");
  if (order.paymentStatus === "paid") throw redirect(`/thanks?order=${order.id}`);

  const account = await squareFor(context.db, context.cloudflare.env, store.id);
  if (!account) throw redirect("/checkout");

  let settled;
  try {
    settled = await readSquareOrder(account, order.paymentRef);
  } catch {
    // Square could not be asked. The scheduled check settles it; the customer
    // is shown their order rather than a dead end.
    throw redirect(`/thanks?order=${order.id}`);
  }

  if (settled.paid && settled.amountCents === order.totalCents) {
    const claimed = await markOrderPaid(context.db, order.id, `Payment confirmed by Square · ${settled.paymentId}`);
    if (claimed) {
      const token = readCartToken(request);
      if (token) await markCartConverted(context.db, store.id, token, order.id).catch(() => undefined);
      const geo = geoFromContext(context, request);
      track(context.db, context.cloudflare.ctx, {
        storeId: store.id,
        sessionId: readVisitorSession(request) ?? token ?? order.id,
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

  if (settled.paid) {
    // Paid, but not the amount the order says. Money is real; a person looks.
    await recordOrderEvent(
      context.db,
      order.id,
      "payment:mismatch",
      `Square took ${((settled.amountCents ?? 0) / 100).toFixed(2)} but the order was ${(order.totalCents / 100).toFixed(2)}. Check before shipping.`,
    ).catch(() => undefined);
    throw redirect(`/thanks?order=${order.id}`);
  }

  // Closed or abandoned before paying: nothing was charged.
  await context.db
    .update(ordersTable)
    .set({ paymentStatus: "failed", updatedAt: new Date() })
    .where(eq(ordersTable.id, order.id));
  throw redirect("/checkout?card=declined");
}
