/**
 * Ceiling Buddy storefront — store four.
 *
 * Dark by design. Every photograph this store owns was shot in a dark bedroom
 * with the product's own LED as the only warm light, so the page is built
 * around that rather than fighting it with a white background.
 *
 * The rules are the platform's usual two: the fifteen sections are content and
 * come out of `values` / `blocks`; the header, footer and icon set are theme
 * chrome and live here in code. Nothing on this page is invented — a section
 * with no content renders nothing rather than a placeholder.
 */
import { useEffect, useRef, useState } from "react";
import type { LoadedProductPage, LoadedSection } from "~/lib/store.server";
import { formatMoney, savedAmount, savedPercent } from "~/lib/money";
import { SPEC_PENDING } from "~/lib/sections";
import { CartDrawerProvider, useCartDrawer } from "./cart-drawer";
import { embedFor, isOwnVideo } from "./embeds";

type Vals = Record<string, string>;
const val = (v: Vals, k: string) => (v[k] ?? "").trim();
const has = (v: Vals, ...keys: string[]) => keys.some((k) => val(v, k) !== "");

/** The store's own logo, in R2. Chrome, not content — it never changes per page. */
const LOGO = "/media/3958921693410617.webp";
/** The cut-out, on its transparent background — the only shot that can float. */
const HERO = "/media/69a1b0cad0438d42.webp";

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

export function CeilingBuddyStorefront({
  page,
  storeParam = "",
  publishableKey = null,
  paypalClientId = null,
  offer = null,
}: {
  page: LoadedProductPage;
  storeParam?: string;
  publishableKey?: string | null;
  paypalClientId?: string | null;
  /** The live code the bar is shouting about, straight from the database. */
  offer?: { code: string; kind: string; value: number } | null;
}) {
  const { sections } = page;
  const buyBox = sections.find((s) => s.type === "buy_box");
  const firstShot = buyBox?.blocks.find((b) => has(b.values, "image"));
  const photo = firstShot
    ? { src: val(firstShot.values, "image"), alt: val(firstShot.values, "alt") }
    : null;

  return (
    <CartDrawerProvider
      page={page}
      storeParam={storeParam}
      photo={photo}
      paypalClientId={paypalClientId}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap"
      />

      <div className="cb">
        <Header page={page} storeParam={storeParam} offer={offer} />
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
              <Section section={s} page={page} storeParam={storeParam} />
            </div>
          ))}
        </main>
        <Footer page={page} storeParam={storeParam} />
        <StickyBuy page={page} storeParam={storeParam} />
      </div>
    </CartDrawerProvider>
  );
}

function Section({
  section,
  page,
  storeParam,
}: {
  section: LoadedSection;
  page: LoadedProductPage;
  storeParam: string;
}) {
  switch (section.type) {
    case "buy_box":       return <BuyBox section={section} page={page} storeParam={storeParam} />;
    case "video_faq":     return <ProofAndAnswers section={section} page={page} />;
    case "social_proof_images": return <ProofWall section={section} />;
    case "product_grid":  return <LockScreen section={section} />;
    case "trust_icons":   return <TrustBand section={section} />;
    case "three_steps":   return <Steps section={section} />;
    case "benefits":      return <Benefits section={section} />;
    case "features":      return <Features section={section} />;
    case "comparison_table": return <Compare section={section} />;
    case "who_its_for":   return <WhoFor section={section} />;
    case "whats_in_the_box": return <InTheBox section={section} />;
    case "specifications": return <Specs section={section} />;
    case "reviews":       return <><Reviews section={section} page={page} /><PayLater page={page} /></>;
    case "photo_banner":  return <PhotoBanner section={section} page={page} storeParam={storeParam} />;
    case "split_picks":   return <HersHis section={section} />;
    case "closing_cta":   return <Closing section={section} page={page} storeParam={storeParam} />;
    default:              return null;
  }
}

/* ----------------------------------------------------------------- header */

const NAV = [
  ["How it works", "#how"],
  ["Real nights", "#proof"],
  ["Reviews", "#reviews"],
  ["FAQ", "#faq"],
] as const;

function Header({
  page,
  storeParam,
  offer,
}: {
  page: LoadedProductPage;
  storeParam: string;
  offer: { code: string; kind: string; value: number } | null;
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
      <Announce offer={offer} currency={page.store.currency} />
      <header className="cb-header">
        <div className="cb-wrap cb-header__in">
          <a className="cb-logo" href={href("/")} aria-label={page.store.name}>
            <img src={LOGO} alt={page.store.name} />
          </a>
          <nav className="cb-nav">
            {NAV.map(([label, to]) => (
              <a key={to} href={to}>{label}</a>
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
            <img src={LOGO} alt={page.store.name} />
            <button type="button" className="cb-menu__x" onClick={() => setMenu(false)} aria-label="Close menu">
              {IcoClose}
            </button>
          </div>
          {NAV.map(([label, to]) => (
            <a key={to} href={to} onClick={() => setMenu(false)}>{label}</a>
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
}: {
  offer: { code: string; kind: string; value: number } | null;
  currency: string;
}) {
  const amount =
    offer && offer.kind === "fixed"
      ? `${formatMoney(offer.value, currency)} off`
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
  const mark = { key: "mark", logo: true, node: <img src={LOGO} alt="" /> };
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

  const items: { key: string; node: React.ReactNode; pill?: boolean; logo?: boolean }[] = [
    { key: "ship", node: <>{IcoTruck} Free US shipping</> },
    ...(offer && amount ? [pill("code")] : []),
    { ...mark, key: "mark1" },
    { key: "ret", node: <>{IcoReturn} 30 nights to change your mind</> },
    { key: "war", node: <>{IcoShield} 1-year warranty</> },
    ...(offer && amount ? [pill("code2")] : []),
    { ...mark, key: "mark2" },
    { key: "fast", node: <>{IcoBolt} Ships in 3-5 business days</> },
  ];

  return (
    <div
      className="cb-ann"
      aria-label={
        amount
          ? `${amount} with code ${offer!.code}. Free US shipping, 30 nights to change your mind, 1 year warranty.`
          : "Free US shipping, 30 nights to change your mind, 1 year warranty"
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

function BuyBox({ section, page, storeParam = "" }: { section: LoadedSection; page: LoadedProductPage; storeParam?: string }) {
  const v = section.values;
  const drawer = useCartDrawer();
  const shots = section.blocks.filter((b) => has(b.values, "image"));
  const [shot, setShot] = useState(0);
  const variants = page.variants;
  const [picked, setPicked] = useState(
    () => (variants.find((x) => x.isDefault) ?? variants[0])?.id ?? "",
  );
  const chosen = variants.find((x) => x.id === picked) ?? variants[0] ?? null;
  const off = chosen ? savedPercent(chosen.priceCents, chosen.compareAtCents) : null;
  const currency = page.store.currency;
  const main = shots[shot];

  return (
    <section className="cb-buy" id="buy">
      <div className="cb-wrap cb-buy__grid">
        <div className="cb-gal">
          <div className="cb-gal__main">
            {main ? (
              <img
                src={val(main.values, "image")}
                alt={val(main.values, "alt") || page.product.title}
              />
            ) : null}
            <div className="cb-gal__glow" />
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
                  onClick={() => setShot(i)}
                >
                  <img src={val(b.values, "image")} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          {has(v, "badge") ? <div className="cb-badge">{val(v, "badge")}</div> : null}
          <h1 className="cb-h1">{val(v, "heading") || page.product.title}</h1>
          {has(v, "subheading") ? <p className="cb-lede">{val(v, "subheading")}</p> : null}

          {chosen ? (
            <div className="cb-price">
              <span className="cb-price__now">{formatMoney(chosen.priceCents, currency)}</span>
              {chosen.compareAtCents ? (
                <s className="cb-price__was">{formatMoney(chosen.compareAtCents, currency)}</s>
              ) : null}
              {off ? <span className="cb-price__off">Save {off}%</span> : null}
            </div>
          ) : null}
          {chosen && savedAmount(chosen.priceCents, chosen.compareAtCents) ? (
            <div className="cb-price__save">
              {IcoTag}
              You save {formatMoney(savedAmount(chosen.priceCents, chosen.compareAtCents)!, currency)}
            </div>
          ) : null}

          {variants.length > 1 ? (
            <div className="cb-opts" role="radiogroup" aria-label="Choose a bundle">
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
                    : x.isDefault && variants.length > 1
                      ? ["pop", "Most popular"] as const
                      : null;
                const off = savedPercent(x.priceCents, x.compareAtCents);
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`cb-opt${flag ? " cb-opt--flagged" : ""}`}
                    onClick={() => setPicked(x.id)}
                  >
                    {flag ? <span className={`cb-opt__flag cb-opt__flag--${flag[0]}`}>{flag[1]}</span> : null}
                    <span className="cb-opt__dot" />
                    {/* What this option actually is. The bundles differ by what
                        is in the box, and a line of text is a poor way to say
                        that when a picture can. */}
                    {x.imageUrl ? (
                      <span className="cb-opt__pic">
                        <img src={x.imageUrl} alt="" loading="lazy" />
                      </span>
                    ) : null}
                    <span>
                      <span className="cb-opt__t">{x.label}</span>
                      {x.sublabel ? <span className="cb-opt__s">{x.sublabel}</span> : null}
                      {savedAmount(x.priceCents, x.compareAtCents) ? (
                        <span className="cb-opt__save">
                          Save {formatMoney(savedAmount(x.priceCents, x.compareAtCents)!, currency)}
                        </span>
                      ) : null}
                    </span>
                    <span className="cb-opt__p">
                      <b>{formatMoney(x.priceCents, currency)}</b>
                      {x.compareAtCents ? <s>{formatMoney(x.compareAtCents, currency)}</s> : null}
                    </span>
                  </button>
                );
              })}
            </div>
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
              <button type="submit" className="cb-btn" disabled={!picked}>
                {val(v, "ctaLabel") || "Add to cart"}
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
          {chosen ? (
            <div className="cb-pay4__line">
              {IcoPaypal}
              or 4 payments of <b>{formatMoney(Math.round(chosen.priceCents / 4), currency)}</b>
            </div>
          ) : null}
          {has(v, "reassurance") ? <div className="cb-reassure">{val(v, "reassurance")}</div> : null}

          <div className="cb-ship">
            <span>{IcoTruck} Free US shipping</span>
            <span>{IcoReturn} 30-day returns</span>
            <span>{IcoShield} 1-year warranty</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- marquee */
/* Theme chrome: the three promises, repeated. Not a section — it is the strip
   that separates the buy box from the rest of the page. */

function Marquee() {
  const line = ["Watch lying down", "Snacks included, sort of", "Your ceiling is free", "Works outside too"];
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

function TrustBand({ section }: { section: LoadedSection }) {
  const items = section.blocks.filter((b) => has(b.values, "title"));
  if (!items.length) return null;
  return (
    <>
      <Marquee />
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
        <ol className="cb-steps">
          {items.map((b, i) => (
            <li className="cb-step" key={b.id} style={{ ["--i" as string]: i }}>
              <span className="cb-step__n">{i + 1}</span>
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

function Features({ section }: { section: LoadedSection }) {
  const items = section.blocks.filter((b) => has(b.values, "title"));
  if (!items.length) return null;
  // A grid of numbered lines on black. Chips read as filler; a list someone
  // bothered to number reads as a spec.
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

/* ------------------------------------------------------------- proof wall */

function ProofWall({ section }: { section: LoadedSection }) {
  const shot = section.blocks.find((b) => has(b.values, "image"));
  if (!shot) return null;
  // One photograph, edge to edge, nothing written on it. Six of them read as a
  // contact sheet; one reads as the night.
  return (
    <section className="cb-night" id="proof">
      <img src={val(shot.values, "image")} alt={val(shot.values, "caption")} loading="lazy" />
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
function LockScreen({ section }: { section: LoadedSection }) {
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

  return (
    <>
      {art ? (
        <section className="cb-lock cb-lock--art">
          <img src={art} alt={alt} />
        </section>
      ) : null}

    <section className={`cb-lock${art ? " cb-lock--small" : ""}`}>
      <div className="cb-lock__in">
        <div className="cb-lock__clock">
          {has(v, "subheading") ? <span>{val(v, "subheading")}</span> : null}
          <time>9:27</time>
        </div>

        <div className="cb-lock__notif">
          <img src={LOGO} alt="" />
          <div>
            <b>Ceiling Buddy<i>now</i></b>
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

        <figure className="cb-lock__hero">
          <img src={HERO} alt="" />
        </figure>

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
  return (
    <section className="cb-section cb-section--sky">
      <div className="cb-wrap cb-box">
        {has(v, "image") ? (
          <div className="cb-box__pic">
            <img src={val(v, "image")} alt="" loading="lazy" />
          </div>
        ) : null}
        <div>
          <h2 className="cb-h2">{val(v, "heading")}</h2>
          {has(v, "subheading") ? <p className="cb-lede">{val(v, "subheading")}</p> : null}
          <ul>
            {items.map((b) => (
              <li key={b.id}>{IcoCheck}{val(b.values, "title")}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ specs */

function Specs({ section }: { section: LoadedSection }) {
  const rows = section.blocks.filter((b) => has(b.values, "label"));
  if (!rows.length) return null;
  return (
    <section className="cb-section">
      <div className="cb-wrap">
        <Head section={section} />
        <dl className="cb-specs">
          {rows.map((b) => {
            const value = val(b.values, "value");
            return (
              <div className="cb-spec" key={b.id}>
                <dt>{val(b.values, "label")}</dt>
                <dd className={value ? undefined : "is-pending"}>{value || SPEC_PENDING}</dd>
              </div>
            );
          })}
        </dl>
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
          <h2 className="cb-h2">See it working</h2>
          <p className="cb-lede">Shot on a phone, in a real bedroom, with the lights off.</p>
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

        {asked.length ? <Chat blocks={asked} email={page.store.contactEmail} /> : null}
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

function PayLater({ page }: { page: LoadedProductPage }) {
  const buy = page.variants.find((v) => v.isDefault) ?? page.variants[0] ?? null;
  if (!buy) return null;
  const each = Math.round(buy.priceCents / 4);
  return (
    <section className="cb-pay4">
      <div className="cb-wrap cb-pay4__in">
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
/**
 * The answers, as the conversation people actually have before they buy.
 *
 * It plays rather than sits there: as the thread scrolls into view the
 * messages arrive one at a time, with our side pausing on a typing indicator
 * first. That pause is the whole trick — a message that appears while you are
 * looking at it gets read, and someone who reads all six has answered every
 * objection they had without being sold to.
 *
 * Every message is in the markup from the first render, so this costs nothing
 * in SEO and nothing to a reader who never sees the animation. Anyone who has
 * asked for less motion gets the finished thread immediately.
 */
function Chat({ blocks, email }: { blocks: LoadedSection["blocks"]; email: string | null }) {
  // How many messages have landed. Two per exchange: theirs, then ours.
  const total = blocks.length * 2;

  // The server renders the whole thread, so it is in the HTML for a reader with
  // no JavaScript and for a crawler. The browser's first render has to match
  // that markup exactly or React throws away the whole tree and rebuilds it —
  // which cost us working buttons. So the thread starts full here too, and the
  // effect below empties it and plays it back once hydration is done.
  const [shown, setShown] = useState(total);
  const [typing, setTyping] = useState(false);
  const thread = useRef<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);

  // The card is a fixed height now, so a message arriving below the fold would
  // never be seen. Follow it down — but only the card, never the page.
  // Follow the thread down when a message lands — but not while the dots are
  // showing, and never once the reader has scrolled up to re-read something.
  // Being yanked back to a typing indicator is the annoying part.
  const stick = useRef(true);
  const onScroll = () => {
    const el = body.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.clientHeight - el.scrollTop < 48;
  };
  useEffect(() => {
    const el = body.current;
    if (!el || shown === 0 || !stick.current) return;
    const overflow = el.scrollHeight - el.clientHeight;
    if (overflow <= 0) return;
    el.scrollTo({ top: overflow, behavior: shown <= 1 ? "auto" : "smooth" });
  }, [shown]);

  useEffect(() => {
    const node = thread.current;
    if (!node) return;
    // Anyone who has asked for less motion, or whose browser has no observer to
    // start the thread with, keeps the finished conversation.
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    setShown(0);

    // One scheduler, one timer handle, one cancelled flag. The earlier version
    // chained timeouts and kept its own counter, which meant a second run of
    // this effect — a remount, a fast scroll away and back — could leave an
    // orphaned chain still calling setState against a stale count. Nothing here
    // survives cleanup.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = (ms: number, then: () => void) => {
      timer = setTimeout(() => { if (!cancelled) then(); }, ms);
    };

    const play = (step: number) => {
      if (cancelled || step >= total) { setTyping(false); return; }
      const ours = step % 2 === 1;
      if (ours) {
        setTyping(true);
        // Longer replies take longer to type, within reason. A fixed pause on
        // a two-line answer reads as a loading spinner rather than a person.
        const block = blocks[(step - 1) / 2];
        const words = (block?.values.answer ?? "").length;
        const sendsPhoto = Boolean((block?.values.image ?? "").trim());
        wait(Math.min(1600, 600 + words * 8 + (sendsPhoto ? 350 : 0)), () => {
          setTyping(false);
          setShown(step + 1);
          wait(480, () => play(step + 1));
        });
      } else {
        setShown(step + 1);
        wait(700, () => play(step + 1));
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        wait(350, () => play(0));
      },
      // A third of the phone showing is enough to have started reading it.
      { threshold: 0.33 },
    );
    io.observe(node);

    return () => {
      cancelled = true;
      io.disconnect();
      clearTimeout(timer);
    };
  }, [total, blocks]);

  // Times run backwards from "now" so the thread always reads as last night.
  const at = (i: number) => {
    const start = 23 * 60 + 4;
    const m = (start + i * 3) % (24 * 60);
    const h = Math.floor(m / 60);
    return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  };

  return (
    <div className="cb-chat" id="faq" ref={thread}>
      {/* The status bar and the contact header, so the frame reads as the
          phone someone actually asked this on rather than a widget. */}
      <div className="cb-chat__status">
        <span>9:41</span>
        <span className="cb-chat__icons">
          <svg viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="7" width="3" height="5" rx="1" /><rect x="5" y="5" width="3" height="7" rx="1" /><rect x="10" y="2.5" width="3" height="9.5" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
          <svg viewBox="0 0 16 12" aria-hidden="true"><path d="M8 10.6l2.2-2.3a3.1 3.1 0 0 0-4.4 0zM8 6.2a5.9 5.9 0 0 1 4.2 1.8l1.6-1.7a8.2 8.2 0 0 0-11.6 0l1.6 1.7A5.9 5.9 0 0 1 8 6.2z" /></svg>
          <svg viewBox="0 0 26 12" aria-hidden="true"><rect x="0.5" y="0.5" width="21" height="11" rx="3.2" fill="none" stroke="currentColor" opacity=".45" /><rect x="2" y="2" width="16" height="8" rx="2" /><path d="M23 4v4a2 2 0 0 0 0-4z" opacity=".45" /></svg>
        </span>
      </div>

      <div className="cb-chat__head">
        <img className="cb-chat__av cb-chat__av--lg" src={LOGO} alt="" />
        <div className="cb-chat__name">Ceiling Buddy</div>
      </div>

      <div className="cb-chat__body" ref={body} onScroll={onScroll}>
      <div className="cb-chat__day">Last night <b>11:04 PM</b></div>

      {blocks.map((b, i) => {
        const askedYet = shown > i * 2;
        const answered = shown > i * 2 + 1;
        if (!askedYet) return null;
        return (
        <div className="cb-chat__pair" key={b.id}>
          <p className="cb-chat__q" data-in="">
            {val(b.values, "question")}
          </p>
          {answered ? (
          <div className="cb-chat__a" data-in="">
            <img className="cb-chat__av" src={LOGO} alt="" />
            <div>
              <p>{val(b.values, "answer")}</p>
              {/* The photograph is the answer; the words above it are the nod
                  before it. Sent as its own bubble, the way a picture arrives
                  in a real thread. */}
              {has(b.values, "image") ? (
                <figure className="cb-chat__photo">
                  <img src={val(b.values, "image")} alt="" loading="lazy" />
                </figure>
              ) : null}
              <span className="cb-chat__time">{at(i)}</span>
            </div>
          </div>
          ) : null}
        </div>
        );
      })}

      {typing ? (
        <div className="cb-chat__typing" aria-hidden="true">
          <img className="cb-chat__av" src={LOGO} alt="" />
          <span><i /><i /><i /></span>
        </div>
      ) : null}

      </div>

      {/* The compose bar. It is not a form — there is nothing to send to — but
          without it the screen is obviously not a phone. */}
      <div className="cb-chat__foot">
        <span className="cb-chat__field">
          {email ? <a href={`mailto:${email}`}>Ask us anything…</a> : "Ask us anything…"}
        </span>
        <span className="cb-chat__send" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
        </span>
      </div>
    </div>
  );
}

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
function SocialCard({ r }: { r: LoadedProductPage["reviews"][number] }) {
  const when = sinceText(r.reviewedOn);
  const val = (x: string | null) => (x ?? "").trim();

  if (r.channel === "notification") {
    return (
      <article className="cb-card cb-card--notif">
        <img className="cb-card__app" src={LOGO} alt="" />
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
            <img src={r.imageUrl} alt="" loading="lazy" />
          </div>
        ) : null}
        <div className="cb-card__acts">{IcoHeart}{IcoComment}{IcoSend}</div>
        {r.likes != null ? <div className="cb-card__likes">{r.likes.toLocaleString()} likes</div> : null}
        <p className="cb-card__cap"><b>{r.name}</b> {r.body}</p>
        {r.replies != null ? (
          <div className="cb-card__more">View all {r.replies} comments</div>
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
      <p className="cb-card__body">{r.body}</p>
      {r.imageUrl ? (
        <div className="cb-card__pic">
          <img src={r.imageUrl} alt="" loading="lazy" />
        </div>
      ) : null}
      <footer>
        {r.likes != null ? (
          <span className="cb-card__react">
            <span className="cb-card__marks">{IcoThumb}{IcoHeartFill}{IcoCareFill}</span>
            {r.likes.toLocaleString()}
          </span>
        ) : null}
        {r.replies != null ? <span className="cb-card__when">{r.replies} comments</span> : null}
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

function Reviews({ section, page }: { section: LoadedSection; page: LoadedProductPage }) {
  const rows = page.reviews;
  if (!rows.length) return null;
  // Only the starred reviews count toward the score. A shipping notification
  // and an Instagram post carry no rating, and averaging their zeros in would
  // print a number that is simply false.
  const rated = rows.filter((r) => r.rating > 0);
  const mean = rated.length ? rated.reduce((n, r) => n + r.rating, 0) / rated.length : 0;
  return (
    <section className="cb-revs-s" id="reviews">
      <div className="cb-wrap">
        <div className="cb-revs__head">
          {rated.length ? <span className="cb-revs__score">{mean.toFixed(1)}</span> : null}
          {rated.length ? (
            <span className="cb-revs__stars" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((n) => (
                <span key={n} style={{ opacity: n < Math.round(mean) ? 1 : 0.28 }}>{IcoStar}</span>
              ))}
            </span>
          ) : null}
          <span className="cb-revs__of">
            {rated.length} {rated.length === 1 ? "review" : "reviews"}
          </span>
        </div>
      </div>

      {/* Columns, drifting vertically, alternate directions.
          Moving sideways, a short notification beside a tall Instagram post
          leaves ragged holes at every height change. Stacked in columns the
          cards pack tight against each other and the difference in size stops
          being a gap and starts being texture. Each column is printed twice so
          its loop has no seam; the copy is hidden from screen readers. */}
      <div className="cb-wallgrid">
        {[0, 1, 2].map((col) => (
          <div className="cb-wallcol" data-col={col} key={col}>
            {[0, 1].map((pass) => (
              <div className="cb-wallcol__pass" key={pass} aria-hidden={pass === 1 ? true : undefined}>
                {rows.filter((_, i) => i % 3 === col).map((r) => (
                  <SocialCard key={`${pass}-${r.id}`} r={r} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}



/* ---------------------------------------------------------------- closing */

function Closing({ section, page, storeParam = "" }: { section: LoadedSection; page: LoadedProductPage; storeParam?: string }) {
  const v = section.values;
  const drawer = useCartDrawer();
  const buy = page.variants.find((x) => x.isDefault) ?? page.variants[0] ?? null;
  if (!has(v, "heading")) return null;
  return (
    <section className="cb-section cb-close">
      <div className="cb-wrap cb-close__in">
        <img src={LOGO} alt="" />
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

/* --------------------------------------------------------------- sticky */

function StickyBuy({ page, storeParam = "" }: { page: LoadedProductPage; storeParam?: string }) {
  const drawer = useCartDrawer();
  const [on, setOn] = useState(false);
  const seen = useRef(false);
  const buy = page.variants.find((x) => x.isDefault) ?? page.variants[0] ?? null;

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
  return (
    <div className={`cb-sticky${on ? " is-on" : ""}`}>
      <div className="cb-wrap cb-sticky__in">
        <div>
          <div className="cb-sticky__t">{page.product.title}</div>
          <div className="cb-sticky__p">
            {formatMoney(buy.priceCents, page.store.currency)}
            {buy.compareAtCents ? <s style={{ marginLeft: 8, opacity: 0.6 }}>{formatMoney(buy.compareAtCents, page.store.currency)}</s> : null}
          </div>
        </div>
        <form
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
  const buy = page.variants.find((x) => x.isDefault) ?? page.variants[0] ?? null;
  return (
    <>
      {/* One last offer, made properly, before the small print. */}
      <section className="cb-last">
        <div className="cb-wrap cb-last__in">
          <img className="cb-last__logo" src={LOGO} alt="" />
          <h2 className="cb-h2">Your ceiling is the biggest screen you own</h2>
          {buy ? (
            <form
              method="post"
              action={`/cart/add${storeParam}`}
              onSubmit={(e) => { if (drawer) { e.preventDefault(); drawer.add(buy.id); } }}
            >
              <input type="hidden" name="variantId" value={buy.id} />
              <button type="submit" className="cb-btn">
                Get Ceiling Buddy — {formatMoney(buy.priceCents, page.store.currency)}
              </button>
            </form>
          ) : null}
          <ul className="cb-last__trust">
            <li>{IcoTruck}<b>Free</b> US shipping</li>
            <li>{IcoReturn}<b>30 nights</b> to change your mind</li>
            <li>{IcoShield}<b>1 year</b> warranty</li>
          </ul>
        </div>
      </section>

      <footer className="cb-footer">
        <div className="cb-wrap cb-footer__cols">
          <div className="cb-footer__brand">
            <img src={LOGO} alt={page.store.name} />
            <p>A tray, a projector and a strip of warm light. Made for people who watch
            lying down.</p>
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
              <li><a href={href("/")}>Ceiling Buddy</a></li>
              <li><a href="#how">How it works</a></li>
              <li><a href="#reviews">Reviews</a></li>
              <li><a href="#faq">Questions</a></li>
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
          <span>Free US shipping · 30-night returns · 1-year warranty</span>
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
