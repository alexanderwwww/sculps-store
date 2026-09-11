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
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Route } from "./+types/checkout";
import { resolveStore, storeNav } from "~/lib/store.server";
import type { NavLink } from "~/lib/store.server";
import { liveTheme } from "~/lib/admin.server";
import {
  readCartToken,
  priceCart,
  markCartConverted,
  setCartDiscount,
  cartPaymentIntentId,
  newCartToken,
  cartCookie,
  setCartProtection,
  currentLines,
  addLine,
  saveCart,
} from "~/lib/cart.server";
import { checkDiscount, findDiscount, normaliseCode } from "~/lib/discounts.server";
import { scratchPlayFor, SCRATCH_PRIZES } from "~/lib/scratch.server";
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
  products as productsTable,
  variants as variantsTable,
} from "~/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { pixelScript, readMetaCookies, trackFunnelEvent } from "~/lib/meta.server";
import { formatMoney } from "~/lib/money";
import { CheckoutHeader, CheckoutFooter, TrustRow } from "~/storefronts/garden-buddy/checkout-chrome";
import kneelerHref from "~/storefronts/garden-kneeler/theme.css?url";
import buddyHref from "~/storefronts/garden-buddy/checkout.css?url";

const GARDEN_BUDDY = "garden-buddy";

/**
 * The other skin's stylesheet and fonts used to be declared here, which meant
 * every Garden Buddy checkout downloaded a theme and two font families it
 * never used before it could paint. They are rendered inside the skin that
 * actually needs them instead — the same way this page already brings in
 * Garden Buddy's own.
 */
function KneelerFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap"
      />
      <link rel="stylesheet" href={kneelerHref} />
    </>
  );
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
  /**
   * Everything this page needs from the database, asked for at once.
   *
   * These used to run one after another — price the cart, then look up the
   * payment provider, then the pixel, then the navigation, then the product
   * photo. Five sequential round trips to a database that is not in the same
   * building as the Worker is most of a second spent waiting rather than
   * working, and it is the page where waiting costs orders. None of them
   * depends on another, so they now go out together and the page waits once.
   */
  const [cart, providerResult, metaRows, nav, photo] = await Promise.all([
    priceCart(context.db, store, token, region),
    providerForStore(context.db, context.cloudflare.env, store.id).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    context.db
      .select({ pixelId: metaConfig.pixelId })
      .from(metaConfig)
      .where(eq(metaConfig.storeId, store.id))
      .limit(1),
    storeNav(context.db, store.id),
    productPhoto(context.db, store.id),
  ]);

  let paymentsReady = true;
  let paymentsMessage: string | null = null;
  let publishableKey: string | null = null;

  if (providerResult.ok) {
    publishableKey = providerResult.value.publishableKey;
    if (!publishableKey) {
      paymentsReady = false;
      paymentsMessage = "This store has no Stripe publishable key set in Settings → Payments.";
    }
  } else {
    const error = providerResult.error;
    paymentsReady = false;
    paymentsMessage =
      error instanceof PaymentsNotConfigured
        ? error.message
        : `Payments are not available right now: ${
            error instanceof Error ? error.message : "Stripe did not answer."
          }`;
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
  const [meta] = metaRows;

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

  /**
   * "Just one more thing": the store's other bundles, from the variants table.
   * Only live products, only variants with stock, and only ones this cart does
   * not already hold — so nothing is ever offered that does not exist, cannot
   * be shipped, or is already being paid for. Prices are the row's own.
   */
  const inCart = new Set(cart.lines.map((line) => line.variantId));
  const upsellRows = cart.lines.length
    ? await context.db
        .select({
          id: variantsTable.id,
          label: variantsTable.label,
          sublabel: variantsTable.sublabel,
          priceCents: variantsTable.priceCents,
          compareAtCents: variantsTable.compareAtCents,
          available: variantsTable.available,
          productTitle: productsTable.title,
        })
        .from(variantsTable)
        .innerJoin(productsTable, eq(variantsTable.productId, productsTable.id))
        .where(and(eq(productsTable.storeId, store.id), eq(productsTable.status, "active")))
        .orderBy(asc(variantsTable.position))
    : [];
  const upsells = upsellRows
    .filter((row) => row.available > 0 && !inCart.has(row.id))
    .map(({ available, ...rest }) => rest);

  return {
    pixel,
    // The odds go to the browser so the card can print them next to itself.
    // They live in one place on the server; this is a copy, never a second
    // set of numbers.
    scratchOdds: SCRATCH_PRIZES.map((prize) => ({ percent: prize.percent, weight: prize.weight })),
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
    upsells,
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

  /**
   * The scratch card. The prize is drawn here, on the server, the first time
   * this cart asks for one, and the same cart always gets the same answer
   * back — scratching reveals it, it never decides it.
   */
  if (formIntent === "scratch") {
    let cartToken = token;
    let setCookie: string | null = null;
    if (!cartToken) {
      cartToken = newCartToken();
      setCookie = cartCookie(cartToken, url);
    }
    const play = await scratchPlayFor(context.db, store.id, cartToken);
    return Response.json(
      { scratch: play },
      setCookie ? { headers: { "Set-Cookie": setCookie } } : undefined,
    );
  }

  /**
   * Package protection, on or off. The browser sends the choice and nothing
   * else — what it costs is the store's column, read by priceCart when this
   * page reloads, which is also what moves the PaymentIntent's amount.
   */
  if (formIntent === "protection") {
    let cartToken = token;
    let setCookie: string | null = null;
    if (!cartToken) {
      cartToken = newCartToken();
      setCookie = cartCookie(cartToken, url);
    }
    await setCartProtection(context.db, store.id, cartToken, form.get("wanted") === "on");
    return Response.json({ protection: true }, setCookie ? { headers: { "Set-Cookie": setCookie } } : undefined);
  }

  /**
   * The upsell's Add. A variant id, checked against this store's own live
   * products and its stock before it is allowed onto the cart; the price is
   * never sent and never read from here. Adding re-prices the cart on the next
   * load, which moves the intent with it.
   */
  if (formIntent === "upsell") {
    const variantId = String(form.get("variantId") || "").trim();
    if (!variantId) return Response.json({ added: false });

    const [row] = await context.db
      .select({ id: variantsTable.id, available: variantsTable.available, status: productsTable.status, storeId: productsTable.storeId })
      .from(variantsTable)
      .innerJoin(productsTable, eq(variantsTable.productId, productsTable.id))
      .where(eq(variantsTable.id, variantId))
      .limit(1);
    if (!row || row.storeId !== store.id || row.status !== "active" || row.available < 1) {
      return Response.json({ added: false });
    }

    let cartToken = token;
    let setCookie: string | null = null;
    if (!cartToken) {
      cartToken = newCartToken();
      setCookie = cartCookie(cartToken, url);
    }
    const lines = await currentLines(context.db, store.id, cartToken);
    await saveCart(context.db, store.id, cartToken, addLine(lines, variantId, 1));
    return Response.json({ added: true }, setCookie ? { headers: { "Set-Cookie": setCookie } } : undefined);
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
    // Priced by the server from the store's own column, the same as every
    // other figure here — so the intent, the order row and the receipt agree.
    protectionCents: cart.protectionCents,
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
    if (cart.protectionCents > 0) {
      await context.db
        .update(ordersTable)
        .set({ protectionCents: cart.protectionCents })
        .where(eq(ordersTable.id, order.id));
    }
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
    /**
     * The token that authorises paying this one intent. The page no longer
     * fetches it on load — it mounts Stripe against the amount alone and is
     * handed the secret here, at the moment it is actually needed, which is
     * what took the wait out of the wallet row.
     */
    clientSecret: intent.clientSecret,
    returnTo: `${url.origin}/thanks?order=${orderId}`,
  };
}


/* ------------------------------------------------------------ validation */

type LoadedStore = Awaited<ReturnType<typeof loader>>["store"];
/** What the action can answer with, from this page's point of view. */
type ActionReply =
  | { error: string }
  | { discountError?: string | null; protection?: boolean; added?: boolean }
  | { scratch: { percent: number; code: string } }
  | {
      ok: true;
      orderId: string;
      orderNumber: number;
      totalCents: number;
      repriced: boolean;
      clientSecret: string;
      returnTo: string;
    };
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
  const { store, cart, paymentsReady, paymentsMessage, publishableKey, pixel, footerLinks, photo } =
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
          <div className="gb-co-sec">
            <div className="gb-co__pane">
              <div className="gb-co__pane-in">
                <CheckoutHeader store={store} home={home} />
              <div className="gb-co__empty">
                <p>Your cart is empty.</p>
                <Link className="gb-co__btn" to={home} style={{ textDecoration: "none", maxWidth: 320, margin: "0 auto" }}>
                  Back to the product
                </Link>
              </div>
              </div>
              <CheckoutFooter store={store} links={footerLinks.map(withParam(storeParam))} contactEmail={store.contactEmail} />
            </div>
          </div>
        </>
      );
    }
    return (
      <div className="gk">
        <KneelerFonts />
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
      appearance={buddy ? BUDDY_APPEARANCE : KNEELER_APPEARANCE}
      trust={buddy ? <TrustRow /> : null}
      shell={buddy}
      summary={summary}
      under={buddy ? <Upsell items={loaderData.upsells} photo={photo} money={money} /> : null}
      scratchOdds={loaderData.scratchOdds}
      chrome={
        buddy
          ? {
              header: <CheckoutHeader store={store} home={home} />,
              footer: (
                <CheckoutFooter
                  store={store}
                  links={footerLinks.map(withParam(storeParam))}
                  contactEmail={store.contactEmail}
                />
              ),
            }
          : null
      }
    />
  );

  if (buddy) {
    return (
      <>
        <BuddyFonts />
        {store.faviconUrl ? <link rel="icon" href={store.faviconUrl} /> : null}
        <link rel="stylesheet" href={buddyHref} />
        <PayBoot />
        {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
        {/* Two halves of the screen. OnePage lays out both of them, because
            the same pieces have to sit in different places on a phone: the
            summary folds to the top, the suggestions fall below the form. */}
        <div className="gb-co-sec">{left}</div>
      </>
    );
  }

  /* No theme of its own yet. The shared one, laid out the same way: the form
     beside a summary that stays put, and a header that is the logo only. */
  return (
    <div className="gk">
      <KneelerFonts />
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


/**
 * The two things the payment needs, started before React exists.
 *
 * Everything on this page used to wait for the route bundle to download, for
 * React to hydrate, and only then to ask for Stripe's script and for the
 * payment intent — one after the other. That is why the wallet row took so
 * long to appear even though the page itself was up: nothing about the
 * payment had even been requested yet.
 *
 * This runs while the browser is still parsing the HTML. Stripe's script and
 * the intent request go out together, in parallel, and both are waiting in
 * `window.__gbPay` by the time the component asks for them.
 */
const PAY_BOOT = `(function(){
  var w=window; if(w.__gbPay) return;
  var s=document.createElement('script');
  s.src='https://js.stripe.com/v3/'; s.async=true;
  var stripe=new Promise(function(res,rej){ s.onload=function(){res()}; s.onerror=function(){rej(new Error('Stripe could not be loaded.'))} });
  document.head.appendChild(s);
  var intent=fetch('/checkout/intent',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:''})
    .then(function(r){return r.json()})
    .catch(function(){return {clientSecret:null,error:'The payment could not be started. Please reload the page.'}});
  w.__gbPay={stripe:stripe,intent:intent};
  // What this browser is actually capable of. Apple Pay and Google Pay belong
  // to the browser, not to us, so this is the only way to know from here why a
  // button did or did not appear.
  try{
    var can={
      applePaySession: typeof w.ApplePaySession !== 'undefined',
      applePayCanMake: (typeof w.ApplePaySession !== 'undefined' && w.ApplePaySession.canMakePayments) ? !!w.ApplePaySession.canMakePayments() : false,
      paymentRequest: typeof w.PaymentRequest !== 'undefined',
      secure: w.isSecureContext === true
    };
    navigator.sendBeacon && navigator.sendBeacon('/checkout/diag', new Blob([new URLSearchParams({kind:'capabilities',detail:JSON.stringify(can)}).toString()],{type:'application/x-www-form-urlencoded'}));
  }catch(e){}
})();`;

function PayBoot() {
  return (
    <>
      <link rel="preconnect" href="https://js.stripe.com" />
      <link rel="preconnect" href="https://api.stripe.com" />
      <script dangerouslySetInnerHTML={{ __html: PAY_BOOT }} />
    </>
  );
}

function BuddyFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800&family=Inter:wght@400;500;600;700&display=swap"
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

/* Stripe's own fields, dressed to match the boxes next to them: the same 10px
   radius, the same 16px text, the store's own ink and dim. */
const BUDDY_APPEARANCE = {
  theme: "stripe",
  variables: {
    colorPrimary: "#3B2A1B",
    colorText: "#1C2318",
    colorTextSecondary: "#5D6657",
    colorTextPlaceholder: "#5D6657",
    colorDanger: "#B3341C",
    colorBackground: "#ffffff",
    fontSizeBase: "16px",
    borderRadius: "10px",
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

        <Row cn={cn} cols={2}>
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
          <Cell
            {...common}
            name="city"
            label="City"
            autoComplete="address-level2"
            autoCapitalize="words"
            enterKeyHint="next"
            error={shownError("city")}
          />
        </Row>

        <Row cn={cn} cols={1}>
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
          shownError("postalCode"),
          shownError("city"),
          shownError("region"),
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

      {buddy ? <ProtectionRow cart={cart} money={money} locked={locked} /> : null}

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

        {cart.protectionCents > 0 ? (
          <div className={cn.tot}>
            <span>Package protection</span>
            <b>{money(cart.protectionCents)}</b>
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
 * Package protection.
 *
 * The store decides whether it is sold at all and what it costs; this row
 * only records the customer's choice, and it starts off. When the store has
 * no price set the row does not render — there is nothing honest to charge
 * for. The figure beside it is the server's own, read back off the priced
 * cart, and ticking the box reloads the page so the total, the intent and the
 * order all move together.
 */
function ProtectionRow({
  cart,
  money,
  locked,
}: {
  cart: Awaited<ReturnType<typeof loader>>["cart"];
  money: (cents: number) => string;
  locked: boolean;
}) {
  const fetcher = useFetcher<ActionReply>();
  const busy = fetcher.state !== "idle";
  if (cart.protectionOfferCents == null || !cart.protectionCopy) return null;

  if (locked) {
    return cart.protectionChosen ? (
      <p className="gb-co__note">Package protection is included in this payment.</p>
    ) : null;
  }

  return (
    <fetcher.Form method="post" className="gb-co__prot">
      <input type="hidden" name="intent" value="protection" />
      {/* The summary is drawn twice — pinned on a desk, folded on a phone — so
          the box carries its label in aria rather than in an id that would
          then exist twice on the page. */}
      <label className="gb-co__prot-row" data-busy={busy ? "1" : undefined}>
        <input
          type="checkbox"
          name="wanted"
          aria-label="Add package protection"
          checked={cart.protectionChosen}
          disabled={busy}
          onChange={(event) => {
            const body = new FormData();
            body.set("intent", "protection");
            body.set("wanted", event.currentTarget.checked ? "on" : "");
            fetcher.submit(body, { method: "post" });
          }}
        />
        <span className="gb-co__prot-body">
          <span className="gb-co__prot-title">Package protection</span>
          <span className="gb-co__prot-copy">{cart.protectionCopy}</span>
        </span>
        <span className="gb-co__prot-price">{money(cart.protectionOfferCents)}</span>
      </label>
    </fetcher.Form>
  );
}

/**
 * "Just one more thing" — the bundles this cart does not already hold.
 *
 * Every row is a real variant of a live product with stock on it, and every
 * figure is that row's own. Adding posts the variant id and nothing else: the
 * server checks it again, puts it on the cart, and the loader re-prices —
 * which is what moves the PaymentIntent's amount. Nothing to offer, no block.
 */
function Upsell({
  items,
  photo,
  money,
}: {
  items: Awaited<ReturnType<typeof loader>>["upsells"];
  photo: { src: string; alt: string } | null;
  money: (cents: number) => string;
}) {
  const fetcher = useFetcher<ActionReply>();
  const busy = fetcher.state !== "idle";
  const adding = busy ? String(fetcher.formData?.get("variantId") ?? "") : "";
  if (!items.length) return null;

  return (
    <section className="gb-co__up" aria-label="Add to your order">
      <h2 className="gb-co__up-h">Just one more thing</h2>
      <p className="gb-co__up-sub">Goes in the same parcel. Shipping does not change.</p>
      <ul className="gb-co__up-list">
        {items.map((item) => (
          <li className="gb-co__up-item" key={item.id}>
            <span className="gb-co__up-shot">
              {photo ? (
                <img src={photo.src} alt={photo.alt || item.productTitle} loading="lazy" />
              ) : (
                <span className="gb-ph">No photo</span>
              )}
            </span>
            <span className="gb-co__up-body">
              <span className="gb-co__up-name">{item.label}</span>
              <span className="gb-co__up-price">
                {money(item.priceCents)}
                {item.compareAtCents && item.compareAtCents > item.priceCents ? (
                  <span className="gb-co__up-was">{money(item.compareAtCents)}</span>
                ) : null}
              </span>
            </span>
            <button
              type="button"
              className="gb-co__up-add"
              disabled={busy}
              aria-label={`Add ${item.label} to your order`}
              onClick={() => {
                const body = new FormData();
                body.set("intent", "upsell");
                body.set("variantId", item.id);
                fetcher.submit(body, { method: "post" });
              }}
            >
              {adding === item.id ? "Adding…" : "Add"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- scratch card
 * "Try your luck" — a foil panel the customer rubs off with a finger or the
 * mouse, under which is the discount the server already drew.
 *
 * Why it is built this way: the prize is requested from the server the moment
 * the card is first touched, and it is written down there before a single
 * pixel of foil is removed. The page cannot influence it, and a refresh gets
 * the same card back. The odds are printed under the card because a prize
 * promotion that hides its odds is the kind that gets an account closed.
 */
/**
 * The sound of the card.
 *
 * Made in the browser rather than downloaded: a checkout that has to fetch
 * two audio files before it can feel good is a checkout that got slower for a
 * nice-to-have. The scratch is filtered noise, shaped to the movement; the
 * win is two soft bell notes a fifth apart, which is the interval that reads
 * as "good news" in every phone in the world.
 *
 * Browsers refuse to make sound until the person has touched the page, which
 * here they have — they are scratching it.
 */
function useScratchSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const context = () => {
    if (!ctxRef.current) {
      const Ctor = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current?.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  };

  /**
   * One continuous rasp, not a burst per movement.
   *
   * The first version fired a short noise hit on every pointer event, which
   * at thirty events a second is a machine gun — his words, and he was right.
   * This is a single looping noise source, opened by a low-pass filter while
   * the finger is moving and closed the moment it stops, which is what
   * rubbing a card actually sounds like.
   */
  const loopRef = useRef<{ gain: GainNode; stop: () => void } | null>(null);
  const quietAt = useRef(0);

  const scratch = useCallback((speed = 1) => {
    try {
      const audio = context();
      if (!audio) return;

      if (!loopRef.current) {
        const seconds = 2;
        const buffer = audio.createBuffer(1, audio.sampleRate * seconds, audio.sampleRate);
        const data = buffer.getChannelData(0);
        // Brownish noise: each sample leans on the last, so it is a rustle
        // rather than a hiss.
        let previous = 0;
        for (let i = 0; i < data.length; i++) {
          const white = Math.random() * 2 - 1;
          previous = (previous + 0.035 * white) / 1.035;
          data[i] = previous * 3.2;
        }
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        // Shaped like a fingernail on a foil card rather than a rumble:
        // everything below 700Hz cut away, a resonant lift where the rasp
        // actually lives, and the very top rolled off so it is not hissy.
        const high = audio.createBiquadFilter();
        high.type = "highpass";
        high.frequency.value = 700;
        const peak = audio.createBiquadFilter();
        peak.type = "peaking";
        peak.frequency.value = 2600;
        peak.Q.value = 0.9;
        peak.gain.value = 7;
        const low = audio.createBiquadFilter();
        low.type = "lowpass";
        low.frequency.value = 7000;
        const gain = audio.createGain();
        gain.gain.value = 0;
        source.connect(high).connect(peak).connect(low).connect(gain).connect(audio.destination);
        source.start();
        loopRef.current = { gain, stop: () => source.stop() };
      }

      const { gain } = loopRef.current;
      const now = audio.currentTime;
      gain.gain.cancelScheduledValues(now);
      const level = Math.min(0.13, 0.035 + speed * 0.05);
      gain.gain.setTargetAtTime(level, now, 0.02);

      // Fade out shortly after the last movement.
      window.clearTimeout(quietAt.current);
      quietAt.current = window.setTimeout(() => {
        try {
          const at = audio.currentTime;
          gain.gain.cancelScheduledValues(at);
          gain.gain.setTargetAtTime(0, at, 0.05);
        } catch {
          /* nothing to do */
        }
      }, 110);
    } catch {
      /* sound is never worth an error */
    }
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(quietAt.current);
      try {
        loopRef.current?.stop();
      } catch {
        /* already gone */
      }
    },
    [],
  );

  /** Two bell notes: the reveal. */
  const win = useCallback(() => {
    try {
      const audio = context();
      if (!audio) return;
      const at = audio.currentTime;
      [
        [880, 0],
        [1318.5, 0.11],
      ].forEach(([frequency, delay]) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = "sine";
        osc.frequency.value = frequency!;
        gain.gain.setValueAtTime(0.0001, at + delay!);
        gain.gain.exponentialRampToValueAtTime(0.16, at + delay! + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + delay! + 0.55);
        osc.connect(gain).connect(audio.destination);
        osc.start(at + delay!);
        osc.stop(at + delay! + 0.6);
      });
    } catch {
      /* sound is never worth an error */
    }
  }, []);

  return { scratch, win };
}

function ScratchCard({
  odds,
  applied,
  locked,
  logoUrl,
}: {
  odds: { percent: number; weight: number }[];
  applied: string | null;
  locked: boolean;
  logoUrl: string | null;
}) {
  const fetcher = useFetcher<ActionReply>();
  const apply = useFetcher<ActionReply>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [prize, setPrize] = useState<{ percent: number; code: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  /** scratched past halfway — the reveal waits for the server's answer */
  const [scratchedThrough, setScratchedThrough] = useState(false);
  const [touched, setTouched] = useState(false);
  const [showOdds, setShowOdds] = useState(false);
  const cleared = useRef(false);
  const sound = useScratchSound();
  /** set the instant a finger lands, so the sheen stops before it can paint
      over the first scratch — state lands a render too late for that. */
  const touchedRef = useRef(false);
  const lastPoint = useRef<{ x: number; y: number; t: number } | null>(null);

  const data = fetcher.data;
  useEffect(() => {
    if (data && "scratch" in data && data.scratch) setPrize(data.scratch);
  }, [data]);

  /* Both halves have to be true: scratched off, and an answer in hand. */
  useEffect(() => {
    if (scratchedThrough && prize && !revealed) {
      setRevealed(true);
      sound.win();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scratchedThrough, prize]);

  /**
   * The card costs nothing until it is touched. It used to ask the server for
   * a prize the moment the page loaded — one more request competing with the
   * payment on the page where speed is money, and the reason it could sit on
   * "Preparing your card…". Now the foil is painted immediately and the draw
   * is requested by the first scratch.
   */
  const asked = useRef(false);
  const askForPrize = () => {
    if (asked.current || locked || applied) return;
    asked.current = true;
    fetcher.submit({ intent: "scratch" }, { method: "post" });
  };

  /**
   * The foil.
   *
   * Painted once, in device pixels, and then left alone. The first version
   * animated a sheen across it on every frame, which fought the scratching:
   * each frame repainted the foil over what had just been rubbed away. That
   * is why it would not scratch. The shine is part of the painting now, not
   * a loop.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || revealed) return;
    let stopped = false;

    const paint = (mark: HTMLImageElement | null) => {
      if (stopped || cleared.current || touchedRef.current) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";

      const metal = ctx.createLinearGradient(0, 0, w, h);
      metal.addColorStop(0, "#3B2A1B");
      metal.addColorStop(0.45, "#57402B");
      metal.addColorStop(0.52, "#7A5C3C");
      metal.addColorStop(0.6, "#57402B");
      metal.addColorStop(1, "#2A1D11");
      ctx.fillStyle = metal;
      ctx.fillRect(0, 0, w, h);

      // The store's own mark, big and in its own colours — this is the front
      // of the card, so it should look like the brand, not like a watermark.
      if (mark && mark.naturalWidth) {
        const height = 30 * ratio;
        const width = (mark.naturalWidth / mark.naturalHeight) * height;
        ctx.globalAlpha = 0.55;
        let row = 0;
        for (let y = 8 * ratio; y < h; y += height + 16 * ratio) {
          for (let x = -width; x < w; x += width + 18 * ratio) {
            ctx.drawImage(mark, x + (row % 2) * ((width + 18 * ratio) / 2), y, width, height);
          }
          row++;
        }
        ctx.globalAlpha = 1;
      }

      // one fixed gold sheen across the corner
      const sheen = ctx.createLinearGradient(0, h, w, 0);
      sheen.addColorStop(0, "rgba(255, 199, 44, 0)");
      sheen.addColorStop(0.46, "rgba(255, 226, 150, .30)");
      sheen.addColorStop(0.54, "rgba(255, 199, 44, .18)");
      sheen.addColorStop(1, "rgba(255, 199, 44, 0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "destination-out";
    };

    if (logoUrl) {
      const mark = new Image();
      mark.crossOrigin = "anonymous";
      mark.onload = () => paint(mark);
      mark.onerror = () => paint(null);
      mark.src = logoUrl;
      if (mark.complete) paint(mark);
    } else {
      paint(null);
    }

    const onResize = () => paint(null);
    window.addEventListener("resize", onResize);
    return () => {
      stopped = true;
      window.removeEventListener("resize", onResize);
    };
  }, [revealed, logoUrl]);

  /** How much has been rubbed off — it opens at just over half. */
  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || cleared.current) return;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    let seen = 0;
    for (let i = 3; i < pixels.length; i += 4 * 16) {
      seen++;
      if (pixels[i]! < 32) clear++;
    }
    if (seen && clear / seen > 0.38) {
      cleared.current = true;
      setScratchedThrough(true);
    }
  }, []);

  const rub = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.buttons === 0 && event.pointerType === "mouse") return;
    if (!touchedRef.current) {
      touchedRef.current = true;
      setTouched(true);
      askForPrize();
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc((event.clientX - rect.left) * ratio, (event.clientY - rect.top) * ratio, 28 * ratio, 0, Math.PI * 2);
    ctx.fill();
    const previous = lastPoint.current;
    const here = { x: event.clientX, y: event.clientY, t: performance.now() };
    lastPoint.current = here;
    const speed = previous
      ? Math.min(2, Math.hypot(here.x - previous.x, here.y - previous.y) / Math.max(8, here.t - previous.t))
      : 0.6;
    sound.scratch(speed);
    // A drag that leaves the panel and comes back would otherwise stop
    // erasing; the pointer is captured so the whole gesture belongs to it.
    if (event.type === "pointerdown") canvas.setPointerCapture?.(event.pointerId);
    measure();
  };

  /** Revealed means won: the code goes on the cart through the normal path. */
  useEffect(() => {
    if (!revealed || !prize || applied) return;
    apply.submit({ intent: "discount", code: prize.code }, { method: "post" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, prize]);

  if (applied || locked) return null;

  return (
    <section className="gb-co__scratch" aria-label="Try your luck">
      <p className="gb-co__scratch-h">Try your luck</p>
      <p className="gb-co__scratch-sub">Every card wins. Scratch to see what this order gets.</p>

      <div className="gb-co__scratch-box" data-won={revealed ? "1" : undefined} data-touched={touched ? "1" : undefined}>
        <div className="gb-co__scratch-prize" aria-live="polite">
          {prize ? (
            <>
              <b>{prize.percent}% off</b>
              {revealed ? (
                <span className="gb-co__scratch-applied">Applied to this order</span>
              ) : (
                <span>your discount</span>
              )}
            </>
          ) : (
            <span>{scratchedThrough ? "Turning it over…" : "your discount"}</span>
          )}
        </div>
        {!revealed ? (
          <>
            <canvas
              ref={canvasRef}
              className="gb-co__scratch-foil"
              onPointerMove={rub}
              onPointerDown={rub}
              aria-label="Scratch panel"
            />
            <span className="gb-co__scratch-hint">SCRATCH</span>
          </>
        ) : null}
      </div>

      <div className="gb-co__scratch-foot">
        <button type="button" className="gb-co__scratch-odds-btn" onClick={() => setShowOdds((v) => !v)}>
          {showOdds ? "Hide odds" : "See the odds"}
        </button>
      </div>
      {showOdds ? (
        <ul className="gb-co__scratch-odds">
          {odds.map((o) => (
            <li key={o.percent}>
              <span>{o.percent}% off</span>
              <b>{o.weight} in 100</b>
            </li>
          ))}
          <li className="gb-co__scratch-odds-note">
            The prize is drawn at random when the card is made, before you scratch it. One card per
            order.
          </li>
        </ul>
      ) : null}
    </section>
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
  appearance,
  trust,
  shell,
  summary,
  under,
  scratchOdds,
  chrome,
}: {
  cn: CN;
  store: LoadedStore;
  cart: Awaited<ReturnType<typeof loader>>["cart"];
  money: (cents: number) => string;
  paymentsReady: boolean;
  paymentsMessage: string | null;
  publishableKey: string | null;
  appearance: unknown;
  trust: React.ReactNode;
  /** this skin lays the whole page out from in here, so the wallets can sit
      above the summary row as well as above the form */
  shell: boolean;
  summary: React.ReactNode;
  /** the block that sits under the summary — "Just one more thing" */
  under: React.ReactNode;
  /** the published scratch-card odds, straight from the server's table */
  scratchOdds: { percent: number; weight: number }[];
  /** the header and footer of the white half, when this skin lays out the page */
  chrome: { header: React.ReactNode; footer: React.ReactNode } | null;
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
  const identified = useRef<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  /**
   * The payment intent, fetched the moment this page is on screen rather than
   * before it is sent. The HTML no longer waits on Stripe — measured on the
   * live store, that was about half a second of blank page — and this request
   * runs while Stripe's own script is still downloading, so by the time the
   * form can be drawn the secret is usually already here.
   */
  /**
   * Tell the shop when something in the browser goes wrong here.
   *
   * The wallet row lives or dies inside a browser I cannot open from this
   * machine, so the alternative to this is guessing, and guessing has already
   * cost him a day. Nothing personal is sent: what failed, what it said, and
   * which browser.
   */
  const report = useCallback((kind: string, detail: unknown) => {
    try {
      const text = detail instanceof Error ? detail.message : typeof detail === "string" ? detail : JSON.stringify(detail);
      console.warn(`[checkout] ${kind}`, detail);
      navigator.sendBeacon?.(
        "/checkout/diag",
        new Blob([new URLSearchParams({ kind, detail: String(text).slice(0, 500) }).toString()], {
          type: "application/x-www-form-urlencoded",
        }),
      );
    } catch {
      /* reporting must never break the page it is reporting on */
    }
  }, []);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [wallets, setWallets] = useState(false);
  /** Stripe has said something about wallets — until then, show the space. */
  const [walletsAnswered, setWalletsAnswered] = useState(false);
  const walletsAnsweredRef = useRef(false);
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

    // Leaving the email box tells the store who this is, so the cart stops
    // being anonymous: it is the difference between a sale that walked away
    // and a person he can follow up with. Only what they typed here, sent
    // once, and a failure is silent — nothing about identifying someone may
    // interfere with them paying.
    if (field === "email") {
      const email = (values.email ?? "").trim();
      if (email.includes("@") && email !== identified.current) {
        identified.current = email;
        const body = new URLSearchParams({ email });
        const name = [values.firstName, values.lastName].filter(Boolean).join(" ").trim();
        if (name) body.set("name", name);
        if (values.phone) body.set("phone", values.phone);
        if (store.consent) body.set("consent", values.marketing === "on" ? "on" : "false");
        fetch("/checkout/identify", { method: "POST", body }).catch(() => undefined);
      }
    }

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

  /**
   * Mount Stripe the moment its script is here.
   *
   * This used to wait for a payment intent, which meant the wallet row could
   * not be drawn until a request had gone to our Worker, on to Stripe, and
   * come back — and that is what he was watching for fifteen seconds. Stripe
   * supports mounting against the amount instead ("deferred intent"), so the
   * buttons are drawn immediately and the intent is only needed at the moment
   * somebody actually pays, by which time it has long since been made in the
   * background.
   */
  useEffect(() => {
    if (!publishableKey || cart.lines.length === 0) return;
    let cancelled = false;

    const boot = async () => {
      if (!(window as any).Stripe) {
        const booted = (window as any).__gbPay?.stripe as Promise<void> | undefined;
        if (booted) {
          await booted;
        } else {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://js.stripe.com/v3/";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Stripe could not be loaded."));
            document.head.appendChild(script);
          });
        }
      }
      if (cancelled) return;

      const stripe = (window as any).Stripe(publishableKey);
      const elements = stripe.elements({
        mode: "payment",
        amount: Math.max(50, cart.totalCents),
        currency: (cart.currency ?? "usd").toLowerCase(),
        appearance,
      });
      stripeRef.current = stripe;
      elementsRef.current = elements;

      // The card comes first in the code, even though the wallets sit above it
      // on screen. Whatever happens to the wallet row, there must always be a
      // way to pay: a customer with a blank payment box cannot buy anything.
      // Radio rows that open when chosen — "pay with card", and any other
      // method the account has actually enabled — instead of one wall of
      // fields. Stripe builds the list, so nothing is drawn that cannot be
      // paid with.
      /**
       * Choose, then type. The rows are closed to start with — "Credit or
       * debit card", "Apple Pay", and whatever else this account has on — so
       * the customer picks a way to pay and only that one's fields open.
       * Apple Pay appearing here as well as in the row at the top is on
       * purpose: two chances to use the one he cares about.
       */
      const payment = elements.create("payment", {
        layout: { type: "accordion", defaultCollapsed: true, radios: true, spacedAccordionItems: true },
        wallets: { applePay: "auto", googlePay: "auto" },
      });
      if (cardRef.current) payment.mount(cardRef.current);

      // Wallets: a person who has one is done in two taps. The wallet is asked
      // for the address too, because it is the only address that flow ever has
      // and the order cannot be shipped without one.
      /**
       * The wallet row, built so that it cannot end up empty.
       *
       * Every option below is a request, not a requirement: a Stripe.js that
       * does not know one of them throws, and a throw used to take the whole
       * row with it — which is exactly what "express checkout did not render
       * at all" looks like. So it is created with everything asked for, and
       * if that fails it is created again with nothing but a height, which
       * every version accepts. One of the two always mounts.
       *
       * Whatever goes wrong is reported to the shop, because this is a
       * browser I cannot open from here and a guess about it is worth
       * nothing.
       */
      const makeExpress = (rich: boolean) =>
        elements.create(
          "expressCheckout",
          rich
            ? {
                // Stripe accepts 40–55 here and throws outside it.
                buttonHeight: 55,
                // Every wallet laid out at once. Stripe's default folds them
                // into a "See more" menu, which is how Google Pay ended up
                // hidden on his own checkout.
                /**
                 * `overflow: "never"` is the part that matters — it stops
                 * Stripe folding the buttons into a "See more" menu. The row
                 * and column caps that were here with it are gone: his own
                 * browser reported the element mounting and then never
                 * becoming ready, and that combination is the only thing that
                 * changed between the row working and the row staying blank.
                 */
                layout: { overflow: "never" },
                // "always" means draw it wherever the browser can do it at
                // all, rather than only where Stripe is certain. Link stays on
                // so the row is never empty on a browser with no wallet.
                paymentMethods: { applePay: "always", googlePay: "always", link: "auto" },
                emailRequired: true,
                phoneNumberRequired: store.phoneMode !== "hidden",
                billingAddressRequired: true,
              }
            : { buttonHeight: 55 },
        );

      let express: any = null;
      let built = "rich";
      try {
        express = makeExpress(true);
      } catch (error) {
        built = "minimal";
        report("express-options", error);
        try {
          express = makeExpress(false);
        } catch (fallbackError) {
          built = "none";
          report("express-create", fallbackError);
        }
      }
      report("express-built", built);

      if (express) {
        try {
          express.on("ready", (event: any) => {
            const available = event?.availablePaymentMethods;
            const any = available && Object.values(available).some(Boolean);
            walletsAnsweredRef.current = true;
            if (!cancelled) {
              setWallets(Boolean(any));
              setWalletsAnswered(true);
            }
            report("express-ready", JSON.stringify(available ?? "none"));
          });

          express.on("loaderror", (event: any) => {
            report("express-loaderror", event?.error?.message ?? event);
            if (!cancelled) setWalletsAnswered(true);
          });

          express.on("confirm", async (event: any) => {
            setPayError(null);
            setWorking(true);
            const done = await payWithWallet(event);
            if (!done) setWorking(false);
          });

          if (walletRef.current) {
            express.mount(walletRef.current);
            report("express-mounted", "ok");
          } else {
            report("express-mounted", "no container");
          }

          /**
           * The safety net.
           *
           * If the Express Checkout Element has not reported itself ready
           * within three seconds, the older Payment Request Button is mounted
           * in its place. It is a different element with a different code
           * path inside Stripe, it has existed for years, and his browser
           * reports it as available — so whatever is wrong with the new one,
           * this one still puts a real Google Pay (or Apple Pay, on Safari)
           * button on the page.
           */
          window.setTimeout(() => {
            if (cancelled || walletsAnsweredRef.current) return;
            // Take the silent element off the page first, so the two can
            // never both end up in the row.
            try {
              express.unmount();
            } catch {
              /* it may never have got that far */
            }
            void mountRequestButton(stripe, elements);
          }, 1500);

          /**
           * If Stripe has said nothing at all after five seconds, say so —
           * with what is actually inside the box. "It did not render" is not
           * something I can debug; "mounted, no ready event, zero child
           * nodes" is.
           */
          window.setTimeout(() => {
            if (cancelled) return;
            const node = walletRef.current;
            report(
              "express-timeout",
              JSON.stringify({
                answered: walletsAnsweredRef.current,
                children: node ? node.childElementCount : -1,
                height: node ? Math.round(node.getBoundingClientRect().height) : -1,
                built,
              }),
            );
          }, 5000);
        } catch (error) {
          report("express-mount", error);
          if (!cancelled) setWalletsAnswered(true);
        }
      } else if (!cancelled) {
        setWalletsAnswered(true);
      }

      if (!cancelled) setReady(true);
    };

    boot().catch((bootError: Error) => {
      if (!cancelled) setPayError(bootError.message);
    });

    return () => {
      cancelled = true;
    };
    // Mounted once per page. The amount is kept current by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishableKey]);

  /* Ask for the intent as soon as this page exists. */
  const askForIntent = useCallback(
    async (region: string) => {
      const body = new URLSearchParams();
      if (region) body.set("region", region);
      const res = await fetch("/checkout/intent", { method: "POST", body });
      const data = (await res.json()) as { clientSecret: string | null; error: string | null };
      if (data.clientSecret) {
        setClientSecret((current) => current ?? data.clientSecret);
        setIntentError(null);
      } else if (data.error) {
        setIntentError(data.error);
      }
    },
    [],
  );

  useEffect(() => {
    if (!publishableKey || cart.lines.length === 0) return;
    // The inline boot script fired this request before React existed. Take
    // its answer; only ask again if that script is not there (the other skin,
    // or a browser that blocked it).
    const started = (window as any).__gbPay?.intent as Promise<{ clientSecret: string | null; error: string | null }> | undefined;
    const waiting = started ?? undefined;
    if (waiting) {
      waiting
        .then((data) => {
          if (data?.clientSecret) setClientSecret((current) => current ?? data.clientSecret);
          else if (data?.error) setIntentError(data.error);
        })
        .catch(() => setIntentError("The payment could not be started. Please reload the page."));
      return;
    }
    askForIntent((params.get("region") ?? "").trim()).catch(() =>
      setIntentError("The payment could not be started. Please reload the page."),
    );
    // Once per page: the intent belongs to the cart, not to a render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishableKey]);

  /* The total moved — a discount applied, a quantity changed. The intent is
     moved to the new amount on the server, then the mounted elements are told
     to re-read it, so the wallet sheet can never show yesterday's price. */
  const lastTotal = useRef(cart.totalCents);
  useEffect(() => {
    if (lastTotal.current === cart.totalCents) return;
    lastTotal.current = cart.totalCents;
    setServerTotal(null);
    setRepriced(false);
    // Elements holds the amount itself now, so this is instant and local.
    elementsRef.current?.update?.({ amount: Math.max(50, cart.totalCents) });
    // And the intent is moved in the background, so it is already right when
    // the pay button is pressed.
    void askForIntent((params.get("region") ?? "").trim()).catch(() => undefined);
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
  /**
   * Stripe's original wallet button, used only when the modern one does not
   * appear. It confirms differently — it hands us a payment method rather
   * than driving the confirmation itself — so the order is created first,
   * exactly as everywhere else on this page, and then the payment method is
   * attached to that intent.
   */
  const mountRequestButton = async (stripe: any, elements: any) => {
    try {
      const request = stripe.paymentRequest({
        country: "US",
        currency: (cart.currency ?? "usd").toLowerCase(),
        total: { label: store.name, amount: Math.max(50, cart.totalCents) },
        requestPayerName: true,
        requestPayerEmail: true,
        requestPayerPhone: store.phoneMode !== "hidden",
        requestShipping: false,
      });

      const can = await request.canMakePayment();
      report("prb-can", JSON.stringify(can ?? null));
      if (!can) {
        setWalletsAnswered(true);
        walletsAnsweredRef.current = true;
        return;
      }

      request.on("paymentmethod", async (event: any) => {
        setPayError(null);
        setWorking(true);
        const body = detailsFromForm();
        // The wallet knows the buyer even when the form is empty.
        if (event.payerEmail) body.set("email", event.payerEmail);
        if (event.payerName) {
          const [first, ...rest] = String(event.payerName).split(" ");
          if (first) body.set("firstName", first);
          if (rest.length) body.set("lastName", rest.join(" "));
        }
        if (event.payerPhone) body.set("phone", event.payerPhone);

        const answer = await postDetails(body);
        if (!answer || !("ok" in answer)) {
          event.complete("fail");
          setWorking(false);
          if (answer && "error" in answer && answer.error) setPayError(answer.error);
          return;
        }

        const first = await stripe.confirmCardPayment(
          answer.clientSecret,
          { payment_method: event.paymentMethod.id },
          { handleActions: false },
        );
        if (first.error) {
          event.complete("fail");
          setWorking(false);
          setPayError(first.error.message ?? "The payment did not go through.");
          return;
        }
        event.complete("success");

        // 3-D Secure, if the bank asks for it.
        if (first.paymentIntent?.status === "requires_action") {
          const second = await stripe.confirmCardPayment(answer.clientSecret);
          if (second.error) {
            setWorking(false);
            setPayError(second.error.message ?? "The payment was not completed.");
            return;
          }
        }
        window.location.href = answer.returnTo;
      });

      const button = elements.create("paymentRequestButton", {
        paymentRequest: request,
        style: { paymentRequestButton: { type: "buy", theme: "dark", height: "55px" } },
      });
      if (walletRef.current) {
        button.mount(walletRef.current);
        setWallets(true);
        setWalletsAnswered(true);
        walletsAnsweredRef.current = true;
        report("prb-mounted", "ok");
      }
    } catch (error) {
      report("prb-failed", error);
      setWalletsAnswered(true);
      walletsAnsweredRef.current = true;
    }
  };

  const confirmAfterOrder = async (body: FormData): Promise<boolean> => {
    /**
     * Stripe's own check on its own fields, before an order row exists. With
     * a deferred intent this is required, and it is also the right order: a
     * card that is obviously incomplete should not create an order.
     */
    const submitted = await elementsRef.current?.submit?.();
    if (submitted?.error) {
      setPayError(submitted.error.message ?? "Please check your payment details.");
      return false;
    }

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
      clientSecret: answer.clientSecret,
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
  if (!paymentsReady || !publishableKey) {
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
      <div className="gb-co-split">
        <div className="gb-co__pane">
          <div className="gb-co__pane-in">
            {chrome?.header}
            {stopped}
          </div>
          {chrome?.footer}
        </div>
        <aside className="gb-co__rail" aria-label="Order summary">
          <div className="gb-co__rail-in">{summary}</div>
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
      {/* The space is held from the first paint. Hiding it until Stripe
          answered meant the page visibly jumped when the wallets arrived —
          and when they were slow, it looked like nothing was coming at all.
          It collapses only once Stripe has actually said there are none. */}
      <section
        className={buddy ? "gb-co__express" : undefined}
        style={walletsAnswered && !wallets ? { display: "none" } : undefined}
        aria-label="Express checkout"
      >
        <p className={buddy ? "gb-co__express-lead" : undefined} style={buddy ? undefined : { textAlign: "center" }}>
          Express checkout
        </p>
        <div
          className={buddy ? "gb-co__express-row" : undefined}
          data-waiting={wallets ? undefined : "1"}
          ref={walletRef}
        />
        {buddy ? (
          <p className="gb-co__express-note">
            Pay with the card already on your phone — your address comes with it, so there is
            nothing else to type.
          </p>
        ) : null}
      </section>
      <div
        className={buddy ? "gb-co__or" : undefined}
        style={
          walletsAnswered && !wallets
            ? { display: "none" }
            : buddy
              ? undefined
              : { textAlign: "center", margin: "18px 0" }
        }
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
        "Delivery",
        "Where the order goes, and where the receipt goes.",
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
          <div style={{ height: 9 }} />
          <DeliveryFields
            cn={cn}
            store={store}
            values={values}
            shownError={shownError}
            onField={onField}
            onBlur={onBlur}
          />
        </>,
      )}

      {section(
        "Payment",
        "All transactions are secure and encrypted.",
        <>
          {/* Stripe mounts into the box below. It is never hidden — an element
              with no size measures wrong — so while the secret is on its way
              the waiting state is laid over the top of it. */}
          <div className={buddy ? "gb-co__card" : undefined} style={{ position: "relative", minHeight: buddy ? undefined : 200 }}>
            <div ref={cardRef} />
            {!ready ? (
              <div
                className="gb-co__card--wait"
                style={{ position: "absolute", inset: 0, background: "#fff", borderRadius: 8 }}
                aria-live="polite"
              >
                {intentError ? intentError : <span className="gb-co__skel" />}
              </div>
            ) : null}
          </div>

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

  const scratch = (
    <ScratchCard
      odds={scratchOdds}
      applied={cart.discount?.code ?? null}
      locked={false}
      logoUrl={store.logoUrl}
    />
  );

  /**
   * The right-hand column, on a screen wide enough to have one: what is being
   * bought, the discount, the totals, the card, then the suggestions.
   */
  const rail = (
    <>
      {summary}
      {scratch}
      {under}
    </>
  );

  /**
   * A phone is a different order of business, and he is right that the old one
   * was not a converting one: wallets, then a wall of fields, with the cart,
   * the discount and the card marooned somewhere below the fold.
   *
   * So on a phone the page reads: the wallets, then the scratch card while
   * the mood is good, then a small folded summary carrying the discount box,
   * then the details, then the card — and it ends on the green button. There
   * is nothing underneath it to scroll to, which is the point.
   *
   * Both copies of the card exist in the markup and CSS shows one; the card
   * asks the server for nothing until it is touched, so the copy nobody can
   * see costs nothing and draws nothing.
   */
  return (
    <div className="gb-co-split">
      <div className="gb-co__pane">
        <div className="gb-co__pane-in">
          {chrome?.header}
          {express}
          <div className="gb-co__mobile-only">{scratch}</div>
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
        {chrome?.footer}
      </div>
      <aside className="gb-co__rail" aria-label="Order summary">
        <div className="gb-co__rail-in">{rail}</div>
      </aside>
    </div>
  );
}
