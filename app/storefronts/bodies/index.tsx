/**
 * bodies — the storefront.
 *
 * Rendered from the page's sections, the way Garden Buddy is, so the theme
 * editor edits it: every heading, paragraph and picture on the homepage is a
 * section value or a block value. What is not editable is what should not be —
 * the colourway cards, their prices and their stock come from the variants.
 *
 * Built against the Experiment reference section for section. The discipline
 * is what is borrowed, not the colour: one accent does every button, the
 * headline sits on the photograph rather than beside it, product cards have no
 * border, no two saturated sections touch, and the wordmark signs the page off
 * oversized at the bottom.
 */
import { useEffect, useRef, useState } from "react";
import type { LoadedProductPage, LoadedSection, VariantRow, NavLink } from "~/lib/store.server";
import { formatMoney } from "~/lib/money";
import { CartDrawerProvider, useCartDrawer } from "./cart-drawer";

type Vals = Record<string, string>;
const val = (v: Vals, k: string) => (v[k] ?? "").trim();
const has = (v: Vals, ...keys: string[]) => keys.some((k) => val(v, k) !== "");

const M = "/media";

/** What each colourway looks like, keyed by the variant label. */
export const WAYS: Record<string, { disc: string; ink: string; card: string; sky: string; skyTall: string; life: string[] }> = {
  "Icy Swan": {
    disc: "#D6E9F6", ink: "#2E5570", card: `${M}/bd-cut-swan.png`, sky: `${M}/bd-sky-swan.jpg`, skyTall: `${M}/bd-sky-swan-tall.jpg`,
    life: [`${M}/bd-hero-real.png`, `${M}/bd-c-swan-latina.png`, `${M}/bd-b-swan-socks.png`, `${M}/bd-d-swan-underbed.png`],
  },
  "Lilac Heat": {
    disc: "#EEDCF5", ink: "#4A2357", card: `${M}/bd-cut-lilac.png`, sky: `${M}/bd-sky-lilac.jpg`, skyTall: `${M}/bd-sky-lilac-tall.jpg`,
    life: [`${M}/bd-hero-real-2.png`, `${M}/bd-a-lilac-top.png`, `${M}/bd-c-lilac-mirror2.png`, `${M}/bd-d-lilac-socks.png`],
  },
  Matcha: {
    disc: "#D8EDC4", ink: "#1E4636", card: `${M}/bd-cut-matcha.png`, sky: `${M}/bd-sky-matcha.jpg`, skyTall: `${M}/bd-sky-matcha-tall.jpg`,
    life: [`${M}/bd-c-matcha-black.png`, `${M}/bd-d-matcha-stretch.png`, `${M}/bd-e-matcha-backlit.png`, `${M}/bd-b-matcha-carry.png`],
  },
  Bare: {
    disc: "#F0E9DE", ink: "#4A4034", card: `${M}/bd-cut-bare.png`, sky: `${M}/bd-sky-bare.jpg`, skyTall: `${M}/bd-sky-bare-tall.jpg`,
    life: [`${M}/bd-d-bare-rest.png`, `${M}/bd-c-bare-latina.png`, `${M}/bd-f-bare-fold.png`, `${M}/bd-d-bare-hallway.png`],
  },
};
/** The three "who it's for" cards each sit on a colourway tint. */
const WHO_TINTS = ["#D6E9F6", "#EEDCF5", "#F0E9DE"];
const fallbackWay = { disc: "#EFEFEF", ink: "#0E0F12", card: "", sky: "", skyTall: "", life: [] as string[] };
export const wayOf = (label: string) => WAYS[label] ?? fallbackWay;

/** A colourway's own address. "Icy Swan" becomes "icy-swan". */
export function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

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
        { label: "Shop", href: "#shop" },
        { label: "How it works", href: "#how" },
        { label: "Workouts", href: "#workouts" },
        { label: "Our story", href: "#story" },
      ];

  return (
    <>
      {/* Printed twice and slid by exactly half its width, so the loop has no seam. */}
      <div className="bd-ann" role="region" aria-label="Offers">
        <div className="bd-ann__track">
          <ul className="bd-ann__run">{ANN}</ul>
          <ul className="bd-ann__run" aria-hidden="true">{ANN}</ul>
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
            <h4>bodies</h4>
            <p className="bd-foot__say">Pilates at home. A stronger, happier you — anytime, anywhere.</p>
            <div className="bd-foot__social" aria-label="Social">
              <a href="https://instagram.com" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" /></svg></a>
              <a href="https://tiktok.com" aria-label="TikTok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M14 3v11.5a3.5 3.5 0 1 1-3-3.46" /><path d="M14 6.2A5.6 5.6 0 0 0 19.5 10" /></svg></a>
            </div>
          </div>
          <div>
            <h4>Shop</h4>
            <ul>
              {Object.keys(WAYS).map((label) => (
                <li key={label}><a href={`/products/${slug(label)}${storeParam}`}>{label}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Learn</h4>
            <ul>
              <li><a href={`${href("/")}#how`}>How it works</a></li>
              <li><a href={`${href("/")}#workouts`}>Workouts</a></li>
              <li><a href={`${href("/")}#faq`}>Questions</a></li>
            </ul>
          </div>
          <div>
            <h4>Help</h4>
            <ul>
              {page.nav.footer.length ? (
                page.nav.footer.map((l) => <li key={`${l.href}${l.label}`}><a href={href(l.href)}>{l.label}</a></li>)
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
  const lead = page.variants.find((v) => v.isDefault) ?? page.variants[0] ?? null;
  const photo = lead?.imageUrl ? { src: lead.imageUrl, alt: lead.label } : null;

  return (
    <CartDrawerProvider page={page} storeParam={storeParam} photo={photo} publishableKey={publishableKey} paypalClientId={paypalClientId}>
      <div className="bd">
        <Head page={page} storeParam={storeParam} />
        <main>
          {page.sections.map((section) => (
            <Section key={section.id} section={section} page={page} storeParam={storeParam} />
          ))}
        </main>
        <Foot page={page} storeParam={storeParam} />
      </div>
    </CartDrawerProvider>
  );
}

function Section({ section, page, storeParam }: { section: LoadedSection; page: LoadedProductPage; storeParam: string }) {
  const body = renderSection(section, page, storeParam);
  if (!body) return null;
  return <section className="shopify-section bd-section">{body}</section>;
}

/* Positional, like Garden Buddy's: the fifth icon goes with the fifth block. */
const TRUST_ICONS = [
  <svg viewBox="0 0 24 24" key="screen"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8" /></svg>,
  <svg viewBox="0 0 24 24" key="fold"><path d="M4 12h16" /><path d="M7 8l-3 4 3 4" /><path d="M17 8l3 4-3 4" /></svg>,
  <svg viewBox="0 0 24 24" key="resist"><path d="M5 9v6M19 9v6" /><path d="M8 12h8" /><rect x="2.5" y="10" width="3" height="4" rx="1" /><rect x="18.5" y="10" width="3" height="4" rx="1" /></svg>,
  <svg viewBox="0 0 24 24" key="studio"><circle cx="12" cy="12" r="9" /><path d="M10 9l5 3-5 3z" /></svg>,
  <svg viewBox="0 0 24 24" key="space"><path d="M4 4h6M4 4v6M20 20h-6M20 20v-6" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg>,
];

function renderSection(section: LoadedSection, page: LoadedProductPage, storeParam: string) {
  const v = section.values;
  const blocks = section.blocks;
  const href = (p: string) => `${p}${storeParam}`;

  switch (section.type) {
    /* ---------------------------------------------------------- hero + shop */
    case "buy_box": {
      const shot = blocks.map((b) => val(b.values, "image")).find(Boolean) ?? "";
      const alt = blocks.map((b) => val(b.values, "alt")).find(Boolean) ?? "";
      return (
        <>
          <SkyHero
            variants={page.variants}
            fallback={shot}
            alt={alt}
            badge={val(v, "badge")}
            heading={val(v, "heading")}
            sub={val(v, "subheading")}
            cta={val(v, "ctaLabel") || "Shop now"}
            sure={val(v, "reassurance")}
            href={href}
          />

          <div className="bd-sec" id="shop">
            <div className="bd-wrap">
              <div className="bd-sec__head">
                <div>
                  <h2 className="bd-h2">Four colourways.<br />One studio.</h2>
                  <p className="bd-lede">Same board, same screen, same workouts. Pick the one you want to look at every day.</p>
                </div>
              </div>
              <div className="bd-ways">
                {page.variants.map((variant) => (
                  <WayCard key={variant.id} variant={variant} currency={page.store.currency} storeParam={storeParam} />
                ))}
              </div>
            </div>
          </div>
        </>
      );
    }

    /* ------------------------------------------------------- how it works */
    case "three_steps": {
      const items = blocks.filter((b) => has(b.values, "title", "text"));
      if (items.length === 0) return null;
      return (
        <div className="bd-sec bd-sec--block bd-sec--matcha" id="how">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                <p className="bd-eyebrow">Thirty seconds, start to finish</p>
                {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
              </div>
            </div>
            <ol className="bd-steps">
              {items.map((b, i) => (
                <li className="bd-step" key={b.id}>
                  <div className="bd-step__pic">
                    {val(b.values, "image") ? <img src={val(b.values, "image")} alt={val(b.values, "title")} loading="lazy" /> : null}
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

    /* ------------------------------------------------------- split, photo left */
    case "benefits": {
      const items = blocks.filter((b) => has(b.values, "title", "text"));
      if (items.length === 0) return null;
      const shot = items.map((b) => val(b.values, "image")).find(Boolean);
      return (
        <div className="bd-sec">
          <div className="bd-wrap bd-split">
            <div className="bd-split__pic">{shot ? <img src={shot} alt={val(v, "heading")} loading="lazy" /> : null}</div>
            <div className="bd-split__copy">
              {val(v, "subheading") ? <p className="bd-eyebrow">{val(v, "subheading")}</p> : null}
              {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
              <ul className="bd-list">
                {items.map((b) => (
                  <li key={b.id}>
                    <h3 className="bd-h3">{val(b.values, "title")}</h3>
                    <p>{val(b.values, "text")}</p>
                  </li>
                ))}
              </ul>
              <a className="bd-btn" href={`${href("/")}#shop`}>See the colourways</a>
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- workouts */
    case "product_grid": {
      const items = blocks.filter((b) => has(b.values, "image", "title"));
      if (items.length === 0) return null;
      return (
        <div className="bd-sec" id="workouts">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
                {val(v, "subheading") ? <p className="bd-lede">{val(v, "subheading")}</p> : null}
              </div>
            </div>
            <div className="bd-moves">
              {items.map((b) => (
                <figure className="bd-move" key={b.id}>
                  {val(b.values, "image") ? <img src={val(b.values, "image")} alt={val(b.values, "title")} loading="lazy" /> : null}
                  <i>{String(items.indexOf(b) + 1).padStart(2, "0")}</i>
                  <span>{val(b.values, "title")}{val(b.values, "note") ? ` · ${val(b.values, "note")}` : ""}</span>
                </figure>
              ))}
            </div>
            {val(v, "footnote") ? <p className="bd-foot-note">{val(v, "footnote")}</p> : null}
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- split, photo right */
    case "features": {
      const items = blocks.filter((b) => has(b.values, "title", "text"));
      if (items.length === 0) return null;
      const shot = items.map((b) => val(b.values, "image")).find(Boolean);
      return (
        <div className="bd-sec bd-sec--block bd-sec--swan">
          <div className="bd-wrap bd-split bd-split--flip">
            <div className="bd-split__pic">{shot ? <img src={shot} alt={val(v, "heading")} loading="lazy" /> : null}</div>
            <div className="bd-split__copy">
              {val(v, "subheading") ? <p className="bd-eyebrow">{val(v, "subheading")}</p> : null}
              {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
              <ul className="bd-list">
                {items.map((b) => (
                  <li key={b.id}>
                    <h3 className="bd-h3">{val(b.values, "title")}</h3>
                    <p>{val(b.values, "text")}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- feature strip */
    case "trust_icons": {
      const items = blocks.filter((b) => has(b.values, "title"));
      if (items.length === 0) return null;
      return (
        <div className="bd-sec bd-sec--tight" id="story">
          <div className="bd-wrap bd-feats">
            {items.map((b, i) => (
              <div className="bd-feat" key={b.id}>
                {TRUST_ICONS[i] ?? TRUST_ICONS[0]}
                <span>{val(b.values, "title")}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- the feed */
    case "social_proof_images": {
      const items = blocks.filter((b) => has(b.values, "image"));
      if (items.length === 0) return null;
      return (
        <div className="bd-sec">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
                {val(v, "subheading") ? <p className="bd-lede">{val(v, "subheading")}</p> : null}
              </div>
            </div>
            <div className="bd-feed">
              {items.map((b) => (
                <figure className="bd-feed__tile" key={b.id}>
                  <img src={val(b.values, "image")} alt={val(b.values, "caption")} loading="lazy" />
                  {val(b.values, "caption") ? <figcaption>{val(b.values, "caption")}</figcaption> : null}
                </figure>
              ))}
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- reviews: real ones only */
    case "reviews": {
      if (page.reviews.length === 0) return null;
      return (
        <div className="bd-sec">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
            </div>
            <div className="bd-ugc">
              {page.reviews.map((r) => (
                <article className="bd-ugc__card" key={r.id}>
                  {r.imageUrl ? <div className="bd-ugc__pic"><img src={r.imageUrl} alt="" loading="lazy" /></div> : null}
                  <div className="bd-ugc__stars" aria-label={`${r.rating} stars`}>{"★".repeat(Math.max(1, Math.min(5, r.rating)))}</div>
                  {r.title ? <h3 className="bd-h3">{r.title}</h3> : null}
                  <p>{r.body}</p>
                  <cite>{r.name}{r.verified ? " · Verified" : ""}</cite>
                </article>
              ))}
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- comparison */
    case "comparison_table": {
      const rows = blocks.filter((b) => has(b.values, "label"));
      if (rows.length === 0) return null;
      return (
        <div className="bd-sec bd-sec--block bd-sec--lilac">
          <div className="bd-wrap bd-cmp">
            <p className="bd-eyebrow">No membership. No booking.</p>
            {val(v, "heading") ? <h2 className="bd-h2" style={{ marginTop: 10 }}>{val(v, "heading")}</h2> : null}
            <div className="bd-cmp__scroll bd-card">
              <table className="bd-cmp__table">
                <thead>
                  <tr>
                    <th aria-label="Row" />
                    <th className="bd-cmp__us"><span>{val(v, "usLabel") || page.store.name}</span></th>
                    <th>{val(v, "themLabel") || "Them"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id}>
                      <th scope="row">{val(b.values, "label")}</th>
                      <td className="bd-cmp__us">{val(b.values, "us")}</td>
                      <td>{val(b.values, "them")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- who it's for */
    case "who_its_for": {
      const items = blocks.filter((b) => has(b.values, "title", "text"));
      if (items.length === 0) return null;
      return (
        <div className="bd-sec">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
            </div>
            <div className="bd-who">
              {items.map((b, i) => (
                <div className="bd-who__item" key={b.id} style={{ background: WHO_TINTS[i % WHO_TINTS.length] }}>
                  <span className="bd-who__n">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="bd-h3">{val(b.values, "title")}</h3>
                  <p>{val(b.values, "text")}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- in the box */
    case "whats_in_the_box": {
      const items = blocks.filter((b) => has(b.values, "title"));
      if (items.length === 0) return null;
      const shot = items.map((b) => val(b.values, "image")).find(Boolean);
      return (
        <div className="bd-sec bd-sec--block bd-sec--bare">
          <div className="bd-wrap bd-split">
            <div className="bd-split__pic bd-split__pic--disc">{shot ? <img src={shot} alt={val(v, "heading")} loading="lazy" /> : null}</div>
            <div className="bd-split__copy">
              {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
              <ul className="bd-box">
                {items.map((b) => (
                  <li key={b.id}>
                    <b>{val(b.values, "title")}</b>
                    {val(b.values, "text") ? <span>{val(b.values, "text")}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      );
    }

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
                  <dd className={val(b.values, "value") ? undefined : "bd-specs__pending"}>{val(b.values, "value") || "Spec pending"}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- questions */
    case "video_faq": {
      const items = blocks.filter((b) => has(b.values, "question", "answer"));
      if (items.length === 0) return null;
      return (
        <div className="bd-sec" id="faq">
          <div className="bd-wrap bd-faq">
            {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
            <div className="bd-faq__list">
              {items.map((b) => (
                <details className="bd-faq__item" key={b.id}>
                  <summary>{val(b.values, "question")}</summary>
                  <p>{val(b.values, "answer")}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- the loud one, then join */
    case "closing_cta":
      return (
        <>
          <div className="bd-band bd-band--right">
            <div className="bd-band__pic"><img src={`${M}/bd-hero-real-2.png`} alt="" loading="lazy" /></div>
            <div className="bd-band__in">
              <div className="bd-wrap bd-band__wrap">
                {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
                {val(v, "subheading") ? <p>{val(v, "subheading")}</p> : null}
                <a className="bd-btn" href={`${href("/")}#shop`}>{val(v, "ctaLabel") || "Shop bodies"}</a>
              </div>
            </div>
          </div>

          {/* A white card over a photograph, the way the reference does it.
              It records the address on the visitor's cart, so the recovery
              email can reach them — there is no separate mailing list yet. */}
          <div className="bd-join">
            <div className="bd-join__pic"><img src={`${M}/bd-a-lilac-top.png`} alt="" loading="lazy" /></div>
            <div className="bd-join__in">
              <div className="bd-wrap">
                <div className="bd-join__card">
                  <h2 className="bd-h3">Join bodies.</h2>
                  <p>First to know about new workouts, colourways and everything else.</p>
                  <form className="bd-join__form" method="post" action={href("/checkout/identify")}>
                    <input type="hidden" name="consent" value="1" />
                    <input id="bd-join-email" type="email" name="email" placeholder="Your email" aria-label="Your email" required />
                    <button type="submit" className="bd-btn">Join</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </>
      );

    /* no videos exist yet — nothing is drawn rather than an empty player */
    case "video_clips":
    default:
      return null;
  }
}

/**
 * The campaign hero: the board floating over a saturated sky, one shot per
 * colourway, the headline cut over the empty side of the sky. The swatches
 * swap the shot in place. The section's own image is the fallback when a
 * colourway has no sky shot.
 */
function SkyHero({
  variants,
  fallback,
  alt,
  badge,
  heading,
  sub,
  cta,
  sure,
  href,
}: {
  variants: VariantRow[];
  fallback: string;
  alt: string;
  badge: string;
  heading: string;
  sub: string;
  cta: string;
  sure: string;
  href: (p: string) => string;
}) {
  const skies = variants.filter((variant) => wayOf(variant.label).sky);
  const [picked, setPicked] = useState(0);
  const current = skies[picked] ?? null;
  const src = current ? wayOf(current.label).sky : fallback;
  return (
    <div className={`bd-hero${current ? " bd-hero--sky" : ""}`}>
      <div className="bd-hero__pic">
        {src ? (
          <picture>
            {current && wayOf(current.label).skyTall ? <source media="(max-width: 720px)" srcSet={wayOf(current.label).skyTall} /> : null}
            <img src={src} alt={current ? `The bodies board in ${current.label}` : alt} fetchPriority="high" />
          </picture>
        ) : null}
      </div>
      <div className="bd-hero__in">
        <div className="bd-wrap">
          <div className="bd-hero__copy">
            {badge ? <p className="bd-eyebrow">{badge}</p> : null}
            {heading ? <h1 className="bd-h1">{heading}</h1> : null}
            {sub ? <p className="bd-hero__sub">{sub}</p> : null}
            <div className="bd-hero__cta">
              <a className="bd-btn" href={current ? `/products/${slug(current.label)}${href("").replace(/^\//, "")}` : `${href("/")}#shop`}>
                {cta}
              </a>
              <a className="bd-btn bd-btn--ghost" href={`${href("/")}#how`}>How it works</a>
            </div>
            {skies.length > 1 ? (
              <div className="bd-hero__ways" role="tablist" aria-label="Colourway">
                {skies.map((variant, i) => (
                  <button
                    key={variant.id}
                    type="button"
                    role="tab"
                    aria-selected={i === picked}
                    aria-label={variant.label}
                    className="bd-swatch"
                    style={{ background: wayOf(variant.label).disc }}
                    onClick={() => setPicked(i)}
                  />
                ))}
                <span className="bd-hero__way">{current?.label}</span>
              </div>
            ) : null}
            {sure ? <p className="bd-hero__sure">{sure}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function WayCard({ variant, currency, storeParam }: { variant: VariantRow; currency: string; storeParam: string }) {
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
        <Head page={page} storeParam={storeParam} />
        <main>
          <Pdp page={page} variant={variant} storeParam={storeParam} />
        </main>
        <Foot page={page} storeParam={storeParam} />
      </div>
    </CartDrawerProvider>
  );
}

function Pdp({ page, variant, storeParam }: { page: LoadedProductPage; variant: VariantRow; storeParam: string }) {
  const drawer = useCartDrawer();
  const way = wayOf(variant.label);
  // Five shots: the card render, then the phone photos. One row of thumbs.
  const shots = [way.sky, way.card || variant.imageUrl, ...way.life, variant.imageUrl]
    .filter((src, i, all): src is string => Boolean(src) && all.indexOf(src) === i)
    .slice(0, 5);
  const [shot, setShot] = useState(0);
  const sold = variant.available <= 0;
  const monthly = Math.round(variant.priceCents / 12);
  const buyRef = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);

  // The sticky bar appears once the real Add to cart has scrolled away.
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
      <div>
        <div className="bd-pdp__stage">{shots[shot] ? <img src={shots[shot]} alt={variant.label} /> : null}</div>
        {shots.length > 1 ? (
          <div className="bd-pdp__thumbs" role="tablist" aria-label="Photos">
            {shots.map((src, i) => (
              <button type="button" role="tab" key={src} className="bd-pdp__thumb" aria-selected={i === shot} aria-label={`Photo ${i + 1}`} onClick={() => setShot(i)}>
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
          {variant.compareAtCents && variant.compareAtCents > variant.priceCents ? <s>{formatMoney(variant.compareAtCents, page.store.currency)}</s> : null}
        </div>
        {/* PayPal Pay Later is connected on this store, so the monthly figure is real. */}
        <p className="bd-pdp__later">or about {formatMoney(monthly, page.store.currency)}/month with PayPal Pay Later</p>

        <div className="bd-pdp__swatches" role="tablist" aria-label="Colourway">
          {page.variants.map((other) => (
            <a key={other.id} role="tab" aria-selected={other.id === variant.id} aria-label={other.label} className="bd-swatch" href={`/products/${slug(other.label)}${storeParam}`} style={{ background: wayOf(other.label).disc }} />
          ))}
        </div>
        <p className="bd-pdp__chosen" style={{ color: way.ink }}>{variant.label}</p>

        <div className="bd-pdp__buy" ref={buyRef}>
          <button type="button" className="bd-btn bd-btn--big" disabled={sold} onClick={(event) => drawer?.add(variant.id, event.currentTarget)}>
            {sold ? "Sold out" : "Add to cart"}
          </button>
        </div>

        <ul className="bd-pdp__facts">
          <li>Built-in screen, hinged to the board — Pilates, strength, sculpt, stretch and recovery</li>
          <li>Full-body resistance: two cables with handles, two ankle straps</li>
          <li>Folds flat and stands on its end</li>
          <li>In the box: the board, cables, straps, two pads, charging cable</li>
          <li>Free shipping worldwide</li>
        </ul>
      </div>
    </div>
    <div className={`bd-stick${stuck ? " bd-stick--on" : ""}`} aria-hidden={!stuck}>
      <div className="bd-wrap bd-stick__in">
        {shots[1] ? <img src={shots[1]} alt="" /> : null}
        <span className="bd-stick__name">{variant.label}</span>
        <span className="bd-stick__price">{formatMoney(variant.priceCents, page.store.currency)}</span>
        <button type="button" className="bd-btn" disabled={sold} tabIndex={stuck ? 0 : -1} onClick={(event) => drawer?.add(variant.id, event.currentTarget)}>
          {sold ? "Sold out" : "Add to cart"}
        </button>
      </div>
    </div>
    </>
  );
}
