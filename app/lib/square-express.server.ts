/**
 * Express checkout on Square: the order is made after the money, not before.
 *
 * Nothing is typed on our page for an express checkout — the customer taps
 * the button under Buy now and Square's own page takes the card, Apple Pay,
 * Google Pay or Cash App and asks for the shipping address. So there is no
 * customer to write a pending order for. The whole cart travels on the Square
 * order itself (lines, shipping, tax, protection, discount) and this turns a
 * paid Square order back into one of ours.
 *
 * Two things can find a paid express order: the customer coming back to the
 * site, and the scheduled check for the customer who paid and closed the tab.
 * The unique index on a Square payment reference means they can race safely —
 * the second insert simply fails and finds the first.
 */
import { eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import { orders as ordersTable } from "~/db/schema";
import { placeOrder, markOrderPaid, recordOrderEvent, orderByPaymentRef } from "./admin.server";
import { afterPaymentConfirmed } from "./fulfilment.server";
import { readSquareOrder, type SquareAccount } from "./square.server";

export interface ExpressContext {
  db: DB;
  env: Env;
  storeId: string;
  currency: string;
  account: SquareAccount;
  /** present on a return to the site; absent for the scheduled check */
  request?: Request;
  geo?: { lat: number | null; lon: number | null };
  meta?: { fbp: string | null; fbc: string | null; eventId: string };
  source?: string | null;
  campaign?: string | null;
  after?: (orderId: string) => void;
}

/**
 * Our order for this paid express Square order, creating it when it does not
 * exist yet. Null when Square has not been paid or the order is not an
 * express order of this store.
 */
export async function settleExpressOrder(
  ctx: ExpressContext,
  squareOrderId: string,
): Promise<{ orderId: string; created: boolean } | null> {
  const settled = await readSquareOrder(ctx.account, squareOrderId);
  if (!settled.paid) return null;
  const sq = settled.order;
  if (sq.metadata.express !== "1" || sq.metadata.storeId !== ctx.storeId) return null;

  const existing = await orderByPaymentRef(ctx.db, squareOrderId);
  if (existing) {
    // Created by the other path a moment ago; make sure it is marked paid.
    await markOrderPaid(ctx.db, existing.id, `Payment confirmed by Square · ${settled.paymentId}`);
    return { orderId: existing.id, created: false };
  }

  // An express order is built from lines that carry their variant. One that
  // does not is not ours to rebuild.
  if (!sq.lines.length || sq.lines.some((line) => !line.variantId)) return null;

  const subtotalCents = sq.lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const buyer = sq.buyer;
  let created;
  try {
    created = await placeOrder(ctx.db, {
      storeId: ctx.storeId,
      customerName: buyer.name,
      email: buyer.email,
      phone: buyer.phone,
      address1: buyer.line1,
      address2: buyer.line2,
      marketingConsent: false,
      city: buyer.city,
      region: buyer.state,
      postalCode: buyer.postalCode,
      country: buyer.country ?? "US",
      subtotalCents,
      discountCode: sq.metadata.code || null,
      discountCents: sq.discountCents,
      shippingCents: sq.shippingCents,
      taxCents: sq.taxCents,
      totalCents: sq.totalCents,
      currency: ctx.currency,
      paymentProvider: "square",
      paymentRef: squareOrderId,
      paymentStatus: "pending",
      source: ctx.source ?? null,
      campaign: ctx.campaign ?? null,
      metaEventId: ctx.meta?.eventId ?? crypto.randomUUID(),
      fbp: ctx.meta?.fbp ?? null,
      fbc: ctx.meta?.fbc ?? null,
      lat: ctx.geo?.lat ?? null,
      lon: ctx.geo?.lon ?? null,
      lines: sq.lines.map((line) => ({
        variantId: line.variantId as string,
        title: line.name,
        label: line.label ?? "",
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
      })),
    });
  } catch (error) {
    // The other path inserted first. Use its order.
    const raced = await orderByPaymentRef(ctx.db, squareOrderId);
    if (raced) return { orderId: raced.id, created: false };
    throw error;
  }

  if (sq.protectionCents > 0) {
    await ctx.db.update(ordersTable).set({ protectionCents: sq.protectionCents }).where(eq(ordersTable.id, created.id));
  }

  if (sq.priorityCents > 0) {
    await ctx.db.update(ordersTable).set({ shippingMethod: "priority" }).where(eq(ordersTable.id, created.id));
  }

  if (settled.amountCents !== sq.totalCents) {
    await recordOrderEvent(
      ctx.db,
      created.id,
      "payment:mismatch",
      `Square took ${((settled.amountCents ?? 0) / 100).toFixed(2)} but the order was ${(sq.totalCents / 100).toFixed(2)}. Check before shipping.`,
    ).catch(() => undefined);
  }
  if (!buyer.line1 || !buyer.email) {
    await recordOrderEvent(
      ctx.db,
      created.id,
      "wallet:incomplete",
      "Paid by express checkout on Square, but Square did not give a full address or email. Look the order up in Square and message the customer before shipping.",
    ).catch(() => undefined);
  }

  if (await markOrderPaid(ctx.db, created.id, `Payment confirmed by Square · ${settled.paymentId}`)) {
    ctx.after?.(created.id);
  }
  return { orderId: created.id, created: true };
}

/** Receipt, merchant alert, Meta — the same follow-through every payment gets. */
export function afterExpress(ctx: ExpressContext, orderId: string) {
  return afterPaymentConfirmed(ctx.db, ctx.env, orderId, ctx.request).catch(() => undefined);
}
