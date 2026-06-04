// Source registry. Pick the TikTok data source via env: DATA_SOURCE=mock|unofficial|apify|browser
// This is the seam that makes the TikTok connection swappable — the rest of the
// app calls getSource() and never knows or cares which one is active.

import { mockSource } from "./mock.js";

async function loadReal(name) {
  switch (name) {
    case "unofficial": return (await import("./unofficial.js")).unofficialSource; // tiktok-scraper (free, fragile)
    case "apify":      return (await import("./apify.js")).apifySource;           // TikTok Shop via Apify (paid, robust)
    case "browser":    return (await import("./browser.js")).browserSource;       // Playwright eyes+fingers (burner acct)
    default:
      throw new Error(`DATA_SOURCE="${name}" unknown. Use: mock | unofficial | apify | browser`);
  }
}

/** @returns {Promise<import('./types.js').TikTokSource>} */
export async function getSource() {
  const name = (process.env.DATA_SOURCE || "mock").toLowerCase();
  if (name === "mock") return mockSource;
  return loadReal(name);
}
