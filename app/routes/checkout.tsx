/**
 * Checkout, on our own domain.
 *
 * Two steps in one page: the customer's details, then Stripe's payment element
 * mounted with a client secret for an amount computed on the server. The
 * browser never tells us what anything costs.
 *
 * The order row is written before payment is confirmed, with paymentStatus
 * "pending". An order that exists and is unpaid is recoverable; a payment with
 * no order is money taken for something nobody can find.
 */
import { Form, Link, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/checkout";
import { resolveStore } from "~/lib/store.server";
import { readCartToken, priceCart, markCartConverted } from "~/lib/cart.server";
import { providerForStore, PaymentsNotConfigured } from "~/lib/payments.server";
import { placeOrder } from "~/lib/admin.server";
import { geoFromRequest, readVisitorSession, track } from "~/lib/visitor.server";
import { readMetaCookies } from "~/lib/meta.server";
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

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.store ? `Checkout — ${data.store.name}` : "Checkout" }];
}

/** ISO-2 codes, stored as-is. What Meta's match and any tax logic expect. */
const COUNTRIES: [string, string][] = [
  ["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["AU", "Australia"],
  ["NZ", "New Zealand"], ["IE", "Ireland"], ["DE", "Germany"], ["FR", "France"], ["NL", "Netherlands"],
  ["ES", "Spain"], ["IT", "Italy"], ["SE", "Sweden"], ["NO", "Norway"], ["DK", "Denmark"], ["MX", "Mexico"],
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });

  const cart = await priceCart(context.db, store, readCartToken(request));

  let paymentsReady = true;
  let paymentsMessage: string | null = null;
  let publishableKey: string | null = null;
  try {
    const provider = await providerForStore(context.db, context.cloudflare.env, store.id);
    publishableKey = provider.publishableKey;
    if (!publishableKey) {
      paymentsReady = false;
      paymentsMessage = "This store has no Stripe publishable key set in Settings → Payments.";
    }
  } catch (error) {
    paymentsReady = false;
    paymentsMessage =
      error instanceof PaymentsNotConfigured
        ? error.message
        : "Payments are not available right now.";
  }

  return {
    store: { name: store.name, slug: store.slug, currency: store.currency },
    cart,
    paymentsReady,
    paymentsMessage,
    publishableKey,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });

  const token = readCartToken(request);
  const cart = await priceCart(context.db, store, token);
  if (cart.lines.length === 0) {
    return { error: "Your cart is empty." };
  }

  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const name = String(form.get("name") || "").trim();

  if (!name) return { error: "Please put your name in." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That email address does not look right — we send your receipt there." };
  }
  // An order with no shipping address cannot be fulfilled, so it is not taken.
  const required = { address1: "street address", city: "city", region: "state", postalCode: "ZIP code" };
  for (const [field, label] of Object.entries(required)) {
    if (!String(form.get(field) || "").trim()) return { error: `Please add your ${label} so we can ship it.` };
  }

  let provider;
  try {
    provider = await providerForStore(context.db, context.cloudflare.env, store.id);
  } catch (error) {
    return {
      error:
        error instanceof PaymentsNotConfigured
          ? error.message
          : "Payments are not available right now. Nothing has been charged.",
    };
  }

  // One id shared by the browser pixel and the server Conversions API call, so
  // Meta merges the two instead of counting the purchase twice.
  const metaEventId = crypto.randomUUID();

  let intent;
  try {
    intent = await provider.createIntent({
      amountCents: cart.totalCents,
      currency: cart.currency,
      email,
      orderReference: `${store.name} order`,
      metadata: { storeId: store.id, metaEventId },
    });
  } catch (error) {
    return {
      error: `The payment could not be started: ${
        error instanceof Error ? error.message : "unknown error"
      }. Nothing has been charged.`,
    };
  }

  const geo = geoFromRequest(request);
  const metaCookies = readMetaCookies(request);

  const order = await placeOrder(context.db, {
    storeId: store.id,
    customerName: name,
    email,
    phone: String(form.get("phone") || "").trim() || null,
    address1: String(form.get("address1") || "").trim() || null,
    address2: String(form.get("address2") || "").trim() || null,
    city: String(form.get("city") || "").trim() || null,
    region: String(form.get("region") || "").trim() || null,
    postalCode: String(form.get("postalCode") || "").trim() || null,
    country: COUNTRIES.some(([code]) => code === form.get("country")) ? String(form.get("country")) : "US",
    subtotalCents: cart.subtotalCents,
    taxCents: cart.taxCents,
    shippingCents: cart.shippingCents,
    totalCents: cart.totalCents,
    currency: cart.currency,
    paymentProvider: provider.name,
    paymentRef: intent.id,
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

  if (token) await markCartConverted(context.db, store.id, token, order.id);

  track(context.db, context.cloudflare.ctx, {
    storeId: store.id,
    sessionId: readVisitorSession(request) ?? token ?? intent.id,
    type: "checkout",
    path: "/checkout",
    geo,
    amountCents: cart.totalCents,
    orderId: order.id,
  });

  return {
    clientSecret: intent.clientSecret,
    orderId: order.id,
    orderNumber: order.number,
    returnTo: `${url.origin}/thanks?order=${order.id}`,
  };
}

export default function Checkout({ loaderData, actionData }: Route.ComponentProps) {
  const { store, cart, paymentsReady, paymentsMessage, publishableKey } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const storeParam = `?store=${store.slug}`;

  if (cart.lines.length === 0 && !actionData?.clientSecret) {
    return (
      <div className="gk">
        <header className="gk-header">
          <Link className="gk-logo" to={`/${storeParam}`} style={{ textDecoration: "none" }}>
            {store.name}
          </Link>
        </header>
        <div className="gk-shell">
          <div className="gk-panel">
            <p style={{ fontSize: 20, marginTop: 0 }}>Your cart is empty.</p>
            <Link className="gk-cta" to={`/${storeParam}`} style={{ display: "inline-block", textDecoration: "none" }}>
              Back to the product
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gk">
      <header className="gk-header">
        <Link className="gk-logo" to={`/${storeParam}`} style={{ textDecoration: "none" }}>
          {store.name}
        </Link>
      </header>

      <div className="gk-shell">
        <h1 style={{ marginTop: 0 }}>Checkout</h1>

        {!paymentsReady ? (
          <div className="gk-alert">
            {paymentsMessage} Nothing can be charged until that is set up, so please do not enter
            card details yet.
          </div>
        ) : null}

        {actionData?.error ? <div className="gk-alert">{actionData.error}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 22, alignItems: "start" }}>
          <div className="gk-panel">
            {actionData?.clientSecret && publishableKey ? (
              <StripePayment
                publishableKey={publishableKey}
                clientSecret={actionData.clientSecret}
                returnTo={actionData.returnTo}
                total={formatMoney(cart.totalCents, cart.currency)}
              />
            ) : (
              <Form method="post">
                <h2 style={{ marginTop: 0 }}>Where it goes</h2>

                <label className="gk-field">
                  <span>Full name</span>
                  <input className="gk-input" name="name" required autoComplete="name" />
                </label>

                <label className="gk-field">
                  <span>Email — your receipt goes here</span>
                  <input className="gk-input" name="email" type="email" required autoComplete="email" />
                </label>

                <label className="gk-field">
                  <span>Phone (optional)</span>
                  <input className="gk-input" name="phone" autoComplete="tel" />
                </label>

                <label className="gk-field">
                  <span>Address</span>
                  <input className="gk-input" name="address1" required autoComplete="address-line1" />
                </label>

                <label className="gk-field">
                  <span>Apartment, suite (optional)</span>
                  <input className="gk-input" name="address2" autoComplete="address-line2" />
                </label>

                <div className="gk-row">
                  <label className="gk-field">
                    <span>City</span>
                    <input className="gk-input" name="city" required autoComplete="address-level2" />
                  </label>
                  <label className="gk-field">
                    <span>State</span>
                    <input className="gk-input" name="region" required autoComplete="address-level1" />
                  </label>
                </div>

                <div className="gk-row">
                  <label className="gk-field">
                    <span>ZIP code</span>
                    <input className="gk-input" name="postalCode" required autoComplete="postal-code" />
                  </label>
                  <label className="gk-field">
                    <span>Country</span>
                    <select className="gk-input" name="country" defaultValue="US" autoComplete="country">
                      {COUNTRIES.map(([code, name]) => (
                        <option key={code} value={code}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <button
                  className="gk-cta"
                  type="submit"
                  disabled={busy || !paymentsReady}
                  style={{ width: "100%", marginTop: 10, opacity: paymentsReady ? 1 : 0.5 }}
                >
                  {busy ? "One moment…" : "Continue to payment"}
                </button>
              </Form>
            )}
          </div>

          <div className="gk-panel">
            <h2 style={{ marginTop: 0 }}>Your order</h2>
            {cart.lines.map((line) => (
              <div className="gk-line" key={line.variantId}>
                <span style={{ flex: 1 }}>
                  <strong style={{ display: "block" }}>{line.label}</strong>
                  <span className="gk-quiet">× {line.quantity}</span>
                </span>
                <span style={{ fontWeight: 700 }}>{formatMoney(line.lineTotalCents, cart.currency)}</span>
              </div>
            ))}
            <div className="gk-totals" style={{ marginTop: 12 }}>
              <span>Subtotal</span>
              <span>{formatMoney(cart.subtotalCents, cart.currency)}</span>
            </div>
            {cart.taxCents > 0 ? (
              <div className="gk-totals">
                <span>Tax</span>
                <span>{formatMoney(cart.taxCents, cart.currency)}</span>
              </div>
            ) : null}
            <div className="gk-totals">
              <span>Shipping</span>
              <span>Free</span>
            </div>
            <div className="gk-totals" style={{ borderTop: "1px solid var(--gk-line)", marginTop: 8, paddingTop: 14 }}>
              <strong>Total</strong>
              <strong>{formatMoney(cart.totalCents, cart.currency)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Stripe's payment element.
 *
 * Card details are entered inside Stripe's own iframe and never touch this
 * Worker, which is what keeps the PCI burden off this codebase entirely.
 */
function StripePayment({
  publishableKey,
  clientSecret,
  returnTo,
  total,
}: {
  publishableKey: string;
  clientSecret: string;
  returnTo: string;
  total: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (!(window as any).Stripe) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://js.stripe.com/v3/";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Stripe could not be loaded."));
          document.head.appendChild(script);
        });
      }
      if (cancelled) return;

      const stripe = (window as any).Stripe(publishableKey);
      const elements = stripe.elements({
        clientSecret,
        appearance: { theme: "night", variables: { colorPrimary: "#b6f03c", fontSizeBase: "17px" } },
      });
      const payment = elements.create("payment");
      if (mountRef.current) payment.mount(mountRef.current);

      stripeRef.current = stripe;
      elementsRef.current = elements;
      setReady(true);
    };

    boot().catch((bootError) => {
      if (!cancelled) setError(bootError.message);
    });

    return () => {
      cancelled = true;
    };
  }, [publishableKey, clientSecret]);

  const pay = async () => {
    if (!stripeRef.current || !elementsRef.current) return;
    setSubmitting(true);
    setError(null);

    const result = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      confirmParams: { return_url: returnTo },
    });

    if (result.error) {
      setError(result.error.message ?? "The payment did not go through.");
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Payment</h2>
      {error ? <div className="gk-alert">{error}</div> : null}
      <div ref={mountRef} style={{ minHeight: 200 }} />
      <button
        className="gk-cta"
        type="button"
        onClick={pay}
        disabled={!ready || submitting}
        style={{ width: "100%", marginTop: 18, opacity: ready && !submitting ? 1 : 0.6 }}
      >
        {submitting ? "Paying…" : `Pay ${total}`}
      </button>
      <p className="gk-quiet" style={{ marginTop: 12 }}>
        Card details go straight to Stripe. They never touch this store.
      </p>
    </div>
  );
}
