/**
 * Thank you page.
 *
 * Stripe sends the browser back here after payment. The page confirms with
 * Stripe rather than trusting the redirect, because a redirect can be typed
 * into the address bar by anyone.
 */
import { Link } from "react-router";
import type { Route } from "./+types/thanks";
import { eq } from "drizzle-orm";
import { resolveStore } from "~/lib/store.server";
import { loadOrder, markOrderPaid, recordVisitorEvent } from "~/lib/admin.server";
import { providerForStore } from "~/lib/payments.server";
import { afterPaymentConfirmed } from "~/lib/fulfilment.server";
import { metaConfig } from "~/db/schema";
import { pixelScript, purchasePixelScript } from "~/lib/meta.server";
import { formatMoney } from "~/lib/money";
import themeHref from "~/storefronts/garden-kneeler/theme.css?url";

export function links() {
  return [
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap",
    },
    { rel: "stylesheet", href: themeHref },
  ];
}

export function meta() {
  return [{ title: "Thank you" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });

  const orderId = url.searchParams.get("order");
  if (!orderId) throw new Response("No order given.", { status: 400 });

  const loaded = await loadOrder(context.db, orderId);
  if (!loaded || loaded.order.storeId !== store.id) {
    throw new Response("Order not found.", { status: 404 });
  }

  // Ask Stripe what actually happened rather than believing the redirect.
  let paymentStatus = loaded.order.paymentStatus;
  if (paymentStatus === "pending" && loaded.order.paymentRef) {
    try {
      const provider = await providerForStore(context.db, context.cloudflare.env, store.id);
      const intent = await provider.readIntent(loaded.order.paymentRef);
      if (intent.status === "succeeded") {
        await markOrderPaid(
          context.db,
          loaded.order.id,
          `Payment confirmed by ${provider.name} · ${intent.id}`,
        );
        paymentStatus = "paid";
        await recordVisitorEvent(context.db, store.id, {
          type: "purchase",
          sessionId: intent.id,
          path: "/thanks",
          amountCents: loaded.order.totalCents,
          orderId: loaded.order.id,
        });
        await afterPaymentConfirmed(context.db, context.cloudflare.env, loaded.order.id, request);
      }
    } catch {
      // Leave it pending. The webhook is the other route to the truth, and an
      // order that says pending is recoverable; one that wrongly says paid is
      // not.
    }
  }

  // The browser half of the Purchase event. Same event id as the server call,
  // so Meta merges the two rather than counting the sale twice.
  const [metaRow] = await context.db
    .select({ pixelId: metaConfig.pixelId })
    .from(metaConfig)
    .where(eq(metaConfig.storeId, store.id))
    .limit(1);

  const pixel =
    metaRow?.pixelId && paymentStatus === "paid" && loaded.order.metaEventId
      ? `${pixelScript(metaRow.pixelId)}\n${purchasePixelScript({
          eventId: loaded.order.metaEventId,
          valueCents: loaded.order.totalCents,
          currency: loaded.order.currency,
        })}`
      : null;

  return {
    pixel,
    store: { name: store.name, slug: store.slug, contactEmail: store.contactEmail },
    order: {
      number: loaded.order.number,
      email: loaded.order.email,
      customerName: loaded.order.customerName,
      address: [loaded.order.address1, loaded.order.address2, loaded.order.city, loaded.order.region, loaded.order.postalCode, loaded.order.country]
        .filter(Boolean)
        .join(", "),
      total: formatMoney(loaded.order.totalCents, loaded.order.currency),
      paymentStatus,
    },
    items: loaded.items.map((item) => ({
      id: item.id,
      label: item.label,
      quantity: item.quantity,
      lineTotal: formatMoney(item.unitPriceCents * item.quantity, loaded.order.currency),
    })),
  };
}

export default function Thanks({ loaderData }: Route.ComponentProps) {
  const { store, order, items, pixel } = loaderData;
  const paid = order.paymentStatus === "paid";

  return (
    <div className="gk">
      {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
      <header className="gk-header">
        <Link className="gk-logo" to={`/?store=${store.slug}`} style={{ textDecoration: "none" }}>
          {store.name}
        </Link>
      </header>

      <div className="gk-shell">
        <div className="gk-panel">
          <h1 style={{ marginTop: 0 }}>
            {paid ? "Thank you — your order is in." : "We have your order."}
          </h1>

          <p style={{ fontSize: 20 }}>
            Order <strong>#{order.number}</strong>
            {paid ? (
              <> — a receipt is on its way to {order.email}.</>
            ) : (
              <> — the payment is still being confirmed. You will get an email once it clears.</>
            )}
          </p>

          {order.address ? (
            <p className="gk-quiet" style={{ marginTop: 0 }}>
              Shipping to: <strong style={{ color: "var(--gk-cream)" }}>{order.address}</strong>
              {store.contactEmail ? ` — wrong? Email ${store.contactEmail} right away and quote #${order.number}.` : ""}
            </p>
          ) : null}
          {items.map((item) => (
            <div className="gk-line" key={item.id}>
              <span style={{ flex: 1 }}>
                <strong>{item.label}</strong> <span className="gk-quiet">× {item.quantity}</span>
              </span>
              <span style={{ fontWeight: 700 }}>{item.lineTotal}</span>
            </div>
          ))}

          <div className="gk-totals" style={{ borderTop: "1px solid var(--gk-line)", marginTop: 8, paddingTop: 14 }}>
            <strong>Total</strong>
            <strong>{order.total}</strong>
          </div>

          {store.contactEmail ? (
            <p className="gk-quiet" style={{ marginTop: 20 }}>
              Any questions, reply to your receipt or write to {store.contactEmail} and quote #
              {order.number}.
            </p>
          ) : null}

          <Link
            className="gk-cta"
            to={`/?store=${store.slug}`}
            style={{ display: "inline-block", marginTop: 18, textDecoration: "none" }}
          >
            Back to the store
          </Link>
        </div>
      </div>
    </div>
  );
}
