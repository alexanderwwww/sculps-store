/**
 * Admin-only sample content for the sections that only render with real data
 * (before/after, reviews). Requested with ?samples=1 by a signed-in admin so
 * the layout can be judged before real customers exist. Every name and quote
 * says SAMPLE. Never served to a shopper.
 */
import type { LoadedProductPage } from "~/lib/store.server";

const M = "/media";
const PAIRS: [string, string][] = [
  [`${M}/bd-c-lilac-mirror2.png`, `${M}/bd-a-lilac-top.png`],
  [`${M}/bd-d-bare-rest.png`, `${M}/bd-c-bare-latina.png`],
  [`${M}/bd-e-swan-night.png`, `${M}/bd-c-swan-latina.png`],
  [`${M}/bd-c-matcha-black.png`, `${M}/bd-d-matcha-stretch.png`],
  [`${M}/bd-e-friends-soft.png`, `${M}/bd-b-swan-socks.png`],
  [`${M}/bd-e-lilac-evening.png`, `${M}/bd-d-lilac-socks.png`],
];

export function withSamples(page: LoadedProductPage): LoadedProductPage {
  const sections = page.sections.map((s) => {
    if (s.type !== "before_after") return s;
    return {
      ...s,
      values: { ...s.values, heading: "One month on the board · SAMPLE", subheading: "Sample layout. Not real customers." },
      blocks: PAIRS.map(([before, after], i) => ({
        id: `sample-pair-${i}`,
        values: { before, after, name: `SAMPLE ${i + 1}`, weeks: String(4 + (i % 3) * 2), note: "Sample placeholder, not a customer." },
      })),
    };
  });
  const now = new Date();
  const reviews = PAIRS.map(([, img], i) => ({
    id: `sample-review-${i}`,
    storeId: page.store.id,
    productId: page.product.id,
    name: `SAMPLE ${["Ana", "Lea", "Mia", "Noor", "Jo", "Sam"][i]}`,
    rating: 5 - (i % 2),
    title: null,
    body: "SAMPLE review body. Placeholder text so the card layout can be judged. Not a real customer, not a real quote.",
    reviewedOn: now,
    country: null,
    imageUrl: i % 2 === 0 ? img : null,
    verified: true,
    source: "customer",
    published: true,
    position: i,
    createdAt: now,
  }));
  return { ...page, sections, reviews };
}
