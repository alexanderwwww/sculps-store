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
   * Every variant of every other live product this store sells, ordered by
   * product then position — the cart drawer's add-ons, the bodies socks.
   * Not part of the buy box: the page sells one product, these ride along
   * with it. A storefront that wants one row per product de-dupes itself.
   */
  addOns: VariantRow[];
  /**
   * One row per other product the store sells, cheapest option first, with
   * the picture and the price a card needs. `addOns` is every variant and is
   * what the cart drawer wants; this is the product-level view a "goes with
   * this" row wants, so neither has to de-duplicate the other's shape.
   */
  addOnProducts: {
    id: string;
    title: string;
    handle: string;
    imageUrl: string | null;
    fromCents: number;
    /** What the cheapest variant is worth at full price, when it is on offer. */
    compareAtCents: number | null;
    /** What the Add button actually charges, and its full price. */
    addCents: number;
    addCompareAtCents: number | null;
    /** the single, for a cart tile — as opposed to the page's default bundle */
    entryVariantId: string;
    /** True when that price is a floor — the product sells in more than one size. */
    fromMany: boolean;
    /** the variant an Add button adds — the default, or the cheapest */
    variantId: string;
  }[];
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
  options: {
    themeId?: string;
    includeHidden?: boolean;
    /**
     * Which product page to load, by the page's handle.
     *
     * This was written for a shop that sells one thing, so it took the first
     * product page it found and stopped. A store with seven products has
     * seven of them, and picking whichever came back first would have served
     * the same page at every address. Omitted, it keeps the old behaviour.
     */
    handle?: string;
  } = {},
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

  const scope = [eq(pages.storeId, store.id), eq(pages.kind, "product")];
  if (themeId) scope.push(eq(pages.themeId, themeId));
  if (options.handle) scope.push(eq(pages.handle, options.handle));

  const [page] = await db
    .select()
    .from(pages)
    .where(and(...scope))
    .orderBy(asc(pages.handle))
    .limit(1);
  if (!page || !page.productId) return null;

  const [product] = await db.select().from(products).where(eq(products.id, page.productId)).limit(1);
  if (!product) return null;
  /* A draft is not published.
     Nothing checked the status, so a product taken out of the menu was still
     served in full to anybody with the address -- and to anybody a search
     engine had shown it to. The shop decides when something is for sale; the
     only way to see a draft is the admin's own preview, which is what
     includeHidden means and which requires a signed-in user. */
  if (product.status !== "active" && !options.includeHidden) return null;

  const [variantRows, sectionRows, publishedReviews] = await Promise.all([
    db.select().from(variants).where(eq(variants.productId, product.id)).orderBy(asc(variants.position)),
    db.select().from(sections).where(eq(sections.pageId, page.id)).orderBy(asc(sections.position)),
    db
      .select()
      .from(reviews)
      .where(and(eq(reviews.storeId, store.id), eq(reviews.published, true)))
      .orderBy(asc(reviews.position)),
  ]);

  // A review of the reaper does not belong on the zombie's page. Reviews are
  // kept per store because most of these shops sell one thing, so the rule is:
  // whatever was written about this product if anything was, and the store's
  // own wall otherwise.
  const mine = publishedReviews.filter((r) => r.productId === product.id);
  const pageReviews = mine.length ? mine : publishedReviews.filter((r) => !r.productId);

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

  // Everything else the store has live, every variant — the cart drawer's
  // add-ons. A store selling a single product simply has none.
  const otherProducts = await db
    .select({ id: products.id, title: products.title, handle: products.handle, images: products.images })
    .from(products)
    .where(and(eq(products.storeId, store.id), eq(products.status, "active"), ne(products.id, product.id)))
    .orderBy(asc(products.createdAt));
  const productOrder = new Map(otherProducts.map((p, i) => [p.id, i] as const));
  const addOns = otherProducts.length
    ? (
        await db
          .select()
          .from(variants)
          .where(inArray(variants.productId, otherProducts.map((p) => p.id)))
          .orderBy(asc(variants.position))
      ).sort((a, b) => (productOrder.get(a.productId) ?? 0) - (productOrder.get(b.productId) ?? 0) || a.position - b.position)
    : [];

  const addOnProducts = otherProducts.map((p) => {
    const mine = addOns.filter((v) => v.productId === p.id);
    const cheapest = mine.reduce<VariantRow | null>((low, v) => (!low || v.priceCents < low.priceCents ? v : low), null);
    const pick = mine.find((v) => v.isDefault) ?? cheapest;
    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      // A variant picture first, because it shows the exact thing the Add
      // button adds. Most products don't have one, and falling straight to
      // null drew a row of empty tiles while the product's own photographs
      // sat one field away.
      // A photograph, never a spec panel. The gallery holds both, and the
      // annotated diagrams are unreadable at tile size — a cross-sell tile
      // covered in callout text reads as an advert for a different website.
      imageUrl:
        mine.find((v) => v.imageUrl)?.imageUrl ??
        (p.images ?? []).find((x) => x.url && x.kind !== "graphic")?.url ??
        (p.images ?? []).find((x) => x.url)?.url ??
        null,
      /**
       * The cheapest way to own one, shown as "From".
       *
       * This quoted whichever bundle the product page defaults to, so a card
       * for the Black Reaper said $199.00 — the two-pack — while one reaper is
       * $129.00. A shopper comparing two shops sees the dearer number and
       * leaves. The card says the entry price and the word "From" carries the
       * rest, which is both cheaper-sounding and true.
       */
      fromCents: (cheapest ?? pick)?.priceCents ?? 0,
      /* What that same variant is worth at full price, so a tile can say
         what it saves. It comes off the variant being quoted rather than any
         other one, which is the only way the two numbers belong together. */
      compareAtCents: (cheapest ?? pick)?.compareAtCents ?? null,
      /* What pressing Add costs.
         `fromCents` is the cheapest variant, which is the right number on a
         product card next to the word "From". In a cart the same tile has a
         button that adds the default variant, so quoting the floor there
         charged somebody $129.99 after showing them $79.99. */
      addCents: (cheapest ?? pick)?.priceCents ?? 0,
      addCompareAtCents: (cheapest ?? pick)?.compareAtCents ?? null,
      /* Which variant a cart tile adds: the single, not the bundle.
         The default variant is the two-pack on most of these products, so a
         tile offering "The Crawling Zombie" was adding $219.99 of zombie to
         somebody who had not asked for two. The entry price is the one that
         gets said yes to. */
      entryVariantId: (cheapest ?? pick)?.id ?? "",
      /** Whether that price is a floor rather than the only price. */
      fromMany: (mine?.length ?? 0) > 1,
      variantId: pick?.id ?? "",
    };
  }).filter((p) => p.variantId);

  return { store, nav, product, variants: variantRows, addOns, addOnProducts, sections: loaded, reviews: pageReviews };
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
