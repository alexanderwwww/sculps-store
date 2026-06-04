// The scan pipeline:  TikTok source  →  ecom brain (score/risk/validate)  →  ranked.
import { getSource } from "./sources/index.js";
import { rank } from "./scoring.js";

/**
 * @param {string} query
 * @param {import('./sources/types.js').SearchOpts} [opts]
 */
export async function scan(query, opts = {}) {
  const source = await getSource();
  const signals = await source.search(query, { limit: 20, sinceDays: 7, ...opts });
  const products = rank(signals); // real X Score, risk, validation, angles, verdict
  return { query, source: source.name, count: products.length, products };
}
