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

const codeFor = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `LUCKY${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
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
