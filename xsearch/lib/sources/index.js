// Source registry. Pick the TikTok data source via env: DATA_SOURCE=mock|apify|unofficial|kalodata
// This is the seam that makes the TikTok connection swappable — the rest of the
// app calls getSource() and never knows or cares which one is active.

import { mockSource } from "./mock.js";

/**
 * Real adapters get registered here as we build them. Each must implement
 * the TikTokSource contract in types.js. Stubs throw a clear message until done.
 */
async function loadReal(name) {
  switch (name) {
    // case "unofficial": return (await import("./unofficial.js")).unofficialSource; // open-source scraper (free, fragile)
    // case "apify":      return (await import("./apify.js")).apifySource;           // scraper-as-a-service (robust, paid)
    // case "kalodata":   return (await import("./kalodata.js")).kalodataSource;     // TikTok Shop analytics API (paid)
    default:
      throw new Error(
        `DATA_SOURCE="${name}" is not implemented yet. ` +
        `Available now: "mock". Real adapters slot in here once we pick the source.`
      );
  }
}

/** @returns {Promise<import('./types.js').TikTokSource>} */
export async function getSource() {
  const name = (process.env.DATA_SOURCE || "mock").toLowerCase();
  if (name === "mock") return mockSource;
  return loadReal(name);
}
