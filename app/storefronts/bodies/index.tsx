/**
 * bodies — the storefront.
 *
 * Two pages, one section catalogue. The homepage and the product page both
 * draw their editable sections (photos, steps, questions) from page.sections
 * by type, in a fixed order per page (HOME_ORDER / PDP_ORDER), and code-driven
 * sections — the screen, the proof tiles, the "made to be looked at" band, the
 * box grid — are injected at fixed points in that order. A section type that
 * is not in the page's order does not render.
 *
 * Built against the Experiment reference for section: clarity in a vibrant
 * package. White ground, one lime for every button, one blue for badges, all
 * the colour inside the pictures. Only two kinds of picture exist: clean gear
 * renders on the lilac gradient (bd-r-*, bd-studio-*, bd-cut-*, bd-box-*,
 * bd-g-screen, bd-chrome) and real phone photos of girls on the board
 * (bd-a…f-*). Nothing with a sky.
 *
 * Money: installments lead everywhere ("4 × $174.75"), the full price second.
 * The installment is computed from the variant price, never typed.
 */
import { useEffect, useRef, useState } from "react";
import type { LoadedProductPage, LoadedSection, VariantRow, NavLink } from "~/lib/store.server";
import { BUNDLE_OFF_CENTS, formatMoney } from "~/lib/money";
import { CartDrawerProvider, useCartDrawer } from "./cart-drawer";
import { Screen } from "./screen";

type Vals = Record<string, string>;
const val = (v: Vals, k: string) => (v[k] ?? "").trim();
const has = (v: Vals, ...keys: string[]) => keys.some((k) => val(v, k) !== "");

const M = "/media";

/* --------------------------------------------------------------- money */

/** PayPal Pay in 4: the price split four ways, in cents. Never hard-coded. */
export const PAY_IN = 4;
export const installmentCents = (priceCents: number) => Math.round(priceCents / PAY_IN);
/** "4 × $174.75" */
export const installments = (priceCents: number, currency: string) => `${PAY_IN} × ${formatMoney(installmentCents(priceCents), currency)}`;
/** "$699" — the full price is shown whole when it is whole. */
export const whole = (cents: number, currency: string) => formatMoney(cents, currency).replace(/\.00$/, "");

/* ------------------------------------------------------------- pictures */

/**
 * What each colourway looks like, keyed by the variant label.
 *
 * `ad`, `macro` and `exploded` are per-colourway shots that exist for some
 * ways and not yet for others; an undefined one is simply left out of the
 * carousel rather than guessed at.
 */
export interface Way {
  disc: string;
  ink: string;
  card: string;
  studio: string;
  life: string[];
  /** the Meta-ad style board shot */
  ad?: string;
  /** pads and rails, close */
  macro?: string;
  /** the board taken apart */
  exploded?: string;
}
export const WAYS: Record<string, Way> = {
  "Icy Swan": {
    disc: "#D6E9F6", ink: "#2E5570", card: `${M}/bd-cut-swan.png`, studio: `${M}/bd-studio-swan.jpg`, ad: `${M}/bd-ad-swan.jpg`,
    life: [`${M}/bd-e-swan-night.png`, `${M}/bd-c-swan-latina.png`, `${M}/bd-b-swan-socks.png`, `${M}/bd-d-swan-underbed.png`],
  },
  "Strawberry Milk": {
    disc: "#EEDCF5", ink: "#4A2357", card: `${M}/bd-cut-lilac.png`, studio: `${M}/bd-studio-lilac.jpg`,
    life: [`${M}/bd-e-lilac-evening.png`, `${M}/bd-a-lilac-top.png`, `${M}/bd-c-lilac-mirror2.png`, `${M}/bd-d-lilac-socks.png`],
    ad: `${M}/bd-ad-lilac.jpg`,
    macro: `${M}/bd-r-macro.jpg`,
  },
  Matcha: {
    disc: "#D8EDC4", ink: "#1E4636", card: `${M}/bd-cut-matcha.png`, studio: `${M}/bd-studio-matcha.jpg`,
    life: [`${M}/bd-c-matcha-black.png`, `${M}/bd-d-matcha-stretch.png`, `${M}/bd-e-matcha-backlit.png`, `${M}/bd-b-matcha-carry.png`],
  },
  Bare: {
    disc: "#F0E9DE", ink: "#4A4034", card: `${M}/bd-cut-bare.png`, studio: `${M}/bd-studio-bare.jpg`,
    life: [`${M}/bd-d-bare-rest.png`, `${M}/bd-c-bare-latina.png`, `${M}/bd-f-bare-fold.png`, `${M}/bd-d-bare-hallway.png`],
  },
};
const fallbackWay: Way = { disc: "#EFEFEF", ink: "#0E0F12", card: "", studio: "", life: [] };
export const wayOf = (label: string) => WAYS[label] ?? fallbackWay;
/** The tint behind a socks picture that has not been shot yet. Lilac, like the renders. */
const SOCKS_TINT = WAYS["Strawberry Milk"].disc;

/**
 * The grip socks in this colourway: the add-on variant whose label matches
 * the board's. Null until the socks product carries that colourway.
 */
const socksFor = (page: LoadedProductPage, label: string): VariantRow | null =>
  page.addOns.find((v) => v.label === label) ?? null;
/** What the socks cost inside the bundle. Computed from the row, never typed. */
const bundleSocksCents = (socks: VariantRow) => Math.max(0, socks.priceCents - BUNDLE_OFF_CENTS);

/** A colourway's own address. "Icy Swan" becomes "icy-swan". */
export function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** The four renders. Board on the lilac gradient, chrome, no sky. */
const R = {
  hero: `${M}/bd-r-hero.jpg`, // 21:9, board + chrome ring, empty left third
  fold: `${M}/bd-r-fold.jpg`, // 21:9, folded board + chrome blob, empty left half
  macro: `${M}/bd-r-macro.jpg`, // 4:5, pads and rails
  screen: `${M}/bd-r-screen.jpg`, // 4:5, rear of the screen
  gScreen: `${M}/bd-g-screen.jpg`, // 4:5, board with the instructor on the screen
};
/** Retired art: skies, clouds, AI lifestyle. Never rendered even if the editor still points at one. */
const RETIRED = /bd-(x-hero|x-life|hero-apt|g-hero|g-band|g-fold|sky-)/;
const allowed = (src: string) => (src && !RETIRED.test(src) ? src : "");

/* ----------------------------------------------------------------- copy */
/* team-copy.md is the copy authority; headings live here, not in the editor. */

const HERO = { sticker: "Screen built in", heading: "The Pilates board with the instructor built in.", cta: "Shop the board" };
const SHOP = { heading: "Shop the board", lede: "One board, every colourway. Same screen, same classes, same price." };
const FEED = { heading: "Shot in your apartment.", lede: "Tag @bodies. Phone photos only. We post the real ones." };
const MADE = { heading: "A Pilates studio that fits in a drawer.", lede: "Two pads, two rails, two cables, one screen. Nothing else in the room." };
const SOCKS = { heading: "Grip socks. Same four colours.", lede: "Silicone dots on the sole. Your feet stay on the pads." };
const STEPS = { heading: "Under the bed to a class in 30 seconds." };
const CMP = { heading: "What a studio costs you." };
const ASK_H = "Ask.";
const JOIN = { heading: "Join bodies.", lede: "New classes, new colourways, nothing else. No spam, unsubscribe in one tap." };

/** What it has that the others don't: shown, not told. */
const PROOF = [
  { src: R.gScreen, title: "The screen is in the board.", text: "No app, no tablet propped on a chair, nothing to pair. Open it and she's there." },
  { src: R.fold, title: "It folds flat.", text: "Screen down, board on its end, under the bed. A reformer that fits an apartment.", wide: true },
  { src: `${M}/bd-c-swan-latina.png`, title: "Somebody actually teaching.", text: "Instructors cue every move on the screen. You never guess whether you're doing it right." },
];
/** Under the band: the two 4:5 renders. Captions describe what is in the picture, nothing more. */
const MADE_PAIR = [
  { src: R.macro, title: "Pads and rails", text: "Two pads, two rails, the cable handles on the track." },
  { src: R.screen, title: "Hinged to the board", text: "Screen up for class, flat when you're done." },
];
/** Every item in the box, shown. Cut from the kit photograph. */
const BOX = [
  { src: `${M}/bd-box-board.jpg`, title: "The board", text: "with the built-in screen" },
  { src: `${M}/bd-box-cables.jpg`, title: "Two cables", text: "with foam handles" },
  { src: `${M}/bd-box-straps.jpg`, title: "Two ankle straps", text: "" },
  { src: `${M}/bd-box-pads.jpg`, title: "Two pads", text: "" },
  { src: `${M}/bd-box-charger.jpg`, title: "Charging cable", text: "" },
];
/** The FAQ: six Q&As from team-copy §6, one photo beside them. */
const ASK = [
  { q: "Do I need an app or a subscription?", a: "No. The classes are on the board's screen. Whether new classes ship as free updates is being confirmed." },
  { q: "I've never done Pilates. Will I be lost?", a: "No. There's a beginner path and the instructor cues every move. Start with First Footwork." },
  { q: "How big is it and how heavy?", a: "Built for one person to carry and store under a bed. Exact numbers are being confirmed." },
  { q: "Does it need Wi-Fi?", a: "Being confirmed. The plan is classes stored on the board, with Wi-Fi only for updates." },
  { q: "Is it a real reformer?", a: "It's a reformer-style board: cables, straps and pads for the same movements, in a fraction of the space." },
  { q: "What if I don't like it?", a: "Returns window and process are being confirmed and will be published here before launch." },
  /* The four that used to sit under the buy button, kept here so nothing is lost. */
  { q: "Which workouts are on the screen?", a: "Pilates, sculpt, core, glutes, arms, legs, stretch and recovery, led by instructors on the built-in screen. Class count and how new classes arrive are being confirmed." },
  { q: "Size, weight, storage?", a: "Screen folds flat, board stands on its end: under a bed or against a wall. Exact dimensions and weight are being confirmed." },
  { q: "Battery and setup?", a: "Charges with the included cable. Battery life and charging time are being confirmed. Setup is unfold, switch on, press play." },
  { q: "Shipping and returns?", a: "Free shipping worldwide. Pay in 4 with PayPal at checkout. Delivery times and the returns window are being confirmed." },
];
const BA = { heading: "One month on the board.", lede: "Shot on their phones, sent to us, unedited.", note: "Real customers, first name and weeks between photos exactly as they gave them. Same spot, same light. Nothing edited." };
const SAY = { heading: "What they say.", lede: "Real customers, real apartments, unedited." };
const CLIP = { eyebrow: "On the board", heading: "See it in a real room." };
/** bodies vs studio vs a mat — team-copy §7. Facts only. */
const COMPARE = {
  cols: ["Studio", "A mat"],
  rows: [
    { label: "Instructor", us: "On the built-in screen", them: ["In the room", "You and a phone"] },
    { label: "Resistance", us: "Cables, straps, pads", them: ["Full reformer", "None"] },
    { label: "When", us: "Whenever you want", them: ["Their timetable", "Whenever"] },
    { label: "Cost", us: "One board, no membership", them: ["Per class or monthly", "Cheap"] },
    { label: "Where it goes", us: "Folds flat, under the bed", them: ["Across town", "Rolled in a corner"] },
  ],
};
/** The captions that ride the UGC marquee: product facts, two lines each, rotated through. */
const FEED_LINES: { big: string; small: string; style: "stack" | "outline" | "tag" | "corner" }[] = [
  { big: "SCREEN BUILT IN", small: "press play. she tells you what to do.", style: "stack" },
  { big: "FOLDS FLAT", small: "under the bed by 9pm", style: "outline" },
  { big: "NO MEMBERSHIP", small: "one board. every class.", style: "tag" },
  { big: "HER ROOM", small: "her timing", style: "corner" },
];

/* --------------------------------------------------------------- orders */
/*
 * Section keys: a page.sections type, or one of the code-driven sections
 * (screen, made, proof, box). "reviews" renders only when page.reviews has
 * items; "before_after" only when a pair has both photos; "video_clips" only
 * when the first clip has a video. Nothing is ever shown without real data.
 */
const HOME_ORDER = ["buy_box", "before_after", "reviews", "video_clips", "social_proof_images", "screen", "made", "socks", "proof", "video_faq", "three_steps", "comparison_table", "closing_cta"];
const PDP_ORDER = ["before_after", "reviews", "video_clips", "social_proof_images", "screen", "proof", "made", "box", "socks", "video_faq", "three_steps", "comparison_table", "specifications", "closing_cta"];
const CODE_SECTIONS = new Set(["screen", "made", "proof", "box", "socks"]);

/* --------------------------------------------------------------- chrome */

export type Chrome = Pick<LoadedProductPage, "store" | "nav">;

export function Head({ page, storeParam = "", installment = "" }: { page: Chrome; storeParam?: string; installment?: string }) {
  const href = (p: string) => `${p}${storeParam}`;
  const drawer = useCartDrawer();
  const links: NavLink[] = page.nav.main.length
    ? page.nav.main
    : [
        { label: "Shop", href: "#shop" },
        { label: "The screen", href: "#screen" },
        { label: "How it works", href: "#how" },
        { label: "Ask", href: "#faq" },
      ];
  // Announcement lines, team-copy §11. "First run: 500 boards" is left out
  // until the owner confirms the run size (inventory today says 500 per colourway).
  const ann = (
    <>
      <li>Free shipping worldwide</li>
      <li>{installment ? `Pay in 4 with PayPal · ${installment}` : "Pay in 4 with PayPal"}</li>
      <li>The screen is built in. No app, no membership.</li>
    </>
  );

  return (
    <>
      {/* Printed twice and slid by exactly half its width, so the loop has no seam. */}
      <div className="bd-ann" role="region" aria-label="Offers">
        <div className="bd-ann__track">
          <ul className="bd-ann__run">{ann}</ul>
          <ul className="bd-ann__run" aria-hidden="true">{ann}</ul>
        </div>
      </div>

      <nav className="bd-nav" aria-label="Main">
        <div className="bd-wrap bd-nav__in">
          <a className="bd-nav__logo" href={href("/")} aria-label={page.store.name}>
            {page.store.logoUrl ? <img src={page.store.logoUrl} alt={page.store.name} /> : <span className="bd-nav__word">bodies</span>}
          </a>
          <ul className="bd-nav__links">
            {links.map((l) => (
              <li key={`${l.href}${l.label}`}>
                <a href={l.href.startsWith("#") ? `${href("/")}${l.href}` : href(l.href)}>{l.label}</a>
              </li>
            ))}
          </ul>
          <div className="bd-nav__right">
            <a
              className="bd-nav__cart"
              href={href("/cart")}
              aria-label="Cart"
              onClick={(event) => {
                if (!drawer) return;
                event.preventDefault();
                drawer.open(event.currentTarget);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7h12l1 13H5L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
              {drawer && drawer.itemCount > 0 ? <span className="bd-nav__count" aria-hidden="true">{drawer.itemCount}</span> : null}
            </a>
          </div>
        </div>
      </nav>
    </>
  );
}

export function Foot({ page, storeParam = "" }: { page: Chrome; storeParam?: string }) {
  const href = (p: string) => `${p}${storeParam}`;
  const year = new Date().getFullYear();
  return (
    <footer className="bd-foot">
      <div className="bd-wrap">
        <div className="bd-foot__grid">
          <div>
            <h2 className="bd-h3" style={{ fontSize: 18 }}>{JOIN.heading}</h2>
            <p className="bd-foot__say" style={{ marginTop: 8 }}>{JOIN.lede}</p>
            <form className="bd-foot__form" method="post" action={href("/checkout/identify")}>
              <input type="hidden" name="consent" value="1" />
              <input id="bd-foot-email" type="email" name="email" placeholder="enter your email here" aria-label="Your email" required />
              <button type="submit" className="bd-btn bd-btn--sm" aria-label="Join">→</button>
            </form>
            <div className="bd-foot__social" aria-label="Social">
              <a href="https://instagram.com" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" /></svg></a>
              <a href="https://tiktok.com" aria-label="TikTok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M14 3v11.5a3.5 3.5 0 1 1-3-3.46" /><path d="M14 6.2A5.6 5.6 0 0 0 19.5 10" /></svg></a>
            </div>
          </div>
          <img className="bd-foot__obj" src={`${M}/bd-chrome.jpg`} alt="" loading="lazy" />
          <div>
            <h4>Shop</h4>
            <ul>
              {Object.keys(WAYS).map((label) => (
                <li key={label}><a href={`/products/${slug(label)}${storeParam}`}>{label}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Help</h4>
            <ul>
              <li><a href={`${href("/")}#how`}>How it works</a></li>
              <li><a href={`${href("/")}#faq`}>FAQs</a></li>
              {page.nav.footer.map((l) => <li key={`${l.href}${l.label}`}><a href={href(l.href)}>{l.label}</a></li>)}
              <li><a href={href("/cart")}>Cart</a></li>
            </ul>
          </div>
        </div>
        <div className="bd-foot__legal">
          <span>© {year} {page.store.name}</span>
          <span>Pilates at home.</span>
        </div>
      </div>
      <div className="bd-foot__mark" aria-hidden="true">bodies</div>
    </footer>
  );
}

/* ------------------------------------------------------------- homepage */

export function BodiesHome({
  page,
  storeParam = "",
  publishableKey = null,
  paypalClientId = null,
}: {
  page: LoadedProductPage;
  storeParam?: string;
  publishableKey?: string | null;
  paypalClientId?: string | null;
}) {
  const lead = page.variants.find((v) => v.isDefault) ?? page.variants[0] ?? null;
  const photo = lead?.imageUrl ? { src: lead.imageUrl, alt: lead.label } : null;

  return (
    <CartDrawerProvider page={page} storeParam={storeParam} photo={photo} publishableKey={publishableKey} paypalClientId={paypalClientId}>
      <div className="bd">
        <Head page={page} storeParam={storeParam} installment={lead ? installments(lead.priceCents, page.store.currency) : ""} />
        <main>
          <Sections order={HOME_ORDER} page={page} storeParam={storeParam} />
        </main>
        <Foot page={page} storeParam={storeParam} />
      </div>
    </CartDrawerProvider>
  );
}

/** Walks a page order: editor sections by type, code sections by key. */
function Sections({ order, page, storeParam }: { order: string[]; page: LoadedProductPage; storeParam: string }) {
  const byType = new Map(page.sections.map((x) => [x.type, x] as const));
  return (
    <>
      {order.map((key) => {
        let body: React.ReactNode = null;
        let id = key;
        if (CODE_SECTIONS.has(key)) body = renderCode(key, page, storeParam);
        else {
          const section = byType.get(key);
          if (!section) return null;
          id = section.id;
          body = renderSection(section, page, storeParam);
        }
        if (!body) return null;
        return <section className="shopify-section bd-section" key={id}>{body}</section>;
      })}
    </>
  );
}

function renderCode(key: string, page: LoadedProductPage, storeParam: string) {
  const href = (p: string) => `${p}${storeParam}`;
  const lead = page.variants.find((x) => x.isDefault) ?? page.variants[0] ?? null;
  const shop = lead ? `/products/${slug(lead.label)}${storeParam}` : `${href("/")}#shop`;

  switch (key) {
    /* ------------------------------------------------------- the screen */
    case "screen":
      // Screen carries its own H2 and sub (screen.tsx), so nothing is repeated here.
      return (
        <div className="bd-sec bd-screen">
          <Screen id="screen" />
        </div>
      );

    /* ------------------------------------------------------- what the others don't have */
    case "proof":
      return (
        <div className="bd-sec bd-sec--tight" id="proof">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                <h2 className="bd-h2">What the others don't have.</h2>
              </div>
            </div>
            <div className="bd-proof">
              {PROOF.map((x) => (
                <figure className="bd-proof__item" key={x.src}>
                  <div className={`bd-proof__pic${x.wide ? " bd-proof__pic--wide" : ""}`}><img src={x.src} alt={x.title} loading="lazy" /></div>
                  <figcaption>
                    <h3 className="bd-h3">{x.title}</h3>
                    <p>{x.text}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      );

    /* ------------------------------------------------------- made to be looked at */
    case "made":
      return (
        <>
          <div className="bd-band">
            <div className="bd-band__pic"><img src={R.fold} alt="The board folded flat" loading="lazy" /></div>
            <div className="bd-band__in">
              <div className="bd-wrap">
                <div className="bd-band__copy">
                  <h2 className="bd-h2">{MADE.heading}</h2>
                  <p>{MADE.lede}</p>
                  <a className="bd-btn" href={shop}>Shop the board</a>
                </div>
              </div>
            </div>
          </div>
          <div className="bd-sec bd-sec--tight">
            <div className="bd-wrap">
              <div className="bd-pair">
                {MADE_PAIR.map((x) => (
                  <figure className="bd-pair__item" key={x.src}>
                    <div className="bd-pair__pic"><img src={x.src} alt={x.title} loading="lazy" /></div>
                    <figcaption>
                      <h3 className="bd-h3">{x.title}</h3>
                      <p>{x.text}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </>
      );

    /* ------------------------------------------------------- in the box */
    case "box":
      return (
        <div className="bd-sec bd-sec--tight" id="box">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                <h2 className="bd-h2">In the box.</h2>
                <p className="bd-lede">Everything you need. Nothing to buy after.</p>
              </div>
            </div>
            <div className="bd-boxgrid">
              {BOX.map((x) => (
                <figure className="bd-boxgrid__item" key={x.src}>
                  <div className="bd-boxgrid__pic"><img src={x.src} alt={x.title} loading="lazy" /></div>
                  <figcaption><b>{x.title}</b>{x.text ? <span>{x.text}</span> : null}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      );

    /* ------------------------------------------------------- grip socks */
    case "socks": {
      // The socks product's variants, from the loader. No socks in the
      // database, no section.
      const socks = page.addOns.filter((v) => WAYS[v.label]);
      if (socks.length === 0) return null;
      return (
        <div className="bd-sec bd-sec--tight" id="socks">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                <h2 className="bd-h2">{SOCKS.heading}</h2>
                <p className="bd-lede">{SOCKS.lede}</p>
              </div>
            </div>
            <div className="bd-socks">
              {socks.map((v) => (
                <SockCard key={v.id} variant={v} currency={page.store.currency} />
              ))}
            </div>
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

/** A socks picture, or the lilac tint with the label when it has not been shot yet. */
function SockPic({ variant }: { variant: VariantRow }) {
  return variant.imageUrl ? (
    <img src={variant.imageUrl} alt={`${variant.label} grip socks`} loading="lazy" />
  ) : (
    <span className="bd-tint" style={{ background: SOCKS_TINT }} aria-label={`${variant.label} grip socks`}>
      {variant.label}
    </span>
  );
}

function SockCard({ variant, currency }: { variant: VariantRow; currency: string }) {
  const drawer = useCartDrawer();
  const sold = variant.available <= 0;
  return (
    <div className="bd-sock">
      <div className="bd-sock__pic"><SockPic variant={variant} /></div>
      <span className="bd-sock__name">{variant.label}</span>
      <span className="bd-sock__price">{whole(variant.priceCents, currency)}</span>
      <button type="button" className="bd-btn bd-btn--sm" disabled={sold} onClick={(event) => drawer?.add(variant.id, event.currentTarget)}>
        {sold ? "Sold out" : "Add to cart"}
      </button>
    </div>
  );
}

function renderSection(section: LoadedSection, page: LoadedProductPage, storeParam: string) {
  const v = section.values;
  const blocks = section.blocks;
  const href = (p: string) => `${p}${storeParam}`;
  const lead = page.variants.find((x) => x.isDefault) ?? page.variants[0] ?? null;
  const cur = page.store.currency;

  switch (section.type) {
    /* ---------------------------------------------------------- hero + shop */
    case "buy_box": {
      // The hero breathes: one headline, one lime button, the sticker. The
      // editor's picture is honoured unless it is retired art.
      const shot = blocks.map((b) => allowed(val(b.values, "image"))).find(Boolean) || R.hero;
      const alt = blocks.map((b) => val(b.values, "alt")).find(Boolean) || "The bodies board";
      return (
        <>
          <div className="bd-hero">
            <div className="bd-hero__pic">
              <img src={shot} alt={alt} fetchPriority="high" />
            </div>
            <div className="bd-hero__panel">
              <div className="bd-wrap">
                <div className="bd-hero__copy">
                  <span className="bd-sticker">{HERO.sticker}</span>
                  <h1 className="bd-h1">{HERO.heading}</h1>
                  <div className="bd-hero__cta">
                    <a className="bd-btn bd-btn--big" href={lead ? `/products/${slug(lead.label)}${storeParam}` : `${href("/")}#shop`}>
                      {HERO.cta}{lead ? ` · ${whole(lead.priceCents, cur)}` : ""}
                    </a>
                    {lead ? <span className="bd-hero__pay">or {installments(lead.priceCents, cur)} with PayPal</span> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bd-sec" id="shop">
            <div className="bd-wrap">
              <div className="bd-sec__head">
                <div>
                  <h2 className="bd-h2">{SHOP.heading}</h2>
                  <p className="bd-lede">{SHOP.lede}</p>
                </div>
                <a className="bd-sec__all" href={lead ? `/products/${slug(lead.label)}${storeParam}` : "#shop"}>Shop all →</a>
              </div>
              <div className="bd-ways">
                {page.variants.map((variant) => (
                  <WayCard key={variant.id} variant={variant} currency={cur} storeParam={storeParam} />
                ))}
              </div>
            </div>
          </div>
        </>
      );
    }

    /* ------------------------------------------------------- the girls: UGC grid */
    case "social_proof_images": {
      const items = blocks.filter((b) => allowed(val(b.values, "image")));
      if (items.length === 0) return null;
      return (
        <div className="bd-sec" id="feed">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                <h2 className="bd-h2">{FEED.heading}</h2>
                <p className="bd-lede">{FEED.lede}</p>
              </div>
            </div>
          </div>
          <Feed items={items.map((b) => ({ id: b.id, src: val(b.values, "image"), caption: val(b.values, "caption") }))} />
        </div>
      );
    }

    /* ------------------------------------------------------- before / after: real pairs only */
    case "before_after": {
      // Renders only when a pair carries both photos. No stock, no renders,
      // no mock-ups in this slot (team-copy §5).
      const pairs = blocks.filter((b) => allowed(val(b.values, "before")) && allowed(val(b.values, "after")));
      if (pairs.length === 0) return null;
      return (
        <div className="bd-sec" id="results">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                <h2 className="bd-h2">{val(v, "heading") || BA.heading}</h2>
                <p className="bd-lede">{val(v, "subheading") || BA.lede}</p>
              </div>
            </div>
          </div>
          <div className="bd-ba">
            <div className="bd-wrap bd-ba__row">
              {pairs.map((b) => {
                const weeks = val(b.values, "weeks").replace(/\D+/g, "");
                return (
                  <article className="bd-ba__card" key={b.id}>
                    <div className="bd-ba__pics">
                      <figure className="bd-ba__pic">
                        <img src={val(b.values, "before")} alt={`${val(b.values, "name")} before`} loading="lazy" />
                        <span className="bd-ba__tag">Before</span>
                        <span className="bd-ba__week">Week 0</span>
                      </figure>
                      <figure className="bd-ba__pic">
                        <img src={val(b.values, "after")} alt={`${val(b.values, "name")} after`} loading="lazy" />
                        <span className="bd-ba__tag">After</span>
                        {weeks ? <span className="bd-ba__week">Week {weeks}</span> : null}
                      </figure>
                    </div>
                    <div className="bd-ba__meta">
                      {val(b.values, "name") ? <b>{val(b.values, "name")}</b> : null}
                      {val(b.values, "note") ? <p>{val(b.values, "note")}</p> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          <div className="bd-wrap">
            <p className="bd-foot-note">{val(v, "footnote") || BA.note}</p>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- reviews: real ones only */
    case "reviews": {
      // Renders only when published reviews exist. Never seeded.
      if (page.reviews.length === 0) return null;
      const items = page.reviews.map((r) => ({ ...r, rating: Math.max(1, Math.min(5, r.rating)) }));
      const avg = items.reduce((n, r) => n + r.rating, 0) / items.length;
      // Printed twice and slid by half its width, like the announcement bar.
      const cards = items.map((r) => (r.imageUrl ? <StoryCard key={r.id} r={r} /> : <NoteCard key={r.id} r={r} />));
      return (
        <div className="bd-sec" id="reviews">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                <h2 className="bd-h2">{val(v, "heading") || SAY.heading}</h2>
                <p className="bd-lede">{val(v, "subheading") || SAY.lede}</p>
                <p className="bd-say__sum">
                  <Stars n={Math.round(avg)} />
                  <b>{avg.toFixed(1)}</b> · {items.length} {items.length === 1 ? "review" : "reviews"}
                </p>
              </div>
            </div>
          </div>
          <div className="bd-say">
            <div className="bd-say__track">
              <div className="bd-say__run">{cards}</div>
              <div className="bd-say__run" aria-hidden="true">{cards}</div>
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- one clip, the bullets, the button */
    case "video_clips": {
      // Renders only when the first clip has a video. The bullets come from
      // the editor, one per line.
      const first = blocks[0];
      const src = first ? val(first.values, "video") : "";
      if (!src) return null;
      const bullets = val(v, "bullets").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const embed = embedUrl(src);
      return (
        <div className="bd-sec" id="clip">
          <div className="bd-wrap bd-clip">
            <div className="bd-clip__frame">
              {embed ? (
                <iframe src={embed} title={val(first.values, "caption") || "Video"} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              ) : (
                <video src={src} controls playsInline preload="metadata" />
              )}
            </div>
            <div className="bd-clip__copy">
              <p className="bd-eyebrow">{CLIP.eyebrow}</p>
              <h2 className="bd-h2">{val(v, "heading") || CLIP.heading}</h2>
              {val(v, "subheading") ? <p className="bd-lede">{val(v, "subheading")}</p> : null}
              {bullets.length ? (
                <ul className="bd-pdp__get bd-clip__list">
                  {bullets.map((b) => <li key={b}>{b}</li>)}
                </ul>
              ) : null}
              <a className="bd-btn bd-btn--big bd-clip__btn" href={lead ? `/products/${slug(lead.label)}${storeParam}` : `${href("/")}#shop`}>
                Shop the board{lead ? ` · ${installments(lead.priceCents, cur)}` : ""}
              </a>
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- FAQ: one photo, one list */
    case "video_faq": {
      // The six customer-voice questions (team-copy §6) first, the first one
      // open; the editor's own Q&As follow in the same list.
      const items = blocks.filter((b) => has(b.values, "question", "answer"));
      const all = [
        ...ASK.map((x) => ({ key: x.q, q: x.q, a: x.a })),
        ...items.map((b) => ({ key: b.id, q: val(b.values, "question"), a: val(b.values, "answer") })),
      ];
      return (
        <div className="bd-sec" id="faq">
          <div className="bd-wrap bd-ask">
            <div className="bd-ask__pic"><img src={R.screen} alt="" loading="lazy" /></div>
            <div className="bd-ask__list">
              <h2 className="bd-h2 bd-ask__h">{ASK_H}</h2>
              <div className="bd-faq__list">
                {all.map((x, i) => (
                  <details className="bd-faq__item" key={x.key} open={i === 0}>
                    <summary>{x.q}</summary>
                    <p>{x.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- thirty seconds to a class */
    case "three_steps": {
      const items = blocks.filter((b) => has(b.values, "title", "text"));
      if (items.length === 0) return null;
      return (
        <div className="bd-sec" id="how">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                <h2 className="bd-h2">{STEPS.heading}</h2>
              </div>
            </div>
            <ol className="bd-steps">
              {items.map((b, i) => (
                <li className="bd-step" key={b.id}>
                  <div className="bd-step__pic">
                    {allowed(val(b.values, "image")) ? <img src={val(b.values, "image")} alt={val(b.values, "title")} loading="lazy" /> : null}
                  </div>
                  <span className="bd-step__n">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="bd-h3">{val(b.values, "title")}</h3>
                  <p>{val(b.values, "text")}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- us vs the studio vs a mat */
    case "comparison_table":
      return (
        <div className="bd-sec" id="compare">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                <h2 className="bd-h2">{CMP.heading}</h2>
              </div>
            </div>
            <div className="bd-card bd-cmp__scroll">
              <table className="bd-cmp__table">
                <thead>
                  <tr>
                    <th aria-label="Row" />
                    <th className="bd-cmp__us"><span>{val(v, "usLabel") || page.store.name}</span></th>
                    {COMPARE.cols.map((c) => <th key={c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.rows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      <td className="bd-cmp__us">{r.us}</td>
                      {r.them.map((t, i) => <td key={i}>{t}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );

    /* ------------------------------------------------------- specs: never guessed */
    case "specifications": {
      const rows = blocks.filter((b) => has(b.values, "label"));
      if (rows.length === 0) return null;
      return (
        <div className="bd-sec bd-sec--tight">
          <div className="bd-wrap bd-specs">
            {val(v, "heading") ? <h2 className="bd-h3 bd-specs__h">{val(v, "heading")}</h2> : null}
            <dl>
              {rows.map((b) => (
                <div className="bd-specs__row" key={b.id}>
                  <dt>{val(b.values, "label")}</dt>
                  <dd className={val(b.values, "value") ? undefined : "bd-specs__pending"}>{val(b.values, "value") || "Being confirmed"}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- email card on a photo */
    case "closing_cta":
      return (
        <div className="bd-join">
          <div className="bd-join__pic"><img src={`${M}/bd-e-lilac-evening.png`} alt="" loading="lazy" /></div>
          <div className="bd-join__in">
            <div className="bd-wrap">
              <div className="bd-join__card">
                <h2 className="bd-h2" style={{ fontSize: 28 }}>{JOIN.heading}</h2>
                <p>{JOIN.lede}</p>
                <form className="bd-join__form" method="post" action={href("/checkout/identify")}>
                  <input type="hidden" name="consent" value="1" />
                  <input id="bd-join-email" type="email" name="email" placeholder="enter your email here" aria-label="Your email" required />
                  <button type="submit" className="bd-btn">Get in</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------- payment marks */

/**
 * The payment banner under the buy button: six small badges, inline SVG,
 * hairline border, each brand's wordmark in its own colour. No image files.
 */
function PayMarks() {
  const W = 38, H = 24;
  const Badge = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <svg className="bd-pay__mark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
      <rect x=".5" y=".5" width={W - 1} height={H - 1} rx="6" fill="#fff" stroke="rgba(11,12,14,.18)" />
      {children}
    </svg>
  );
  return (
    <div className="bd-pay" aria-label="Ways to pay">
      <Badge label="Apple Pay">
        {/* the apple: a leaf and a bitten circle, then "Pay" */}
        <path d="M12.6 8.1c.5-.6 1.2-1 1.7-1 .1.6-.2 1.2-.6 1.6-.4.5-1 .8-1.6.7-.1-.5.1-1 .5-1.3Z" fill="#0B0C0E" />
        <path d="M14.6 9.7c-1 0-1.6.6-2.1.6-.5 0-1.2-.6-2-.6-1 0-2 .6-2.5 1.6-1 1.9-.3 4.6.7 6.1.5.7 1.1 1.5 1.9 1.5.7 0 1-.5 1.9-.5.9 0 1.1.5 1.9.5.8 0 1.3-.7 1.8-1.4.5-.8.8-1.6.8-1.6s-1.6-.6-1.6-2.4c0-1.5 1.2-2.2 1.3-2.3-.7-1.1-1.8-1.5-2.1-1.5Z" fill="#0B0C0E" />
        <text x="19" y="16.6" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="9.5" fontWeight="600" fill="#0B0C0E">Pay</text>
      </Badge>
      <Badge label="Google Pay">
        <text x="6" y="16.4" fontFamily="Arial, Helvetica, sans-serif" fontSize="10" fontWeight="700" fill="#4285F4">G</text>
        <text x="15" y="16.4" fontFamily="Arial, Helvetica, sans-serif" fontSize="9" fontWeight="600" fill="#5F6368">Pay</text>
      </Badge>
      <Badge label="PayPal">
        <text x="5" y="16" fontFamily="Arial, Helvetica, sans-serif" fontSize="8.4" fontWeight="700" fontStyle="italic" fill="#003087">Pay</text>
        <text x="19.5" y="16" fontFamily="Arial, Helvetica, sans-serif" fontSize="8.4" fontWeight="700" fontStyle="italic" fill="#009CDE">Pal</text>
      </Badge>
      <Badge label="Visa">
        <text x="19" y="16.6" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="10.5" fontWeight="800" fontStyle="italic" fill="#1A1F71">VISA</text>
      </Badge>
      <Badge label="Mastercard">
        <circle cx="15" cy="12" r="6" fill="#EB001B" />
        <circle cx="23" cy="12" r="6" fill="#F79E1B" />
        <path d="M19 7.4a6 6 0 0 1 0 9.2 6 6 0 0 1 0-9.2Z" fill="#FF5F00" />
      </Badge>
      <Badge label="American Express">
        <text x="19" y="16" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="8.6" fontWeight="800" fill="#016FD0">AMEX</text>
      </Badge>
    </div>
  );
}

/* ------------------------------------------------------- liquid chrome */

/**
 * A liquid-chrome shape, drawn: SVG gradients only (white → #C9CCD6 → #6E7280
 * → white highlights, a faint lilac reflection), so it reads as metal on any
 * photograph. Two variants: a blob and a ring. Decorative, always aria-hidden.
 */
export function Chrome({ variant = "blob", size = 110, className = "" }: { variant?: "blob" | "ring"; size?: number; className?: string }) {
  const uid = `bdc-${variant}-${size}`;
  const defs = (
    <defs>
      <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset=".22" stopColor="#C9CCD6" />
        <stop offset=".48" stopColor="#6E7280" />
        <stop offset=".62" stopColor="#F4F5F8" />
        <stop offset=".8" stopColor="#8C90A0" />
        <stop offset="1" stopColor="#FFFFFF" />
      </linearGradient>
      <radialGradient id={`${uid}-hi`} cx=".3" cy=".25" r=".5">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity=".95" />
        <stop offset=".5" stopColor="#FFFFFF" stopOpacity=".15" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${uid}-lilac`} cx=".75" cy=".8" r=".5">
        <stop offset="0" stopColor="#D9BEE8" stopOpacity=".75" />
        <stop offset="1" stopColor="#D9BEE8" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${uid}-edge`} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#3B3F4A" stopOpacity=".6" />
        <stop offset=".5" stopColor="#FFFFFF" stopOpacity=".9" />
        <stop offset="1" stopColor="#3B3F4A" stopOpacity=".6" />
      </linearGradient>
    </defs>
  );
  if (variant === "ring") {
    return (
      <svg className={`bd-chrome ${className}`} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        {defs}
        <path d="M50 8a42 42 0 1 0 0 84 42 42 0 1 0 0-84Zm0 24a18 18 0 1 1 0 36 18 18 0 1 1 0-36Z" fill={`url(#${uid}-body)`} fillRule="evenodd" />
        <path d="M50 8a42 42 0 1 0 0 84 42 42 0 1 0 0-84Zm0 24a18 18 0 1 1 0 36 18 18 0 1 1 0-36Z" fill={`url(#${uid}-lilac)`} fillRule="evenodd" />
        <path d="M50 8a42 42 0 1 0 0 84 42 42 0 1 0 0-84Zm0 24a18 18 0 1 1 0 36 18 18 0 1 1 0-36Z" fill={`url(#${uid}-hi)`} fillRule="evenodd" />
        <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#${uid}-edge)`} strokeWidth="1.2" />
        <circle cx="50" cy="50" r="18" fill="none" stroke={`url(#${uid}-edge)`} strokeWidth="1" />
      </svg>
    );
  }
  const blob = "M62 8c14 2 28 14 30 30 2 17-8 30-20 40-11 9-26 16-40 10C16 81 6 64 8 46 10 26 24 12 42 8c7-1 14-1 20 0Z";
  return (
    <svg className={`bd-chrome ${className}`} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {defs}
      <path d={blob} fill={`url(#${uid}-body)`} />
      <path d={blob} fill={`url(#${uid}-lilac)`} />
      <path d={blob} fill={`url(#${uid}-hi)`} />
      <path d={blob} fill="none" stroke={`url(#${uid}-edge)`} strokeWidth="1.2" />
      <ellipse cx="34" cy="30" rx="12" ry="6" transform="rotate(-30 34 30)" fill="#fff" opacity=".7" />
    </svg>
  );
}

/* ------------------------------------------------------- UGC marquee */

/**
 * "Shot in your apartment": the section's real phone photos as 4:5 tiles on an
 * auto-scrolling marquee. Every second tile carries two lines of huge
 * condensed caps (product facts) over a dark scrim, with one small chrome
 * shape floating on its corner. Printed twice and slid by half its width, so
 * the loop has no seam; hover pauses; reduced-motion makes it a snap row.
 */
function Feed({ items }: { items: { id: string; src: string; caption: string }[] }) {
  const tiles = items.map((it, i) => {
    const captioned = i % 2 === 1;
    const lines = FEED_LINES[Math.floor(i / 2) % FEED_LINES.length];
    return (
      <figure className={`bd-feed__tile${captioned ? " bd-feed__tile--cap" : ""}`} key={it.id}>
        <img src={it.src} alt={it.caption} loading="lazy" />
        {captioned ? (
          <>
            <figcaption className={`bd-feed__type bd-feed__type--${lines.style}`} aria-hidden="true">
              <b>{lines.big}</b>
              <i>{lines.small}</i>
            </figcaption>
            <span className="bd-feed__time">0:{String(12 + i * 7).padStart(2, "0")}</span>
          </>
        ) : it.caption ? (
          <figcaption className="bd-feed__cap">{it.caption}</figcaption>
        ) : null}
      </figure>
    );
  });
  return (
    <div className="bd-feed">
      <div className="bd-feed__track">
        <div className="bd-feed__run">{tiles}</div>
        <div className="bd-feed__run" aria-hidden="true">{tiles}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- reviews */

type ReviewLike = { id: string; name: string; rating: number; title: string | null; body: string; imageUrl: string | null; verified: boolean };

function Stars({ n }: { n: number }) {
  return <span className="bd-stars" aria-label={`${n} out of 5`}>{"★".repeat(n)}<span aria-hidden="true">{"★".repeat(5 - n)}</span></span>;
}

/** A review with a photo: the picture as a 9:16 story, a frosted caption bar. */
function StoryCard({ r }: { r: ReviewLike }) {
  const line = (r.title || r.body).split(/\r?\n/)[0];
  return (
    <article className="bd-story">
      <img src={r.imageUrl!} alt="" loading="lazy" />
      <div className="bd-story__bar">
        <b>{r.name}{r.verified ? <span className="bd-story__ok" title="Verified">✓</span> : null}</b>
        <Stars n={r.rating} />
        {line ? <p>{line}</p> : null}
      </div>
    </article>
  );
}

/** A text-only review, as a notification from the bodies app. */
function NoteCard({ r }: { r: ReviewLike }) {
  return (
    <article className="bd-note">
      <div className="bd-note__head">
        <span className="bd-note__av" aria-hidden="true">{(r.name.trim()[0] || "b").toUpperCase()}</span>
        <span className="bd-note__app">bodies</span>
        <span className="bd-note__when">now</span>
      </div>
      <b className="bd-note__name">{r.name}{r.verified ? " · Verified" : ""}</b>
      <p>{r.title ? `${r.title} — ` : ""}{r.body}</p>
      <Stars n={r.rating} />
    </article>
  );
}

/** A YouTube or Vimeo link becomes a privacy-friendly embed; anything else is a file. */
function embedUrl(src: string): string | null {
  const yt = src.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1`;
  const vm = src.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?dnt=1`;
  return null;
}

function WayCard({ variant, currency, storeParam }: { variant: VariantRow; currency: string; storeParam: string }) {
  const drawer = useCartDrawer();
  const way = wayOf(variant.label);
  const sold = variant.available <= 0;
  const shot = way.card || variant.imageUrl;
  const saving = variant.compareAtCents && variant.compareAtCents > variant.priceCents;

  return (
    <div className="bd-way">
      <span className="bd-way__badge">New</span>
      <a className="bd-way__pic" href={`/products/${slug(variant.label)}${storeParam}`} aria-label={variant.label}>
        {shot ? <img src={shot} alt={variant.label} loading="lazy" /> : null}
      </a>
      <span className="bd-way__name">{variant.label}</span>
      {variant.sublabel ? <span className="bd-way__note">{variant.sublabel}</span> : null}
      <span className="bd-way__price">
        <b>{whole(variant.priceCents, currency)}</b>
        {saving ? <s>{whole(variant.compareAtCents!, currency)}</s> : null}
        <span>or {installments(variant.priceCents, currency)}</span>
      </span>
      <button type="button" className="bd-btn" disabled={sold} onClick={(event) => drawer?.add(variant.id, event.currentTarget)}>
        {sold ? "Sold out" : "Add to cart"}
      </button>
    </div>
  );
}

/* --------------------------------------------------------- product page */

export function BodiesProduct({
  page,
  variant,
  storeParam = "",
  publishableKey = null,
  paypalClientId = null,
}: {
  page: LoadedProductPage;
  variant: VariantRow;
  storeParam?: string;
  publishableKey?: string | null;
  paypalClientId?: string | null;
}) {
  const photo = variant.imageUrl ? { src: variant.imageUrl, alt: variant.label } : null;
  return (
    <CartDrawerProvider page={page} storeParam={storeParam} photo={photo} publishableKey={publishableKey} paypalClientId={paypalClientId}>
      <div className="bd">
        <Head page={page} storeParam={storeParam} installment={installments(variant.priceCents, page.store.currency)} />
        <main>
          <Pdp page={page} variant={variant} storeParam={storeParam} />
          <Sections order={PDP_ORDER} page={page} storeParam={storeParam} />
        </main>
        <Foot page={page} storeParam={storeParam} />
      </div>
    </CartDrawerProvider>
  );
}

function Pdp({ page, variant, storeParam }: { page: LoadedProductPage; variant: VariantRow; storeParam: string }) {
  const drawer = useCartDrawer();
  const way = wayOf(variant.label);
  const cur = page.store.currency;
  const socks = socksFor(page, variant.label);

  // The gallery, in order: the clean cut-out, a real before|after pair when
  // the page has one, the ad shot, the first phone photo, the macro, the
  // exploded view, the socks, then the studio still and the rear of the
  // screen. Anything this colourway does not have yet is left out.
  const firstPair = page.sections
    .find((s) => s.type === "before_after")
    ?.blocks.find((b) => allowed(val(b.values, "before")) && allowed(val(b.values, "after")));
  const gallery: { key: string; src: string; product?: boolean; pair?: [string, string]; alt?: string }[] = [
    ...(way.card ? [{ key: way.card, src: way.card, product: true, alt: `${variant.label} board` }] : []),
    ...(firstPair
      ? [{ key: firstPair.id, src: val(firstPair.values, "after"), pair: [val(firstPair.values, "before"), val(firstPair.values, "after")] as [string, string], alt: `${val(firstPair.values, "name") || "A customer"} before and after` }]
      : []),
    ...(way.ad ? [{ key: way.ad, src: way.ad }] : []),
    ...(way.life[0] ? [{ key: way.life[0], src: way.life[0] }] : []),
    ...(way.macro ? [{ key: way.macro, src: way.macro, alt: "Pads and rails" }] : []),
    ...(way.exploded ? [{ key: way.exploded, src: way.exploded, alt: "The board, taken apart" }] : []),
    ...(socks?.imageUrl ? [{ key: socks.imageUrl, src: socks.imageUrl, alt: `${socks.label} grip socks` }] : []),
    ...(way.studio ? [{ key: way.studio, src: way.studio }] : []),
    { key: R.screen, src: R.screen, alt: "The rear of the screen" },
  ].filter((g, i, all) => all.findIndex((x) => x.key === g.key) === i);
  const [slide, setSlide] = useState(0);
  const go = (n: number) => setSlide((n + gallery.length) % gallery.length);
  const sold = variant.available <= 0;

  // "Board only" or "Board + grip socks". The bundle exists only when the
  // socks product carries this colourway with stock; the total is the two
  // rows added, the socks at the bundle price.
  const canBundle = Boolean(socks && socks.available > 0);
  const [withSocks, setWithSocks] = useState(false);
  const bundled = canBundle && withSocks;
  const totalCents = variant.priceCents + (bundled && socks ? bundleSocksCents(socks) : 0);
  const pay4 = installments(totalCents, cur);
  const saving = variant.compareAtCents && variant.compareAtCents > variant.priceCents ? variant.compareAtCents - variant.priceCents : 0;
  const addSelected = (from: HTMLElement | null) => {
    if (!drawer) return;
    if (bundled && socks) drawer.addMany([{ variantId: variant.id }, { variantId: socks.id, bundle: true }], from);
    else drawer.add(variant.id, from);
  };
  // Buy now: this set and nothing else, straight to the checkout. The board
  // replaces whatever was in the bag; the socks ride along at the bundle price.
  const [buying, setBuying] = useState(false);
  const buyNow = async () => {
    if (buying) return;
    setBuying(true);
    const post = (id: string, q: string) => {
      const u = new URL(`/cart/add${storeParam}`, window.location.origin);
      for (const [k, v] of new URLSearchParams(q)) u.searchParams.set(k, v);
      return fetch(u.toString(), { method: "POST", body: new URLSearchParams({ variantId: id }), credentials: "same-origin", redirect: "manual" }).catch(() => undefined);
    };
    await post(variant.id, "replace=1");
    if (bundled && socks) await post(socks.id, "bundle=1");
    window.location.assign(`/checkout${storeParam}`);
  };
  const buyRef = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const target = buyRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="bd-wrap bd-pdp">
        <div className="bd-car">
          <div className="bd-car__main">
            {gallery.map((g, i) => (
              <figure key={g.key} className={`${g.product ? "is-product" : ""}${g.pair ? "is-pair" : ""}${i === slide ? " is-on" : ""}`} aria-hidden={i !== slide}>
                {g.pair ? (
                  <>
                    <img src={g.pair[0]} alt={g.alt ? `${g.alt}: before` : ""} loading="lazy" />
                    <img src={g.pair[1]} alt={g.alt ? `${g.alt}: after` : ""} loading="lazy" />
                  </>
                ) : (
                  <img src={g.src} alt={g.alt ?? ""} loading={i === 0 ? "eager" : "lazy"} />
                )}
              </figure>
            ))}
            <button type="button" className="bd-car__arr bd-car__arr--l" aria-label="Previous" onClick={() => go(slide - 1)}>‹</button>
            <button type="button" className="bd-car__arr bd-car__arr--r" aria-label="Next" onClick={() => go(slide + 1)}>›</button>
          </div>
          <div className="bd-car__thumbs" role="tablist">
            {gallery.map((g, i) => (
              <button type="button" role="tab" key={g.key} aria-selected={i === slide} className={g.product ? "is-product" : g.pair ? "is-pair" : undefined} onClick={() => setSlide(i)}>
                {g.pair ? <><img src={g.pair[0]} alt="" loading="lazy" /><img src={g.pair[1]} alt="" loading="lazy" /></> : <img src={g.src} alt="" loading="lazy" />}
              </button>
            ))}
          </div>
          <p className="bd-car__pay">
            <b>Take it home for {whole(Math.round(totalCents / 4), cur)} today</b>
            <span>3 more payments, no interest · PayPal Pay in 4</span>
            <svg viewBox="0 0 64 16" aria-label="PayPal" role="img"><text x="0" y="13" fontFamily="Arial, sans-serif" fontStyle="italic" fontWeight="800" fontSize="14" fill="#003087">Pay</text><text x="30" y="13" fontFamily="Arial, sans-serif" fontStyle="italic" fontWeight="800" fontSize="14" fill="#009CDE">Pal</text></svg>
          </p>
        </div>

        {/* Mobile thumb-zone order (team-copy §11): photo → swatches → offer → button → one shipping line → payment marks. Nothing else: the rest of the page says the rest. */}
        <div className="bd-pdp__buybox">
          <p className="bd-eyebrow">{page.product.title}</p>
          <h1 className="bd-h1 bd-pdp__h1">{variant.label}</h1>
          <p className="bd-pdp__tag">A reformer-style Pilates board with a built-in screen and a real instructor on it. Folds flat, lives in a small apartment.</p>
          <div className="bd-pdp__ways" role="list" aria-label="Colourway">
            {page.variants.map((other) => (
              <a key={other.id} role="listitem" aria-current={other.id === variant.id} className="bd-pdp__way" href={`/products/${slug(other.label)}${storeParam}`}>
                {wayOf(other.label).card ? <img src={wayOf(other.label).card} alt="" loading="lazy" /> : null}
                <span>{other.label}</span>
              </a>
            ))}
          </div>

          <div className="bd-offer">
            {canBundle && socks ? (
              <div className="bd-pick" role="radiogroup" aria-label="Choose your set">
                <button type="button" role="radio" aria-checked={!withSocks} className="bd-pick__row" onClick={() => setWithSocks(false)}>
                  <span className="bd-pick__dot" aria-hidden="true" />
                  <span className="bd-pick__what"><b>The board</b><small>Screen, cables, straps, pads, charger</small></span>
                  <span className="bd-pick__price"><b>{whole(variant.priceCents, cur)}</b>{saving ? <s>{whole(variant.compareAtCents!, cur)}</s> : null}<em>{whole(Math.round(variant.priceCents / 4), cur)} × 4</em></span>
                </button>
                <button type="button" role="radio" aria-checked={withSocks} className="bd-pick__row" onClick={() => setWithSocks(true)}>
                  <span className="bd-pick__dot" aria-hidden="true" />
                  <span className="bd-pick__what">
                    <b>The board + grip socks <em>Most picked</em></b>
                    <small>Matching {variant.label} socks · {whole(socks.priceCents, cur)} alone, {whole(bundleSocksCents(socks), cur)} here</small>
                  </span>
                  {socks.imageUrl ? <img className="bd-pick__thumb" src={socks.imageUrl} alt="" loading="lazy" /> : null}
                  <span className="bd-pick__price"><b>{whole(variant.priceCents + bundleSocksCents(socks), cur)}</b>{saving ? <s>{whole(variant.compareAtCents! + socks.priceCents, cur)}</s> : null}<em>{whole(Math.round((variant.priceCents + bundleSocksCents(socks)) / 4), cur)} × 4</em></span>
                </button>
              </div>
            ) : (
              <div className="bd-pdp__full">
                <b className="bd-pdp__big">{whole(totalCents, cur)}</b>
                {saving ? <s>{whole(variant.compareAtCents!, cur)}</s> : null}
                {saving ? <span className="bd-pdp__save">Save {whole(saving, cur)}</span> : null}
              </div>
            )}
            <div className="bd-pdp__buy" ref={buyRef}>
              <button type="button" className="bd-btn bd-btn--big" disabled={sold || buying} onClick={buyNow}>
                {sold ? "Sold out" : buying ? "One moment…" : `Buy now · ${whole(totalCents, cur)}`}
              </button>
              <button type="button" className="bd-btn bd-btn--big bd-btn--ghost" disabled={sold} onClick={(event) => addSelected(event.currentTarget)}>
                Add to cart
              </button>
            </div>
          </div>
          <p className="bd-pdp__ship">Free shipping worldwide · 30-second setup</p>
          <PayMarks />
        </div>
      </div>

      {/* Appears once the buy button scrolls out. Mobile: swatch + installment left, button right. */}
      <div className={`bd-stick${stuck ? " bd-stick--on" : ""}`} aria-hidden={!stuck}>
        <div className="bd-wrap bd-stick__in">
          {way.card ? <img src={way.card} alt="" /> : null}
          <span className="bd-stick__name">{variant.label}{bundled ? " + socks" : ""}</span>
          <span className="bd-stick__price"><b>{whole(totalCents, cur)}</b><small>or {pay4}</small></span>
          <button type="button" className="bd-btn" disabled={sold || buying} tabIndex={stuck ? 0 : -1} onClick={buyNow}>
            {sold ? "Sold out" : "Buy now"}
          </button>
        </div>
      </div>
    </>
  );
}
