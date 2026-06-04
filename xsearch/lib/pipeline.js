// The scan pipeline — the spine of XSEARCH.
//   TikTok source  →  (later) sourcing enrich  →  (later) Claude scoring  →  rank
// Each stage is a clean seam. Today only stage 1 is real; 2 & 3 are honest TODOs.

import { getSource } from "./sources/index.js";

/**
 * @param {string} query
 * @param {import('./sources/types.js').SearchOpts} [opts]
 */
export async function scan(query, opts = {}) {
  const source = await getSource();

  // 1) TikTok signal (real once a source adapter is plugged in)
  const signals = await source.search(query, { limit: 20, sinceDays: 7, ...opts });

  // 2) TODO Phase "Sourcing": enrich each product with wholesale cost + margin
  //    from CJ / 1688 / Alibaba adapters. For now, leave cost null.
  const enriched = signals.map((s) => ({ ...s, cost: null, margin: null }));

  // 3) TODO Phase "Brain": ask Claude for X Score + winning angle + compliance flag.
  //    Placeholder ranking = engagement velocity until the brain is wired.
  const scored = enriched
    .map((s) => ({ ...s, xScore: null, angle: null, compliance: null }))
    .sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0))
    .map((s, i) => ({ ...s, rank: i + 1, xScore: 96 - i })); // demo score until brain lands

  return { query, source: source.name, count: scored.length, products: scored };
}
