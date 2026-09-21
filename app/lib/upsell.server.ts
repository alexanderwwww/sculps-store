/**
 * The offer made after the money has already moved.
 *
 * A post-purchase offer is the only upsell in a shop that costs nothing to
 * show. The customer has paid, the order is safe, and the page they are on is
 * one they were going to look at anyway — so an offer here cannot lose a sale
 * that was already made. That is what makes it worth building before pop-ups
 * or anything else that interrupts somebody on their way to paying.
 *
 * The mechanism is one tap. The card that paid a minute ago is still on file,
 * so taking the offer is a button rather than a checkout: no address, no card
 * number, no second confirmation email to be ignored. Asking for any of that
 * back is why almost nobody takes one of these.
 *
 * Three rules it keeps:
 *
 *   It is never the thing they just bought. Somebody who has this minute
 *   bought two reapers does not want a third at a discount — that is a
 *   refund request with extra steps.
 *
 *   It is cheap next to what they spent. The offer that gets taken is the one
 *   that feels like nothing beside the number already on the receipt, which
 *   is why it is the shop's least expensive product rather than its best.
 *
 *   And a decline is final for that order. An offer that comes back is a
 *   shop arguing with somebody who has already said no.
 */
import { and, asc, eq, ne } from "drizzle-orm";
import type { DB } from "~/db/client";
import { orderItems, orders, products, variants } from "~/db/schema";
import { providerForStore } from "./payments.server";
import { recordOrderEvent } from "./admin.server";

export interface PostPurchaseOffer {
  variantId: string;
  productTitle: string;
  variantLabel: string;
  imageUrl: string | null;
  /** What it costs everywhere else on the shop. */
  normalCents: number;
  /** What it costs on this page, for the next few minutes. */
  offerCents: number;
  savingCents: number;
}

/** Dollars off, never a percentage — the number has to be pictureable. */
function discountFor(cents: number): number {
  if (cents >= 20000) return 6000;
  if (cents >= 10000) return 3500;
  if (cents >= 5000) return 2000;
  if (cents >= 2500) return 1000;
  return 500;
}

/**
 * What to offer on this order's thank-you page, or nothing.
 *
 * Nothing is a perfectly good answer: a shop with one product, an order that
 * already contains everything cheap, or an order paid some other way all end
 * up here, and an offer that cannot be taken in one tap should not be shown
 * at all.
 */
/** The least we will charge a card for a post-purchase add. */
const MIN_OFFER_CENTS = 100;

export async function offersForOrder(db: DB, orderId: string): Promise<PostPurchaseOffer[]> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.paymentStatus !== "paid" || !order.paymentRef) return [];
  /* Only a no ends it.
     This also stopped at "taken", so adding one thing closed the whole
     shelf. The card is still on file after the first add and the page is
     still open, so there is no reason the second one cannot be bought the
     same way. Anything already on the order drops out below. */
  if (order.upsellState === "declined") return [];

  const bought = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const boughtVariants = new Set(bought.map((l) => l.variantId).filter(Boolean) as string[]);
  const boughtTitles = new Set(bought.map((l) => l.title));

  const rows = await db
    .select({
      variantId: variants.id,
      label: variants.label,
      priceCents: variants.priceCents,
      variantImage: variants.imageUrl,
      productTitle: products.title,
      images: products.images,
      available: variants.available,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(products.storeId, order.storeId), eq(products.status, "active")))
    .orderBy(asc(variants.priceCents));

  /* Every other product gets a turn.
     This took the first row of a price-ascending list, so the answer was the
     cheapest thing in the shop for every customer of every order -- the same
     Haunted Projector, forever, no matter what they had just bought.

     One entry per product now, cheapest variant of each, and which one is
     offered rotates with the order rather than being fixed. The rotation is
     derived from the order's own id, so a refresh shows the same offer and
     the countdown means something. */
  const eligible: typeof rows = [];
  const seenProducts = new Set<string>();
  for (const r of rows) {
    if (seenProducts.has(r.productTitle)) continue;
    if (boughtVariants.has(r.variantId) || boughtTitles.has(r.productTitle)) continue;
    if (r.available <= 0) continue;
    // A test row is not a thing to sell somebody who has just paid.
    if (/^test\b/i.test(r.productTitle)) continue;
    // Nothing cheap enough that the floor below would price it above its own
    // shelf price. At $0.50 this offered the item for $1.00 and then printed
    // "Save -$0.50".
    if (r.priceCents <= MIN_OFFER_CENTS) continue;
    seenProducts.add(r.productTitle);
    eligible.push(r);
  }

  /* Everything, not one of them.
     This used to rotate and show a single product, which meant four of the
     five were never offered to anybody. The customer has paid and is
     already looking at the page; the whole shelf costs nothing more to
     show than one row of it does. */
  const offers: PostPurchaseOffer[] = [];
  for (const pick of eligible) {
    const saving = discountFor(pick.priceCents);
    const offerCents = Math.max(MIN_OFFER_CENTS, pick.priceCents - saving);
    const savingCents = pick.priceCents - offerCents;
    // An offer that saves nothing is not an offer. Leave it out.
    if (savingCents <= 0) continue;
    offers.push({
      variantId: pick.variantId,
      productTitle: pick.productTitle,
      variantLabel: pick.label,
      imageUrl: pick.variantImage ?? (pick.images ?? []).find((i) => i.url)?.url ?? null,
      normalCents: pick.priceCents,
      offerCents,
      savingCents,
    });
  }
  return offers;
}

export type TakeResult =
  | { ok: true; chargedCents: number }
  | { ok: false; reason: string };

/**
 * Take the offer: charge the saved card, then add the line to the order.
 *
 * In that order, and deliberately. A line added before the money arrives is a
 * thing to pick and post for free if the charge then fails, and that mistake
 * is only found in the warehouse. The charge is also keyed on the order and
 * the variant, so a double tap on a slow connection buys one of them.
 */
export async function takeOffer(
  db: DB,
  env: Env,
  orderId: string,
  variantId: string,
): Promise<TakeResult> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.paymentStatus !== "paid" || !order.paymentRef) {
    return { ok: false, reason: "that order cannot take an add-on" };
  }
  // Priced here, from the database, never from the form. A price that arrives
  // with the request is a price the customer can choose.
  const offers = await offersForOrder(db, orderId);
  const offer = offers.find((o) => o.variantId === variantId);
  if (!offer) {
    return { ok: false, reason: "that offer is no longer available" };
  }

  const provider = await providerForStore(db, env, order.storeId);
  const charge = await provider.chargeSaved({
    fromIntentId: order.paymentRef,
    amountCents: offer.offerCents,
    currency: order.currency,
    description: `${offer.productTitle} — added to order ${order.number ?? orderId.slice(0, 8)}`,
    idempotencyKey: `upsell-${orderId}-${variantId}`,
    metadata: { orderId, kind: "post-purchase" },
  });
  if (!charge.ok) {
    await db.update(orders).set({ upsellState: "failed" }).where(eq(orders.id, orderId));
    return { ok: false, reason: charge.reason };
  }

  await db.insert(orderItems).values({
    orderId,
    variantId: offer.variantId,
    title: offer.productTitle,
    label: offer.variantLabel,
    unitPriceCents: offer.offerCents,
    quantity: 1,
  });
  await db
    .update(orders)
    .set({
      upsellState: "taken",
      totalCents: (order.totalCents ?? 0) + offer.offerCents,
    })
    .where(eq(orders.id, orderId));

  // The timeline is the evidence that wins a chargeback, so a second charge
  // against the same card had better be in it.
  await recordOrderEvent(
    db,
    orderId,
    "upsell_taken",
    `${offer.productTitle} added after checkout for ${(offer.offerCents / 100).toFixed(2)}`,
    { variantId: offer.variantId, amountCents: offer.offerCents, intentId: charge.intentId },
  ).catch(() => {});

  return { ok: true, chargedCents: offer.offerCents };
}

/** Said no. Recorded, so the page never asks again. */
export async function declineOffer(db: DB, orderId: string): Promise<void> {
  await db
    .update(orders)
    .set({ upsellState: "declined" })
    .where(and(eq(orders.id, orderId), ne(orders.upsellState, "taken")));
}
