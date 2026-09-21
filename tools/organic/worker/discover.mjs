/**
 * Discovery: from what we sell to places nobody named.
 *
 * The brief gives a store and maybe a few words. The store gives products.
 * Products give search terms and hashtags. Hashtag pages give clips, and
 * the clips carry other hashtags — the ones the people who actually post
 * this stuff use, which are never the ones we would have guessed. Those go
 * into the next sweep, ranked by how many views sat next to them. That is
 * how the crew ends up finding more than Alex would by hand.
 */

const STOP = new Set([
  "the", "and", "for", "with", "from", "this", "that", "your", "our", "new", "set", "pack", "pcs",
  "inch", "inches", "feet", "foot", "size", "large", "small", "mini", "big", "led", "usb",
]);

const compact = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const words = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9\s]+/g, " ").split(/\s+/).filter(Boolean);

/**
 * Search queries and hashtags from the products and the brief.
 *
 * Titles as they are for search; the whole title run together as a tag;
 * the title's meaningful words as tags of their own (a "Crawling Zombie"
 * lives under #zombie far more than under #crawlingzombie); the brief's
 * market terms and #tags on top. Deduped, capped, in that order of trust.
 */
export function expandTerms(products = [], brief = {}) {
  const queries = [];
  const tags = [];
  const addQ = (q) => { const t = String(q ?? "").trim(); if (t && !queries.some((x) => x.toLowerCase() === t.toLowerCase())) queries.push(t); };
  const addT = (t) => { const c = compact(t); if (c.length >= 4 && !tags.includes(c)) tags.push(c); };

  for (const p of products) {
    const title = String(p?.title ?? "").replace(/\s*[|–—-]\s*[^|–—-]*$/, "").trim(); // drop " — Store Name"
    if (!title) continue;
    addQ(title);
    addT(title);
    for (const w of words(title)) if (w.length >= 5 && !STOP.has(w) && !/^\d+$/.test(w)) addT(w);
  }
  for (const q of brief.products ?? []) { addQ(q); addT(q); }
  for (const q of brief.market ?? []) { addQ(q); addT(q); }
  for (const m of String(brief.notes ?? "").matchAll(/#([a-z0-9_]{3,40})/gi)) addT(m[1]);

  return { queries: queries.slice(0, 12), tags: tags.slice(0, 16) };
}

/**
 * The hashtags on the page we are looking at — the ones the platform links,
 * not ones we invented. TikTok links them as /tag/<name>, Instagram as
 * /explore/tags/<name>/; both also print them as #name in captions.
 */
export async function relatedTags(page, { except = [], limit = 20, ask } = {}) {
  if (!page || page.isClosed?.()) return [];
  const evaluate = ask
    ? (fn) => ask(page, fn, undefined, 8000)
    : (fn) => Promise.race([page.evaluate(fn), new Promise((r) => setTimeout(() => r(null), 8000))]).catch(() => null);
  const found = await evaluate(() => {
    const counts = new Map();
    const bump = (t) => { t = t.toLowerCase(); if (t.length >= 3) counts.set(t, (counts.get(t) ?? 0) + 1); };
    for (const a of document.querySelectorAll('a[href*="/tag/"], a[href*="/explore/tags/"]')) {
      const m = /\/(?:tag|explore\/tags)\/([a-z0-9_]+)/i.exec(a.getAttribute("href") || "");
      if (m) bump(m[1]);
    }
    for (const m of (document.body?.innerText || "").matchAll(/#([a-z0-9_]{3,40})/gi)) bump(m[1]);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  });
  const skip = new Set((except ?? []).map((t) => compact(t)));
  return (found ?? []).filter((t) => !skip.has(t)).slice(0, limit);
}

/**
 * Rank discovered tags for the next sweep: the ones that sat beside the
 * most views first, then the ones seen most often. Pure.
 */
export function rankTags(seen) {
  // seen: [{ tag, views, from }]
  const score = new Map();
  for (const s of seen ?? []) {
    const t = compact(s.tag);
    if (!t) continue;
    const cur = score.get(t) ?? { tag: t, views: 0, times: 0 };
    cur.views += Number(s.views ?? 0) || 0;
    cur.times += 1;
    score.set(t, cur);
  }
  return [...score.values()].sort((a, b) => b.views - a.views || b.times - a.times);
}
