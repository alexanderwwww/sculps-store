// Real adapter: Apify TikTok Shop scraper actor — robust, paid, returns ACTUAL
// products (name / price / sales / creators). This is the "real product data" path.
//
// Setup: create an Apify account, get APIFY_TOKEN, pick an actor (e.g.
//   the-ai-entrepreneur-ai-hub/tiktok-shop-scraper). Set in .env:
//   DATA_SOURCE=apify  APIFY_TOKEN=...  APIFY_ACTOR=the-ai-entrepreneur-ai-hub~tiktok-shop-scraper
//
// Uses Node 18+ global fetch. Actor INPUT fields vary per actor — adjust `input` below
// to match the actor's documented schema.

/** @type {import('./types.js').TikTokSource} */
export const apifySource = {
  name: "apify(tiktok-shop)",
  async search(query, opts = {}) {
    const token = process.env.APIFY_TOKEN;
    const actor = process.env.APIFY_ACTOR || "the-ai-entrepreneur-ai-hub~tiktok-shop-scraper";
    if (!token) throw new Error("APIFY_TOKEN missing in .env");

    const input = { search: query, keyword: query, maxItems: opts.limit ?? 20, region: opts.region ?? "US" };
    const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error(`Apify ${r.status}: ${await r.text()}`);
    const items = await r.json();

    return items.map((p, i) => ({
      id: `shop-${p.id ?? p.productId ?? i}`,
      title: p.title ?? p.productName ?? p.name ?? "Untitled product",
      category: p.category ?? null,
      retailPrice: Number(p.price ?? p.salePrice ?? p.minPrice ?? 0) || null,
      engagement: { views: p.views ?? null, likes: p.likes ?? null, comments: null, shares: p.sales ?? p.soldCount ?? null },
      velocity: Number(p.sales ?? p.soldCount ?? 0) || null,
      thumbnail: p.image ?? p.thumbnail ?? p.cover ?? null,
      sourceUrl: p.url ?? p.productUrl ?? null,
      raw: p,
    }));
  },
};
