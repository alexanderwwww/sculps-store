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
  return row ?? null;
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
    totalCents: Math.max(
      0,
      store.pricesIncludeTax
        ? discountedSubtotal + discountedShipping
        : discountedSubtotal + taxCents + discountedShipping,
    ),
    currency: store.currency,
    itemCount: lines.reduce((count, line) => count + line.quantity, 0),
    discount,
    discountReason,
  };
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
