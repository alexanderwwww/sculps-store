/**
 * Customers.
 *
 * A customer record here is built from one source only: what the person typed
 * into this store's own checkout. The email field when they complete it, and
 * the details on an order when they pay. That is the whole list of inputs.
 *
 * Things deliberately not done, because they would each be a lie or a leak:
 *   - no third-party enrichment, no purchased lists, no lookup services;
 *   - no identity guessed from an IP — the city/region/country kept is only
 *     the edge's view of the request they typed on, which is the same thing
 *     Live View already shows, and it is never treated as who they are;
 *   - no joining one person's records across stores — every query here is
 *     filtered by storeId and the unique key is (storeId, email);
 *   - no row for a visitor who typed nothing. An anonymous session is not a
 *     customer and cannot appear in the list as one;
 *   - nothing invented. An unknown name stays null and renders empty.
 *
 * `ordersCount` and `totalSpentCents` on the row are a cache for listing
 * speed. They are only ever written by `recomputeCustomerTotals`, which counts
 * the `orders` table. Nothing here increments a counter and hopes.
 */
import { and, asc, desc, eq, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import { carts, customers, events, orderItems, orders, variants, products } from "~/db/schema";

export type CustomerRow = typeof customers.$inferSelect;

/** One person is one row, so the address is the key and it is lowercased. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Enough of an address to be worth keeping. Nothing is corrected or guessed. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** An empty or whitespace-only field stays null rather than becoming "". */
function keep(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

export interface UpsertCustomerInput {
  email: string;
  name?: string | null;
  phone?: string | null;
  geo?: { city?: string | null; region?: string | null; country?: string | null } | null;
  /** what they actually ticked; undefined means "they did not say either way" */
  consent?: boolean;
  sessionId?: string | null;
}

/**
 * Creates the person, or updates what we already had about them.
 *
 * Only fields with a real value overwrite what is stored — a later checkout
 * that leaves the phone box empty must not erase the phone number they gave
 * the first time. `lastSeenAt` is always touched, because this is only ever
 * called when they were actually here.
 *
 * Consent is written only when the caller actually observed the box, and it
 * is written in both directions: unticking it must be able to turn marketing
 * off again.
 */
export async function upsertCustomer(
  db: DB,
  storeId: string,
  input: UpsertCustomerInput,
): Promise<CustomerRow | null> {
  const email = normaliseEmail(input.email ?? "");
  if (!looksLikeEmail(email)) return null;

  const now = new Date();
  const name = keep(input.name);
  const phone = keep(input.phone);
  const city = keep(input.geo?.city);
  const region = keep(input.geo?.region);
  const country = keep(input.geo?.country);
  const sessionId = keep(input.sessionId);

  const [row] = await db
    .insert(customers)
    .values({
      storeId,
      email,
      name,
      phone,
      city,
      region,
      country,
      marketingConsent: input.consent === true,
      firstSeenAt: now,
      lastSeenAt: now,
      lastSessionId: sessionId,
    })
    .onConflictDoUpdate({
      target: [customers.storeId, customers.email],
      set: {
        lastSeenAt: now,
        // coalesce keeps what we already knew when this visit says nothing.
        name: sql`coalesce(${name}, ${customers.name})`,
        phone: sql`coalesce(${phone}, ${customers.phone})`,
        city: sql`coalesce(${city}, ${customers.city})`,
        region: sql`coalesce(${region}, ${customers.region})`,
        country: sql`coalesce(${country}, ${customers.country})`,
        lastSessionId: sql`coalesce(${sessionId}, ${customers.lastSessionId})`,
        marketingConsent:
          input.consent === undefined
            ? sql`${customers.marketingConsent}`
            : sql`${input.consent}`,
      },
    })
    .returning();

  return row ?? null;
}

/** Puts the person on the cart, so a cart exists against them before an order does. */
export async function attachCartToCustomer(
  db: DB,
  cartId: string,
  customerId: string,
  email: string,
): Promise<void> {
  await db
    .update(carts)
    .set({ customerId, email: normaliseEmail(email), updatedAt: new Date() })
    .where(eq(carts.id, cartId));
}

/**
 * Recounts this person's orders from the `orders` table and writes the cache.
 *
 * Spend is net of refunds on paid orders, the same arithmetic the orders
 * screen uses. Cancelled and unpaid orders count as orders placed but not as
 * money taken.
 */
export async function recomputeCustomerTotals(
  db: DB,
  storeId: string,
  email: string,
): Promise<void> {
  const key = normaliseEmail(email);
  const [totals] = await db
    .select({
      count: sql<number>`cast(count(*) as int)`,
      spent: sql<number>`cast(coalesce(sum(case when ${orders.paymentStatus} in ('paid','partially_refunded','refunded') then ${orders.totalCents} - ${orders.refundedCents} else 0 end), 0) as int)`,
    })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), sql`lower(${orders.email}) = ${key}`));

  await db
    .update(customers)
    .set({
      ordersCount: totals?.count ?? 0,
      totalSpentCents: Math.max(0, totals?.spent ?? 0),
    })
    .where(and(eq(customers.storeId, storeId), eq(customers.email, key)));
}

/* ------------------------------------------------------------ cart reading */

export interface CartItemView {
  label: string;
  productTitle: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface OpenCartView {
  cartId: string;
  items: CartItemView[];
  valueCents: number;
  updatedAt: Date;
  /** open for more than an hour with nothing bought since */
  abandoned: boolean;
}

const ABANDONED_AFTER_MS = 60 * 60 * 1000;

type StoredLine = { variantId?: string; quantity?: number };

/**
 * Turns the jsonb lines on a cart into something readable, pricing them from
 * the variant rows rather than from whatever the browser once wrote.
 */
async function describeCarts(
  db: DB,
  rows: (typeof carts.$inferSelect)[],
): Promise<Map<string, OpenCartView>> {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const line of (row.items ?? []) as StoredLine[]) {
      if (line?.variantId) ids.add(line.variantId);
    }
  }

  const priced = ids.size
    ? await db
        .select({
          id: variants.id,
          label: variants.label,
          priceCents: variants.priceCents,
          title: products.title,
        })
        .from(variants)
        .innerJoin(products, eq(products.id, variants.productId))
        .where(inArray(variants.id, [...ids]))
    : [];
  const byVariant = new Map(priced.map((v) => [v.id, v]));

  const now = Date.now();
  const out = new Map<string, OpenCartView>();
  for (const row of rows) {
    const items: CartItemView[] = [];
    for (const line of (row.items ?? []) as StoredLine[]) {
      const variant = line?.variantId ? byVariant.get(line.variantId) : undefined;
      // A variant that has since been deleted is dropped, not invented.
      if (!variant) continue;
      const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
      items.push({
        label: variant.label,
        productTitle: variant.title,
        quantity,
        unitPriceCents: variant.priceCents,
        lineTotalCents: variant.priceCents * quantity,
      });
    }
    if (!items.length) continue;
    const key = row.customerId ?? row.id;
    // Rows arrive newest first; the freshest cart for a person is the one kept.
    if (out.has(key)) continue;
    const updatedAt = new Date(row.updatedAt);
    out.set(key, {
      cartId: row.id,
      items,
      valueCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
      updatedAt,
      abandoned: row.status !== "converted" && now - updatedAt.getTime() > ABANDONED_AFTER_MS,
    });
  }
  return out;
}

/* -------------------------------------------------------------- the list */

export type CustomerSort = "recent" | "spend" | "orders" | "name";

export interface CustomerListOptions {
  query?: string;
  page?: number;
  perPage?: number;
  sort?: CustomerSort;
}

export interface CustomerListRow {
  id: string;
  email: string;
  /** empty when they never gave one — never a placeholder */
  name: string;
  location: string;
  ordersCount: number;
  totalSpentCents: number;
  lastSeenAt: Date;
  marketingConsent: boolean;
  /** what is in their cart right now, if anything */
  openCart: OpenCartView | null;
}

export interface CustomerListResult {
  rows: CustomerListRow[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

export async function customerList(
  db: DB,
  storeId: string,
  options: CustomerListOptions = {},
): Promise<CustomerListResult> {
  const perPage = Math.min(200, Math.max(1, Math.floor(options.perPage ?? 50)));
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const term = (options.query ?? "").trim().toLowerCase();

  const filters = [eq(customers.storeId, storeId)];
  if (term) {
    const like = `%${term}%`;
    filters.push(
      sql`(${customers.email} like ${like} or lower(coalesce(${customers.name}, '')) like ${like} or lower(coalesce(${customers.city}, '')) like ${like} or lower(coalesce(${customers.region}, '')) like ${like})`,
    );
  }
  const where = and(...filters);

  const order =
    options.sort === "spend"
      ? [desc(customers.totalSpentCents)]
      : options.sort === "orders"
        ? [desc(customers.ordersCount)]
        : options.sort === "name"
          ? [asc(sql`coalesce(nullif(${customers.name}, ''), ${customers.email})`)]
          : [desc(customers.lastSeenAt)];

  const [counted] = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(customers)
    .where(where);
  const total = counted?.n ?? 0;

  const rows = await db
    .select()
    .from(customers)
    .where(where)
    .orderBy(...order)
    .limit(perPage)
    .offset((page - 1) * perPage);

  const cartRows = rows.length
    ? await db
        .select()
        .from(carts)
        .where(
          and(
            eq(carts.storeId, storeId),
            ne(carts.status, "converted"),
            inArray(
              carts.customerId,
              rows.map((r) => r.id),
            ),
          ),
        )
        .orderBy(desc(carts.updatedAt))
    : [];
  const cartByCustomer = await describeCarts(db, cartRows);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name ?? "",
      location: [row.city, row.region].filter(Boolean).join(", "),
      ordersCount: row.ordersCount,
      totalSpentCents: row.totalSpentCents,
      lastSeenAt: new Date(row.lastSeenAt),
      marketingConsent: row.marketingConsent,
      openCart: cartByCustomer.get(row.id) ?? null,
    })),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

/* ------------------------------------------------------------ one person */

export interface CustomerOrderView {
  id: string;
  number: number;
  createdAt: Date;
  summary: string;
  totalCents: number;
  currency: string;
  state: string;
  paymentStatus: string;
}

export interface CustomerEventView {
  type: string;
  path: string | null;
  at: Date;
}

export interface CustomerDetail {
  customer: CustomerRow;
  orders: CustomerOrderView[];
  openCart: OpenCartView | null;
  /** their pages, in the order they saw them — only from this store's events */
  journey: CustomerEventView[];
  /** true when we have no session to read a journey from, rather than "none" */
  journeyUnavailable: boolean;
}

export async function customerDetail(
  db: DB,
  storeId: string,
  id: string,
): Promise<CustomerDetail | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.storeId, storeId)))
    .limit(1);
  if (!customer) return null;

  const orderRows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.storeId, storeId), sql`lower(${orders.email}) = ${customer.email}`))
    .orderBy(desc(orders.createdAt));

  const items = orderRows.length
    ? await db
        .select()
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            orderRows.map((o) => o.id),
          ),
        )
    : [];
  const summaryByOrder = new Map<string, string>();
  for (const item of items) {
    const piece = item.quantity > 1 ? `${item.quantity} × ${item.label}` : item.label;
    const previous = summaryByOrder.get(item.orderId);
    summaryByOrder.set(item.orderId, previous ? `${previous}, ${piece}` : piece);
  }

  const cartRows = await db
    .select()
    .from(carts)
    .where(and(eq(carts.storeId, storeId), eq(carts.customerId, customer.id), ne(carts.status, "converted")))
    .orderBy(desc(carts.updatedAt))
    .limit(1);
  const openCart = (await describeCarts(db, cartRows)).get(customer.id) ?? null;

  // The journey is this store's own event rows for the session they were last
  // seen on. With no session recorded there is nothing to show, and that is
  // said as "not recorded" rather than drawn as an empty journey.
  const journey = customer.lastSessionId
    ? await db
        .select({ type: events.type, path: events.path, at: events.at })
        .from(events)
        .where(and(eq(events.storeId, storeId), eq(events.sessionId, customer.lastSessionId)))
        .orderBy(asc(events.at))
        .limit(200)
    : [];

  return {
    customer,
    orders: orderRows.map((order) => ({
      id: order.id,
      number: order.number,
      createdAt: new Date(order.createdAt),
      summary: summaryByOrder.get(order.id) ?? "",
      totalCents: order.totalCents,
      currency: order.currency,
      state: order.state,
      paymentStatus: order.paymentStatus,
    })),
    openCart,
    journey: journey.map((row) => ({ type: row.type, path: row.path, at: new Date(row.at) })),
    journeyUnavailable: !customer.lastSessionId,
  };
}

/* ------------------------------------------------------- abandoned carts */

export interface AbandonedCart {
  cartId: string;
  customerId: string | null;
  email: string;
  name: string;
  items: CartItemView[];
  valueCents: number;
  updatedAt: Date;
}

/**
 * Carts that have an email on them, have not become an order, and have not
 * been touched for an hour. The email is there because the person typed it —
 * a cart with no email is not in this list, and cannot be.
 */
export async function abandonedCarts(db: DB, storeId: string): Promise<AbandonedCart[]> {
  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS);
  const rows = await db
    .select()
    .from(carts)
    .where(
      and(
        eq(carts.storeId, storeId),
        isNotNull(carts.email),
        ne(carts.status, "converted"),
        lt(carts.updatedAt, cutoff),
      ),
    )
    .orderBy(desc(carts.updatedAt));
  if (!rows.length) return [];

  const described = await describeCarts(db, rows);
  const byCartId = new Map<string, OpenCartView>();
  for (const view of described.values()) byCartId.set(view.cartId, view);

  const customerIds = rows.map((r) => r.customerId).filter((x): x is string => Boolean(x));
  const people = customerIds.length
    ? await db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(and(eq(customers.storeId, storeId), inArray(customers.id, customerIds)))
    : [];
  const nameById = new Map(people.map((p) => [p.id, p.name ?? ""]));

  const out: AbandonedCart[] = [];
  for (const row of rows) {
    const view = byCartId.get(row.id);
    if (!view) continue;
    out.push({
      cartId: row.id,
      customerId: row.customerId,
      email: row.email!,
      name: (row.customerId ? nameById.get(row.customerId) : "") ?? "",
      items: view.items,
      valueCents: view.valueCents,
      updatedAt: view.updatedAt,
    });
  }
  return out;
}
