/*
 * Competitor stores. Read-only.
 *
 * Domains come from the Ad Library landing links and any shop links seen.
 * Marketplaces are skipped. Each store's homepage is visited visibly (the
 * cursor hovers it, the free-shipping line is read off the page text) and
 * /products.json?limit=50 is fetched from Node: Shopify stores answer it with
 * every product, price and compare-at price.
 */
import { SITES, visit, diag, breathe, say, readDown, bodyText, errorOf } from "./common.mjs";
import { price } from "../parse.mjs";

const MARKETPLACES = /(^|\.)(amazon|temu|aliexpress|alibaba|etsy|ebay|walmart|tiktok|instagram|facebook|fb|meta|google|youtube|shein|target|bestbuy|linktr|bit|wish)\.[a-z.]+$/i;

export function domainOf(href) {
  try {
    const h = new URL(href).host.toLowerCase().replace(/^www\./, "");
    return h || null;
  } catch { return null; }
}

/** Unique, non-marketplace domains, max `n`. */
export function pickDomains(hrefs, n = 6) {
  const out = [];
  for (const h of hrefs || []) {
    const d = domainOf(h);
    if (!d || MARKETPLACES.test(d.split(":")[0]) || out.includes(d)) continue;
    out.push(d);
    if (out.length >= n) break;
  }
  return out;
}

const OFFER = /\bbundle\b|\bpack\b|\bset\b|buy\s*2|\b2\s*x\b|\b2x\b|\bbogo\b|\d+\s*%\s*off/i;

export function productsFrom(json, base) {
  const list = json && Array.isArray(json.products) ? json.products : [];
  return list.map((p) => {
    const vs = Array.isArray(p.variants) ? p.variants : [];
    const prices = vs.map((v) => price(v.price)).filter((x) => x !== null);
    const cmp = vs.map((v) => price(v.compare_at_price)).filter((x) => x !== null);
    const names = [p.title, ...vs.map((v) => v.title)].join(" | ");
    return {
      title: String(p.title || "").slice(0, 160),
      price: prices.length ? Math.min(...prices) : null,
      compareAt: cmp.length ? Math.max(...cmp) : null,
      url: p.handle ? `${base}/products/${p.handle}` : null,
      offer: OFFER.test(names),
    };
  });
}

export function freeShippingIn(text) {
  const m = /free\s+(?:US\s+|standard\s+)?shipping\s+(?:on\s+(?:all\s+)?orders\s+)?(?:over|above|on orders over|\$?\d)\s*\$?\s*(\d{1,4}(?:\.\d{2})?)/i.exec(String(text || ""))
    || /free\s+shipping\s+(?:over|above)\s*\$\s*(\d{1,4})/i.exec(String(text || ""));
  return m ? Number(m[1]) : null;
}

async function fetchJson(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

export async function sweep(page, domains, ctx) {
  const out = { source: "stores", stores: [], diag: [] };
  for (const domain of (domains || []).slice(0, 6)) {
    if (ctx.shouldStop && ctx.shouldStop()) break;
    const base = `${SITES.storeProto()}://${domain}`;
    const store = { domain, shopify: false, products: [], freeShippingOver: null, blocked: null };
    try {
      await say(page, ctx, `Store · ${domain}`);
      const err = await visit(page, base + "/", ctx);
      if (err) store.blocked = err;
      else {
        await breathe(ctx);
        await readDown(page, ctx, 2);
        store.freeShippingOver = freeShippingIn(await bodyText(page, 20000));
      }
      const j = await fetchJson(`${base}/products.json?limit=50`);
      if (j && Array.isArray(j.products)) {
        store.shopify = true;
        store.products = productsFrom(j, base);
      }
      await say(page, ctx, `Store · ${domain} · ${store.products.length} products`);
      ctx.log && ctx.log(`Store ${domain}: ${store.shopify ? `Shopify, ${store.products.length} products` : "not Shopify / no products.json"}${store.freeShippingOver ? `, free shipping over $${store.freeShippingOver}` : ""}`);
      out.diag.push(await diag(page, { products: store.products.length }));
    } catch (e) {
      store.blocked = errorOf(e);
    }
    out.stores.push(store);
  }
  return out;
}
