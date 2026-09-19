/**
 * Thank you page.
 *
 * Stripe sends the browser back here after payment. The page confirms with
 * Stripe rather than trusting the redirect, because a redirect can be typed
 * into the address bar by anyone.
 */
import { Link, data, useFetcher } from "react-router";
import { CheckoutHeader, CheckoutFooter } from "~/storefronts/garden-buddy/checkout-chrome";
import buddyHref from "~/storefronts/garden-buddy/checkout.css?url";
import type { Route } from "./+types/thanks";
import { eq } from "drizzle-orm";
import { resolveStore, storeNav } from "~/lib/store.server";
import { readCartToken, markCartConverted } from "~/lib/cart.server";
import { loadOrder, markOrderPaid, recordVisitorEvent } from "~/lib/admin.server";
import { providerForStore } from "~/lib/payments.server";
import { afterPaymentConfirmed } from "~/lib/fulfilment.server";
import { metaConfig } from "~/db/schema";
import { pixelScript, purchasePixelScript } from "~/lib/meta.server";
import { readVisitorSession } from "~/lib/visitor.server";
import { formatMoney } from "~/lib/money";
import { offerForOrder, takeOffer, declineOffer } from "~/lib/upsell.server";
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
        // The webhook races this page for the claim; whoever gets it does the
        // rest, and the other does nothing. Either way the page shows paid.
        const claimed = await markOrderPaid(
          context.db,
          loaded.order.id,
          `Payment confirmed by ${provider.name} · ${intent.id}`,
        );
        paymentStatus = "paid";
        if (claimed) {
          await recordVisitorEvent(context.db, store.id, {
            type: "purchase",
            sessionId: intent.id,
            path: "/thanks",
            city: loaded.order.city,
            region: loaded.order.region,
            country: loaded.order.country,
            lat: loaded.order.lat,
            lon: loaded.order.lon,
            amountCents: loaded.order.totalCents,
            orderId: loaded.order.id,
          });
          await afterPaymentConfirmed(context.db, context.cloudflare.env, loaded.order.id, request);
        }
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
      ? `${pixelScript(metaRow.pixelId, {
          match: {
            externalId: readVisitorSession(request),
            email: loaded.order.email,
            phone: loaded.order.phone,
            firstName: loaded.order.customerName.split(" ")[0] || null,
            lastName: loaded.order.customerName.split(" ").slice(1).join(" ") || null,
            city: loaded.order.city,
            region: loaded.order.region,
            postalCode: loaded.order.postalCode,
            country: loaded.order.country,
          },
        })}\n${purchasePixelScript({
          eventId: loaded.order.metaEventId,
          valueCents: loaded.order.totalCents,
          currency: loaded.order.currency,
          // The same contents the server sends. Two halves of one deduplicated
          // event must describe the same purchase, or Meta keeps the poorer one.
          contents: loaded.items.map((item) => ({
            id: item.variantId ?? item.id,
            quantity: item.quantity,
            itemPrice: item.unitPriceCents,
          })),
        })}`
      : null;

  // A paid order ends the cart — here, and only here, because this is the
  // first place the payment is known to have gone through. The row is marked
  // converted (so a stale cookie cannot resurrect the bought lines) and the
  // cookie goes, so the next visit starts clean.
  if (paymentStatus === "paid") {
    const token = readCartToken(request);
    if (token) await markCartConverted(context.db, store.id, token, loaded.order.id).catch(() => undefined);
  }
  const headers =
    paymentStatus === "paid"
      ? { "Set-Cookie": `kerberos_cart=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}` }
      : undefined;

  const nav = ["garden-buddy", "ceiling-buddy", "reaper"].includes(store.slug)
    ? await storeNav(context.db, store.id)
    : null;

  /*
   * The one upsell that cannot cost a sale.
   *
   * The money has already moved and the order is safe, so an offer here can
   * only add. It is only worth showing because the card is still on file:
   * taking it is a button, not a second checkout. A failure to find one is
   * normal and silent — a shop with one product, or an order that already
   * holds everything cheap, simply gets no card.
   */
  const offer =
    paymentStatus === "paid"
      ? await offerForOrder(context.db, loaded.order.id).catch(() => null)
      : null;

  return data({
    offer: offer
      ? {
          variantId: offer.variantId,
          title: offer.productTitle,
          label: offer.variantLabel,
          imageUrl: offer.imageUrl,
          normal: formatMoney(offer.normalCents, loaded.order.currency),
          price: formatMoney(offer.offerCents, loaded.order.currency),
          saving: formatMoney(offer.savingCents, loaded.order.currency),
        }
      : null,
    orderId: loaded.order.id,
    pixel,
    store: { name: store.name, slug: store.slug, contactEmail: store.contactEmail, logoUrl: store.logoUrl },
    footerLinks: nav?.footer ?? [],
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
  }, headers ? { headers } : undefined);
}

/**
 * Taking the offer, or saying no to it.
 *
 * Both answers are a POST to this same page so the whole thing works with
 * JavaScript switched off, and both re-render with the card gone. The price
 * is never read from the form: the server looks the offer up again and
 * charges what it decides, because a price that arrives with the request is
 * a price the customer can choose.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });

  const form = await request.formData();
  const orderId = String(form.get("orderId") ?? "");
  const loaded = await loadOrder(context.db, orderId);
  if (!loaded || loaded.order.storeId !== store.id) {
    throw new Response("Order not found.", { status: 404 });
  }

  if (form.get("intent") === "decline") {
    await declineOffer(context.db, orderId);
    return data({ taken: false, error: null as string | null });
  }

  const result = await takeOffer(
    context.db,
    context.cloudflare.env,
    orderId,
    String(form.get("variantId") ?? ""),
  );
  return data(
    result.ok
      ? { taken: true, error: null as string | null }
      : { taken: false, error: result.reason },
  );
}

/**
 * The card itself.
 *
 * Deliberately plain: a picture, a name, what it costs here against what it
 * costs everywhere else, and one button. Anything more — a countdown, a
 * second offer, a modal that has to be dismissed — turns a free add-on into
 * the thing somebody remembers about the shop.
 */
function OfferCard({
  offer,
  orderId,
}: {
  offer: NonNullable<Route.ComponentProps["loaderData"]["offer"]>;
  orderId: string;
}) {
  const fetcher = useFetcher<{ taken: boolean; error: string | null }>();
  const busy = fetcher.state !== "idle";
  const done = fetcher.data?.taken;
  const gone = fetcher.data && !fetcher.data.taken && !fetcher.data.error;

  if (gone) return null;
  if (done) {
    return (
      <section className="up up--done">
        <p><b>Added to your order.</b> It ships with everything else — nothing more to pay.</p>
      </section>
    );
  }

  return (
    <section className="up">
      <p className="up__kicker">Add to this order before it ships</p>
      <div className="up__row">
        {offer.imageUrl ? (
          <span className="up__pic"><img src={offer.imageUrl} alt="" /></span>
        ) : null}
        <div className="up__body">
          <b className="up__name">{offer.title}</b>
          <span className="up__label">{offer.label}</span>
          <span className="up__price">
            {offer.price} <s>{offer.normal}</s> <em>Save {offer.saving}</em>
          </span>
        </div>
      </div>
      {fetcher.data?.error ? <p className="up__err">{fetcher.data.error}</p> : null}
      <fetcher.Form method="post" className="up__acts">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="variantId" value={offer.variantId} />
        <button type="submit" className="up__yes" disabled={busy}>
          {busy ? "Adding…" : "Add it — one tap, card already on file"}
        </button>
        <button type="submit" name="intent" value="decline" className="up__no" disabled={busy}>
          No thanks
        </button>
      </fetcher.Form>
    </section>
  );
}

/** Stores whose receipt wears their own checkout skin rather than the default. */
const BRANDED_THANKS = new Set(["garden-buddy", "ceiling-buddy", "reaper"]);
const THANKS_SKIN: Record<string, string> = { reaper: "gb-co-sec--reaper" };

export default function Thanks({ loaderData }: Route.ComponentProps) {
  const { store, order, items, pixel, footerLinks, offer, orderId } = loaderData;
  const paid = order.paymentStatus === "paid";

  /* Garden Buddy: the last page a paying customer sees is the store's own,
     laid out like the checkout they just left — not the other store's. */
  /* Every branded store, not just one.
     The receipt is the highest-trust moment in the whole funnel and the page
     the post-purchase offer lives on — and the Reaper's was wearing the
     Garden Kneeler's serif type and olive palette, which reads as "did that
     go through, or did I just get had". The checkout already knows how to
     wear each store's skin; this page now does it the same way. */
  if (BRANDED_THANKS.has(store.slug)) {
    const home = `/?store=${store.slug}`;
    const skin = THANKS_SKIN[store.slug] ?? "";
    return (
      <>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800&family=Inter:wght@400;500;600;700&display=swap"
        />
        <link rel="stylesheet" href={buddyHref} precedence="high" />
        {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
        <div className={`gb-co-sec${skin ? ` ${skin}` : ""}`}>
          <div className="gb-co__pane">
            <div className="gb-co__pane-in">
              <CheckoutHeader store={store} home={home} />
              <section className="gb-co__sec">
                <h1 className="gb-co__h2" style={{ fontSize: 24 }}>
                  {paid ? "Thank you — your order is in." : "We have your order."}
                </h1>
                <p style={{ fontSize: 16, margin: "0 0 14px" }}>
                  Order <strong>#{order.number}</strong>
                  {paid ? (
                    <> — a receipt is on its way to {order.email}.</>
                  ) : (
                    <> — the payment is still being confirmed. You will get an email once it clears.</>
                  )}
                </p>
                {order.address ? (
                  <p className="gb-co__note" style={{ margin: "0 0 18px" }}>
                    Shipping to: <strong style={{ color: "var(--ink)" }}>{order.address}</strong>
                    {store.contactEmail ? ` — wrong? Email ${store.contactEmail} right away and quote #${order.number}.` : ""}
                  </p>
                ) : null}
                <ul className="gb-co__lines">
                  {items.map((item) => (
                    <li className="gb-co__line" key={item.id}>
                      <span className="gb-co__line-body">
                        <strong className="gb-co__line-name">{item.label}</strong>
                        <span className="gb-co__line-sub">× {item.quantity}</span>
                      </span>
                      <span className="gb-co__line-total">{item.lineTotal}</span>
                    </li>
                  ))}
                </ul>
                <div className="gb-co__grand">
                  <span>Total</span>
                  <b>{order.total}</b>
                </div>
                {paid && offer ? <OfferCard offer={offer} orderId={orderId} /> : null}
                {store.contactEmail ? (
                  <p className="gb-co__note">
                    Any questions, reply to your receipt or write to {store.contactEmail} and quote #{order.number}.
                  </p>
                ) : null}
                <Link className="gb-co__btn" to={home} style={{ marginTop: 18 }}>
                  Back to the store
                </Link>
              </section>
            </div>
            <CheckoutFooter store={store} links={footerLinks} contactEmail={store.contactEmail} />
          </div>
        </div>
      </>
    );
  }

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
          {paid && offer ? <OfferCard offer={offer} orderId={orderId} /> : null}

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
