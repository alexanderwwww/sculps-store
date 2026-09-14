/**
 * bodies — the storefront.
 *
 * Rendered from the page's sections, the way Garden Buddy is, so the theme
 * editor edits it: every heading, paragraph and picture on the homepage is a
 * section value or a block value. What is not editable is what should not be —
 * the colourway cards, their prices and their stock come from the variants.
 *
 * Built against the Experiment reference section for section: clarity in a
 * vibrant package. White ground, one lime for every button, one blue for
 * badges, and all the colour inside the photographs. The headline sits on the
 * photograph, cards are white with a hairline border, sections are white, and
 * the wordmark signs the page off oversized at the bottom.
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
export const WAYS: Record<string, { disc: string; ink: string; card: string; sky: string; skyTall: string; studio: string; life: string[] }> = {
  "Icy Swan": {
    disc: "#D6E9F6", ink: "#2E5570", card: `${M}/bd-cut-swan.png`, sky: `${M}/bd-sky-swan.jpg`, skyTall: `${M}/bd-sky-swan-tall.jpg`, studio: `${M}/bd-studio-swan.jpg`,
    life: [`${M}/bd-hero-real.png`, `${M}/bd-c-swan-latina.png`, `${M}/bd-b-swan-socks.png`, `${M}/bd-d-swan-underbed.png`],
  },
  "Lilac Heat": {
    disc: "#EEDCF5", ink: "#4A2357", card: `${M}/bd-cut-lilac.png`, sky: `${M}/bd-sky-lilac.jpg`, skyTall: `${M}/bd-sky-lilac-tall.jpg`, studio: `${M}/bd-studio-lilac.jpg`,
    life: [`${M}/bd-hero-real-2.png`, `${M}/bd-a-lilac-top.png`, `${M}/bd-c-lilac-mirror2.png`, `${M}/bd-d-lilac-socks.png`],
  },
  Matcha: {
    disc: "#D8EDC4", ink: "#1E4636", card: `${M}/bd-cut-matcha.png`, sky: `${M}/bd-sky-matcha.jpg`, skyTall: `${M}/bd-sky-matcha-tall.jpg`, studio: `${M}/bd-studio-matcha.jpg`,
    life: [`${M}/bd-c-matcha-black.png`, `${M}/bd-d-matcha-stretch.png`, `${M}/bd-e-matcha-backlit.png`, `${M}/bd-b-matcha-carry.png`],
  },
  Bare: {
    disc: "#F0E9DE", ink: "#4A4034", card: `${M}/bd-cut-bare.png`, sky: `${M}/bd-sky-bare.jpg`, skyTall: `${M}/bd-sky-bare-tall.jpg`, studio: `${M}/bd-studio-bare.jpg`,
    life: [`${M}/bd-d-bare-rest.png`, `${M}/bd-c-bare-latina.png`, `${M}/bd-f-bare-fold.png`, `${M}/bd-d-bare-hallway.png`],
  },
};
/** The product page shows everything: these home sections, in this order, under the buybox. */
const PDP_SECTIONS = ["product_grid", "three_steps", "comparison_table", "social_proof_images", "reviews", "specifications", "video_faq", "closing_cta"];
/** What it has that the others don't: shown, not told. Real files only. */
const PROOF = [
  { src: `${M}/bd-pdp-detail.jpg`, title: "An instructor, on the board", text: "The screen is built in. Press play and she tells you what to do, rep by rep." },
  { src: `${M}/bd-pdp-folded.jpg`, title: "Fold it. It's gone.", text: "Screen folds flat, board stands up. Under the bed, behind the door, until tomorrow." },
  { src: `${M}/bd-c-swan-latina.png`, title: "Your room. Your timing.", text: "No membership. No booking. Nobody watching. Pilates when you want it." },
];
/** Every item in the box, shown. Cut from the kit photograph. */
const BOX = [
  { src: `${M}/bd-box-board.jpg`, title: "The board", text: "with the built-in screen" },
  { src: `${M}/bd-box-cables.jpg`, title: "Two cables", text: "with foam handles" },
  { src: `${M}/bd-box-straps.jpg`, title: "Two ankle straps", text: "" },
  { src: `${M}/bd-box-pads.jpg`, title: "Two pads", text: "" },
  { src: `${M}/bd-box-charger.jpg`, title: "Charging cable", text: "" },
];
const fallbackWay = { disc: "#EFEFEF", ink: "#0E0F12", card: "", sky: "", skyTall: "", studio: "", life: [] as string[] };
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
            <h2 className="bd-h3" style={{ fontSize: 18 }}>Join bodies.</h2>
            <p className="bd-foot__say" style={{ marginTop: 8 }}>New workouts, new colourways, and nothing else. No spam.</p>
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

/* Positional: the fifth icon goes with the fifth block. Thin line icons. */
const TRUST_ICONS = [
  <svg viewBox="0 0 48 48" key="screen"><rect x="6" y="9" width="36" height="24" rx="3" /><path d="M18 40h12M24 33v7" /><path d="M18 21l4 4 8-8" /></svg>,
  <svg viewBox="0 0 48 48" key="fold"><path d="M8 30h32" /><path d="M14 30V16h20v14" /><path d="M14 16l10-6 10 6" /></svg>,
  <svg viewBox="0 0 48 48" key="resist"><path d="M10 18v12M38 18v12" /><path d="M14 24h20" /><rect x="6" y="20" width="4" height="8" rx="1" /><rect x="38" y="20" width="4" height="8" rx="1" /></svg>,
  <svg viewBox="0 0 48 48" key="studio"><circle cx="24" cy="24" r="17" /><path d="M20 17l11 7-11 7z" /></svg>,
  <svg viewBox="0 0 48 48" key="space"><path d="M8 8h10M8 8v10M40 40H30M40 40V30" /><rect x="16" y="16" width="16" height="16" rx="2" /></svg>,
];


function renderSection(section: LoadedSection, page: LoadedProductPage, storeParam: string) {
  const v = section.values;
  const blocks = section.blocks;
  const href = (p: string) => `${p}${storeParam}`;
  const lead = page.variants.find((x) => x.isDefault) ?? page.variants[0] ?? null;
  const leadWay = lead ? wayOf(lead.label) : fallbackWay;

  switch (section.type) {
    /* ---------------------------------------------------------- hero + shop */
    case "buy_box": {
      const shot = blocks.map((b) => val(b.values, "image")).find(Boolean) || `${M}/bd-hero-apt.jpg`;
      const alt = blocks.map((b) => val(b.values, "alt")).find(Boolean) ?? "";
      return (
        <>
          <div className="bd-hero">
            <div className="bd-hero__pic">
              <img src={shot} alt={alt} fetchPriority="high" />
            </div>
            <div className="bd-hero__panel">
              <div className="bd-wrap">
              <div className="bd-hero__copy">
                {val(v, "badge") ? <p className="bd-eyebrow">{val(v, "badge")}</p> : null}
                {val(v, "heading") ? <h1 className="bd-h1">{val(v, "heading")}</h1> : null}
                {val(v, "subheading") ? <p className="bd-hero__sub">{val(v, "subheading")}</p> : null}
                <div className="bd-hero__cta">
                  <a className="bd-btn bd-btn--big" href={lead ? `/products/${slug(lead.label)}${storeParam}` : `${href("/")}#shop`}>
                    {val(v, "ctaLabel") || "Shop the board"}{lead ? ` · ${formatMoney(lead.priceCents, page.store.currency)}` : ""}
                  </a>
                  <a className="bd-btn bd-btn--big bd-btn--ghost" href={`${href("/")}#how`}>How it works</a>
                </div>
                <div className="bd-hero__ways" aria-label="Colourways">
                  {page.variants.map((x) => (
                    <a key={x.id} className="bd-dot" style={{ background: wayOf(x.label).disc }} href={`/products/${slug(x.label)}${storeParam}`} aria-label={x.label} title={x.label} />
                  ))}
                  <span className="bd-hero__way">{page.variants.length} colourways</span>
                </div>
                {val(v, "reassurance") ? <p className="bd-hero__sure">{val(v, "reassurance")}</p> : null}
              </div>
              </div>
            </div>
          </div>

          <div className="bd-sec" id="shop">
            <div className="bd-wrap">
              <div className="bd-sec__head">
                <div>
                  <h2 className="bd-h2">Shop the board</h2>
                  <p className="bd-lede">One board, four colourways. Same screen, same workouts, same price.</p>
                </div>
                <a className="bd-sec__all" href={lead ? `/products/${slug(lead.label)}${storeParam}` : "#shop"}>Shop all →</a>
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
        <div className="bd-sec" id="how">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
                <p className="bd-lede">Thirty seconds from under the bed to a class.</p>
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
              {val(v, "heading") ? <h2 className="bd-h2" style={{ marginTop: 10 }}>{val(v, "heading")}</h2> : null}
              <ul className="bd-list">
                {items.map((b) => (
                  <li key={b.id}>
                    <h3 className="bd-h3">{val(b.values, "title")}</h3>
                    <p>{val(b.values, "text")}</p>
                  </li>
                ))}
              </ul>
              <a className="bd-btn" href={`${href("/")}#shop`}>Shop the board</a>
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- the workouts */
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
                  <span>{val(b.values, "title")}</span>
                </figure>
              ))}
            </div>
            {val(v, "footnote") ? <p className="bd-foot-note">{val(v, "footnote")}</p> : null}
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- the band */
    case "features": {
      const items = blocks.filter((b) => has(b.values, "title", "text"));
      if (items.length === 0) return null;
      const shot = items.map((b) => val(b.values, "image")).find(Boolean) || leadWay.life[0] || `${M}/bd-hero-real.png`;
      return (
        <div className="bd-band">
          <div className="bd-band__pic"><img src={shot} alt="" loading="lazy" /></div>
          <div className="bd-band__in">
            <div className="bd-wrap">
            <div className="bd-band__copy">
              {val(v, "subheading") ? <p className="bd-eyebrow">{val(v, "subheading")}</p> : null}
              {val(v, "heading") ? <h2 className="bd-h2" style={{ marginTop: 10 }}>{val(v, "heading")}</h2> : null}
              {items.slice(0, 2).map((b) => (
                <p key={b.id}><b style={{ fontWeight: 600 }}>{val(b.values, "title")}.</b> {val(b.values, "text")}</p>
              ))}
              <a className="bd-btn" href={`${href("/")}#shop`}>Shop now</a>
            </div>
            </div>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------- icon row */
    case "trust_icons": {
      const items = blocks.filter((b) => has(b.values, "title"));
      if (items.length === 0) return null;
      return (
        <div className="bd-sec" id="story">
          <div className="bd-wrap">
            <div className="bd-center" style={{ marginBottom: 28 }}>
              <h2 className="bd-h2">{val(v, "heading") || "Everything the studio has."}</h2>
              <p className="bd-lede">{val(v, "subheading") || "Built for a small apartment and a full workout."}</p>
            </div>
            <div className="bd-tiles">
              {items.map((b, i) => (
                <div className="bd-tile" key={b.id}>
                  {TRUST_ICONS[i] ?? TRUST_ICONS[0]}
                  <span>{val(b.values, "title")}</span>
                </div>
              ))}
            </div>
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
            <div className="bd-sec__head">{val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}</div>
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
        <div className="bd-sec">
          <div className="bd-wrap">
            <div className="bd-sec__head">
              <div>
                {val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}
                <p className="bd-lede">No membership. No booking. No commute.</p>
              </div>
            </div>
            <div className="bd-card bd-cmp__scroll">
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
            <div className="bd-sec__head">{val(v, "heading") ? <h2 className="bd-h2">{val(v, "heading")}</h2> : null}</div>
            <div className="bd-who">
              {items.map((b, i) => (
                <div className="bd-who__item" key={b.id}>
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
      const shot = items.map((b) => val(b.values, "image")).find(Boolean) || leadWay.card;
      return (
        <div className="bd-sec">
          <div className="bd-wrap bd-split">
            <div className="bd-split__pic bd-split__pic--product">{shot ? <img src={shot} alt={val(v, "heading")} loading="lazy" /> : null}</div>
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

    /* ------------------------------------------------------- email card on a photo */
    case "closing_cta":
      return (
        <div className="bd-join">
          <div className="bd-join__pic"><img src={`${M}/bd-hero-real-2.png`} alt="" loading="lazy" /></div>
          <div className="bd-join__in">
            <div className="bd-wrap">
              <div className="bd-join__card">
                <h2 className="bd-h2" style={{ fontSize: 28 }}>{val(v, "heading") || "Join bodies."}</h2>
                <p>{val(v, "subheading") || "First to know about new workouts and colourways. Nothing else."}</p>
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

    case "video_clips":
    default:
      return null;
  }
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
        {formatMoney(variant.priceCents, currency)}
        {saving ? <s>{formatMoney(variant.compareAtCents!, currency)}</s> : null}
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
  // The gallery: the studio shot leads, then the cut-out in a white bordered
  // square, the folded shot, the screen detail, then the phone photos. Real
  // files only.
  const gallery: { src: string; product?: boolean }[] = [
    ...(way.studio ? [{ src: way.studio }] : []),
    ...(way.card ? [{ src: way.card, product: true }] : []),
    { src: `${M}/bd-pdp-detail.jpg` },
    { src: `${M}/bd-pdp-folded.jpg` },
    ...way.life.slice(0, 2).map((src) => ({ src })),
  ].filter((g, i, all) => all.findIndex((x) => x.src === g.src) === i);
  const [slide, setSlide] = useState(0);
  const go = (n: number) => setSlide((n + gallery.length) % gallery.length);
  const sold = variant.available <= 0;
  const monthly = Math.round(variant.priceCents / 4);
  const saving = variant.compareAtCents && variant.compareAtCents > variant.priceCents ? variant.compareAtCents - variant.priceCents : 0;
  const buyRef = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const target = buyRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const byType = new Map(page.sections.map((x) => [x.type, x] as const));
  const below = PDP_SECTIONS.map((t) => byType.get(t)).filter((x): x is LoadedSection => Boolean(x));

  return (
    <>
      <div className="bd-wrap bd-pdp">
        <div className="bd-car">
          <div className="bd-car__main">
            {gallery.map((g, i) => (
              <figure key={g.src} className={`${g.product ? "is-product" : ""}${i === slide ? " is-on" : ""}`} aria-hidden={i !== slide}>
                <img src={g.src} alt={i === 0 ? `${variant.label} board` : ""} loading={i === 0 ? "eager" : "lazy"} />
              </figure>
            ))}
            <button type="button" className="bd-car__arr bd-car__arr--l" aria-label="Previous" onClick={() => go(slide - 1)}>‹</button>
            <button type="button" className="bd-car__arr bd-car__arr--r" aria-label="Next" onClick={() => go(slide + 1)}>›</button>
          </div>
          <div className="bd-car__thumbs" role="tablist">
            {gallery.map((g, i) => (
              <button type="button" role="tab" key={g.src} aria-selected={i === slide} className={g.product ? "is-product" : undefined} onClick={() => setSlide(i)}>
                <img src={g.src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </div>

        <div className="bd-pdp__buybox">
          <div className="bd-pdp__top">
            <p className="bd-eyebrow">{page.product.title}</p>
            {saving ? <span className="bd-pdp__save">Save {formatMoney(saving, page.store.currency)}</span> : null}
          </div>
          <h1 className="bd-h1 bd-pdp__h1">{variant.label}</h1>
          {variant.sublabel ? <p className="bd-pdp__tag">{variant.sublabel}</p> : null}
          <div className="bd-pdp__ways" role="list" aria-label="Colourway">
            {page.variants.map((other) => (
              <a key={other.id} role="listitem" aria-current={other.id === variant.id} className="bd-pdp__way" href={`/products/${slug(other.label)}${storeParam}`}>
                {wayOf(other.label).card ? <img src={wayOf(other.label).card} alt="" loading="lazy" /> : null}
                <span>{other.label}</span>
              </a>
            ))}
          </div>

          <div className="bd-offer">
            <div className="bd-pdp__price">
              <b>{formatMoney(variant.priceCents, page.store.currency)}</b>
              {saving ? <s>{formatMoney(variant.compareAtCents!, page.store.currency)}</s> : null}
            </div>
            <p className="bd-pdp__later">or 4 × {formatMoney(monthly, page.store.currency)} with PayPal Pay in 4</p>
            <div className="bd-pdp__buy" ref={buyRef}>
              <button type="button" className="bd-btn bd-btn--big" disabled={sold} onClick={(event) => drawer?.add(variant.id, event.currentTarget)}>
                {sold ? "Sold out" : `Add to cart · ${formatMoney(variant.priceCents, page.store.currency)}`}
              </button>
            </div>
          </div>
          <p className="bd-pdp__sure">Free shipping worldwide · Card, Apple Pay, Google Pay, PayPal</p>

          <ul className="bd-pdp__get">
            <li>The board with the built-in screen</li>
            <li>Two resistance cables with foam handles</li>
            <li>Two ankle straps · two pads</li>
            <li>Charging cable</li>
          </ul>

          <div className="bd-acc">
            <details>
              <summary>Workouts</summary>
              <p>Pilates, sculpt, core, stretch and recovery, led on the screen. Every level, no phone propped on a chair.</p>
            </details>
            <details>
              <summary>Size & storage</summary>
              <p>The screen folds flat and the board stands on its end, so it lives under a bed or against a wall. Exact dimensions and weight are being confirmed.</p>
            </details>
            <details>
              <summary>Shipping & returns</summary>
              <p>Free shipping worldwide. Pay in 4 with PayPal Pay Later at checkout.</p>
            </details>
          </div>
        </div>
      </div>

      <div className="bd-claim">
        <div className="bd-wrap">
          <h2 className="bd-h1">Same studio feeling. Different location.</h2>
        </div>
      </div>

      <div className="bd-sec bd-sec--tight" id="proof">
        <div className="bd-wrap">
          <div className="bd-sec__head">
            <div>
              <h2 className="bd-h2">What the others don't have.</h2>
              <p className="bd-lede">A reformer, an instructor and a place to put it away. Any girl can do Pilates at home now.</p>
            </div>
          </div>
          <div className="bd-proof">
            {PROOF.map((x) => (
              <figure className="bd-proof__item" key={x.src}>
                <div className="bd-proof__pic"><img src={x.src} alt={x.title} loading="lazy" /></div>
                <figcaption>
                  <h3 className="bd-h3">{x.title}</h3>
                  <p>{x.text}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>

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

      {below.map((section) => (
        <Section key={section.id} section={section} page={page} storeParam={storeParam} />
      ))}

      <div className={`bd-stick${stuck ? " bd-stick--on" : ""}`} aria-hidden={!stuck}>
        <div className="bd-wrap bd-stick__in">
          {way.card ? <img src={way.card} alt="" /> : null}
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
