/**
 * The notifications bell reads this.
 *
 * There is no notifications table, and inventing one would mean inventing the
 * rows in it. What already exists is the order timeline — the same events the
 * order screen shows — so the bell reads the most recent of those for the
 * current store. Nothing here is generated: if no order has happened, the
 * list is empty and the bell renders the design's empty state.
 */
import { desc, eq, inArray } from "drizzle-orm";
import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { orderEvents, orders } from "~/db/schema";

export interface Notification {
  id: string;
  text: string;
  time: string;
  color: string;
  to: string;
}

/** The three dot colours the prototype uses for state: healthy, attention, critical. */
function colorFor(type: string): string {
  if (/refund|chargeback|cancel|fail|declin/i.test(type)) return "var(--critical)";
  if (/note|address|edit|hold/i.test(type)) return "#F59E0B";
  return "#22C55E";
}

function ago(at: Date, now: number): string {
  const seconds = Math.max(0, Math.round((now - at.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, notifications: [] as Notification[] };

  const recent = await context.db
    .select({ id: orders.id, number: orders.number })
    .from(orders)
    .where(eq(orders.storeId, store.id))
    .orderBy(desc(orders.createdAt))
    .limit(40);

  let notifications: Notification[] = [];
  if (recent.length) {
    const byId = new Map(recent.map((row: { id: string; number: number }) => [row.id, row.number] as const));
    const rows = await context.db
      .select()
      .from(orderEvents)
      .where(inArray(orderEvents.orderId, recent.map((row: { id: string }) => row.id)))
      .orderBy(desc(orderEvents.at))
      .limit(12);

    const now = Date.now();
    notifications = rows.map((row: typeof orderEvents.$inferSelect) => ({
      id: row.id,
      text: `#${byId.get(row.orderId) ?? ""} · ${row.text}`,
      time: ago(new Date(row.at), now),
      color: colorFor(row.type),
      to: `/admin/orders/${row.orderId}?store=${store.slug}`,
    }));
  }

  return { store: { name: store.name, slug: store.slug }, notifications };
}
