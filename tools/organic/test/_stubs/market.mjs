/** Test stand-in for market.mjs (the real one is another agent's). */
export function termsFromBrief(brief) {
  const queries = [...(brief?.products ?? []), ...(brief?.market ?? [])].map(String);
  return { queries, tags: queries.map((q) => q.toLowerCase().replace(/[^a-z0-9]+/g, "")).filter((t) => t.length >= 4) };
}
export async function adLibrary(page, { query }) {
  return { ads: [{ advertiser: "Stub Co", started: "2025-01-01", img: `https://img.test/${encodeURIComponent(query)}.jpg`, video: null, text: `an ad for ${query}` }], stopped: null };
}
export async function tiktokTag(page, tag) { return { items: [{ url: `https://www.tiktok.com/@stub/video/${tag}1`, handle: "@stub", views: 12000 }], stopped: null }; }
export async function instagramTag(page, tag) { return { items: [{ url: `https://www.instagram.com/reel/${tag}1/`, handle: null, views: null }], stopped: null }; }
