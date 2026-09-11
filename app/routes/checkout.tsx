/**
 * Checkout, on our own domain.
 *
 * One page, the way Shopify's is: the wallets at the top, the contact and
 * shipping fields under them, the card fields under those, and one button that
 * pays. Nothing is behind a "continue" step.
 *
 * That shape needs the PaymentIntent to exist before anyone has typed
 * anything, because a wallet button cannot be drawn without one. So the loader
 * makes it — for an amount computed on the server, from the cart row — and
 * keeps its id on the cart so a reload reuses it instead of littering Stripe
 * with one intent per refresh. When the total moves, that same intent is moved
 * with it. The browser still never tells us what anything costs.
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
import { Link, useFetcher, useSearchParams } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/checkout";
import { resolveStore, storeNav } from "~/lib/store.server";
import type { NavLink } from "~/lib/store.server";
import { liveTheme } from "~/lib/admin.server";
import {
  readCartToken,
  priceCart,
  markCartConverted,
  setCartDiscount,
  newCartToken,
  cartCookie,
  cartPaymentIntentId,
  setCartPaymentIntentId,
} from "~/lib/cart.server";
import { checkDiscount, findDiscount, normaliseCode } from "~/lib/discounts.server";
import { providerForStore, PaymentsNotConfigured, PAYABLE_INTENT_STATUSES } from "~/lib/payments.server";
import { placeOrder, orderByPaymentRef } from "~/lib/admin.server";
import { deviceFromRequest, geoFromContext, readVisitorSession, shouldTrack, track } from "~/lib/visitor.server";
import {
  metaConfig,
  orders as ordersTable,
  orderItems as orderItemsTable,
  pages as pagesTable,
  sections as sectionsTable,
  blocks as blocksTable,
} from "~/db/schema";
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

  const token = readCartToken(request);
  // The destination state, once the page knows it. It picks a manual state tax
  // rate — it never sets a price. The rate itself, like every other number
  // here, is read from the database. Pricing with it is what keeps the amount
  // on screen, the amount on the intent and the amount the action confirms all
  // the same figure.
  const region = (url.searchParams.get("region") || "").trim().toUpperCase().slice(0, 3) || null;
  const cart = await priceCart(context.db, store, token, region);

  let paymentsReady = true;
  let paymentsMessage: string | null = null;
  let publishableKey: string | null = null;
  let clientSecret: string | null = null;

  try {
    const provider = await providerForStore(context.db, context.cloudflare.env, store.id);
    publishableKey = provider.publishableKey;
    if (!publishableKey) {
      paymentsReady = false;
      paymentsMessage = "This store has no Stripe publishable key set in Settings → Payments.";
    } else if (cart.lines.length && token) {
      // The intent exists before anything is typed, because that is the only
      // way a wallet button can be drawn at all. Its amount is this cart's
      // total, worked out above from the database.
      const existingId = await cartPaymentIntentId(context.db, store.id, token);
      let intent = null;
      if (existingId) {
        try {
          const found = await provider.readIntent(existingId);
          // An intent that has already been paid, or is being paid, belongs to
          // a charge that happened. It is never reused or written over.
          if (PAYABLE_INTENT_STATUSES.has(found.status)) intent = found;
        } catch {
          // Gone from Stripe (wrong account, deleted test data). Make a new one.
          intent = null;
        }
      }

      if (intent) {
        if (intent.amountCents !== cart.totalCents) {
          intent = await provider.updateIntent(intent.id, {
            amountCents: cart.totalCents,
            currency: cart.currency,
          });
        }
      } else {
        intent = await provider.createIntent({
          amountCents: cart.totalCents,
          currency: cart.currency,
          orderReference: `${store.name} order`,
          metadata: { storeId: store.id },
        });
        await setCartPaymentIntentId(context.db, store.id, token, intent.id);
      }

      clientSecret = intent.clientSecret;
    }
  } catch (error) {
    paymentsReady = false;
    clientSecret = null;
    paymentsMessage =
      error instanceof PaymentsNotConfigured
        ? error.message
        : `Payments are not available right now: ${
            error instanceof Error ? error.message : "Stripe did not answer."
          }`;
  }

  // A cart with something in it and no client secret means the payment could
  // not be started. The page says so rather than drawing a form that cannot
  // take money.
  if (paymentsReady && cart.lines.length && !clientSecret) {
    paymentsReady = false;
    paymentsMessage = "The payment could not be started, so there is nothing here to pay with yet.";
  }

  // Reaching checkout is itself the event, the way Shopify counts it: the
  // customer got here with a cart, whether or not they go on to pay. Live View
  // counts distinct sessions, so the submit below cannot double count this.
  // Only on the way in. Re-pricing for the state they just typed reloads this
  // loader, and a tax lookup is not a second visit to checkout.
  const firstView = !url.searchParams.has("region");
  const checkoutSession = readVisitorSession(request);
  if (firstView && checkoutSession && cart.lines.length && shouldTrack(request, url)) {
    track(context.db, context.cloudflare.ctx, {
      storeId: store.id,
      sessionId: checkoutSession,
      type: "checkout",
      path: "/checkout",
      geo: geoFromContext(context, request),
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
  if (pixel && firstView && cart.lines.length) {
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
    clientSecret,
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

  // The intent was made when the page loaded. The browser confirms it a moment
  // after this returns, so this is the last point at which the amount can be
  // put right — and it is put right on the server, from the cart row.
  const intentId = token ? await cartPaymentIntentId(context.db, store.id, token) : null;
  if (!intentId) {
    return { error: "This checkout has expired. Please reload the page and try again." };
  }

  let intent;
  try {
    intent = await provider.readIntent(intentId);
  } catch (error) {
    return {
      error: `The payment could not be read back: ${
        error instanceof Error ? error.message : "unknown error"
      }. Nothing has been charged.`,
    };
  }
  if (!PAYABLE_INTENT_STATUSES.has(intent.status)) {
    return { error: "This payment has already been taken. Please reload the page." };
  }

  // An order may already be sitting against this intent — a card was declined
  // and they are trying again. One intent is one order; the row is brought up
  // to date rather than written twice.
  const existing = await orderByPaymentRef(context.db, intent.id);
  if (existing && (existing.storeId !== store.id || existing.paymentStatus !== "pending")) {
    return { error: "This payment has already been taken. Please reload the page." };
  }

  // One id shared by the browser pixel and the server Conversions API call, so
  // Meta merges the two instead of counting the purchase twice. A retry keeps
  // the id the first attempt was given.
  const metaEventId = existing?.metaEventId ?? crypto.randomUUID();

  // The amount Stripe is holding is moved to the amount just computed — with
  // the destination state applied, which a manual tax rate can change. A stale
  // amount never reaches confirmation.
  const changed = intent.amountCents !== cart.totalCents;
  try {
    await provider.updateIntent(intent.id, {
      amountCents: cart.totalCents,
      currency: cart.currency,
      email,
      metadata: { storeId: store.id, metaEventId },
    });
  } catch (error) {
    return {
      error: `The payment could not be updated: ${
        error instanceof Error ? error.message : "unknown error"
      }. Nothing has been charged.`,
    };
  }

  const geo = geoFromContext(context, request);
  const metaCookies = readMetaCookies(request);
  const country = COUNTRIES.some(([code]) => code === form.get("country"))
    ? String(form.get("country"))
    : "US";
  const address2 =
    [String(form.get("company") || "").trim(), String(form.get("address2") || "").trim()]
      .filter(Boolean)
      .join(" · ") || null;

  const money = {
    subtotalCents: cart.subtotalCents,
    taxCents: cart.taxCents,
    shippingCents: cart.shippingCents,
    totalCents: cart.totalCents,
    currency: cart.currency,
    // Both worked out by priceCart, on the server, from the code on the cart row.
    discountCode: cart.discount?.code ?? null,
    discountCents: cart.discount?.amountCents ?? 0,
  };
  const lines = cart.lines.map((line) => ({
    variantId: line.variantId,
    title: line.productTitle,
    label: line.label,
    unitPriceCents: line.unitPriceCents,
    quantity: line.quantity,
  }));

  let orderId: string;
  let orderNumber: number;

  if (existing) {
    // Same intent, same order. The details and the money are refreshed, and
    // the lines are rewritten so the row can never describe a cart that has
    // since changed underneath it.
    await context.db
      .update(ordersTable)
      .set({
        customerName: name,
        email,
        phone: String(form.get("phone") || "").trim() || null,
        address1: String(form.get("address1") || "").trim() || null,
        address2,
        city: String(form.get("city") || "").trim() || null,
        region: String(form.get("region") || "").trim() || null,
        postalCode: String(form.get("postalCode") || "").trim() || null,
        country,
        marketingConsent: form.get("consent") === "on",
        ...money,
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, existing.id));
    await context.db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, existing.id));
    if (lines.length) {
      await context.db
        .insert(orderItemsTable)
        .values(lines.map((line) => ({ orderId: existing.id, ...line })));
    }
    orderId = existing.id;
    orderNumber = existing.number;
  } else {
    const order = await placeOrder(context.db, {
      storeId: store.id,
      customerName: name,
      email,
      phone: String(form.get("phone") || "").trim() || null,
      address1: String(form.get("address1") || "").trim() || null,
      address2,
      marketingConsent: form.get("consent") === "on",
      city: String(form.get("city") || "").trim() || null,
      region: String(form.get("region") || "").trim() || null,
      postalCode: String(form.get("postalCode") || "").trim() || null,
      country,
      ...money,
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
      lines,
    });
    orderId = order.id;
    orderNumber = order.number;
  }

  if (token) await markCartConverted(context.db, store.id, token, orderId);

  track(context.db, context.cloudflare.ctx, {
    storeId: store.id,
    sessionId: readVisitorSession(request) ?? token ?? intent.id,
    type: "checkout",
    path: "/checkout",
    geo,
    device: deviceFromRequest(request),
    amountCents: cart.totalCents,
    orderId,
  });

  return {
    ok: true as const,
    orderId,
    orderNumber,
    totalCents: cart.totalCents,
    /**
     * The total moved between the page loading and this submit — a state tax
     * rate applying to the address they just typed. The browser is told to
     * show the new figure and ask again rather than confirm an amount nobody
     * agreed to.
     */
    repriced: changed,
    returnTo: `${url.origin}/thanks?order=${orderId}`,
  };
}


/* ------------------------------------------------------------ validation */

type LoadedStore = Awaited<ReturnType<typeof loader>>["store"];
/** What the action can answer with, from this page's point of view. */
type ActionReply =
  | { error: string }
  | { discountError?: string | null }
  | { ok: true; orderId: string; orderNumber: number; totalCents: number; repriced: boolean; returnTo: string };
type Errors = Partial<Record<string, string>>;

/**
 * The state/province lists for the two countries whose subdivisions the
 * shipper needs spelled exactly. Every other country gets a plain text box,
 * because guessing at another country's regions is inventing data.
 *
 * Codes are the two-letter ones the address label wants and the tax lookup
 * already reads out of `?region=`.
 */
const US_STATES: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
  ["PR", "Puerto Rico"],
];

const CA_PROVINCES: [string, string][] = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"], ["NT", "Northwest Territories"], ["NS", "Nova Scotia"],
  ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"],
  ["SK", "Saskatchewan"], ["YT", "Yukon"],
];

/** Only the two we actually hold lists for. Everything else is a text box. */
const REGIONS: Record<string, { label: string; options: [string, string][] }> = {
  US: { label: "State", options: US_STATES },
  CA: { label: "Province", options: CA_PROVINCES },
};

/** What the postal line is called where it is being posted to. */
function postalLabel(country: string) {
  if (country === "CA") return "Postal code";
  if (country === "GB" || country === "IE") return "Postcode";
  return "ZIP code";
}

/**
 * The same rules the action enforces, checked in the browser so a person is
 * told which box is wrong before a round trip — never instead of the server,
 * which still refuses anything that gets past this.
 *
 * The name is asked for in two boxes, the way Shopify asks for it, and joined
 * into the single `name` field the action reads. So the one-word rule lands on
 * the last name box rather than rejecting a full box the person has filled in.
 */
function validate(values: Record<string, string>, store: LoadedStore): Errors {
  const errors: Errors = {};
  const at = (k: string) => (values[k] ?? "").trim();

  if (!at("firstName")) errors.firstName = "Please put your first name in.";
  if (store.nameMode === "full" && !at("lastName")) errors.lastName = "Please put your last name in.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(at("email"))) {
    errors.email = "That email address does not look right — we send your receipt there.";
  }
  // Company is only ever asked for when this store's settings make the server
  // demand it. It is not one of the four, so it is never invented here.
  if (store.companyMode === "required" && !at("company")) errors.company = "Please add the company name.";
  // Name, address, email, phone — the four, and nothing else. Phone is asked
  // for wherever the field is on the page, and its label says so: no box on
  // this page is marked optional and then refused when it is left empty.
  if (store.phoneMode !== "hidden" && !at("phone")) errors.phone = "Please add your phone number so we can ship it.";
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
  if (/first and last name/i.test(message)) return "lastName";
  if (/your name/i.test(message)) return "firstName";
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

export default function Checkout({ loaderData }: Route.ComponentProps) {
  const { store, cart, paymentsReady, paymentsMessage, publishableKey, clientSecret, pixel, footerLinks, photo } =
    loaderData;
  const storeParam = `?store=${store.slug}`;
  const buddy = store.slug === GARDEN_BUDDY;
  const home = `/${storeParam}`;
  const href = (path: string) => `${path}${storeParam}`;
  const cn = buddy ? BUDDY : KNEELER;
  const money = (cents: number) => formatMoney(cents, cart.currency);

  /* The cart emptied under them. */
  if (cart.lines.length === 0) {
    if (buddy) {
      return (
        <>
          <BuddyFonts />
          {store.faviconUrl ? <link rel="icon" href={store.faviconUrl} /> : null}
          <link rel="stylesheet" href={buddyHref} />
          <div className="gb gb-co-sec">
            <CheckoutHeader store={store} home={home} />
            <div className="gb-co">
              <div className="gb-co__empty">
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
    <Summary cart={cart} photo={photo} shipEstimate={store.shipEstimate} cn={cn} money={money} locked={false} />
  );

  const left = (
    <OnePage
      cn={cn}
      store={store}
      cart={cart}
      money={money}
      paymentsReady={paymentsReady}
      paymentsMessage={paymentsMessage}
      publishableKey={publishableKey}
      clientSecret={clientSecret}
      appearance={buddy ? BUDDY_APPEARANCE : KNEELER_APPEARANCE}
      trust={buddy ? <TrustRow /> : null}
      shell={buddy}
      summary={summary}
    />
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
          {/* The wallets, the folded summary and the form are all laid out
              inside OnePage, because the wallet row has to come above the
              summary row as well as above the fields. */}
          <main className="gb-co">{left}</main>
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
   belongs to; nothing is invented per store in this file.

   Garden Buddy wears the Shopify field structure: one bordered group per
   section with hairline-divided cells and labels that float. The shared
   kneeler skin has no such rules in its stylesheet, so it keeps its own
   stacked `gk-field` boxes — the markup branches on `cn.floating`. */

interface CN {
  /** this skin has the grouped, floating-label field rules in its stylesheet */
  floating: boolean;
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
  lines: string;
  linesStyle?: React.CSSProperties;
  line: string;
  tot: string;
  grand: string;
  grandStyle?: React.CSSProperties;
}

const BUDDY: CN = {
  floating: true,
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
  lines: "gb-co__lines",
  line: "gb-co__line",
  tot: "gb-co__tot",
  grand: "gb-co__grand",
};

const KNEELER: CN = {
  floating: false,
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
  lines: "",
  linesStyle: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14 },
  line: "gk-line",
  tot: "gk-totals",
  grand: "gk-totals",
  grandStyle: { borderTop: "1px solid var(--gk-line)", marginTop: 8, paddingTop: 14, fontWeight: 700 },
};

/* Stripe's own fields, dressed to match the group next to them: the same 5px
   radius, the same 16px text, the same neutral ink Shopify uses. */
const BUDDY_APPEARANCE = {
  theme: "stripe",
  variables: {
    colorPrimary: "#1878b9",
    colorText: "#1a1a1a",
    colorTextSecondary: "#6b7177",
    colorTextPlaceholder: "#6b7177",
    colorDanger: "#d72c0d",
    colorBackground: "#ffffff",
    fontSizeBase: "16px",
    borderRadius: "5px",
    spacingUnit: "4px",
  },
};

const KNEELER_APPEARANCE = { theme: "night", variables: { colorPrimary: "#b6f03c", fontSizeBase: "16px" } };

/* ----------------------------------------------------------------- pieces */

/**
 * One cell of an address group.
 *
 * On the Garden Buddy skin it is a bare input inside a cell that owns the
 * hairline between it and its neighbour, with the label sitting on top of the
 * text until there is something to read — floated by CSS alone, off
 * `:placeholder-shown` and `:focus`, so there is no JavaScript between a
 * person and the box they are typing in. The kneeler skin has no such rules,
 * so it renders its own labelled box instead.
 */
function Cell({
  cn,
  name,
  label,
  error,
  onValue,
  onTouch,
  span,
  children,
  ...input
}: {
  cn: CN;
  name: string;
  label: string;
  error?: string;
  onValue: (field: string, value: string) => void;
  onTouch: (field: string) => void;
  /** how many columns of its row this cell takes, when the row has more than one */
  span?: number;
  children?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "onBlur" | "name">) {
  const describedBy = error ? `${name}-error` : undefined;

  if (!cn.floating) {
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

  return (
    <div
      className="gb-sf__cell"
      data-err={error ? "1" : undefined}
      style={span && span > 1 ? { gridColumn: `span ${span}` } : undefined}
    >
      <input
        {...input}
        id={`f-${name}`}
        className="gb-sf__in"
        name={name}
        placeholder=" "
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onValue(name, event.currentTarget.value)}
        onBlur={() => onTouch(name)}
      />
      <label className="gb-sf__lbl" htmlFor={`f-${name}`}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** The same cell, holding a select. A select always has a value, so its label
    is floated from the start rather than waiting on `:placeholder-shown`. */
function SelectCell({
  cn,
  name,
  label,
  value,
  error,
  onValue,
  onTouch,
  options,
  placeholder,
  autoComplete,
}: {
  cn: CN;
  name: string;
  label: string;
  value: string;
  error?: string;
  onValue: (field: string, value: string) => void;
  onTouch: (field: string) => void;
  options: [string, string][];
  placeholder?: string;
  autoComplete?: string;
}) {
  const select = (
    <select
      id={`f-${name}`}
      className={cn.floating ? "gb-sf__in gb-sf__in--sel" : cn.input}
      name={name}
      value={value}
      autoComplete={autoComplete}
      aria-invalid={error ? true : undefined}
      onChange={(event) => {
        onValue(name, event.currentTarget.value);
        onTouch(name);
      }}
      onBlur={() => onTouch(name)}
    >
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map(([code, text]) => (
        <option key={code} value={code}>
          {text}
        </option>
      ))}
    </select>
  );

  if (!cn.floating) {
    return (
      <label className={cn.field}>
        <span className={cn.label}>{label}</span>
        {select}
      </label>
    );
  }

  return (
    <div className="gb-sf__cell" data-err={error ? "1" : undefined}>
      {select}
      <label className="gb-sf__lbl gb-sf__lbl--up" htmlFor={`f-${name}`}>
        {label}
      </label>
    </div>
  );
}

/** The bordered group the cells sit inside — one border, shared hairlines.
    The kneeler skin has no rule for it, so it is not drawn there. */
function Group({ cn, children }: { cn: CN; children: React.ReactNode }) {
  if (!cn.floating) return <>{children}</>;
  return <div className="gb-sf__group">{children}</div>;
}

/** A row inside the group: one, two or three cells divided by hairlines. */
function Row({ cn, cols, children }: { cn: CN; cols: 1 | 2 | 3; children: React.ReactNode }) {
  if (!cn.floating) {
    if (cols === 1) return <>{children}</>;
    return (
      <div className={cn.row} style={cn.rowStyle}>
        {children}
      </div>
    );
  }
  return <div className={`gb-sf__row gb-sf__row--${cols}`}>{children}</div>;
}

/** The messages for a group, under it, in the order the boxes are in. */
function GroupErrors({ cn, errors }: { cn: CN; errors: (string | undefined)[] }) {
  const shown = errors.filter(Boolean) as string[];
  if (!cn.floating || shown.length === 0) return null;
  return (
    <ul className="gb-sf__errs" role="alert">
      {shown.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

/**
 * Contact: the one box Shopify asks for here, and the store's marketing
 * consent under it when the store has that switched on.
 */
function ContactFields({
  cn,
  shownError,
  onField,
  onBlur,
}: {
  cn: CN;
  shownError: (field: string) => string | undefined;
  onField: (field: string, value: string) => void;
  onBlur: (field: string) => void;
}) {
  const common = { cn, onValue: onField, onTouch: onBlur };
  return (
    <>
      <Group cn={cn}>
        <Row cn={cn} cols={1}>
          <Cell
            {...common}
            name="email"
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            error={shownError("email")}
          />
        </Row>
      </Group>
      <GroupErrors cn={cn} errors={[shownError("email")]} />
    </>
  );
}

/**
 * Delivery: country first, because it decides what the two boxes under the
 * city are called and whether the state box is a list or a plain line.
 *
 * Everything here is required except the second address line, and that is the
 * only box with "(optional)" on it. Phone is required and is not marked
 * otherwise — the label and the rule that refuses an empty one now agree.
 */
function DeliveryFields({
  cn,
  store,
  values,
  shownError,
  onField,
  onBlur,
}: {
  cn: CN;
  store: LoadedStore;
  values: Record<string, string>;
  shownError: (field: string) => string | undefined;
  onField: (field: string, value: string) => void;
  onBlur: (field: string) => void;
}) {
  const common = { cn, onValue: onField, onTouch: onBlur };
  const country = values.country || "US";
  const known = REGIONS[country];
  const regionLabel = known?.label ?? "State / Region";

  return (
    <>
      <Group cn={cn}>
        <Row cn={cn} cols={1}>
          <SelectCell
            cn={cn}
            name="country"
            label="Country/region"
            value={country}
            autoComplete="country"
            options={COUNTRIES}
            onValue={onField}
            onTouch={onBlur}
          />
        </Row>

        <Row cn={cn} cols={2}>
          <Cell
            {...common}
            name="firstName"
            label="First name"
            autoComplete="given-name"
            autoCapitalize="words"
            enterKeyHint="next"
            error={shownError("firstName")}
          />
          <Cell
            {...common}
            name="lastName"
            label="Last name"
            autoComplete="family-name"
            autoCapitalize="words"
            enterKeyHint="next"
            error={shownError("lastName")}
          />
        </Row>

        {/* Only when the server will refuse the order without it. */}
        {store.companyMode === "required" ? (
          <Row cn={cn} cols={1}>
            <Cell {...common} name="company" label="Company" autoComplete="organization" error={shownError("company")} />
          </Row>
        ) : null}

        <Row cn={cn} cols={1}>
          <Cell
            {...common}
            name="address1"
            label="Address"
            autoComplete="address-line1"
            autoCapitalize="words"
            enterKeyHint="next"
            error={shownError("address1")}
          />
        </Row>

        <Row cn={cn} cols={1}>
          <Cell
            {...common}
            name="address2"
            label="Apartment, suite, etc. (optional)"
            autoComplete="address-line2"
            autoCapitalize="words"
            enterKeyHint="next"
          />
        </Row>

        <Row cn={cn} cols={3}>
          <Cell
            {...common}
            name="city"
            label="City"
            autoComplete="address-level2"
            autoCapitalize="words"
            enterKeyHint="next"
            error={shownError("city")}
          />
          {known ? (
            <SelectCell
              cn={cn}
              name="region"
              label={regionLabel}
              value={values.region ?? ""}
              placeholder=""
              autoComplete="address-level1"
              options={known.options}
              error={shownError("region")}
              onValue={onField}
              onTouch={onBlur}
            />
          ) : (
            <Cell
              {...common}
              name="region"
              label={regionLabel}
              autoComplete="address-level1"
              autoCapitalize="characters"
              enterKeyHint="next"
              error={shownError("region")}
            />
          )}
          <Cell
            {...common}
            name="postalCode"
            label={postalLabel(country)}
            inputMode={country === "US" ? "numeric" : undefined}
            autoComplete="postal-code"
            autoCapitalize="characters"
            enterKeyHint="next"
            error={shownError("postalCode")}
          />
        </Row>

        {store.phoneMode !== "hidden" ? (
          <Row cn={cn} cols={1}>
            <Cell
              {...common}
              name="phone"
              label="Phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="done"
              error={shownError("phone")}
            />
          </Row>
        ) : null}
      </Group>

      <GroupErrors
        cn={cn}
        errors={[
          shownError("firstName"),
          shownError("lastName"),
          shownError("company"),
          shownError("address1"),
          shownError("city"),
          shownError("region"),
          shownError("postalCode"),
          shownError("phone"),
        ]}
      />
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

      <DiscountBox cn={cn} applied={cart.discount} reason={cart.discountReason} locked={locked} />

      <div className={buddy ? "gb-co__totals" : undefined} style={buddy ? undefined : { marginTop: 12 }}>
        <div className={cn.tot}>
          <span>Subtotal</span>
          <b>{money(cart.subtotalCents)}</b>
        </div>

        {cart.discount ? (
          <div className={cn.tot}>
            <span>
              {cart.discount.code} · {cart.discount.label}
            </span>
            <b>−{money(cart.discount.amountCents)}</b>
          </div>
        ) : null}

        <div className={`${cn.tot}${buddy && cart.shippingCents === 0 ? " gb-co__tot--free" : ""}`}>
          <span>
            Shipping
            {shipEstimate ? <span className={buddy ? "gb-co__line-sub" : "gk-quiet"}> · {shipEstimate}</span> : null}
          </span>
          <b>{cart.shippingCents > 0 ? money(cart.shippingCents) : "Free"}</b>
        </div>

        {cart.taxCents > 0 ? (
          <div className={cn.tot}>
            <span>Tax</span>
            <b>{money(cart.taxCents)}</b>
          </div>
        ) : null}

        <div className={cn.grand} style={cn.grandStyle}>
          <span>Total</span>
          <b>
            {buddy ? <span className="gb-co__grand-cc">{cart.currency}</span> : null}
            {money(cart.totalCents)}
          </b>
        </div>
      </div>
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
  const buddy = cn === BUDDY;

  if (locked) {
    return applied ? (
      <p className={cn.note} style={{ marginTop: 12 }}>
        {applied.code} is applied to this payment.
      </p>
    ) : null;
  }

  if (applied) {
    return (
      <fetcher.Form method="post" style={{ marginTop: 16 }}>
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

  if (!buddy) {
    return (
      <fetcher.Form method="post" style={{ marginTop: 12 }}>
        <input type="hidden" name="intent" value="discount" />
        <label className={cn.field}>
          <span className={cn.label}>Discount code</span>
          <span style={{ display: "flex", gap: 8 }}>
            <input className={cn.input} type="text" name="code" aria-invalid={error ? "true" : undefined} style={{ flex: 1 }} />
            <button type="submit" className={cn.btn} disabled={busy} style={{ width: "auto", marginTop: 0, minHeight: 44, padding: "0 18px" }}>
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

  return (
    <fetcher.Form method="post" className="gb-co__disc">
      <input type="hidden" name="intent" value="discount" />
      <div className="gb-co__disc-row">
        <div className="gb-sf__group gb-sf__group--one">
          <div className="gb-sf__cell" data-err={error ? "1" : undefined}>
            {/* The summary is rendered twice — pinned on a desk, folded on a
                phone — so this box carries its label in aria rather than in an
                id that would then exist twice on the page. */}
            <input
              className="gb-sf__in"
              type="text"
              name="code"
              placeholder=" "
              aria-label="Discount code"
              aria-invalid={error ? "true" : undefined}
            />
            <span className="gb-sf__lbl" aria-hidden="true">
              Discount code
            </span>
          </div>
        </div>
        <button type="submit" className="gb-co__disc-btn" disabled={busy}>
          Apply
        </button>
      </div>
      {error ? (
        <ul className="gb-sf__errs" role="alert">
          <li>{error}</li>
        </ul>
      ) : null}
    </fetcher.Form>
  );
}

/**
 * The one page: wallets, details, card, one button.
 *
 * Stripe's Elements are mounted the moment the page loads, on the intent the
 * loader made, which is the only way a wallet button can be on screen before
 * anyone has typed. The Express Checkout Element is *shown* only when Stripe's
 * own `ready` event says this browser has a wallet to offer — so there is
 * never a button here that cannot take money. A method the account has not
 * enabled, or a domain not registered for Apple Pay, simply does not appear.
 *
 * Card details are entered inside Stripe's iframe and never touch this Worker,
 * which is what keeps the PCI burden off this codebase entirely.
 *
 * Both routes to a payment do the same two things in the same order: post the
 * details to this route's action, which writes the pending order against the
 * intent id the webhook will match on, and only then confirm. An order that
 * exists and is unpaid is recoverable; a payment with no order is money taken
 * for something nobody can find.
 */
function OnePage({
  cn,
  store,
  cart,
  money,
  paymentsReady,
  paymentsMessage,
  publishableKey,
  clientSecret,
  appearance,
  trust,
  shell,
  summary,
}: {
  cn: CN;
  store: LoadedStore;
  cart: Awaited<ReturnType<typeof loader>>["cart"];
  money: (cents: number) => string;
  paymentsReady: boolean;
  paymentsMessage: string | null;
  publishableKey: string | null;
  clientSecret: string | null;
  appearance: unknown;
  trust: React.ReactNode;
  /** this skin lays the whole page out from in here, so the wallets can sit
      above the summary row as well as above the form */
  shell: boolean;
  summary: React.ReactNode;
}) {
  const buddy = cn === BUDDY;
  const fetcher = useFetcher<ActionReply>();
  const [params, setParams] = useSearchParams();

  const formRef = useRef<HTMLFormElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);
  /** resolves the in-flight details post, so a wallet's confirm can await it */
  const replyRef = useRef<((reply: ActionReply) => void) | null>(null);

  const [values, setValues] = useState<Record<string, string>>({ country: "US" });
  const [touched, setTouched] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [ready, setReady] = useState(false);
  const [wallets, setWallets] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  /** the server's figure when it differs from the one the page loaded with */
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [repriced, setRepriced] = useState(false);

  const clientErrors = validate(values, store);
  const reply = fetcher.data;
  const serverMessage = reply && "error" in reply && reply.error ? reply.error : null;
  const serverField = serverMessage ? fieldForMessage(serverMessage) : null;

  const shownError = (field: string) =>
    (submitted || touched[field] ? clientErrors[field] : undefined) ??
    (serverField === field ? serverMessage ?? undefined : undefined);

  const onField = (field: string, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [field]: value };
      // A different country has a different list of states, so the one chosen
      // for the old country is dropped rather than posted against the new one.
      if (field === "country" && value !== prev.country) next.region = "";
      return next;
    });
  };

  const onBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: "1" }));
    // Leaving the state box re-prices the cart on the server for that state,
    // which moves the intent with it. The browser sends the two letters and
    // nothing else — what they are worth is worked out there.
    if (field !== "region") return;
    const next = (values.region ?? "").trim().toUpperCase();
    if (next === (params.get("region") ?? "")) return;
    const nextParams = new URLSearchParams(params);
    if (next) nextParams.set("region", next);
    else nextParams.delete("region");
    setParams(nextParams, { replace: true, preventScrollReset: true });
  };

  const total = serverTotal ?? cart.totalCents;

  /* Hand the action's answer back to whoever is waiting on it. */
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const resolve = replyRef.current;
    if (!resolve) return;
    replyRef.current = null;
    resolve(fetcher.data);
  }, [fetcher.state, fetcher.data]);

  const postDetails = (body: FormData) =>
    new Promise<ActionReply>((resolve) => {
      replyRef.current = resolve;
      fetcher.submit(body, { method: "post" });
    });

  /* Mount Stripe once, on the intent the loader made. */
  useEffect(() => {
    if (!publishableKey || !clientSecret) return;
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
      stripeRef.current = stripe;
      elementsRef.current = elements;

      // The card comes first in the code, even though the wallets sit above it
      // on screen. Whatever happens to the wallet row, there must always be a
      // way to pay: a customer with a blank payment box cannot buy anything.
      const payment = elements.create("payment", { layout: "tabs" });
      if (cardRef.current) payment.mount(cardRef.current);

      // Wallets: a person who has one is done in two taps. The wallet is asked
      // for the address too, because it is the only address that flow ever has
      // and the order cannot be shipped without one.
      try {
        const express = elements.create("expressCheckout", {
          // Stripe accepts 40–55 here and throws outside it.
          buttonHeight: 52,
          emailRequired: true,
          // Phone is one of the four we ask for, so the sheet collects it too
          // wherever this store shows a phone field at all.
          phoneNumberRequired: store.phoneMode !== "hidden",
          billingAddressRequired: true,
        });

        express.on("ready", (event: any) => {
          const available = event?.availablePaymentMethods;
          const any = available && Object.values(available).some(Boolean);
          if (!cancelled) setWallets(Boolean(any));
        });

        express.on("confirm", async (event: any) => {
          setPayError(null);
          setWorking(true);
          const done = await payWithWallet(event);
          if (!done) setWorking(false);
        });

        if (walletRef.current) express.mount(walletRef.current);
      } catch (error) {
        // No wallet row, and nothing said about it — the card is already there
        // and that is what matters.
        console.error("Express checkout unavailable", error);
        if (!cancelled) setWallets(false);
      }

      if (!cancelled) setReady(true);
    };

    boot().catch((bootError: Error) => {
      if (!cancelled) setPayError(bootError.message);
    });

    return () => {
      cancelled = true;
    };
    // The intent, and therefore the secret, is fixed for the life of this cart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishableKey, clientSecret]);

  /* The total moved — a discount applied, a quantity changed. The server has
     already moved the intent to match; this pulls the new amount into the
     mounted elements so the wallet sheet can never show yesterday's price. */
  const lastTotal = useRef(cart.totalCents);
  useEffect(() => {
    if (lastTotal.current === cart.totalCents) return;
    lastTotal.current = cart.totalCents;
    setServerTotal(null);
    setRepriced(false);
    elementsRef.current?.fetchUpdates?.();
  }, [cart.totalCents]);

  /** Reads the typed fields. The amounts are not among them — they are the
      server's, always.

      The name is two boxes on screen and one field on the wire: they are
      joined here, so the action keeps reading the single `name` it always
      read. */
  const detailsFromForm = (): FormData => {
    const body = new FormData(formRef.current!);
    const first = String(body.get("firstName") ?? "").trim();
    const last = String(body.get("lastName") ?? "").trim();
    body.delete("firstName");
    body.delete("lastName");
    body.set("name", [first, last].filter(Boolean).join(" "));
    body.set("intent", "pay");
    return body;
  };

  /** Turns what the wallet handed back into the same fields the form posts. */
  const detailsFromWallet = (event: any): FormData => {
    const details = event?.billingDetails ?? {};
    const address = details.address ?? {};
    const body = new FormData();
    body.set("intent", "pay");
    body.set("name", String(details.name ?? "").trim());
    body.set("email", String(event?.billingDetails?.email ?? details.email ?? "").trim());
    body.set("phone", String(details.phone ?? "").trim());
    body.set("address1", String(address.line1 ?? "").trim());
    body.set("address2", String(address.line2 ?? "").trim());
    body.set("city", String(address.city ?? "").trim());
    body.set("region", String(address.state ?? "").trim());
    body.set("postalCode", String(address.postal_code ?? "").trim());
    body.set("country", String(address.country ?? "US").trim());
    if (values.consent === "on") body.set("consent", "on");
    return body;
  };

  /**
   * Writes the order, then confirms. Returns true when Stripe has taken over
   * (it redirects to the return url), false when we are still here with an
   * error to show.
   */
  const confirmAfterOrder = async (body: FormData): Promise<boolean> => {
    const answer = await postDetails(body);

    if (!answer || !("ok" in answer)) {
      // The action's own sentence. Field-level ones render under their box.
      if (answer && "error" in answer && answer.error && !fieldForMessage(answer.error)) {
        setPayError(answer.error);
      }
      return false;
    }

    setServerTotal(answer.totalCents);
    if (answer.repriced) {
      // The address changed the tax. Nobody is charged an amount they have not
      // been shown, so the new one is shown and the button is pressed again —
      // and the state goes into the URL so this page prices the same way the
      // action just did, rather than asking twice for the same reason.
      const state = String(body.get("region") ?? "").trim().toUpperCase();
      if (state && state !== (params.get("region") ?? "")) {
        const nextParams = new URLSearchParams(params);
        nextParams.set("region", state);
        setParams(nextParams, { replace: true, preventScrollReset: true });
      }
      setRepriced(true);
      return false;
    }

    const result = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      clientSecret,
      confirmParams: { return_url: answer.returnTo },
    });

    if (result?.error) {
      setPayError(result.error.message ?? "The payment did not go through.");
      return false;
    }
    return true;
  };

  const payWithWallet = async (event: any): Promise<boolean> => {
    const done = await confirmAfterOrder(detailsFromWallet(event));
    // Telling the sheet it failed is what closes it; leaving it open on a
    // payment that is not happening is worse than the error underneath it.
    if (!done) event?.paymentFailed?.({ reason: "fail" });
    return done;
  };

  const pay = async () => {
    // The button is disabled while a payment is in flight; this is the second
    // lock, so a stray Enter key or a double tap can never confirm twice.
    if (working) return;
    setSubmitted(true);
    if (Object.keys(clientErrors).length > 0) {
      // Nothing is confirmed until the details are good enough to ship to.
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    if (!stripeRef.current || !elementsRef.current) return;
    setPayError(null);
    setRepriced(false);
    setWorking(true);
    const done = await confirmAfterOrder(detailsFromForm());
    if (!done) setWorking(false);
  };

  /* No intent, no form. A page that cannot take money does not draw a box
     that looks like it can. */
  if (!paymentsReady || !publishableKey || !clientSecret) {
    const stopped = (
      <div>
        <h2 className={cn.h2} style={buddy ? undefined : { marginTop: 0 }}>
          Checkout
        </h2>
        <div className={cn.alert}>
          {paymentsMessage ?? "Payments are not available right now."} Nothing can be charged, so
          please do not enter any card details.
        </div>
        {trust}
      </div>
    );
    if (!shell) return stopped;
    return (
      <div className="gb-co__grid">
        <div className="gb-co__main">{stopped}</div>
        <aside className="gb-co__aside">
          <div className="gb-co__sum">
            <h2 className="gb-co__h3">Order summary</h2>
            {summary}
          </div>
        </aside>
      </div>
    );
  }

  /* Wallets. Mounted always so Stripe can answer, shown only once it has said
     this browser has one — and rendered outside the form, above everything,
     because someone holding a phone with Apple Pay should be finished before
     they have read a single label. */
  const express = (
    <>
      <section
        className={buddy ? "gb-co__express" : undefined}
        style={wallets ? undefined : { display: "none" }}
        aria-label="Express checkout"
      >
        <p className={buddy ? "gb-co__express-lead" : undefined} style={buddy ? undefined : { textAlign: "center" }}>
          Express checkout
        </p>
        <div className={buddy ? "gb-co__express-row" : undefined} ref={walletRef} />
      </section>
      <div
        className={buddy ? "gb-co__or" : undefined}
        style={wallets ? (buddy ? undefined : { textAlign: "center", margin: "18px 0" }) : { display: "none" }}
      >
        OR
      </div>
    </>
  );

  const section = (title: string, note: string | null, children: React.ReactNode) => (
    <section className={buddy ? "gb-co__sec" : undefined} style={buddy ? undefined : { marginTop: 26 }}>
      <h2 className={cn.h2} style={buddy ? undefined : { marginTop: 0 }}>
        {title}
      </h2>
      {note ? <p className={buddy ? "gb-co__secure" : cn.note}>{note}</p> : null}
      {children}
    </section>
  );

  const form = (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void pay();
      }}
    >
      {section(
        "Contact",
        null,
        <>
          <ContactFields cn={cn} shownError={shownError} onField={onField} onBlur={onBlur} />
          {store.consent ? (
            <label
              className={cn.check}
              style={buddy ? undefined : { display: "flex", gap: 10, alignItems: "center", fontSize: 16, marginBottom: 14 }}
            >
              <input
                type="checkbox"
                name="consent"
                style={buddy ? undefined : { width: 20, height: 20 }}
                onChange={(event) => onField("consent", event.currentTarget.checked ? "on" : "")}
              />
              Email me with news and offers
            </label>
          ) : null}
        </>,
      )}

      {section(
        "Delivery",
        null,
        <DeliveryFields
          cn={cn}
          store={store}
          values={values}
          shownError={shownError}
          onField={onField}
          onBlur={onBlur}
        />,
      )}

      {section(
        "Payment",
        "All transactions are secure and encrypted.",
        <>
          <div className={buddy ? "gb-co__card" : undefined} ref={cardRef} style={buddy ? undefined : { minHeight: 200 }} />

          {/* Stripe's own words, under Stripe's own fields — a declined card is
              about what is in that box, not about the page. */}
          {payError || (serverMessage && !serverField) ? (
            <div className={cn.alert} style={{ marginTop: 16, marginBottom: 0 }} role="alert">
              {payError ?? serverMessage}
            </div>
          ) : null}

          {repriced ? (
            <div className={cn.alert} style={{ marginTop: 16 }}>
              The tax for that address changes your total to {money(total)}. Press Pay again to be
              charged that amount — nothing has been charged yet.
            </div>
          ) : null}

          <button
            className={buddy ? "gb-co__pay" : cn.btn}
            type="submit"
            disabled={!ready || working}
            aria-busy={working || undefined}
            style={buddy ? undefined : { width: "100%", marginTop: 18, opacity: ready && !working ? 1 : 0.6 }}
          >
            {working ? (
              <>
                {buddy ? <span className="gb-co__spin" aria-hidden="true" /> : null}
                Paying…
              </>
            ) : (
              "Pay now"
            )}
          </button>

          <p className={cn.note}>Card details go straight to Stripe. They never touch this store.</p>
          {trust}
        </>,
      )}
    </form>
  );

  if (!shell) {
    return (
      <>
        {express}
        {form}
      </>
    );
  }

  return (
    <div className="gb-co__grid">
      <div className="gb-co__main">
        {express}
        <details className="gb-co__msum">
          <summary>
            <svg className="gb-co__msum-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9.5l6 6 6-6" /></svg>
            Order summary
            <span className="gb-co__msum-total">{money(total)}</span>
          </summary>
          <div className="gb-co__msum-body">{summary}</div>
        </details>
        {form}
      </div>
      <aside className="gb-co__aside">
        <div className="gb-co__sum">
          <h2 className="gb-co__h3">Order summary</h2>
          {summary}
        </div>
      </aside>
    </div>
  );
}
