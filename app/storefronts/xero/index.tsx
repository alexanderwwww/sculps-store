/**
 * XERO Chiron storefront — store five.
 *
 * A launch page for a piece of hardware rather than a catalogue store: one long
 * dark scroll, full-bleed imagery, big tight type.
 *
 * Two rules from the brief shape the code more than the design does.
 *
 * First, the money path is the platform's own. The buy box is a plain form that
 * posts to /cart/add, which means it works with JavaScript switched off and
 * there is exactly one way a line item can be created. Nothing here hand-rolls
 * a POST to a checkout URL.
 *
 * Second, nothing is parked at opacity:0 waiting for a script. Every animated
 * thing is visible by default and the script's job is only to make it arrive
 * nicely — if the script never runs, the page is still whole.
 */
import { useEffect, useRef, useState } from "react";
import { href } from "react-router";
import type { LoadedProductPage, VariantRow } from "~/lib/store.server";
import { formatMoney } from "~/lib/money";
import { BRAND, HERO, FOOTER } from "./copy";

const IcoCart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 7h12l1 14H5L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" />
  </svg>
);

export function XeroStorefront({
  page,
  storeParam = "",
}: {
  page: LoadedProductPage;
  storeParam?: string;
}) {
  const { variants, addOns } = page;
  const [chosen, setChosen] = useState(() => {
    const i = variants.findIndex((v) => v.isDefault);
    return i < 0 ? 0 : i;
  });
  const variant: VariantRow | undefined = variants[chosen];

  // The $99 key is its own product, so ticking it adds a second line item and
  // never moves the price of the bike. That is the whole reason it is a
  // checkbox beside the buy box and not a third configuration.
  const key = addOns.find((v) => v.sku === "XC-KEY-01") ?? null;
  const [wantKey, setWantKey] = useState(false);

  return (
    <>
      <Header storeParam={storeParam} />
      <main>
        <Hero
          variants={variants}
          chosen={chosen}
          setChosen={setChosen}
          variant={variant}
          keyVariant={key}
          wantKey={wantKey}
          setWantKey={setWantKey}
          storeParam={storeParam}
        />
      </main>
      <Footer />
      <StickyBar variant={variant} storeParam={storeParam} />
    </>
  );
}

/* ------------------------------------------------------------------ chrome */

function Header({ storeParam }: { storeParam: string }) {
  return (
    <header className="x-hdr">
      <a className="x-brand" href={`/${storeParam}`}>{BRAND.wordmark}</a>
      <nav className="x-nav">
        <a href="#specs">Specifications</a>
        <a href="#key">The key</a>
        <a href="#faq">Questions</a>
      </nav>
      <a className="x-cart" href={`${href("/cart")}${storeParam}`} aria-label="Cart">{IcoCart}</a>
    </header>
  );
}

/* -------------------------------------------------------------------- hero */

function Hero({
  variants, chosen, setChosen, variant, keyVariant, wantKey, setWantKey, storeParam,
}: {
  variants: VariantRow[];
  chosen: number;
  setChosen: (i: number) => void;
  variant?: VariantRow;
  keyVariant: VariantRow | null;
  wantKey: boolean;
  setWantKey: (v: boolean) => void;
  storeParam: string;
}) {
  const [shot, setShot] = useState(0);
  const soldOut = (variant?.available ?? 0) <= 0;

  return (
    <section className="x-hero" id="top">
      <div>
        <div className="x-stage">
          {HERO.shots.map((src, i) => (
            <div key={src} className={`x-stage__shot${i === shot ? " is-on" : ""}`}>
              <img src={src} alt="" loading={i === 0 ? "eager" : "lazy"} decoding="async" />
            </div>
          ))}
        </div>
        <div className="x-rail">
          {HERO.shots.map((src, i) => (
            <button
              key={src}
              type="button"
              className={i === shot ? "is-on" : ""}
              aria-label={`View ${i + 1}`}
              onClick={() => setShot(i)}
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      </div>

      <div className="x-buy" id="buy">
        <h1>{HERO.title}</h1>
        <p className="x-buy__sub">{HERO.subtitle}</p>
        <p className="x-buy__body">{HERO.body}</p>
        <ul className="x-proc">
          {HERO.process.map((step) => <li key={step}>{step}</li>)}
        </ul>

        <p className="x-price">{variant ? formatMoney(variant.priceCents) : ""}</p>

        <form method="post" action={`${href("/cart/add")}${storeParam}`}>
          <input type="hidden" name="variantId" value={variant?.id ?? ""} />

          <div className="x-opts" role="radiogroup" aria-label="Configuration">
            {variants.map((v, i) => (
              <label key={v.id} className={`x-opt${i === chosen ? " is-on" : ""}`}>
                <input
                  type="radio"
                  name="configuration"
                  value={v.label}
                  checked={i === chosen}
                  onChange={() => setChosen(i)}
                />
                <span className="x-opt__row">
                  <span className="x-opt__name">{v.label}</span>
                  <span className="x-opt__price">{formatMoney(v.priceCents)}</span>
                </span>
                {v.sublabel ? <span className="x-opt__note">{v.sublabel}</span> : null}
              </label>
            ))}
          </div>

          {keyVariant ? (
            <label className="x-addon">
              <input
                type="checkbox"
                name="alsoVariantId"
                value={keyVariant.id}
                checked={wantKey}
                onChange={(e) => setWantKey(e.currentTarget.checked)}
              />
              <span className="x-addon__name">Add a spare {keyVariant.label.toLowerCase()}</span>
              <span className="x-addon__price">{formatMoney(keyVariant.priceCents)}</span>
            </label>
          ) : null}

          <button type="submit" className="x-btn" disabled={soldOut}>
            {soldOut ? "Sold out" : "Add to cart"}
          </button>
        </form>

        <ul className="x-bullets">
          {HERO.bullets.map((b) => <li key={b}>{b}</li>)}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- sticky bar */

function StickyBar({ variant, storeParam }: { variant?: VariantRow; storeParam: string }) {
  const [on, setOn] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const buy = document.getElementById("buy");
    if (!buy || typeof IntersectionObserver === "undefined") return;
    // Shown once the hero's own buy box has scrolled away, hidden while it is
    // on screen — two buy buttons competing for the same click is the thing
    // the brief calls out.
    const io = new IntersectionObserver(([e]) => setOn(!e.isIntersecting), { threshold: 0 });
    io.observe(buy);
    return () => io.disconnect();
  }, []);

  if (!variant) return null;
  return (
    <div className={`x-sticky${on ? " is-on" : ""}`} ref={bar}>
      <span className="x-sticky__t">{BRAND.wordmark} {BRAND.product}</span>
      <span className="x-sticky__p">{formatMoney(variant.priceCents)}</span>
      <form method="post" action={`${href("/cart/add")}${storeParam}`}>
        <input type="hidden" name="variantId" value={variant.id} />
        <button type="submit" className="x-btn">Add to cart</button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ footer */

function Footer() {
  return (
    <footer className="x-foot">
      <p className="x-foot__mark">{BRAND.wordmark}</p>
      <div className="x-foot__cols">
        <div className="x-foot__col">
          <h4>LEGAL</h4>
          {FOOTER.legal.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </div>
        <div className="x-foot__col">
          <h4>XERO</h4>
          <a href="/pages/about">About</a>
          <a href="/pages/contact">Contact</a>
          <a href="/pages/track">Track your build</a>
          <a href="/pages/activate">Activate your ID</a>
        </div>
      </div>
      <p className="x-foot__sign">{FOOTER.signOff} {BRAND.secondary}</p>
    </footer>
  );
}
