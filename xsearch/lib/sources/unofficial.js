// Real adapter: drawrowfly/tiktok-scraper  (npm: tiktok-scraper)  — free, unofficial.
// Returns trending / hashtag VIDEOS (not products). The Claude brain step later
// infers the actual product being sold in each video. For direct product+price
// data, use the apify (TikTok Shop) adapter instead.
//
// Install on your machine:  npm i tiktok-scraper
// Caveat: unofficial scraper — breaks when TikTok changes, may need proxies/cookies.

/** @type {import('./types.js').TikTokSource} */
export const unofficialSource = {
  name: "unofficial(tiktok-scraper)",
  async search(query, opts = {}) {
    const number = opts.limit ?? 20;
    let TikTokScraper;
    try {
      TikTokScraper = (await import("tiktok-scraper")).default ?? (await import("tiktok-scraper"));
    } catch {
      throw new Error('tiktok-scraper not installed. Run: npm i tiktok-scraper');
    }
    const tag = (query || "").replace(/^#/, "").trim();
    const res = tag
      ? await TikTokScraper.hashtag(tag, { number })
      : await TikTokScraper.trend("", { number });
    const items = res?.collector ?? [];
    return items.map((it, i) => ({
      id: `tt-${it.id ?? i}`,
      title: (it.text || "").slice(0, 90) || `TikTok video ${it.id ?? i}`,
      category: it.hashtags?.[0]?.name ?? null,
      retailPrice: null, // videos don't carry price — brain/shop adapter fills this
      engagement: {
        views: it.playCount ?? null, likes: it.diggCount ?? null,
        comments: it.commentCount ?? null, shares: it.shareCount ?? null,
      },
      velocity: Math.round((it.playCount || 0) / (opts.sinceDays ?? 7)),
      thumbnail: it.covers?.default ?? it.imageUrl ?? null,
      sourceUrl: it.webVideoUrl ?? null,
      raw: it,
    }));
  },
};
