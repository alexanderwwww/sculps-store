// Mock TikTok source — lets the whole app run with zero keys, today.
// Swap for a real adapter by setting DATA_SOURCE in .env (see sources/index.js).

/** @type {import('./types.js').TikTokSource} */
export const mockSource = {
  name: "mock",
  async search(query, opts = {}) {
    const limit = opts.limit ?? 20;
    const POOL = [
      { title: "Electric Spin Scrubber", category: "Home & Kitchen", retailPrice: 39.99, views: 870000 },
      { title: "LED Smart Lights", category: "Home & Lighting", retailPrice: 29.99, views: 730000 },
      { title: "MagSafe Phone Stand", category: "Mobile Accessories", retailPrice: 24.99, views: 610000 },
      { title: "Portable Blender", category: "Kitchen Appliances", retailPrice: 34.99, views: 580000 },
      { title: "Memory Foam Pillow", category: "Travel", retailPrice: 19.99, views: 520000 },
      { title: "Mini Massage Gun", category: "Wellness", retailPrice: 44.99, views: 490000 },
      { title: "Sunset Projector Lamp", category: "Home & Lighting", retailPrice: 27.99, views: 460000 },
      { title: "Acupressure Mat", category: "Wellness", retailPrice: 32.99, views: 430000 },
      { title: "Heated Eye Massager", category: "Wellness", retailPrice: 49.99, views: 410000 },
      { title: "Collapsible Water Bottle", category: "Outdoors", retailPrice: 18.99, views: 390000 },
    ];
    // simulate query relevance + recency by lightly shuffling
    return POOL.slice(0, limit).map((p, i) => ({
      id: `mock-${i}-${p.title.replace(/\W+/g, "-").toLowerCase()}`,
      title: p.title,
      category: p.category,
      retailPrice: p.retailPrice,
      engagement: { views: p.views, likes: Math.round(p.views * 0.08), comments: Math.round(p.views * 0.01), shares: Math.round(p.views * 0.02) },
      velocity: Math.round(p.views / (opts.sinceDays ?? 7)),
      thumbnail: null,
      sourceUrl: "https://www.tiktok.com/",
      raw: { query, note: "mock data" },
    }));
  },
};
