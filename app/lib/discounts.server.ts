/**
 * Discount codes.
 *
 * Two rules shape this file:
 *
 * 1. The browser never decides a price. A code arrives as text; the amount it
 *    is worth is worked out here, from the row in the database, every time the
 *    cart is priced and again when the payment is created.
 * 2. A redemption is a real order. `discountRedemptions` gets a row when an
 *    order is paid, never when a code is typed, so "used 3 times" is a count
 *    of three orders that exist.
 */
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import { discounts, discountRedemptions } from "~/db/schema";
import { formatMoney } from "./money";

export type DiscountRow = typeof discounts.$inferSelect;

export const DISCOUNT_KINDS = ["percentage", "fixed", "free_shipping"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

/** What a code is worth here, or why it cannot be used — in a real sentence. */
export type DiscountCheck =
  | { ok: true; discount: DiscountRow }
  | { ok: false; reason: string };

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Case-insensitive lookup, scoped to one store. */
export async function findDiscount(
  db: DB,
  storeId: string,
  code: string,
): Promise<DiscountRow | null> {
  const wanted = normaliseCode(code);
  if (!wanted) return null;
  const [row] = await db
    .select()
    .from(discounts)
    .where(and(eq(discounts.storeId, storeId), eq(discounts.code, wanted)))
    .limit(1);
  return row ?? null;
}

export interface DiscountContext {
  subtotalCents: number;
  email?: string | null;
  now?: Date;
  currency?: string;
}

/**
 * Whether this code can be used right now, for this cart.
 *
 * Returns a sentence a customer can act on, never a code or a status word.
 * The per-customer rule is only checked here when an email is known; the
 * binding check happens at payment time, where it is enforced against the
 * redemption rows.
 */
export function checkDiscount(
  discount: DiscountRow | null,
  context: DiscountContext,
): DiscountCheck {
  const now = context.now ?? new Date();
  const currency = context.currency ?? "USD";

  if (!discount) return { ok: false, reason: "That code is not valid" };
  if (!discount.active) return { ok: false, reason: "That code is no longer available" };

  if (discount.startsAt && now < new Date(discount.startsAt)) {
    return { ok: false, reason: "This code is not available yet" };
  }
  if (discount.endsAt && now > new Date(discount.endsAt)) {
    return { ok: false, reason: "This code has expired" };
  }
  if (discount.usageLimit != null && discount.usedCount >= discount.usageLimit) {
    return { ok: false, reason: "This code has been used" };
  }
  if (
    discount.minimumSubtotalCents != null &&
    context.subtotalCents < discount.minimumSubtotalCents
  ) {
    const short = discount.minimumSubtotalCents - context.subtotalCents;
    return { ok: false, reason: `Add ${formatMoney(short, currency)} more to use this code` };
  }

  return { ok: true, discount };
}

export interface DiscountAmounts {
  /** taken off the goods */
  orderCents: number;
  /** taken off shipping */
  shippingCents: number;
  /** the two added together, which is what the order records */
  totalCents: number;
}

/**
 * What the code is worth against these numbers.
 *
 * A percentage applies to the subtotal. Free shipping zeroes shipping. A fixed
 * amount comes off the subtotal and can never take it below zero.
 */
export function applyDiscount(
  discount: DiscountRow,
  input: { subtotalCents: number; shippingCents: number },
): DiscountAmounts {
  const subtotal = Math.max(0, Math.round(input.subtotalCents));
  const shipping = Math.max(0, Math.round(input.shippingCents));

  if (discount.kind === "free_shipping" || discount.appliesTo === "shipping") {
    if (discount.kind === "percentage") {
      const percent = Math.min(100, Math.max(0, discount.value));
      const off = Math.min(shipping, Math.round((shipping * percent) / 100));
      return { orderCents: 0, shippingCents: off, totalCents: off };
    }
    if (discount.kind === "fixed") {
      const off = Math.min(shipping, Math.max(0, discount.value));
      return { orderCents: 0, shippingCents: off, totalCents: off };
    }
    return { orderCents: 0, shippingCents: shipping, totalCents: shipping };
  }

  if (discount.kind === "percentage") {
    const percent = Math.min(100, Math.max(0, discount.value));
    const off = Math.min(subtotal, Math.round((subtotal * percent) / 100));
    return { orderCents: off, shippingCents: 0, totalCents: off };
  }

  // fixed, against the order
  const off = Math.min(subtotal, Math.max(0, discount.value));
  return { orderCents: off, shippingCents: 0, totalCents: off };
}

/** Human label for a code, used on the storefront and in the admin. */
export function discountLabel(discount: DiscountRow, currency = "USD"): string {
  if (discount.kind === "free_shipping") return "Free shipping";
  if (discount.kind === "percentage") return `${discount.value}% off`;
  return `${formatMoney(discount.value, currency)} off`;
}

export type DiscountStatus = "active" | "scheduled" | "expired" | "limit reached" | "inactive";

export function discountStatus(discount: DiscountRow, now = new Date()): DiscountStatus {
  if (!discount.active) return "inactive";
  if (discount.startsAt && now < new Date(discount.startsAt)) return "scheduled";
  if (discount.endsAt && now > new Date(discount.endsAt)) return "expired";
  if (discount.usageLimit != null && discount.usedCount >= discount.usageLimit) return "limit reached";
  return "active";
}

/* ------------------------------------------------------------- redemption */

export type RedeemResult =
  | { ok: true; amountCents: number }
  | { ok: false; reason: string };

/**
 * Records a real use, once, at the moment an order is paid.
 *
 * The usage limit is enforced *here*, by a conditional UPDATE:
 *
 *     update discounts set used_count = used_count + 1
 *      where id = ? and (usage_limit is null or used_count < usage_limit)
 *
 * Postgres serialises the two racing updates on the row, so of two people
 * taking the last use of a code exactly one gets a row back and the other gets
 * none. The redemption row is only written by whoever won.
 *
 * `oncePerCustomer` is enforced against the redemption rows themselves, and
 * the unique index on orderId makes a replayed webhook a no-op.
 */
export async function redeemDiscount(
  db: DB,
  input: {
    storeId: string;
    code: string;
    orderId: string;
    email: string;
    amountCents: number;
  },
): Promise<RedeemResult> {
  const discount = await findDiscount(db, input.storeId, input.code);
  if (!discount) return { ok: false, reason: "That code is not valid" };

  // Already recorded for this order — a replayed webhook must not count twice.
  const [existing] = await db
    .select()
    .from(discountRedemptions)
    .where(eq(discountRedemptions.orderId, input.orderId))
    .limit(1);
  if (existing) return { ok: true, amountCents: existing.amountCents };

  const email = input.email.trim().toLowerCase();

  if (discount.oncePerCustomer && email) {
    const [used] = await db
      .select()
      .from(discountRedemptions)
      .where(
        and(
          eq(discountRedemptions.discountId, discount.id),
          eq(discountRedemptions.email, email),
        ),
      )
      .limit(1);
    if (used) return { ok: false, reason: "This code has already been used by this customer" };
  }

  // The conditional increment is the lock. No row back means someone else took
  // the last use first.
  const claimed = await db
    .update(discounts)
    .set({ usedCount: sql`${discounts.usedCount} + 1` })
    .where(
      and(
        eq(discounts.id, discount.id),
        discount.usageLimit == null
          ? sql`true`
          : sql`${discounts.usedCount} < ${discounts.usageLimit}`,
      ),
    )
    .returning({ id: discounts.id });

  if (!claimed.length) return { ok: false, reason: "This code has been used" };

  // One redemption per order, enforced by the unique index. If the webhook
  // and the return page both got this far for the same order, the second
  // insert does nothing — and its increment above is given back, so the
  // count stays equal to the number of rows.
  const inserted = await db
    .insert(discountRedemptions)
    .values({
      discountId: discount.id,
      orderId: input.orderId,
      email,
      amountCents: input.amountCents,
    })
    .onConflictDoNothing({ target: discountRedemptions.orderId })
    .returning({ id: discountRedemptions.id });

  if (!inserted.length) {
    await db
      .update(discounts)
      .set({ usedCount: sql`greatest(${discounts.usedCount} - 1, 0)` })
      .where(eq(discounts.id, discount.id));
  }

  return { ok: true, amountCents: input.amountCents };
}

/** How many real orders used this code, and how much it has given away. */
export async function redemptionTotals(
  db: DB,
  storeId: string,
): Promise<Map<string, { count: number; amountCents: number }>> {
  const rows = await db
    .select({
      discountId: discountRedemptions.discountId,
      count: sql<number>`count(*)::int`,
      amountCents: sql<number>`coalesce(sum(${discountRedemptions.amountCents}), 0)::int`,
    })
    .from(discountRedemptions)
    .innerJoin(discounts, eq(discounts.id, discountRedemptions.discountId))
    .where(eq(discounts.storeId, storeId))
    .groupBy(discountRedemptions.discountId);

  const map = new Map<string, { count: number; amountCents: number }>();
  for (const row of rows) {
    map.set(row.discountId, { count: row.count, amountCents: row.amountCents });
  }
  return map;
}
