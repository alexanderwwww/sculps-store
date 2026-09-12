import { eq, and, asc, ne, inArray } from "drizzle-orm";
import type { DB } from "~/db/client";
import { stores, pages, sections, blocks, products, variants, reviews, themes, menus, menuLinks } from "~/db/schema";
import { SECTIONS } from "./sections";

/**
 * Three domains point at this one Worker. Which store the visitor sees is
 * decided by the hostname they arrived on.
 *
 * In local dev there is no real domain, so `?store=<slug>` picks one and
 * otherwise we fall back to the first store in the database.
 */
export async function resolveStore(db: DB, hostname: string, url: URL) {
  const slugParam = url.searchParams.get("store");
  if (slugParam) {
    const [bySlug] = await db.select().from(stores).where(eq(stores.slug, slugParam)).limit(1);
    if (bySlug) return bySlug;
  }

  const host = hostname.replace(/^www\./, "");
  const [byDomain] = await db.select().from(stores).where(eq(stores.domain, host)).limit(1);
  if (byDomain) return byDomain;

  const isLocal = host === "localhost" || host.endsWith(".workers.dev") || host === "127.0.0.1";
  if (isLocal) {
    const [first] = await db.select().from(stores).orderBy(asc(stores.createdAt)).limit(1);
    if (first) return first;
  }

  return null;
}

export type StoreRow = typeof stores.$inferSelect;
export type SectionRow = typeof sections.$inferSelect;
export type BlockRow = typeof blocks.$inferSelect;
export type VariantRow = typeof variants.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;

export interface LoadedSection {
  id: string;
  type: string;
  position: number;
  hidden: boolean;
  values: Record<string, string>;
  blocks: { id: string; values: Record<string, string> }[];
}

export interface NavLink {
  label: string;
  href: string;
}

export interface LoadedProductPage {
  store: StoreRow;
  nav: { main: NavLink[]; footer: NavLink[] };
  product: ProductRow;
  variants: VariantRow[];
  /**
   * Other products this store sells, as their default variant — offered in the
   * cart drawer beside the bundles. Not part of the buy box: the page sells one
   * product, these ride along with it.
   */
  addOns: VariantRow[];
  sections: LoadedSection[];
  reviews: ReviewRow[];
}

/**
 * Loads a store's product page: the product, its bundle options, the fifteen
 * sections in their fixed order with their blocks, and the published reviews
 * the Reviews section renders from.
 */
export async function loadProductPage(
  db: DB,
  store: StoreRow,
  options: { themeId?: string; includeHidden?: boolean } = {},
): Promise<LoadedProductPage | null> {
  // Which theme answers: the one being previewed in the editor, otherwise the
  // store's live theme. Falling back to any product page keeps stores seeded
  // before themes existed working.
  const themeId =
    options.themeId ??
    (
      await db
        .select({ id: themes.id })
        .from(themes)
        .where(and(eq(themes.storeId, store.id), eq(themes.isLive, true)))
        .limit(1)
    )[0]?.id;

  const [page] = await db
    .select()
    .from(pages)
    .where(
      themeId
        ? and(eq(pages.storeId, store.id), eq(pages.kind, "product"), eq(pages.themeId, themeId))
        : and(eq(pages.storeId, store.id), eq(pages.kind, "product")),
    )
    .limit(1);
  if (!page || !page.productId) return null;

  const [product] = await db.select().from(products).where(eq(products.id, page.productId)).limit(1);
  if (!product) return null;

  const [variantRows, sectionRows, publishedReviews] = await Promise.all([
    db.select().from(variants).where(eq(variants.productId, product.id)).orderBy(asc(variants.position)),
    db.select().from(sections).where(eq(sections.pageId, page.id)).orderBy(asc(sections.position)),
    db
      .select()
      .from(reviews)
      .where(and(eq(reviews.storeId, store.id), eq(reviews.published, true)))
      .orderBy(asc(reviews.position)),
  ]);

  const visible = options.includeHidden ? sectionRows : sectionRows.filter((s) => !s.hidden);
  const blockRows = visible.length
    ? await db
        .select()
        .from(blocks)
        .where(inArray(blocks.sectionId, visible.map((s) => s.id)))
        .orderBy(asc(blocks.position))
    : [];

  const loaded: LoadedSection[] = visible.map((s) => ({
    id: s.id,
    type: s.type,
    position: s.position,
    hidden: s.hidden,
    values: (s.values ?? {}) as Record<string, string>,
    blocks: blockRows
      .filter((b) => b.sectionId === s.id)
      .map((b) => ({ id: b.id, values: (b.values ?? {}) as Record<string, string> })),
  }));

  const nav = await storeNav(db, store.id);

  // Everything else the store has live, one row each — the cart drawer's
  // add-ons. A store selling a single product simply has none.
  const otherProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.storeId, store.id), eq(products.status, "active"), ne(products.id, product.id)));
  const addOns = otherProducts.length
    ? (
        await db
          .select()
          .from(variants)
          .where(inArray(variants.productId, otherProducts.map((p) => p.id)))
          .orderBy(asc(variants.position))
      ).filter((v, i, all) => all.findIndex((o) => o.productId === v.productId) === i)
    : [];

  return { store, nav, product, variants: variantRows, addOns, sections: loaded, reviews: publishedReviews };
}

/**
 * Header and footer links. When a menu has no links yet, the footer falls
 * back to the visible policy pages so the required links always exist.
 */
export async function storeNav(db: DB, storeId: string): Promise<{ main: NavLink[]; footer: NavLink[] }> {
  const menuRows = await db.select().from(menus).where(eq(menus.storeId, storeId));
  const linkRows = menuRows.length
    ? await db.select().from(menuLinks).where(inArray(menuLinks.menuId, menuRows.map((m) => m.id))).orderBy(asc(menuLinks.position))
    : [];
  const linksFor = (handle: string): NavLink[] => {
    const menu = menuRows.find((m) => m.handle === handle);
    if (!menu) return [];
    return linkRows
      .filter((l) => l.menuId === menu.id)
      .map((l) => ({ label: l.label, href: l.destination === "custom" ? l.url || "#" : l.destination === "product" ? "/" : l.destination === "cart" ? "/cart" : `/pages/${l.destination}` }));
  };
  let footer = linksFor("footer");
  if (!footer.length) {
    const visible = await db
      .select({ title: pages.title, handle: pages.handle })
      .from(pages)
      .where(and(eq(pages.storeId, storeId), eq(pages.kind, "standalone"), eq(pages.visible, true)));
    footer = visible.map((p) => ({ label: p.title, href: `/pages/${p.handle}` }));
  }
  return { main: linksFor("main"), footer };
}

/** The fixed fifteen, used when seeding a new store's page. */
export const FIXED_SECTIONS = SECTIONS;
