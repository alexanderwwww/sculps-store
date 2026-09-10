/**
 * The admin layout. Everything under /admin passes through here, which means
 * the sign-in check happens in exactly one place.
 */
import { Outlet, useLocation } from "react-router";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import type { Route } from "./+types/admin";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { orders, orderEvents, products, reviews } from "~/db/schema";
import { AdminShell } from "~/admin/shell";
import adminHref from "~/admin/admin.css?url";

export function links() {
  return [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;550;600;650;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
    },
    { rel: "stylesheet", href: adminHref },
  ];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const user = await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store, all } = await resolveAdminStore(context.db, url);

  // Sidebar counts. Cheap aggregate queries, not full table reads.
  let counts = { newOrders: 0, products: 0, reviews: 0 };
  if (store) {
    const [[newOrders], [productCount], [reviewCount]] = await Promise.all([
      context.db
        .select({ n: sql<number>`cast(count(*) as int)` })
        .from(orders)
        .where(and(eq(orders.storeId, store.id), eq(orders.state, "new"))),
      context.db
        .select({ n: sql<number>`cast(count(*) as int)` })
        .from(products)
        .where(eq(products.storeId, store.id)),
      context.db
        .select({ n: sql<number>`cast(count(*) as int)` })
        .from(reviews)
        .where(eq(reviews.storeId, store.id)),
    ]);
    counts = {
      newOrders: newOrders?.n ?? 0,
      products: productCount?.n ?? 0,
      reviews: reviewCount?.n ?? 0,
    };
  }

  // What the store switcher shows next to each store: money taken today, how
  // many orders that was, and whether anything needs attention. All three are
  // real reads — a store with no orders today shows zero, not a guess.
  const ids = all.map((s) => s.id);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  let today = new Map<string, { revenueCents: number; orderCount: number }>();
  let attention = new Map<string, string>();
  if (ids.length) {
    const [totals, disputed] = await Promise.all([
      context.db
        .select({
          storeId: orders.storeId,
          revenueCents: sql<number>`cast(coalesce(sum(${orders.totalCents} - ${orders.refundedCents}), 0) as int)`,
          orderCount: sql<number>`cast(count(*) as int)`,
        })
        .from(orders)
        .where(
          and(
            inArray(orders.storeId, ids),
            eq(orders.paymentStatus, "paid"),
            gte(orders.createdAt, since),
          ),
        )
        .groupBy(orders.storeId),
      context.db
        .selectDistinct({ storeId: orders.storeId })
        .from(orderEvents)
        .innerJoin(orders, eq(orders.id, orderEvents.orderId))
        .where(and(inArray(orders.storeId, ids), eq(orderEvents.type, "chargeback"))),
    ]);
    today = new Map(totals.map((row) => [row.storeId, row]));
    attention = new Map(disputed.map((row) => [row.storeId, "Open chargeback"]));
  }

  return {
    user: { email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    stores: all.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      domain: s.domain,
      color: s.color,
      revenueCents: today.get(s.id)?.revenueCents ?? 0,
      orderCount: today.get(s.id)?.orderCount ?? 0,
      health: (attention.has(s.id) ? "attention" : "ok") as "ok" | "attention",
      healthLabel: attention.get(s.id) ?? "No problems today",
    })),
    store: store
      ? { id: store.id, slug: store.slug, name: store.name, domain: store.domain, color: store.color }
      : null,
    counts,
  };
}

/** Screens that fill the whole area and manage their own scrolling. */
const FULL_BLEED = ["/admin/online-store/editor", "/admin/live"];

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { user, stores, store, counts } = loaderData;
  const location = useLocation();
  const fullBleed = FULL_BLEED.some((path) => location.pathname.startsWith(path));

  return (
    <AdminShell user={user} stores={stores} store={store} counts={counts} fullBleed={fullBleed}>
      <Outlet />
    </AdminShell>
  );
}
