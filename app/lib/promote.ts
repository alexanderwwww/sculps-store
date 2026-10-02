/**
 * Which products a store pushes in its checkout add-ons and after-purchase
 * offers. A store not listed here offers everything it sells.
 *
 * Black Reaper (Alex, 2026-10-02): only the Scream, the Reaper and the
 * Haunted Projector.
 */
export const PROMOTED_HANDLES: Record<string, readonly string[]> = {
  reaper: ["the-scream", "black-reaper", "haunted-projector"],
};

export function isPromoted(storeSlug: string | null | undefined, handle: string | null | undefined): boolean {
  const list = storeSlug ? PROMOTED_HANDLES[storeSlug] : undefined;
  if (!list) return true;
  return Boolean(handle && list.includes(handle));
}
