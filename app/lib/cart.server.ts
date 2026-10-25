/**
 * The cart.
 *
 * A cart is a row keyed by a random token in a cookie. It lives in the
 * database rather than only in the cookie so an abandoned cart is something
 * the business can see, and so the price is re-read at checkout from the
 * variant rather than trusted from the browser.
 */
import { eq, and, like, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import { carts, variants, products, stores, discounts, discountRedemptions } from "~/db/schema";
import { taxRateFor } from "./admin.server";
import { applyDiscount, checkDiscount, discountLabel, findDiscount, normaliseCode } from "./discounts.server";
import { offerRefusal } from "./ma-offers.server";

const CART_COOKIE = "kerberos_cart";

/* ------------------------------------------------------------- comeback */

/**
 * The comeback: a customer who left a cart and comes back to it gets $20 off
 * that order (Alex, 2026-10-19: "when people come back and they have stuff in
 * their cart, they should get the comeback 20 dollars off").
 *
 * - The code is minted for one cart: COMEBACK20-<first 8 of the cart id>.
 *   priceCart honours a COMEBACK20 code only on the cart it was minted for, so
 *   a fresh cart, or anybody typing somebody else's, gets nothing.
 * - "Came back" means the cart was left: it has lines, it is open, and either
 *   a recovery email went out for it or nothing in it changed for an hour.
 * - It never stacks: a cart carries one code, and the grant only happens on a
 *   cart with no code on it. It is granted once; removing it keeps it off.
 * - $20 fixed against the goods, so applyDiscount can never take the total
 *   below zero. Single use, once per customer, recorded at payment like any
 *   other code.
 */
export const COMEBACK_PREFIX = "COMEBACK20-";
export const COMEBACK_CENTS = 2000;
export const COMEBACK_LABEL = "Welcome back \u2014 $20 off";
/** Stores that run the comeback. Black Reaper only, as asked. */
export const COMEBACK_STORES = new Set(["reaper"]);
const LEFT_AFTER_MS = 3_600_000;

export function comebackCodeFor(cartId: string): string {
  return COMEBACK_PREFIX + cartId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function isComebackCode(code: string | null | undefined): boolean {
  return Boolean(code && code.trim().toUpperCase().startsWith(COMEBACK_PREFIX));
}

/** The discount row behind a cart's comeback code, made once. */
export async function ensureComebackDiscount(db: DB, storeId: string, cartId: string): Promise<string> {
  const code = comebackCodeFor(cartId);
  await db
    .insert(discounts)
    .values({
      storeId,
      code,
      kind: "fixed",
      value: COMEBACK_CENTS,
      appliesTo: "order",
      usageLimit: 1,
      oncePerCustomer: true,
      active: true,
    })
    .onConflictDoNothing();
  return code;
}

type CartRow = typeof carts.$inferSelect;

/**
 * Puts the comeback on a cart that was left and is being looked at again.
 * Returns the row as it now stands. Does not touch updatedAt, so the recovery
 * timings are not moved by it.
 */
async function grantComeback(db: DB, store: { id: string; slug: string }, row: CartRow, now = new Date()): Promise<CartRow> {
  if (!COMEBACK_STORES.has(store.slug)) return row;
  if (row.status !== "open" || row.discountCode) return row;
  if (!Array.isArray(row.items) || !(row.items as unknown[]).length) return row;
  const left = row.recoveryEmailedAt != null || now.getTime() - new Date(row.updatedAt).getTime() > LEFT_AFTER_MS;
  if (!left) return row;

  const code = comebackCodeFor(row.id);
  const [already] = await db
    .select({ id: discounts.id })
    .from(discounts)
    .where(and(eq(discounts.storeId, store.id), eq(discounts.code, code)))
    .limit(1);
  // Granted once already (and maybe taken off by the customer): leave it.
  if (already) return row;

  // Once per customer, across carts.
  if (row.email) {
    const [used] = await db
      .select({ id: discountRedemptions.id })
      .from(discountRedemptions)
      .innerJoin(discounts, eq(discounts.id, discountRedemptions.discountId))
      .where(
        and(
          eq(discounts.storeId, store.id),
          like(discounts.code, `${COMEBACK_PREFIX}%`),
          eq(discountRedemptions.email, row.email.trim().toLowerCase()),
        ),
      )
      .limit(1);
    if (used) return row;
  }

  await ensureComebackDiscount(db, store.id, row.id);
  const [updated] = await db
    .update(carts)
    .set({ discountCode: code })
    .where(and(eq(carts.id, row.id), sql`${carts.discountCode} is null`))
    .returning();
  return updated ?? row;
}

/** Why a typed comeback code cannot go on this cart, or null when it can (or is not one). */
export async function comebackRefusal(db: DB, storeId: string, token: string | null, code: string): Promise<string | null> {
  if (!isComebackCode(code)) return null;
  const row = await loadCartRow(db, storeId, token);
  return row && normaliseCode(code) === comebackCodeFor(row.id) ? null : "That code is not valid";
}

/** For callers that only hold the token (the add-to-cart route). */
export async function grantComebackFor(db: DB, store: { id: string; slug: string }, token: string | null): Promise<void> {
  if (!COMEBACK_STORES.has(store.slug)) return;
  const row = await loadCartRow(db, store.id, token);
  if (row) await grantComeback(db, store, row);
}

export interface CartLine {
  variantId: string;
  quantity: number;
  /**
   * The bundle price this line was added at, in cents — set by /cart/add
   * when the line came in as part of a bundle. It is only honoured while the
   * cart also holds a line from another product (the thing it was bundled
   * with); on its own the line goes back to the variant's full price.
   */
  bundlePriceCents?: number;
}

export interface PricedLine {
  variantId: string;
  quantity: number;
  label: string;
  sublabel: string | null;
  productTitle: string;
  unitPriceCents: number;
  lineTotalCents: number;
  /**
   * What it was before, and the picture of it — so anything showing a cart
   * can show a real saving and a real photograph rather than a bare number.
   * Null when the variant has no compare-at price and no image of its own.
   */
  compareAtCents: number | null;
  imageUrl: string | null;
}

export interface AppliedDiscount {
  code: string;
  label: string;
  /** total taken off, goods plus shipping */
  amountCents: number;
}

export interface PricedCart {
  token: string;
  lines: PricedLine[];
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  /**
   * Package protection, when the store sells it and the customer chose it.
   * Its own line, priced from the store row, so the intent amount, the order
   * total and the receipt are all the same arithmetic.
   */
  protectionCents: number;
  /** what the store charges for it, whether or not it is taken — null = not sold */
  protectionOfferCents: number | null;
  protectionCopy: string | null;
  protectionChosen: boolean;
  /**
   * Priority shipping. The fee is folded into shippingCents so every payment
   * path that already charges "Shipping" charges it; these say what it is.
   */
  priorityOfferCents: number | null;
  priorityCopy: string | null;
  priorityChosen: boolean;
  /** the part of shippingCents that is the priority fee */
  priorityCents: number;
  totalCents: number;
  currency: string;
  itemCount: number;
  /** null when no code is on the cart, or the stored code no longer applies */
  discount: AppliedDiscount | null;
  /** why a stored code was dropped, in a sentence the customer can act on */
  discountReason: string | null;
}

export function readCartToken(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === CART_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function cartCookie(token: string, url: URL): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${CART_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`;
}

export function newCartToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The token this store may write a cart under.
 *
 * One cookie is shared by every store on a domain — which is normal in dev and
 * on the workers.dev fallback, where several stores answer on one host, and
 * possible in production whenever two stores share a domain. But `carts.token`
 * is unique across the whole table while a cart is looked up by token *and*
 * store, so a token minted on one store looked empty on the next and then
 * collided on insert. The add failed, nothing was written, and the drawer
 * opened saying "Nothing in here yet" with no error anywhere — the customer
 * pressing Add to cart simply watched nothing happen.
 *
 * So: keep the cookie's token when it is free or already this store's, and
 * mint a new one when it belongs to somebody else. The caller writes the
 * returned token straight back to the cookie.
 */
export async function cartTokenForStore(
  db: DB,
  storeId: string,
  token: string | null,
): Promise<string> {
  if (!token) return newCartToken();
  const [row] = await db
    .select({ storeId: carts.storeId })
    .from(carts)
    .where(eq(carts.token, token))
    .limit(1);
  if (!row) return token;
  return row.storeId === storeId ? token : newCartToken();
}

async function loadCartRow(db: DB, storeId: string, token: string | null) {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(carts)
    .where(and(eq(carts.token, token), eq(carts.storeId, storeId)))
    .limit(1);
  if (!row) return null;

  /**
   * A cart that has been paid for is finished. Left as it was, the next visit
   * under the same cookie would find the bought lines still in it and the
   * paid intent still attached — a repeat buyer either got "already taken" or
   * ordered the first purchase twice. The order row keeps the record; this
   * row starts over.
   */
  if (row.status === "converted") {
    const [reset] = await db
      .update(carts)
      .set({
        status: "open",
        items: [],
        orderId: null,
        discountCode: null,
        packageProtection: false,
        shippingPriority: false,
        paymentIntentId: null,
        paymentIntentAmount: null,
        paymentIntentSecret: null,
        // A new cart: the old one's recovery emails are not this one's.
        recoveryEmailedAt: null,
        recoveryStage: null,
        updatedAt: new Date(),
      })
      .where(eq(carts.id, row.id))
      .returning();
    return reset ?? null;
  }
  return row;
}

/**
 * Prices a cart from the database, never from the browser.
 *
 * A line whose variant has been deleted is dropped rather than guessed at,
 * which is why the returned lines can be shorter than what was stored.
 */
export async function priceCart(
  db: DB,
  store: typeof stores.$inferSelect,
  token: string | null,
  /** the shipping state, once checkout knows it — picks a manual state rate */
  region: string | null = null,
  /** false when the system, not the customer, is reading the cart (recovery emails) */
  options: { comeback?: boolean } = {},
): Promise<PricedCart> {
  const loaded = await loadCartRow(db, store.id, token);
  const row = loaded && options.comeback !== false ? await grantComeback(db, store, loaded) : loaded;
  const stored = (row?.items ?? []) as CartLine[];

  const resolved: { line: CartLine; variant: typeof variants.$inferSelect; product: typeof products.$inferSelect }[] = [];
  for (const line of stored) {
    if (!line?.variantId || !Number.isFinite(line.quantity) || line.quantity < 1) continue;

    const [variant] = await db.select().from(variants).where(eq(variants.id, line.variantId)).limit(1);
    if (!variant) continue;

    const [product] = await db.select().from(products).where(eq(products.id, variant.productId)).limit(1);
    if (!product || product.storeId !== store.id) continue;

    resolved.push({ line, variant, product });
  }

  const lines: PricedLine[] = [];
  for (const { line, variant, product } of resolved) {
    // Mysterious Archive sells museum pieces: one of each, whatever the cart says.
    const quantity = Math.min(store.slug === "mysterious-archive" ? 1 : 20, Math.floor(line.quantity));
    // A bundle price holds only while something from another product is in
    // the cart with it. Remove the board and the socks are socks again.
    const bundled =
      Number.isFinite(line.bundlePriceCents) &&
      (line.bundlePriceCents as number) >= 0 &&
      (line.bundlePriceCents as number) < variant.priceCents &&
      resolved.some((other) => other.product.id !== product.id);
    const unitPriceCents = bundled ? (line.bundlePriceCents as number) : variant.priceCents;
    lines.push({
      variantId: variant.id,
      quantity,
      label: variant.label,
      sublabel: variant.sublabel,
      productTitle: product.title,
      unitPriceCents,
      lineTotalCents: unitPriceCents * quantity,
      compareAtCents: bundled ? variant.priceCents : (variant.compareAtCents ?? null),
      imageUrl: variant.imageUrl ?? (store.slug === "mysterious-archive" ? (product.images?.[0]?.url ?? null) : null),
    });
  }

  const subtotalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0);

  // Shipping comes from Settings → Shipping, in this order: always free wins,
  // then the free-over threshold, then the flat rate.
  const baseShippingCents = !lines.length
    ? 0
    : store.shipAlwaysFree
      ? 0
      : store.shipFreeOverCents != null && subtotalCents >= store.shipFreeOverCents
        ? 0
        : store.shipFlatCents;

  // Priority shipping: the price is the store's, the cart row carries only the
  // choice. No lines, no fee. It sits on top of the base rate and no discount
  // touches it, so a free-shipping code cannot make it free.
  const priorityOfferCents =
    store.priorityShipCents != null && store.priorityShipCents > 0 ? store.priorityShipCents : null;
  const priorityChosen = Boolean(row?.shippingPriority) && lines.length > 0 && priorityOfferCents != null;
  const priorityCents = priorityChosen ? (priorityOfferCents as number) : 0;
  const shippingCents = baseShippingCents + priorityCents;

  // The discount is worked out here, from the row in the database, and never
  // taken from the browser. The cart row only ever carries the code as text.
  let discount: AppliedDiscount | null = null;
  let discountReason: string | null = null;
  let discountOrderCents = 0;
  let discountShippingCents = 0;

  if (row?.discountCode && lines.length && isComebackCode(row.discountCode) && normaliseCode(row.discountCode) !== comebackCodeFor(row.id)) {
    // A comeback code belongs to the cart it was minted for, and no other.
    discountReason = "That code is not valid";
  } else if (row?.discountCode && lines.length && normaliseCode(row.discountCode).startsWith("OFFER-") && (discountReason = await offerRefusal(db, store.id, row.discountCode, lines))) {
    // An accepted-offer code is only worth anything on the one piece it was made for.
  } else if (row?.discountCode && lines.length) {
    const found = await findDiscount(db, store.id, row.discountCode);
    const check = checkDiscount(found, {
      subtotalCents,
      email: row.email,
      currency: store.currency,
    });
    if (check.ok) {
      const amounts = applyDiscount(check.discount, { subtotalCents, shippingCents: baseShippingCents });
      discountOrderCents = amounts.orderCents;
      discountShippingCents = amounts.shippingCents;
      discount = {
        code: check.discount.code,
        label: isComebackCode(check.discount.code) ? COMEBACK_LABEL : discountLabel(check.discount, store.currency),
        amountCents: amounts.totalCents,
      };
    } else {
      discountReason = check.reason;
    }
  }

  const discountedSubtotal = Math.max(0, subtotalCents - discountOrderCents);
  const discountedShipping = Math.max(0, baseShippingCents - discountShippingCents) + priorityCents;

  // Package protection. The price is the store's; the cart row only carries
  // the choice. No lines, no protection — there is nothing to protect.
  const protectionOfferCents =
    store.packageProtectionCents != null && store.packageProtectionCents > 0
      ? store.packageProtectionCents
      : null;
  const protectionChosen = Boolean(row?.packageProtection) && lines.length > 0 && protectionOfferCents != null;
  const protectionCents = protectionChosen ? (protectionOfferCents as number) : 0;

  const rate = await taxRateFor(db, store.id, region, store.taxRate ?? 0);
  const taxable = discountedSubtotal + (store.taxOnShipping ? discountedShipping : 0);
  // Tax-inclusive prices already contain the tax; it is backed out for the
  // record rather than added on top.
  const taxCents = store.pricesIncludeTax
    ? taxable - Math.round(taxable / (1 + rate))
    : Math.round(taxable * rate);

  return {
    token: row?.token ?? token ?? "",
    lines,
    subtotalCents,
    taxCents,
    shippingCents,
    protectionCents,
    protectionOfferCents,
    protectionCopy: store.packageProtectionCopy ?? null,
    protectionChosen,
    priorityOfferCents,
    priorityCopy: store.priorityShipCopy ?? null,
    priorityChosen,
    priorityCents,
    totalCents: Math.max(
      0,
      (store.pricesIncludeTax
        ? discountedSubtotal + discountedShipping
        : discountedSubtotal + taxCents + discountedShipping) + protectionCents,
    ),
    currency: store.currency,
    itemCount: lines.reduce((count, line) => count + line.quantity, 0),
    discount,
    discountReason,
  };
}

/**
 * The cart row itself, for callers that need its id — attaching a person to a
 * cart, for one. Returns null when this browser has no cart on this store.
 */
export async function cartRowByToken(db: DB, storeId: string, token: string | null) {
  return loadCartRow(db, storeId, token);
}

/** Writes the cart, creating the row on first use. */
export async function saveCart(
  db: DB,
  storeId: string,
  token: string,
  lines: CartLine[],
): Promise<void> {
  const existing = await loadCartRow(db, storeId, token);
  if (existing) {
    await db
      .update(carts)
      .set({ items: lines, updatedAt: new Date() })
      .where(eq(carts.id, existing.id));
  } else {
    await db.insert(carts).values({ storeId, token, items: lines, status: "open" });
  }
}

/**
 * Puts a code on the cart, or takes it off. Only the text is stored — what it
 * is worth is recomputed by priceCart every time.
 */
export async function setCartDiscount(
  db: DB,
  storeId: string,
  token: string,
  code: string | null,
): Promise<void> {
  const existing = await loadCartRow(db, storeId, token);
  if (existing) {
    await db
      .update(carts)
      .set({ discountCode: code, updatedAt: new Date() })
      .where(eq(carts.id, existing.id));
  } else {
    await db.insert(carts).values({ storeId, token, items: [], status: "open", discountCode: code });
  }
}

/**
 * Records whether the customer wants package protection. Only the choice is
 * written; priceCart reads the price off the store row every time.
 */
export async function setCartProtection(
  db: DB,
  storeId: string,
  token: string,
  wanted: boolean,
): Promise<void> {
  const existing = await loadCartRow(db, storeId, token);
  if (existing) {
    await db
      .update(carts)
      .set({ packageProtection: wanted, updatedAt: new Date() })
      .where(eq(carts.id, existing.id));
  } else {
    await db.insert(carts).values({ storeId, token, items: [], status: "open", packageProtection: wanted });
  }
}

/**
 * Records whether the customer wants priority shipping. Only the choice is
 * written; priceCart reads the price off the store row every time.
 */
export async function setCartPriority(
  db: DB,
  storeId: string,
  token: string,
  wanted: boolean,
): Promise<void> {
  const existing = await loadCartRow(db, storeId, token);
  if (existing) {
    await db
      .update(carts)
      .set({ shippingPriority: wanted, updatedAt: new Date() })
      .where(eq(carts.id, existing.id));
  } else {
    await db.insert(carts).values({ storeId, token, items: [], status: "open", shippingPriority: wanted });
  }
}

export async function cartDiscountCode(
  db: DB,
  storeId: string,
  token: string | null,
): Promise<string | null> {
  const row = await loadCartRow(db, storeId, token);
  return row?.discountCode ?? null;
}

export async function currentLines(db: DB, storeId: string, token: string | null): Promise<CartLine[]> {
  const row = await loadCartRow(db, storeId, token);
  return ((row?.items ?? []) as CartLine[]).filter(
    (line) => line?.variantId && Number.isFinite(line.quantity) && line.quantity > 0,
  );
}

export function addLine(
  lines: CartLine[],
  variantId: string,
  quantity = 1,
  /** the bundle price this add carries, when it came in as part of a bundle */
  bundlePriceCents?: number,
): CartLine[] {
  const next = lines.map((line) => ({ ...line }));
  const found = next.find((line) => line.variantId === variantId);
  if (found) {
    found.quantity = Math.min(20, found.quantity + quantity);
    if (bundlePriceCents != null) found.bundlePriceCents = bundlePriceCents;
  } else {
    next.push({ variantId, quantity: Math.min(20, quantity), ...(bundlePriceCents != null ? { bundlePriceCents } : {}) });
  }
  return next;
}

export function setLineQuantity(lines: CartLine[], variantId: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.variantId !== variantId);
  return lines.map((line) =>
    line.variantId === variantId ? { ...line, quantity: Math.min(20, quantity) } : line,
  );
}

export async function markCartConverted(
  db: DB,
  storeId: string,
  token: string,
  orderId: string,
): Promise<void> {
  await db
    .update(carts)
    .set({ status: "converted", orderId, updatedAt: new Date() })
    .where(and(eq(carts.token, token), eq(carts.storeId, storeId)));
}

/**
 * The PaymentIntent this cart is paying with.
 *
 * Checkout is one page, so the intent is made when the page loads rather than
 * when the details are submitted. Keeping its id on the cart row is what makes
 * a reload reuse the intent it already has: the amount is updated when the
 * total moves, and Stripe is not left holding an abandoned intent per refresh.
 */
export async function cartPaymentIntentId(
  db: DB,
  storeId: string,
  token: string | null,
): Promise<string | null> {
  const row = await loadCartRow(db, storeId, token);
  return row?.paymentIntentId ?? null;
}

export async function setCartPaymentIntentId(
  db: DB,
  storeId: string,
  token: string,
  intentId: string | null,
  /** what that intent is worth and how the browser pays it, when known */
  known?: { amountCents: number; clientSecret: string } | null,
): Promise<void> {
  const fields = {
    paymentIntentId: intentId,
    paymentIntentAmount: known?.amountCents ?? null,
    paymentIntentSecret: known?.clientSecret ?? null,
  };
  const existing = await loadCartRow(db, storeId, token);
  if (existing) {
    await db
      .update(carts)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(carts.id, existing.id));
  } else {
    await db.insert(carts).values({ storeId, token, items: [], status: "open", ...fields });
  }
}

/**
 * The intent this cart already has, with what it is worth. When the amount
 * still matches the cart's total there is nothing to ask Stripe.
 */
export async function cartIntentState(
  db: DB,
  storeId: string,
  token: string | null,
): Promise<{ id: string | null; amountCents: number | null; clientSecret: string | null; updatedAt: Date | null }> {
  const row = await loadCartRow(db, storeId, token);
  return {
    id: row?.paymentIntentId ?? null,
    amountCents: row?.paymentIntentAmount ?? null,
    clientSecret: row?.paymentIntentSecret ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

/**
 * The payment on this cart already went through, so the cart is finished —
 * wherever we find that out.
 *
 * Normally the thank-you page closes it. When the customer never lands there
 * (the sheet dismissed on the redirect, the tab closed, the connection
 * dropped) the cart would otherwise keep the paid intent forever, and every
 * later visit would be told the payment had already been taken with the
 * bought items still sitting in the basket.
 */
export async function closeCartForPaidIntent(
  db: DB,
  storeId: string,
  token: string | null,
  intentId: string,
): Promise<void> {
  if (!token) return;
  await db
    .update(carts)
    .set({ status: "converted", updatedAt: new Date() })
    .where(and(eq(carts.token, token), eq(carts.storeId, storeId), eq(carts.paymentIntentId, intentId)));
}
