/**
 * "Something sold" — delivered to every browser he has signed up.
 *
 * Deliberately never throws: a push service having a bad day must not take
 * down a Stripe webhook, because a webhook that 500s is a webhook Stripe
 * retries and eventually gives up on, and the order matters more than the
 * ping.
 */
import { eq, inArray } from "drizzle-orm";
import type { makeDb } from "../db/client";
import { pushSubscriptions } from "../db/schema";
import { sendPush, type PushMessage } from "./push.server";

export async function notifyAdmins(
  db: ReturnType<typeof makeDb>,
  env: Env,
  message: PushMessage,
): Promise<void> {
  try {
    const rows = await db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions);
    if (rows.length === 0) return;

    const dead: string[] = [];
    await Promise.all(
      rows.map(async (row) => {
        try {
          const status = await sendPush(env, row, message);
          // 404/410 is the push service saying this browser is gone for good.
          if (status === 404 || status === 410) dead.push(row.id);
        } catch {
          /* one dead endpoint must not stop the others */
        }
      }),
    );

    if (dead.length > 0) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
    } else {
      await db
        .update(pushSubscriptions)
        .set({ lastSentAt: new Date() })
        .where(eq(pushSubscriptions.id, rows[0]!.id));
    }
  } catch {
    /* never let a notification break the thing that caused it */
  }
}

/** Money the way a person reads it, for the notification line. */
export const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
