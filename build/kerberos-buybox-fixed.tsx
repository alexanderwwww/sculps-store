/**
 * XERO buy box — restored to the order and content of the shipped Shopify build.
 *
 * Reference: sections/xero-hero.liquid on branch claude/xero-one-3d-launch-8vruox,
 * the <aside data-m="buy"> block, and build/paste/03-hero-compact.txt.
 *
 * WHAT WAS WRONG
 *
 * 1. The blurb sat between the subtitle and the price, so the price and the
 *    button were pushed down behind a paragraph. In the shipped build the blurb
 *    comes AFTER the button — the shopper reaches the price in one glance and
 *    reads the prose only if they are still deciding.
 * 2. "CHOOSE YOUR BUNDLE" was missing. Without it the two cards read as a list
 *    rather than a choice.
 * 3. "ADD-ONS" was missing, so the key looked like a third bike.
 * 4. There was no payment button. The platform's own express/wallet button sits
 *    ABOVE Add to cart — that is where Apple Pay appears.
 * 5. The configuration radios could not be selected at all: they were controlled
 *    inputs whose onChange never fired (React hydration error #418), and the
 *    input carried pointer-events:none so a click never reached it. The $5,598
 *    variant was unbuyable.
 *
 * THE FIX FOR (5), AND WHY IT IS SHAPED THIS WAY
 *
 * The radio's own value IS the variant id, and the group is named "variantId".
 * So the form posts the right variant with no hidden field and no JavaScript at
 * all — which is what the brief asks for. React is then free to fail, hydrate
 * late, or never run: the money path still works. `defaultChecked` rather than
 * `checked` keeps the input uncontrolled, so nothing can snap it back.
 * onChange only updates the displayed price.
 */

import { useState } from "react";

type VariantRow = {
  id: string;
  label: string;
  sublabel?: string | null;
  priceCents: number;
  available?: number;
};

export function BuyBox({
  variants,
  keyVariant,
  storeParam,
  copy,
  formAction,
  PaymentButton,
}: {
  variants: VariantRow[];
  keyVariant: VariantRow | null;
  storeParam: string;
  copy: {
    title: string;
    subtitle: string;
    process: string;
    body: string;
    points: string[];
  };
  /** must keep ?store=<slug> — without it the POST resolves to another store */
  formAction: string;
  /** the platform's own express/wallet button. Never hand-roll this. */
  PaymentButton?: React.ComponentType<{ variantId: string; withKey: boolean }>;
}) {
  const [chosen, setChosen] = useState(0);
  const [wantKey, setWantKey] = useState(false);

  const variant = variants[chosen];
  const total =
    (variant?.priceCents ?? 0) + (wantKey && keyVariant ? keyVariant.priceCents : 0);

  const money = (cents: number) =>
    (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <aside className="x-buy" id="buy" aria-label="Buy box">
      <h1 className="x-buy__title">{copy.title}</h1>
      <p className="x-buy__sub">{copy.subtitle}</p>
      <p className="x-buy__proc">{copy.process}</p>

      <p className="x-price" aria-live="polite">{money(total)}</p>

      <form method="post" action={formAction}>
        <p className="x-buy__label" id="bundle-label">CHOOSE YOUR BUNDLE</p>

        <div className="x-opts" role="radiogroup" aria-labelledby="bundle-label">
          {variants.map((v, i) => (
            <label key={v.id} className="x-opt">
              {/* The radio's value is the variant id and the group is named
                  variantId, so the form posts correctly with JS switched off. */}
              <input
                type="radio"
                name="variantId"
                value={v.id}
                defaultChecked={i === 0}
                onChange={() => setChosen(i)}
              />
              <span className="x-opt__row">
                <span className="x-opt__name">{v.label}</span>
                <span className="x-opt__price">{money(v.priceCents)}</span>
              </span>
              {v.sublabel ? <span className="x-opt__note">{v.sublabel}</span> : null}
            </label>
          ))}
        </div>

        {keyVariant ? (
          <>
            <p className="x-buy__label">ADD-ONS</p>
            <label className="x-addon">
              {/* A separate product: ticking it adds a SECOND line item. It must
                  never raise the bike's price. */}
              <input
                type="checkbox"
                name="alsoVariantId"
                value={keyVariant.id}
                defaultChecked={false}
                onChange={(e) => setWantKey(e.currentTarget.checked)}
              />
              <span className="x-addon__name">Add a spare {keyVariant.label.toLowerCase()}</span>
              <span className="x-addon__price">{money(keyVariant.priceCents)}</span>
            </label>
          </>
        ) : null}

        {/* Wallet button first — this is where Apple Pay renders — then the
            plain add to cart underneath it, exactly as the Shopify build had it. */}
        {PaymentButton && variant ? (
          <div className="x-paybtn">
            <PaymentButton variantId={variant.id} withKey={wantKey} />
          </div>
        ) : null}

        <button type="submit" className="x-btn x-btn--secondary">Add to cart</button>
      </form>

      <p className="x-buy__body">{copy.body}</p>

      <ul className="x-points">
        {copy.points.map((p) => (
          <li key={p}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 8.4l3.1 3.1L13 4.6" />
            </svg>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/* The copy, verbatim from the shipped build. The off-road line is deliberately
   not here: it belongs in Terms of service section 6, not in page copy. */
export const XERO_BUY_COPY = {
  title: "XERO Chiron.",
  subtitle: "980 Nm · 120 km/h",
  process: "Order · Quality and safety check · Delivered to your door",
  body:
    "An electric off-road motorcycle designed to run without a key or a barrel. " +
    "Your phone lies flat in the tank, charges while you ride, and the system is " +
    "designed so that only your paired phone wakes the machine. Design intent, not " +
    "an independently tested security rating.",
  points: [
    "Paired to your client ID before dispatch",
    "Free delivery within the United States, to your door on a tail-lift vehicle, never a parcel courier",
    "30-day returns — we arrange and pay for collection",
  ],
};
