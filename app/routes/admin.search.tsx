/**
 * What the ⌘K palette searches.
 *
 * The prototype's palette groups results as Orders, Products and Go to, so
 * this returns exactly those three groups in that order, already shaped for
 * the palette. Orders match on number, customer, email or city; products on
 * their title or handle. Nothing is fuzzy-matched into existence — an empty
 * group is simply not returned, and the palette shows its "No results" state.
 */
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { orders, products } from "~/db/schema";
import { money } from "~/lib/money";

export interface PaletteItem {
  id: string;
  title: string;
  sub: string;
  to: string;
}

export interface PaletteGroup {
  label: string;
  short: string;
  items: PaletteItem[];
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!store) return { groups: [] as PaletteGroup[] };

  const suffix = `?store=${store.slug}`;
  const like = `%${q}%`;
  const groups: PaletteGroup[] = [];

  const orderWhere = q
    ? and(
        eq(orders.storeId, store.id),
        or(
          sql`cast(${orders.number} as text) like ${like}`,
          ilike(orders.customerName, like),
          ilike(orders.email, like),
          ilike(orders.city, like),
        ),
      )
    : eq(orders.storeId, store.id);

  const orderRows = await context.db
    .select({
      id: orders.id,
      number: orders.number,
      customerName: orders.customerName,
      city: orders.city,
      region: orders.region,
      totalCents: orders.totalCents,
      currency: orders.currency,
    })
    .from(orders)
    .where(orderWhere)
    .orderBy(desc(orders.createdAt))
    .limit(q ? 6 : 4);

  if (orderRows.length) {
    groups.push({
      label: "Orders",
      short: "#",
      items: orderRows.map((row: {
        id: string;
        number: number;
        customerName: string;
        city: string | null;
        region: string | null;
        totalCents: number;
        currency: string;
      }) => ({
        id: row.id,
        title: `#${row.number} · ${row.customerName}`,
        sub: [
          [row.city, row.region].filter(Boolean).join(", "),
          money(row.totalCents, row.currency),
        ]
          .filter(Boolean)
          .join(" · "),
        to: `/admin/orders/${row.id}${suffix}`,
      })),
    });
  }

  const productWhere = q
    ? and(
        eq(products.storeId, store.id),
        or(ilike(products.title, like), ilike(products.handle, like)),
      )
    : eq(products.storeId, store.id);

  const productRows = await context.db
    .select({
      id: products.id,
      title: products.title,
      handle: products.handle,
      status: products.status,
    })
    .from(products)
    .where(productWhere)
    .orderBy(desc(products.createdAt))
    .limit(q ? 6 : 4);

  if (productRows.length) {
    groups.push({
      label: "Products",
      short: "P",
      items: productRows.map((row: { id: string; title: string; handle: string; status: string }) => ({
        id: row.id,
        title: row.title,
        sub: `${row.status === "active" ? "Active" : "Draft"} · ${store.name}`,
        to: `/admin/products/${row.id}${suffix}`,
      })),
    });
  }

  return { groups };
}
