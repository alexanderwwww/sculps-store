/**
 * Square orders that never came back.
 *
 * The order is only marked paid when the customer returns to /checkout/square.
 * Somebody who pays on Square's page and closes the tab has paid and would be
 * left pending forever, with no receipt and nothing shipped. The cron asks
 * Square about every unpaid Square order between ten minutes and three days
 * old — including ones the return page marked failed because the payment had
 * not landed yet — and settles it the same way the return page would.
 */
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import { orders } from "~/db/schema";
import { squareFor, readSquareOrder } from "./square.server";
import { markOrderPaid, recordOrderEvent } from "./admin.server";
import { afterPaymentConfirmed } from "./fulfilment.server";

export async function reconcileSquare(db: DB, env: Env) {
  const now = Date.now();
  const pending = await db
    .select({ id: orders.id, storeId: orders.storeId, ref: orders.paymentRef, total: orders.totalCents })
    .from(orders)
    .where(
      and(
        eq(orders.paymentProvider, "square"),
        sql`${orders.paymentStatus} in ('pending','failed')`,
        lt(orders.createdAt, new Date(now - 10 * 60_000)),
        gt(orders.createdAt, new Date(now - 3 * 24 * 60 * 60_000)),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(200);

  const summary = { checked: 0, paid: 0 };
  const accounts = new Map<string, Awaited<ReturnType<typeof squareFor>>>();
  for (const o of pending) {
    if (!o.ref || o.ref.startsWith("square:pending:")) continue;
    if (!accounts.has(o.storeId)) accounts.set(o.storeId, await squareFor(db, env, o.storeId).catch(() => null));
    const account = accounts.get(o.storeId);
    if (!account) continue;
    summary.checked++;
    let settled;
    try {
      settled = await readSquareOrder(account, o.ref);
    } catch {
      continue;
    }
    if (!settled.paid) continue;
    if (settled.amountCents !== o.total) {
      await recordOrderEvent(
        db,
        o.id,
        "payment:mismatch",
        `Square took ${((settled.amountCents ?? 0) / 100).toFixed(2)} but the order was ${(o.total / 100).toFixed(2)}. Check before shipping.`,
      ).catch(() => undefined);
      continue;
    }
    if (await markOrderPaid(db, o.id, `Payment confirmed by Square · ${settled.paymentId} · found by the scheduled check`)) {
      summary.paid++;
      await afterPaymentConfirmed(db, env, o.id).catch(() => undefined);
    }
  }
  return summary;
}
