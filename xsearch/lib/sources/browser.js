// Real adapter (the "eyes + fingers" dream): drive a REAL Chromium with Playwright,
// reusing a logged-in TikTok session, search a keyword, and scrape the feed.
// Modeled on Masriyan/CrotDalam.
//
// ⚠️ USE A BURNER TIKTOK ACCOUNT — automating your main can get it shadowbanned/blocked.
// ⚠️ Fragile + ToS-gray. Expect captchas (see gbiz123/tiktok-captcha-solver) and breakage.
//
// Setup on your machine:
//   npm i playwright && npx playwright install chromium
//   # log in once manually into the profile dir so the session persists:
//   DATA_SOURCE=browser  TT_PROFILE_DIR=./.tt-profile
//
// This is a SCAFFOLD — the DOM-extraction selectors change often and must be
// maintained. Fill in the marked section against the live page.

/** @type {import('./types.js').TikTokSource} */
export const browserSource = {
  name: "browser(playwright)",
  async search(query, opts = {}) {
    let chromium;
    try { ({ chromium } = await import("playwright")); }
    catch { throw new Error('playwright not installed. Run: npm i playwright && npx playwright install chromium'); }

    const number = opts.limit ?? 20;
    const ctx = await chromium.launchPersistentContext(
      process.env.TT_PROFILE_DIR || "./.tt-profile", // a logged-in BURNER session lives here
      { headless: false } // headful is harder to detect
    );
    const page = await ctx.newPage();
    try {
      await page.goto(`https://www.tiktok.com/search?q=${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded" });
      // TODO (maintained per TikTok DOM changes):
      //  1) detect + solve captcha if present
      //  2) scroll until >= `number` result cards are loaded
      //  3) extract each card: description, author, view/like counts, video url, thumbnail
      const raw = await page.evaluate(() => []); // <-- DOM extraction goes here

      return raw.slice(0, number).map((it, i) => ({
        id: `br-${i}`,
        title: it.desc ?? `result ${i}`,
        category: null,
        retailPrice: null,
        engagement: { views: it.views ?? null, likes: it.likes ?? null, comments: null, shares: null },
        velocity: null,
        thumbnail: it.thumb ?? null,
        sourceUrl: it.url ?? null,
        raw: it,
      }));
    } finally {
      await ctx.close();
    }
  },
};
