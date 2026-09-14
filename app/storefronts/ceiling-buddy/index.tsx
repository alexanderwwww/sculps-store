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
}: {
  page: LoadedProductPage;
  storeParam?: string;
}) {
  const { sections } = page;
  const buyBox = sections.find((s) => s.type === "buy_box");
  const firstShot = buyBox?.blocks.find((b) => has(b.values, "image"));
  const photo = firstShot
    ? { src: val(firstShot.values, "image"), alt: val(firstShot.values, "alt") }
    : null;

  return (
    <CartDrawerProvider page={page} storeParam={storeParam} photo={photo}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap"
      />

      <div className="cb">
        <Header page={page} storeParam={storeParam} />
        <main id="MainContent" role="main">
          {sections.map((s) => (
            <Section key={s.id} section={s} page={page} storeParam={storeParam} />
          ))}
        </main>
        <Footer page={page} storeParam={storeParam} />
        <StickyBuy page={page} />
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
    case "buy_box":       return <BuyBox section={section} page={page} />;
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
    case "reviews":       return <Reviews section={section} page={page} />;
    case "closing_cta":   return <Closing section={section} page={page} />;
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

function Header({ page, storeParam }: { page: LoadedProductPage; storeParam: string }) {
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
      <Announce />
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

function Announce() {
  const says = [
    [IcoTruck, "Free US shipping"],
    [IcoReturn, "30 days to change your mind"],
    [IcoShield, "1-year warranty"],
    [IcoBolt, "Ships in 3-5 business days"],
  ] as const;
  return (
    <div className="cb-ann" aria-label="Free US shipping, 30 day returns, 1 year warranty">
      <div className="cb-ann__t" aria-hidden="true">
        {[0, 1].map((n) => (
          <span key={n}>
            {says.map(([ico, text]) => (
              <i key={text}>{ico}{text}</i>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- buy box */

function BuyBox({ section, page }: { section: LoadedSection; page: LoadedProductPage }) {
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
            <button
              type="button"
              className="cb-btn"
              onClick={() => picked && drawer?.add(picked)}
              disabled={!picked}
            >
              {val(v, "ctaLabel") || "Add to cart"}
            </button>
            {/* Straight to the checkout with this bundle and nothing else.
                `replace=1` clears whatever was in the cart, so the wallet sheet
                shows the price the customer was just looking at. */}
            <form method="post" action={`/cart/add?next=checkout&replace=1`}>
              <input type="hidden" name="variantId" value={picked} />
              <button type="submit" className="cb-btn cb-btn--ghost" disabled={!picked}>
                Buy now
              </button>
            </form>
          </div>
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
      <section className="cb-section cb-section--tight">
        <div className="cb-wrap cb-chips">
          {items.map((b, i) => (
            <span className="cb-chip" key={b.id}>
              {TRUST_ICONS[i % TRUST_ICONS.length]}
              {val(b.values, "title")}
            </span>
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
    <section className="cb-section cb-section--cream" id="how">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-steps">
          {items.map((b, i) => (
            <div className="cb-step" key={b.id}>
              <div className="cb-step__n">{i + 1}</div>
              <h3 className="cb-h3">{val(b.values, "title")}</h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- benefits */

function Benefits({ section }: { section: LoadedSection }) {
  const items = section.blocks.filter((b) => has(b.values, "title"));
  if (!items.length) return null;
  return (
    <section className="cb-section">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-tiles">
          {items.map((b) => (
            <figure className="cb-tile" key={b.id}>
              {has(b.values, "image") ? <img src={val(b.values, "image")} alt="" loading="lazy" /> : null}
              <figcaption>{val(b.values, "title")}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- features */

function Features({ section }: { section: LoadedSection }) {
  const items = section.blocks.filter((b) => has(b.values, "title"));
  if (!items.length) return null;
  return (
    <section className="cb-section cb-section--sky">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-chips">
          {items.map((b, i) => (
            <span className="cb-chip" key={b.id}>
              {FEATURE_ICONS[i % FEATURE_ICONS.length]}
              {val(b.values, "title")}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- proof wall */

function ProofWall({ section }: { section: LoadedSection }) {
  const shots = section.blocks.filter((b) => has(b.values, "image"));
  if (!shots.length) return null;
  return (
    <section className="cb-section" id="proof">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-wall">
          {shots.map((b) => (
            <figure className="cb-wall__i" key={b.id}>
              <img src={val(b.values, "image")} alt={val(b.values, "caption")} loading="lazy" />
            </figure>
          ))}
        </div>
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
function LockScreen({ section }: { section: LoadedSection }) {
  const v = section.values;
  const rows = section.blocks.filter((b) => has(b.values, "title"));
  const lines = val(v, "heading").split(String.fromCharCode(10)).filter(Boolean);
  const texts = rows.filter((b) => !val(b.values, "note").startsWith("story"));
  const stories = rows.filter((b) => val(b.values, "note").startsWith("story"));
  if (!rows.length) return null;

  const side = (b: (typeof rows)[number]) => val(b.values, "note").split(" ")[0];
  const when = (b: (typeof rows)[number]) => val(b.values, "note").split(" ").slice(1).join(" ");

  return (
    <section className="cb-lock">
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
  );
}

/* -------------------------------------------------------------- comparison */

function Compare({ section }: { section: LoadedSection }) {
  const rows = section.blocks.filter((b) => has(b.values, "label"));
  if (!rows.length) return null;
  const v = section.values;
  return (
    <section className="cb-section">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-cmp">
          <div className="cb-cmp__row cb-cmp__row--h">
            <div className="cb-cmp__l" />
            <div className="cb-cmp__us">{val(v, "usLabel") || "Us"}</div>
            <div className="cb-cmp__them">{val(v, "themLabel") || "Them"}</div>
          </div>
          {rows.map((b) => (
            <div className="cb-cmp__row" key={b.id}>
              <div className="cb-cmp__l">{val(b.values, "label")}</div>
              <div className="cb-cmp__us">{IcoCheck}{val(b.values, "us")}</div>
              <div className="cb-cmp__them">{IcoCross}{val(b.values, "them")}</div>
            </div>
          ))}
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
    <section className="cb-section">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-chips">
          {items.map((b) => (
            <span className="cb-chip" key={b.id}>{val(b.values, "title")}</span>
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

  const proof = page.sections.find((x) => x.type === "social_proof_images");
  const shots = (proof?.blocks ?? []).filter((b) => has(b.values, "image"));

  const post = posts[0] ?? null;
  const video = own[0] ?? null;
  const shot = shots[0] ?? null;
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
  // no JavaScript and for a crawler. The browser starts it empty instead — and
  // decides that on the very first render rather than in an effect, because
  // emptying it afterwards paints every message for one frame and then
  // swallows them, which looks like a bug.
  const [shown, setShown] = useState(() => {
    if (typeof document === "undefined") return total;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? total : 0;
  });
  const [typing, setTyping] = useState(false);
  const thread = useRef<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);

  // The card is a fixed height now, so a message arriving below the fold would
  // never be seen. Follow it down — but only the card, never the page.
  useEffect(() => {
    const el = body.current;
    if (!el || shown === 0) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [shown, typing]);

  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm || !thread.current) return;

    let timer: ReturnType<typeof setTimeout>;
    let step = 0;

    const advance = () => {
      if (step >= total) { setTyping(false); return; }
      const ours = step % 2 === 1;
      // Our replies pause on the dots first; theirs land straight away, the
      // way a question you already typed does.
      if (ours) {
        setTyping(true);
        timer = setTimeout(() => {
          setTyping(false);
          setShown((n) => n + 1);
          step += 1;
          timer = setTimeout(advance, 420);
        }, 900);
      } else {
        setShown((n) => n + 1);
        step += 1;
        timer = setTimeout(advance, 620);
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        timer = setTimeout(advance, 300);
      },
      { threshold: 0.25 },
    );
    io.observe(thread.current);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [total]);

  // Times run backwards from "now" so the thread always reads as last night.
  const at = (i: number) => {
    const start = 23 * 60 + 4;
    const m = (start + i * 3) % (24 * 60);
    const h = Math.floor(m / 60);
    return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  };

  return (
    <div className="cb-chat" id="faq" ref={thread} suppressHydrationWarning>
      <div className="cb-chat__head">
        <img className="cb-chat__av cb-chat__av--lg" src={LOGO} alt="" />
        <div>
          <div className="cb-chat__name">Ceiling Buddy</div>
          <div className="cb-chat__live"><i />Usually replies in a few minutes</div>
        </div>
      </div>

      <div className="cb-chat__body" ref={body}>
      <div className="cb-chat__day">Last night</div>

      {blocks.map((b, i) => (
        <div className="cb-chat__pair" key={b.id}>
          <p className="cb-chat__q" data-in={shown > i * 2 ? "" : undefined}>
            {val(b.values, "question")}
          </p>
          <div className="cb-chat__a" data-in={shown > i * 2 + 1 ? "" : undefined}>
            <img className="cb-chat__av" src={LOGO} alt="" />
            <div>
              <p>{val(b.values, "answer")}</p>
              <span className="cb-chat__time">{at(i)}</span>
            </div>
          </div>
        </div>
      ))}

      {typing ? (
        <div className="cb-chat__typing" aria-hidden="true">
          <img className="cb-chat__av" src={LOGO} alt="" />
          <span><i /><i /><i /></span>
        </div>
      ) : null}
      </div>

      <div className="cb-chat__foot">
        {email ? <a href={`mailto:${email}`}>Ask us anything</a> : "Ask us anything"} — a real
        person answers, same day. 🤍
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
function Reviews({ section, page }: { section: LoadedSection; page: LoadedProductPage }) {
  const rows = page.reviews;
  if (!rows.length) return null;
  const mean = rows.reduce((n, r) => n + r.rating, 0) / rows.length;
  return (
    <section className="cb-section" id="reviews">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-revs__head">
          <span className="cb-revs__score">{mean.toFixed(1)}</span>
          <span className="cb-rev__stars" style={{ padding: 0 }}>
            {[0, 1, 2, 3, 4].map((n) => (
              <span key={n} style={{ opacity: n < Math.round(mean) ? 1 : 0.25 }}>{IcoStar}</span>
            ))}
          </span>
          <span className="cb-revs__of">
            {rows.length} {rows.length === 1 ? "review" : "reviews"}
          </span>
        </div>
        <div className="cb-revs">
          {rows.map((r) => (
            <article className="cb-rev" key={r.id}>
              <div className="cb-rev__top">
                <div className="cb-rev__av">{r.name.trim().charAt(0).toUpperCase()}</div>
                <div>
                  <div className="cb-rev__who">{r.name}</div>
                  <div className="cb-rev__meta">
                    {r.verified ? <>{IcoVerified} Verified buyer</> : <span>{r.country ?? ""}</span>}
                  </div>
                </div>
              </div>
              <div className="cb-rev__stars">
                {[0, 1, 2, 3, 4].map((n) => (
                  <span key={n} style={{ opacity: n < r.rating ? 1 : 0.22 }}>{IcoStar}</span>
                ))}
              </div>
              <div className="cb-rev__body">
                {r.title ? <b>{r.title}</b> : null}
                {r.body}
              </div>
              {r.imageUrl ? (
                <div className="cb-rev__pic">
                  <img src={r.imageUrl} alt="" loading="lazy" />
                </div>
              ) : null}
              <div className="cb-rev__bar">
                <span>{IcoLike} Helpful</span>
                <span>{IcoComment} Reply</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}



/* ---------------------------------------------------------------- closing */

function Closing({ section, page }: { section: LoadedSection; page: LoadedProductPage }) {
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
          <button type="button" className="cb-btn" onClick={() => drawer?.add(buy.id)}>
            {val(v, "ctaLabel") || "Add to cart"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- sticky */

function StickyBuy({ page }: { page: LoadedProductPage }) {
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
        <button type="button" className="cb-btn" onClick={() => drawer?.add(buy.id)}>
          Add to cart
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- footer */

function Footer({ page, storeParam }: { page: LoadedProductPage; storeParam: string }) {
  const href = (p: string) => `${p}${storeParam}`;
  const year = 2026;
  return (
    <footer className="cb-footer">
      <div className="cb-wrap">
        <div className="cb-footer__top">
          <a href={href("/")} aria-label={page.store.name}>
            <img src={LOGO} alt={page.store.name} />
          </a>
          <nav className="cb-footer__links">
            {page.nav.footer.map((l) => (
              <a key={l.href} href={`${l.href}${storeParam}`}>{l.label}</a>
            ))}
            {page.store.contactEmail ? (
              <a href={`mailto:${page.store.contactEmail}`}>Contact</a>
            ) : null}
          </nav>
        </div>
        <div className="cb-footer__bar">
          <span>© {year} {page.store.name}</span>
          <span>Free US shipping · 30-day returns</span>
        </div>
      </div>
    </footer>
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
