/** Money is integer cents everywhere. These are the only places it becomes text. */

export function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Shorter alias used across the admin, where this appears on every screen. */
export const money = formatMoney;

/** Whole-dollar form for metric tiles, e.g. $3,940 */
export function money0(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Percent saved is always calculated, never typed and never stored.
 * Change a price and every badge on the storefront follows.
 */
export function savedPercent(priceCents: number, compareAtCents: number | null): number | null {
  if (!compareAtCents || compareAtCents <= priceCents) return null;
  return Math.round(((compareAtCents - priceCents) / compareAtCents) * 100);
}

export function savedAmount(priceCents: number, compareAtCents: number | null): number | null {
  if (!compareAtCents || compareAtCents <= priceCents) return null;
  return compareAtCents - priceCents;
}

/** Reads a typed price like "89" or "$89.00" into integer cents. */
export function centsFromInput(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "").trim();
  if (!cleaned) return null;
  const asNumber = Number(cleaned);
  if (!Number.isFinite(asNumber)) return null;
  return Math.round(asNumber * 100);
}

/** The inverse, for putting a stored price back into a form field. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}
