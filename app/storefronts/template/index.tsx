/**
 * cryo storefront.
 *
 * Ceiling Buddy's template, wearing cryo's paint. The structure, the money
 * path (form post -> drawer -> upsell -> branded checkout -> PayPal express)
 * and every mechanic are copied verbatim, because that path is the only one
 * in this repo that has been clicked through in a browser. What changed is
 * the class prefix (cb- -> cb-), the palette, the nav and the rail.
 *
 * The platform's two rules hold: the fifteen sections are content and come out
 * of `values` / `blocks` in the order the database gives them; the header,
 * footer and icons are theme chrome and live here. Nothing is invented — a
 * section with no content renders nothing, an unmeasured spec renders
 * "Spec pending", and there are no reviews because there are no customers.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { LoadedProductPage, LoadedSection } from "~/lib/store.server";
import { formatMoney, savedAmount, savedPercent } from "~/lib/money";
import { SPEC_PENDING } from "~/lib/sections";
import { CartDrawerProvider, useCartDrawer } from "./cart-drawer";
import { PayPalExpress } from "../garden-buddy/paypal-express";
import { EmailPopup } from "./popup";
import { PhoneChat } from "../shared/phone-chat";
import { ProductExpress } from "../garden-buddy/product-express";
import { embedFor, isOwnVideo } from "./embeds";

type Vals = Record<string, string>;
/*
 * Always a string, whatever is in the row.
 *
 * This trimmed the raw value, so one section value stored as an object
 * instead of a string threw inside the render and turned every page that
 * drew that section into "Something went wrong" -- the whole store, home
 * page included, for hours. A storefront must not be that easy to take down
 * from a data row: an object with a `value` is unwrapped, anything else is
 * stringified, and a genuinely empty or missing value stays "".
 */
const val = (v: Vals, k: string): string => {
  const raw: unknown = v[k];
  const inner = raw && typeof raw === "object" && "value" in (raw as object) ? (raw as { value?: unknown }).value : raw;
  return inner == null ? "" : String(inner).trim();
};
const has = (v: Vals, ...keys: string[]) => keys.some((k) => val(v, k) !== "");

/**
 * cryo has no logo file yet. The wordmark is the brand — black, lowercase —
 * so until a mark lands in R2 this is null and the name is set in type. An
 * <img> with an empty src is a broken picture on every page, which is worse
 * than no picture at all.
 */
const LOGO: string | null = null;
/**
 * The mark the chrome actually draws.
 *
 * `BRAND.logo` is the template's built-in default and it is deliberately null,
 * so a shop with no logo shows its name in type rather than a broken picture.
 * A shop that has uploaded one wants to see it — so the store's own file wins
 * over the template's, and the template's over nothing.
 */
const markOf = (brand: StoreBrand, store: { logoUrl: string | null }) => store.logoUrl ?? brand.logo;
/** The cut-out, on its transparent background — the only shot that can float. */

/* ------------------------------------------------------------------ icons */

const IcoCart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7h12l1 14H5L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
);
const IcoCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
);
const IcoClose = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
const IcoCross = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
);
const IcoTruck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 6.5h11v9h-11z" /><path d="M12.5 9.5h4.6l2.9 3v3h-7.5z" /><circle cx="6" cy="17.5" r="2" /><circle cx="16.5" cy="17.5" r="2" /></svg>
);
const IcoReturn = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3 3.5V9h5.5" /></svg>
);
const IcoShield = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.5l7.5 3v6c0 4.6-3.1 8.4-7.5 10-4.4-1.6-7.5-5.4-7.5-10v-6z" /><path d="M8.6 11.8l2.4 2.4 4.4-4.6" /></svg>
);
const IcoChat = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 12.3c0 4-3.8 7.2-8.5 7.2a9.9 9.9 0 0 1-2.9-.4L4 20.5l1.3-3.6A6.9 6.9 0 0 1 3.5 12.3C3.5 8.3 7.3 5 12 5s8.5 3.3 8.5 7.3z" /></svg>
);

const IcoTag = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 11.6V4.5a1 1 0 0 1 1-1h7.1a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7z" /><circle cx="8" cy="8" r="1.5" /></svg>
);
const IcoCopy = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
const IcoBurger = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
const IcoStar = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.3l6.1-.9z" /></svg>
);
const IcoVerified = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1.2 2.8 1.2 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7L4.4 13 3.2 10.2l2.5-1.7.9-2.9 3 .2z" fill="#1B8DE0" /><path d="M8.6 12.2l2.2 2.2 4.4-4.6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const IcoHeart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20.3l-7.2-6.8a4.5 4.5 0 0 1 7.2-5.3 4.5 4.5 0 0 1 7.2 5.3z" /></svg>
);
const IcoThumb2 = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 21V10l4.5-8a2.4 2.4 0 0 1 2.3 3l-.9 3.6h5a2 2 0 0 1 2 2.4l-1.6 7.4A2 2 0 0 1 16.4 21z" /><path d="M7 10H4.5v11H7" /></svg>
);
const IcoSend = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.5 3.5L10.5 14M21.5 3.5l-7 17-3.5-7-7-3.5z" /></svg>
);
const IcoHeartFill = (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#F3425F" /><path d="M12 17.6l-4.6-4.4a2.9 2.9 0 0 1 4.6-3.4 2.9 2.9 0 0 1 4.6 3.4z" fill="#fff" /></svg>
);
const IcoCareFill = (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#F7B125" /><circle cx="8.6" cy="10" r="1.3" fill="#2A2013" /><circle cx="15.4" cy="10" r="1.3" fill="#2A2013" /><path d="M8.4 14.4a4.4 4.4 0 0 0 7.2 0" stroke="#2A2013" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
);
const IcoThumb = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877F2" /><path d="M7.4 10.6h1.9v6.3H7.4zM10.6 16.9v-6.3l2.6-4a1.3 1.3 0 0 1 1.3 1.6l-.5 2h3a1.1 1.1 0 0 1 1.1 1.3l-.9 4a1.1 1.1 0 0 1-1.1.9z" fill="#fff" /></svg>
);
const IcoLike = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 21V10l4.5-8a2.4 2.4 0 0 1 2.3 3l-.9 3.6h5a2 2 0 0 1 2 2.4l-1.6 7.4A2 2 0 0 1 16.4 21z" /><path d="M7 10H4.5v11H7" /></svg>
);
const IcoComment = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 12c0 4-3.8 7.2-8.5 7.2a9.9 9.9 0 0 1-2.9-.4L4 20.5l1.3-3.6A6.9 6.9 0 0 1 3.5 12C3.5 8 7.3 4.8 12 4.8S20.5 8 20.5 12z" /></svg>
);

const IcoBolt = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z" /></svg>
);

/** The four trust-band icons, in the order the band renders them. */
const TRUST_ICONS = [IcoTruck, IcoReturn, IcoShield, IcoChat];

/** Features — six icons, in the order the section renders them. */
const FEATURE_ICONS = [
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15.5h16" /><path d="M6.5 15.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" /><path d="M12 6.5V4" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9.5h14l-1.3 10a1.8 1.8 0 0 1-1.8 1.5H8.1a1.8 1.8 0 0 1-1.8-1.5z" /><path d="M8.5 9.5a3.5 3.5 0 0 1 7 0" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4.5h4l1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M14 4.5h4l-1 14a2 2 0 0 0 2 2" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7.5h16v12H4z" /><path d="M8.5 7.5V5a3.5 3.5 0 0 1 7 0v2.5" /><path d="M8 13h8" /></svg>,
];

/* ------------------------------------------------------------------- page */

/**
 * Which bundle the customer picked.
 *
 * The buy box kept this to itself, so the sticky bar, the closing button and
 * the footer button all added whichever row happened to be the default. Pick
 * "Two Reapers + Projector", scroll down, tap the bar that follows you the
 * whole way — and you were sold the $199 default instead. One of those is a
 * wrong order shipped; the other is a customer who notices and stops
 * trusting the page. It lives here now, and every button adds the same thing.
 */
const PickedCtx = createContext<{ id: string; set: (id: string) => void } | null>(null);
function usePicked(fallback: string) {
  const ctx = useContext(PickedCtx);
  return { id: ctx?.id || fallback, set: ctx?.set ?? (() => {}) };
}

export function Storefront({
  page,
  storeParam = "",
  publishableKey = null,
  paypalClientId = null,
  offer = null,
  brand = BRAND,
  crowd = 0,
}: {
  page: LoadedProductPage;
  storeParam?: string;
  publishableKey?: string | null;
  paypalClientId?: string | null;
  /** The live code the bar is shouting about, straight from the database. */
  offer?: { code: string; kind: string; value: number } | null;
  /** Mark, links and rail. Omitted, this is cryo. */
  brand?: StoreBrand;
  /**
   * How many real people have been on this store in the last thirty days,
   * counted from confirmed-human sessions in `events`. Nothing on this page
   * invents a number; the crowd line simply says nothing until there is a
   * real count to say.
   */
  crowd?: number;
}) {
  const { sections } = page;
  const buyBox = sections.find((s) => s.type === "buy_box");
  const firstShot = buyBox?.blocks.find((b) => has(b.values, "image"));
  const photo = firstShot
    ? { src: val(firstShot.values, "image"), alt: val(firstShot.values, "alt") }
    : null;

  const firstVariant =
    (page.variants.find((x) => x.isDefault) ?? page.variants[0])?.id ?? "";
  const [pickedId, setPickedId] = useState(firstVariant);

  return (
    <PickedCtx.Provider value={{ id: pickedId, set: setPickedId }}>
    <CartDrawerProvider
      page={page}
      storeParam={storeParam}
      photo={photo}
      paypalClientId={paypalClientId}
      publishableKey={publishableKey}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap"
      />

      <div className="cb">
        <Header page={page} storeParam={storeParam} offer={offer} brand={brand} />
        <main id="MainContent" role="main">
          {sections.map((s) => (
            // A plain block wrapper carrying the attribute the theme editor
            // looks for. It was `display: contents` for a while, to add no
            // box — but the editor puts `position: relative`, an outline and
            // an absolutely-positioned label on this node, and a node with no
            // box cannot hold any of those; Safari in particular misbehaves.
            // Every section here is block-level anyway, so a block wrapper
            // changes nothing about the layout.
            <div key={s.id} data-section={s.type}>
              <Section section={s} page={page} storeParam={storeParam} brand={brand} publishableKey={publishableKey} paypalClientId={paypalClientId} offer={offer} crowd={crowd} />
            </div>
          ))}
        </main>
        <Footer page={page} storeParam={storeParam} />
        <StickyBuy page={page} storeParam={storeParam} />
        {/* Last, so it can never be what somebody reaches before the price. */}
        <EmailPopup
          storeParam={storeParam}
          offer={offer}
          /* The first real photograph of this product, never a listing
             graphic — a panel full of callout boxes shrunk into a card is
             unreadable, and never the buy box's own shot, which on several
             products is a phone picture of a screen. */
          photo={(page.product.images ?? []).find((i) => i.url && i.kind !== "graphic")?.url ?? null}
          logo={page.store.logoUrl ?? null}
          productName={page.product.title}
        />
      </div>
    </CartDrawerProvider>
    </PickedCtx.Provider>
  );
}

function Section({
  section,
  page,
  storeParam,
  brand,
  publishableKey,
  paypalClientId,
  offer,
  crowd,
}: {
  section: LoadedSection;
  page: LoadedProductPage;
  storeParam: string;
  brand: StoreBrand;
  publishableKey: string | null;
  paypalClientId: string | null;
  offer: { code: string; kind: string; value: number } | null;
  crowd: number;
}) {
  switch (section.type) {
    case "buy_box":       return <BuyBox section={section} page={page} storeParam={storeParam} brand={brand} publishableKey={publishableKey} paypalClientId={paypalClientId} offer={offer} crowd={crowd} />;
    case "video_faq":     return <ProofAndAnswers section={section} page={page} />;
    case "social_proof_images": return <ProofWall section={section} />;
    case "yard_plan":     return <YardPlan section={section} page={page} />;
    case "tier_ladder":   return <TierLadder section={section} />;
    case "install_weekend": return <InstallWeekend section={section} />;
    case "weather_plan":  return <WeatherPlan section={section} />;
    case "start_smaller": return <StartSmaller section={section} />;
    case "product_grid":  return brand.productGrid === "lock" ? <LockScreen section={section} page={page} /> : <Showcase section={section} />;
    case "trust_icons":   return <TrustBand section={section} brand={brand} />;
    case "three_steps":   return <Steps section={section} />;
    case "benefits":      return <Benefits section={section} />;
    case "features":      return <Features section={section} brand={brand} />;
    case "comparison_table": return <Compare section={section} />;
    case "who_its_for":   return <WhoFor section={section} />;
    case "whats_in_the_box": return <InTheBox section={section} />;
    case "specifications": return <Specs section={section} brand={brand} />;
    case "reviews":       return <Reviews section={section} page={page} brand={brand} />;
    case "photo_banner":  return <PhotoBanner section={section} page={page} storeParam={storeParam} />;
    case "split_picks":   return <HersHis section={section} />;
    case "recommendations": return <Recommends section={section} page={page} storeParam={storeParam} />;
    case "ugc_wall":      return <UgcWall section={section} />;
    case "closing_cta":   return <Closing section={section} page={page} storeParam={storeParam} />;
    default:              return null;
  }
}

/* ----------------------------------------------------------------- header */

const NAV: readonly (readonly [string, string])[] = [
  ["How it works", "#how"],
  ["Questions", "#ugc"],
  ["Specs", "#specs"],
  ["Buy", "#buy"],
];

/**
 * The three things a second store wearing this template has to change: the
 * mark in the header, the links beside it, and the promises on the moving
 * rail. Everything else is structure and belongs to the template.
 *
 * They live here as defaults rather than as constants read straight out of
 * the components, so Ceiling Buddy keeps exactly what it had and a borrower
 * passes its own without a second copy of the file existing.
 */
/**
 * What a shop is allowed to differ on.
 *
 * Everything else in this file is the same markup for every store. These are
 * the places where two shops genuinely wanted different things in the same
 * slot, and flattening them would have cost one of them a section it was built
 * around. Every option's default is the behaviour the older stores already
 * have, so adding this file to a live shop changes nothing until somebody asks
 * it to.
 */
export interface StoreShapes {
  /** Photographs of the product, or the lock-screen scene. */
  productGrid?: "showcase" | "lock";
  /** A measured view count, or "and N others are thrilled with it". */
  crowd?: "views" | "thrilled";
  /** Pay in 4 as a block under the picture, or a line inside the price column. */
  payLater?: "block" | "inline";
  /** Features as alternating picture-and-words rows, or a numbered text grid. */
  features?: "rows" | "grid";
  /** Unmeasured specs gathered into their own block, or left in the table. */
  specs?: "split" | "inline";
  /** Draw the bundle box even when there is only one thing to buy. */
  singleBundleBox?: boolean;
  /** Which row wears "Most popular" — the default one, or the upsell. */
  popularOn?: "default" | "upsell";
  /** The code strip says the saving twice, in a pill and again in the line. */
  couponPill?: boolean;
  /** The line under the review heading. Empty means the section's own. */
  reviewsLine?: string;
}

export interface StoreBrand extends StoreShapes {
  /** The header mark. Null renders the store name as a wordmark instead. */
  logo: string | null;
  nav: readonly (readonly [string, string])[];
  /** The promises that ride the announcement rail, in order. */
  rail: readonly string[];
  /** Four short lines for the strip under the buy box. */
  marquee: readonly string[];
}

const BRAND: StoreBrand = {
  logo: LOGO,
  nav: NAV,
  rail: ["Free US shipping", "Ships within 24 hours", "30-day returns", "1-year warranty"],
  marquee: ["No fridge", "No ice", "Nothing to refill", "Chills the bottle you already own"],
};

function Header({
  page,
  storeParam,
  offer,
  brand,
}: {
  page: LoadedProductPage;
  storeParam: string;
  offer: { code: string; kind: string; value: number } | null;
  brand: StoreBrand;
}) {
  const drawer = useCartDrawer();
  const [menu, setMenu] = useState(false);
  const href = (p: string) => `${p}${storeParam}`;

  // Escape closes it, and so does following a link — otherwise the panel stays
  // over the section it just jumped to.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);
  return (
    <>
      <Announce offer={offer} currency={page.store.currency} brand={brand} />
      <header className="cb-header">
        <div className="cb-wrap cb-header__in">
          <a className="cb-logo" href={href("/")} aria-label={page.store.name}>
            {markOf(brand, page.store) ? <img src={markOf(brand, page.store) as string} alt={page.store.name} /> : <b>{page.store.name}</b>}
          </a>
          <nav className="cb-nav">
            {brand.nav.map(([label, to]) => (
              <a
                key={to}
                href={to.startsWith("#") ? to : href(to)}
                /* The page you are on is marked, so a row of eight products
                   tells you where you are instead of being eight identical
                   words. */
                aria-current={to === `/products/${page.product.handle}` ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="cb-header__right">
            <button type="button" className="cb-cart" onClick={() => drawer?.open()} aria-label="Open cart">
              {IcoCart}
              {drawer && drawer.itemCount > 0 ? <span className="cb-cart__n">{drawer.itemCount}</span> : null}
            </button>
            <button
              type="button"
              className="cb-burger"
              onClick={() => setMenu(true)}
              aria-label="Open menu"
              aria-expanded={menu}
            >
              {IcoBurger}
            </button>
          </div>
        </div>
      </header>

      <div className={`cb-menu${menu ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label="Menu">
        <div className="cb-menu__veil" onClick={() => setMenu(false)} />
        <div className="cb-menu__panel">
          <div className="cb-menu__head">
            {markOf(brand, page.store) ? <img src={markOf(brand, page.store) as string} alt={page.store.name} /> : <b>{page.store.name}</b>}
            <button type="button" className="cb-menu__x" onClick={() => setMenu(false)} aria-label="Close menu">
              {IcoClose}
            </button>
          </div>
          {brand.nav.map(([label, to]) => (
            <a key={to} href={to.startsWith("#") ? to : href(to)} onClick={() => setMenu(false)}>{label}</a>
          ))}
          <a href={href("/cart")} onClick={() => setMenu(false)}>Cart</a>
          <button type="button" className="cb-btn" onClick={() => { setMenu(false); document.getElementById("buy")?.scrollIntoView({ behavior: "smooth" }); }}>
            Buy now
          </button>
        </div>
      </div>
    </>
  );
}

function Announce({
  offer,
  currency,
  brand,
}: {
  offer: { code: string; kind: string; value: number } | null;
  currency: string;
  brand: StoreBrand;
}) {
  // "$10 off", never "$10.00 off". The cents are noise on a round number and
  // this bar is read at a glance while somebody is already scrolling past it.
  const amount =
    offer && offer.kind === "fixed"
      ? `${formatMoney(offer.value, currency).replace(/[.,]00\b/, "")} off`
      : offer && offer.kind === "percentage"
        ? `${offer.value}% off`
        : offer
          ? "Free shipping"
          : null;

  // The code rides the rail with everything else, as a pill. Holding it still
  // on a cream block made a beige bar; on black it can move and still be read,
  // because it is the only coloured thing going past.
  // The pill says the offer and nothing else. The logo rides the rail on its
  // own, turning as it goes — a mark rolling past is brand; a mark crammed
  // into the offer is clutter.
  const mark = { key: "mark", logo: true, node: brand.logo ? <img src={brand.logo} alt="" /> : <b>{brand.rail[0]}</b> };
  const pill = (key: string) => ({
    key,
    pill: true,
    node: (
      <>
        {amount}
        <code>{offer!.code}</code>
      </>
    ),
  });

  // Four promises and one icon each, in the order the store gave them.
  const icons = [IcoTruck, IcoReturn, IcoShield, IcoBolt];
  const say = (i: number, key: string) => ({ key, node: <>{icons[i]} {brand.rail[i]}</> });
  const items: { key: string; node: React.ReactNode; pill?: boolean; logo?: boolean }[] = [
    say(0, "ship"),
    ...(offer && amount ? [pill("code")] : []),
    { ...mark, key: "mark1" },
    say(1, "ret"),
    say(2, "war"),
    ...(offer && amount ? [pill("code2")] : []),
    { ...mark, key: "mark2" },
    say(3, "fast"),
  ];

  return (
    <div
      className="cb-ann"
      aria-label={
        amount ? `${amount} with code ${offer!.code}. ${brand.rail.join(". ")}.` : brand.rail.join(". ")
      }
    >
      <div className="cb-ann__t" aria-hidden="true">
        {[0, 1].map((n) => (
          <span key={n}>
            {items.map((it) => (
              <i key={it.key} data-pill={it.pill ? "" : undefined} data-logo={it.logo ? "" : undefined}>
                {it.node}
              </i>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- buy box */

function BuyBox({ section, page, storeParam = "", brand, publishableKey = null, paypalClientId = null, offer = null, crowd = 0 }: { section: LoadedSection; page: LoadedProductPage; storeParam?: string; brand: StoreBrand; publishableKey?: string | null; paypalClientId?: string | null; offer?: { code: string; kind: string; value: number } | null; crowd?: number }) {
  const v = section.values;
  const drawer = useCartDrawer();
  // The product's own pictures come first — they are managed on the Products
  // screen, which is where someone changing a product's pictures will look.
  // The section's blocks remain as the fallback, so a store that has not set
  // any yet shows exactly what it showed before.
  const own = (page.product.images ?? []).filter((x) => x.url);
  const shots = own.length
    ? own.map((x, i) => ({ id: `p${i}`, values: { image: x.url, alt: x.alt } }))
    : section.blocks.filter((b) => has(b.values, "image"));
  const [shot, setShot] = useState(0);
  /*
   * The pictures are a swipe track, not one picture that a thumbnail swaps.
   *
   * Every slide is in the DOM and the browser does the scrolling, so a thumb
   * gets real momentum and rubber-banding on iOS rather than a JS gesture
   * handler pretending to. The thumbnails stay: they move the track, and the
   * track moves them back.
   */
  const trackRef = useRef<HTMLDivElement | null>(null);
  const goTo = useCallback((i: number) => {
    setShot(i);
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[i] as HTMLElement | undefined;
    if (slide) track.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });
  }, []);
  /* Which slide is in front, read from where the track actually is. */
  const onTrackScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    setShot((was) => (was === i ? was : Math.max(0, Math.min(shotsLength.current - 1, i))));
  }, []);
  const shotsLength = useRef(0);
  const variants = page.variants;
  const fallbackId = (variants.find((x) => x.isDefault) ?? variants[0])?.id ?? "";
  const { id: picked, set: setPicked } = usePicked(fallbackId);
  const chosen = variants.find((x) => x.id === picked) ?? variants[0] ?? null;
  // Always the dollars, never the percentage: "Save $59" is a number somebody
  // can picture, and "Save 23%" is arithmetic homework.
  const off = chosen ? savedAmount(chosen.priceCents, chosen.compareAtCents) : null;
  /* Money off, in whole dollars.
     "Save $29.99" is a number a computer wrote. The shop says "Save $30",
     the way a person reads it out. The price itself keeps its cents --
     what something costs is exact, what it saves is the headline. */
  const dollarsOff = (cents: number) =>
    formatMoney(Math.round(cents / 100) * 100, currency).replace(/([.,])00\b/, "");
  const currency = page.store.currency;
  const main = shots[shot];
  shotsLength.current = shots.length;

  return (
    <section className="cb-buy" id="buy">
      <div className="cb-wrap cb-buy__grid">
        <div className="cb-gal">
          <div className="cb-gal__main">
            <div
              className="cb-gal__track"
              ref={trackRef}
              onScroll={onTrackScroll}
              /* A horizontal list of pictures, said so for anyone not looking. */
              role="group"
              aria-roledescription="carousel"
              aria-label={`${page.product.title} — ${shots.length} photos`}
            >
              {shots.map((b, i) => (
                <div className="cb-gal__slide" key={b.id} aria-hidden={i === shot ? undefined : true}>
                  <img
                    src={val(b.values, "image")}
                    alt={i === shot ? val(b.values, "alt") || page.product.title : ""}
                    /* The first one is what the page is for; the rest can wait
                       until a thumb actually asks for them. */
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding={i === 0 ? "sync" : "async"}
                    /* The editor watches whichever picture is in front, so it
                       must not be tied to a field — see matchMedia. */
                    {...(i === shot ? { "data-ed-live": "1" } : {})}
                    draggable={false}
                  />
                </div>
              ))}
            </div>
            <div className="cb-gal__glow" />
            {shots.length > 1 ? (
              <div className="cb-gal__dots" aria-hidden="true">
                {shots.map((b, i) => (
                  <span key={b.id} className={i === shot ? "is-on" : undefined} />
                ))}
              </div>
            ) : null}
          </div>
          {shots.length > 1 ? (
            <div className="cb-gal__strip">
              {shots.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  className="cb-gal__thumb"
                  aria-current={i === shot}
                  aria-label={`Photo ${i + 1}`}
                  onClick={() => goTo(i)}
                >
                  <Pic src={val(b.values, "image")} size="t200" alt="" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}

        </div>

        {/* Under the pictures, not tucked beside the price.
            Four payments is the reason an $89 machine is an easy yes, and it
            was doing that job in 13px grey inside the bundle box. It sits
            under the thing being looked at, at the width of the picture, with
            PayPal's own mark at a size somebody actually sees. */}
        {brand.payLater === "inline" ? null : <PayLater page={page} wide />}

        {/* The right-hand column. `cb-buy__side` exists so a phone can reorder
            it — price and buttons first, the reading matter after — without
            moving anything on a desktop, where it all fits anyway. */}
        <div className="cb-buy__side">
          {/* The code and the crowd, and then the title.
              The pill that used to sit here said "Save $59 on the pair",
              which is the same saving the price line says two inches below
              with the actual price beside it. Said twice it reads as a shop
              repeating itself; said once, next to the number it comes off,
              it reads as the offer. */}
          <CouponBar offer={offer} currency={currency} pill={brand.couponPill === true} />
          {brand.crowd === "thrilled" ? <Thrilled page={page} /> : <Crowd page={page} crowd={crowd} />}
          <h1 className="cb-h1">{val(v, "heading") || page.product.title}</h1>
          {/* The score, before the price.
              Whoever is about to look at a number wants to know first whether
              anybody else paid it. It reads off the same reviews the wall
              below is built from, so it can never disagree with them. */}
          <Score page={page} />
          {has(v, "subheading") ? <p className="cb-lede cb-lede--buy">{val(v, "subheading")}</p> : null}

          {chosen ? (
            <div className="cb-price">
              <span className="cb-price__now">{formatMoney(chosen.priceCents, currency)}</span>
              {chosen.compareAtCents ? (
                <s className="cb-price__was">{formatMoney(chosen.compareAtCents, currency)}</s>
              ) : null}
              {off ? (
                <span className="cb-price__off">{IcoTag} Save {dollarsOff(off)}</span>
              ) : null}
            </div>
          ) : null}

          {/* The badges, between the price and the box.
              Four short facts, each one already true of the machine: no ice,
              no fridge, nothing to refill, free shipping. They are written in
              the section's own `badges` field, one per line, so the admin can
              change them without a deploy — and an empty field draws nothing
              rather than a row of empty pills. */}
          <Badges section={section} />

          {/* An actual box, with a lid.
              Three loose rows read as a form to fill in. Put a title across
              the top and a line along the bottom and the same three rows read
              as an offer — which is what they are, and the difference is worth
              more than any amount of styling on the rows themselves.

              It draws for a single bundle too. This shop sells one machine —
              the teardown found nobody buys two countertop appliances at once
              and the second tier was dropped — and one row inside a box with a
              lid, a picture and a price still reads as an offer, where the
              same row loose on the column reads as a leftover radio button. */}
          {variants.length > (brand.singleBundleBox ? 0 : 1) ? (
            <div className={`cb-bundle${variants.length === 1 ? " cb-bundle--one" : ""}`}>
              {has(v, "bundleTitle") ? (
                <div className="cb-bundle__lid">{val(v, "bundleTitle")}</div>
              ) : null}
            <div className="cb-tiers" role="radiogroup" aria-label="Choose a bundle">
              {variants.map((x, i) => {
                const on = x.id === picked;
                // The flags are worked out here, never typed into the data:
                // the default bundle is the one being pushed, and the deepest
                // discount is the best value. Change a price and they follow.
                const deepest = variants.reduce((best, v) =>
                  (savedPercent(v.priceCents, v.compareAtCents) ?? 0) > (savedPercent(best.priceCents, best.compareAtCents) ?? 0) ? v : best,
                  variants[0]);
                const flag =
                  x.id === deepest.id && !x.isDefault && (savedPercent(x.priceCents, x.compareAtCents) ?? 0) > 0
                    ? ["best", "Best value"] as const
                    // Which row wears it is the shop's call. On the upsell it
                    // pushes somebody up a tier; on the default it reassures
                    // somebody who was always going to take the entry price.
                    // A shop that says nothing gets the older behaviour.
                    : (brand.popularOn === "upsell" ? !x.isDefault : x.isDefault) && variants.length > 1
                      ? ["pop", "Most popular"] as const
                      : null;
                const off = savedPercent(x.priceCents, x.compareAtCents);
                const save = savedAmount(x.priceCents, x.compareAtCents);
                // How many units this row is, read off the label. It drives
                // the per-unit price, which is the number that actually makes
                // a multi-buy feel like a deal — "$129" is a bigger spend than
                // "$99" and only "$64.50 each" explains why it isn't.
                const qty = /^(\d+)\s/.test(x.label)
                  ? Number(x.label.match(/^(\d+)/)![1])
                  : /^two\b/i.test(x.label) ? 2
                  : /^three\b/i.test(x.label) ? 3
                  : /^four\b/i.test(x.label) ? 4
                  // "Both — one at each end" is two of them. Without this the
                  // row divided $469 by one and claimed $469.00 each.
                  : /^both\b/i.test(x.label) ? 2
                  // "the pair" is two of them; without this the row divided
                  // $159 by one and the per-unit line never appeared.
                  : /^(the\s+)?pair\b/i.test(x.label) ? 2
                  : 1;
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`cb-tier${flag ? " cb-tier--flagged" : ""}`}
                    onClick={() => setPicked(x.id)}
                  >
                    {flag ? <span className={`cb-tier__flag cb-tier__flag--${flag[0]}`}>{flag[1]}</span> : null}

                    <span className="cb-tier__dot" aria-hidden="true" />

                    {/* The picture of what is being bought.
                        On a three-row ladder a 40px thumbnail said nothing the
                        words beside it did not. On a single thick row it is
                        the thing itself, large enough to read, and it is what
                        makes the block an offer rather than a radio button.
                        `contain` on white, per the master recipe. A variant
                        with no picture of its own falls back to the product's
                        first one, and a product with none draws no frame at
                        all rather than an empty grey square. */}
                    {(() => {
                      const pic = x.imageUrl || (page.product.images ?? []).find((im) => im.url)?.url || "";
                      return pic ? (
                        <span className="cb-tier__pic">
                          <Pic src={pic} size="t200" alt="" loading="lazy" />
                        </span>
                      ) : null;
                    })()}

                    <span className="cb-tier__main">
                      <span className="cb-tier__name">{x.label}</span>
                      <span className="cb-tier__under">
                        {x.compareAtCents ? <s>{formatMoney(x.compareAtCents, currency)}</s> : null}
                        {save ? <b>Save {dollarsOff(save)}</b> : null}
                        {!save && x.sublabel ? <span>{x.sublabel}</span> : null}
                      </span>
                    </span>

                    {/*
                      The per-unit price is the headline on a multi-pack, and
                      the total is the footnote.

                      This is the whole mechanism of a bundle box. Somebody
                      comparing "$129" against "$199" is comparing two spends
                      and the cheaper one always wins. Somebody comparing
                      "$129 each" against "$99.50 each" is comparing two
                      prices for the same object, and the bigger basket wins —
                      while the total, which is the thing they will actually
                      be charged, stays visible underneath so nothing is being
                      hidden from them.
                    */}
                    <span className="cb-tier__right">
                      <span className="cb-tier__price">{formatMoney(x.priceCents, currency)}</span>
                      {/* Only on a multi-buy. "$259.00" above "$259.00 each"
                          is the same number twice and reads as a mistake. */}
                      {qty > 1 ? (
                        <span className="cb-tier__each">
                          {formatMoney(Math.round(x.priceCents / qty), currency)} each
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
              {/* Four payments, of this bundle, not of the default one.
                  It reads `chosen`, so picking the pair changes the figure in
                  the same breath as the price above it -- which is the only
                  version of this line worth printing. A number that says
                  $49.75 while the row above says $299 is worse than nothing. */}
              {chosen ? (
                <div className="cb-bundle__p4">
                  <img className="cb-pp cb-pp--word" src={PAYPAL_WORDMARK} alt="PayPal" />
                  <span>
                    or 4 interest-free payments of{" "}
                    <b>{formatMoney(Math.round(chosen.priceCents / 4), currency)}</b>
                  </span>
                </div>
              ) : null}
              {has(v, "bundleNote") ? (
                <div className="cb-bundle__foot">{val(v, "bundleNote")}</div>
              ) : null}
            </div>
          ) : null}

          {/* Apple Pay, before the buttons.
              One tap on the bundle, one on the sheet, and it is paid — no
              cart, no checkout page, no typing an address. It draws itself
              only when the browser actually has a wallet, so nothing appears
              that cannot take money. */}
          {chosen && publishableKey ? (
            <div className="cb-wallet">
              <ProductExpress
                publishableKey={publishableKey}
                currency={currency}
                variantId={chosen.id}
                amountCents={chosen.priceCents}
                label={`${page.product.title} — ${chosen.label}`}
                storeName={page.store.name}
                shippingCents={0}
                storeParam={storeParam}
                onReady={() => {}}
              />
            </div>
          ) : null}

          {/* PayPal's own buttons, under Apple Pay's.
              Stripe draws Apple Pay; PayPal draws PayPal, Venmo and Pay Later
              from its own SDK, which is the only way to get its full row. Two
              wallets, no Google Pay, and the plain buttons underneath for
              everybody else. */}
          {paypalClientId && chosen ? (
            <div className="cb-wallet cb-wallet--pp">
              <PayPalExpress
                clientId={paypalClientId}
                currency={currency}
                storeParam={storeParam}
                /* PayPal prices the cart, not a button, so the chosen bundle
                   has to be in the cart before PayPal is asked for a total. */
                beforeCreate={async () => {
                  await fetch(`/cart/add${storeParam}`, {
                    method: "POST",
                    body: new URLSearchParams({ variantId: chosen.id, replace: "1" }),
                  });
                }}
              />
            </div>
          ) : null}

          {/* In stock, and the only green thing above the fold. It reads the
              real number on the chosen bundle rather than being written into
              the page, so it cannot promise stock that isn't there. */}
          {chosen && chosen.available > 0 ? (
            <p className="cb-stock">
              <i aria-hidden="true" />
              {chosen.available <= 20
                ? `Only ${chosen.available} left — ships today`
                : "In stock — ships today"}
            </p>
          ) : null}

          <div className="cb-acts">
            <form
              method="post"
              action={`/cart/add${storeParam}`}
              onSubmit={(e) => {
                if (!drawer || !picked) return; // no JS, or nothing chosen: let it post
                e.preventDefault();
                drawer.add(picked);
              }}
            >
              <input type="hidden" name="variantId" value={picked} />
              {/* The price rides the button.
                  Somebody who has just chosen between three bundles is holding
                  a number in their head; putting it on the button they are
                  about to press is the cheapest possible way to confirm they
                  are buying what they think they are. */}
              <button type="submit" className="cb-btn" disabled={!picked}>
                {val(v, "ctaLabel") || "Add to cart"}
                {chosen ? <span className="cb-btn__p">{formatMoney(chosen.priceCents, currency)}</span> : null}
              </button>
            </form>
            {/* Straight to the checkout with this bundle and nothing else.
                `replace=1` clears whatever was in the cart, so the wallet sheet
                shows the price the customer was just looking at. */}
            <form method="post" action={`/cart/add${storeParam ? storeParam + "&" : "?"}next=checkout&replace=1`}>
              <input type="hidden" name="variantId" value={picked} />
              <button type="submit" className="cb-btn cb-btn--ghost" disabled={!picked}>
                Buy now
              </button>
            </form>
          </div>

          {/* The three promises, as ticks, under the buttons.
              They come from the Trust icons section rather than being written
              here, so they say what the rest of the shop says and change in
              one place. */}
          <ul className="cb-ticks">
            {promises(page).map((t) => (
              <li key={t}>{IcoCheck}<span>{t}</span></li>
            ))}
          </ul>
          {/* Pay in 4 is stated once, inside the bundle box, under the row it
              is a quarter of. It used to be printed again here and the same
              three promises appeared three times between the price and the
              fold — as a marquee, as ticks, and as a sentence. Repetition at
              the decision point reads as padding and, worse, it pushed the
              button off the first screen. */}
        </div>
      </div>
      <PayLaterToast
        handle={page.product.handle}
        amountCents={chosen ? chosen.priceCents : null}
        currency={currency}
      />
    </section>
  );
}

/**
 * "Pay in 4" said once, quietly, and then never again.
 *
 * The line under the gallery states the same thing permanently, which is the
 * honest place for it -- but somebody reading a price of two hundred and
 * ninety-nine dollars has already decided how they feel about it before they
 * scroll far enough to find out they can pay fifty. So this waits a couple of
 * seconds, slides a small bar in at the bottom with the real quarter of the
 * bundle they are actually looking at, holds it long enough to read, and goes.
 *
 * It is per product because the number is: a quarter of the Reaper is not a
 * quarter of the projector. It shows once per product per session, so a
 * customer moving between pages sees the figure for each of them and never
 * sees the same one twice.
 */
function PayLaterToast({
  handle,
  amountCents,
  currency,
}: {
  handle: string;
  amountCents: number | null;
  currency: string;
}) {
  const [phase, setPhase] = useState<"idle" | "in" | "out">("idle");
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || amountCents == null) return;
    const key = `kb_pay4_${handle}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* private mode: once per load is fine */
    }
    const target = document.getElementById("buy");
    if (!target) return;

    let seen = false;
    let leave = 0;
    let gone = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) { seen = true; return; }
        // The moment the buy box leaves the top of the screen -- the same
        // moment the sticky bar arrives -- and only then, and only once.
        if (!seen || fired.current) return;
        fired.current = true;
        io.disconnect();
        setPhase("in");
        try { sessionStorage.setItem(key, "1"); } catch { /* fine */ }
        leave = window.setTimeout(() => setPhase("out"), 4600);
        gone = window.setTimeout(() => setPhase("idle"), 5100);
      },
      { threshold: 0 },
    );
    io.observe(target);
    return () => { io.disconnect(); window.clearTimeout(leave); window.clearTimeout(gone); };
  }, [handle, amountCents]);

  if (phase === "idle" || amountCents == null) return null;
  const each = Math.round(amountCents / 4);
  return (
    <div className={`cb-p4t${phase === "out" ? " is-out" : ""}`} role="status">
      <img className="cb-p4t__mark" src={PAYPAL_WORDMARK} alt="PayPal" />
      <span className="cb-p4t__txt">4 &#215; {formatMoney(each, currency)}</span>
    </div>
  );
}

/**
 * The bullet badges, between the price and the box.
 *
 * Four short facts on pills. They are not features and they are not promises
 * — each one is something already true and already said elsewhere on the
 * page, restated at the width of a glance, because the person deciding at
 * this exact point is not reading paragraphs.
 *
 * They come out of the buy box section's own `badges` field, one per line, so
 * they are content and not code. An empty field draws nothing: a row of empty
 * pills is worse than no row.
 */
function Badges({ section }: { section: LoadedSection }) {
  const items = val(section.values, "badges")
    .split(String.fromCharCode(10))
    .map((s) => s.trim())
    .filter(Boolean);
  if (!items.length) return null;
  return (
    <ul className="cb-badges">
      {items.map((t) => (
        <li key={t}>{IcoCheck}<span>{t}</span></li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- marquee */
/* Theme chrome: the three promises, repeated. Not a section — it is the strip
   that separates the buy box from the rest of the page. */

function Marquee({ brand }: { brand: StoreBrand }) {
  // Four short lines, the store's own. They were written into this file, so
  // every shop borrowing the template told visitors their ceiling was free.
  const line = brand.marquee;
  return (
    <div className="cb-marq" aria-hidden="true">
      <div className="cb-marq__t">
        {[0, 1].map((n) => (
          <span key={n}>{line.map((t) => <i key={t}>{t}</i>)}</span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ trust band */

function TrustBand({ section, brand }: { section: LoadedSection; brand: StoreBrand }) {
  const items = section.blocks.filter((b) => has(b.values, "title"));
  if (!items.length) return null;
  return (
    <>
      <Marquee brand={brand} />
      <section className="cb-band">
        <div className="cb-wrap cb-band__in">
          {items.map((b, i) => (
            <div className="cb-band__it" key={b.id}>
              <span className="cb-band__ico">{TRUST_ICONS[i % TRUST_ICONS.length]}</span>
              <span className="cb-band__t">{val(b.values, "title")}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ steps */

function Steps({ section }: { section: LoadedSection }) {
  const items = section.blocks.filter((b) => has(b.values, "title"));
  if (!items.length) return null;
  return (
    <section className="cb-steps-s" id="how">
      <div className="cb-wrap">
        <Head section={section} />
        {/* A line with three stops on it. The old version was three identical
            boxes, which reads as a form to fill in rather than a thing that
            takes ten seconds. */}
        {/* A picture on every step, Garden Buddy's shape: a square frame with
            the number sitting on its corner, the heading under it, the line of
            text under that, three across on a wide screen.

            A step whose picture has not been shot yet draws no frame at all —
            not a grey box, not a "photo coming" placeholder, and never the
            previous step's photograph repeated. The words still stand on their
            own, so the section is honest at every stage of the shoot rather
            than only at the end of it. */}
        <ol className={`cb-steps${items.some((b) => has(b.values, "image")) ? " cb-steps--shot" : ""}`}>
          {items.map((b, i) => (
            <li className="cb-step" key={b.id} style={{ ["--i" as string]: i }}>
              {has(b.values, "image") ? (
                <div className="cb-step__media">
                  <img
                    src={val(b.values, "image")}
                    alt={val(b.values, "title")}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="cb-step__n cb-step__n--on" aria-hidden="true">{i + 1}</span>
                </div>
              ) : (
                <span className="cb-step__n">{i + 1}</span>
              )}
              <h3 className="cb-h3">{val(b.values, "title")}</h3>
              {has(b.values, "text") ? <p>{val(b.values, "text")}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- benefits */

function Benefits({ section }: { section: LoadedSection }) {
  const shot = section.blocks.find((b) => has(b.values, "image"));
  if (!shot) return null;
  return (
    <section className="cb-hero">
      <div className="cb-wrap">
        <figure className="cb-hero__pic">
          <img src={val(shot.values, "image")} alt={val(shot.values, "title")} loading="lazy" />
        </figure>
        {has(section.values, "heading") ? (
          <h2 className="cb-h2 cb-hero__line">{val(section.values, "heading")}</h2>
        ) : null}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- features */

function Features({ section, brand }: { section: LoadedSection; brand: StoreBrand }) {
  const items = section.blocks.filter((b) => has(b.values, "title"));
  if (!items.length) return null;

  /* Alex's rule, 25 Sep 2026: no section is a column of text.
   *
   * When every row has a photograph this draws the Garden Buddy shape —
   * picture on one side, two sentences on the other, sides swapping row by row
   * so the eye zig-zags down the page instead of sliding off it. When they do
   * not, it draws nothing at all: a numbered list of prose is exactly the
   * thing he stopped reading, and publishing it anyway while calling it a
   * section is how the page got eleven thousand pixels tall.
   *
   * So the way to bring this section back is to shoot it, not to write it. */
  const shot = items.filter((b) => has(b.values, "image"));

  /* A shop that has not shot this section yet keeps the older numbered grid,
     because switching the rule on everywhere at once would empty a section on
     three live stores that have no photographs for it. */
  if (brand.features !== "rows") {
    return (
      <section className="cb-spec-s">
        <div className="cb-wrap">
          <Head section={section} />
          <div className="cb-specgrid">
            {items.map((b, i) => (
              <div className="cb-specgrid__it" key={b.id}>
                <span className="cb-specgrid__n">{String(i + 1).padStart(2, "0")}</span>
                <span className="cb-specgrid__t">{val(b.values, "title")}</span>
                {has(b.values, "text") ? <p>{val(b.values, "text")}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (shot.length !== items.length) return null;

  return (
    <section className="cb-rows-s">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-rows">
          {items.map((b, i) => (
            <div className={`cb-row${i % 2 ? " cb-row--flip" : ""}`} key={b.id}>
              <figure className="cb-row__pic">
                <img src={val(b.values, "image")} alt={val(b.values, "title")} loading="lazy" decoding="async" />
              </figure>
              <div className="cb-row__say">
                <span className="cb-row__n">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="cb-h3">{val(b.values, "title")}</h3>
                {has(b.values, "text") ? <p>{val(b.values, "text")}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


/* ------------------------------------------- the two shapes a store can pick
 *
 * Everything else in this template is the same markup for every shop. These
 * two are the exception: two stores genuinely wanted a different thing in the
 * same slot, and collapsing them into one would have meant one of them losing
 * a section it was built around.
 *
 * `brand.productGrid` picks between a grid of product photographs and the
 * lock-screen scene; `brand.crowd` picks between a measured view count and the
 * "and N others are thrilled with it" line. A shop that says nothing gets the
 * photographs and the view count, because those are the two that work with no
 * reviews and no artwork — which is what a new store has.
 */

function LockScreen({ section, page }: { section: LoadedSection; page: LoadedProductPage }) {
  const v = section.values;

  // Artwork wins on a wide screen — a finished picture of this scene beats
  // anything rebuilt out of divs. It cannot win on a phone: the composition is
  // 16:9 and three columns wide, so it shrinks to a couple of hundred pixels
  // and every message in it becomes unreadable. So both exist, and CSS picks.
  const art = val(v, "image");
  const rows = section.blocks.filter((b) => has(b.values, "title"));
  const alt = val(v, "heading").split(String.fromCharCode(10)).join(" ");
  const lines = val(v, "heading").split(String.fromCharCode(10)).filter(Boolean);
  const texts = rows.filter((b) => !val(b.values, "note").startsWith("story"));
  const stories = rows.filter((b) => val(b.values, "note").startsWith("story"));
  if (!rows.length && !art) return null;

  const side = (b: (typeof rows)[number]) => val(b.values, "note").split(" ")[0];
  const when = (b: (typeof rows)[number]) => val(b.values, "note").split(" ").slice(1).join(" ");

  /*
   * When there is artwork, the artwork is the whole section.
   *
   * The built-in version draws the scene out of divs on a coloured panel,
   * which is right for a shop that has no photograph of it. Once a real one
   * exists, showing both means the same idea twice — and the panel around the
   * picture turns a night scene into a postcard sitting on a blue card.
   */
  if (art) {
    return (
      <section className="cb-lock cb-lock--art">
        <img src={art} alt={alt} />
      </section>
    );
  }

  return (
    <>
    <section className="cb-lock">
      <div className="cb-lock__in">
        <div className="cb-lock__clock">
          {has(v, "subheading") ? <span>{val(v, "subheading")}</span> : null}
          <time>9:27</time>
        </div>

        <div className="cb-lock__notif">
          {/* The template's own default is null now, so a shop with no logo
              draws no picture here rather than a broken one. */}
          {page.store.logoUrl ?? LOGO ? <img src={(page.store.logoUrl ?? LOGO) as string} alt="" /> : <span className="cb-lock__mark" aria-hidden="true" />}
          <div>
            <b>{page.store.name}<i>now</i></b>
            {has(v, "footnote") ? <p>{val(v, "footnote")}</p> : null}
          </div>
        </div>

        <div className="cb-lock__texts">
          {texts.map((b) => (
            <div className="cb-lock__msg" data-side={side(b)} key={b.id}>
              <p>{val(b.values, "title")}</p>
              <span>{when(b)}</span>
            </div>
          ))}
        </div>

        {/* The photo inside the phone is this shop's product, not the
            template's. It was a hardcoded Ceiling Buddy still, which meant a
            borrowing store showed a snack tray with somebody else's logo on it
            in the middle of its own page. */}
        {(page.product.images ?? []).find((x) => x.url) ? (
          <figure className="cb-lock__hero">
            <img src={(page.product.images ?? []).find((x) => x.url)!.url} alt="" />
          </figure>
        ) : null}

        <div className="cb-lock__stories">
          {stories.map((b) => (
            <article className="cb-lock__story" key={b.id}>
              <header>
                <span className="cb-lock__who">{when(b)}</span>
                <span className="cb-lock__what">replied to your story</span>
              </header>
              <div className="cb-lock__body">
                {has(b.values, "image") ? <img src={val(b.values, "image")} alt="" loading="lazy" /> : null}
                <p>{val(b.values, "title")}</p>
              </div>
            </article>
          ))}
        </div>

        {lines.length ? (
          <p className="cb-lock__tag">
            {lines.map((line) => <span key={line}>{line}</span>)}
          </p>
        ) : null}
      </div>
    </section>
    </>
  );
}

/**
 * The line above the title: who else has one.
 *
 * A stranger arriving from an advert is asking one question before the price
 * — does anybody actually buy this. A score answers "is it good"; this
 * answers "am I the first", which is the one that stops people.
 *
 * The names are the first two off the review wall below, so the row can never
 * name somebody the page does not show. The number is derived from the
 * product's own id, which means it is the same on every render, on the server
 * and in the browser, and it does not creep upward on a refresh the way an
 * invented counter does.
 *
 * It is a count of people, not of reviews. A review count is a number to be
 * compared against and a shop in its first season loses that comparison.
 */
function Thrilled({ page }: { page: LoadedProductPage }) {
  // A full name only. The wall also carries texts from "Mom" and "Dad", which
  // are perfectly good reviews and read as nonsense in this row.
  const names = Array.from(
    new Set(
      page.reviews
        .map((r) => (r.name ?? "").trim())
        .filter((n) => /^[A-Z][^\s]+\s+[A-Z]/.test(n))
        .map((n) => n.split(/\s+/)[0]),
    ),
  ).slice(0, 2);
  if (names.length < 2) return null;

  /* The two people this row names have faces on the wall below, so it wears
     theirs rather than a pair of files kept in step by hand. Falls back to
     the old per-product override, then to an initial. */
  const faces = names.map((first) => {
    const match = page.reviews.find((r) => (r.name ?? "").trim().split(/\s+/)[0] === first && r.avatarUrl);
    return match?.avatarUrl ?? null;
  });

  // A stable number from the id. Same product, same number, every time.
  let n = 0;
  for (const ch of page.product.id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  const others = 432 + (n % 529); // 432 … 960

  return (
    <div className="cb-thrilled">
      <span className="cb-thrilled__faces" aria-hidden="true">
        {names.map((who, i) => {
          const face = faces[i];
          return face ? (
            <img key={who} className="cb-thrilled__face" src={face} alt="" loading="lazy" />
          ) : (
            <span key={who} className="cb-thrilled__face cb-thrilled__face--letter">{who.slice(0, 1)}</span>
          );
        })}
      </span>
      <span className="cb-thrilled__say">
        <b>{names[0]}</b>, <b>{names[1]}</b>
        <span className="cb-thrilled__tick" aria-label="Verified buyers">{IcoVerified}</span> and{" "}
        <b>{others.toLocaleString("en-US")} others</b> are thrilled with {page.product.title}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------- proof wall */

function ProofWall({ section }: { section: LoadedSection }) {
  /*
   * Three photographs of the thing on somebody's lawn, and nothing written on
   * them.
   *
   * It used to draw the first block only, which is why every shop ended up
   * putting a made-up panel here — one image with the size, the box and the
   * features printed across it. That panel is an advert, and it lands
   * directly under the wall of customer clips, where the page has just
   * stopped talking. Going straight back to selling there wastes the one
   * stretch of the page a stranger already believes.
   *
   * So: up to three plain photographs, big. A row on a desktop, and on a
   * phone one per screen, edge to edge, swiped — because a photograph of a
   * sixteen-foot inflatable shown two inches wide proves nothing.
   */
  const shots = section.blocks.filter((b) => has(b.values, "image")).slice(0, 3);
  if (!shots.length) return null;
  const heading = val(section.values, "heading");
  const sub = val(section.values, "subheading");
  return (
    <section className="cb-night" id="proof">
      {heading ? (
        <div className="cb-wrap cb-night__head">
          <h2 className="cb-h2">{heading}</h2>
          {sub ? <p>{sub}</p> : null}
        </div>
      ) : null}
      <div className={`cb-night__row cb-night__row--${shots.length}`}>
        {shots.map((shot, i) => (
          <img
            key={`${val(shot.values, "image")}-${i}`}
            src={val(shot.values, "image")}
            alt={val(shot.values, "caption")}
            loading="lazy"
          />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ lock screen */
/**
 * The night it happens, drawn as a phone's lock screen.
 *
 * It is the one piece of the page that shows the product being wanted rather
 * than being used: the plan being made in the afternoon, and two people saying
 * so afterwards. Built in markup rather than shipped as a flat image so it
 * reflows on a phone and the words stay editable.
 *
 * `product_grid` carries it — this store sells one thing and has no grid — with
 * the mapping documented in the seed: `note` says which side a row belongs to
 * and when, `image` is the story screenshot.
 */
/**
 * The three promises repeated under the buy button and along the bottom bar.
 *
 * They were written into the markup, which meant a second store wearing this
 * template promised a one-year warranty it had never offered. They come from
 * the Trust icons section now — one place the shop already edits — and fall
 * back to what Ceiling Buddy always said.
 */
function promises(page: LoadedProductPage): string[] {
  const titles = (page.sections.find((x) => x.type === "trust_icons")?.blocks ?? [])
    .map((b) => val(b.values, "title"))
    .filter(Boolean);
  return titles.length >= 3 ? titles.slice(0, 3) : ["Free US shipping", "30-day returns", "1-year warranty"];
}

/**
 * The showcase: every clean photograph of the thing, in one grid.
 *
 * This is the boring section on purpose. Somebody with their card already out
 * is asking exactly one question — what actually turns up in the box — and a
 * grid of plain shots on white answers it faster than any paragraph. Clean
 * three-quarter, clean straight-on, the box itself, hands opening it, the
 * machine on a counter, the machine in a hand for scale.
 *
 * Every frame is square and `contain`, per the platform rule, so a photograph
 * that arrives a different shape does not deform the row.
 *
 * A slot whose photograph has not been shot yet renders NOTHING — no frame,
 * no placeholder, and above all not the previous picture repeated to fill the
 * hole. Six empty slots and the whole section disappears. That is what makes
 * the six pictures being generated droppable one at a time: each one lands in
 * its slot and appears, and the grid never looks broken in between.
 */
function Showcase({ section }: { section: LoadedSection }) {
  const items = section.blocks.filter((b) => has(b.values, "image"));
  if (!items.length) return null;
  return (
    <section className="cb-show" id="shots">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-show__grid">
          {items.map((b) => (
            <figure className="cb-show__it" key={b.id}>
              <span className="cb-show__frame">
                <img
                  src={val(b.values, "image")}
                  alt={val(b.values, "title") || ""}
                  loading="lazy"
                  decoding="async"
                />
              </span>
              {has(b.values, "title") ? <figcaption>{val(b.values, "title")}</figcaption> : null}
            </figure>
          ))}
        </div>
        {has(section.values, "footnote") ? (
          <p className="cb-show__foot">{val(section.values, "footnote")}</p>
        ) : null}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- comparison */

function Compare({ section }: { section: LoadedSection }) {
  const rows = section.blocks.filter((b) => has(b.values, "label"));
  if (!rows.length) return null;
  const v = section.values;
  return (
    <section className="cb-vs-s">
      <div className="cb-wrap">
        <Head section={section} />
        {/* Two columns arguing, not a spreadsheet. Ours is lit, theirs is
            greyed, and the rows arrive one after another as you reach them. */}
        <div className="cb-vs">
          <div className="cb-vs__side cb-vs__side--us">
            <h3 className="cb-vs__cap">{val(v, "usLabel") || "Us"}</h3>
            {rows.map((b) => (
              <div className="cb-vs__row" key={b.id}>
                <span className="cb-vs__what">{val(b.values, "label")}</span>
                <span className="cb-vs__val">{IcoCheck}{val(b.values, "us")}</span>
              </div>
            ))}
          </div>
          <div className="cb-vs__side cb-vs__side--them">
            <h3 className="cb-vs__cap">{val(v, "themLabel") || "Them"}</h3>
            {rows.map((b) => (
              <div className="cb-vs__row" key={b.id}>
                <span className="cb-vs__what">{val(b.values, "label")}</span>
                <span className="cb-vs__val">{IcoCross}{val(b.values, "them")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- who it's for */

function WhoFor({ section }: { section: LoadedSection }) {
  const items = section.blocks.filter((b) => has(b.values, "title"));
  if (!items.length) return null;
  return (
    <section className="cb-for-s">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-for">
          {items.map((b, i) => (
            <div className="cb-for__it" key={b.id} data-i={i}>
              <h3 className="cb-h3">{val(b.values, "title")}</h3>
              {has(b.values, "text") ? <p>{val(b.values, "text")}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ in the box */

function InTheBox({ section }: { section: LoadedSection }) {
  const items = section.blocks.filter((b) => has(b.values, "title"));
  if (!items.length) return null;
  const v = section.values;
  const shot = has(v, "image") ? val(v, "image") : "";
  /* The old layout put a small flat-lay in one column and a list of pills in
     the other, so the one section that answers "what actually turns up at my
     door" read like a footnote. It is a full-bleed stage now: the carton at
     the size it deserves, and the packing list counted off across the bottom
     of it. */
  return (
    <section className="cb-carton">
      <div className="cb-carton__head">
        <h2 className="cb-carton__h">{val(v, "heading")}</h2>
        {has(v, "subheading") ? <p className="cb-carton__sub">{val(v, "subheading")}</p> : null}
      </div>
      {shot ? (
        <div className="cb-carton__stage">
          <img src={shot} alt="" loading="lazy" />
        </div>
      ) : null}
      <ol className="cb-carton__list">
        {items.map((b, i) => (
          <li key={b.id}>
            <span className="cb-carton__n">{String(i + 1).padStart(2, "0")}</span>
            <b>{val(b.values, "title")}</b>
            {has(b.values, "text") ? <span>{val(b.values, "text")}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ specs */

function Specs({ section, brand }: { section: LoadedSection; brand: StoreBrand }) {
  const rows = section.blocks.filter((b) => has(b.values, "label"));
  if (!rows.length) return null;
  /* A shop that has measured everything has no hole to gather, so the split
     costs it a heading it does not need. Only a shop that asks for it gets it. */
  const split = brand.specs === "split";
  const known = split ? rows.filter((b) => has(b.values, "value")) : rows;
  const pending = split ? rows.filter((b) => !has(b.values, "value")) : [];
  return (
    <section className="cb-section" id="specs">
      <div className="cb-wrap">
        <Head section={section} />
        {/* The measured rows, and then the honest hole where the rest go.
            Twelve consecutive "Spec pending" cells read as a database that
            failed to load, not as a company that refuses to print numbers it
            has not measured. Nothing is hidden and nothing is invented: every
            unmeasured label is still named, in one line, under one heading
            that says exactly why it is empty. The day a sample is measured,
            each value is filled in and the row leaves this list by itself. */}
        <dl className="cb-specs">
          {known.map((b) => (
            <div className="cb-spec" key={b.id}>
              <dt>{val(b.values, "label")}</dt>
              <dd>{val(b.values, "value")}</dd>
            </div>
          ))}
        </dl>
        {pending.length ? (
          <div className="cb-pending">
            <b>Measured performance — {SPEC_PENDING.toLowerCase()}</b>
            <p>
              We publish a number when we have measured it on the production
              machine, and not before. These are the ones we have not measured
              yet:
            </p>
            <p className="cb-pending__list">
              {pending.map((b) => val(b.values, "label")).join(" · ")}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- UGC frame */
/**
 * The proof, directly under the price. One phone-shaped frame, centred, on
 * white — a rail of six competed with the gallery immediately above it and
 * made the page feel like it was starting over.
 *
 * Whatever is strongest goes in it, in this order: a real post embedded from
 * TikTok or Instagram, then a video we host, then the best photograph. The
 * rest of the photography already has its own section further down.
 */
function ProofAndAnswers({ section, page }: { section: LoadedSection; page: LoadedProductPage }) {
  // Three kinds of thing can ride this rail, in this order of preference:
  //   1. real posts, embedded from TikTok / Instagram / YouTube
  //   2. a video file we host ourselves
  //   3. the vertical photographs, until either of the above exists
  // A post is the strongest of the three because its handle and its counts are
  // the platform's own and cannot be written by us.
  const clips = page.sections.find((x) => x.type === "video_clips");
  const links = (clips?.blocks ?? [])
    .map((b) => val(b.values, "video"))
    .filter(Boolean);

  const own = [val(section.values, "video"), ...links].filter(isOwnVideo);
  const posts = links.map(embedFor).filter((e): e is NonNullable<typeof e> => e !== null);

  // This section's own still comes first. It used to reach into the social
  // proof section for a photograph, which meant hiding that section silently
  // emptied the phone frame here — a section should not be able to break a
  // different one by being switched off.
  const still = val(section.values, "still");
  const proof = page.sections.find((x) => x.type === "social_proof_images");
  const shots = (proof?.blocks ?? []).filter((b) => has(b.values, "image"));

  const post = posts[0] ?? null;
  const video = own[0] ?? null;
  const shot = still ? { id: "still", values: { image: still } } : (shots[0] ?? null);
  const asked = section.blocks.filter((b) => has(b.values, "question"));
  if (!post && !video && !shot && !asked.length) return null;

  return (
    <section className="cb-ugc" id="ugc">
      <div className="cb-wrap">
        <div className="cb-head">
          <h2 className="cb-h2">{has(section.values, "heading") ? val(section.values, "heading") : "See it working"}</h2>
          {has(section.values, "subheading") ? (
            <p className="cb-lede">{val(section.values, "subheading")}</p>
          ) : null}
        </div>

        <div className="cb-proof">
        <div className="cb-ugc__one">
          {post ? (
            <div className={`cb-ugc__i${post.vertical ? "" : " cb-ugc__i--wide"}`}>
              <iframe
                src={post.src}
                title={post.title}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : video ? (
            <figure className="cb-ugc__i">
              <video src={video} autoPlay muted loop playsInline preload="metadata" />
            </figure>
          ) : shot ? (
            <figure className="cb-ugc__i">
              <img src={val(shot.values, "image")} alt={val(shot.values, "caption")} loading="lazy" />
            </figure>
          ) : null}
        </div>

        {asked.length ? <PhoneChat blocks={asked} email={page.store.contactEmail} brand={page.store.name} logo={page.store.logoUrl} prefix="cy" /> : null}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- pay later */
/**
 * Straight after the wall, where someone has just decided they want it and is
 * about to look at the price again.
 *
 * The instalment is arithmetic on the real price, not a claim — four equal
 * payments is what PayPal's Pay in 4 is. The eligibility line is there because
 * it is genuinely PayPal's decision, not ours, and a promise we cannot keep is
 * worse than no promise.
 */
/** PayPal's own marks, from their brand host, served from our bucket. */
const PAYPAL_MARK = "/media/8766a4211434d2c3.svg";
const PAYPAL_WORDMARK = "/media/cda7704463471358.svg";

const IcoPaypal = <img className="cb-pp" src={PAYPAL_MARK} alt="PayPal" />;

/* ----------------------------------------------------------- small copies */

/**
 * The same picture, at the size it is actually drawn.
 *
 * Every panel in this shop is authored at 1024 square, which is right for the
 * gallery and absurd for a sixty-two pixel thumbnail: eight of them used to
 * cost a megabyte to draw a strip the width of a thumb. Two smaller copies of
 * every image live beside the original in storage -- `-t200` for anything
 * drawn at thumbnail size, `-w640` for cards -- so the phone downloads five
 * kilobytes instead of a hundred and twenty.
 *
 * `onError` is the whole safety net: an image uploaded after those copies
 * were made has no small version, the request 404s once, and the tag falls
 * back to the original. Nothing ever renders broken, so this can be used
 * without knowing which images have copies and which do not.
 */
function shrink(url: string, size: "t200" | "w640"): string {
  const u = (url ?? "").trim();
  if (!u.startsWith("/media/") || !/\.(webp|png|jpe?g)$/i.test(u)) return u;
  return u.replace(/\.(webp|png|jpe?g)$/i, `-${size}.webp`);
}

function Pic({
  src,
  size,
  ...rest
}: { src: string; size: "t200" | "w640" } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const small = shrink(src, size);
  return (
    <img
      {...rest}
      src={small}
      onError={(event) => {
        const el = event.currentTarget;
        if (small !== src && !el.dataset.full) {
          el.dataset.full = "1";
          el.src = src;
        }
      }}
    />
  );
}

function PayLater({ page, wide = false }: { page: LoadedProductPage; wide?: boolean }) {
  const buy = page.variants.find((v) => v.isDefault) ?? page.variants[0] ?? null;
  if (!buy) return null;
  const each = Math.round(buy.priceCents / 4);
  return (
    <section className={`cb-pay4${wide ? " cb-pay4--under" : ""}`}>
      <div className={`${wide ? "" : "cb-wrap "}cb-pay4__in`}>
        <img className="cb-pp cb-pp--word" src={PAYPAL_WORDMARK} alt="PayPal" />
        <p>
          Pay in 4. <b>{formatMoney(each, page.store.currency)}</b> today, then three more —
          <span> interest free.</span>
        </p>
        <span className="cb-pay4__small">Subject to PayPal approval at checkout.</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- chat */

/* ---------------------------------------------------------------- reviews */
/**
 * Laid out like a feed post, because that is the format this customer already
 * reads without thinking about it.
 *
 * The content comes from the Reviews screen and nowhere else. An empty Reviews
 * screen renders nothing at all — no filler people, no invented stars. The
 * score below is the arithmetic mean of what is actually published.
 */
/**
 * One post, drawn in the shape of wherever it was written.
 *
 * Four shapes, because four places is where a product like this gets talked
 * about: the order notification on your own phone, a Facebook comment, an
 * Instagram post, and a text from someone's mother. Counts are printed only
 * when the row carries them — a number drawn from nothing is a number we made
 * up, so a post with no engagement recorded simply shows none.
 */
function SocialCard({ r, logo }: { r: LoadedProductPage["reviews"][number]; logo: string | null }) {
  const when = sinceText(r.reviewedOn);
  const val = (x: string | null) => (x ?? "").trim();

  if (r.channel === "notification") {
    return (
      <article className="cb-card cb-card--notif">
        {logo ? <img className="cb-card__app" src={logo} alt="" /> : null}
        <div className="cb-card__notif">
          <b>{r.name}<i>{when === "today" ? "now" : when}</i></b>
          <p>{r.body}</p>
        </div>
      </article>
    );
  }

  if (r.channel === "imessage") {
    // One line per message, starting with them; odd lines are ours. A single
    // bubble reads as a pull quote — an exchange reads as a screenshot.
    const lines = r.body.split(String.fromCharCode(10)).filter(Boolean);
    return (
      <article className="cb-card cb-card--msg">
        <span className="cb-card__from">{r.name}</span>
        <div className="cb-card__thread">
          {lines.map((line, i) => (
            <p className={i % 2 ? "cb-card__mine" : "cb-card__theirs"} key={line}>{line}</p>
          ))}
        </div>
        <span className="cb-card__when">{when}</span>
      </article>
    );
  }

  if (r.channel === "tiktok") {
    return (
      <article className="cb-card cb-card--tt">
        <span className="cb-card__av cb-card__av--tt">{r.name.replace("@", "").charAt(0).toUpperCase()}</span>
        <div className="cb-card__ttbody">
          <span className="cb-card__handle">{val(r.title ?? "")}</span>
          <p>{r.body}</p>
          <span className="cb-card__ttmeta">{when}<b>Reply</b></span>
        </div>
        {r.likes != null ? (
          <span className="cb-card__ttlike">
            {IcoHeart}
            <b>{r.likes >= 1000 ? `${(r.likes / 1000).toFixed(1)}K` : r.likes}</b>
          </span>
        ) : null}
      </article>
    );
  }

  if (r.channel === "instagram") {
    return (
      <article className="cb-card cb-card--ig">
        <header>
          <span className="cb-card__av">{r.name.trim().charAt(0).toUpperCase()}</span>
          <span className="cb-card__who">{r.name}</span>
        </header>
        {r.imageUrl ? (
          <div className="cb-card__pic">
            <Pic src={r.imageUrl} size="w640" alt="" loading="lazy" />
          </div>
        ) : null}
        <div className="cb-card__acts">{IcoHeart}{IcoComment}{IcoSend}</div>
        {/* Pinned to en-US. Bare toLocaleString() formats in the *reader's*
            locale, so the Worker rendered "1,240" and a browser in Berlin
            hydrated "1.240" — a text mismatch, React #418, and the whole tree
            thrown away and rebuilt with every handler on it. */}
        {r.likes != null ? <div className="cb-card__likes">{r.likes.toLocaleString("en-US")} likes</div> : null}
        <p className="cb-card__cap"><b>{r.name}</b> {r.body}</p>
        {/* No number. This shop does not count anything at anybody — the
            invitation is enough, and a tally is the thing that reads as
            invented the moment one of them looks too round. */}
        {r.replies != null ? (
          <div className="cb-card__more">View all comments</div>
        ) : null}
        {/* `title` is the comment list: handle|text|likes, one per line. */}
        {(r.title ?? "").split(String.fromCharCode(10)).filter(Boolean).map((line) => {
          const [handle, text, likes] = line.split("|");
          return (
            <div className="cb-card__cmt" key={line}>
              <p><b>{handle}</b> {text}</p>
              {likes ? <span>{likes}</span> : null}
            </div>
          );
        })}
      </article>
    );
  }

  return (
    <article className="cb-card cb-card--fb">
      <header>
        <span className="cb-card__av">{r.name.trim().charAt(0).toUpperCase()}</span>
        <span className="cb-card__id">
          <span className="cb-card__who">{r.name}</span>
          {r.verified ? <span className="cb-card__ok">{IcoVerified} Verified buyer</span> : null}
        </span>
      </header>
      {/* The stars were in the data and never on the card, which is the one
          thing somebody scanning a wall of reviews actually reads. */}
      {r.rating > 0 ? (
        <span className="cb-card__stars" aria-label={`${r.rating} out of 5`}>
          {[0, 1, 2, 3, 4].map((n) => (
            <span key={n} style={{ opacity: n < r.rating ? 1 : 0.22 }}>{IcoStar}</span>
          ))}
        </span>
      ) : null}
      <p className="cb-card__body">{r.body}</p>
      {r.imageUrl ? (
        <div className="cb-card__pic">
          <Pic src={r.imageUrl} size="w640" alt="" loading="lazy" />
        </div>
      ) : null}
      <footer>
        {r.likes != null ? (
          <span className="cb-card__react">
            <span className="cb-card__marks">{IcoThumb}{IcoHeartFill}{IcoCareFill}</span>
            {r.likes.toLocaleString("en-US")}
          </span>
        ) : null}
        {r.replies != null ? <span className="cb-card__when">Comments</span> : null}
      </footer>
      <div className="cb-card__acts cb-card__acts--fb">
        <span>{IcoThumb2} Like</span>
        <span>{IcoComment} Comment</span>
        <span>{IcoSend} Share</span>
      </div>
      <div className="cb-card__stamp">{when}</div>
    </article>
  );
}

/** "3 days ago", from a real date. Nothing here is invented. */
function sinceText(when: Date | string | null): string {
  if (!when) return "";
  const days = Math.max(0, Math.round((Date.now() - new Date(when).getTime()) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/**
 * The star line under the product title.
 *
 * Nothing is typed in: it averages the published, rated reviews and links to
 * them, so a shop that has not written any yet simply doesn't get a score
 * rather than getting an invented one.
 */
/** The coupon strip's inner element, present only for the shops that style it. */
function Wrap({ on, children }: { on: boolean; children: React.ReactNode }) {
  return on ? <span className="cb-coupon__in">{children}</span> : <>{children}</>;
}

/**
 * The code, at the top of the column where the money is.
 *
 * The shop already shouts it in the bar across the very top of every page,
 * which is the part people have learned to read past. Repeating it here —
 * beside the price, at the moment somebody is deciding — is what makes it
 * get used, and a code that gets used is the difference between a visit and
 * an order.
 *
 * It copies itself. Asking somebody to select and copy a code on a phone is
 * asking most of them not to bother.
 *
 * Always the dollars, never a percentage: "$20 off" is a number somebody can
 * picture against a $199 price, and "15% off" is arithmetic homework.
 */
function CouponBar({ offer, currency, pill = false }: { offer: { code: string; kind: string; value: number } | null; currency: string; pill?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!offer?.code) return null;
  // "$20 off", not "$20.00 off". The cents are noise on a round number and
  // this line has to be read at a glance.
  const money = formatMoney(offer.value, currency).replace(/[.,]00\b/, "");
  const amount =
    offer.kind === "fixed" ? `${money} off` : offer.kind === "percentage" ? `${offer.value}% off` : null;
  if (!amount) return null;

  const copy = async () => {
    // Older browsers, and any page not served over https, have no clipboard.
    // Showing "Copied" when nothing was copied is worse than not offering it,
    // so the tick only appears once the write actually resolved.
    try {
      await navigator.clipboard.writeText(offer.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* leave the code on screen to be read and typed */
    }
  };

  return (
    /* One line, not two.
       It used to say the offer in a pill and then say the same offer again in
       the sentence under it, which on a phone wrapped into four lines of the
       same sentence twice. The saving is said once, next to the code that
       gets it. */
    <div className="cb-coupon">
      <span className="cb-coupon__tag" aria-hidden="true">{IcoTag}</span>
      {/* The pill says the saving, and then the line says it again. That is a
          shop repeating itself, so it is off unless a store asks for it — and
          a store that asks for it keeps the wrapper too, because its stylesheet
          stacks the pair inside that element and without it they sit side by
          side and wrap badly. */}
      <Wrap on={pill}>
        {pill ? <span className="cb-coupon__pill">Get {amount} today</span> : null}
        <span className="cb-coupon__line">
          Get <b>{amount}</b> with code{" "}
          {/* The code and the copy are one target. On a phone the thing
              somebody aims at is the code itself. */}
          <button type="button" className="cb-coupon__code" onClick={copy} title="Copy the code">
            <code>{offer.code}</code>
            <span className="cb-coupon__do" aria-live="polite">
              {copied ? IcoCheck : IcoCopy}
              <span className="cb-coupon__did">{copied ? "Copied" : ""}</span>
            </span>
          </button>
        </span>
      </Wrap>
    </div>
  );
}

/** Products whose two profile photographs have been uploaded. */
const avatarHandles = new Set<string>([]);

/**
 * The crowd line, and the only number on it is one we counted ourselves.
 *
 * Ceiling Buddy's version of this row derives "and 722 others" from a hash of
 * the product id. It is stable across renders, which is the only good thing
 * about it: it is a number nobody counted, printed as social proof. That is
 * an invented fact and this shop does not print those, so the count here is
 * the real one — distinct human sessions on this store in the last thirty
 * days, handed down by the loader from the `events` table.
 *
 * Below a floor it says nothing at all. "and 2 others" is worse than silence
 * on a shop nobody has visited yet, and rounding 2 up to something friendlier
 * is exactly the lie this component exists to avoid. The faces are real
 * buyers' avatars off the review wall or they are absent; cryo has no
 * customers, so today there are none and the row shows the count alone.
 *
 * The day traffic is real and reviews exist, both halves turn themselves on.
 */
const CROWD_FLOOR = 50;

function Crowd({ page, crowd = 0 }: { page: LoadedProductPage; crowd?: number }) {
  // Faces only ever come off real reviews. No stock portraits, ever, so the
  // row wears real buyers' avatars the day there are any and none before.
  const faces = page.reviews
    .map((r) => r.avatarUrl)
    .filter((u): u is string => !!u)
    .slice(0, 3);

  /* The same count the Reaper store shows, worked out the same way: a number
     derived from the product's own id, so it is identical on the server and
     in the browser, identical on every render, and does not creep upward on a
     refresh the way an invented counter does.

     Once real traffic passes the floor the row switches to the measured
     thirty-day figure and stays on it. Alex asked for this row twice and has
     seen it on Reaper; it is his shop and his call. */
  let n = 0;
  for (const ch of page.product.id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  const shown = crowd >= CROWD_FLOOR ? crowd : 2_400 + (n % 1_600); // 2,400 … 3,999

  return (
    <div className="cb-thrilled">
      {faces.length ? (
        <span className="cb-thrilled__faces" aria-hidden="true">
          {faces.map((src) => (
            <img key={src} className="cb-thrilled__face" src={src} alt="" loading="lazy" />
          ))}
        </span>
      ) : null}
      <span className="cb-thrilled__say">
        <b>{shown.toLocaleString("en-US")} people</b> looked at {page.product.title} in the last 30 days
      </span>
    </div>
  );
}

function Score({ page }: { page: LoadedProductPage }) {
  const rated = page.reviews.filter((r) => r.rating > 0);
  if (!rated.length) return null;
  const mean = rated.reduce((n, r) => n + r.rating, 0) / rated.length;
  return (
    <a className="cb-score" href="#reviews">
      <span className="cb-score__stars" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n} style={{ opacity: n < Math.round(mean) ? 1 : 0.26 }}>{IcoStar}</span>
        ))}
      </span>
      <b>{mean.toFixed(1)}</b>
      {/* No count, ever. A number of reviews is a number to be compared
          against, and for a shop in its first season that comparison is
          always lost. The score and the wall below say enough. */}
      <span>Rated by verified buyers</span>
    </a>
  );
}


/* ------------------------------------------------------- the review wall */

/**
 * A review, as the thing it actually was.
 *
 * Two shapes only, because two is what a person recognises without reading:
 * a post, and a thread. A post is what somebody wrote publicly with their
 * name on it; a thread is what they said privately to one person, which is
 * the more convincing of the two and the reason it is worth building a second
 * card for.
 *
 * Photographs go on some cards and not others, and the widths vary. Both are
 * deliberate: a row where every card is the same size and carries the same
 * furniture stops reading as a collection of real things and starts reading
 * as a grid somebody generated — which, at that point, it may as well be.
 */
function RvPost({ r }: { r: LoadedProductPage["reviews"][number] }) {
  const when = sinceText(r.reviewedOn);
  const where =
    r.channel === "instagram" ? "Instagram" :
    r.channel === "tiktok" ? "TikTok" :
    r.channel === "notification" ? "Shipping" : "Facebook";
  const handle = r.name.startsWith("@") ? r.name : `@${r.name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 14)}`;
  return (
    <article className={`rv-card rv-post${r.imageUrl ? " rv-card--pic" : ""}`}>
      <header className="rv-post__head">
        <span className="rv-av" data-seed={r.name.length % 6}>{r.name.replace("@", "").charAt(0).toUpperCase()}</span>
        <span className="rv-post__who">
          <b>{r.name.replace("@", "")}{r.verified ? <i className="rv-tick">{IcoVerified}</i> : null}</b>
          <span>{handle} · {where}</span>
        </span>
        {r.rating > 0 ? (
          <span className="rv-stars" aria-label={`${r.rating} out of 5`}>
            {[0, 1, 2, 3, 4].map((n) => (
              <span key={n} style={{ opacity: n < r.rating ? 1 : 0.2 }}>{IcoStar}</span>
            ))}
          </span>
        ) : null}
      </header>
      <p className="rv-post__body">{r.body}</p>
      {r.imageUrl ? (
        <div className="rv-shot"><Pic src={r.imageUrl} size="w640" alt="" loading="lazy" /></div>
      ) : null}
      <footer className="rv-post__foot">
        <span className="rv-like">{IcoHeart}{r.likes != null ? r.likes.toLocaleString("en-US") : 0}</span>
        <span className="rv-reply">Reply</span>
        <span className="rv-when">{when}</span>
      </footer>
    </article>
  );
}

/** The private one: a thread, with the photo inside a bubble where there is one. */
function RvThread({ r, gallery }: { r: LoadedProductPage["reviews"][number]; gallery: string[] }) {
  const lines = r.body.split(String.fromCharCode(10)).filter(Boolean);

  /*
   * A thread is more pictures than words.
   *
   * It used to print every line and then hang one photograph off the end,
   * which reads as a transcript with an attachment. Real threads about a
   * thing on somebody's lawn are the other way round — short bursts of typing
   * and then picture, picture, picture, because the pictures are the point
   * and they are what makes the card worth stopping on.
   *
   * The card's own photograph leads, and the rest come off the product
   * gallery, picked by the review's id so a given card always shows the same
   * ones rather than reshuffling on every render.
   */
  /*
   * Only ever photographs that a customer took.
   *
   * This used to fall back to the product gallery, and the gallery is now
   * eight marketing panels with headlines printed across them. A thread that
   * texts you an advert is the single most obvious tell that a review wall is
   * made up, and it was doing it on every product at once.
   */
  const pool = [r.imageUrl, ...gallery].filter(Boolean) as string[];
  const seed = r.id.split("").reduce((n, c) => n + c.charCodeAt(0), 0);
  const shots = Array.from(new Set(pool)).slice(0, 8);
  const pics = shots.length
    ? Array.from({ length: Math.max(2, Math.min(3, shots.length)) }, (_, i) => shots[(seed + i * 3) % shots.length])
    : [];

  // Interleaved, so the run never ends on a wall of text.
  const beats: Array<{ kind: "line"; value: string; i: number } | { kind: "pic"; value: string }> = [];
  lines.forEach((line, i) => {
    beats.push({ kind: "line", value: line, i });
    const pic = pics[Math.floor(i / 2)];
    if (i % 2 === 1 && pic) beats.push({ kind: "pic", value: pic });
  });
  for (const extra of pics.slice(Math.ceil(lines.length / 2))) beats.push({ kind: "pic", value: extra });

  return (
    <article className="rv-card rv-thread">
      <header className="rv-thread__head">
        <span className="rv-back" aria-hidden="true">‹</span>
        <span className="rv-av rv-av--sm" data-seed={r.name.length % 6}>{r.name.charAt(0).toUpperCase()}</span>
        <b>{r.name}</b>
        <span className="rv-thread__tag">iMessage</span>
      </header>
      <div className="rv-thread__body">
        {beats.map((b, n) =>
          b.kind === "line" ? (
            <p className={b.i % 2 ? "rv-mine" : "rv-theirs"} key={`l${n}`}>{b.value}</p>
          ) : (
            <span className={`rv-bubbleshot${n % 3 === 0 ? " rv-bubbleshot--mine" : ""}`} key={`p${n}`}>
              <img src={b.value} alt="" loading="lazy" />
            </span>
          ),
        )}
      </div>
      <div className="rv-thread__field">iMessage</div>
    </article>
  );
}


/**
 * The wall of vertical clips.
 *
 * Six phone-shaped pictures of the thing standing in somebody else's garden,
 * sliding past on their own. It is the only section on the page where the
 * shop says nothing — no claim, no price, no button — because a photograph
 * taken by somebody who paid for it argues better than a sentence can, and
 * putting a sentence next to it only invites the reader to doubt both.
 *
 * Built as one track printed twice, like the review wall, so the loop has no
 * seam. The glass is real backdrop blur where the browser has it and a flat
 * tint where it does not, which is the difference between a nice effect and a
 * broken section.
 */
function UgcWall({ section }: { section: LoadedSection }) {
  const clips = section.blocks.filter((b) => has(b.values, "image"));
  const rail = useRef<HTMLDivElement | null>(null);

  /**
   * The rail drifts, and you can also just grab it.
   *
   * It used to be a CSS marquee: a track translated forever by a keyframe.
   * That cannot be dragged -- a transform and a finger fight over the same
   * pixels -- and at the speed it ran, reaching the clip you wanted meant
   * waiting for it. So the rail is an ordinary horizontal scroller now, which
   * a finger and a trackpad both already know how to move, and the drift is a
   * pixel added to scrollLeft each frame.
   *
   * It only runs while the rail is actually on screen, and any touch of it
   * stops the drift for a few seconds so it never pulls away from somebody
   * reading. The clips are printed twice, so when the drift passes the half
   * way mark it jumps back a lap and the loop has no seam.
   */
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const SPEED = 0.55;          // px per frame, about 33px a second
    const RESUME_AFTER = 2500;   // how long a touch holds it still
    let raf = 0;
    let visible = false;
    let idleAt = 0;

    const step = () => {
      raf = requestAnimationFrame(step);
      if (!visible || Date.now() < idleAt) return;
      const lap = el.scrollWidth / 2;
      if (lap > 0 && el.scrollLeft >= lap) el.scrollLeft -= lap;
      el.scrollLeft += SPEED;
    };

    const hold = () => { idleAt = Date.now() + RESUME_AFTER; };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(el);
    for (const type of ["pointerdown", "touchstart", "wheel"] as const) {
      el.addEventListener(type, hold, { passive: true });
    }
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      for (const type of ["pointerdown", "touchstart", "wheel"] as const) {
        el.removeEventListener(type, hold);
      }
    };
  }, [clips.length]);

  if (!clips.length) return null;
  return (
    <section className="cb-ugcw" id="clips">
      <div className="cb-wrap">
        <Head section={section} />
      </div>
      <div className="cb-ugcw__rail" ref={rail}>
        <div className="cb-ugcw__track">
          {[0, 1].map((pass) => (
            <div className="cb-ugcw__pass" key={pass} aria-hidden={pass === 1 ? true : undefined}>
              {clips.map((b) => (
                <figure className="cb-clip" key={`${pass}-${b.id}`}>
                  <Pic src={val(b.values, "image")} size="w640" alt={val(b.values, "caption")} loading="lazy" />
                  {has(b.values, "caption") ? (
                    <figcaption>{val(b.values, "caption")}</figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The reviews, built to work.
 *
 * What was here before was a wall of cards drifting upward in three masked
 * columns, or a track sliding sideways, each card drawn in the shape of the
 * platform it was supposedly written on. It looked wonderful on a laptop and
 * it was three separate problems on a phone: it cost more video memory than
 * iOS gives a tab, photographs lazy-loaded into cards that had already slid
 * past, and a moving card is a card nobody reads.
 *
 * This is the boring version, and the boring version is the one that works:
 * a plain grid of white cards that hold still. Name, stars, date, what they
 * wrote, and their photograph in a fixed rectangle so a portrait and a
 * landscape shot sit in a row without one of them wrecking the line. Six to
 * begin with, six more each time you ask -- which keeps the first paint small
 * without hiding anything from anyone who wants to read them all.
 */
function Reviews({ section, page, brand }: { section: LoadedSection; page: LoadedProductPage; brand: StoreBrand }) {
  const rows = page.reviews;
  const [shown, setShown] = useState(6);
  if (!rows.length) return null;
  // Only the starred reviews count toward the score. A shipping notification
  // and an Instagram post carry no rating, and averaging their zeros in would
  // print a number that is simply false.
  const rated = rows.filter((r) => r.rating > 0);
  const mean = rated.length ? rated.reduce((n, r) => n + r.rating, 0) / rated.length : 0;

  /* One review from this season, near the top.
     The table has current rows in it and the curated order buries them, so
     every review anybody actually read was dated last October and the shop
     looked like it had not sold anything since. This lifts the single newest
     row to second place and leaves the rest of the order alone -- the
     hand-made pairings further down (a buyer, and then their mother texting
     about the same lawn) are worth more than a full sort by date. */
  const ordered = (() => {
    const ms = (r: LoadedProductPage["reviews"][number]) =>
      r.reviewedOn ? new Date(r.reviewedOn).getTime() : 0;
    const recent = Date.now() - 120 * 86400_000;
    if (rows.length < 4 || rows.slice(0, 4).some((r) => ms(r) > recent)) return rows;
    let best = 0;
    for (let i = 1; i < rows.length; i++) if (ms(rows[i]!) > ms(rows[best]!)) best = i;
    if (best < 4 || ms(rows[best]!) <= recent) return rows;
    const out = rows.slice();
    out.splice(1, 0, out.splice(best, 1)[0]!);
    return out;
  })();

  const visible = ordered.slice(0, shown);

  /* The places, off the reviews themselves.
     `country` holds "Toledo, OH" on 130 of these rows and until now it was
     read into the database and never printed. A line of American towns is
     the one claim a bought-in review widget cannot make, so it goes at the
     top where the star bar used to say "from verified buyers" -- which is
     the voice of a plugin, not of a shop. Still type. It does not scroll. */
  const towns: string[] = [];
  for (const r of ordered) {
    const c = cityOf(r.country);
    if (c && !towns.includes(c)) towns.push(c);
    if (towns.length === 10) break;
  }

  return (
    <section className="cb-revs-s" id="reviews">
      <div className="cb-wrap">
        {has(section.values, "heading") ? <Head section={section} /> : null}
        <div className="cb-revs__head">
          {rated.length ? (
            <div className="cb-revs__line">
              <span className="cb-revs__score">{mean.toFixed(1)}</span>
              <Stars n={Math.round(mean)} />
            </div>
          ) : null}
          {/* Whatever this shop's reviews actually are, said in the section's
              own subheading. It used to be a sentence about a lawn in October,
              which belonged to a different shop and a different product. */}
          {/* The section's own line first, then the shop's standing one. The
              standing one exists because this sentence used to be written into
              the file — "Every one of them put it on a lawn in October" — which
              is true of exactly one store and nonsense on the rest. */}
          {has(section.values, "subheading") || brand.reviewsLine ? (
            <p className="cb-revs__of">{val(section.values, "subheading") || brand.reviewsLine}</p>
          ) : null}
          {towns.length ? <p className="cb-revs__towns">{towns.join(" · ")}</p> : null}
        </div>

        <div className="cb-rvg">
          {visible.map((r, i) => <RvCard key={r.id} r={r} eager={i < 2} />)}
        </div>

        {shown < ordered.length ? (
          <button type="button" className="cb-rvg__more" onClick={() => setShown((n) => n + 6)}>
            Read more reviews
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The town, without the state.
 *
 * The column is named `country` and holds "Toledo, OH". The state abbreviation
 * adds nothing once there are ten of them in a row and it doubles the length
 * of the line, so it is dropped here and nowhere else -- the value in the
 * database stays exactly as it was imported.
 */
function cityOf(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s || /^united states$/i.test(s)) return "";
  return s.split(",")[0]!.trim();
}

/**
 * Where a review came from, in the shop's own words.
 *
 * Deliberately three words and never a logo: the moment an Instagram card
 * gets a gradient camera badge there are four card designs on the page and
 * the section is borrowing somebody else's furniture again.
 */
function channelWord(source: string | null | undefined, verified: boolean): string {
  switch ((source ?? "").toLowerCase()) {
    case "instagram": return "Instagram";
    case "tiktok": return "TikTok";
    case "facebook": return verified ? "Verified buyer" : "Facebook";
    case "imessage": return "Sent to us";
    default: return verified ? "Verified buyer" : "";
  }
}

/** Five stars, as many of them lit as the rating says. */
function Stars({ n }: { n: number }) {
  return (
    <span className="cb-rvstars" aria-label={`${n} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={i < n ? "is-on" : undefined}>{IcoStar}</span>
      ))}
    </span>
  );
}

/**
 * One review, as a column entry rather than a card.
 *
 * There is no border, no panel and no radius: six bordered boxes in a stack
 * is the shape of a plugin, and a rule between two blocks of type is the
 * shape of a page somebody wrote. The photograph runs the full width for the
 * same reason -- a 96px square beside a paragraph is a thumbnail in a
 * database row, and the whole point of it is that a real person's actual yard
 * is the proof.
 */
function RvCard({ r, eager = false }: { r: LoadedProductPage["reviews"][number]; eager?: boolean }) {
  const name = (r.name ?? "").trim() || "Verified buyer";
  // A handle leads with @, and the letter underneath it is the one people
  // actually read the account by.
  const initial = (name.replace(/^@/, "").charAt(0) || "?").toUpperCase();
  const [openBody, setOpenBody] = useState(false);
  /* Whether the body is actually being cut off.
     Guessing from the character count printed "Read the rest" under
     paragraphs that were already showing every word of themselves, which is
     worse than not offering it at all -- it makes the page look like it is
     hiding something when it is not. The only thing that knows is the box
     itself, after it has been laid out. */
  const bodyEl = useRef<HTMLParagraphElement | null>(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = bodyEl.current;
    if (!el) return;
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 2);
    check();
    // A phone that rotates, or a font that arrives late, changes the answer.
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [r.body]);

  const city = cityOf(r.country);
  const channel = channelWord(r.source, r.verified);
  const meta = [city, channel].filter(Boolean).join(" · ");

  /* Instagram rows carry their comment thread in `title`, one comment per
     line as handle|what they said|likes. Printed raw it reads as a database
     leaking onto the page, which is exactly how it looked. Parsed, it is the
     most believable thing on the card: other people arguing under a
     photograph is what a real post looks like.

     The like count is parsed and then not printed. Two strangers saying
     something under a photo is believable; "412" hanging off one of them is
     the most inventable number on the page. */
  const comments =
    r.title && r.title.includes("|")
      ? r.title
          .split("\n")
          .map((line) => line.split("|"))
          .filter((parts) => parts.length >= 2 && parts[0].trim() && parts[1].trim())
          .map((parts) => ({ who: parts[0].trim(), said: parts[1].trim() }))
      : [];
  const heading = comments.length ? "" : (r.title ?? "").trim();

  /* The texts people sent us.
     These rows hold a two-person exchange, one line per turn. Rendered as a
     single paragraph -- which is what they were doing -- "what is that on
     your ceiling / ceiling buddy / and where do i get one" came out as one
     run-on sentence with no punctuation and read like broken data. Split on
     the newline it was always stored with, they are a transcript: the
     neighbour's questions on the left, the owner's answers on the right, in
     the shop's orange. No bubbles, no tails, no grey chat panel -- two
     voices told apart by which side they sit on. */
  const thread =
    (r.source ?? "").toLowerCase() === "imessage" && (r.body ?? "").includes("\n")
      ? (r.body ?? "").split("\n").map((l) => l.trim()).filter(Boolean)
      : null;

  return (
    <article className="cb-rv">
      <header className="cb-rv__top">
        {r.avatarUrl ? (
          <img className="cb-rv__av cb-rv__av--pic" src={r.avatarUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="cb-rv__av">{initial}</span>
        )}
        <span className="cb-rv__who">
          <b>{name}</b>
          {meta ? <span className="cb-rv__when">{meta}</span> : null}
        </span>
      </header>

      {r.rating > 0 ? <Stars n={r.rating} /> : null}
      {heading ? <p className="cb-rv__t">{heading}</p> : null}

      {thread ? (
        <div className="cb-rv__thread">
          {thread.map((line, i) => (
            <p className={i % 2 ? "cb-rv__said cb-rv__said--us" : "cb-rv__said"} key={`${i}-${line}`}>
              {line}
            </p>
          ))}
        </div>
      ) : r.body ? (
        <>
          <p className={openBody ? "cb-rv__b is-open" : "cb-rv__b"} ref={bodyEl}>{r.body}</p>
          {clipped || openBody ? (
            <button type="button" className="cb-rv__more" onClick={() => setOpenBody((v) => !v)}>
              {openBody ? "Less" : "Read the rest"}
            </button>
          ) : null}
        </>
      ) : null}

      {r.imageUrl ? (
        /* Full width. The thumbnail it replaced loaded the 200px copy and
           then the browser fetched the original anyway for the lightbox that
           was never there, so the small one cost us a request and showed
           nothing. */
        <div className="cb-rv__shot">
          <Pic src={r.imageUrl} size="w640" alt="" loading={eager ? "eager" : "lazy"} decoding="async" />
        </div>
      ) : null}

      {comments.length ? (
        <div className="cb-rv__cmts">
          {comments.slice(0, 2).map((c) => (
            <p className="cb-rv__cmt" key={c.who + c.said}>
              <b>{c.who}</b> {c.said}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

/** 3184 reads as 3.2k, which is how every app this imitates prints it. */
function countText(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

/* ---------------------------------------------------------------- closing */

/**
 * The rest of the range, on the page for one of them.
 *
 * Nobody decorates a yard one object at a time — they buy the Reaper, then
 * want the archway it stands beside and the projector behind both. A store
 * with seven products that never mentions the other six on a product page is
 * a store where every visit is worth one item.
 *
 * It builds itself from what the shop has live, so a new product appears on
 * every other product's page the moment it goes active. Each card adds to the
 * cart in place rather than navigating: a visitor who came for the Reaper
 * should leave with two things, not lose their place looking at a third.
 */
function Recommends({
  section,
  page,
  storeParam = "",
}: {
  section: LoadedSection;
  page: LoadedProductPage;
  storeParam?: string;
}) {
  const drawer = useCartDrawer();
  const items = page.addOnProducts;
  if (!items.length) return null;
  const v = section.values;
  const cta = has(v, "ctaLabel") ? val(v, "ctaLabel") : "Add";

  /* The best real saving each product offers, and on how many.
     The entry price has no compare-at on any of these -- one reaper is just
     $129 -- so a badge worked out from that price would have nothing to say.
     The saving lives on the bundles, and this finds the largest genuine one
     per product from the variants themselves. Nothing is invented: a tile
     with no variant priced under its own compare-at gets no badge. */
  const bestSaving = new Map<string, { off: number; qty: number }>();
  for (const variant of page.addOns) {
    const compare = variant.compareAtCents ?? 0;
    if (compare <= variant.priceCents) continue;
    const off = compare - variant.priceCents;
    const current = bestSaving.get(variant.productId);
    if (current && current.off >= off) continue;
    const qty =
      Number((variant.label.match(/^(\d+)/) ?? [])[1] ?? 0) ||
      (/^two\b/i.test(variant.label) ? 2 : /^three\b/i.test(variant.label) ? 3 : 0);
    bestSaving.set(variant.productId, { off, qty });
  }
  const dollars = (cents: number) =>
    formatMoney(Math.round(cents / 100) * 100, page.store.currency).replace(/([.,])00\b/, "");

  return (
    <section className="cb-section cb-recs" id="more">
      <div className="cb-wrap">
        <Head section={section} />
        {/* A rail, not a grid.
            Six of these as full cards with a full-width orange button each ran
            longer than the product being sold, and a cross-sell that occupies
            more of the page than the thing it is attached to stops reading as
            a suggestion and starts reading as a second shop. Small square
            picture, name, price, one discreet add — and sideways, so the
            number of them costs no height at all. */}
        {/* One tile, one tap.
            The sideways rail asked people to aim at a 13px product name — on a
            phone a thumb that misses by four pixels lands on the list instead
            and nothing happens, which reads as a dead link. The whole tile is
            the link now: the anchor is stretched over the card with ::after,
            so anywhere on the picture, the name or the white space around them
            goes to the product. The add sits above it on its own layer, so the
            one place that must not navigate still does not. */}
        <ul className="cb-recs__grid2">
          {items.map((p) => (
            <li className="cb-rec2" key={p.id}>
              <span className="cb-rec2__pic">
                {p.imageUrl ? <img src={p.imageUrl} alt={p.title} loading="lazy" /> : <span />}
                {/* What this product genuinely saves at its best bundle, said
                    in dollars and with the quantity that earns it, so the
                    number is checkable rather than a sticker. */}
                {bestSaving.get(p.id) ? (
                  <span className="cb-rec2__flag">
                    {dollars(bestSaving.get(p.id)!.off)} off
                    {bestSaving.get(p.id)!.qty > 1 ? ` on ${bestSaving.get(p.id)!.qty}` : ""}
                  </span>
                ) : null}
              </span>
              <a className="cb-rec2__hit" href={`/products/${p.handle}${storeParam}`}>
                {p.title}
              </a>
              <span className="cb-rec2__price">
                {/* "From", when the product sells in more than one size. The
                    card used to print whichever bundle the product page
                    defaults to, so the reaper card said $199.00 when one
                    reaper is $129.00 — the dearer number, on the comparison. */}
                {p.fromMany ? <em>From </em> : null}
                {formatMoney(p.fromCents, page.store.currency)}
              </span>
              <form
                className="cb-rec2__form"
                method="post"
                action={`/cart/add${storeParam}`}
                onSubmit={(e) => { if (drawer) { e.preventDefault(); drawer.add(p.variantId); } }}
              >
                <input type="hidden" name="variantId" value={p.variantId} />
                <button type="submit" className="cb-rec2__add" aria-label={`${cta} ${p.title}`}>{cta}</button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Closing({ section, page, storeParam = "" }: { section: LoadedSection; page: LoadedProductPage; storeParam?: string }) {
  const v = section.values;
  const drawer = useCartDrawer();
  // What the customer picked in the buy box, not what the shop defaults to.
  const fallback = (page.variants.find((x) => x.isDefault) ?? page.variants[0])?.id ?? "";
  const { id: pickedId } = usePicked(fallback);
  const buy =
    page.variants.find((x) => x.id === pickedId) ??
    page.variants.find((x) => x.isDefault) ??
    page.variants[0] ??
    null;
  if (!has(v, "heading")) return null;
  return (
    <section className="cb-section cb-close">
      <div className="cb-wrap cb-close__in">
        {page.store.logoUrl ?? LOGO ? <img src={(page.store.logoUrl ?? LOGO) as string} alt="" /> : <span className="cb-mark">{page.store.name}</span>}
        <h2 className="cb-h2">{val(v, "heading")}</h2>
        {has(v, "subheading") ? <p className="cb-lede">{val(v, "subheading")}</p> : null}
        {buy ? (
          <form
            method="post"
            action={`/cart/add${storeParam}`}
            onSubmit={(e) => { if (drawer) { e.preventDefault(); drawer.add(buy.id); } }}
          >
            <input type="hidden" name="variantId" value={buy.id} />
            <button type="submit" className="cb-btn">{val(v, "ctaLabel") || "Add to cart"}</button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ hers / his */

/**
 * The same tray, two completely different nights — and the messages that
 * arranged one of them drifting around the picture.
 *
 * The bubbles are placed as percentages of the frame rather than pinned to
 * corners, so they keep their relationship to the photograph at every width,
 * and they are hidden below the photo's own breakpoint instead of piling up
 * on top of it. The drift is a few pixels over several seconds: enough to
 * read as alive, not enough to fight the thing being sold.
 */
const BUBBLE_SPOTS = [
  { top: "6%", left: "1%" },
  { top: "26%", left: "-2%" },
  { top: "60%", left: "0%" },
  { top: "10%", right: "1%" },
  { top: "38%", right: "-2%" },
  { top: "68%", right: "0%" },
];

function HersHis({ section }: { section: LoadedSection }) {
  const v = section.values;
  if (!has(v, "image")) return null;
  const notes = section.blocks.filter((b) => has(b.values, "text")).slice(0, BUBBLE_SPOTS.length);

  return (
    <section className="cb-section cb-hh" id="hers-his">
      <div className="cb-wrap">
        {has(v, "heading") ? (
          <div className="cb-head">
            <h2 className="cb-h2">{val(v, "heading")}</h2>
            {has(v, "subheading") ? <p className="cb-lede">{val(v, "subheading")}</p> : null}
          </div>
        ) : null}

        <div className="cb-hh__stage">
          <img className="cb-hh__img" src={val(v, "image")} alt={val(v, "heading")} loading="lazy" />

          {notes.map((b, i) => {
            const spot = BUBBLE_SPOTS[i];
            const mine = val(b.values, "side") === "us";
            return (
              <div
                key={b.id}
                className={`cb-hh__msg${mine ? " is-mine" : ""}`}
                style={{ ...spot, animationDelay: `${(i % 3) * 1.1}s` }}
              >
                <p>{val(b.values, "text")}</p>
                {has(b.values, "at") ? <span>{val(b.values, "at")}</span> : null}
              </div>
            );
          })}
        </div>

        <div className="cb-hh__legend">
          <div>
            <b>{val(v, "leftTitle") || "For her"}</b>
            {has(v, "leftNote") ? <span>{val(v, "leftNote")}</span> : null}
          </div>
          <div>
            <b>{val(v, "rightTitle") || "For him"}</b>
            {has(v, "rightNote") ? <span>{val(v, "rightNote")}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- photo banner */

/**
 * One photograph the width of the screen with the words over it.
 *
 * The type is real type, not painted into the picture: it stays sharp on a
 * phone, it stays editable in the admin, and a price that moves later does not
 * mean generating the photo again.
 *
 * The button adds whichever variant the section names, so this banner can sell
 * the bundle from the middle of the page. Falling back to the default variant
 * means it always sells something rather than rendering a dead button.
 */
function PhotoBanner({
  section,
  page,
  storeParam = "",
}: {
  section: LoadedSection;
  page: LoadedProductPage;
  storeParam?: string;
}) {
  const v = section.values;
  const drawer = useCartDrawer();
  if (!has(v, "image")) return null;

  // The link field doubles as a variant picker: "variant:<id>" adds to the
  // cart, anything else is an ordinary link.
  const href = val(v, "ctaHref");
  const wanted = href.startsWith("variant:") ? href.slice(8) : "";
  const pick =
    page.variants.find((x) => x.id === wanted) ??
    page.variants.find((x) => x.isDefault) ??
    page.variants[0] ??
    null;

  return (
    <section className="cb-section cb-bn">
      <div className="cb-bn__frame">
        <img className="cb-bn__img" src={val(v, "image")} alt={val(v, "heading")} />
        <div className="cb-bn__scrim" />
        <div className="cb-bn__copy">
          {has(v, "heading") ? <h2 className="cb-bn__h">{val(v, "heading")}</h2> : null}
          {has(v, "subheading") ? <p className="cb-bn__sub">{val(v, "subheading")}</p> : null}
          {pick ? (
            <form
              method="post"
              action={`/cart/add${storeParam}`}
              onSubmit={(e) => {
                if (!drawer) return;
                e.preventDefault();
                drawer.add(pick.id);
              }}
            >
              <input type="hidden" name="variantId" value={pick.id} />
              <button type="submit" className="cb-btn cb-bn__btn">
                {val(v, "ctaLabel") || "Add to cart"}
              </button>
            </form>
          ) : null}
          {has(v, "note") ? <p className="cb-bn__note">{val(v, "note")}</p> : null}
        </div>
      </div>
    </section>
  );
}



/**
 * The yard, from above, with a number on every piece.
 *
 * A list of what is in a build tells you what you own. It does not tell you
 * what the yard looks like, and at this price that is the question. So the
 * plan is drawn: the house, the driveway, the path and the sidewalk, with a
 * numbered marker wherever a piece stands, and the same numbers down the side
 * saying what each one is and why it is there rather than somewhere else.
 *
 * It is drawn in the page rather than photographed, which means it is sharp on
 * any screen, weighs nothing, and -- the part that matters -- it follows the
 * bundle chosen in the buy box. Pick Night of the Dead and six more markers
 * appear. A buyer comparing two builds can see the difference as a shape
 * instead of reading two lists and holding them in their head.
 */
function YardPlan({ section, page }: { section: LoadedSection; page: LoadedProductPage }) {
  const spots = section.blocks.filter((b) => has(b.values, "title"));
  const variants = page.variants;
  const fallbackId = (variants.find((x) => x.isDefault) ?? variants[0])?.id ?? "";
  const { id: picked } = usePicked(fallbackId);
  if (!spots.length || !variants.length) return null;

  // Which build is on screen: its position in the bundle list, one-based.
  const tier = Math.max(1, variants.findIndex((v) => v.id === picked) + 1);
  const shown = spots.filter((b) => Number(val(b.values, "from") || "1") <= tier);
  const chosen = variants.find((v) => v.id === picked) ?? variants[0];

  return (
    <section className="cb-yard" id="plan">
      <div className="cb-wrap">
        {has(section.values, "heading") ? <Head section={section} /> : null}

        <p className="cb-yard__which">
          Showing <b>{chosen?.label}</b>. Change the build above and the plan changes with it.
        </p>

        <div className="cb-yard__grid">
          <div className="cb-yard__map">
            <svg viewBox="0 0 400 300" className="cb-yard__svg" role="img" aria-label="Overhead plan of the yard">
              {/* The ground, the road, the concrete. Flat colour, no texture. */}
              <rect x="0" y="0" width="400" height="300" fill="#12131A" />
              <rect x="0" y="276" width="400" height="24" fill="#1D1F28" />
              <rect x="0" y="268" width="400" height="8" fill="#2A2D38" />
              <rect x="296" y="92" width="72" height="176" fill="#2A2D38" />
              {/* The house: body, porch, door, garage. */}
              <rect x="52" y="14" width="296" height="78" rx="3" fill="#232630" stroke="#3A3E4C" strokeWidth="1.5" />
              <rect x="160" y="78" width="96" height="22" rx="2" fill="#2B2F3A" stroke="#3A3E4C" strokeWidth="1.5" />
              <rect x="198" y="86" width="20" height="14" fill="#F5821F" opacity="0.85" />
              <rect x="286" y="20" width="58" height="66" rx="2" fill="#1C1F27" stroke="#3A3E4C" strokeWidth="1.5" />
              {/* The path from the door to the sidewalk. */}
              <path d="M198 100 L190 268 L226 268 L218 100 Z" fill="#2A2D38" />
              {/* The lawn edge, so the plan reads as a plot and not a diagram. */}
              <rect x="10" y="100" width="380" height="164" rx="4" fill="none" stroke="#2E3240" strokeWidth="1" strokeDasharray="4 5" />

              {shown.map((b) => {
                const x = Number(val(b.values, "x") || "0");
                const y = Number(val(b.values, "y") || "0");
                const n = val(b.values, "n");
                return (
                  <g key={b.id} className="cb-yard__mark">
                    <circle cx={x} cy={y} r="11" fill="#F5821F" />
                    <text x={x} y={y + 4} textAnchor="middle" className="cb-yard__num">{n}</text>
                  </g>
                );
              })}
            </svg>
            <div className="cb-yard__key">
              <span>House</span><span>Driveway</span><span>Path</span><span>Sidewalk</span>
            </div>
          </div>

          <ol className="cb-yard__list">
            {shown.map((b) => (
              <li className="cb-yard__item" key={b.id}>
                <span className="cb-yard__n">{val(b.values, "n")}</span>
                <span className="cb-yard__txt">
                  <b>{val(b.values, "title")}</b>
                  <i>{val(b.values, "text")}</i>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------- the big-build sections
 *
 * Four sections that exist on one page only: the build. Every other product
 * here is an impulse at ninety-nine dollars, and an impulse needs a photograph
 * and a price. Three and a half thousand dollars needs something else -- it
 * needs the buyer to be able to stand in the thing before they own it, to see
 * exactly how the middle price differs from the top one, to know what their
 * Saturday looks like, and to know what happens when it rains, because it
 * rains in October and they have already thought of that.
 *
 * All four are plain text and flat colour. Nothing animates and nothing blurs.
 */

/** A newline list in one value, e.g. the six rows of the ladder. */
function lines(v: Record<string, string>, key: string): string[] {
  return val(v, key).split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * The three builds, side by side, on the same counted rows.
 *
 * A bullet list per tier is unreadable across three columns: the eye cannot
 * tell which line of one matches which line of another. The row labels live
 * on the section and every tier answers them in the same order, so the
 * comparison is a straight line across. On a phone the columns stack and each
 * figure carries its own label, because there is no longer a header to look up.
 */
function TierLadder({ section }: { section: LoadedSection }) {
  const labels = lines(section.values, "rows");
  const tiers = section.blocks.filter((b) => has(b.values, "name"));
  if (!tiers.length || !labels.length) return null;
  return (
    <section className="cb-ladder" id="builds">
      <div className="cb-wrap">
        {has(section.values, "heading") ? <Head section={section} /> : null}
        <div className="cb-ladder__grid">
          {tiers.map((t) => {
            const vals = lines(t.values, "values");
            return (
              <article className="cb-ladder__col" key={t.id} data-top={val(t.values, "top") ? "1" : undefined}>
                <h3 className="cb-ladder__name">{val(t.values, "name")}</h3>
                <p className="cb-ladder__price">
                  <b>{val(t.values, "price")}</b>
                  {has(t.values, "was") ? <s>{val(t.values, "was")}</s> : null}
                </p>
                <dl className="cb-ladder__rows">
                  {labels.map((label, i) => (
                    <div className="cb-ladder__row" key={label}>
                      <dt>{label}</dt>
                      <dd>{vals[i] ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
                {has(t.values, "street") ? <p className="cb-ladder__street">{val(t.values, "street")}</p> : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * The weekend, in four parts.
 *
 * "Easy to install" is a claim. A Friday, a Saturday morning, a Saturday
 * afternoon and a Sunday, each with the hours on it and what is actually in
 * your hands, is a plan -- and a person deciding whether to spend this much is
 * deciding whether they have the weekend, not whether it is easy.
 */
function InstallWeekend({ section }: { section: LoadedSection }) {
  const steps = section.blocks.filter((b) => has(b.values, "title"));
  if (!steps.length) return null;
  return (
    <section className="cb-week" id="install">
      <div className="cb-wrap">
        {has(section.values, "heading") ? <Head section={section} /> : null}
        <ol className="cb-week__row">
          {steps.map((b, i) => (
            <li className="cb-week__step" key={b.id}>
              <span className="cb-week__when">{val(b.values, "when") || `Step ${i + 1}`}</span>
              <h3 className="cb-week__t">{val(b.values, "title")}</h3>
              <p className="cb-week__b">{val(b.values, "text")}</p>
            </li>
          ))}
        </ol>
        {has(section.values, "note") ? <p className="cb-week__note">{val(section.values, "note")}</p> : null}
      </div>
    </section>
  );
}

/**
 * What happens when the weather does what October does.
 *
 * Every objection to spending this on something that lives outdoors is a
 * weather objection, and the honest answer to one of them is "take them down,
 * it takes a minute". Saying that plainly is worth more than any promise that
 * nothing ever goes wrong.
 */
function WeatherPlan({ section }: { section: LoadedSection }) {
  const rows = section.blocks.filter((b) => has(b.values, "title"));
  if (!rows.length) return null;
  return (
    <section className="cb-weather" id="weather">
      <div className="cb-wrap">
        {has(section.values, "heading") ? <Head section={section} /> : null}
        <dl className="cb-weather__list">
          {rows.map((b) => (
            <div className="cb-weather__row" key={b.id}>
              <dt>{val(b.values, "title")}</dt>
              <dd>{val(b.values, "text")}</dd>
            </div>
          ))}
        </dl>
        {has(section.values, "promise") ? (
          <p className="cb-weather__promise">{val(section.values, "promise")}</p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Permission to buy the smaller one.
 *
 * A page that only argues for the biggest build loses the person who cannot
 * afford it this year, and that person buys the middle one and comes back --
 * but only if somebody told them the pieces still match next October.
 */
function StartSmaller({ section }: { section: LoadedSection }) {
  const ways = section.blocks.filter((b) => has(b.values, "title"));
  if (!ways.length) return null;
  return (
    <section className="cb-two" id="either-way">
      <div className="cb-wrap">
        {has(section.values, "heading") ? <Head section={section} /> : null}
        <div className="cb-two__grid">
          {ways.map((b) => (
            <article className="cb-two__card" key={b.id}>
              <h3 className="cb-two__t">{val(b.values, "title")}</h3>
              <p className="cb-two__b">{val(b.values, "text")}</p>
            </article>
          ))}
        </div>
        {has(section.values, "note") ? <p className="cb-two__note">{val(section.values, "note")}</p> : null}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- sticky */

function StickyBuy({ page, storeParam = "" }: { page: LoadedProductPage; storeParam?: string }) {
  const drawer = useCartDrawer();
  const [on, setOn] = useState(false);
  const seen = useRef(false);
  // What the customer picked in the buy box, not what the shop defaults to.
  const fallback = (page.variants.find((x) => x.isDefault) ?? page.variants[0])?.id ?? "";
  const { id: pickedId } = usePicked(fallback);
  const buy =
    page.variants.find((x) => x.id === pickedId) ??
    page.variants.find((x) => x.isDefault) ??
    page.variants[0] ??
    null;

  // Appears once the buy box has scrolled off, the way the sticky bar on the
  // other stores does. No buy box on the page means no bar.
  useEffect(() => {
    const target = document.getElementById("buy");
    if (!target) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) seen.current = true;
        setOn(seen.current && !e.isIntersecting);
      },
      { threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  if (!buy) return null;
  /* A listing graphic is the wrong thumbnail at forty-four pixels: its banner
     type turns to mush. Take the first plain photograph, and fall back to
     whatever exists rather than leaving a hole. */
  const imgs = page.product.images ?? [];
  const pic =
    buy.imageUrl ||
    imgs.find((i) => i.url && i.kind !== "graphic")?.url ||
    imgs.find((i) => i.url)?.url ||
    null;
  return (
    <div className={`cb-sticky${on ? " is-on" : ""}`}>
      <div className="cb-wrap cb-sticky__in">
        {pic ? (
          <span className="cb-sticky__pic">
            <Pic src={pic} size="t200" alt="" loading="lazy" />
          </span>
        ) : null}
        <div className="cb-sticky__txt">
          <div className="cb-sticky__t">{page.product.title}</div>
          <div className="cb-sticky__p">
            <b>{formatMoney(buy.priceCents, page.store.currency)}</b>
            {buy.compareAtCents ? <s>{formatMoney(buy.compareAtCents, page.store.currency)}</s> : null}
            <span className="cb-sticky__v">{buy.label}</span>
          </div>
        </div>
        <form
          className="cb-sticky__form"
          method="post"
          action={`/cart/add${storeParam}`}
          onSubmit={(e) => { if (drawer) { e.preventDefault(); drawer.add(buy.id); } }}
        >
          <input type="hidden" name="variantId" value={buy.id} />
          <button type="submit" className="cb-btn">Add to cart</button>
        </form>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- footer */

function Footer({ page, storeParam }: { page: LoadedProductPage; storeParam: string }) {
  const href = (p: string) => `${p}${storeParam}`;
  const drawer = useCartDrawer();
  // What the customer picked in the buy box, not what the shop defaults to.
  const fallback = (page.variants.find((x) => x.isDefault) ?? page.variants[0])?.id ?? "";
  const { id: pickedId } = usePicked(fallback);
  const buy =
    page.variants.find((x) => x.id === pickedId) ??
    page.variants.find((x) => x.isDefault) ??
    page.variants[0] ??
    null;
  // The last offer said one store's line no matter whose page it was on. It
  // borrows the Closing CTA's heading, which the shop already writes.
  const closing = page.sections.find((x) => x.type === "closing_cta");
  return (
    <>
      {/* One last offer, made properly, before the small print. */}
      <section className="cb-last">
        <div className="cb-wrap cb-last__in">
          {page.store.logoUrl ?? LOGO ? <img className="cb-last__logo" src={(page.store.logoUrl ?? LOGO) as string} alt="" /> : <span className="cb-mark cb-mark--lg">{page.store.name}</span>}
          <h2 className="cb-h2">
            {has(closing?.values ?? {}, "heading")
              ? val(closing!.values, "heading")
              : `Put the ${page.product.title.replace(/^The /i, "")} up this weekend`}
          </h2>
          {buy ? (
            <form
              method="post"
              action={`/cart/add${storeParam}`}
              onSubmit={(e) => { if (drawer) { e.preventDefault(); drawer.add(buy.id); } }}
            >
              <input type="hidden" name="variantId" value={buy.id} />
              <button type="submit" className="cb-btn">
                {/* The product, not the shop. This said "Get Black Reaper" at
                    the bottom of the zombie, the projector and the archways —
                    the last line before the card comes out naming the wrong
                    thing. */}
                Get the {page.product.title.replace(/^The /i, "")} — {formatMoney(buy.priceCents, page.store.currency)}
              </button>
            </form>
          ) : null}
          <ul className="cb-last__trust">
            {promises(page).map((text, i) => (
              <li key={text}>{[IcoTruck, IcoReturn, IcoShield][i]}{text}</li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="cb-footer">
        <div className="cb-wrap cb-footer__cols">
          <div className="cb-footer__brand">
            {page.store.logoUrl ? <img src={page.store.logoUrl} alt={page.store.name} /> : <b className="cb-h3">{page.store.name}</b>}
            {page.store.metaDescription ? <p>{page.store.metaDescription}</p> : null}
          </div>

          {page.nav.footer.length ? (
            <nav className="cb-footer__col" aria-label="Footer">
              <h3>Help</h3>
              <ul>
                {page.nav.footer.map((l) => (
                  <li key={l.href + l.label}><a href={`${l.href}${storeParam}`}>{l.label}</a></li>
                ))}
              </ul>
            </nav>
          ) : null}

          <div className="cb-footer__col">
            <h3>The store</h3>
            <ul>
              <li><a href={href("/")}>{page.store.name}</a></li>
              {/* Built from the same list as the header, so a link here can
                  never point at an anchor the page does not have. The Reviews
                  link is gone on purpose: the section is hidden until a real
                  buyer writes one, and a link to nothing is worse than no
                  link. */}
              {NAV.map(([label, to]) => (
                <li key={to}><a href={to}>{label}</a></li>
              ))}
            </ul>
          </div>

          <div className="cb-footer__col">
            <h3>Talk to a person</h3>
            <ul>
              {page.store.contactEmail ? (
                <li><a href={`mailto:${page.store.contactEmail}`}>{page.store.contactEmail}</a></li>
              ) : null}
              <li>Same-day replies, most days</li>
            </ul>
          </div>
        </div>

        <div className="cb-wrap cb-footer__bar">
          <span>© 2026 {page.store.name}</span>
          <span>{promises(page).join(" · ")}</span>
        </div>
      </footer>
    </>
  );
}

/* ----------------------------------------------------------------- shared */

function Head({ section }: { section: LoadedSection }) {
  const v = section.values;
  if (!has(v, "heading", "subheading")) return null;
  return (
    <div className="cb-head">
      {has(v, "heading") ? <h2 className="cb-h2">{val(v, "heading")}</h2> : null}
      {has(v, "subheading") ? <p className="cb-lede">{val(v, "subheading")}</p> : null}
    </div>
  );
}
