/**
 * bodies — the storefront.
 *
 * Built against the Experiment Beauty reference, section for section: a thin
 * neon announcement bar, a headline laid over a photograph, four product cards
 * floating on discs of their own colour with no border, a split editorial, a
 * workout grid, a saturated band, social proof, an email card over a photo, and
 * the wordmark oversized at the bottom as a signature.
 *
 * The discipline is what makes it work, not the colour: one accent does every
 * button on the site, and no two saturated sections touch.
 *
 * Images live in R2 and are named here because this product's gallery is not in
 * the database yet. Prices, colourways and stock all come from the variants.
 */
import { useState } from "react";
import type { LoadedProductPage, VariantRow, NavLink } from "~/lib/store.server";
import { formatMoney } from "~/lib/money";
import { CartDrawerProvider, useCartDrawer } from "./cart-drawer";

const M = "/media";

/** What each colourway looks like, keyed by the variant label. */
export const WAYS: Record<string, { disc: string; ink: string; card: string; hero: string; life: string[] }> = {
  "Icy Swan": {
    disc: "#D6E9F6", ink: "#2E5570",
    card: `${M}/bd-card-swan.png`, hero: `${M}/bd-hero-swan.png`,
    life: [`${M}/bd-c-swan-latina.png`, `${M}/bd-e-swan-night.png`, `${M}/bd-b-swan-socks.png`, `${M}/bd-d-swan-underbed.png`],
  },
  "Lilac Heat": {
    disc: "#EEDCF5", ink: "#4A2357",
    card: `${M}/bd-card-lilac.png`, hero: `${M}/bd-hero-lilac.png`,
    life: [`${M}/bd-a-lilac-top.png`, `${M}/bd-c-lilac-mirror2.png`, `${M}/bd-d-lilac-socks.png`, `${M}/bd-d-lilac-screen.png`],
  },
  Matcha: {
    disc: "#D8EDC4", ink: "#1E4636",
    card: `${M}/bd-card-matcha.png`, hero: `${M}/bd-hero-matcha.png`,
    life: [`${M}/bd-c-matcha-black.png`, `${M}/bd-d-matcha-stretch.png`, `${M}/bd-e-matcha-backlit.png`, `${M}/bd-b-matcha-carry.png`],
  },
  Bare: {
    disc: "#F0E9DE", ink: "#4A4034",
    card: `${M}/bd-card-bare.png`, hero: `${M}/bd-hero-bare.png`,
    life: [`${M}/bd-d-bare-rest.png`, `${M}/bd-c-bare-latina.png`, `${M}/bd-f-bare-fold.png`, `${M}/bd-d-bare-hallway.png`],
  },
};
const fallbackWay = { disc: "#EFEFEF", ink: "#0E0F12", card: "", hero: "", life: [] as string[] };
export const wayOf = (label: string) => WAYS[label] ?? fallbackWay;

const MOVES = [
  { name: "Pilates", src: `${M}/bd-a-lilac-top.png` },
  { name: "Sculpt", src: `${M}/bd-c-matcha-black.png` },
  { name: "Core", src: `${M}/bd-c-lilac-core.png` },
  { name: "Stretch", src: `${M}/bd-d-matcha-stretch.png` },
];

const REVIEWS = [
  { src: `${M}/bd-c-lilac-mirror2.png`, text: "I cancelled my studio membership in week three. It paid for itself before spring.", who: "Camila R." },
  { src: `${M}/bd-d-bare-rest.png`, text: "It lives under my bed and comes out every morning. That is the whole reason I actually use it.", who: "Nia W." },
  { src: `${M}/bd-c-swan-latina.png`, text: "Twenty minutes before work. No commute, no booking, no one watching me.", who: "Sofia M." },
  { src: `${M}/bd-e-friends-soft.png`, text: "My flatmate ordered one the week after she tried mine.", who: "Jess T." },
];

/* --------------------------------------------------------------- chrome */

export type Chrome = Pick<LoadedProductPage, "store" | "nav">;

const ANN = (
  <>
    <li>Free shipping worldwide</li>
    <li>A stronger, happier you at home</li>
    <li>Four colourways</li>
    <li>Pay in 4 with PayPal</li>
  </>
);

export function Head({ page, storeParam = "" }: { page: Chrome; storeParam?: string }) {
  const href = (p: string) => `${p}${storeParam}`;
  const drawer = useCartDrawer();
  const links: NavLink[] = page.nav.main.length
    ? page.nav.main
    : [
        { label: "Shop", href: "/#shop" },
        { label: "How it works", href: "/#how" },
        { label: "Workouts", href: "/#workouts" },
        { label: "Our story", href: "/#story" },
      ];

  return (
    <>
      {/* The run is printed twice and the track slides exactly half its width,
          so the loop has no seam. */}
      <div className="bd-ann" role="region" aria-label="Offers">
        <div className="bd-ann__track">
          <ul className="bd-ann__run">{ANN}</ul>
          <ul className="bd-ann__run" aria-hidden="true">{ANN}</ul>
        </div>
      </div>

      <nav className="bd-nav" aria-label="Main">
        <div className="bd-wrap bd-nav__in">
          <a className="bd-nav__logo" href={href("/")} aria-label={page.store.name}>
            {page.store.logoUrl ? (
              <img src={page.store.logoUrl} alt={page.store.name} />
            ) : (
              <span className="bd-nav__word">bodies</span>
            )}
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
              {drawer && drawer.itemCount > 0 ? (
                <span className="bd-nav__count" aria-hidden="true">{drawer.itemCount}</span>
              ) : null}
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
            <h4>bodies</h4>
            <p className="bd-foot__say">Pilates at home. A stronger, happier you — anytime, anywhere.</p>
            <div className="bd-foot__social" aria-label="Social">
              <a href="https://instagram.com" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" /></svg></a>
              <a href="https://tiktok.com" aria-label="TikTok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M14 3v11.5a3.5 3.5 0 1 1-3-3.46" /><path d="M14 6.2A5.6 5.6 0 0 0 19.5 10" /></svg></a>
              <a href="https://pinterest.com" aria-label="Pinterest"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5c-2 0-3.2 1.3-3.2 2.9 0 .8.4 1.6 1 1.9l.3-1.1c-.3-.4-.4-.8-.4-1.2 0-1.2 1-2.3 2.5-2.3 1.3 0 2.2.8 2.2 2 0 1.6-.7 2.9-1.7 2.9-.5 0-.9-.4-.8-1l.5-2c-.4-.6-1.4-.4-1.6.4l-1 4.4" /></svg></a>
            </div>
          </div>
          <div>
            <h4>Shop</h4>
            <ul>
              {Object.keys(WAYS).map((label) => (
                <li key={label}><a href={href(`/#shop`)}>{label}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Learn</h4>
            <ul>
              <li><a href={`${href("/")}#how`}>How it works</a></li>
              <li><a href={`${href("/")}#workouts`}>Workouts</a></li>
              <li><a href={`${href("/")}#story`}>Our story</a></li>
            </ul>
          </div>
          <div>
            <h4>Help</h4>
            <ul>
              {page.nav.footer.length ? (
                page.nav.footer.map((l) => (
                  <li key={`${l.href}${l.label}`}><a href={href(l.href)}>{l.label}</a></li>
                ))
              ) : (
                <li><a href={href("/cart")}>Cart</a></li>
              )}
            </ul>
          </div>
        </div>
        <div className="bd-foot__legal">
          <span>© {year} {page.store.name}</span>
          <span>Pilates for a brighter you.</span>
        </div>
      </div>
      {/* the signature: the wordmark, oversized, bleeding off the bottom edge */}
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
  const href = (p: string) => `${p}${storeParam}`;
  const ways = page.variants;
  const lead = ways.find((v) => v.isDefault) ?? ways[0] ?? null;
  const heroWay = lead ? wayOf(lead.label) : fallbackWay;
  const photo = lead?.imageUrl ? { src: lead.imageUrl, alt: lead.label } : null;

  return (
    <CartDrawerProvider
      page={page}
      storeParam={storeParam}
      photo={photo}
      publishableKey={publishableKey}
      paypalClientId={paypalClientId}
    >
      <div className="bd">
        <Head page={page} storeParam={storeParam} />

        <main>
          {/* 1 — hero. Headline over the photograph, not beside it. */}
          <section className="bd-hero">
            <div className="bd-hero__pic">
              {heroWay.hero ? <img src={heroWay.hero} alt="" fetchPriority="high" /> : null}
            </div>
            <div className="bd-hero__in">
              <div className="bd-wrap">
                <div className="bd-hero__copy">
                  <h1 className="bd-h1">Pilates at home.</h1>
                  <p className="bd-hero__sub">A stronger, happier you — anytime, anywhere.</p>
                  <div className="bd-hero__cta">
                    <a className="bd-btn" href={`${href("/")}#shop`}>Shop now</a>
                    <a className="bd-btn bd-btn--ghost" href={`${href("/")}#how`}>How it works</a>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 2 — four colourways. No cards, no borders: the board on a disc. */}
          <section className="bd-sec" id="shop">
            <div className="bd-wrap">
              <div className="bd-sec__head">
                <div>
                  <h2 className="bd-h2">Four colourways.<br />One studio.</h2>
                  <p className="bd-lede">Same board, same workouts. Pick the one you want to look at every day.</p>
                </div>
              </div>
              <div className="bd-ways">
                {ways.map((variant) => (
                  <WayCard key={variant.id} variant={variant} currency={page.store.currency} storeParam={storeParam} />
                ))}
              </div>
            </div>
          </section>

          {/* 3 — split editorial */}
          <section className="bd-sec" id="how">
            <div className="bd-wrap bd-split">
              <div className="bd-split__pic">
                <img src={`${M}/bd-c-swan-latina.png`} alt="Using the board at home" loading="lazy" />
              </div>
              <div className="bd-split__copy">
                <p className="bd-eyebrow">More than a workout</p>
                <h2 className="bd-h2">A studio that fits under the bed.</h2>
                <p>
                  A full Pilates studio, guided on the screen, in whatever floor space you have.
                  Full-body resistance, real progress, no commute and nobody watching.
                </p>
                <a className="bd-btn" href={`${href("/")}#shop`}>See the colourways</a>
              </div>
            </div>
          </section>

          {/* 4 — workouts */}
          <section className="bd-sec" id="workouts">
            <div className="bd-wrap">
              <div className="bd-sec__head">
                <h2 className="bd-h2">One board.<br />So many ways to move.</h2>
              </div>
              <div className="bd-moves">
                {MOVES.map((move) => (
                  <figure className="bd-move" key={move.name}>
                    <img src={move.src} alt={move.name} loading="lazy" />
                    <span>{move.name}</span>
                  </figure>
                ))}
              </div>
            </div>
          </section>

          {/* 5 — the screen, split the other way */}
          <section className="bd-sec">
            <div className="bd-wrap bd-split bd-split--flip">
              <div className="bd-split__pic">
                <img src={`${M}/bd-d-lilac-screen.png`} alt="The screen on the board" loading="lazy" />
              </div>
              <div className="bd-split__copy">
                <p className="bd-eyebrow">The screen</p>
                <h2 className="bd-h2">Workouts that move with you.</h2>
                <p>
                  Expert-led Pilates, strength, sculpt, stretch and recovery — built into the board,
                  on a screen that folds flat when you are done.
                </p>
                <a className="bd-btn" href={`${href("/")}#shop`}>Explore</a>
              </div>
            </div>
          </section>

          {/* 6 — the loud one. Only one of these on the page. */}
          <section className="bd-band bd-band--right">
            <div className="bd-band__pic">
              <img src={`${M}/bd-hero-matcha.png`} alt="" loading="lazy" />
            </div>
            <div className="bd-band__in">
              <div className="bd-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "inherit" }}>
                <h2 className="bd-h2">Small space.<br />Big change.</h2>
                <p>It folds flat, stands upright, and disappears until tomorrow.</p>
                <a className="bd-btn" href={`${href("/")}#shop`}>Shop bodies</a>
              </div>
            </div>
          </section>

          {/* 7 — feature strip, thin line icons */}
          <section className="bd-sec" id="story">
            <div className="bd-wrap bd-feats">
              <Feat label="Built-in screen"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8" /></Feat>
              <Feat label="Folds flat"><path d="M4 12h16" /><path d="M7 8l-3 4 3 4" /><path d="M17 8l3 4-3 4" /></Feat>
              <Feat label="Full-body resistance"><path d="M5 9v6M19 9v6" /><path d="M8 12h8" /><rect x="2.5" y="10" width="3" height="4" rx="1" /><rect x="18.5" y="10" width="3" height="4" rx="1" /></Feat>
              <Feat label="Studio workouts"><circle cx="12" cy="12" r="9" /><path d="M10 9l5 3-5 3z" /></Feat>
              <Feat label="Made for small spaces"><path d="M4 4h6M4 4v6M20 20h-6M20 20v-6" /><rect x="8" y="8" width="8" height="8" rx="1" /></Feat>
            </div>
          </section>

          {/* 8 — social proof */}
          <section className="bd-sec">
            <div className="bd-wrap">
              <div className="bd-sec__head">
                <h2 className="bd-h2">Loved by<br />Pilates girls.</h2>
              </div>
              <div className="bd-ugc">
                {REVIEWS.map((review) => (
                  <article className="bd-ugc__card" key={review.who}>
                    <div className="bd-ugc__pic"><img src={review.src} alt="" loading="lazy" /></div>
                    <div className="bd-ugc__stars" aria-label="Five stars">★★★★★</div>
                    <p>{review.text}</p>
                    <cite>{review.who}</cite>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* 9 — a white card over a photograph, the way the reference does it */}
          <section className="bd-join">
            <div className="bd-join__pic">
              <img src={`${M}/bd-hero-lilac.png`} alt="" loading="lazy" />
            </div>
            <div className="bd-join__in">
              <div className="bd-wrap">
                <div className="bd-join__card">
                  <h2 className="bd-h3">Get 15% off your first order.</h2>
                  <p>First to know about new workouts, colourways and everything else.</p>
                  <form className="bd-join__form" method="post" action={href("/cart")}>
                    <input id="bd-join-email" type="email" name="email" placeholder="Your email" aria-label="Your email" required />
                    <button type="submit" className="bd-btn">Join</button>
                  </form>
                </div>
              </div>
            </div>
          </section>
        </main>

        <Foot page={page} storeParam={storeParam} />
      </div>
    </CartDrawerProvider>
  );
}

function Feat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bd-feat">
      <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
      <span>{label}</span>
    </div>
  );
}

function WayCard({
  variant,
  currency,
  storeParam,
}: {
  variant: VariantRow;
  currency: string;
  storeParam: string;
}) {
  const drawer = useCartDrawer();
  const way = wayOf(variant.label);
  const sold = variant.available <= 0;
  const shot = way.card || variant.imageUrl;

  return (
    <div className="bd-way">
      <a className="bd-way__pic" href={`/products/${slug(variant.label)}${storeParam}`} aria-label={variant.label}>
        <span className="bd-way__blob" style={{ background: way.disc }} aria-hidden="true" />
        {shot ? <img src={shot} alt={variant.label} loading="lazy" /> : null}
      </a>
      <span className="bd-way__name">{variant.label}</span>
      {variant.sublabel ? <span className="bd-way__note">{variant.sublabel}</span> : null}
      <span className="bd-way__price">{formatMoney(variant.priceCents, currency)}</span>
      <button
        type="button"
        className="bd-btn"
        disabled={sold}
        onClick={(event) => drawer?.add(variant.id, event.currentTarget)}
      >
        {sold ? "Sold out" : "Add to cart"}
      </button>
    </div>
  );
}

/** A colourway's own address. "Icy Swan" becomes "icy-swan". */
export function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
    <CartDrawerProvider
      page={page}
      storeParam={storeParam}
      photo={photo}
      publishableKey={publishableKey}
      paypalClientId={paypalClientId}
    >
      <div className="bd">
        <Head page={page} storeParam={storeParam} />
        <main>
          <Pdp page={page} variant={variant} storeParam={storeParam} />
        </main>
        <Foot page={page} storeParam={storeParam} />
      </div>
    </CartDrawerProvider>
  );
}

function Pdp({
  page,
  variant,
  storeParam,
}: {
  page: LoadedProductPage;
  variant: VariantRow;
  storeParam: string;
}) {
  const drawer = useCartDrawer();
  const way = wayOf(variant.label);
  const shots = [way.card || variant.imageUrl, variant.imageUrl, ...way.life].filter(
    (src, i, all): src is string => Boolean(src) && all.indexOf(src) === i,
  );
  const [shot, setShot] = useState(0);
  const sold = variant.available <= 0;
  const monthly = Math.round(variant.priceCents / 12);

  return (
    <div className="bd-wrap bd-pdp">
      <div>
        <div className="bd-pdp__stage">
          {shots[shot] ? <img src={shots[shot]} alt={variant.label} /> : null}
        </div>
        {shots.length > 1 ? (
          <div className="bd-pdp__thumbs" role="tablist" aria-label="Photos">
            {shots.map((src, i) => (
              <button
                type="button"
                role="tab"
                key={src}
                className="bd-pdp__thumb"
                aria-selected={i === shot}
                aria-label={`Photo ${i + 1}`}
                onClick={() => setShot(i)}
              >
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <p className="bd-eyebrow">{page.product.title}</p>
        <h1 className="bd-h2" style={{ marginTop: 10 }}>{variant.label}</h1>
        {variant.sublabel ? <p className="bd-lede">{variant.sublabel}</p> : null}

        <div className="bd-pdp__price">
          <b>{formatMoney(variant.priceCents, page.store.currency)}</b>
          {variant.compareAtCents && variant.compareAtCents > variant.priceCents ? (
            <s>{formatMoney(variant.compareAtCents, page.store.currency)}</s>
          ) : null}
        </div>
        {/* PayPal Pay Later is connected, so the monthly figure is real. */}
        <p className="bd-pdp__later">
          or about {formatMoney(monthly, page.store.currency)}/month with PayPal Pay Later
        </p>

        <div className="bd-pdp__swatches" role="tablist" aria-label="Colourway">
          {page.variants.map((other) => (
            <a
              key={other.id}
              role="tab"
              aria-selected={other.id === variant.id}
              aria-label={other.label}
              className="bd-swatch"
              href={`/products/${slug(other.label)}${storeParam}`}
              style={{ background: wayOf(other.label).disc }}
            />
          ))}
        </div>
        <p className="bd-pdp__chosen" style={{ color: way.ink }}>{variant.label}</p>

        <div className="bd-pdp__buy">
          <button
            type="button"
            className="bd-btn bd-btn--big"
            disabled={sold}
            onClick={(event) => drawer?.add(variant.id, event.currentTarget)}
          >
            {sold ? "Sold out" : "Add to cart"}
          </button>
        </div>

        <ul className="bd-pdp__facts">
          <li>Built-in screen with expert-led Pilates, strength, sculpt, stretch and recovery</li>
          <li>Full-body resistance with cables, handles and ankle straps</li>
          <li>Folds flat and stands upright — it stores where a suitcase would</li>
          <li>Everything in the box: cables, straps, two pads, charging cable</li>
          <li>Free shipping worldwide</li>
        </ul>
      </div>
    </div>
  );
}
