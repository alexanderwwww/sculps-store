/**
 * After the box arrives.
 *
 * Two emails nobody has to remember to send. A few days after an order is
 * marked shipped -- the store's own estimate, not a guess -- "it's at your
 * door, here's the setup", with the steps for exactly what was in the box.
 * Four days after that, one line asking how it is going, with a link to
 * the reviews. Each is sent once, ever, per order; the order's own timeline
 * is the record of that, so a Worker that runs twice sends nothing twice.
 *
 * There is no carrier webhook telling us the parcel landed, so "delivered"
 * means "shipped long enough ago that it has". The window is deliberately
 * generous: an email that arrives a day after the box is a reminder; one
 * that arrives a day before it is a lie.
 */
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { makeDb } from "../db/client";
import { orders, orderItems, orderEvents, stores, variants, products } from "../db/schema";
import { emailReady, sendDeliveredSetupEmail, sendReviewRequestEmail } from "./email.server";

type DB = ReturnType<typeof makeDb>;
type Env = Parameters<typeof emailReady>[0];

const DAY = 24 * 60 * 60 * 1000;
/** shipped this long ago counts as delivered */
const DELIVERED_AFTER_DAYS = 6;
/** and this long after that, the review ask */
const REVIEW_AFTER_DAYS = 4;

export interface AftercareSummary {
  delivered: number;
  reviews: number;
  failed: number;
  reasons: string[];
}

async function alreadySent(db: DB, orderId: string, type: string): Promise<boolean> {
  const [row] = await db
    .select({ id: orderEvents.id })
    .from(orderEvents)
    .where(and(eq(orderEvents.orderId, orderId), eq(orderEvents.type, type)))
    .limit(1);
  return Boolean(row);
}

/** The product handles behind an order's lines, in line order. */
async function handlesFor(db: DB, orderId: string) {
  return db
    .select({
      handle: products.handle,
      label: orderItems.label,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .innerJoin(variants, eq(variants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(orderItems.orderId, orderId));
}

export async function runAftercare(db: DB, env: Env, now = new Date()): Promise<AftercareSummary> {
  const summary: AftercareSummary = { delivered: 0, reviews: 0, failed: 0, reasons: [] };
  if (!emailReady(env)) {
    summary.reasons.push("No Resend API key on the Worker — nothing was sent.");
    return summary;
  }

  const rows = await db
    .select({ order: orders, store: stores })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(
      and(
        eq(orders.paymentStatus, "paid"),
        isNotNull(orders.fulfilledAt),
        lt(orders.fulfilledAt, new Date(now.getTime() - DELIVERED_AFTER_DAYS * DAY)),
        // Nothing older than a month: that is not aftercare, it is a cold email.
        sql`${orders.fulfilledAt} > ${new Date(now.getTime() - 30 * DAY)}`,
        isNotNull(orders.email),
      ),
    )
    .limit(50);

  for (const { order, store } of rows) {
    const brand = {
      domain: store.domain,
      logoUrl: store.logoUrl,
      to: order.email,
      customerName: order.customerName,
      storeName: store.name,
      fromAddress: store.emailFrom,
      replyTo: store.contactEmail,
      orderNumber: order.number,
    };
    const shippedAgo = now.getTime() - (order.fulfilledAt as Date).getTime();

    try {
      if (!(await alreadySent(db, order.id, "email:delivered"))) {
        const lines = await handlesFor(db, order.id);
        if (!lines.length) continue;
        const ok = await sendDeliveredSetupEmail(db, env, order.id, { ...brand, products: lines });
        if (ok) summary.delivered += 1; else summary.failed += 1;
        continue; // the review ask waits for its own day
      }
      if (
        shippedAgo > (DELIVERED_AFTER_DAYS + REVIEW_AFTER_DAYS) * DAY &&
        !(await alreadySent(db, order.id, "email:review")) &&
        !(await alreadySent(db, order.id, "email:skipped"))
      ) {
        const [first] = await handlesFor(db, order.id);
        if (!first) continue;
        const ok = await sendReviewRequestEmail(db, env, order.id, {
          ...brand,
          productHandle: first.handle,
          productLabel: first.label,
        });
        if (ok) summary.reviews += 1; else summary.failed += 1;
      }
    } catch (error) {
      summary.failed += 1;
      summary.reasons.push(`#${order.number}: ${String((error as Error)?.message ?? error).slice(0, 120)}`);
    }
  }
  return summary;
}
