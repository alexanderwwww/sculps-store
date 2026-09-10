import { eq, and, asc, inArray } from "drizzle-orm";
import type { DB } from "~/db/client";
import { stores, pages, sections, blocks, products, variants, reviews } from "~/db/schema";
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
  values: Record<string, string>;
  blocks: { id: string; values: Record<string, string> }[];
}

export interface LoadedProductPage {
  store: StoreRow;
  product: ProductRow;
  variants: VariantRow[];
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
): Promise<LoadedProductPage | null> {
  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.storeId, store.id), eq(pages.kind, "product")))
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

  const visible = sectionRows.filter((s) => !s.hidden);
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
    values: (s.values ?? {}) as Record<string, string>,
    blocks: blockRows
      .filter((b) => b.sectionId === s.id)
      .map((b) => ({ id: b.id, values: (b.values ?? {}) as Record<string, string> })),
  }));

  return { store, product, variants: variantRows, sections: loaded, reviews: publishedReviews };
}

/** The fixed fifteen, used when seeding a new store's page. */
export const FIXED_SECTIONS = SECTIONS;
