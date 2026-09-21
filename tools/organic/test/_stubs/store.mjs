/** Test stand-in for store.mjs (the real one is another agent's). */
export async function readStore(page, url) {
  if (!url) return { products: [], stopped: "no store url" };
  return { products: [{ title: "Stub Widget", url: url.replace(/\/$/, "") + "/products/stub-widget", price: "$19.99", image: null }], stopped: null };
}
