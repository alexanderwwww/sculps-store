/**
 * Seeds store one — the garden kneeler.
 *
 * What goes in here is ONLY what Alex has actually confirmed: the product, the
 * three bundles with their real prices, and the four specifications he has
 * measured. Nothing is invented.
 *
 * - No reviews. Reviews are imported or written by him, never generated.
 * - Specs he hasn't measured (folded depth, shipping weight) are seeded with an
 *   empty value on purpose, so the live page shows "Spec pending".
 * - Marketing copy for the other sections is left blank. An empty section is
 *   skipped on the live page; he fills it in from the admin.
 *
 * Safe to run more than once: it updates the existing store rather than
 * creating a second one, and never touches orders.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import * as schema from "../app/db/schema";
import { SECTIONS } from "../app/lib/sections";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run this with: npm run db:seed");
  process.exit(1);
}

const db = drizzle(neon(url), { schema });

const STORE = {
  slug: "gk",
  name: "Garden Kneeler",
  // Placeholder until Alex gives the real domain he bought for this store.
  domain: process.env.STORE_ONE_DOMAIN ?? "garden-kneeler.pending",
  color: "#B6F03C",
  currency: "USD",
  timezone: "America/New_York",
};

const PRODUCT = {
  handle: "garden-kneeler-seat",
  title: "Garden Kneeler & Seat",
  description:
    "A folding garden kneeler and seat. The padded kneeler flips over into a seat, " +
    "and two handles take your weight so you can get back up.",
};

/** Prices in cents. Percent saved is calculated on the page, never stored. */
const VARIANTS = [
  { label: "Buy 1", sublabel: "Kneeler + 1 pad set", priceCents: 8900, compareAtCents: 12900, isDefault: false },
  { label: "Buy 2 — most popular", sublabel: "Kneeler + 2 pad sets", priceCents: 12900, compareAtCents: 21800, isDefault: true },
  { label: "Family bundle", sublabel: "2 kneelers + 4 pad sets", priceCents: 17900, compareAtCents: 33800, isDefault: false },
];

/** Only measured numbers carry a value. Blanks render as "Spec pending". */
const SPECS: { label: string; value: string }[] = [
  { label: "Weight capacity", value: "330 lb" },
  { label: "Frame", value: "Powder-coated steel" },
  { label: "Pad", value: "1 inch EVA foam" },
  { label: "Seat height", value: "17 inches" },
  { label: "Folded depth", value: "" },
  { label: "Shipping weight", value: "" },
];

const STANDALONE_PAGES = [
  { title: "Refund policy", handle: "refund-policy" },
  { title: "Privacy policy", handle: "privacy-policy" },
  { title: "Terms of service", handle: "terms-of-service" },
  { title: "Shipping policy", handle: "shipping-policy" },
  { title: "Contact", handle: "contact" },
];

async function main() {
  console.log("Seeding store one…");

  /* ------------------------------------------------------------- store */
  let [store] = await db.select().from(schema.stores).where(eq(schema.stores.slug, STORE.slug)).limit(1);
  if (store) {
    console.log("  store: already exists, leaving it alone");
  } else {
    [store] = await db.insert(schema.stores).values(STORE).returning();
    console.log(`  store: created ${store.name}`);
  }

  /* ----------------------------------------------------------- product */
  let [product] = await db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.storeId, store.id), eq(schema.products.handle, PRODUCT.handle)))
    .limit(1);

  if (!product) {
    [product] = await db
      .insert(schema.products)
      .values({ ...PRODUCT, storeId: store.id, status: "active" })
      .returning();
    console.log(`  product: created ${product.title}`);
  } else {
    console.log("  product: already exists");
  }

  /* ---------------------------------------------------------- variants */
  const existingVariants = await db
    .select()
    .from(schema.variants)
    .where(eq(schema.variants.productId, product.id));

  if (existingVariants.length === 0) {
    await db.insert(schema.variants).values(
      VARIANTS.map((v, i) => ({
        ...v,
        productId: product.id,
        position: i,
        sku: `GK-${String(i + 1).padStart(2, "0")}`,
      })),
    );
    console.log(`  variants: created ${VARIANTS.length} bundle options`);
  } else {
    console.log(`  variants: ${existingVariants.length} already there`);
  }

  /* -------------------------------------------------------- product page */
  let [page] = await db
    .select()
    .from(schema.pages)
    .where(and(eq(schema.pages.storeId, store.id), eq(schema.pages.kind, "product")))
    .limit(1);

  if (!page) {
    [page] = await db
      .insert(schema.pages)
      .values({
        storeId: store.id,
        kind: "product",
        productId: product.id,
        title: product.title,
        handle: PRODUCT.handle,
        visible: true,
      })
      .returning();
    console.log("  page: created the product page");
  } else {
    console.log("  page: already exists");
  }

  /* ------------------------------------------------ the fifteen sections */
  const existingSections = await db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.pageId, page.id));

  if (existingSections.length === 0) {
    const rows = SECTIONS.map((def, i) => ({
      pageId: page.id,
      type: def.type,
      position: i,
      values: initialValues(def.type),
      hidden: false,
    }));
    const created = await db.insert(schema.sections).values(rows).returning();
    console.log(`  sections: created all ${created.length}, in fixed order`);

    // Only the specifications section gets seeded blocks — the measured facts.
    const specSection = created.find((s) => s.type === "specifications");
    if (specSection) {
      await db.insert(schema.blocks).values(
        SPECS.map((spec, i) => ({
          sectionId: specSection.id,
          position: i,
          values: spec,
        })),
      );
      const pending = SPECS.filter((s) => !s.value).length;
      console.log(`  specs: ${SPECS.length} rows (${pending} left blank — they show as "Spec pending")`);
    }
  } else {
    console.log(`  sections: ${existingSections.length} already there`);
  }

  /* -------------------------------------------------- standalone pages */
  for (const p of STANDALONE_PAGES) {
    const [found] = await db
      .select()
      .from(schema.pages)
      .where(and(eq(schema.pages.storeId, store.id), eq(schema.pages.handle, p.handle)))
      .limit(1);
    if (!found) {
      await db.insert(schema.pages).values({
        storeId: store.id,
        kind: "standalone",
        title: p.title,
        handle: p.handle,
        visible: false,
        body: "",
      });
    }
  }
  console.log("  pages: policy pages present (empty until he writes them)");

  console.log("\nDone. No reviews, no invented copy, no guessed specs.");
}

/**
 * Section text starts empty except where the words are simply the product's
 * own facts. Empty sections do not render, so the live page never shows a
 * blank slab or a placeholder headline pretending to be copy.
 */
function initialValues(type: string): Record<string, string> {
  if (type === "buy_box") {
    return {
      heading: PRODUCT.title,
      subheading: PRODUCT.description,
      ctaLabel: "Add to cart",
      badge: "",
      reassurance: "",
    };
  }
  if (type === "specifications") {
    return { heading: "Specifications" };
  }
  return {};
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
