/**
 * The admin layout. Everything under /admin passes through here, which means
 * the sign-in check happens in exactly one place.
 */
import { Outlet, useLocation } from "react-router";
import { eq, and, sql } from "drizzle-orm";
import type { Route } from "./+types/admin";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { orders, products, reviews } from "~/db/schema";
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

  return {
    user: { email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    stores: all.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      domain: s.domain,
      color: s.color,
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
