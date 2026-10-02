/**
 * Klarna / Affirm orders that never came back.
 *
 * The order is only marked paid when the customer returns to
 * /checkout/bnpl. Somebody who approves at Klarna and closes the tab has paid
 * and would be left pending forever, with no receipt and nothing shipped. The
 * cron asks Stripe about every pending pay-over-time order between ten
 * minutes and three days old and settles it the same way the return page
 * would: paid on `succeeded`, failed when the attempt is dead.
 */
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import { orders } from "~/db/schema";
import { bnplFor, readBnplIntent } from "./bnpl.server";
import { markOrderPaid } from "./admin.server";
import { afterPaymentConfirmed } from "./fulfilment.server";

export async function reconcileBnpl(db: DB, env: Env) {
  const now = Date.now();
  const pending = await db
    .select({ id: orders.id, storeId: orders.storeId, ref: orders.paymentRef, createdAt: orders.createdAt })
    .from(orders)
    .where(
      and(
        eq(orders.paymentProvider, "stripe_bnpl"),
        eq(orders.paymentStatus, "pending"),
        lt(orders.createdAt, new Date(now - 10 * 60_000)),
        gt(orders.createdAt, new Date(now - 3 * 24 * 60 * 60_000)),
      ),
    )
    // Newest first, so a pile of abandoned attempts never pushes a paid one out.
    .orderBy(desc(orders.createdAt))
    .limit(200);

  const summary = { checked: 0, paid: 0, failed: 0 };
  const accounts = new Map<string, Awaited<ReturnType<typeof bnplFor>>>();
  for (const o of pending) {
    if (!o.ref) continue;
    if (!accounts.has(o.storeId)) accounts.set(o.storeId, await bnplFor(db, env, o.storeId).catch(() => null));
    const account = accounts.get(o.storeId);
    if (!account) continue;
    summary.checked++;
    let intent;
    try {
      intent = await readBnplIntent(account, o.ref);
    } catch {
      continue;
    }
    if (intent.status === "succeeded") {
      if (await markOrderPaid(db, o.id, `Payment confirmed by Stripe (Aigis LLC) · ${intent.id} · found by the scheduled check`)) {
        summary.paid++;
        await afterPaymentConfirmed(db, env, o.id).catch(() => undefined);
      }
      continue;
    }
    const ageHours = (now - new Date(o.createdAt).getTime()) / 3_600_000;
    const dead = intent.status === "canceled" || (ageHours > 24 && (intent.status === "requires_payment_method" || intent.status === "requires_action"));
    if (dead) {
      await db
        .update(orders)
        .set({ paymentStatus: "failed", updatedAt: new Date() })
        .where(and(eq(orders.id, o.id), sql`${orders.paymentStatus} = 'pending'`));
      summary.failed++;
    }
  }
  return summary;
}
