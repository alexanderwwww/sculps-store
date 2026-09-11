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
 *
 * The page wears the store's own theme, the same way `pages.$handle.tsx` does
 * it: a store with a theme of its own renders that theme's chrome and loads
 * that theme's stylesheet, and everything else falls back to the shared one.
 * It used to import the garden kneeler stylesheet unconditionally, so every
 * store's checkout came out brown.
 */
import { Form, Link, useFetcher, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/checkout";
import { resolveStore, storeNav } from "~/lib/store.server";
import type { NavLink } from "~/lib/store.server";
import { liveTheme } from "~/lib/admin.server";
import { readCartToken, priceCart, markCartConverted, setCartDiscount, newCartToken, cartCookie } from "~/lib/cart.server";
import { checkDiscount, findDiscount, normaliseCode } from "~/lib/discounts.server";
import { providerForStore, PaymentsNotConfigured } from "~/lib/payments.server";
import { placeOrder } from "~/lib/admin.server";
import { deviceFromRequest, geoFromRequest, readVisitorSession, shouldTrack, track } from "~/lib/visitor.server";
import { metaConfig, pages as pagesTable, sections as sectionsTable, blocks as blocksTable } from "~/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { pixelScript, readMetaCookies, trackFunnelEvent } from "~/lib/meta.server";
import { formatMoney } from "~/lib/money";
import { CheckoutHeader, CheckoutFooter, TrustRow } from "~/storefronts/garden-buddy/checkout-chrome";
import kneelerHref from "~/storefronts/garden-kneeler/theme.css?url";
import buddyHref from "~/storefronts/garden-buddy/theme.css?url";

const GARDEN_BUDDY = "garden-buddy";

export function links() {
  return [
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap",
    },
    { rel: "stylesheet", href: kneelerHref },
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

/**
 * The one photo of this product we hold: the buy box's first gallery image,
 * the same picture the cart drawer puts beside each line. There is no
 * per-variant image in the database, so the lines share it — and where a store
 * has no image at all, the theme's own placeholder renders instead of a gap.
 */
async function productPhoto(db: Route.LoaderArgs["context"]["db"], storeId: string) {
  const theme = await liveTheme(db, storeId);
  if (!theme) return null;
  const [page] = await db
    .select({ id: pagesTable.id })
    .from(pagesTable)
    .where(and(eq(pagesTable.themeId, theme.id), eq(pagesTable.kind, "product")))
    .limit(1);
  if (!page) return null;
  const buyBox = await db
    .select({ id: sectionsTable.id })
    .from(sectionsTable)
    .where(and(eq(sectionsTable.pageId, page.id), eq(sectionsTable.type, "buy_box")))
    .limit(1);
  if (!buyBox.length) return null;
  const rows = await db
    .select({ values: blocksTable.values })
    .from(blocksTable)
    .where(inArray(blocksTable.sectionId, buyBox.map((s) => s.id)))
    .orderBy(asc(blocksTable.position));
  for (const row of rows) {
    const values = (row.values ?? {}) as Record<string, string>;
    const src = (values.image ?? "").trim();
    if (src) return { src, alt: (values.alt ?? "").trim() };
  }
  return null;
}

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

  // Reaching checkout is itself the event, the way Shopify counts it: the
  // customer got here with a cart, whether or not they go on to pay. Live View
  // counts distinct sessions, so the submit below cannot double count this.
  const checkoutSession = readVisitorSession(request);
  if (checkoutSession && cart.lines.length && shouldTrack(request, url)) {
    track(context.db, context.cloudflare.ctx, {
      storeId: store.id,
      sessionId: checkoutSession,
      type: "checkout",
      path: "/checkout",
      geo: geoFromRequest(request),
      device: deviceFromRequest(request),
      amountCents: cart.totalCents,
    });
  }

  // InitiateCheckout: reaching this page with something in the cart. Both
  // halves, one shared id, the whole cart as contents.
  const [meta] = await context.db
    .select({ pixelId: metaConfig.pixelId })
    .from(metaConfig)
    .where(eq(metaConfig.storeId, store.id))
    .limit(1);

  let pixel = meta?.pixelId ? pixelScript(meta.pixelId) : null;
  if (pixel && cart.lines.length) {
    const initiate = await trackFunnelEvent(context.db, context.cloudflare.env, context.cloudflare.ctx, {
      storeId: store.id,
      pixelId: meta?.pixelId ?? null,
      request,
      url,
      name: "InitiateCheckout",
      valueCents: cart.totalCents,
      currency: cart.currency,
      contents: cart.lines.map((line) => ({
        id: line.variantId,
        quantity: line.quantity,
        itemPrice: line.unitPriceCents,
      })),
    });
    if (initiate) pixel = `${pixel}\n${initiate}`;
  }

  // The chrome needs what the chrome needs: the logo, the policy links and the
  // product shot. Nothing here changes what is tracked or what is charged.
  const [nav, photo] = await Promise.all([
    storeNav(context.db, store.id),
    productPhoto(context.db, store.id),
  ]);

  return {
    pixel,
    store: {
      name: store.name,
      slug: store.slug,
      currency: store.currency,
      logoUrl: store.logoUrl,
      faviconUrl: store.faviconUrl,
      contactEmail: store.contactEmail,
      phoneMode: store.checkoutPhoneMode,
      companyMode: store.checkoutCompanyMode,
      nameMode: store.checkoutNameMode,
      consent: store.checkoutConsent,
      shipEstimate: store.shipEstimate,
    },
    footerLinks: nav.footer,
    photo,
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
  const form = await request.formData();
  // Priced with the destination state, so a manual state rate applies.
  const cart = await priceCart(context.db, store, token, String(form.get("region") || "").trim() || null);

  // Applying or removing a code. It never starts a payment — it only changes
  // what is stored on the cart, and the page re-reads the server's prices.
  const formIntent = String(form.get("intent") || "");
  if (formIntent === "discount" || formIntent === "discount-remove") {
    let cartToken = token;
    let setCookie: string | null = null;
    if (!cartToken) {
      cartToken = newCartToken();
      setCookie = cartCookie(cartToken, url);
    }
    const headers = setCookie ? { "Set-Cookie": setCookie } : undefined;

    if (formIntent === "discount-remove") {
      await setCartDiscount(context.db, store.id, cartToken, null);
      return Response.json({ discountError: null }, headers ? { headers } : undefined);
    }

    const code = normaliseCode(String(form.get("code") || ""));
    if (!code) {
      return Response.json({ discountError: "Please type a discount code." }, headers ? { headers } : undefined);
    }
    const found = await findDiscount(context.db, store.id, code);
    const check = checkDiscount(found, {
      subtotalCents: cart.subtotalCents,
      email: String(form.get("email") || "").trim().toLowerCase() || null,
      currency: store.currency,
    });
    if (!check.ok) {
      return Response.json({ discountError: check.reason }, headers ? { headers } : undefined);
    }
    await setCartDiscount(context.db, store.id, cartToken, check.discount.code);
    return Response.json({ discountError: null }, headers ? { headers } : undefined);
  }

  if (cart.lines.length === 0) {
    return { error: "Your cart is empty." };
  }
  const email = String(form.get("email") || "").trim().toLowerCase();
  const name = String(form.get("name") || "").trim();

  if (!name) return { error: "Please put your name in." };
  if (store.checkoutNameMode === "full" && !/\S+\s+\S+/.test(name)) {
    return { error: "Please put your first and last name in." };
  }
  if (store.checkoutCompanyMode === "required" && !String(form.get("company") || "").trim()) {
    return { error: "Please add the company name." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That email address does not look right — we send your receipt there." };
  }
  // An order with no shipping address cannot be fulfilled, so it is not taken.
  const required: Record<string, string> = { address1: "street address", city: "city", region: "state", postalCode: "ZIP code" };
  if (store.checkoutPhoneMode === "required") required.phone = "phone number";
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
    address2: [String(form.get("company") || "").trim(), String(form.get("address2") || "").trim()].filter(Boolean).join(" · ") || null,
    marketingConsent: form.get("consent") === "on",
    city: String(form.get("city") || "").trim() || null,
    region: String(form.get("region") || "").trim() || null,
    postalCode: String(form.get("postalCode") || "").trim() || null,
    country: COUNTRIES.some(([code]) => code === form.get("country")) ? String(form.get("country")) : "US",
    subtotalCents: cart.subtotalCents,
    taxCents: cart.taxCents,
    shippingCents: cart.shippingCents,
    totalCents: cart.totalCents,
    currency: cart.currency,
    // Both worked out by priceCart, on the server, from the code on the cart row.
    discountCode: cart.discount?.code ?? null,
    discountCents: cart.discount?.amountCents ?? 0,
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
    device: deviceFromRequest(request),
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

/* ------------------------------------------------------------ validation */

type LoadedStore = Awaited<ReturnType<typeof loader>>["store"];
type Errors = Partial<Record<string, string>>;

/**
 * The same rules the action enforces, checked in the browser so a person is
 * told which box is wrong before a round trip — never instead of the server,
 * which still refuses anything that gets past this.
 */
function validate(values: Record<string, string>, store: LoadedStore): Errors {
  const errors: Errors = {};
  const at = (k: string) => (values[k] ?? "").trim();

  if (!at("name")) errors.name = "Please put your name in.";
  else if (store.nameMode === "full" && !/\S+\s+\S+/.test(at("name"))) {
    errors.name = "Please put your first and last name in.";
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(at("email"))) {
    errors.email = "That email address does not look right — we send your receipt there.";
  }
  if (store.companyMode === "required" && !at("company")) errors.company = "Please add the company name.";
  if (store.phoneMode === "required" && !at("phone")) errors.phone = "Please add your phone number so we can ship it.";
  if (!at("address1")) errors.address1 = "Please add your street address so we can ship it.";
  if (!at("city")) errors.city = "Please add your city so we can ship it.";
  if (!at("region")) errors.region = "Please add your state so we can ship it.";
  if (!at("postalCode")) errors.postalCode = "Please add your ZIP code so we can ship it.";
  return errors;
}

/**
 * Which box a server message belongs under. The action answers with one
 * sentence; these are its exact sentences, so the message lands next to the
 * field it is about instead of in a banner nobody reads.
 */
function fieldForMessage(message: string): string | null {
  if (/your name|first and last name/i.test(message)) return "name";
  if (/email address/i.test(message)) return "email";
  if (/company name/i.test(message)) return "company";
  if (/phone number/i.test(message)) return "phone";
  if (/street address/i.test(message)) return "address1";
  if (/your city/i.test(message)) return "city";
  if (/your state/i.test(message)) return "region";
  if (/ZIP code/i.test(message)) return "postalCode";
  return null;
}

/* --------------------------------------------------------------- the page */

export default function Checkout({ loaderData, actionData }: Route.ComponentProps) {
  const { store, cart, paymentsReady, paymentsMessage, publishableKey, pixel, footerLinks, photo } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const storeParam = `?store=${store.slug}`;
  const buddy = store.slug === GARDEN_BUDDY;
  const home = `/${storeParam}`;
  const href = (path: string) => `${path}${storeParam}`;

  const [touched, setTouched] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const clientErrors = validate(values, store);
  const serverMessage = actionData && "error" in actionData ? actionData.error : null;
  const serverField = serverMessage ? fieldForMessage(serverMessage) : null;
  const errors: Errors = { ...clientErrors };
  if (serverField && serverMessage) errors[serverField] = serverMessage;

  const shownError = (field: string) =>
    (submitted || touched[field] ? clientErrors[field] : undefined) ??
    (serverField === field ? serverMessage ?? undefined : undefined);

  const onField = (field: string, value: string) => setValues((prev) => ({ ...prev, [field]: value }));
  const onBlur = (field: string) => setTouched((prev) => ({ ...prev, [field]: "1" }));

  const paying = Boolean(actionData && "clientSecret" in actionData && actionData.clientSecret);
  const money = (cents: number) => formatMoney(cents, cart.currency);

  /* The cart emptied under them, and there is no payment in flight. */
  if (cart.lines.length === 0 && !paying) {
    if (buddy) {
      return (
        <>
          <BuddyFonts />
          {store.faviconUrl ? <link rel="icon" href={store.faviconUrl} /> : null}
          {store.faviconUrl ? <link rel="icon" href={store.faviconUrl} /> : null}
        <link rel="stylesheet" href={buddyHref} />
          <div className="gb gb-co-sec">
            <CheckoutHeader store={store} home={home} />
            <div className="gb-co">
              <div className="gb-co__panel gb-co__empty">
                <p>Your cart is empty.</p>
                <Link className="gb-co__btn" to={home} style={{ textDecoration: "none", maxWidth: 320, margin: "0 auto" }}>
                  Back to the product
                </Link>
              </div>
            </div>
            <CheckoutFooter store={store} links={footerLinks.map(withParam(storeParam))} contactEmail={store.contactEmail} />
          </div>
        </>
      );
    }
    return (
      <div className="gk">
        <header className="gk-header">
          <Link className="gk-logo" to={home} style={{ textDecoration: "none" }}>
            {store.name}
          </Link>
        </header>
        <div className="gk-shell">
          <div className="gk-panel" style={{ textAlign: "center" }}>
            <p style={{ fontSize: 20, marginTop: 0 }}>Your cart is empty.</p>
            <Link className="gk-cta" to={home} style={{ display: "inline-block", textDecoration: "none" }}>
              Back to the product
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const summary = (
    <Summary
      cart={cart}
      photo={photo}
      shipEstimate={store.shipEstimate}
      cn={buddy ? BUDDY : KNEELER}
      money={money}
      locked={paying}
    />
  );

  const stepper = <Steps step={paying ? 2 : 1} cn={buddy ? BUDDY : KNEELER} />;

  const left = paying && publishableKey && actionData && "clientSecret" in actionData ? (
    <StripePayment
      publishableKey={publishableKey}
      clientSecret={actionData.clientSecret!}
      returnTo={actionData.returnTo!}
      total={money(cart.totalCents)}
      cn={buddy ? BUDDY : KNEELER}
      appearance={buddy ? BUDDY_APPEARANCE : KNEELER_APPEARANCE}
      trust={buddy ? <TrustRow /> : null}
    />
  ) : (
    <Form
      method="post"
      noValidate
      onSubmit={(event) => {
        setSubmitted(true);
        if (Object.keys(clientErrors).length > 0) event.preventDefault();
      }}
    >
      <h2 className={buddy ? BUDDY.h2 : KNEELER.h2} style={buddy ? undefined : { marginTop: 0 }}>
        Where it goes
      </h2>

      {!paymentsReady ? (
        <div className={buddy ? BUDDY.alert : KNEELER.alert}>
          {paymentsMessage} Nothing can be charged until that is set up, so please do not enter
          card details yet.
        </div>
      ) : null}

      {serverMessage && !serverField ? (
        <div className={buddy ? BUDDY.alert : KNEELER.alert}>{serverMessage}</div>
      ) : null}

      <Fields
        cn={buddy ? BUDDY : KNEELER}
        store={store}
        shownError={shownError}
        onField={onField}
        onBlur={onBlur}
      />

      {store.consent ? (
        <label className={buddy ? BUDDY.check : KNEELER.check} style={buddy ? undefined : { display: "flex", gap: 10, alignItems: "center", fontSize: 17, marginBottom: 14 }}>
          <input type="checkbox" name="consent" style={buddy ? undefined : { width: 22, height: 22 }} />
          Email me about new offers
        </label>
      ) : null}

      <button
        className={buddy ? BUDDY.btn : KNEELER.btn}
        type="submit"
        disabled={busy || !paymentsReady}
        style={buddy ? undefined : { width: "100%", marginTop: 10, opacity: paymentsReady ? 1 : 0.5 }}
      >
        {busy ? "One moment…" : "Continue to payment"}
      </button>

      {buddy ? <TrustRow /> : null}
    </Form>
  );

  if (buddy) {
    return (
      <>
        <BuddyFonts />
        {store.faviconUrl ? <link rel="icon" href={store.faviconUrl} /> : null}
        <link rel="stylesheet" href={buddyHref} />
        {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
        <div className="gb gb-co-sec">
          <CheckoutHeader store={store} home={home} />
          <main className="gb-co">
            <details className="gb-co__msum">
              <summary>
                <svg className="gb-co__msum-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9.5l6 6 6-6" /></svg>
                Order summary
                <span className="gb-co__msum-total">{money(cart.totalCents)}</span>
              </summary>
              <div className="gb-co__msum-body">{summary}</div>
            </details>

            {stepper}

            <div className="gb-co__grid">
              <section className="gb-co__panel">{left}</section>
              <aside className="gb-co__aside">
                <div className="gb-co__panel">
                  <h2 className="gb-co__h3">Order summary</h2>
                  {summary}
                </div>
              </aside>
            </div>
          </main>
          <CheckoutFooter store={store} links={footerLinks.map(withParam(storeParam))} contactEmail={store.contactEmail} />
        </div>
      </>
    );
  }

  /* No theme of its own yet. The shared one, laid out the same way: the form
     beside a summary that stays put, and a header that is the logo only. */
  return (
    <div className="gk">
      {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
      <header className="gk-header">
        <Link className="gk-logo" to={home} style={{ textDecoration: "none" }}>
          {store.name}
        </Link>
      </header>

      <div className="gk-shell">
        {stepper}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 22,
            alignItems: "start",
          }}
        >
          <div className="gk-panel">{left}</div>
          <div className="gk-panel" style={{ position: "sticky", top: 24 }}>
            <h2 style={{ marginTop: 0 }}>Your order</h2>
            {summary}
          </div>
        </div>
      </div>

      <footer style={{ padding: "28px 0", textAlign: "center" }}>
        {footerLinks.map((link) => (
          <Link key={link.href + link.label} className="gk-quiet" to={href(link.href)} style={{ margin: "0 10px" }}>
            {link.label}
          </Link>
        ))}
      </footer>
    </div>
  );
}

/** Carries `?store=` through the chrome's plain anchors. */
const withParam = (storeParam: string) => (link: NavLink) => ({ ...link, href: `${link.href}${storeParam}` });

function BuddyFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Caveat:wght@600;700&display=swap"
      />
    </>
  );
}

/* ------------------------------------------------------------ class sets */
/* One checkout, two skins. Every class here already exists in the theme it
   belongs to; nothing is invented per store in this file. */

interface CN {
  h2: string;
  h3: string;
  field: string;
  label: string;
  input: string;
  err: string;
  errStyle?: React.CSSProperties;
  row: string;
  rowStyle?: React.CSSProperties;
  check: string;
  btn: string;
  alert: string;
  note: string;
  steps: string;
  stepsStyle?: React.CSSProperties;
  lines: string;
  linesStyle?: React.CSSProperties;
  line: string;
  tot: string;
  grand: string;
  grandStyle?: React.CSSProperties;
}

const BUDDY: CN = {
  h2: "gb-co__h2",
  h3: "gb-co__h3",
  field: "gb-co__field",
  label: "gb-co__label",
  input: "gb-co__input",
  err: "gb-co__err",
  row: "gb-co__row",
  check: "gb-co__check",
  btn: "gb-co__btn",
  alert: "gb-co__alert",
  note: "gb-co__note",
  steps: "gb-co__steps",
  lines: "gb-co__lines",
  line: "gb-co__line",
  tot: "gb-co__tot",
  grand: "gb-co__grand",
};

const KNEELER: CN = {
  h2: "",
  h3: "",
  field: "gk-field",
  label: "",
  input: "gk-input",
  err: "",
  errStyle: { display: "block", marginTop: 6, color: "#b23a2c", fontSize: 15, fontWeight: 600 },
  row: "gk-row",
  check: "",
  btn: "gk-cta",
  alert: "gk-alert",
  note: "gk-quiet",
  steps: "",
  stepsStyle: { display: "flex", gap: 12, listStyle: "none", padding: 0, margin: "0 0 18px", alignItems: "center" },
  lines: "",
  linesStyle: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14 },
  line: "gk-line",
  tot: "gk-totals",
  grand: "gk-totals",
  grandStyle: { borderTop: "1px solid var(--gk-line)", marginTop: 8, paddingTop: 14, fontWeight: 700 },
};

const BUDDY_APPEARANCE = {
  theme: "flat",
  variables: {
    colorPrimary: "#A8F32A",
    colorText: "#1C2318",
    colorBackground: "#FFFFFF",
    fontSizeBase: "17px",
    borderRadius: "12px",
  },
};

const KNEELER_APPEARANCE = { theme: "night", variables: { colorPrimary: "#b6f03c", fontSizeBase: "17px" } };

/* ----------------------------------------------------------------- pieces */

function Steps({ step, cn }: { step: 1 | 2; cn: CN }) {
  const items = ["Where it goes", "Payment"];
  return (
    <ol className={cn.steps} style={cn.stepsStyle}>
      {items.map((label, index) => {
        const n = index + 1;
        const state = n < step ? "is-done" : n === step ? "is-now" : "";
        return (
          <li key={label} className={state} aria-current={n === step ? "step" : undefined}
              style={cn.stepsStyle ? { display: "flex", alignItems: "center", gap: 8, opacity: n === step ? 1 : 0.55 } : undefined}>
            <span className={cn.steps ? "gb-co__dot" : undefined}>{n < step ? "✓" : n}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  cn,
  name,
  label,
  error,
  onValue,
  onTouch,
  children,
  ...input
}: {
  cn: CN;
  name: string;
  label: string;
  error?: string;
  onValue: (field: string, value: string) => void;
  onTouch: (field: string) => void;
  children?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "onBlur" | "name">) {
  const describedBy = error ? `${name}-error` : undefined;
  return (
    <label className={cn.field}>
      <span className={cn.label}>{label}</span>
      <input
        {...input}
        className={cn.input}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onValue(name, event.currentTarget.value)}
        onBlur={() => onTouch(name)}
      />
      {error ? (
        <span className={cn.err} style={cn.errStyle} id={describedBy} role="alert">
          {error}
        </span>
      ) : null}
      {children}
    </label>
  );
}

function Fields({
  cn,
  store,
  shownError,
  onField,
  onBlur,
}: {
  cn: CN;
  store: LoadedStore;
  shownError: (field: string) => string | undefined;
  onField: (field: string, value: string) => void;
  onBlur: (field: string) => void;
}) {
  const common = { cn, onValue: onField, onTouch: onBlur };
  return (
    <>
      <Field
        {...common}
        name="name"
        label={store.nameMode === "full" ? "Full name" : "Name"}
        autoComplete="given-name"
        autoCapitalize="words"
        error={shownError("name")}
      />
      <Field
        {...common}
        name="email"
        label="Email — your receipt goes here"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        spellCheck={false}
        error={shownError("email")}
      />
      {store.phoneMode !== "hidden" ? (
        <Field
          {...common}
          name="phone"
          label={store.phoneMode === "required" ? "Phone" : "Phone (optional)"}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          error={shownError("phone")}
        />
      ) : null}
      {store.companyMode !== "hidden" ? (
        <Field
          {...common}
          name="company"
          label={store.companyMode === "required" ? "Company" : "Company (optional)"}
          autoComplete="organization"
          error={shownError("company")}
        />
      ) : null}
      <Field
        {...common}
        name="address1"
        label="Address"
        autoComplete="address-line1"
        error={shownError("address1")}
      />
      <Field
        {...common}
        name="address2"
        label="Apartment, suite (optional)"
        autoComplete="address-line2"
      />
      <div className={cn.row} style={cn.rowStyle}>
        <Field {...common} name="city" label="City" autoComplete="address-level2" error={shownError("city")} />
        <Field {...common} name="region" label="State" autoComplete="address-level1" error={shownError("region")} />
      </div>
      <div className={cn.row} style={cn.rowStyle}>
        <Field
          {...common}
          name="postalCode"
          label="ZIP code"
          inputMode="numeric"
          autoComplete="postal-code"
          error={shownError("postalCode")}
        />
        <label className={cn.field}>
          <span className={cn.label}>Country</span>
          <select className={cn.input} name="country" defaultValue="US" autoComplete="country">
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

function Summary({
  cart,
  photo,
  shipEstimate,
  cn,
  money,
  locked,
}: {
  cart: Awaited<ReturnType<typeof loader>>["cart"];
  photo: { src: string; alt: string } | null;
  shipEstimate: string | null;
  cn: CN;
  money: (cents: number) => string;
  /** the payment is already started for this exact amount, so the code is fixed */
  locked: boolean;
}) {
  const buddy = cn === BUDDY;
  return (
    <>
      <ul className={cn.lines} style={cn.linesStyle}>
        {cart.lines.map((line) => (
          <li className={cn.line} key={line.variantId}>
            {buddy ? (
              <span className="gb-co__shot">
                {photo ? (
                  <img src={photo.src} alt={photo.alt || line.productTitle} loading="lazy" />
                ) : (
                  <span className="gb-ph">No photo</span>
                )}
                <span className="gb-co__qty" aria-hidden="true">
                  {line.quantity}
                </span>
              </span>
            ) : null}
            <span className={buddy ? "gb-co__line-body" : undefined} style={buddy ? undefined : { flex: 1 }}>
              <strong className={buddy ? "gb-co__line-name" : undefined} style={buddy ? undefined : { display: "block" }}>
                {line.label}
              </strong>
              <span className={buddy ? "gb-co__line-sub" : "gk-quiet"}>
                {line.sublabel ? `${line.sublabel} · ` : ""}
                {line.quantity} × {money(line.unitPriceCents)}
              </span>
            </span>
            <span className={buddy ? "gb-co__line-total" : undefined} style={buddy ? undefined : { fontWeight: 700 }}>
              {money(line.lineTotalCents)}
            </span>
          </li>
        ))}
      </ul>

      <div className={buddy ? "gb-co__totals" : undefined} style={buddy ? undefined : { marginTop: 12 }}>
        <div className={cn.tot}>
          <span>Subtotal</span>
          <b>{money(cart.subtotalCents)}</b>
        </div>

        <div className={`${cn.tot}${buddy && cart.shippingCents === 0 ? " gb-co__tot--free" : ""}`}>
          <span>
            Shipping
            {shipEstimate ? <span className={buddy ? "gb-co__line-sub" : "gk-quiet"}> · {shipEstimate}</span> : null}
          </span>
          <b>{cart.shippingCents > 0 ? money(cart.shippingCents) : "Free"}</b>
        </div>

        {cart.discount ? (
          <div className={cn.tot}>
            <span>
              {cart.discount.code} · {cart.discount.label}
            </span>
            <b>−{money(cart.discount.amountCents)}</b>
          </div>
        ) : null}

        {cart.taxCents > 0 ? (
          <div className={cn.tot}>
            <span>Tax</span>
            <b>{money(cart.taxCents)}</b>
          </div>
        ) : null}

        <div className={cn.grand} style={cn.grandStyle}>
          <span>Total</span>
          <b>{money(cart.totalCents)}</b>
        </div>
      </div>

      <DiscountBox cn={cn} applied={cart.discount} reason={cart.discountReason} locked={locked} />
    </>
  );
}

/**
 * The discount code box on the checkout summary.
 *
 * It posts to this route's own action, which stores nothing but the text; the
 * amount is recomputed by priceCart when the page reloads. Once a payment has
 * been started the intent is fixed to an amount, so the box is not offered —
 * a control that could not change the charge is not drawn as if it could.
 */
function DiscountBox({
  cn,
  applied,
  reason,
  locked,
}: {
  cn: CN;
  applied: { code: string; label: string; amountCents: number } | null;
  reason: string | null;
  locked: boolean;
}) {
  const fetcher = useFetcher<{ discountError?: string | null }>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data?.discountError ?? reason;

  if (locked) {
    return applied ? (
      <p className={cn.note} style={{ marginTop: 12 }}>
        {applied.code} is applied to this payment.
      </p>
    ) : null;
  }

  if (applied) {
    return (
      <fetcher.Form method="post" style={{ marginTop: 12 }}>
        <input type="hidden" name="intent" value="discount-remove" />
        <p className={cn.note} style={{ margin: 0 }}>
          {applied.code} applied.{" "}
          <button
            type="submit"
            disabled={busy}
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", color: "inherit", textDecoration: "underline" }}
          >
            Remove
          </button>
        </p>
      </fetcher.Form>
    );
  }

  return (
    <fetcher.Form method="post" style={{ marginTop: 12 }}>
      <input type="hidden" name="intent" value="discount" />
      <label className={cn.field}>
        <span className={cn.label}>Discount code</span>
        <span style={{ display: "flex", gap: 8 }}>
          <input
            className={cn.input}
            type="text"
            name="code"
            aria-invalid={error ? "true" : undefined}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className={cn.btn}
            disabled={busy}
            style={{ width: "auto", marginTop: 0, minHeight: 56, padding: "0 22px" }}
          >
            Apply
          </button>
        </span>
        {error ? (
          <span className={cn.err} style={cn.errStyle} role="alert">
            {error}
          </span>
        ) : null}
      </label>
    </fetcher.Form>
  );
}

/**
 * Stripe's payment element.
 *
 * Card details are entered inside Stripe's own iframe and never touch this
 * Worker, which is what keeps the PCI burden off this codebase entirely.
 *
 * Above it, the Express Checkout Element. It is mounted on the same
 * PaymentIntent, so a wallet payment is the same charge against the same
 * pending order — no second code path. It is only ever *shown* when Stripe's
 * `ready` event reports that this browser actually has a wallet to offer, so
 * there is never a button here that does nothing. If Apple Pay is not enabled
 * on the account, or the domain is not registered with Stripe, the slot stays
 * empty and the page reads as if it were never there.
 */
function StripePayment({
  publishableKey,
  clientSecret,
  returnTo,
  total,
  cn,
  appearance,
  trust,
}: {
  publishableKey: string;
  clientSecret: string;
  returnTo: string;
  total: string;
  cn: CN;
  appearance: unknown;
  trust: React.ReactNode;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [wallets, setWallets] = useState(false);
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
      const elements = stripe.elements({ clientSecret, appearance });

      // Wallets first, because a person who has one is done in two taps.
      const express = elements.create("expressCheckout", {
        buttonHeight: 56,
        // The address is already on the order; the wallet only supplies the
        // payment method and the billing details Stripe needs for the charge.
        emailRequired: false,
        phoneNumberRequired: false,
      });
      express.on("ready", (event: any) => {
        const available = event?.availablePaymentMethods;
        const any = available && Object.values(available).some(Boolean);
        if (!cancelled) setWallets(Boolean(any));
      });
      express.on("confirm", async () => {
        setError(null);
        setSubmitting(true);
        const result = await stripe.confirmPayment({
          elements,
          clientSecret,
          confirmParams: { return_url: returnTo },
        });
        if (result?.error) {
          setError(result.error.message ?? "The payment did not go through.");
          setSubmitting(false);
        }
      });
      if (walletRef.current) express.mount(walletRef.current);

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
  }, [publishableKey, clientSecret, returnTo, appearance]);

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

  const buddy = cn === BUDDY;

  return (
    <div>
      <h2 className={cn.h2} style={buddy ? undefined : { marginTop: 0 }}>
        Payment
      </h2>
      {error ? <div className={cn.alert}>{error}</div> : null}

      {/* Mounted always so Stripe can answer; shown only once it says yes. */}
      <div className={buddy ? "gb-co__wallet" : undefined} style={wallets ? undefined : { display: "none" }}>
        <div ref={walletRef} />
        {buddy ? <div className="gb-co__or">or pay by card</div> : null}
      </div>

      <div ref={mountRef} style={{ minHeight: 200 }} />
      <button
        className={cn.btn}
        type="button"
        onClick={pay}
        disabled={!ready || submitting}
        style={buddy ? undefined : { width: "100%", marginTop: 18, opacity: ready && !submitting ? 1 : 0.6 }}
      >
        {submitting ? "Paying…" : `Pay ${total}`}
      </button>
      <p className={cn.note}>Card details go straight to Stripe. They never touch this store.</p>
      {trust}
    </div>
  );
}
