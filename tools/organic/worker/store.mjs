/**
 * Our own store, read the way a visitor reads it.
 *
 * Nobody types the products in. The crew opens the storefront in the brief,
 * walks it — the front page, a collection page or two, then each product —
 * and comes back with what is for sale: title, price, picture, link. That
 * list is what they hunt; add a product to the store and it is hunted on the
 * next sweep without anyone saying so.
 *
 * Nothing here knows which platform the store runs on. It looks for the
 * shapes every storefront has: links that look like products, an og:title,
 * an og:image, a price with a currency sign. Kerberos stores have all of
 * them; so does Shopify; so does anything that wants to be shared.
 */
import { ask, go, sleep } from "./accounts.mjs";
import { between } from "./human.mjs";

const PRODUCT_PATH = /\/(products?|product|item|items|p|shop)\/[^/?#]+/i;
const LISTING_PATH = /\/(collections?|categories?|category|shop|products|all)(\/[^/?#]+)?\/?$/i;

/** Links on the page that look like products, then like listings, same host only. */
async function linksOn(page) {
  const found = await ask(page, () => {
    const here = location.host;
    const out = [];
    for (const a of document.querySelectorAll("a[href]")) {
      let u;
      try { u = new URL(a.getAttribute("href"), location.href); } catch { continue; }
      if (u.host !== here) continue;
      // A product is its path. ?variant=… is the same product in another
      // colour, and would otherwise be read (and hunted) twice.
      u.hash = "";
      u.search = "";
      out.push(u.href);
    }
    return out;
  }, undefined, 8000);
  const all = [...new Set(found ?? [])];
  return {
    products: all.filter((h) => PRODUCT_PATH.test(new URL(h).pathname)),
    listings: all.filter((h) => LISTING_PATH.test(new URL(h).pathname) && !PRODUCT_PATH.test(new URL(h).pathname)),
  };
}

/** One product page: what a share card would show. */
async function readProduct(page) {
  return ask(page, () => {
    const meta = (sel) => document.querySelector(sel)?.getAttribute("content")?.trim() || null;
    const text = (sel) => document.querySelector(sel)?.textContent?.trim() || null;
    const title = meta('meta[property="og:title"]') || text("h1") || document.title || null;
    const image = meta('meta[property="og:image"]') || document.querySelector("main img, img")?.src || null;
    let price = meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]');
    if (!price) {
      const el = document.querySelector('[itemprop="price"]');
      price = el?.getAttribute("content") || el?.textContent || null;
    }
    if (!price) {
      const scope = document.querySelector('[class*="price" i], [data-price]') || document.body;
      const m = /(?:[$€£]\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*(?:\.\d{2})?\s?(?:USD|EUR|GBP))/.exec(scope?.innerText || "");
      price = m ? m[0] : null;
    }
    return { title, image, price: price ? String(price).trim() : null };
  }, undefined, 8000);
}

/**
 * Walk the store. At most `limit` products, at most a few minutes, at a
 * visitor's pace. A store that cannot be opened is a `stopped`, not an
 * empty shop.
 */
export async function readStore(page, url, { limit = 30, budgetMs = 4 * 60 * 1000 } = {}) {
  if (!url) return { products: [], stopped: "no store url" };
  const started = Date.now();
  if (!(await go(page, url))) return { products: [], stopped: "the store did not open" };
  await sleep(between(1200, 2200));

  let { products: productLinks, listings } = await linksOn(page);
  // A front page with few products on it usually links to the shop page.
  for (const listing of listings.slice(0, 3)) {
    if (productLinks.length >= limit || Date.now() - started > budgetMs) break;
    if (!(await go(page, listing))) continue;
    await sleep(between(1000, 2000));
    const more = await linksOn(page);
    productLinks = [...new Set([...productLinks, ...more.products])];
  }
  productLinks = productLinks.slice(0, limit);

  const products = [];
  for (const link of productLinks) {
    if (Date.now() - started > budgetMs) break;
    if (!(await go(page, link))) continue;
    await sleep(between(900, 1800));
    const read = await readProduct(page);
    if (read?.title) products.push({ url: link, title: read.title, price: read.price, image: read.image });
  }
  if (!products.length) return { products, stopped: productLinks.length ? "the product pages did not read" : "no products found on the store" };
  return { products, stopped: null };
}
