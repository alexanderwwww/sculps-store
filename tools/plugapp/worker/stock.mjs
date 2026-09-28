/**
 * One piece of stock, listed in two places, sold once.
 *
 * This is the only genuinely new way plug can hurt him, and it is not a
 * rounding error: he owns ONE Birkin. If it is live on Depop and on Vestiaire
 * and both sell, he has taken money for an item he cannot ship, on a platform
 * where that is the fastest way to lose an account — and on Vestiaire, at four
 * figures, with a buyer who is already waiting for authentication.
 *
 * So the record is the item, never the listing. A listing is something the
 * item HAS, on a site, with an id. When one sells, every other listing of that
 * same item comes down before anything else happens.
 *
 * Nothing in here talks to a marketplace. It decides, and hands back what to
 * do — which is what makes it testable without an account, and why it is the
 * first thing in plug that was written rather than carried over.
 */

/** The states a listing can be in, and there are only these. */
export const LIVE = "live";
export const SOLD = "sold";
export const PULLED = "pulled";

/** A fresh record for something he owns. */
export function makeItem({ id, title, priceCents, brand = null, photos = [] }) {
  return {
    id: String(id),
    title: String(title ?? "").trim(),
    priceCents: Number(priceCents) || 0,
    brand,
    photos,
    /* site -> { id, state, at }. One item, many listings. */
    listings: {},
    soldOn: null,
  };
}

/** Record that it went live somewhere. */
export function listed(item, site, listingId, at = Date.now()) {
  return {
    ...item,
    listings: { ...item.listings, [site]: { id: String(listingId), state: LIVE, at } },
  };
}

/**
 * It sold. Say what has to happen everywhere else.
 *
 * Returns the updated item AND the takedowns, rather than doing them, so the
 * caller cannot accidentally mark it sold without also pulling the rest — the
 * two are one decision and they leave this function together.
 */
export function sold(item, site, at = Date.now()) {
  if (!item.listings[site]) {
    return { item, takedowns: [], trouble: `${item.id} was never listed on ${site}` };
  }
  if (item.soldOn && item.soldOn !== site) {
    /* Already gone. This is the case that costs him: two buyers, one item.
       It is reported loudly rather than swallowed, because he has to refund
       somebody and he should hear it from the app first. */
    return {
      item,
      takedowns: [],
      trouble: `${item.id} already sold on ${item.soldOn} — ${site} is a double sale, refund it now`,
    };
  }

  const listings = { ...item.listings };
  const takedowns = [];
  for (const [where, listing] of Object.entries(listings)) {
    if (where === site) {
      listings[where] = { ...listing, state: SOLD, at };
      continue;
    }
    if (listing.state !== LIVE) continue;
    listings[where] = { ...listing, state: PULLED, at };
    takedowns.push({ site: where, listingId: listing.id, why: `sold on ${site}` });
  }
  return { item: { ...item, listings, soldOn: site }, takedowns, trouble: null };
}

/**
 * Is this item allowed to go live on this site right now?
 *
 * Asked before every listing, and it is the cheap half of the protection: the
 * takedown above handles the race, this stops the obvious case where something
 * already sold is put back up by a later pass that had not caught up.
 */
export function canList(item, site) {
  if (item.soldOn) return { ok: false, why: `already sold on ${item.soldOn}` };
  const existing = item.listings[site];
  if (existing && existing.state === LIVE) return { ok: false, why: `already live on ${site}` };
  if (!item.photos.length) return { ok: false, why: "no photos — nothing is listed blind" };
  if (!(item.priceCents > 0)) return { ok: false, why: "no price" };
  return { ok: true, why: null };
}

/** What is still live, for the count the schedule works against. */
export function liveCount(items) {
  return items.filter((item) => Object.values(item.listings).some((l) => l.state === LIVE)).length;
}

/**
 * How many ITEMS were listed today — not how many listings were posted.
 *
 * Cross-listing one item on both marketplaces is one item. Counting listings
 * would let the schedule hit its target by posting the same Birkin twice, and
 * the number he reads would be flattering him by double.
 */
export function listedOn(items, day) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = start.getTime() + 86_400_000;
  return items.filter((item) =>
    Object.values(item.listings).some((l) => l.at >= start.getTime() && l.at < end)
  ).length;
}
