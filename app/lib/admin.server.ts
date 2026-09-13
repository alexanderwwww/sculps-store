/**
 * Everything the admin reads and writes.
 *
 * The prototype invented three stores and forty orders. Nothing here invents
 * anything: an empty database produces empty screens, which is the point —
 * the design already has the empty states drawn for exactly that.
 */
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import {
  stores,
  orders,
  orderItems,
  orderEvents,
  products,
  variants,
  pages,
  sections,
  blocks,
  reviews,
  media,
  domains,
  paymentProviders,
  metaConfig,
  themes,
  events,
  presence,
  carts,
  taxRates,
  users,
  sessions,
  menus,
  menuLinks,
  ORDER_STATES,
  type OrderState,
} from "~/db/schema";
import { SECTIONS } from "./sections";
import { MENU_HANDLES } from "./menus";
import { recomputeCustomerTotals, upsertCustomer } from "./customers.server";
import { money } from "./money";
import { startOfDayIn } from "./day";

export type StoreRow = typeof stores.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type VariantRow = typeof variants.$inferSelect;
export type ThemeRow = typeof themes.$inferSelect;

/* ------------------------------------------------------------------ stores */

export async function listStores(db: DB): Promise<StoreRow[]> {
  return db.select().from(stores).orderBy(asc(stores.createdAt));
}

export async function storeBySlug(db: DB, slug: string): Promise<StoreRow | null> {
  const [row] = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
  return row ?? null;
}

/**
 * Which store the admin is looking at. `?store=` wins, then the first store.
 * Returns null only when there are no stores at all, which is the state the
 * admin starts in before the first one is created.
 */
export async function resolveAdminStore(
  db: DB,
  url: URL,
): Promise<{ store: StoreRow | null; all: StoreRow[] }> {
  const all = await listStores(db);
  const wanted = url.searchParams.get("store");
  if (wanted) {
    const match = all.find((s) => s.slug === wanted);
    if (match) return { store: match, all };
  }
  return { store: all[0] ?? null, all };
}

export interface NewStoreInput {
  name: string;
  slug: string;
  domain: string;
  currency?: string;
  timezone?: string;
  contactEmail?: string | null;
  color?: string;
}

/**
 * Creates a store and everything a store cannot function without: a live
 * theme, a product page, and the fifteen sections in their fixed order.
 *
 * The sections are written here, by code, exactly as the seed script writes
 * them. That is rule one — the admin can edit their values later but can never
 * add, delete, or reorder one.
 */
export async function createStore(db: DB, input: NewStoreInput): Promise<StoreRow> {
  const [store] = await db
    .insert(stores)
    .values({
      name: input.name,
      slug: input.slug,
      domain: input.domain,
      currency: input.currency || "USD",
      timezone: input.timezone || "America/New_York",
      contactEmail: input.contactEmail || null,
      color: input.color || "#4CAF7D",
    })
    .returning();

  const [theme] = await db
    .insert(themes)
    .values({ storeId: store.id, name: "Live theme", isLive: true })
    .returning();

  const [product] = await db
    .insert(products)
    .values({
      storeId: store.id,
      handle: "product",
      title: `${store.name} product`,
      status: "draft",
    })
    .returning();

  const [page] = await db
    .insert(pages)
    .values({
      storeId: store.id,
      themeId: theme.id,
      kind: "product",
      productId: product.id,
      title: product.title,
      handle: "product",
      visible: false,
    })
    .returning();

  await db.insert(sections).values(
    SECTIONS.map((definition, index) => ({
      pageId: page.id,
      type: definition.type,
      position: index,
      values: {},
      hidden: false,
    })),
  );

  return store;
}

/* ------------------------------------------------------------------ themes */

export async function listThemes(db: DB, storeId: string): Promise<ThemeRow[]> {
  return db
    .select()
    .from(themes)
    .where(eq(themes.storeId, storeId))
    .orderBy(desc(themes.isLive), desc(themes.updatedAt));
}

export async function liveTheme(db: DB, storeId: string): Promise<ThemeRow | null> {
  const [row] = await db
    .select()
    .from(themes)
    .where(and(eq(themes.storeId, storeId), eq(themes.isLive, true)))
    .limit(1);
  return row ?? null;
}

export async function renameTheme(db: DB, themeId: string, name: string): Promise<void> {
  await db.update(themes).set({ name, updatedAt: new Date() }).where(eq(themes.id, themeId));
}

/**
 * Copies a theme: its pages, their sections, and the blocks inside them.
 *
 * Section type and position come across untouched — a duplicate is a copy of
 * the *words*, never a chance to restructure the page.
 */
export async function duplicateTheme(
  db: DB,
  storeId: string,
  sourceThemeId: string,
  name: string,
): Promise<ThemeRow> {
  const [copy] = await db
    .insert(themes)
    .values({ storeId, name, isLive: false, duplicatedFromId: sourceThemeId })
    .returning();

  const sourcePages = await db.select().from(pages).where(eq(pages.themeId, sourceThemeId));

  for (const sourcePage of sourcePages) {
    const [newPage] = await db
      .insert(pages)
      .values({
        storeId: sourcePage.storeId,
        themeId: copy.id,
        kind: sourcePage.kind,
        productId: sourcePage.productId,
        title: sourcePage.title,
        handle: sourcePage.handle,
        body: sourcePage.body,
        visible: sourcePage.visible,
      })
      .returning();

    const sourceSections = await db
      .select()
      .from(sections)
      .where(eq(sections.pageId, sourcePage.id))
      .orderBy(asc(sections.position));

    for (const sourceSection of sourceSections) {
      const [newSection] = await db
        .insert(sections)
        .values({
          pageId: newPage.id,
          type: sourceSection.type,
          position: sourceSection.position,
          values: sourceSection.values,
          hidden: sourceSection.hidden,
        })
        .returning();

      const sourceBlocks = await db
        .select()
        .from(blocks)
        .where(eq(blocks.sectionId, sourceSection.id))
        .orderBy(asc(blocks.position));

      if (sourceBlocks.length) {
        await db.insert(blocks).values(
          sourceBlocks.map((b) => ({
            sectionId: newSection.id,
            position: b.position,
            values: b.values,
          })),
        );
      }
    }
  }

  return copy;
}

/** Exactly one theme per store is live. */
export async function publishTheme(db: DB, storeId: string, themeId: string): Promise<void> {
  await db.update(themes).set({ isLive: false }).where(eq(themes.storeId, storeId));
  await db
    .update(themes)
    .set({ isLive: true, updatedAt: new Date() })
    .where(eq(themes.id, themeId));
}

/**
 * Deletes a draft theme and everything inside it. pages.themeId is a plain
 * column rather than a foreign key, so the pages (and through them the
 * sections and blocks) have to go explicitly or they are left orphaned.
 */
export async function deleteTheme(db: DB, themeId: string): Promise<void> {
  const [theme] = await db.select().from(themes).where(eq(themes.id, themeId)).limit(1);
  if (!theme || theme.isLive) return;
  await db.delete(pages).where(eq(pages.themeId, themeId));
  await db.delete(themes).where(eq(themes.id, themeId));
}

/* ------------------------------------------------------------------ orders */

export interface OrderListOptions {
  storeId: string | null;
  state?: OrderState | "all";
  query?: string;
  page?: number;
  perPage?: number;
}

export interface OrderListRow {
  order: OrderRow;
  itemSummary: string;
  storeName: string;
  storeColor: string;
}

export async function listOrders(
  db: DB,
  options: OrderListOptions,
): Promise<{ rows: OrderListRow[]; total: number; counts: Record<string, number> }> {
  const perPage = options.perPage ?? 50;
  const page = Math.max(0, options.page ?? 0);

  const filters = [];
  if (options.storeId) filters.push(eq(orders.storeId, options.storeId));
  if (options.state && options.state !== "all") filters.push(eq(orders.state, options.state));
  if (options.query) {
    const q = `%${options.query.toLowerCase()}%`;
    filters.push(
      sql`(lower(${orders.customerName}) like ${q} or lower(${orders.email}) like ${q} or cast(${orders.number} as text) like ${q} or lower(coalesce(${orders.city}, '')) like ${q} or lower(coalesce(${orders.tracking}, '')) like ${q})`,
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({ order: orders, storeName: stores.name, storeColor: stores.color })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(perPage)
    .offset(page * perPage);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(where);

  const items = rows.length
    ? await db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, rows.map((r) => r.order.id)))
    : [];

  const byOrder = new Map<string, typeof items>();
  for (const item of items) {
    const list = byOrder.get(item.orderId) ?? [];
    list.push(item);
    byOrder.set(item.orderId, list);
  }

  // Counts per state, for the tabs above the table.
  const stateFilters = options.storeId ? eq(orders.storeId, options.storeId) : undefined;
  const stateCounts = await db
    .select({ state: orders.state, count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(stateFilters)
    .groupBy(orders.state);

  const counts: Record<string, number> = { all: 0 };
  for (const state of ORDER_STATES) counts[state] = 0;
  for (const row of stateCounts) {
    counts[row.state] = row.count;
    counts.all += row.count;
  }

  return {
    rows: rows.map((r) => ({
      order: r.order,
      storeName: r.storeName,
      storeColor: r.storeColor,
      itemSummary:
        (byOrder.get(r.order.id) ?? [])
          .map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.label}` : i.label))
          .join(", ") || "—",
    })),
    total: count,
    counts,
  };
}

/**
 * Loads one order. When a storeId is given the order must belong to that
 * store, so a link carried over from another store's admin view resolves to
 * nothing rather than to someone else's order.
 */
export async function loadOrder(db: DB, orderId: string, storeId?: string) {
  const [row] = await db
    .select({ order: orders, store: stores })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(storeId ? and(eq(orders.id, orderId), eq(orders.storeId, storeId)) : eq(orders.id, orderId))
    .limit(1);
  if (!row) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const timeline = await db
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(asc(orderEvents.at));

  return { order: row.order, store: row.store, items, timeline };
}

/**
 * Every state change writes a timeline row. Nothing is ever deleted. This is
 * the record that wins a payment-processor review, so it is written in the
 * same call that makes the change rather than left to a caller to remember.
 */
export async function recordOrderEvent(
  db: DB,
  orderId: string,
  type: string,
  text: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  // Test sends from Settings use a placeholder id; there is no order to write to.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) return;
  await db.insert(orderEvents).values({ orderId, type, text, meta });
}

export async function setOrderState(
  db: DB,
  orderId: string,
  state: OrderState,
  note: string,
  by?: string,
): Promise<void> {
  await db.update(orders).set({ state, updatedAt: new Date() }).where(eq(orders.id, orderId));
  await recordOrderEvent(db, orderId, `state:${state}`, by ? `${note} · by ${by}` : note, { state, by });
}

/**
 * Adds or corrects the tracking number. The first time marks the order
 * fulfilled and stamps fulfilledAt; a later edit keeps that stamp and says
 * on the timeline what it was before, so a wrong number is never silently
 * papered over.
 */
export async function setTracking(
  db: DB,
  orderId: string,
  tracking: string,
  carrier: string,
  by?: string,
): Promise<{ changed: boolean; previous: string | null }> {
  const [current] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!current) return { changed: false, previous: null };
  const previous = current.tracking;
  const first = !current.fulfilledAt;

  await db
    .update(orders)
    .set({
      tracking,
      carrier,
      state: "fulfilled",
      fulfilledAt: current.fulfilledAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  await recordOrderEvent(
    db,
    orderId,
    "tracking",
    previous && previous !== tracking
      ? `Tracking corrected from ${previous} to ${tracking}${carrier ? ` (${carrier})` : ""}${by ? ` · by ${by}` : ""}`
      : `Tracking ${tracking}${carrier ? ` (${carrier})` : ""} added${first ? " · marked fulfilled" : ""}${by ? ` · by ${by}` : ""}`,
    { tracking, carrier, previous, by },
  );
  return { changed: previous !== tracking, previous };
}

export async function addOrderNote(db: DB, orderId: string, note: string, by?: string): Promise<void> {
  await db.update(orders).set({ note, updatedAt: new Date() }).where(eq(orders.id, orderId));
  await recordOrderEvent(
    db,
    orderId,
    "note",
    note.trim() ? `Note${by ? ` by ${by}` : ""}: ${note.trim()}` : `Note cleared${by ? ` by ${by}` : ""}`,
    { note, by },
  );
}

/** Cancels an order that never shipped. Paid orders must be refunded first. */
export async function cancelOrder(
  db: DB,
  orderId: string,
  reason: string,
  by: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [current] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!current) return { ok: false, reason: "That order no longer exists." };
  if (current.state === "fulfilled") return { ok: false, reason: "This order has shipped. It can be refunded, not cancelled." };
  if (current.paymentStatus === "paid" || current.paymentStatus === "partially_refunded") {
    return { ok: false, reason: "This order is paid. Refund it in full first, then cancel it." };
  }
  await db.update(orders).set({ state: "cancelled", updatedAt: new Date() }).where(eq(orders.id, orderId));
  await recordOrderEvent(db, orderId, "state:cancelled", `Cancelled${reason ? ` · ${reason}` : ""} · by ${by}`, { reason, by });
  return { ok: true };
}

/* ---------------------------------------------------------------- products */

export async function listProducts(db: DB, storeId: string) {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.storeId, storeId))
    .orderBy(asc(products.createdAt));

  if (!rows.length) return [];

  const allVariants = await db
    .select()
    .from(variants)
    .where(inArray(variants.productId, rows.map((r) => r.id)))
    .orderBy(asc(variants.position));

  return rows.map((product) => ({
    product,
    variants: allVariants.filter((v) => v.productId === product.id),
  }));
}

export async function loadProduct(db: DB, productId: string) {
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) return null;
  const rows = await db
    .select()
    .from(variants)
    .where(eq(variants.productId, productId))
    .orderBy(asc(variants.position));
  return { product, variants: rows };
}

/* ----------------------------------------------------------------- reviews */

export async function listReviews(db: DB, storeId: string) {
  return db
    .select()
    .from(reviews)
    .where(eq(reviews.storeId, storeId))
    .orderBy(asc(reviews.position), desc(reviews.createdAt));
}

/* ------------------------------------------------------------------- media */

export async function listMedia(db: DB, storeId: string) {
  return db.select().from(media).where(eq(media.storeId, storeId)).orderBy(desc(media.createdAt));
}

/* ---------------------------------------------------------------- settings */

export async function storeSettings(db: DB, storeId: string) {
  const [domainRows, providerRows, metaRows] = await Promise.all([
    db.select().from(domains).where(eq(domains.storeId, storeId)).orderBy(desc(domains.isPrimary)),
    db.select().from(paymentProviders).where(eq(paymentProviders.storeId, storeId)),
    db.select().from(metaConfig).where(eq(metaConfig.storeId, storeId)).limit(1),
  ]);
  return { domains: domainRows, providers: providerRows, meta: metaRows[0] ?? null };
}

/* --------------------------------------------------------------- dashboard */

export interface Metric {
  label: string;
  value: string;
  delta: string;
  arrow: string;
  color: string;
}

/**
 * Midnight in the store's own timezone, not the Worker's. A Worker runs on
 * UTC, so every "today" here used to begin at 2am or 7pm wherever the
 * merchant actually is.
 */
function startOfDay(timezone: string, offsetDays = 0): Date {
  return startOfDayIn(timezone, offsetDays);
}

/**
 * Home's four tiles, plus the hourly series behind the chart.
 *
 * Every number comes from a query. When there are no orders the tiles read
 * $0.00 and 0 — deliberately, rather than being hidden, so an empty store
 * looks like an empty store instead of a broken screen.
 */
export async function dashboard(db: DB, storeId: string | null, rangeDays: number, timezone = "UTC") {
  const since = startOfDay(timezone, rangeDays - 1);
  const previousSince = startOfDay(timezone, rangeDays * 2 - 1);

  const scope = storeId ? [eq(orders.storeId, storeId)] : [];

  const current = await db
    .select({
      count: sql<number>`cast(count(*) as int)`,
      total: sql<number>`cast(coalesce(sum(${orders.totalCents}), 0) as int)`,
    })
    .from(orders)
    .where(and(...scope, gte(orders.createdAt, since)));

  const previous = await db
    .select({
      count: sql<number>`cast(count(*) as int)`,
      total: sql<number>`cast(coalesce(sum(${orders.totalCents}), 0) as int)`,
    })
    .from(orders)
    .where(and(...scope, gte(orders.createdAt, previousSince), lt(orders.createdAt, since)));

  const sessionScope = storeId ? [eq(events.storeId, storeId)] : [];
  const sessionRows = await db
    .select({ count: sql<number>`cast(count(distinct ${events.sessionId}) as int)` })
    .from(events)
    .where(and(...sessionScope, eq(events.human, true), gte(events.at, since)));

  const salesCents = current[0]?.total ?? 0;
  const orderCount = current[0]?.count ?? 0;
  const previousSales = previous[0]?.total ?? 0;
  const previousOrders = previous[0]?.count ?? 0;
  const sessionCount = sessionRows[0]?.count ?? 0;

  // Hourly series for today and yesterday, for the chart.
  const hourly = await db
    .select({
      day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
      hour: sql<number>`cast(extract(hour from ${orders.createdAt}) as int)`,
      total: sql<number>`cast(coalesce(sum(${orders.totalCents}), 0) as int)`,
    })
    .from(orders)
    .where(and(...scope, gte(orders.createdAt, startOfDay(timezone, 1))))
    .groupBy(sql`1`, sql`2`);

  const todayKey = startOfDay(timezone, 0).toISOString().slice(0, 10);
  const today = new Array(24).fill(0);
  const yesterday = new Array(24).fill(0);
  for (const row of hourly) {
    const target = row.day === todayKey ? today : yesterday;
    target[row.hour] = row.total;
  }

  return {
    metrics: buildMetrics(salesCents, orderCount, sessionCount, previousSales, previousOrders),
    salesCents,
    orderCount,
    sessionCount,
    today,
    yesterday,
  };
}

function delta(now: number, before: number): { text: string; arrow: string; color: string } {
  if (before === 0) {
    // No comparison is possible. Say so rather than printing a fake +100%.
    return { text: "—", arrow: "", color: "var(--ink-2)" };
  }
  const change = Math.round(((now - before) / before) * 100);
  return {
    text: `${Math.abs(change)}%`,
    arrow: change >= 0 ? "↑" : "↓",
    color: change >= 0 ? "var(--b-success-fg)" : "var(--critical)",
  };
}

function buildMetrics(
  salesCents: number,
  orderCount: number,
  sessionCount: number,
  previousSales: number,
  previousOrders: number,
): Metric[] {
  const salesDelta = delta(salesCents, previousSales);
  const orderDelta = delta(orderCount, previousOrders);
  const aov = orderCount ? Math.round(salesCents / orderCount) : 0;
  const conversion = sessionCount ? (orderCount / sessionCount) * 100 : 0;

  return [
    {
      label: "Sales",
      value: money(salesCents),
      delta: salesDelta.text,
      arrow: salesDelta.arrow,
      color: salesDelta.color,
    },
    {
      label: "Orders",
      value: String(orderCount),
      delta: orderDelta.text,
      arrow: orderDelta.arrow,
      color: orderDelta.color,
    },
    {
      label: "Average order",
      value: money(aov),
      delta: "—",
      arrow: "",
      color: "var(--ink-2)",
    },
    {
      label: "Conversion",
      value: sessionCount ? `${conversion.toFixed(2)}%` : "—",
      delta: sessionCount ? `${sessionCount} sessions` : "No sessions yet",
      arrow: "",
      color: "var(--ink-2)",
    },
  ];
}


/** Orders that need him to do something. Drives Home's "Things to do". */
export async function todos(db: DB, storeId: string | null) {
  // Unpaid checkouts are not orders to place with anyone.
  const scope = [sql`${orders.paymentStatus} in ('paid','partially_refunded','refunded')`, ...(storeId ? [eq(orders.storeId, storeId)] : [])];
  const rows = await db
    .select({ state: orders.state, count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(and(...scope))
    .groupBy(orders.state);

  const byState = new Map(rows.map((r) => [r.state, r.count]));
  const out: { count: number; strong: string; rest: string; to: string }[] = [];

  const newCount = byState.get("new") ?? 0;
  if (newCount) {
    out.push({
      count: newCount,
      strong: newCount === 1 ? "1 order" : `${newCount} orders`,
      rest: "to place with the supplier",
      to: "/admin/orders?state=new",
    });
  }

  const orderedCount = byState.get("ordered") ?? 0;
  if (orderedCount) {
    out.push({
      count: orderedCount,
      strong: orderedCount === 1 ? "1 order" : `${orderedCount} orders`,
      rest: "waiting for a tracking number",
      to: "/admin/orders?state=ordered",
    });
  }

  return out;
}

/* -------------------------------------------------- product writes */

export interface ProductInput {
  title: string;
  handle: string;
  description: string;
  status: string;
  supplierName: string | null;
  supplierUrl: string | null;
  costCents: number | null;
}

export async function createProduct(
  db: DB,
  storeId: string,
  input: ProductInput,
): Promise<ProductRow> {
  const [row] = await db
    .insert(products)
    .values({ storeId, ...input })
    .returning();
  return row;
}

export async function updateProduct(db: DB, productId: string, input: ProductInput): Promise<void> {
  await db.update(products).set(input).where(eq(products.id, productId));
}

export interface VariantInput {
  id?: string;
  label: string;
  sublabel: string | null;
  priceCents: number;
  compareAtCents: number | null;
  sku: string | null;
  imageUrl?: string | null;
  position: number;
  isDefault: boolean;
}

/**
 * Replaces a product's bundle options with exactly what the form submitted.
 *
 * Rows that came back keep their id — an option that has been sold must keep
 * the same variant so order history still points at something real. Rows that
 * were removed in the form are deleted, and anything new is inserted.
 */
export async function saveVariants(
  db: DB,
  productId: string,
  submitted: VariantInput[],
): Promise<void> {
  const existing = await db.select().from(variants).where(eq(variants.productId, productId));
  const keptIds = new Set(submitted.map((v) => v.id).filter(Boolean) as string[]);

  const removed = existing.filter((row) => !keptIds.has(row.id));
  if (removed.length) {
    await db.delete(variants).where(inArray(variants.id, removed.map((r) => r.id)));
  }

  for (const variant of submitted) {
    const values = {
      label: variant.label,
      sublabel: variant.sublabel,
      priceCents: variant.priceCents,
      compareAtCents: variant.compareAtCents,
      sku: variant.sku,
      imageUrl: variant.imageUrl ?? null,
      position: variant.position,
      isDefault: variant.isDefault,
    };
    if (variant.id && existing.some((row) => row.id === variant.id)) {
      await db.update(variants).set(values).where(eq(variants.id, variant.id));
    } else {
      await db.insert(variants).values({ productId, ...values });
    }
  }
}

/** Stock levels, edited on the Inventory screen. */
export async function saveStock(
  db: DB,
  rows: { id: string; available: number; incoming: number; lowStockThreshold: number }[],
): Promise<void> {
  for (const row of rows) {
    await db
      .update(variants)
      .set({
        available: row.available,
        incoming: row.incoming,
        lowStockThreshold: row.lowStockThreshold,
      })
      .where(eq(variants.id, row.id));
  }
}

/** Units sold per variant, so Products can show it without inventing it. */
export async function unitsSold(db: DB, storeId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      variantId: orderItems.variantId,
      units: sql<number>`cast(coalesce(sum(${orderItems.quantity}), 0) as int)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orders.storeId, storeId))
    .groupBy(orderItems.variantId);

  const out = new Map<string, number>();
  for (const row of rows) if (row.variantId) out.set(row.variantId, row.units);
  return out;
}

/* ------------------------------------------------------------------- pages */

export async function listPages(db: DB, themeId: string) {
  return db.select().from(pages).where(eq(pages.themeId, themeId)).orderBy(asc(pages.title));
}

export async function loadPageWithSections(db: DB, pageId: string) {
  const [page] = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page) return null;

  const sectionRows = await db
    .select()
    .from(sections)
    .where(eq(sections.pageId, pageId))
    .orderBy(asc(sections.position));

  const blockRows = sectionRows.length
    ? await db
        .select()
        .from(blocks)
        .where(inArray(blocks.sectionId, sectionRows.map((s) => s.id)))
        .orderBy(asc(blocks.position))
    : [];

  return {
    page,
    sections: sectionRows.map((section) => ({
      ...section,
      blocks: blockRows.filter((block) => block.sectionId === section.id),
    })),
  };
}

export async function savePageBody(
  db: DB,
  pageId: string,
  input: { title: string; body: string; visible: boolean },
): Promise<void> {
  await db
    .update(pages)
    .set({ title: input.title, body: input.body, visible: input.visible, updatedAt: new Date() })
    .where(eq(pages.id, pageId));
}

export async function setPageVisible(db: DB, pageId: string, visible: boolean): Promise<void> {
  await db.update(pages).set({ visible, updatedAt: new Date() }).where(eq(pages.id, pageId));
}

export async function createStandalonePage(
  db: DB,
  storeId: string,
  themeId: string,
  title: string,
  handle: string,
) {
  const [row] = await db
    .insert(pages)
    .values({ storeId, themeId, kind: "standalone", title, handle, visible: false })
    .returning();
  return row;
}

/* ---------------------------------------------------------------- sections */

/**
 * Saves one section's values and its blocks.
 *
 * `type` and `position` are never in the payload. They are written by code at
 * seed time and are the reason a theme editor can no longer overwrite the
 * layout — the admin can only reach the words.
 */
export async function saveSection(
  db: DB,
  sectionId: string,
  values: Record<string, string>,
  hidden: boolean,
  submittedBlocks: { id?: string; values: Record<string, string> }[],
): Promise<void> {
  await db.update(sections).set({ values, hidden }).where(eq(sections.id, sectionId));

  const existing = await db.select().from(blocks).where(eq(blocks.sectionId, sectionId));
  const kept = new Set(submittedBlocks.map((b) => b.id).filter(Boolean) as string[]);

  const removed = existing.filter((row) => !kept.has(row.id));
  if (removed.length) {
    await db.delete(blocks).where(inArray(blocks.id, removed.map((r) => r.id)));
  }

  for (let index = 0; index < submittedBlocks.length; index++) {
    const block = submittedBlocks[index];
    if (block.id && existing.some((row) => row.id === block.id)) {
      await db
        .update(blocks)
        .set({ values: block.values, position: index })
        .where(eq(blocks.id, block.id));
    } else {
      await db.insert(blocks).values({ sectionId, values: block.values, position: index });
    }
  }

  // Touch the theme so "last updated" on the Themes screen means something.
  const [section] = await db.select().from(sections).where(eq(sections.id, sectionId)).limit(1);
  if (section) {
    const [page] = await db.select().from(pages).where(eq(pages.id, section.pageId)).limit(1);
    if (page?.themeId) {
      await db.update(themes).set({ updatedAt: new Date() }).where(eq(themes.id, page.themeId));
    }
  }
}

/** The product page of a theme — what "Customize" opens. */
export async function productPageOfTheme(db: DB, themeId: string) {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.themeId, themeId), eq(pages.kind, "product")))
    .limit(1);
  return row ?? null;
}

/* --------------------------------------------------------- review writes */

export interface ReviewInput {
  name: string;
  rating: number;
  title: string | null;
  body: string;
  country: string | null;
  imageUrl: string | null;
  verified: boolean;
  /** "customer" | "supplier_listing" — required, never defaulted */
  source: string;
  productId: string | null;
  reviewedOn: Date | null;
}

export async function createReview(db: DB, storeId: string, input: ReviewInput) {
  const existing = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(reviews)
    .where(eq(reviews.storeId, storeId));

  const [row] = await db
    .insert(reviews)
    .values({ storeId, position: existing[0]?.n ?? 0, published: false, ...input })
    .returning();
  return row;
}

export async function updateReview(
  db: DB,
  reviewId: string,
  patch: Partial<ReviewInput> & { published?: boolean; position?: number },
): Promise<void> {
  await db.update(reviews).set(patch).where(eq(reviews.id, reviewId));
}

export async function deleteReviews(db: DB, ids: string[]): Promise<void> {
  if (ids.length) await db.delete(reviews).where(inArray(reviews.id, ids));
}

/**
 * Publishing is refused for any review with no source.
 *
 * The column is not nullable and has no default, but a caller could still pass
 * an empty string. This is the gate that makes "every published review is
 * declared either the customer's or the supplier listing's" true in practice
 * rather than only on paper.
 */
export async function publishReviews(
  db: DB,
  ids: string[],
  published: boolean,
): Promise<{ changed: number; refused: string[] }> {
  if (!ids.length) return { changed: 0, refused: [] };

  const rows = await db.select().from(reviews).where(inArray(reviews.id, ids));
  if (!published) {
    await db.update(reviews).set({ published: false }).where(inArray(reviews.id, ids));
    return { changed: rows.length, refused: [] };
  }

  const allowed = rows.filter((row) => row.source && row.source.trim());
  const refused = rows.filter((row) => !row.source || !row.source.trim()).map((row) => row.name);

  if (allowed.length) {
    await db
      .update(reviews)
      .set({ published: true })
      .where(inArray(reviews.id, allowed.map((row) => row.id)));
  }

  return { changed: allowed.length, refused };
}

export async function reviewStats(db: DB, storeId: string) {
  const rows = await db.select().from(reviews).where(eq(reviews.storeId, storeId));
  const total = rows.length;
  const average = total ? rows.reduce((sum, row) => sum + row.rating, 0) / total : 0;
  const withPhotos = rows.filter((row) => row.imageUrl).length;

  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: rows.filter((row) => row.rating === star).length,
  }));

  return {
    total,
    average,
    withPhotos,
    published: rows.filter((row) => row.published).length,
    distribution,
  };
}

/* ---------------------------------------------------------- media writes */

export async function addMedia(
  db: DB,
  storeId: string,
  input: { key: string; filename: string; mime: string; sizeBytes: number; alt: string | null },
) {
  const [row] = await db.insert(media).values({ storeId, ...input }).returning();
  return row;
}

export async function deleteMedia(db: DB, ids: string[]): Promise<void> {
  if (ids.length) await db.delete(media).where(inArray(media.id, ids));
}

/* -------------------------------------------------------- settings writes */

export async function saveStoreSettings(
  db: DB,
  storeId: string,
  patch: Partial<typeof stores.$inferInsert>,
): Promise<void> {
  await db.update(stores).set(patch).where(eq(stores.id, storeId));
}

export async function saveMetaConfig(
  db: DB,
  storeId: string,
  // Partial on purpose: the Meta screen saves one field at a time as the
  // setup is walked through, and a step must never wipe the step before it.
  patch: Partial<{ pixelId: string | null; adAccountId: string | null; testEventCode: string | null }>,
): Promise<void> {
  const existing = await db
    .select()
    .from(metaConfig)
    .where(eq(metaConfig.storeId, storeId))
    .limit(1);

  if (existing.length) {
    if (Object.keys(patch).length === 0) return;
    await db.update(metaConfig).set(patch).where(eq(metaConfig.storeId, storeId));
  } else {
    await db.insert(metaConfig).values({ storeId, ...patch });
  }
}

export async function addDomain(db: DB, storeId: string, hostname: string) {
  const existing = await db.select().from(domains).where(eq(domains.storeId, storeId));
  const [row] = await db
    .insert(domains)
    .values({ storeId, hostname, isPrimary: existing.length === 0 })
    .returning();
  return row;
}

export async function removeDomain(db: DB, storeId: string, domainId: string): Promise<void> {
  await db.delete(domains).where(and(eq(domains.id, domainId), eq(domains.storeId, storeId)));
}

export async function setPrimaryDomain(db: DB, storeId: string, domainId: string): Promise<void> {
  await db.update(domains).set({ isPrimary: false }).where(eq(domains.storeId, storeId));
  await db
    .update(domains)
    .set({ isPrimary: true })
    .where(and(eq(domains.id, domainId), eq(domains.storeId, storeId)));
}

/** A domain row, only if it belongs to the store. */
export async function storeDomain(db: DB, storeId: string, domainId: string) {
  const [row] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.storeId, storeId)))
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------- analytics */

export interface AnalyticsRange {
  days: number;
  label: string;
}

/**
 * Analytics.
 *
 * Everything is counted from orders and events. Where there is no data the
 * figure is null and the screen says so, rather than showing a zero that reads
 * like a measurement.
 */
export async function analytics(db: DB, storeId: string, days: number, timezone = "UTC") {
  const since = startOfDayIn(timezone, days - 1);

  /**
   * Only money that was actually taken counts. Every checkout submit writes
   * an order row as "pending"; abandoned card entry leaves it there, and a
   * decline leaves "failed". None of that is revenue, and the sidebar was
   * already excluding it — so Home and Analytics disagreed with the sidebar
   * for the same day.
   */
  const paidOnly = sql`${orders.paymentStatus} in ('paid','partially_refunded','refunded')`;

  const [totals, byDay, bySource, topVariants, sessionRows] = await Promise.all([
    db
      .select({
        orders: sql<number>`cast(count(*) as int)`,
        revenue: sql<number>`cast(coalesce(sum(${orders.totalCents} - ${orders.refundedCents}), 0) as int)`,
        refunded: sql<number>`cast(coalesce(sum(${orders.refundedCents}), 0) as int)`,
      })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), gte(orders.createdAt, since), paidOnly)),

    db
      .select({
        day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
        orders: sql<number>`cast(count(*) as int)`,
        revenue: sql<number>`cast(coalesce(sum(${orders.totalCents} - ${orders.refundedCents}), 0) as int)`,
      })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), gte(orders.createdAt, since), paidOnly))
      .groupBy(sql`1`)
      .orderBy(sql`1`),

    db
      .select({
        source: orders.source,
        orders: sql<number>`cast(count(*) as int)`,
        revenue: sql<number>`cast(coalesce(sum(${orders.totalCents} - ${orders.refundedCents}), 0) as int)`,
      })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), gte(orders.createdAt, since), paidOnly))
      .groupBy(orders.source)
      .orderBy(desc(sql`2`)),

    db
      .select({
        label: orderItems.label,
        units: sql<number>`cast(coalesce(sum(${orderItems.quantity}), 0) as int)`,
        revenue: sql<number>`cast(coalesce(sum(${orderItems.unitPriceCents} * ${orderItems.quantity}), 0) as int)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.storeId, storeId), gte(orders.createdAt, since), paidOnly))
      .groupBy(orderItems.label)
      .orderBy(desc(sql`3`))
      .limit(10),

    db
      .select({
        sessions: sql<number>`cast(count(distinct ${events.sessionId}) as int)`,
        views: sql<number>`cast(count(*) filter (where ${events.type} = 'view') as int)`,
        carts: sql<number>`cast(count(distinct ${events.sessionId}) filter (where ${events.type} = 'cart') as int)`,
        checkouts: sql<number>`cast(count(distinct ${events.sessionId}) filter (where ${events.type} = 'checkout') as int)`,
      })
      .from(events)
      .where(and(eq(events.storeId, storeId), eq(events.human, true), gte(events.at, since))),
  ]);

  const orderCount = totals[0]?.orders ?? 0;
  const revenue = totals[0]?.revenue ?? 0;
  const sessions = sessionRows[0]?.sessions ?? 0;

  return {
    orderCount,
    revenue,
    refunded: totals[0]?.refunded ?? 0,
    averageOrder: orderCount ? Math.round(revenue / orderCount) : null,
    sessions,
    conversion: sessions ? (orderCount / sessions) * 100 : null,
    funnel: {
      sessions,
      views: sessionRows[0]?.views ?? 0,
      carts: sessionRows[0]?.carts ?? 0,
      checkouts: sessionRows[0]?.checkouts ?? 0,
      purchases: orderCount,
    },
    byDay,
    bySource: bySource.map((row) => ({
      source: row.source ?? "Direct",
      orders: row.orders,
      revenue: row.revenue,
    })),
    topVariants,
  };
}

/* -------------------------------------------------------------- live view */

/**
 * Live View.
 *
 * Reads the last half hour of events. There is no simulator: what is on this
 * screen either happened or the screen is empty.
 */
export async function liveView(db: DB, storeId: string, timezone = "UTC") {
  const since = new Date(Date.now() - 30 * 60_000);

  const [recent, active, todayTotals] = await Promise.all([
    db
      .select()
      .from(events)
      .where(and(eq(events.storeId, storeId), eq(events.human, true), gte(events.at, since)))
      .orderBy(desc(events.at))
      .limit(60),

    db
      .select({ n: sql<number>`cast(count(distinct ${events.sessionId}) as int)` })
      .from(events)
      .where(and(eq(events.storeId, storeId), eq(events.human, true), gte(events.at, new Date(Date.now() - 5 * 60_000)))),

    db
      .select({
        orders: sql<number>`cast(count(*) as int)`,
        revenue: sql<number>`cast(coalesce(sum(${orders.totalCents}), 0) as int)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.storeId, storeId),
          gte(orders.createdAt, startOfDayIn(timezone, 0)),
        ),
      ),
  ]);

  return {
    activeVisitors: active[0]?.n ?? 0,
    todayOrders: todayTotals[0]?.orders ?? 0,
    todayRevenue: todayTotals[0]?.revenue ?? 0,
    recent,
  };
}

/* ------------------------------------------------------------ order writes */

export interface PlaceOrderInput {
  storeId: string;
  customerName: string;
  email: string;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  /** the code as typed, and what it was worth — both computed on the server */
  discountCode?: string | null;
  discountCents?: number;
  paymentProvider: string;
  paymentRef: string;
  paymentStatus: string;
  source: string | null;
  campaign: string | null;
  metaEventId: string | null;
  fbp: string | null;
  fbc: string | null;
  lat?: number | null;
  lon?: number | null;
  marketingConsent?: boolean;
  lines: {
    variantId: string;
    title: string;
    label: string;
    unitPriceCents: number;
    quantity: number;
  }[];
}

/**
 * Creates an order and its opening timeline, and takes the store's next order
 * number.
 *
 * The number comes from the store row so it is sequential per store the way a
 * merchant expects, rather than a random id the customer has to read out.
 */
export async function placeOrder(db: DB, input: PlaceOrderInput) {
  // Take the next number atomically. Two checkouts at the same second on an
  // ad spike must never be handed the same order number.
  const [taken] = await db
    .update(stores)
    .set({ orderSeq: sql`${stores.orderSeq} + 1` })
    .where(eq(stores.id, input.storeId))
    .returning({ next: stores.orderSeq });
  if (!taken) throw new Error("That store no longer exists.");
  const number = taken.next - 1;

  const [order] = await db
    .insert(orders)
    .values({
      storeId: input.storeId,
      number,
      state: "new",
      customerName: input.customerName,
      email: input.email,
      phone: input.phone,
      address1: input.address1,
      address2: input.address2,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      country: input.country,
      subtotalCents: input.subtotalCents,
      taxCents: input.taxCents,
      shippingCents: input.shippingCents,
      totalCents: input.totalCents,
      currency: input.currency,
      discountCode: input.discountCode ?? null,
      discountCents: input.discountCents ?? 0,
      paymentProvider: input.paymentProvider,
      paymentRef: input.paymentRef,
      paymentStatus: input.paymentStatus,
      source: input.source,
      campaign: input.campaign,
      metaEventId: input.metaEventId,
      fbp: input.fbp,
      fbc: input.fbc,
      lat: input.lat ?? null,
      lon: input.lon ?? null,
      marketingConsent: input.marketingConsent ?? false,
    })
    .returning();

  if (input.lines.length) {
    await db.insert(orderItems).values(
      input.lines.map((line) => ({
        orderId: order.id,
        variantId: line.variantId,
        title: line.title,
        label: line.label,
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
      })),
    );
  }

  // The buyer is a customer now. Built from this order's own details — what
  // they typed at this store's checkout — and their order count and lifetime
  // spend are then recounted from the `orders` table rather than incremented.
  await upsertCustomer(db, input.storeId, {
    email: input.email,
    name: input.customerName,
    phone: input.phone,
    geo: { city: input.city, region: input.region, country: input.country },
    consent: input.marketingConsent ?? false,
  });
  await recomputeCustomerTotals(db, input.storeId, input.email);

  await recordOrderEvent(db, order.id, "created", `Order created · #${number}`, {
    source: input.source,
  });
  await recordOrderEvent(
    db,
    order.id,
    "payment",
    `Payment of ${money(input.totalCents, input.currency)} ${
      input.paymentStatus === "paid" ? "captured" : input.paymentStatus
    } via ${input.paymentProvider} · ${input.paymentRef}`,
    { ref: input.paymentRef },
  );

  return order;
}

/** Used by the webhook and the return page; both can arrive first. */
export async function orderByPaymentRef(db: DB, paymentRef: string) {
  const [row] = await db.select().from(orders).where(eq(orders.paymentRef, paymentRef)).limit(1);
  return row ?? null;
}

/**
 * Claims the order as paid. Returns true for exactly one caller.
 *
 * The webhook and the /thanks page both race to do this, and both used to
 * win: an unconditional update followed by side-effects meant two timeline
 * rows, two purchase events on the globe, two receipts, and a discount
 * counted twice. The WHERE is the lock — whoever gets a row back is the one
 * that turned it from unpaid to paid, and only they carry on.
 */
export async function markOrderPaid(db: DB, orderId: string, note: string): Promise<boolean> {
  const [paid] = await db
    .update(orders)
    .set({ paymentStatus: "paid", paidAt: new Date(), updatedAt: new Date() })
    // Only an unpaid order becomes paid. A refunded one stays refunded, whatever
    // Stripe retries afterwards.
    .where(and(eq(orders.id, orderId), sql`${orders.paymentStatus} in ('pending','failed')`))
    .returning({ storeId: orders.storeId, email: orders.email });
  if (!paid) return false;
  await recordOrderEvent(db, orderId, "payment:confirmed", note);
  // Lifetime spend only counts money actually taken, so it is recounted here
  // as well as at order time.
  await recomputeCustomerTotals(db, paid.storeId, paid.email);
  return true;
}

/** Records a visitor action for Live View and Analytics. */
export async function recordVisitorEvent(
  db: DB,
  storeId: string,
  input: {
    type: string;
    sessionId: string;
    path?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    source?: string | null;
    campaign?: string | null;
    amountCents?: number | null;
    orderId?: string | null;
    /** where it happened — without these the globe cannot draw a sale */
    lat?: number | null;
    lon?: number | null;
  },
): Promise<void> {
  await db.insert(events).values({
    // Only the server writes these, and only for something that actually
    // happened — a payment confirmed. Left at the column default they were
    // stored as bot traffic, so no sale ever reached Live View's map, which
    // counts human events only.
    human: true,
    storeId,
    type: input.type,
    sessionId: input.sessionId,
    path: input.path ?? null,
    city: input.city ?? null,
    region: input.region ?? null,
    country: input.country ?? null,
    source: input.source ?? null,
    campaign: input.campaign ?? null,
    amountCents: input.amountCents ?? null,
    orderId: input.orderId ?? null,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
  });
}

/* ------------------------------------------------------- live view board */

/**
 * Everything the Live View screen shows, in one round trip.
 *
 * All of it is derived from the events and orders tables for the last
 * thirty minutes (today, for money). Nothing here is simulated; when the
 * store has no traffic every list is empty and every number is zero.
 */
export async function liveBoard(db: DB, storeId: string, timezone = "UTC") {
  const window = new Date(Date.now() - 30 * 60_000);
  const fiveMinutes = new Date(Date.now() - 5 * 60_000);
  const checkoutWindow = new Date(Date.now() - 3 * 60_000);
  // Two missed beats. A tab that closed drops off inside a minute; a phone
  // that dipped through a tunnel does not.
  const liveWindow = new Date(Date.now() - 45_000);
  const startOfToday = startOfDayIn(timezone, 0);

  const [recent, online, sessions, today, openCarts, atCheckout, byLocation] = await Promise.all([
    db
      .select()
      .from(events)
      .where(and(eq(events.storeId, storeId), eq(events.human, true), gte(events.at, window)))
      .orderBy(desc(events.at))
      .limit(120),

    // Who is on the site this second, from the heartbeat their own browser
    // sends. Not "had an event in the last five minutes" — that counted
    // people who had already left, and counted scanners that were never
    // there at all.
    db
      .select()
      .from(presence)
      .where(and(eq(presence.storeId, storeId), gte(presence.lastSeen, liveWindow)))
      .orderBy(desc(presence.lastSeen))
      .limit(200),

    db
      .select({ n: sql<number>`cast(count(distinct ${events.sessionId}) as int)` })
      .from(events)
      .where(and(eq(events.storeId, storeId), eq(events.human, true), gte(events.at, startOfToday))),

    db
      .select({
        orders: sql<number>`cast(count(*) as int)`,
        revenue: sql<number>`cast(coalesce(sum(${orders.totalCents} - ${orders.refundedCents}), 0) as int)`,
      })
      .from(orders)
      // paid money only — a pending checkout is not a sale today
      .where(
        and(
          eq(orders.storeId, storeId),
          gte(orders.createdAt, startOfToday),
          sql`${orders.paymentStatus} in ('paid','partially_refunded','refunded')`,
        ),
      ),

    // Carts that exist RIGHT NOW: still open, still holding something, and
    // touched in the last half hour. Emptying a cart writes `items: []` and
    // stamps updatedAt, so this number falls the moment a line is deleted —
    // which is the whole point. A distinct-session count over the day only
    // ever climbed, so the tile never moved and looked dead.
    db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(carts)
      .where(
        and(
          eq(carts.storeId, storeId),
          eq(carts.status, "open"),
          gte(carts.updatedAt, window),
          sql`jsonb_array_length(${carts.items}) > 0`,
        ),
      ),

    // Sessions on the checkout in the last three minutes. Same idea: it comes
    // on when someone reaches checkout and goes off again when they leave.
    db
      .select({ n: sql<number>`cast(count(distinct ${events.sessionId}) as int)` })
      .from(events)
      .where(
        and(
          eq(events.storeId, storeId),
          eq(events.type, "checkout"),
          eq(events.human, true),
          gte(events.at, checkoutWindow),
        ),
      ),

    db
      .select({
        city: events.city,
        region: events.region,
        country: events.country,
        n: sql<number>`cast(count(distinct ${events.sessionId}) as int)`,
      })
      .from(events)
      .where(and(eq(events.storeId, storeId), eq(events.human, true), gte(events.at, startOfToday)))
      .groupBy(events.city, events.region, events.country)
      .orderBy(desc(sql`4`))
      .limit(8),
  ]);

  return {
    activeVisitors: online.length,
    // Everyone on the site right now, for the globe. These are the dots.
    online: online.map((row) => ({
      sessionId: row.sessionId,
      stage: row.stage,
      city: row.city,
      region: row.region,
      country: row.country,
      lat: row.lat,
      lon: row.lon,
      at: row.lastSeen.getTime(),
    })),
    sessionsToday: sessions[0]?.n ?? 0,
    ordersToday: today[0]?.orders ?? 0,
    revenueToday: today[0]?.revenue ?? 0,
    activeCarts: openCarts[0]?.n ?? 0,
    checkingOut: atCheckout[0]?.n ?? 0,
    // Purchases are the one number that stays: a sale today is a sale today.
    purchased: today[0]?.orders ?? 0,
    byLocation: byLocation
      .filter((row) => row.city || row.country)
      .map((row) => ({
        label: [row.country, [row.city, row.region].filter(Boolean).join(", ")]
          .filter(Boolean)
          .join(" · "),
        count: row.n,
      })),
    recent,
  };
}


/* --------------------------------------------------- settings: taxes etc. */

export async function listTaxRates(db: DB, storeId: string) {
  return db.select().from(taxRates).where(eq(taxRates.storeId, storeId)).orderBy(asc(taxRates.region));
}

export async function upsertTaxRate(db: DB, storeId: string, region: string, rate: number): Promise<void> {
  const [existing] = await db
    .select()
    .from(taxRates)
    .where(and(eq(taxRates.storeId, storeId), eq(taxRates.region, region)))
    .limit(1);
  if (existing) await db.update(taxRates).set({ rate }).where(eq(taxRates.id, existing.id));
  else await db.insert(taxRates).values({ storeId, region, rate });
}

export async function removeTaxRate(db: DB, storeId: string, id: string): Promise<void> {
  await db.delete(taxRates).where(and(eq(taxRates.id, id), eq(taxRates.storeId, storeId)));
}

/** The rate for a destination: the state's manual rate if there is one, else the default. */
export async function taxRateFor(db: DB, storeId: string, region: string | null, fallback: number): Promise<number> {
  if (!region) return fallback;
  const [row] = await db
    .select()
    .from(taxRates)
    .where(and(eq(taxRates.storeId, storeId), eq(taxRates.region, region.toUpperCase())))
    .limit(1);
  return row ? row.rate : fallback;
}

export async function updateUserPrefs(
  db: DB,
  userId: string,
  patch: Partial<typeof users.$inferInsert>,
): Promise<void> {
  await db.update(users).set(patch).where(eq(users.id, userId));
}

/** Ends every session except the one making the request. */
export async function signOutOtherSessions(db: DB, userId: string, keepTokenHash: string): Promise<number> {
  const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
  const others = rows.filter((row) => row.tokenHash !== keepTokenHash);
  if (others.length) await db.delete(sessions).where(inArray(sessions.id, others.map((r) => r.id)));
  return others.length;
}

/**
 * Deletes a store and everything under it through the schema's cascades.
 * Orders are the one thing that refuse (onDelete: restrict) — a store with
 * orders cannot be deleted, because those orders are the processor evidence.
 */
export async function deleteStore(db: DB, storeId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [{ n }] = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(eq(orders.storeId, storeId));
  if (n > 0) {
    return { ok: false, reason: `This store has ${n} order${n === 1 ? "" : "s"}. Orders are permanent, so a store that has taken orders cannot be deleted.` };
  }
  await db.delete(pages).where(eq(pages.storeId, storeId));
  await db.delete(stores).where(eq(stores.id, storeId));
  return { ok: true };
}

/** The policy pages every store has, by handle. Created by the seed and by createStore. */
export const POLICY_HANDLES = [
  ["refund-policy", "Refund policy"],
  ["privacy-policy", "Privacy policy"],
  ["terms-of-service", "Terms of service"],
  ["shipping-policy", "Shipping policy"],
] as const;

export async function policyPages(db: DB, storeId: string) {
  const theme = await liveTheme(db, storeId);
  if (!theme) return [];
  const rows = await db.select().from(pages).where(eq(pages.themeId, theme.id));
  return POLICY_HANDLES.map(([handle, title]) => {
    const row = rows.find((page) => page.handle === handle);
    return { handle, title, id: row?.id ?? null, body: row?.body ?? "", visible: row?.visible ?? false };
  });
}

export async function savePolicies(
  db: DB,
  storeId: string,
  bodies: Record<string, string>,
  publish: boolean,
): Promise<void> {
  const theme = await liveTheme(db, storeId);
  if (!theme) return;
  for (const [handle, title] of POLICY_HANDLES) {
    const body = bodies[handle] ?? "";
    const [row] = await db
      .select()
      .from(pages)
      .where(and(eq(pages.themeId, theme.id), eq(pages.handle, handle)))
      .limit(1);
    if (row) {
      await db
        .update(pages)
        .set({
          body,
          updatedAt: new Date(),
          // Publish makes every written policy live and hides empty ones.
          // A plain save keeps whatever is live, live — with the new text.
          ...(publish ? { visible: body.trim().length > 0 } : body.trim() ? {} : { visible: false }),
        })
        .where(eq(pages.id, row.id));
    } else {
      await db.insert(pages).values({
        storeId,
        themeId: theme.id,
        kind: "standalone",
        title,
        handle,
        body,
        visible: publish && body.trim().length > 0,
      });
    }
  }
}


/* -------------------------------------------------------------- navigation */

export interface MenuWithLinks {
  id: string;
  handle: string;
  title: string;
  links: { id: string; label: string; destination: string; url: string | null; position: number }[];
}

/** Both menus for a store, created empty the first time they are asked for. */
export async function storeMenus(db: DB, storeId: string): Promise<MenuWithLinks[]> {
  const existing = await db.select().from(menus).where(eq(menus.storeId, storeId));
  const out: MenuWithLinks[] = [];
  for (const [handle, title] of MENU_HANDLES) {
    let menu = existing.find((row) => row.handle === handle);
    if (!menu) [menu] = await db.insert(menus).values({ storeId, handle, title }).returning();
    const links = await db.select().from(menuLinks).where(eq(menuLinks.menuId, menu.id)).orderBy(asc(menuLinks.position));
    out.push({ id: menu.id, handle: menu.handle, title: menu.title, links });
  }
  return out;
}

/** Replaces one menu's links with exactly what the form submitted, in order. */
export async function saveMenuLinks(
  db: DB,
  storeId: string,
  menuId: string,
  submitted: { id?: string; label: string; destination: string; url: string | null }[],
): Promise<void> {
  const [menu] = await db.select().from(menus).where(and(eq(menus.id, menuId), eq(menus.storeId, storeId))).limit(1);
  if (!menu) return;
  await db.delete(menuLinks).where(eq(menuLinks.menuId, menuId));
  if (submitted.length) {
    await db.insert(menuLinks).values(
      submitted.map((link, position) => ({ menuId, position, label: link.label, destination: link.destination, url: link.url })),
    );
  }
  await db.update(menus).set({ updatedAt: new Date() }).where(eq(menus.id, menuId));
}

/** Resolves a link's destination to a storefront href. */
export function menuHref(link: { destination: string; url: string | null }): string {
  if (link.destination === "custom") return link.url || "#";
  if (link.destination === "product") return "/";
  if (link.destination === "cart") return "/cart";
  return `/pages/${link.destination}`;
}
