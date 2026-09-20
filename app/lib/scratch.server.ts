/**
 * "Try your luck" — the scratch card on the checkout.
 *
 * Two rules decide how this is built, and they are not negotiable:
 *
 *  1. The draw is real. A prize is picked by a random number weighted by the
 *     table below, at the moment the card is created, and then written down.
 *     Nothing looks at the cart total, the customer, or how close they are to
 *     leaving. A game that shows a predetermined outcome as chance is a
 *     lottery with extra steps and would put his Stripe account at risk.
 *  2. Every card wins something. There is no losing ticket, so nobody is
 *     being pushed to keep playing — there is nothing to keep playing.
 *
 * The odds are printed on the card itself, which is both the honest thing and
 * what the EU rules on prize promotions expect.
 */
import { and, eq } from "drizzle-orm";
import type { makeDb } from "../db/client";
import { discounts, scratchPlays } from "../db/schema";

/** percent off → how many cards in a hundred draw it. Must sum to 100. */
export const SCRATCH_PRIZES = [
  { percent: 5, weight: 55 },
  { percent: 10, weight: 35 },
  { percent: 15, weight: 9 },
  { percent: 30, weight: 1 },
] as const;

export const SCRATCH_ODDS_TEXT = SCRATCH_PRIZES.map(
  (p) => `${p.percent}% off — ${p.weight} in 100`,
).join(" · ");

function draw(): number {
  // crypto, not Math.random: the draw should not be guessable from the page.
  const roll = crypto.getRandomValues(new Uint32Array(1))[0]! % 100;
  let seen = 0;
  for (const prize of SCRATCH_PRIZES) {
    seen += prize.weight;
    if (roll < seen) return prize.percent;
  }
  return SCRATCH_PRIZES[0]!.percent;
}

const codeFor = (prefix = "LUCKY") => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
};

export interface ScratchPlay {
  percent: number;
  code: string;
}

/**
 * The card for this cart. Called again for the same cart it returns the same
 * prize — a refresh is not a second go.
 */
export async function scratchPlayFor(
  db: ReturnType<typeof makeDb>,
  storeId: string,
  cartToken: string,
): Promise<ScratchPlay> {
  const [existing] = await db
    .select({ percent: scratchPlays.percent, code: scratchPlays.code })
    .from(scratchPlays)
    .where(and(eq(scratchPlays.storeId, storeId), eq(scratchPlays.cartToken, cartToken)))
    .limit(1);
  if (existing) return existing;

  const percent = draw();
  const code = codeFor();

  // The prize is a real discount row, so it goes through exactly the same
  // checks, limits and reporting as a code he typed himself — and shows up in
  // Discounts with its redemptions.
  const [discount] = await db
    .insert(discounts)
    .values({
      storeId,
      code,
      kind: "percentage",
      value: percent,
      appliesTo: "order",
      usageLimit: 1,
      oncePerCustomer: true,
      active: true,
    })
    .returning({ id: discounts.id });

  try {
    await db.insert(scratchPlays).values({ storeId, cartToken, percent, code, discountId: discount?.id ?? null });
  } catch {
    // Two tabs drew at once. The first one written is the real card.
    const [won] = await db
      .select({ percent: scratchPlays.percent, code: scratchPlays.code })
      .from(scratchPlays)
      .where(and(eq(scratchPlays.storeId, storeId), eq(scratchPlays.cartToken, cartToken)))
      .limit(1);
    if (won) return won;
  }

  return { percent, code };
}

/* ------------------------------------------------------------- the claim */

/**
 * "Claim an extra $5 off." One tap, one time, per cart.
 *
 * Not a game: the customer already has the shop's discounts and does not
 * need to be made to work for five dollars. The pop-up asks once, the tap
 * claims it, and the code is applied for them.
 *
 * "Extra" has to mean extra. The cart holds one code at a time, so if one is
 * already applied the claim does not replace it with a smaller one -- that
 * would be a five dollar penalty dressed as a gift. Instead a new single-use
 * code is minted worth what they already had PLUS five dollars, in cents,
 * and that replaces the old one. A percentage they already had is turned
 * into its dollar value on today's subtotal first. Dollars only: the number
 * has to be pictureable, and a percent is not.
 */
import { CLAIM_EXTRA_CENTS } from "./claim";
export { CLAIM_EXTRA_CENTS };

export interface ClaimPlay {
  /** the code now applied to the cart */
  code: string;
  /** what that code is worth in total, cents */
  amountCents: number;
  /** the five dollars on top of whatever was already there */
  extraCents: number;
}

export async function claimExtraFor(
  db: ReturnType<typeof makeDb>,
  storeId: string,
  cartToken: string,
  // `kind` is whatever the discounts row holds; only two of its values matter here.
  already: { kind: string; value: number } | null,
  subtotalCents: number,
): Promise<ClaimPlay> {
  const [existing] = await db
    .select({ amountCents: scratchPlays.amountCents, code: scratchPlays.code })
    .from(scratchPlays)
    .where(and(eq(scratchPlays.storeId, storeId), eq(scratchPlays.cartToken, cartToken)))
    .limit(1);
  if (existing && existing.amountCents) {
    return { code: existing.code, amountCents: existing.amountCents, extraCents: CLAIM_EXTRA_CENTS };
  }

  // What they walked in with, as dollars, so the new code never pays less.
  let base = 0;
  if (already?.kind === "fixed") base = Math.max(0, already.value);
  else if (already?.kind === "percentage") base = Math.round((Math.min(100, Math.max(0, already.value)) / 100) * subtotalCents);
  const amountCents = base + CLAIM_EXTRA_CENTS;
  const code = codeFor("EXTRA");

  const [discount] = await db
    .insert(discounts)
    .values({
      storeId,
      code,
      kind: "fixed",
      value: amountCents,
      appliesTo: "order",
      usageLimit: 1,
      oncePerCustomer: true,
      active: true,
    })
    .returning({ id: discounts.id });

  try {
    await db.insert(scratchPlays).values({ storeId, cartToken, percent: 0, amountCents, code, discountId: discount?.id ?? null });
  } catch {
    // Two tabs claimed at once. The first one written is the one that counts.
    const [won] = await db
      .select({ amountCents: scratchPlays.amountCents, code: scratchPlays.code })
      .from(scratchPlays)
      .where(and(eq(scratchPlays.storeId, storeId), eq(scratchPlays.cartToken, cartToken)))
      .limit(1);
    if (won && won.amountCents) return { code: won.code, amountCents: won.amountCents, extraCents: CLAIM_EXTRA_CENTS };
  }
  return { code, amountCents, extraCents: CLAIM_EXTRA_CENTS };
}
