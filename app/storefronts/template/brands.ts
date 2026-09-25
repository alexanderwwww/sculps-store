/**
 * What each shop changes about the shared template.
 *
 * The template is one component tree. Everything a store differs on is here,
 * in one file, so the answer to "why does Reaper look like that and cryo like
 * this" is thirty lines rather than two three-thousand-line forks that drifted
 * apart for six months.
 *
 * Every option's default is the older behaviour, so a shop that is not named
 * here renders exactly what it rendered before this file existed.
 */
import type { StoreBrand, StoreShapes } from "./index";
import type { LoadedProductPage } from "~/lib/store.server";

/**
 * Ceiling Buddy, Black Reaper and bodies grew up on the first version of this
 * template, and their stylesheets and their content are written for it. They
 * keep it exactly: the lock screen in the product-grid slot, the "and N others
 * are thrilled" row, pay-in-4 inside the price column, the numbered feature
 * grid, the badge on the default row.
 */
const OLDER: StoreShapes = {
  productGrid: "lock",
  crowd: "thrilled",
  payLater: "inline",
  features: "grid",
  specs: "inline",
  singleBundleBox: false,
  popularOn: "default",
  couponPill: true,
};

/**
 * cryo is the shop the second version was written on, so it takes all of it:
 * photographs instead of the lock screen, the measured view count, pay-in-4 as
 * a block under the picture, features as alternating picture-and-words rows,
 * the unmeasured specs gathered under one honest heading, a bundle box even
 * with one thing to buy, the badge on the upsell, and the code said once.
 */
const NEWER: StoreShapes = {
  productGrid: "showcase",
  crowd: "views",
  payLater: "block",
  features: "rows",
  specs: "split",
  singleBundleBox: true,
  popularOn: "upsell",
  couponPill: false,
};

export const cryoBrand = (page: LoadedProductPage): StoreBrand => ({
  ...NEWER,
  logo: page.store.logoUrl,
  nav: [
    ["How it works", "#how"],
    ["Questions", "#ugc"],
    ["Specs", "#specs"],
    ["Buy", "#buy"],
  ],
  rail: ["Free US shipping", "Ships within 24 hours", "30-day returns", "1-year warranty"],
  marquee: ["No fridge", "No ice", "Nothing to refill", "Chills the bottle you already own"],
});

export const ceilingBuddyBrand = (page: LoadedProductPage): StoreBrand => ({
  ...OLDER,
  logo: page.store.logoUrl ?? "/media/3958921693410617.webp",
  nav: [
    ["How it works", "#how"],
    ["Real nights", "#proof"],
    ["Reviews", "#reviews"],
    ["FAQ", "#faq"],
  ],
  rail: ["Free US shipping", "Ships within 24 hours", "30-day returns", "1-year warranty"],
  marquee: ["Up in a minute", "Lit from the inside", "No ladder", "No tools"],
});

/**
 * Black Reaper sells seven things, so its header links have to be real
 * addresses rather than jumps down one page — and they come from the store's
 * own main menu, which means adding an eighth product is an admin job rather
 * than a deploy.
 */
export const reaperBrand = (page: LoadedProductPage): StoreBrand => {
  const links = page.nav.main.map((l) => [l.label, l.href] as const);
  return {
    ...OLDER,
    logo: page.store.logoUrl,
    nav: links.length ? links : [["Shop", "/"], ["FAQ", "#faq"], ["Reviews", "#reviews"]],
    rail: [
      "Free shipping on everything",
      "Order by October 20 for Halloween",
      "30 days to send it back",
      "Lit, staked and standing in a minute",
    ],
    marquee: [
      "Up in a minute",
      "Lit from the inside",
      "Back in the garage by November",
      "The house the street talks about",
    ],
    // The sentence that used to be written into the component, true of this
    // shop and nonsense on every other one.
    reviewsLine: "Every one of them put it on a lawn in October.",
  };
};
