/**
 * Stores that wear the Black Reaper storefront, drawer, checkout and thank-you
 * skin. A sister store (Giant Scream) is its own store row with its own payment
 * account and domain, but it is the same site to look at — so every place that
 * used to ask "is this the reaper slug?" asks this instead.
 */
export const REAPER_SKIN_SLUGS: readonly string[] = ["reaper", "giant-scream"];

export function isReaperSkin(slug: string | null | undefined): boolean {
  return Boolean(slug && REAPER_SKIN_SLUGS.includes(slug));
}
