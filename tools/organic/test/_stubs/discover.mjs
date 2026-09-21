/** Test stand-in for discover.mjs (the real one is another agent's). */
export function expandTerms(products = [], brief = {}) {
  const queries = [...products.map((p) => p.title), ...(brief.products ?? []), ...(brief.market ?? [])];
  const tags = queries.map((q) => String(q).toLowerCase().replace(/[^a-z0-9]+/g, "")).filter((t) => t.length >= 4);
  return { queries: [...new Set(queries)], tags: [...new Set(tags)] };
}
export async function relatedTags(page, { except = [] } = {}) {
  return ["discoveredtag", "anotherone"].filter((t) => !except.includes(t));
}
export function rankTags(seen) {
  return (seen ?? []).slice().sort((a, b) => (b.views || 0) - (a.views || 0));
}
