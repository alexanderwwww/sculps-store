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
import { formatMoney, savedPercent } from "~/lib/money";
import { SPEC_PENDING } from "~/lib/sections";
import { CartDrawerProvider, useCartDrawer } from "./cart-drawer";

type Vals = Record<string, string>;
const val = (v: Vals, k: string) => (v[k] ?? "").trim();
const has = (v: Vals, ...keys: string[]) => keys.some((k) => val(v, k) !== "");

/** The store's own logo, in R2. Chrome, not content — it never changes per page. */
const LOGO = "/media/3958921693410617.webp";

/* ------------------------------------------------------------------ icons */

const IcoCart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7h12l1 14H5L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
);
const IcoCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
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
        href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
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
    case "video_faq":     return <Faq section={section} />;
    case "social_proof_images": return <ProofWall section={section} />;
    case "product_grid":  return <ProductGrid section={section} />;
    case "trust_icons":   return <TrustBand section={section} />;
    case "three_steps":   return <Steps section={section} />;
    case "benefits":      return <Benefits section={section} />;
    case "features":      return <Features section={section} />;
    case "comparison_table": return <Compare section={section} />;
    case "who_its_for":   return <WhoFor section={section} />;
    case "whats_in_the_box": return <InTheBox section={section} />;
    case "specifications": return <Specs section={section} />;
    case "closing_cta":   return <Closing section={section} page={page} />;
    default:              return null;
  }
}

/* ----------------------------------------------------------------- header */

function Header({ page, storeParam }: { page: LoadedProductPage; storeParam: string }) {
  const drawer = useCartDrawer();
  const href = (p: string) => `${p}${storeParam}`;
  return (
    <>
      <div className="cb-ticker">Free US shipping · 30-day returns · Ships in 3-5 business days</div>
      <header className="cb-header">
        <div className="cb-wrap cb-header__in">
          <a className="cb-logo" href={href("/")} aria-label={page.store.name}>
            <img src={LOGO} alt={page.store.name} />
          </a>
          <nav className="cb-nav">
            <a href="#how">How it works</a>
            <a href="#proof">Real nights</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="cb-header__right">
            <button type="button" className="cb-cart" onClick={() => drawer?.open()} aria-label="Open cart">
              {IcoCart}
              {drawer && drawer.itemCount > 0 ? <span className="cb-cart__n">{drawer.itemCount}</span> : null}
            </button>
          </div>
        </div>
      </header>
    </>
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

          {variants.length > 1 ? (
            <div className="cb-opts" role="radiogroup" aria-label="Choose a bundle">
              {variants.map((x) => {
                const on = x.id === picked;
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className="cb-opt"
                    onClick={() => setPicked(x.id)}
                  >
                    <span className="cb-opt__dot" />
                    <span>
                      <span className="cb-opt__t">{x.label}</span>
                      {x.sublabel ? <span className="cb-opt__s">{x.sublabel}</span> : null}
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

          <button
            type="button"
            className="cb-btn"
            onClick={() => picked && drawer?.add(picked)}
            disabled={!picked}
          >
            {val(v, "ctaLabel") || "Add to cart"}
          </button>
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
          <span key={n}>{line.map((t) => <span key={t}>{t}</span>)}</span>
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
        <div className="cb-wrap">
          <div className="cb-grid cb-grid--4">
            {items.map((b, i) => (
              <div className="cb-card" key={b.id}>
                <div className="cb-card__ico">{TRUST_ICONS[i % TRUST_ICONS.length]}</div>
                <h3 className="cb-h3">{val(b.values, "title")}</h3>
                {has(b.values, "text") ? <p>{val(b.values, "text")}</p> : null}
              </div>
            ))}
          </div>
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
    <section className="cb-section cb-section--lit" id="how">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-steps">
          {items.map((b, i) => (
            <div className="cb-step" key={b.id}>
              <div className="cb-step__n">{i + 1}</div>
              <h3 className="cb-h3">{val(b.values, "title")}</h3>
              {has(b.values, "text") ? <p>{val(b.values, "text")}</p> : null}
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
        <div className="cb-ben">
          {items.map((b) => (
            <article className="cb-ben__it" key={b.id}>
              {has(b.values, "image") ? (
                <div className="cb-ben__pic">
                  <img src={val(b.values, "image")} alt="" loading="lazy" />
                </div>
              ) : null}
              <div className="cb-ben__txt">
                <h3 className="cb-h3">{val(b.values, "title")}</h3>
                {has(b.values, "text") ? <p>{val(b.values, "text")}</p> : null}
              </div>
            </article>
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
    <section className="cb-section cb-section--lit">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-grid cb-grid--3">
          {items.map((b, i) => (
            <div className="cb-card" key={b.id}>
              <div className="cb-card__ico">{FEATURE_ICONS[i % FEATURE_ICONS.length]}</div>
              <h3 className="cb-h3">{val(b.values, "title")}</h3>
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

/* ------------------------------------------------------------ product grid */

function ProductGrid({ section }: { section: LoadedSection }) {
  const items = section.blocks.filter((b) => has(b.values, "title"));
  if (!items.length) return null;
  return (
    <section className="cb-section">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-grid cb-grid--3">
          {items.map((b) => (
            <div className="cb-card" key={b.id} style={{ padding: 0, overflow: "hidden" }}>
              {has(b.values, "image") ? (
                <div className="cb-ben__pic" style={{ aspectRatio: "4 / 3" }}>
                  <img src={val(b.values, "image")} alt="" loading="lazy" />
                </div>
              ) : null}
              <div style={{ padding: "20px 22px 24px" }}>
                <h3 className="cb-h3">{val(b.values, "title")}</h3>
                {has(b.values, "note") ? <p>{val(b.values, "note")}</p> : null}
              </div>
            </div>
          ))}
        </div>
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
    <section className="cb-section cb-section--lit">
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
        <div className="cb-grid cb-grid--4">
          {items.map((b) => (
            <div className="cb-card" key={b.id}>
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
    <section className="cb-section cb-section--lit">
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
              <li key={b.id}>
                {IcoCheck}
                <div>
                  <b>{val(b.values, "title")}</b>
                  {has(b.values, "text") ? <span>{val(b.values, "text")}</span> : null}
                </div>
              </li>
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

/* -------------------------------------------------------------------- faq */

function Faq({ section }: { section: LoadedSection }) {
  const items = section.blocks.filter((b) => has(b.values, "question"));
  if (!items.length) return null;
  return (
    <section className="cb-section cb-section--lit" id="faq">
      <div className="cb-wrap">
        <Head section={section} />
        <div className="cb-faq">
          {items.map((b) => (
            <details key={b.id}>
              <summary>{val(b.values, "question")}</summary>
              <div className="cb-faq__a">{val(b.values, "answer")}</div>
            </details>
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
