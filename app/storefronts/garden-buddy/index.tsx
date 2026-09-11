import { useEffect, useRef, useState } from "react";
import type { LoadedProductPage, LoadedSection, NavLink } from "~/lib/store.server";
import { formatMoney, savedAmount, savedPercent } from "~/lib/money";
import { SPEC_PENDING } from "~/lib/sections";
import { CartDrawerProvider, useCartDrawer } from "./cart-drawer";

/**
 * Garden Buddy storefront — store two.
 *
 * This is the live gardenbuddy.store theme, transliterated out of
 * `design/live-store/sections/*.html`. Every class name, every nesting level
 * and every inline SVG below is copied from that markup; the only thing that
 * changed is where the words and the pictures come from.
 *
 * Two rules decide what is hard-coded and what is not:
 *
 *   - The fifteen sections are content. Their text and images come out of
 *     `values` / `blocks`. Where the live page shows something the section has
 *     no field for, it is left out and named in the port report — never faked.
 *   - The header, the footer and the icon sets are theme chrome. They live in
 *     code by design (the admin edits words inside sections, not the shell),
 *     so they are carried over literally, exactly as they render live.
 */

type Vals = Record<string, string>;
const val = (v: Vals, k: string) => (v[k] ?? "").trim();
const has = (v: Vals, ...keys: string[]) => keys.some((k) => val(v, k) !== "");

/* ------------------------------------------------------------------ icons */
/* Inline SVG on the live theme — there is no image file behind any of these,
   so they are part of the design and stay in code, in the live order. */

const IcoTruck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M1.5 6.5h11v9h-11z" /><path d="M12.5 9.5h4.6l2.9 3v3h-7.5z" /><circle cx="6" cy="17.5" r="2" /><circle cx="16.5" cy="17.5" r="2" /></svg>
);
const IcoShield = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 2.5l7.5 3v6c0 4.6-3.1 8.4-7.5 10-4.4-1.6-7.5-5.4-7.5-10v-6z" /><path d="M8.6 11.8l2.4 2.4 4.4-4.6" /></svg>
);
const IcoHeadset = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 14v-2.5a7.5 7.5 0 0 1 15 0V14" /><path d="M4.5 12.5h2V18h-2a1.5 1.5 0 0 1-1.5-1.5v-2.5a1.5 1.5 0 0 1 1.5-1.5z" /><path d="M19.5 12.5h-2V18h2a1.5 1.5 0 0 0 1.5-1.5v-2.5a1.5 1.5 0 0 0-1.5-1.5z" /><path d="M19 18v.8a2.7 2.7 0 0 1-2.7 2.7H13" /></svg>
);

/** The four trust-band icons, in the order the live band renders them. */
const TRUST_ICONS = [
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 6.5h11v9h-11z" /><path d="M12.5 10h4l3 3v2.5h-7z" /><circle cx="6" cy="17.5" r="2" /><circle cx="16.5" cy="17.5" r="2" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5l7.5 3v5.7c0 4.6-3.1 8.4-7.5 10.3C7.6 19.6 4.5 15.8 4.5 11.2V5.5z" /><path d="M8.6 11.8l2.4 2.4 4.4-4.6" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="10.5" rx="2.2" /><path d="M8 10V7.2a4 4 0 0 1 8 0V10" /><path d="M12 14v2.6" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="2.5" y="13.5" width="4" height="6.5" rx="1.8" /><rect x="17.5" y="13.5" width="4" height="6.5" rx="1.8" /><path d="M19.5 20v.4a2.6 2.6 0 0 1-2.6 2.6H13" /></svg>,
];

/** The buy box's own three-item trust strip. */
const BUY_TRUST_ICONS = [
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5h11v9h-11z" /><path d="M13.5 10h4l3 3v2.5h-7z" /><circle cx="6.5" cy="17.5" r="1.7" /><circle cx="17" cy="17.5" r="1.7" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.4-3 8.1-7 10-4-1.9-7-5.6-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></svg>,
];

/** Benefits — three icons, in the live order. */
const BENEFIT_ICONS = [
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8.6 12c-1.5 2.3-2.6 3.2-4.1 3.2A3.2 3.2 0 0 1 4.5 8.8C7 8.8 8.4 12 12 12s5-3.2 7.5-3.2a3.2 3.2 0 0 1 0 6.4c-1.5 0-2.6-.9-4.1-3.2" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5l7.5 3v5.7c0 4.6-3.1 8.4-7.5 10.3C7.6 19.6 4.5 15.8 4.5 11.2V5.5z" /><path d="M8.6 11.8l2.4 2.4 4.4-4.6" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.2l8.5 4.3-8.5 4.3L3.5 7.5z" /><path d="M3.5 12.2l8.5 4.3 8.5-4.3" /><path d="M3.5 16.6l8.5 4.2 8.5-4.2" /></svg>,
];

/** Features — six icons, in the live order. */
const FEATURE_ICONS = [
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5l7.5 3v5.7c0 4.6-3.1 8.4-7.5 10.3C7.6 19.6 4.5 15.8 4.5 11.2V5.5z" /><path d="M8.6 11.8l2.4 2.4 4.4-4.6" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.4l-7-6.6a4.4 4.4 0 0 1 7-5.2 4.4 4.4 0 0 1 7 5.2z" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8.6 12c-1.5 2.3-2.6 3.2-4.1 3.2A3.2 3.2 0 0 1 4.5 8.8C7 8.8 8.4 12 12 12s5-3.2 7.5-3.2a3.2 3.2 0 0 1 0 6.4c-1.5 0-2.6-.9-4.1-3.2" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.2l8.5 4.3-8.5 4.3L3.5 7.5z" /><path d="M3.5 12.2l8.5 4.3 8.5-4.3" /><path d="M3.5 16.6l8.5 4.2 8.5-4.2" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.6" /><path d="M12 7.2V12l3.2 2" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21c0-5 2-9 7-11-1 6-3.4 9.3-7 11z" /><path d="M12 21C7.5 20 4 16 4 10.5 4 6.5 6.5 4 9.5 4c2.6 0 4.3 1.8 4.9 4" /></svg>,
];

const ArrowLeft = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
);
const ArrowRight = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
);

/* ------------------------------------------------------------------- page */

/**
 * What the header and footer actually need. A policy page has a store and a
 * menu but no product, and the chrome has to be the same chrome on both — a
 * page with no header and no way home is not a page on this website.
 */
export type ChromeInput = Pick<LoadedProductPage, "store" | "nav">;

export function GardenBuddyStorefront({ page, storeParam = "" }: { page: LoadedProductPage; storeParam?: string }) {
  // Which store answers is decided by the hostname, except on the built-in
  // address where it comes from ?store=. Without carrying that through, every
  // internal link lands on whichever store happens to be first — which is how
  // clicking this store's own logo ended up on a different shop.
  const href = (path: string) => `${path}${storeParam}`;
  const { sections } = page;

  // The one picture of this product we hold: the buy box's first gallery
  // photo. The drawer shows it beside each line; there is no per-variant image
  // in the database, so there is nothing else to show and nothing is invented.
  const buyBox = sections.find((s) => s.type === "buy_box");
  const firstShot = buyBox?.blocks.find((b) => has(b.values, "image"));
  const photo = firstShot
    ? { src: val(firstShot.values, "image"), alt: val(firstShot.values, "alt") }
    : null;

  return (
    <CartDrawerProvider page={page} storeParam={storeParam} photo={photo}>
      {/* The theme's own fonts and stylesheet, in the order the live page loads
          them. React hoists both into <head>. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Caveat:wght@600;700&display=swap"
      />

      <Header page={page} storeParam={storeParam} />

      <main id="MainContent" className="content-for-layout" role="main" data-template="product">
        {sections.map((s) => (
          <Section key={s.id} section={s} page={page} storeParam={storeParam} />
        ))}
      </main>

      <Footer page={page} storeParam={storeParam} />
    </CartDrawerProvider>
  );
}

function Section({
  section,
  page,
  storeParam = "",
}: {
  section: LoadedSection;
  page: LoadedProductPage;
  storeParam?: string;
}) {
  if (section.type === "buy_box") {
    return (
      <section className="shopify-section gb-section">
        <BuyBox section={section} page={page} storeParam={storeParam} />
      </section>
    );
  }
  const body = renderSection(section, page);
  if (!body) return null;
  return (
    <section className="shopify-section gb-section">
      <div className="gb gb-pb">{body}</div>
    </section>
  );
}

/* ----------------------------------------------------------------- header */

export function Header({ page, storeParam = "" }: { page: ChromeInput; storeParam?: string }) {
  const href = (path: string) => `${path}${storeParam}`;
  const { store, nav } = page;
  const links = nav.main;
  const drawer = useCartDrawer();

  return (
    <div className="shopify-section shopify-section-group-header-group">
      <div className="gb gb-hdr-sec">
        <div className="gb-tbar">
          <ul className="gb-wrap gb-tbar__row">
            <li>
              {IcoTruck}
              <span>Free Shipping</span>
            </li>
            <li>
              {IcoShield}
              <span>30-Day Money Back Guarantee</span>
            </li>
            <li>
              {IcoHeadset}
              <span>24/7 Support</span>
            </li>
          </ul>
        </div>
        <header className="gb-hdr">
          <div className="gb-wrap gb-hdr__in">
            <details className="gb-hdr__menu">
              <summary className="gb-hdr__burger" aria-label="Menu">
                <svg className="gb-hdr__ico gb-hdr__ico--open" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
                <svg className="gb-hdr__ico gb-hdr__ico--close" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </summary>
              <nav className="gb-hdr__mnav" aria-label="Main, mobile">
                {links.map((l) => (
                  <a key={`m${l.href}${l.label}`} href={l.href.startsWith("#") ? `${href("/")}${l.href}` : href(l.href)}>
                    {l.label}
                  </a>
                ))}
              </nav>
            </details>

            <a className="gb-hdr__logo" href={href("/")}>
              <Logo store={store} imgClass="gb-hdr__logo-img" wordClass="gb-hdr__wordmark" loading="eager" />
            </a>

            <nav className="gb-hdr__nav" aria-label="Main">
              {links.map((l) => (
                <a key={`d${l.href}${l.label}`} href={l.href.startsWith("#") ? `${href("/")}${l.href}` : href(l.href)}>
                  {l.label}
                </a>
              ))}
            </nav>

            <div className="gb-hdr__right">
              <a
                className="gb-hdr__cart"
                href={href("/cart")}
                aria-label="Cart"
                onClick={(event) => {
                  // With JavaScript the cart is the drawer; without it, the
                  // link still goes to the cart page.
                  if (!drawer) return;
                  event.preventDefault();
                  drawer.open(event.currentTarget);
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7h12l1 14H5L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
              </a>
              {/* From a policy page this has to travel to the home page first;
                  on the home page it is the same in-page jump it always was. */}
              <a className="gb-hdr__cta" href={`${href("/")}#gb-buy`}>
                <span className="gb-hdr__cta-txt">Order Now</span>
              </a>
            </div>
          </div>
        </header>
      </div>
    </div>
  );
}

/**
 * The store's logo. With no logo uploaded the theme falls back to its own
 * wordmark — the design's empty state, not a gap.
 */
function Logo({
  store,
  imgClass,
  wordClass,
  loading,
}: {
  store: LoadedProductPage["store"];
  imgClass?: string;
  wordClass: string;
  loading?: "eager" | "lazy";
}) {
  if (!store.logoUrl) return <span className={wordClass}>{store.name}</span>;
  return <img src={store.logoUrl} alt={store.name} className={imgClass} loading={loading ?? "lazy"} />;
}

/* ----------------------------------------------------------------- footer */

export function Footer({ page, storeParam = "" }: { page: ChromeInput; storeParam?: string }) {
  const href = (path: string) => `${path}${storeParam}`;
  const { store, nav } = page;

  return (
    <div className="shopify-section shopify-section-group-footer-group">
      <div className="gb gb-ftr-sec">
        <section className="gb-cta" aria-label={`Order ${store.name}`}>
          <div className="gb-wrap gb-cta__in">
            <div className="gb-cta__left">
              <a className="gb-cta__logo" href={href("/")}>
                <Logo store={store} imgClass="gb-ftr__logo-img" wordClass="gb-ftr__wordmark" />
              </a>
              <p className="gb-script gb-cta__script">A Happier Garden Starts Here.</p>
              <a className="gb-ftr__btn" href={`${href("/")}#gb-buy`}>
                Order Now
              </a>
            </div>

            <ul className="gb-cta__trust">
              <li>
                {IcoTruck}
                <span>
                  <strong>Free</strong>Shipping
                </span>
              </li>
              <li>
                {IcoShield}
                <span>
                  <strong>30-Day</strong>Money Back Guarantee
                </span>
              </li>
              <li>
                {IcoHeadset}
                <span>
                  <strong>24/7</strong>Support
                </span>
              </li>
            </ul>
          </div>
        </section>

        <footer className="gb-ftr">
          <div className="gb-wrap gb-ftr__cols">
            <div className="gb-ftr__col gb-ftr__col--brand">
              <a className="gb-ftr__logo" href={href("/")}>
                <Logo store={store} imgClass="gb-ftr__logo-img" wordClass="gb-ftr__wordmark" />
              </a>
              <p className="gb-ftr__about">
                A padded kneeler that flips into a stool. Made for people who still want to garden on
                their own terms.
              </p>
            </div>

            {nav.footer.length > 0 && (
              <nav className="gb-ftr__col" aria-label="Footer">
                <h2 className="gb-ftr__head">Help</h2>
                <ul className="gb-ftr__links">
                  {nav.footer.map((l: NavLink) => (
                    <li key={l.href + l.label}>
                      <a href={href(l.href)}>{l.label}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>

          <div className="gb-wrap gb-ftr__bottom">
            <small className="gb-ftr__legal">
              © {new Date().getFullYear()} {store.name}
            </small>
            <p className="gb-script gb-ftr__signoff">Plant More. Worry Less.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- buy box */

function BuyBox({ section, page, storeParam = "" }: { section: LoadedSection; page: LoadedProductPage; storeParam?: string }) {
  // Each bundle card shows its own picture when one has been chosen for it in
  // Admin → Products, and the product's first gallery photo otherwise — the
  // same photo the cart drawer already uses. Nothing is drawn that does not
  // exist: no photo at all means no thumbnail.
  // Whether this browser can do Apple Pay — decided after mount, so the
  // server and the first paint agree ("Buy now") and the label upgrades a
  // moment later where it applies.
  const [applePay, setApplePay] = useState(false);
  useEffect(() => {
    setApplePay(typeof (window as any).ApplePaySession !== "undefined");
  }, []);
  const fallbackShot = section.blocks.find((b) => has(b.values, "image"));
  const fallbackSrc = fallbackShot ? val(fallbackShot.values, "image") : null;
  const href = (path: string) => `${path}${storeParam}`;
  const { product, variants, store } = page;
  const drawer = useCartDrawer();
  const v = section.values;
  const images = section.blocks.filter((b) => has(b.values, "image"));

  const defaultIndex = Math.max(
    0,
    variants.findIndex((x) => x.isDefault),
  );
  const [selected, setSelected] = useState(defaultIndex);
  const chosen = variants[selected];

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [shot, setShot] = useState(0);

  // The live gallery is a scroll-snap track: the arrows and the dots scroll it
  // and the dots follow whatever slide the visitor has scrolled to.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      const w = track.clientWidth || 1;
      setShot(Math.round(track.scrollLeft / w));
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);

  const go = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(images.length - 1, i));
    track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
    setShot(next);
  };

  // The live page shows at most six dots however many photos there are.
  const dots = Math.min(images.length, 6);

  // The three-item strip under the button. One item per part of the section's
  // "line under the button"; the icons are the theme's, in their live order.
  const reassurance = val(v, "reassurance")
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="gb gb-product" data-gb-product>
      <div className="gb-wrap gb-product__grid">
        <div className="gb-gal">
          <div className="gb-gal__stage">
            <div className="gb-gal__frame">
              <div className="gb-gal__track" ref={trackRef} aria-label="Product photos">
                {images.length > 0 ? (
                  images.map((b, i) => (
                    <div className="gb-gal__slide" key={b.id}>
                      <img
                        src={val(b.values, "image")}
                        alt={val(b.values, "alt")}
                        loading={i === 0 ? undefined : "lazy"}
                      />
                    </div>
                  ))
                ) : (
                  <div className="gb-gal__slide">
                    <div className="gb-gal__ph gb-ph">Product photo not added yet</div>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="gb-gal__arrow gb-gal__arrow--prev"
                onClick={() => go(shot - 1)}
                aria-label="Previous photo"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
              </button>
              <button
                type="button"
                className="gb-gal__arrow gb-gal__arrow--next"
                onClick={() => go(shot + 1)}
                aria-label="Next photo"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>

            {dots > 1 && (
              <div className="gb-gal__dots" role="tablist" aria-label="Choose a photo">
                {Array.from({ length: dots }, (_, i) => (
                  <button
                    type="button"
                    className="gb-gal__dot"
                    role="tab"
                    key={i}
                    aria-selected={i === shot}
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => go(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="gb-buy" id="gb-buy">
          <h1 className="gb-h1 gb-buy__title">{val(v, "heading") || product.title}</h1>
          {val(v, "subheading") && <p className="gb-buy__sub">{val(v, "subheading")}</p>}

          {chosen && (
            <p className="gb-price">
              <span className="gb-price__now">{formatMoney(chosen.priceCents, store.currency)}</span>
              {chosen.compareAtCents ? (
                <s className="gb-price__was">{formatMoney(chosen.compareAtCents, store.currency)}</s>
              ) : null}
              {savedPercent(chosen.priceCents, chosen.compareAtCents) !== null && (
                <span className="gb-price__off">
                  {savedPercent(chosen.priceCents, chosen.compareAtCents)}% off
                </span>
              )}
            </p>
          )}

          {variants.length > 0 ? (
            <form
              method="post"
              action={href("/cart/add")}
              id="gb-form"
              className="gb-form"
              onSubmit={(event) => {
                // "Buy now" posts through to the checkout and the drawer
                // stays out of it.
                const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
                if (submitter?.classList.contains("gb-buy__express")) {
                  event.currentTarget.action = `${href("/cart/add")}${storeParam ? "&" : "?"}next=checkout`;
                  return;
                }
                // With JavaScript the add happens in place and the drawer
                // slides in. Without it this form posts as it always did.
                if (!drawer || !chosen) return;
                event.preventDefault();
                drawer.add(chosen.id, event.currentTarget.querySelector<HTMLButtonElement>(".gb-buy__add"));
              }}
            >
              <input type="hidden" name="variantId" value={chosen?.id ?? ""} />

              <div className="gb-field">
                <p className="gb-field__label gb-field__label--big">Choose your bundle</p>
                <div className="gb-packs" role="radiogroup" aria-label="Choose your bundle">
                  {variants.map((variant, i) => {
                    const saved = savedAmount(variant.priceCents, variant.compareAtCents);
                    const soldOut = variant.available <= 0;
                    return (
                      <label
                        className={`gb-pack${i === selected ? " is-selected" : ""}${
                          variant.isDefault ? " is-flagged" : ""
                        }`}
                        data-gb-pack={variant.label}
                        key={variant.id}
                      >
                        <input
                          type="radio"
                          name="gb-pack"
                          value={variant.label}
                          checked={i === selected}
                          onChange={() => setSelected(i)}
                          className="gb-pack__radio"
                        />
                        {variant.isDefault && <span className="gb-pack__flag">Our pick</span>}
                        <span className="gb-pack__head">
                          <span className="gb-pack__mark" aria-hidden="true" />
                          {variant.imageUrl || fallbackSrc ? (
                            <span className="gb-pack__thumb" aria-hidden="true">
                              <img src={variant.imageUrl || fallbackSrc || ""} alt="" loading="lazy" width={44} height={44} />
                            </span>
                          ) : null}
                          <span className="gb-pack__body">
                            <span className="gb-pack__name">{variant.label}</span>
                            {variant.sublabel && (
                              <span className="gb-pack__incl">{variant.sublabel}</span>
                            )}
                          </span>
                          <span className="gb-pack__price">
                            {variant.compareAtCents ? (
                              <s className="gb-pack__was">
                                {formatMoney(variant.compareAtCents, store.currency)}
                              </s>
                            ) : null}
                            <span className="gb-pack__now">
                              {formatMoney(variant.priceCents, store.currency)}
                            </span>
                            {saved !== null && (
                              <span className="gb-pack__save">
                                Save {formatMoney(saved, store.currency)}
                              </span>
                            )}
                            <span className="gb-pack__so" hidden={!soldOut}>
                              Sold out
                            </span>
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button type="submit" className="gb-buy__add" disabled={!chosen || chosen.available <= 0}>
                <svg className="gb-buy__cart" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 3.5h2.2l2.3 11.2h10.3" /><path d="M6.4 6.6h14l-1.6 6.4H7.7" /><circle cx="9.5" cy="19.2" r="1.5" /><circle cx="17.5" cy="19.2" r="1.5" /></svg>
                <span>{val(v, "ctaLabel") || "Add to cart"}</span>
                {chosen && (
                  <>
                    <span className="gb-buy__dot" aria-hidden="true">
                      &middot;
                    </span>
                    <span>{formatMoney(chosen.priceCents, store.currency)}</span>
                  </>
                )}
              </button>

              {/* Straight to the checkout with this bundle in the cart. On a
                  browser that has Apple Pay the button says so; on any other
                  it says Buy now. The checkout's wallet row is the first
                  thing on that screen, so this is one tap to the sheet. */}
              <button
                type="submit"
                className="gb-buy__express"
                disabled={!chosen || chosen.available <= 0}
              >
                {applePay ? (
                  <>
                    <span>Buy with</span>
                    <svg viewBox="0 0 40 20" aria-label="Apple Pay" role="img"><path fill="#fff" d="M7.6 4.3c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.4-.8 2.2.8.1 1.6-.4 2.2-1.1M8.3 5.5c-1.2-.1-2.2.7-2.8.7-.6 0-1.5-.6-2.4-.6C1.8 5.6.7 6.4.1 7.5c-1.3 2.2-.3 5.5.9 7.3.6.9 1.3 1.9 2.3 1.8.9 0 1.3-.6 2.4-.6s1.4.6 2.4.6c1 0 1.6-.9 2.2-1.8.7-1 1-2 1-2.1 0 0-1.9-.7-1.9-2.9 0-1.8 1.5-2.6 1.5-2.7-.8-1.2-2.1-1.4-2.6-1.6M15.6 3.1v13.4h2.1v-4.6h2.9c2.6 0 4.5-1.8 4.5-4.4s-1.8-4.4-4.4-4.4h-5.1zm2.1 1.8h2.4c1.8 0 2.8 1 2.8 2.6s-1 2.6-2.8 2.6h-2.4V4.9zM28.8 16.6c1.3 0 2.5-.7 3.1-1.7h.1v1.6h1.9V9.8c0-2-1.6-3.2-4-3.2-2.2 0-3.9 1.3-4 3h1.9c.2-.8 1-1.4 2-1.4 1.3 0 2.1.6 2.1 1.7v.8l-2.7.2c-2.5.1-3.9 1.2-3.9 3 0 1.7 1.4 2.7 3.5 2.7zm.6-1.6c-1.1 0-1.9-.5-1.9-1.4 0-.9.7-1.4 2-1.5l2.4-.2v.8c0 1.3-1.1 2.3-2.5 2.3zM35.6 20c2 0 3-.8 3.8-3.1L43 6.8h-2.1l-2.4 7.8h-.1L36 6.8h-2.2l3.5 9.7-.2.6c-.3 1-.8 1.4-1.7 1.4h-.7V20h.9z"/></svg>
                  </>
                ) : (
                  <span>Buy now</span>
                )}
              </button>

              {reassurance.length > 0 && (
                <ul className="gb-trust">
                  {reassurance.map((text, i) => (
                    <li key={text}>
                      {BUY_TRUST_ICONS[i] && (
                        <span className="gb-trust__ic" aria-hidden="true">
                          {BUY_TRUST_ICONS[i]}
                        </span>
                      )}
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          ) : (
            <div className="gb-ph">No bundle options yet. Add them in the admin.</div>
          )}

          <div className="gb-brand">
            <div className="gb-brand__mark">
              <Logo store={store} wordClass="gb-brand__word" />
            </div>
            <p className="gb-brand__line gb-script">A happier garden starts here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- sections */
/**
 * Note on eyebrows: every band on the live page opens with a small
 * `gb-eyebrow` line ("See it for yourself", "Three moves", "Compare"…). Only
 * the buy box has a field for it (`badge`), so on every other section the
 * element is left out rather than filled with a guess. The missing field is
 * named in the port report.
 */
function renderSection(s: LoadedSection, page: LoadedProductPage): React.ReactNode {
  const v = s.values;
  const blocks = s.blocks;

  switch (s.type) {
    /* ------------------------------------------------------- video with faq */
    case "video_faq": {
      const questions = blocks.filter((b) => has(b.values, "question"));
      if (!has(v, "heading", "subheading", "video") && questions.length === 0) return null;
      return (
        <section className="gb-sec gb-watch" id="watch">
          <div className="gb-wrap">
            <div className="gb-watch__head">
              {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
              {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
            </div>

            <div className="gb-watch__grid">
              <figure className="gb-watch__media">
                <div className="gb-watch__frame">
                  {val(v, "video") ? (
                    <video
                      className="gb-watch__embed"
                      autoPlay
                      loop
                      muted
                      playsInline
                      controls
                      preload="auto"
                    >
                      <source src={val(v, "video")} type="video/mp4" />
                    </video>
                  ) : (
                    <div className="gb-ph">Video not added yet</div>
                  )}
                </div>
              </figure>

              {questions.length > 0 && (
                <div className="gb-watch__faq">
                  <div className="gb-watch__list">
                    {questions.map((b, i) => (
                      <details className="gb-watch__item" open={i === 0} key={b.id}>
                        <summary>
                          <span>{val(b.values, "question")}</span>
                          <i aria-hidden="true" />
                        </summary>
                        <div className="gb-watch__a">
                          <p>{val(b.values, "answer")}</p>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }

    /* --------------------------------------------------- social proof images */
    case "social_proof_images": {
      const photos = blocks.filter((b) => has(b.values, "image"));
      if (photos.length === 0) return null;
      return <Social v={v} photos={photos} />;
    }

    /* ------------------------------------------------------------ video clips */
    case "video_clips": {
      const clips = blocks.filter((b) => has(b.values, "video"));
      if (clips.length === 0) return null;
      return (
        <section className="gb-sec gb-ugc" id="clips">
          <div className="gb-wrap">
            <div className="gb-ugc__head">
              {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
              {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
            </div>

            <div className="gb-ugc__grid">
              <div className="gb-ugc__rows">
                {clips.map((b, i) => (
                  <div className={`gb-ugc__row${i % 2 === 1 ? " gb-ugc__row--flip" : ""}`} key={b.id}>
                    <figure className="gb-ugc__media">
                      <video
                        className="gb-ugc__vid"
                        autoPlay
                        loop
                        muted
                        playsInline
                        controls
                        preload="metadata"
                      >
                        <source src={val(b.values, "video")} type="video/mp4" />
                      </video>
                    </figure>
                    <div className="gb-ugc__say">
                      <span className="gb-ugc__n" aria-hidden="true">
                        {i + 1}
                      </span>
                      {val(b.values, "caption") && (
                        <p className="gb-ugc__cap">{val(b.values, "caption")}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      );
    }

    /* ------------------------------------------------------------ tool set */
    case "product_grid": {
      const tools = blocks.filter((b) => has(b.values, "image", "title"));
      if (!has(v, "heading", "subheading", "footnote") && tools.length === 0) return null;
      return (
        <section className="gb-sec gb-set" id="tool-set">
          <div className="gb-wrap">
            <div className="gb-head gb-head--center">
              {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
              {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
            </div>

            {tools.length > 0 ? (
              <ul className="gb-set__row gb-rise">
                {tools.map((b) => (
                  <li className="gb-tool" key={b.id}>
                    <div className="gb-tool__shot">
                      {val(b.values, "image") ? (
                        <img
                          src={val(b.values, "image")}
                          alt={val(b.values, "title")}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="gb-ph">Photo not added yet</div>
                      )}
                    </div>
                    {val(b.values, "title") && <p className="gb-tool__name">{val(b.values, "title")}</p>}
                    {val(b.values, "note") && <p className="gb-tool__size">{val(b.values, "note")}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="gb-ph">The set has no items yet. Add them in the admin.</div>
            )}

            <div className="gb-set__foot">
              {val(v, "footnote") && <p className="gb-set__note">{val(v, "footnote")}</p>}
              <a className="gb-btn gb-btn--lime" href="#gb-buy">
                Choose your bundle
              </a>
            </div>
          </div>
        </section>
      );
    }

    /* ---------------------------------------------------------- trust icons */
    case "trust_icons": {
      const items = blocks.filter((b) => has(b.values, "title", "text"));
      if (items.length === 0) return null;
      return (
        <section className="gb-sec gb-sec--sand gb-trust">
          <div className="gb-wrap">
            <ul className="gb-trust__list">
              {items.map((b, i) => (
                <li className="gb-trust__item" key={b.id}>
                  {TRUST_ICONS[i] && (
                    <span className="gb-trust__ico" aria-hidden="true">
                      {TRUST_ICONS[i]}
                    </span>
                  )}
                  <span className="gb-trust__txt">
                    <b>{val(b.values, "title")}</b>
                    <span>{val(b.values, "text")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      );
    }

    /* ---------------------------------------------------------- three steps */
    case "three_steps": {
      const steps = blocks.filter((b) => has(b.values, "title", "text", "image"));
      if (steps.length === 0) return null;
      return (
        <section className="gb-sec gb-sec--sand gb-steps" id="how">
          <div className="gb-wrap">
            <div className="gb-steps__head">
              {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
              {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
            </div>
            <ol className="gb-steps__list">
              {steps.map((b, i) => (
                <li className="gb-step" key={b.id}>
                  <div className="gb-step__media">
                    {val(b.values, "image") ? (
                      <img
                        src={val(b.values, "image")}
                        alt={val(b.values, "title")}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="gb-ph">Photo not added yet</div>
                    )}
                    <span className="gb-step__n" aria-hidden="true">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="gb-step__h">{val(b.values, "title")}</h3>
                  <p className="gb-step__p">{val(b.values, "text")}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      );
    }

    /* -------------------------------------------------------------- benefits */
    case "benefits": {
      const items = blocks.filter((b) => has(b.values, "title", "text"));
      if (items.length === 0) return null;
      // The band has one photo. It is carried on the first benefit block, which
      // is where the port put the live section's single image.
      const shot = items.map((b) => val(b.values, "image")).find(Boolean);
      return (
        <section className="gb-sec gb-ben" id="benefits">
          <div className="gb-wrap">
            <div className="gb-head">
              {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
              {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
            </div>
            <div className="gb-ben__in gb-rise">
              <div className="gb-ben__shot">
                {shot ? (
                  <img src={shot} alt={val(v, "heading")} loading="lazy" decoding="async" />
                ) : (
                  <div className="gb-ph">Photo not added yet</div>
                )}
              </div>
              <ul className="gb-ben__list">
                {items.map((b, i) => (
                  <li className="gb-ben__item" key={b.id}>
                    {BENEFIT_ICONS[i] && (
                      <span className="gb-ben__ico" aria-hidden="true">
                        {BENEFIT_ICONS[i]}
                      </span>
                    )}
                    <h3 className="gb-h3">{val(b.values, "title")}</h3>
                    <p>{val(b.values, "text")}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      );
    }

    /* -------------------------------------------------------------- features */
    case "features": {
      const items = blocks.filter((b) => has(b.values, "title", "text"));
      if (items.length === 0) return null;
      const shot = items.map((b) => val(b.values, "image")).find(Boolean);
      return (
        <section className="gb-sec gb-pf" id="features">
          <div className="gb-wrap">
            <div className="gb-head">
              {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
              {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
            </div>
            <div className="gb-pf__in">
              <figure className="gb-pf__media gb-rise">
                <div className="gb-pf__shot">
                  {shot ? (
                    <img src={shot} alt={val(v, "heading")} loading="lazy" decoding="async" />
                  ) : (
                    <div className="gb-ph">Photo not added yet</div>
                  )}
                  <svg className="gb-pf__arrow" viewBox="0 0 120 90" fill="none" aria-hidden="true"><path d="M6 82C10 44 34 16 74 12" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><path d="M58 6l18 6-13 13" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              </figure>

              <ul className="gb-pf__grid gb-rise gb-rise--late">
                {items.map((b, i) => (
                  <li className="gb-pf__item" key={b.id}>
                    {FEATURE_ICONS[i] && (
                      <span className="gb-pf__ico" aria-hidden="true">
                        {FEATURE_ICONS[i]}
                      </span>
                    )}
                    <div>
                      <h3 className="gb-h3">{val(b.values, "title")}</h3>
                      <p>{val(b.values, "text")}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      );
    }

    /* ------------------------------------------------------------- comparison */
    case "comparison_table": {
      const rows = blocks.filter((b) => has(b.values, "label"));
      if (rows.length === 0) return null;
      return (
        <section className="gb-sec gb-better" id="compare">
          <div className="gb-wrap">
            <div className="gb-head gb-head--center">
              {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
              {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
            </div>
            <div className="gb-better__in">
              <div className="gb-table-wrap gb-rise">
                <table className="gb-cmp">
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="gb-visually-hidden">Feature</span>
                      </th>
                      <th scope="col" className="is-us">
                        {val(v, "usLabel")}
                      </th>
                      <th scope="col">{val(v, "themLabel")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b) => (
                      <tr key={b.id}>
                        <th scope="row">{val(b.values, "label")}</th>
                        <td className="is-us">
                          <Mark value={val(b.values, "us")} />
                        </td>
                        <td>
                          <Mark value={val(b.values, "them")} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      );
    }

    /* --------------------------------------------------------------- reviews */
    case "reviews":
      return (
        <section className="gb-sec gb-sec--brown gb-rev" id="reviews">
          <div className="gb-wrap">
            <div className="gb-head gb-head--center">
              {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
              {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
            </div>
            {page.reviews.length > 0 ? (
              <ul className="gb-rev__row">
                {page.reviews.map((r) => (
                  <li className="gb-card" key={r.id}>
                    {r.title && <h3 className="gb-h3">{r.title}</h3>}
                    <p>{r.body}</p>
                    <p>{r.name}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="gb-rev__empty">
                <p>
                  <b>Reviews go live once the first orders land.</b>
                </p>
                <p>
                  We are a new shop. We will post real reviews from real orders here, good and bad,
                  and nothing else.
                </p>
              </div>
            )}
          </div>
        </section>
      );

    /* ----------------------------------------------------------- who it's for */
    case "who_its_for": {
      const people = blocks.filter((b) => has(b.values, "title", "text"));
      if (people.length === 0) return null;
      return (
        <section className="gb-sec gb-sec--sand" id="who">
          <div className="gb-wrap">
            <div className="gb-head">
              {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
              {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
            </div>
            <div className="gb-who">
              {people.map((b) => (
                <div className="gb-card gb-who__card" key={b.id}>
                  <h3 className="gb-h3">{val(b.values, "title")}</h3>
                  <p>{val(b.values, "text")}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    /* ------------------------------------------------------- what's in the box */
    case "whats_in_the_box": {
      const items = blocks.filter((b) => has(b.values, "title"));
      if (items.length === 0) return null;
      return (
        <section className="gb-sec gb-sec--sand gb-detail" id="box">
          <div className="gb-wrap">
            <div className="gb-box">
              <div className="gb-head gb-head--tight">
                {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
                {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
              </div>
              <ul className="gb-box__list">
                {items.map((b) => (
                  <li className="gb-check" key={b.id}>
                    <span>
                      {val(b.values, "title")}
                      {val(b.values, "text") && <small>{val(b.values, "text")}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      );
    }

    /* -------------------------------------------------------- specifications */
    case "specifications": {
      const rows = blocks.filter((b) => has(b.values, "label"));
      if (rows.length === 0) return null;
      return (
        <section className="gb-sec gb-sec--sand gb-detail" id="specs">
          <div className="gb-wrap">
            <div className="gb-specs">
              <div className="gb-head gb-head--tight">
                {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
              </div>
              <div className="gb-table-wrap">
                <table className="gb-spec">
                  <tbody>
                    {rows.map((b) => (
                      <tr key={b.id}>
                        <th scope="row">{val(b.values, "label")}</th>
                        {/* Never a guess: an unmeasured value says so. */}
                        <td>{val(b.values, "value") || SPEC_PENDING}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      );
    }

    /* ----------------------------------------------------------- closing cta */
    case "closing_cta": {
      if (!has(v, "heading", "subheading", "ctaLabel")) return null;
      return (
        <section className="gb-sec gb-sec--night gb-closer">
          <div className="gb-wrap gb-closer__in">
            <div>
              {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
              {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
            </div>
            {val(v, "ctaLabel") && (
              <a className="gb-btn gb-btn--lime" href="#gb-buy">
                {val(v, "ctaLabel")}
              </a>
            )}
          </div>
        </section>
      );
    }

    default:
      return null;
  }
}

/** A comparison cell. "Yes"/"No" are the live theme's two marks. */
function Mark({ value }: { value: string }) {
  if (/^yes$/i.test(value)) return <span className="gb-yes" role="img" aria-label="Yes" />;
  if (/^no$/i.test(value)) return <span className="gb-no" role="img" aria-label="No" />;
  return <>{value}</>;
}

/** The social proof rail: a scroll-snap track with a button at each end. */
function Social({ v, photos }: { v: Vals; photos: LoadedSection["blocks"] }) {
  const trackRef = useRef<HTMLUListElement | null>(null);

  const nudge = (dir: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const step = track.firstElementChild?.clientWidth ?? track.clientWidth;
    track.scrollBy({ left: dir * (step + 20), behavior: "smooth" });
  };

  return (
    <section className="gb-sec gb-sec--brown gb-social" id="social">
      <div className="gb-wrap">
        <div className="gb-social__head">
          {val(v, "heading") && <h2 className="gb-h2">{val(v, "heading")}</h2>}
          {val(v, "subheading") && <p className="gb-lede">{val(v, "subheading")}</p>}
        </div>

        <div className="gb-social__rail">
          <button
            type="button"
            className="gb-social__nav gb-social__nav--prev"
            onClick={() => nudge(-1)}
            aria-label="Previous"
          >
            {ArrowLeft}
          </button>
          <ul className="gb-social__track" ref={trackRef}>
            {photos.map((b) => (
              <li className="gb-social__slide" key={b.id}>
                <img
                  src={val(b.values, "image")}
                  alt={val(b.values, "caption")}
                  loading="lazy"
                  decoding="async"
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="gb-social__nav gb-social__nav--next"
            onClick={() => nudge(1)}
            aria-label="Next"
          >
            {ArrowRight}
          </button>
        </div>
      </div>
    </section>
  );
}
