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
 * The older shops — Ceiling Buddy, Black Reaper, bodies — do NOT render this
 * template. They keep their own tree, untouched, because they are live and
 * selling and a shared file is not worth one bad night on them. The defaults
 * below exist so that if one of them is ever moved across deliberately, it
 * arrives rendering exactly what it renders today rather than something new.
 */
export const OLDER: StoreShapes = {
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
  // Reaper's code strip, exactly: the saving in a pill, then the line with the
  // code you tap to copy. He picked that one by name.
  couponPill: true,
  // The machine makes its own ice, so the offer arrives behind a frozen pane
  // you wipe with a finger. It is the one shop on this platform where a
  // scratch card is not a gimmick bolted on — it is what the product does.
  frostedOffer: true,
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
