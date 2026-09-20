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
import mapCssHref from "maplibre-gl/dist/maplibre-gl.css?url";
import { useEffect, useRef, useState } from "react";
import { geocodeAddress, addressLine } from "~/lib/geocode.server";

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

  /*
   * The pin. The delivery app's receipt shows the house on a map, and that
   * is the moment the customer stops wondering whether the address went
   * through. Looked up on the server so nothing about the order leaves the
   * browser; cached at the edge; and a lookup that fails just means no map.
   */
  const pin =
    paymentStatus === "paid" && loaded.order.address1
      ? await geocodeAddress(addressLine(loaded.order)).catch(() => null)
      : null;

  return data({
    pin,
    shipEstimate: store.shipEstimate ?? null,
    /** the offer is good for twenty minutes from now; the clock runs in the browser */
    offerUntil: Date.now() + 20 * 60 * 1000,
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
/* -------------------------------------------------------------- arrival */

/**
 * The two seconds after paying, and then the status.
 *
 * Copied from the best delivery apps because they have measured it: a full
 * screen "Sending order…" that resolves to a tick, then a ring with the
 * window inside it, then the house on a map. The order was already safe
 * before this page loaded; the theatre is for the customer, who has just
 * handed over money and is looking for the moment it lands.
 */
function ArrivalCard({
  paid,
  number,
  shipEstimate,
  pin,
  address,
}: {
  paid: boolean;
  number: number;
  shipEstimate: string | null;
  pin: { lat: number; lon: number; label: string } | null;
  address: string;
}) {
  const [stage, setStage] = useState<"sending" | "sent" | "done">(paid ? "sending" : "done");
  const mapBox = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (!paid) return;
    // Once per order: a refresh should not replay the moment.
    let seen = false;
    try { seen = window.sessionStorage.getItem(`sent-${number}`) === "1"; } catch { /* fine */ }
    if (seen) { setStage("done"); return; }
    const a = window.setTimeout(() => setStage("sent"), 1400);
    const b = window.setTimeout(() => {
      setStage("done");
      try { window.sessionStorage.setItem(`sent-${number}`, "1"); } catch { /* fine */ }
    }, 2600);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [paid, number]);

  useEffect(() => {
    if (stage !== "done" || !pin || !mapBox.current || mapRef.current) return;
    let alive = true;
    (async () => {
      const { mountPinMap } = await import("~/lib/map.client");
      if (!alive || !mapBox.current) return;
      mapRef.current = await mountPinMap(mapBox.current, pin.lat, pin.lon, { draggable: false, interactive: false, zoom: 15 });
    })();
    return () => { alive = false; };
  }, [stage, pin]);

  if (stage !== "done") {
    return (
      <div className="gb-th__moment" role="status" aria-live="polite">
        {stage === "sending" ? (
          <>
            <span className="gb-th__spin" aria-hidden="true" />
            <p>Sending order…</p>
          </>
        ) : (
          <>
            <span className="gb-th__tick" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            <p>Order sent</p>
          </>
        )}
      </div>
    );
  }

  // The window inside the ring is the store's own shipping estimate, which
  // is the only number this page is allowed to promise.
  const window_ = shipEstimate || "On its way";
  return (
    <div className="gb-th__arrive">
      <div className="gb-th__ring" aria-hidden="true">
        <svg viewBox="0 0 120 120" width="150" height="150">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(20,20,15,.10)" strokeWidth="10" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="#F5821F" strokeWidth="10" strokeLinecap="round"
            strokeDasharray="326.7" strokeDashoffset="240" transform="rotate(-90 60 60)" className="gb-th__arc" />
        </svg>
        <div className="gb-th__ring-in">
          <b>{window_}</b>
          <span>{paid ? "packing now" : "confirming"}</span>
        </div>
      </div>
      <h1 className="gb-th__h">{paid ? "We've got your order." : "We have your order."}</h1>
      <p className="gb-th__sub">
        Order <strong>#{number}</strong>
        {paid ? " — a human is on it. Your receipt is on its way." : " — the payment is still being confirmed. You will get an email once it clears."}
      </p>
      {pin ? (
        <div className="gb-th__map">
          <link rel="stylesheet" href={mapCssHref} precedence="high" />
          <div ref={mapBox} className="gb-th__map-canvas" aria-hidden="true" />
          <div className="gb-th__map-foot">
            <span className="gb-th__map-k">Shipping to</span>
            <span className="gb-th__map-addr">{address}</span>
          </div>
        </div>
      ) : address ? (
        <p className="gb-co__note">Shipping to: <strong style={{ color: "var(--ink)" }}>{address}</strong></p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ add more */

/**
 * "Add more for less." The offer, with a clock on it.
 *
 * The countdown is real: the offer the server made is good for the length of
 * this visit, and the clock says so. It is not a trick -- the same product
 * costs full price tomorrow, which is exactly what the number is for.
 */
function Countdown({ until }: { until: number }) {
  const [left, setLeft] = useState(() => Math.max(0, until - Date.now()));
  useEffect(() => {
    const t = window.setInterval(() => setLeft(Math.max(0, until - Date.now())), 1000);
    return () => window.clearInterval(t);
  }, [until]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return <span className="gb-th__clock">{m}:{String(s).padStart(2, "0")} left</span>;
}

function OfferCard({
  offer,
  orderId,
  until,
}: {
  until?: number;
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
      <p className="up__kicker">
        Add more for less
        {until ? <Countdown until={until} /> : null}
      </p>
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
  const { store, order, items, pixel, footerLinks, offer, orderId, pin, shipEstimate, offerUntil } = loaderData;
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
                <ArrivalCard paid={paid} number={order.number} shipEstimate={shipEstimate} pin={pin} address={order.address} />
                {order.address && store.contactEmail ? (
                  <p className="gb-co__note" style={{ margin: "0 0 18px" }}>
                    Wrong address? Email {store.contactEmail} right away and quote #{order.number}.
                  </p>
                ) : null}
                <p className="gb-th__k">Order details</p>
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
                {paid && offer ? <OfferCard offer={offer} orderId={orderId} until={offerUntil} /> : null}
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
