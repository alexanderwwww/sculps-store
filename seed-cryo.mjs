/**
 * Seeds the cryo store.
 *
 * cryo is a countertop machine that chills a bottle of water without a fridge
 * and without ice. It has no sample yet, so this file is written around one
 * hard rule: **nothing goes in that has not been measured or decided.**
 *
 *   - No reviews. Not one row, and the Reviews section is seeded hidden. There
 *     are no customers, so there is nothing to show. Platform rule 7.
 *   - No invented specs. Every unmeasured value is the empty string, which the
 *     storefront renders as a visible "Spec pending". There is NO chill time,
 *     NO temperature drop rate, NO wattage, NO battery figure and NO decibel
 *     figure anywhere in this file, because the sample does not exist.
 *   - No time claim in any headline. The positioning is the outcome and the
 *     absence of a fridge, never the speed.
 *   - Discounts in dollars, never percentages. Platform rule 6.
 *
 * Every word of copy below is taken from scratchpad/cryo-copy.md, written by
 * the copy specialist. Where a field had no line written for it, it is left
 * empty rather than filled in with something new.
 *
 * Images: the product photography is being generated and is not ready. The one
 * render that exists is seeded into the lead gallery slot; every other picture
 * slot is deliberately empty so nothing is shown eight times. The list of which
 * slot wants which picture is in scratchpad/cryo-image-slots.md.
 *
 * Run it with:  set -a; . ./.dev.vars; set +a; node seed-cryo.mjs
 * Safe to run twice: it updates the store in place and never touches orders.
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  fs
    .readFileSync(new URL("./.dev.vars", import.meta.url), "utf8")
    .match(/DATABASE_URL\s*=\s*"?([^"\n]+)"?/)[1];
const sql = neon(DATABASE_URL);

/* ------------------------------------------------------------------ media */

/**
 * The single reference render, squared to 1:1 on white (platform rule 6c) and
 * uploaded to R2 under its own content hash. It is the ONLY picture this store
 * has. The Poland Spring bottle in the original concept render is gone from the
 * shot list; this frame is the machine itself.
 */
const RENDER = "/media/810221ec84fb1445.webp";
const RENDER_KEY = "810221ec84fb1445.webp";

/* ------------------------------------------------------------------ store */

const STORE = {
  slug: "cryo",
  name: "cryo",
  // Unique placeholder until a real domain is bought. cryo.co is the one that
  // is available; nothing is registered yet.
  domain: "cryo.pending",
  currency: "USD",
  timezone: "America/New_York",
  // Ice blue — the LED ring. The admin switcher dot, not a page colour.
  color: "#3FB8E8",
};

/* ---------------------------------------------------------------- product */

const PRODUCT = {
  handle: "cryo",
  title: "cryo",
  description:
    "<p>A countertop machine that chills a bottle of water for you. No fridge, no ice.</p>" +
    "<p>The bottle lies on two rollers under a clear dome, spins, and gets sprayed with " +
    "sub-zero liquid from a frozen cartridge. A sensor watches the bottle and stops on its " +
    "own when it hits the cold you asked for.</p>" +
    "<p>Brushed aluminium body, clear dome lid, one dial. Runs on its own battery and " +
    "charges over USB-C.</p>",
};

/**
 * Two bundle options, not three.
 *
 * The copy proposes three tiers. The recipe's storefront checklist allows at
 * most two, because a third tier puts a number at the top of the page that
 * nobody will pay and kills the sale before the cheap option is read. The two
 * kept are the ad price and the tier that carries the AOV; "the household" is
 * parked, not deleted, and can be added the moment Alex wants it.
 *
 * Default is "the one" at $89 — the number every headline and every hook
 * quotes. The badge rides the upsell, never the default.
 *
 * Prices in cents. THESE ARE PROPOSALS: landed cost is not known, and the copy
 * flags them as not final. No compare-at price is seeded, because there is no
 * real was-price to compare against and inventing one is the same lie as
 * inventing a spec. The launch discount is a DOLLAR code ($15 OFF), never a
 * percentage.
 */
const VARIANTS = [
  {
    label: "the one",
    sublabel: "cryo machine, 1 frozen cartridge, USB-C cable, quick-start card",
    priceCents: 8900,
    compareAtCents: null,
    sku: "CRYO-1",
    isDefault: true,
  },
  {
    // The badge on the page says "Most popular"; the label does not repeat it.
    label: "the everyday",
    sublabel: "cryo machine, 3 frozen cartridges, USB-C cable, quick-start card",
    priceCents: 10900,
    compareAtCents: null,
    sku: "CRYO-3",
    isDefault: false,
  },
];

/* --------------------------------------------------------------- sections */

/**
 * The fifteen, in the platform's fixed order. Position 0..14 is written here
 * and never from the admin; Alex can hide one or drag it, and the storefront
 * renders whatever order the database gives back.
 *
 * `hidden: true` means the section exists so it can be filled later, and shows
 * nothing today.
 */
const SECTIONS = [
  {
    type: "buy_box",
    values: {
      badge: "NO FRIDGE. NO ICE.",
      heading: "Ice-cold water. Anywhere you plug in a cable.",
      subheading:
        "cryo is a countertop machine that chills a bottle of water for you. The bottle lies on " +
        "two rollers under a clear dome, spins, and gets sprayed with sub-zero liquid from a " +
        "frozen cartridge. A sensor watches the bottle and stops on its own when it hits the cold " +
        "you asked for. No fridge in the room, no bag of ice, no waiting on a freezer shelf you " +
        "forgot to use.",
      ctaLabel: "Add to cart",
      reassurance: "Free US shipping. Ships within 24 hours. 30-day returns.",
      bundleTitle: "How many cold bottles do you want in a row?",
      bundleNote:
        "Every extra cartridge is another run of cold bottles before you refreeze. Most people " +
        "want more than one.",
    },
    // One block, one picture: the reference render. The other seven gallery
    // slots stay unseeded until the panels land — see cryo-image-slots.md.
    blocks: [{ image: RENDER, alt: "cryo — brushed aluminium chiller with a clear dome lid" }],
  },

  {
    type: "video_faq",
    values: {
      heading: "Watch it work.",
      subheading: "The questions people ask before they buy one. Answered straight.",
      // No footage of a real sample exists, and no still is borrowed from
      // another section. Both stay empty.
      video: "",
      still: "",
    },
    blocks: [
      {
        question: "How long does it take?",
        answer:
          "We are not publishing a time until we have measured it on the production machine. The " +
          "number you see on a competitor's page was written by a marketing team, not a " +
          "thermometer. As soon as our own testing is done, the measured time goes on this page " +
          "and on the box. If a number matters to you that much, wait for it — we would rather " +
          "lose the sale than lie to you about it.",
      },
      {
        question: "Do I need a special bottle?",
        answer:
          "No. A standard sealed plastic or aluminium bottle lies on the rollers. That's the whole " +
          "point: cryo chills the water you already bought, or the one you filled at the tap.",
      },
      {
        question: "Does it need a fridge or a freezer?",
        answer:
          "You need a freezer to refreeze the cartridge, the same way you need one for an ice " +
          "pack. You do not need a fridge anywhere near cryo while it is working — that is what " +
          "makes it work in an office, a dorm room, a garage, an RV or a hotel.",
      },
      {
        question: "How many bottles per cartridge?",
        answer:
          "Roughly 3 to 4 in a row before the cartridge needs refreezing. Exact count is being " +
          "measured on the sample and goes in the specs when it is.",
      },
      {
        question: "Will it freeze my water solid?",
        answer:
          "No, and that is why the bottle spins. Spinning keeps the water moving so it chills " +
          "evenly instead of forming ice on the inside wall. The infrared sensor ends the cycle " +
          "at your set temperature.",
      },
      {
        question: "Does it plug into the wall?",
        answer:
          "It charges over USB-C, from any phone charger, laptop, or power bank, in the US or in " +
          "Europe. It runs off its internal battery, so it does not have to stay plugged in while " +
          "it works.",
      },
      {
        question: "Can I chill soda, beer, or a can?",
        answer: "Yes — anything sealed that fits on the rollers. Do not put an open container in it.",
      },
      {
        question: "How big is it?",
        answer:
          "About 28 × 14 × 14 cm — roughly a lunchbox lying on its side. It lives on a counter " +
          "without taking the counter.",
      },
      {
        question: "Is it loud?",
        answer:
          "There is a small motor and a pump, so it is not silent. We are not putting a decibel " +
          "number on this page until we have measured one.",
      },
      {
        question: "What if I don't like it?",
        answer: "30 days. Send it back, get your money back.",
      },
    ],
  },

  {
    // No customer photos exist. Not a render dressed up as one, not stock.
    // Hidden, and it turns on the day real photos arrive.
    type: "social_proof_images",
    hidden: true,
    values: { heading: "", subheading: "" },
    blocks: [],
  },

  {
    // No footage of a real sample exists yet. The heading is written down here
    // so it is ready; the section stays hidden until there are clips.
    type: "video_clips",
    hidden: true,
    values: { heading: "Real bottles, real counters.", subheading: "", bullets: "" },
    blocks: [],
  },

  {
    type: "product_grid",
    values: {
      heading: "What a cryo setup looks like.",
      subheading: "The machine, the cartridges, and the cable. That's it.",
      footnote:
        "Spare cartridges are sold separately, so you never have to buy a second machine to get " +
        "more cold.",
      image: "",
    },
    /*
     * This theme reads a block's `note` as two things joined by a space — the
     * first word is a marker it uses for placement and it is NOT shown. So the
     * whole line goes in `title`, and `note` stays empty; otherwise the first
     * word of every caption is silently eaten off the live page.
     *
     * When the real panel lands, set this section's `image` instead: artwork
     * on the section replaces the built layout entirely.
     */
    blocks: [
      { title: "cryo machine — brushed aluminium, clear dome lid", note: "", image: "" },
      { title: "Frozen cartridge — the cold. Freeze, drop in, go", note: "", image: "" },
      { title: "USB-C cable — charges from anything", note: "", image: "" },
      { title: "Quick-start card — three steps, one side", note: "", image: "" },
    ],
  },

  {
    type: "trust_icons",
    values: { heading: "What you get from us either way." },
    // The theme draws these icons itself, so `icon` stays empty on purpose.
    blocks: [
      { icon: "", title: "Free US shipping", text: "Every order, no minimum." },
      { icon: "", title: "Ships in 24 hours", text: "Ordered today, on a truck tomorrow." },
      { icon: "", title: "30-day returns", text: "Don't like it, send it back." },
      { icon: "", title: "1-year warranty", text: "Motor, pump, battery and sensor." },
      { icon: "", title: "Real specs only", text: "If we haven't measured it, we don't print it." },
      { icon: "", title: "US support", text: "Email a human, get a human." },
    ],
  },

  {
    type: "three_steps",
    values: {
      heading: "Three moves. That's the whole machine.",
      subheading: "If you can close a lunchbox you can run this.",
    },
    blocks: [
      {
        title: "FREEZE THE CARTRIDGE",
        text: "It lives in your freezer until you need it. Take it out, drop it in the bay.",
        image: "",
      },
      {
        title: "BOTTLE IN, LID DOWN",
        text: "Lay the bottle on the rollers, close the dome, turn the dial to the cold you want.",
        image: "",
      },
      {
        title: "WALK AWAY",
        text:
          "The rollers spin it, the pump sprays it, the sensor stops it. Come back to a cold bottle.",
        image: "",
      },
    ],
  },

  {
    type: "benefits",
    values: {
      heading: "Why anybody wants one.",
      subheading: "Not a gadget. A thing that removes a small daily annoyance for good.",
    },
    blocks: [
      {
        title: "Cold water where there is no fridge.",
        text:
          "Office desk, dorm, garage, RV, hotel room, workshop, job site. The place you actually " +
          "get thirsty is usually the place without a fridge.",
        image: "",
      },
      {
        title: "No bag of ice, ever again.",
        text:
          "No melt in the cooler, no watered-down drink, no trip to the gas station, no ice tray " +
          "nobody refilled.",
        image: "",
      },
      {
        title: "You forgot to chill it. It doesn't matter.",
        text:
          "Warm bottle out of the pack becomes a cold bottle on demand — no planning the night " +
          "before.",
        image: "",
      },
      {
        title: "It chills the bottle you already own.",
        text: "Nothing proprietary. No subscription, no cartridge of water, no app.",
        image: "",
      },
      {
        title: "It looks like it belongs on the counter.",
        text: "Brushed aluminium and one glowing dial, not a plastic box with six stickers on it.",
        image: "",
      },
      {
        title: "Cheap to run.",
        text:
          "The cartridge refreezes in a freezer you already pay for. There is nothing else to buy.",
        image: "",
      },
    ],
  },

  {
    type: "features",
    values: {
      heading: "What it actually is.",
      subheading: "Every line here is a thing you can see in the pictures.",
    },
    blocks: [
      {
        title: "Two-roller spin drive.",
        text:
          "The bottle lies on its side and turns. Moving water chills evenly instead of icing up " +
          "against the wall.",
        image: "",
      },
      {
        title: "Sub-zero spray pump.",
        text:
          "Liquid from the frozen cartridge is sprayed over the whole bottle, not just the part " +
          "touching a cold plate.",
        image: "",
      },
      {
        title: "Frozen cartridge, not a compressor.",
        text:
          "No refrigerant loop, no heat dumped into your kitchen, no compressor hum, nothing to " +
          "service.",
        image: "",
      },
      {
        title: "Infrared temperature sensor.",
        text:
          "Reads the bottle and ends the cycle on its own. You do not set a timer; you set a " +
          "temperature.",
        image: "",
      },
      {
        title: "One aluminium dial, 2°C to 8°C.",
        text: "Ice-blue LED ring around it so you can read the setting from across the room.",
        image: "",
      },
      {
        title: "Clear dome lid.",
        text:
          "You can see it working. That is half the reason people keep it out on the counter.",
        image: "",
      },
      {
        title: "Internal battery, USB-C charging.",
        text:
          "Works on a desk with a laptop cable. Works in the US and Europe with no adapter.",
        image: "",
      },
      {
        title: "Brushed aluminium body, one piece.",
        text: "About 28 × 14 × 14 cm. Wipes clean.",
        image: "",
      },
    ],
  },

  {
    type: "comparison_table",
    values: {
      heading: "cryo, a fridge, a bag of ice, or nothing.",
      subheading: "Honest columns. There are things a fridge does better, and we say so.",
      usLabel: "cryo",
      themLabel: "Fridge / ice / nothing",
    },
    /*
     * The section carries two labelled columns, so the three alternatives are
     * written into the row text rather than faked as a hidden third column.
     * The rows that say "no" are kept, on purpose: the page says out loud that
     * this is not a fridge.
     */
    blocks: [
      { label: "Needs a fridge in the room", us: "No", them: "A fridge is the fridge" },
      { label: "Portable", us: "Yes — battery, USB-C", them: "A fridge, no. A cooler, yes, until the ice melts" },
      { label: "Chills a bottle on demand", us: "Yes", them: "A fridge, hours ahead. Ice, only if you have ice" },
      { label: "Ongoing cost", us: "Refreeze the cartridge", them: "A fridge runs 24/7 on your power bill. Ice, buy it every time" },
      { label: "Waters down the drink", us: "No — the bottle stays sealed", them: "Ice does, once it melts" },
      { label: "Mess", us: "None", them: "Ice leaves melt water and a wet cooler" },
      { label: "Space on the counter", us: "About a lunchbox", them: "A fridge is a whole appliance. A cooler is on the floor" },
      { label: "Keeps things cold for days", us: "No — this is a chiller, not storage", them: "A fridge does. A cooler, a few hours" },
      { label: "Holds your groceries", us: "No", them: "A fridge does" },
      { label: "Chill time", us: "Being measured — spec pending", them: "A fridge, hours. Ice, minutes, with ice on hand" },
    ],
  },

  {
    /*
     * HIDDEN, AND EMPTY. There are no customers, so there are no reviews.
     *
     * No seeded reviews, no "early tester" quotes, no five-star row with the
     * count blanked out, no borrowed reviews from a competitor's listing, no
     * rating stars anywhere. The section turns on by itself the day a real
     * buyer writes one. Platform rule 7, and it is not relaxed for a launch.
     *
     * This file writes ZERO rows to the reviews table. Not a draft, not an
     * unpublished one.
     */
    type: "reviews",
    hidden: true,
    values: { heading: "", subheading: "", direction: "" },
    blocks: [],
  },

  {
    type: "who_its_for",
    values: { heading: "Who buys one.", subheading: "And who honestly shouldn't." },
    blocks: [
      {
        title: "The person with no fridge where they work.",
        text:
          "Office desk, warehouse, job site, studio, shop counter. The whole product exists for " +
          "this person.",
      },
      {
        title: "Students.",
        text: "Dorm rooms where a mini-fridge is banned, shared, full, or $200.",
      },
      {
        title: "Parents.",
        text: "Kid wants cold water, the pack is in the pantry, and it is 90 degrees.",
      },
      {
        title: "Anybody who hates ice.",
        text:
          "Watered-down drinks, gas station ice bags, an ice tray that was never refilled.",
      },
      {
        title: "People who travel with a car, an RV, or a van.",
        text: "Battery and USB-C, so it goes where the drink goes.",
      },
      { title: "Gym bags and game days.", text: "Warm bottle in, cold bottle out." },
      {
        title: "Not for you if:",
        text:
          "you want food storage, or you want something that keeps drinks cold all day. cryo " +
          "chills a bottle when you ask it to. A cooler or a fridge keeps things cold; that is a " +
          "different job and you want a different product.",
      },
    ],
  },

  {
    type: "whats_in_the_box",
    values: {
      heading: "Everything that arrives.",
      subheading: "Open it, plug it in, freeze the cartridge. Nothing to assemble.",
      // The flat-lay of everything in the box has not been shot yet.
      image: "",
    },
    blocks: [
      { title: "cryo machine", text: "brushed aluminium body, clear dome lid, one dial" },
      { title: "Frozen cartridge ×1", text: "×3 on the everyday" },
      { title: "USB-C charging cable", text: "" },
      { title: "Quick-start card", text: "the three steps, one side" },
      { title: "Warranty card", text: "1 year" },
    ],
  },

  {
    /*
     * MEASURED VALUES ONLY.
     *
     * Every row whose value is "" renders on the live page as "Spec pending".
     * There is no chill time here, no temperature drop rate, no wattage, no
     * battery capacity, no decibel figure and no weight, because the sample
     * does not exist and a false number on this page is a chargeback wave.
     *
     * Do not type a number into any blank row until it has been measured, and
     * do not type "up to" either — "up to" is a claim.
     */
    type: "specifications",
    values: { heading: "Specifications" },
    blocks: [
      { label: "Dimensions", value: "28 × 14 × 14 cm (approx.) — final on tooling" },
      { label: "Body material", value: "Brushed aluminium" },
      { label: "Lid", value: "Clear domed polycarbonate" },
      { label: "Drive", value: "Two rollers, bottle spins horizontally" },
      { label: "Cooling method", value: "Sprayed sub-zero liquid from a frozen cartridge" },
      { label: "Temperature control", value: "Dial, 2°C–8°C, default 4°C" },
      { label: "Cycle end", value: "Infrared sensor, automatic" },
      { label: "Power", value: "Internal rechargeable battery, USB-C charging" },
      { label: "Chill time, 500 ml PET, room temp to 4°C", value: "" },
      { label: "Bottles per frozen cartridge", value: "" },
      { label: "Cartridge refreeze time", value: "" },
      { label: "Battery capacity", value: "" },
      { label: "Cycles per charge", value: "" },
      { label: "Charge time", value: "" },
      { label: "Power draw", value: "" },
      { label: "Noise level", value: "" },
      { label: "Max bottle diameter / length", value: "" },
      { label: "Net weight", value: "" },
      { label: "Shipping weight", value: "" },
      { label: "Certifications", value: "" },
    ],
  },

  {
    type: "closing_cta",
    values: {
      heading: "Stop planning ahead for a cold drink.",
      subheading:
        "No fridge. No ice. No waiting on a freezer shelf. A bottle goes in, a cold bottle comes " +
        "out, and it sits on your counter looking like it cost three times what it did.",
      ctaLabel: "Add to cart",
    },
    blocks: [],
  },
];

/* ------------------------------------------------------------------- nav */

const MAIN_LINKS = [
  { label: "How it works", destination: "custom", url: "#how" },
  { label: "Questions", destination: "custom", url: "#ugc" },
  { label: "Specs", destination: "custom", url: "#specs" },
];

const FOOTER_LINKS = [
  { label: "Shipping", destination: "shipping-policy", url: null },
  { label: "Returns", destination: "refund-policy", url: null },
  { label: "Privacy Policy", destination: "privacy-policy", url: null },
  { label: "Terms of Service", destination: "terms-of-service", url: null },
  { label: "Contact", destination: "contact", url: null },
];

/* -------------------------------------------------------------------- run */

async function main() {
  /* 1. store */
  let [store] = await sql`select id from stores where slug = ${STORE.slug}`;
  if (store) {
    await sql`
      update stores set name = ${STORE.name}, currency = ${STORE.currency},
        timezone = ${STORE.timezone}, color = ${STORE.color}
      where id = ${store.id}`;
    console.log("  store: updated");
  } else {
    [store] = await sql`
      insert into stores (slug, name, domain, currency, timezone, color)
      values (${STORE.slug}, ${STORE.name}, ${STORE.domain}, ${STORE.currency},
              ${STORE.timezone}, ${STORE.color})
      returning id`;
    console.log("  store: created");
  }
  const storeId = store.id;

  /* 2. media — so the admin's Media screen sees the render */
  const [haveMedia] = await sql`select id from media where key = ${RENDER_KEY}`;
  if (!haveMedia) {
    await sql`
      insert into media (store_id, key, filename, mime, size_bytes, width, height, alt)
      values (${storeId}, ${RENDER_KEY}, 'cryo-reference.webp', 'image/webp', 191230, 1402, 1402,
              'cryo — brushed aluminium chiller with a clear dome lid')`;
    console.log("  media: 1 row");
  } else {
    console.log("  media: already there");
  }

  /* 3. product */
  let [product] = await sql`
    select id from products where store_id = ${storeId} and handle = ${PRODUCT.handle}`;
  const images = JSON.stringify([
    { url: RENDER, alt: "cryo — brushed aluminium chiller with a clear dome lid", kind: "photo" },
  ]);
  if (product) {
    await sql`
      update products set title = ${PRODUCT.title}, description = ${PRODUCT.description},
        status = 'active', images = ${images}::jsonb
      where id = ${product.id}`;
    console.log("  product: updated");
  } else {
    [product] = await sql`
      insert into products (store_id, handle, title, description, status, images)
      values (${storeId}, ${PRODUCT.handle}, ${PRODUCT.title}, ${PRODUCT.description},
              'active', ${images}::jsonb)
      returning id`;
    console.log("  product: created");
  }
  const productId = product.id;

  /* 4. variants — available > 0 or /cart/add rejects the line */
  await sql`delete from variants where product_id = ${productId}`;
  for (const [i, v] of VARIANTS.entries()) {
    await sql`
      insert into variants
        (product_id, label, sublabel, price_cents, compare_at_cents, sku, position, is_default, available)
      values
        (${productId}, ${v.label}, ${v.sublabel}, ${v.priceCents}, ${v.compareAtCents},
         ${v.sku}, ${i}, ${v.isDefault}, 100)`;
  }
  console.log(`  variants: ${VARIANTS.length}`);

  /* 5. theme */
  let [theme] = await sql`select id from themes where store_id = ${storeId} and is_live = true`;
  if (!theme) {
    [theme] = await sql`
      insert into themes (store_id, name, is_live) values (${storeId}, 'cryo', true) returning id`;
    console.log("  theme: created");
  } else {
    console.log("  theme: already live");
  }

  /* 6. page */
  let [page] = await sql`
    select id from pages where store_id = ${storeId} and kind = 'product' and handle = ${PRODUCT.handle}`;
  if (page) {
    await sql`
      update pages set title = ${PRODUCT.title}, theme_id = ${theme.id}, product_id = ${productId},
        visible = true, updated_at = now()
      where id = ${page.id}`;
    console.log("  page: updated");
  } else {
    [page] = await sql`
      insert into pages (store_id, theme_id, kind, product_id, title, handle, visible)
      values (${storeId}, ${theme.id}, 'product', ${productId}, ${PRODUCT.title},
              ${PRODUCT.handle}, true)
      returning id`;
    console.log("  page: created");
  }

  /* 7. sections, position 0..14, then blocks */
  await sql`delete from sections where page_id = ${page.id}`;
  for (const [i, s] of SECTIONS.entries()) {
    const [row] = await sql`
      insert into sections (page_id, type, position, values, hidden)
      values (${page.id}, ${s.type}, ${i}, ${JSON.stringify(s.values)}::jsonb, ${s.hidden ?? false})
      returning id`;
    for (const [j, b] of (s.blocks ?? []).entries()) {
      await sql`
        insert into blocks (section_id, position, values)
        values (${row.id}, ${j}, ${JSON.stringify(b)}::jsonb)`;
    }
  }
  console.log(`  sections: ${SECTIONS.length} (positions 0..${SECTIONS.length - 1})`);

  /* 8. menus */
  for (const [handle, title, links] of [
    ["main", "Main menu", MAIN_LINKS],
    ["footer", "Footer", FOOTER_LINKS],
  ]) {
    let [menu] = await sql`select id from menus where store_id = ${storeId} and handle = ${handle}`;
    if (!menu) {
      [menu] = await sql`
        insert into menus (store_id, handle, title) values (${storeId}, ${handle}, ${title})
        returning id`;
    }
    await sql`delete from menu_links where menu_id = ${menu.id}`;
    for (const [i, l] of links.entries()) {
      await sql`
        insert into menu_links (menu_id, position, label, destination, url)
        values (${menu.id}, ${i}, ${l.label}, ${l.destination}, ${l.url})`;
    }
  }
  console.log("  menus: main + footer");

  /* 9. reviews — deliberately none. Assert it, rather than assume it. */
  const [{ count }] = await sql`select count(*)::int as count from reviews where store_id = ${storeId}`;
  if (count !== 0) throw new Error(`cryo has ${count} review rows and it must have zero`);
  console.log("  reviews: 0 rows, section hidden — correct, there are no customers");

  console.log("done");
}

main();
