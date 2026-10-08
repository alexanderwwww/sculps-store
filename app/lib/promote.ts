/**
 * Which products a store pushes in its checkout add-ons and after-purchase
 * offers. A store not listed here offers everything it sells.
 *
 * Black Reaper (Alex, 2026-10-02): only the Scream, the Reaper and the
 * Haunted Projector. Alex, 2026-10-08: the zombie and the projector are out of
 * the checkout add-ons and the after-purchase offers.
 */
export const PROMOTED_HANDLES: Record<string, readonly string[]> = {
  reaper: ["the-scream", "black-reaper"],
  "giant-scream": ["the-scream", "black-reaper"],
};

export function isPromoted(storeSlug: string | null | undefined, handle: string | null | undefined): boolean {
  const list = storeSlug ? PROMOTED_HANDLES[storeSlug] : undefined;
  if (!list) return true;
  return Boolean(handle && list.includes(handle));
}
