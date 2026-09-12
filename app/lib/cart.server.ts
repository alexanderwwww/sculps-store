/**
 * The cart.
 *
 * A cart is a row keyed by a random token in a cookie. It lives in the
 * database rather than only in the cookie so an abandoned cart is something
 * the business can see, and so the price is re-read at checkout from the
 * variant rather than trusted from the browser.
 */
import { eq, and } from "drizzle-orm";
import type { DB } from "~/db/client";
import { carts, variants, products, stores } from "~/db/schema";
import { taxRateFor } from "./admin.server";
import { applyDiscount, checkDiscount, discountLabel, findDiscount } from "./discounts.server";

const CART_COOKIE = "kerberos_cart";

export interface CartLine {
  variantId: string;
  quantity: number;
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
        paymentIntentId: null,
        paymentIntentAmount: null,
        paymentIntentSecret: null,
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
): Promise<PricedCart> {
  const row = await loadCartRow(db, store.id, token);
  const stored = (row?.items ?? []) as CartLine[];

  const lines: PricedLine[] = [];
  for (const line of stored) {
    if (!line?.variantId || !Number.isFinite(line.quantity) || line.quantity < 1) continue;

    const [variant] = await db.select().from(variants).where(eq(variants.id, line.variantId)).limit(1);
    if (!variant) continue;

    const [product] = await db.select().from(products).where(eq(products.id, variant.productId)).limit(1);
    if (!product || product.storeId !== store.id) continue;

    const quantity = Math.min(20, Math.floor(line.quantity));
    lines.push({
      variantId: variant.id,
      quantity,
      label: variant.label,
      sublabel: variant.sublabel,
      productTitle: product.title,
      unitPriceCents: variant.priceCents,
      lineTotalCents: variant.priceCents * quantity,
      compareAtCents: variant.compareAtCents ?? null,
      imageUrl: variant.imageUrl ?? null,
    });
  }

  const subtotalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0);

  // Shipping comes from Settings → Shipping, in this order: always free wins,
  // then the free-over threshold, then the flat rate.
  const shippingCents = !lines.length
    ? 0
    : store.shipAlwaysFree
      ? 0
      : store.shipFreeOverCents != null && subtotalCents >= store.shipFreeOverCents
        ? 0
        : store.shipFlatCents;

  // The discount is worked out here, from the row in the database, and never
  // taken from the browser. The cart row only ever carries the code as text.
  let discount: AppliedDiscount | null = null;
  let discountReason: string | null = null;
  let discountOrderCents = 0;
  let discountShippingCents = 0;

  if (row?.discountCode && lines.length) {
    const found = await findDiscount(db, store.id, row.discountCode);
    const check = checkDiscount(found, {
      subtotalCents,
      email: row.email,
      currency: store.currency,
    });
    if (check.ok) {
      const amounts = applyDiscount(check.discount, { subtotalCents, shippingCents });
      discountOrderCents = amounts.orderCents;
      discountShippingCents = amounts.shippingCents;
      discount = {
        code: check.discount.code,
        label: discountLabel(check.discount, store.currency),
        amountCents: amounts.totalCents,
      };
    } else {
      discountReason = check.reason;
    }
  }

  const discountedSubtotal = Math.max(0, subtotalCents - discountOrderCents);
  const discountedShipping = Math.max(0, shippingCents - discountShippingCents);

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

export function addLine(lines: CartLine[], variantId: string, quantity = 1): CartLine[] {
  const next = lines.map((line) => ({ ...line }));
  const found = next.find((line) => line.variantId === variantId);
  if (found) {
    found.quantity = Math.min(20, found.quantity + quantity);
  } else {
    next.push({ variantId, quantity: Math.min(20, quantity) });
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
