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
  ORDER_STATES,
  type OrderState,
} from "~/db/schema";
import { SECTIONS } from "./sections";
import { money } from "./money";

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

export async function deleteTheme(db: DB, themeId: string): Promise<void> {
  await db.delete(themes).where(and(eq(themes.id, themeId), eq(themes.isLive, false)));
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
      sql`(lower(${orders.customerName}) like ${q} or lower(${orders.email}) like ${q} or cast(${orders.number} as text) like ${q})`,
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

export async function loadOrder(db: DB, orderId: string) {
  const [row] = await db
    .select({ order: orders, store: stores })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(eq(orders.id, orderId))
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
  await db.insert(orderEvents).values({ orderId, type, text, meta });
}

export async function setOrderState(
  db: DB,
  orderId: string,
  state: OrderState,
  note: string,
): Promise<void> {
  await db.update(orders).set({ state, updatedAt: new Date() }).where(eq(orders.id, orderId));
  await recordOrderEvent(db, orderId, `state:${state}`, note, { state });
}

export async function setTracking(
  db: DB,
  orderId: string,
  tracking: string,
  carrier: string,
): Promise<void> {
  await db
    .update(orders)
    .set({ tracking, carrier, state: "fulfilled", updatedAt: new Date() })
    .where(eq(orders.id, orderId));
  await recordOrderEvent(
    db,
    orderId,
    "tracking",
    `Tracking ${tracking}${carrier ? ` (${carrier})` : ""} added`,
    { tracking, carrier },
  );
}

export async function addOrderNote(db: DB, orderId: string, note: string): Promise<void> {
  await db.update(orders).set({ note, updatedAt: new Date() }).where(eq(orders.id, orderId));
  await recordOrderEvent(db, orderId, "note", "Note updated", { note });
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

function startOfDay(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
}

/**
 * Home's four tiles, plus the hourly series behind the chart.
 *
 * Every number comes from a query. When there are no orders the tiles read
 * $0.00 and 0 — deliberately, rather than being hidden, so an empty store
 * looks like an empty store instead of a broken screen.
 */
export async function dashboard(db: DB, storeId: string | null, rangeDays: number) {
  const since = startOfDay(rangeDays - 1);
  const previousSince = startOfDay(rangeDays * 2 - 1);

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
    .where(and(...sessionScope, gte(events.at, since)));

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
    .where(and(...scope, gte(orders.createdAt, startOfDay(1))))
    .groupBy(sql`1`, sql`2`);

  const todayKey = startOfDay(0).toISOString().slice(0, 10);
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
  const scope = storeId ? [eq(orders.storeId, storeId)] : [];
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
