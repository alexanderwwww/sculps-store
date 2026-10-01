/**
 * Product from a link: fetch the page and read what a shop page already says about itself
 * (schema.org Product JSON-LD first, then Open Graph tags). No scraping tricks, no login.
 * Returns { url, title, desc, price, currency, images[] }.
 */
const clean = (t) => String(t || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

function metas(html) {
  const out = {};
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0]; const k = /(?:property|name)=["']([^"']+)["']/i.exec(tag); const v = /content=["']([^"']*)["']/i.exec(tag);
    if (k && v) (out[k[1].toLowerCase()] ||= []).push(v[1]);
  }
  return out;
}
function jsonld(html) {
  const found = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const d = JSON.parse(m[1]); const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { if (/Product/i.test([].concat(x["@type"] || []).join(","))) found.push(x); if (x["@graph"]) walk(x["@graph"]); } }; walk(d); } catch { /* not ours */ }
  }
  return found[0] || null;
}

async function fetchProduct(url, fetchImpl = globalThis.fetch) {
  let u; try { u = new URL(url); } catch { throw new Error("That does not look like a web address."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https links.");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname) && !process.env.XUGC_ALLOW_LOCAL) throw new Error("That address is private.");
  const r = await fetchImpl(u.href, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh) XUGC", Accept: "text/html" }, redirect: "follow" });
  if (!r.ok) throw new Error(`The page answered ${r.status}.`);
  const html = (await r.text()).slice(0, 2_000_000);
  const m = metas(html), ld = jsonld(html);
  const first = (k) => (m[k] && m[k][0]) || "";
  const imgs = [];
  const add = (x) => { for (const i of [].concat(x || [])) { const s = typeof i === "string" ? i : i && (i.url || i.contentUrl); if (s) { try { const a = new URL(s, u.href).href; if (!imgs.includes(a)) imgs.push(a); } catch {} } } };
  if (ld) add(ld.image);
  for (const i of m["og:image"] || []) add(i);
  const offer = ld && [].concat(ld.offers || [])[0];
  const title = clean((ld && ld.name) || first("og:title") || (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1]);
  if (!title) throw new Error("Could not find a product on that page.");
  return {
    url: u.href, title: title.slice(0, 140),
    desc: clean((ld && ld.description) || first("og:description") || first("description")).slice(0, 400),
    price: (offer && (offer.price || (offer.priceSpecification && offer.priceSpecification.price))) || first("product:price:amount") || first("og:price:amount") || "",
    currency: (offer && offer.priceCurrency) || first("product:price:currency") || "",
    images: imgs.slice(0, 8),
  };
}
module.exports = { fetchProduct };
