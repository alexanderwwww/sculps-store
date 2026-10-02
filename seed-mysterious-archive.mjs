/**
 * Puts the Mysterious Archive store and its pieces into Shop Admin.
 *
 * The pieces, their text, sizes and prices are the site's own data file
 * (sites/mysterious-archive/data/products.json), which was taken word for word
 * from the private client catalogue PDF. This script only copies them in.
 *
 *   - One store: "Mysterious Archive", on the placeholder domain mysteriousarchive.pending
 *     (change it in Settings when the real one exists).
 *   - One product per piece, status active, handle = the piece's page address.
 *   - One variant per piece: label "Size M", the price in cents, ONE in stock
 *     (0 when the piece is marked sold in products.json).
 *   - Photos are in R2 as ma-NN-hero.jpg / ma-NN-dK.jpg (uploaded before this runs).
 *
 * Adds rows for this store only. Never touches another store, an order or a customer.
 * Safe to run twice: it updates in place.
 *
 * Run:  set -a; . ./.dev.vars; set +a; node seed-mysterious-archive.mjs
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  fs.readFileSync(new URL("./.dev.vars", import.meta.url), "utf8").match(/DATABASE_URL\s*=\s*"?([^"\n]+)"?/)[1];
const sql = neon(DATABASE_URL);

const site = JSON.parse(fs.readFileSync(new URL("./sites/mysterious-archive/data/products.json", import.meta.url), "utf8"));
const PHOTO_DIR = new URL("./sites/mysterious-archive/", import.meta.url);

const STORE = {
  slug: "mysterious-archive",
  name: "Mysterious Archive",
  domain: "mysteriousarchive.pending",
  color: "#8f8c86",
  legalName: null,
  city: "New York",
  region: "NY",
  country: "US",
};

// the fifteen sections, in the platform's fixed order (same list createStore uses)
const SECTION_TYPES = [
  "buy_box", "video_faq", "social_proof_images", "video_clips", "product_grid", "trust_icons", "three_steps", "benefits",
  "features", "comparison_table", "reviews", "who_its_for", "whats_in_the_box", "specifications", "before_after", "split_picks",
  "photo_banner", "recommendations", "ugc_wall", "holo_grid", "closing_cta",
];

const pad = (n) => String(n).padStart(2, "0");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function descriptionOf(p) {
  return (
    `<p><em>${esc(p.subtitle)}</em></p>` +
    `<h3>Model</h3><p>${esc(p.model)}</p>` +
    `<h3>Condition</h3><p>${esc(p.condition)}</p>` +
    `<h3>Rarity</h3><p>${esc(p.rarity)}</p>` +
    `<p>Piece ${pad(p.number)} / ${pad(site.pieces.length)}. One of one.</p>`
  );
}

function keysOf(p) {
  const n = pad(p.number);
  return [
    { key: `ma-${n}-hero.jpg`, file: p.hero, size: p.heroSize, alt: p.title },
    ...p.photos.map((f, i) => ({ key: `ma-${n}-d${i + 1}.jpg`, file: f, size: p.photoSizes[i], alt: `${p.title}, detail ${i + 1}` })),
  ];
}

async function main() {
  /* 1. store */
  let [store] = await sql`select id from stores where slug = ${STORE.slug}`;
  if (store) {
    await sql`update stores set name = ${STORE.name}, color = ${STORE.color}, city = ${STORE.city}, region = ${STORE.region}, country = ${STORE.country}, lat = 40.7128, lon = -74.006 where id = ${store.id}`;
    console.log("  store: updated");
  } else {
    [store] = await sql`
      insert into stores (slug, name, domain, currency, timezone, color, city, region, country, lat, lon)
      values (${STORE.slug}, ${STORE.name}, ${STORE.domain}, 'USD', 'America/New_York', ${STORE.color}, ${STORE.city}, ${STORE.region}, ${STORE.country}, 40.7128, -74.006)
      returning id`;
    console.log("  store: created");
  }
  const storeId = store.id;
  await sql`update stores set logo_url = '/media/ma-logo.png' where id = ${storeId}`;

  /* 2. theme */
  let [theme] = await sql`select id from themes where store_id = ${storeId} and is_live = true`;
  if (!theme) {
    [theme] = await sql`insert into themes (store_id, name, is_live) values (${storeId}, 'Live theme', true) returning id`;
    console.log("  theme: created");
  }

  /* 3. pieces */
  const ids = [];
  for (const p of site.pieces) {
    const imgs = keysOf(p);
    const images = JSON.stringify(imgs.map((i) => ({ url: `/media/${i.key}`, alt: i.alt, kind: "photo" })));
    let [prod] = await sql`select id from products where store_id = ${storeId} and handle = ${p.slug}`;
    if (prod) {
      await sql`update products set title = ${p.title}, description = ${descriptionOf(p)}, status = 'active', images = ${images}::jsonb where id = ${prod.id}`;
    } else {
      [prod] = await sql`
        insert into products (store_id, handle, title, description, status, images)
        values (${storeId}, ${p.slug}, ${p.title}, ${descriptionOf(p)}, 'active', ${images}::jsonb) returning id`;
    }
    ids.push(prod.id);
    await sql`delete from variants where product_id = ${prod.id}`;
    await sql`
      insert into variants (product_id, label, sublabel, price_cents, sku, position, is_default, available)
      values (${prod.id}, ${"Size " + p.size}, ${p.subtitle}, ${p.price * 100}, ${"MA-" + pad(p.number)}, 0, true, ${p.sold ? 0 : 1})`;
    for (const i of imgs) {
      const bytes = fs.statSync(new URL(i.file, PHOTO_DIR)).size;
      await sql`
        insert into media (store_id, key, filename, mime, size_bytes, width, height, alt)
        values (${storeId}, ${i.key}, ${i.key}, 'image/jpeg', ${bytes}, ${i.size[0]}, ${i.size[1]}, ${i.alt})
        on conflict (key) do update set size_bytes = excluded.size_bytes, alt = excluded.alt`;
    }
    console.log(`  piece ${pad(p.number)}: ${p.title} · ${p.price} · ${imgs.length} photos`);
  }
  const bytes = fs.statSync(new URL("./assets/logo_black.png", PHOTO_DIR)).size;
  await sql`
    insert into media (store_id, key, filename, mime, size_bytes, width, height, alt)
    values (${storeId}, 'ma-logo.png', 'ma-logo.png', 'image/png', ${bytes}, 2024, 599, 'Mysterious Archive, New York')
    on conflict (key) do nothing`;

  /* 4. the store's product page + its sections, so it is never half-built (same shape as Add store) */
  let [page] = await sql`select id from pages where store_id = ${storeId} and kind = 'product' and handle = 'product'`;
  if (!page) {
    [page] = await sql`
      insert into pages (store_id, theme_id, kind, product_id, title, handle, visible)
      values (${storeId}, ${theme.id}, 'product', ${ids[0]}, ${site.pieces[0].title}, 'product', false) returning id`;
    for (const [i, type] of SECTION_TYPES.entries()) {
      await sql`insert into sections (page_id, type, position, values, hidden) values (${page.id}, ${type}, ${i}, '{}'::jsonb, false)`;
    }
    console.log("  page + sections: created (not visible; this store's public site is the static Mysterious Archive site)");
  }

  const [{ n }] = await sql`select count(*)::int as n from products where store_id = ${storeId}`;
  const [{ v }] = await sql`select count(*)::int as v from variants where product_id in (select id from products where store_id = ${storeId})`;
  console.log(`done: ${n} products, ${v} variants in store ${STORE.slug}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
