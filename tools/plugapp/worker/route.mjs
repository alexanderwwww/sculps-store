/**
 * Which marketplace an item belongs on.
 *
 * This is the decision that makes plug worth building, and it comes from a
 * real failure rather than from a preference: on Depop his watches drew
 * thousands of views and not one sale. That was never traffic. Nobody buys a
 * €16,800 Rolex from an account with no reviews, and Depop's buyer protection
 * was not built for that number.
 *
 * Vestiaire is where that buyer already is, and its authentication answers the
 * trust question so he does not have to earn it first. So:
 *
 *   Depop      earns the reviews, with the pieces that move fastest there.
 *   Vestiaire  carries the high ticket, from day one.
 *
 * His ceiling on Depop is his review count, not his stock. The stock is
 * already the best on the platform.
 */

/** Where the line falls, in cents, and why. */
export const DEPOP_CEILING = 40_000;   // €400 — the top of what Depop's buyer spends
export const VESTIAIRE_FLOOR = 50_000; // €500 — the bottom of what Vestiaire's buyer expects

/**
 * Reviews are the whole ladder.
 *
 * Five reviews make €850 credible. Twenty make €5,200 credible. Below five,
 * nothing above the Depop ceiling should be sitting there hoping — it belongs
 * where the buyer already exists.
 */
export const REVIEWS_FOR_MID = 5;
export const REVIEWS_FOR_HIGH = 20;

/**
 * Decide, and say why in one line.
 *
 * The reason matters as much as the answer: he reads it, and a routing he
 * cannot follow is one he will overrule at the wrong moment.
 */
export function routeFor(item, shop = {}) {
  const price = Number(item?.priceCents);
  const reviews = Number(shop.depopReviews ?? 0);
  if (!Number.isFinite(price) || price <= 0) {
    return { sites: [], why: "no price — nothing is listed at a number we cannot defend" };
  }

  if (price <= DEPOP_CEILING) {
    /* The cheap end is Depop's, and it is also how the ladder gets climbed:
       every one of these is a review, and the reviews are what unlock the rest
       of his stock. */
    return { sites: ["depop"], why: "Depop's buyer spends here, and it earns a review" };
  }

  if (price >= VESTIAIRE_FLOOR) {
    /* High ticket goes to Vestiaire regardless of review count, because
       Vestiaire's authentication carries the trust rather than his account. */
    const both = reviews >= REVIEWS_FOR_HIGH;
    return {
      sites: both ? ["vestiaire", "depop"] : ["vestiaire"],
      why: both
        ? "Vestiaire leads; with twenty reviews Depop is credible at this number too"
        : "Vestiaire — its authentication carries the trust his account has not earned yet",
    };
  }

  /* The band between the two: it only belongs on Depop once the account can
     hold it up. */
  if (reviews >= REVIEWS_FOR_MID) {
    return { sites: ["depop", "vestiaire"], why: `${reviews} reviews make this credible on Depop` };
  }
  return {
    sites: ["vestiaire"],
    why: `under ${REVIEWS_FOR_MID} reviews, Depop cannot hold this price yet`,
  };
}

/**
 * What the shop should hunt next.
 *
 * Not "what is expensive" — what moves. The ladder is the strategy, so while
 * the review count is low the hunt is pointed at the band that earns reviews,
 * and it widens as they arrive.
 */
export function huntBand(shop = {}) {
  const reviews = Number(shop.depopReviews ?? 0);
  if (reviews < REVIEWS_FOR_MID) {
    return {
      minCents: 15_000,
      maxCents: DEPOP_CEILING,
      why: "€150–400 designer: what Depop buyers actually hunt, and every sale is a review",
    };
  }
  if (reviews < REVIEWS_FOR_HIGH) {
    return {
      minCents: 25_000,
      maxCents: 120_000,
      why: `${reviews} reviews — the mid band is open now`,
    };
  }
  return {
    minCents: 25_000,
    maxCents: Infinity,
    why: "the account can hold any number his stock can reach",
  };
}
