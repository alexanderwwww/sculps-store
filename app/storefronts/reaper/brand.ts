/**
 * What Black Reaper changes about Ceiling Buddy's template.
 *
 * The whole store is that template with a second stylesheet over it, so the
 * only code this shop owns is the three things a template can't guess: the
 * mark in the header, the links beside it, and the four promises on the rail.
 */
import type { CbBrand } from "~/storefronts/ceiling-buddy";
import type { LoadedProductPage } from "~/lib/store.server";

/**
 * Ceiling Buddy sells one thing, so its header links jump down the page. This
 * shop sells seven, so they have to be real addresses — and they come from the
 * store's own main menu, which means adding an eighth product is an admin job
 * rather than a deploy.
 */
export function reaperBrand(page: LoadedProductPage): CbBrand {
  const links = page.nav.main.map((l) => [l.label, l.href] as const);
  return {
    logo: page.store.logoUrl,
    nav: links.length ? links : [["Shop", "/"], ["FAQ", "#faq"], ["Reviews", "#reviews"]],
    rail: [
      "Free US shipping on every order",
      page.store.slug === "snowman" ? "Arrives 5-7 days after it ships" : "Ships same day or next day",
      "30 days to send it back",
      "Tracking link on every order",
    ],
    // Halloween lines on a Christmas shop read wrong ("back in the garage by
    // November" on a snowman), so a store that wears this skin for another
    // season gets its own.
    marquee: page.store.slug === "snowman"
      ? ["Plug in, press snow", "Snow from his hands", "Glows all night", "The house the street talks about"]
      : [
          "Up in a minute",
          "Lit from the inside",
          "Back in the garage by November",
          "The house the street talks about",
        ],
  };
}
