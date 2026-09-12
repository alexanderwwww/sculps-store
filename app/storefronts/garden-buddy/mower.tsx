/**
 * The robot mower's own page.
 *
 * The shop sells one product from its root; this is the second thing it sells,
 * so it gets a page of its own. It is built the way the product page is built —
 * a gallery beside a buy panel, then the reasons, then a close — because a
 * second product that looks like a different website does not get bought from.
 *
 * The price, the strike-through and the first photo all come from the variant
 * row. The four garden shots are the product's own photography, named here
 * because this product has no gallery in the database to draw them from.
 */
import { useState } from "react";
import type { LoadedProductPage, VariantRow } from "~/lib/store.server";
import { formatMoney } from "~/lib/money";
import { CartDrawerProvider, useCartDrawer } from "./cart-drawer";
import { Header, Footer } from "./index";
import { ProductExpress } from "./product-express";
import { PayPalExpress } from "./paypal-express";

/** The gallery, in the order it is shown. The first is the variant's own shot. */
const SHOTS = [
  { src: "/media/gb-mower.png", alt: "Garden Buddy Robot Mower" },
  { src: "/media/gb-mower-1.png", alt: "The mower cutting a striped back lawn at golden hour" },
  { src: "/media/gb-mower-3.png", alt: "A woman having tea on the patio while the mower works" },
  { src: "/media/gb-mower-2.png", alt: "The mower parked on its charging dock beside the border" },
];

/** The four things worth saying about it, each with its one emoji. */
const POINTS = [
  { icon: "🌱", head: "It just cuts", body: "A little every day, so the lawn never looks like it needs doing." },
  { icon: "🔇", head: "You won't hear it", body: "Quieter than a conversation. Run it at seven in the morning if you want." },
  { icon: "🔋", head: "Puts itself away", body: "Runs the lawn down, drives back to the dock, charges, goes again." },
  { icon: "🌧️", head: "Stays out in the rain", body: "Weather-sealed. It lives outside — that is the whole point of it." },
];

export function MowerPage({
  page,
  variant,
  storeParam = "",
  publishableKey = null,
  paypalClientId = null,
}: {
  /** the store's product page — the drawer needs it, this page does not sell it */
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
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Caveat:wght@600;700&display=swap"
      />
      <div className="gb gb-mow">
        <Header page={page} storeParam={storeParam} />
        <main>
          <Buy
            variant={variant}
            currency={page.store.currency}
            storeName={page.store.name}
            storeParam={storeParam}
            publishableKey={publishableKey}
            paypalClientId={paypalClientId}
          />
          <Scene
            src={SHOTS[2].src}
            alt={SHOTS[2].alt}
            script="The best chair in the garden. 🪑"
            head="You did the kneeling. It can do the lawn."
            body="Set it once. From then on the grass is simply always cut, and the Saturday you used to spend on it is yours again."
          />
          <Points />
          <Scene
            src={SHOTS[3].src}
            alt={SHOTS[3].alt}
            flip
            script="Back to its corner. 🔌"
            head="It docks itself and waits."
            body="When the battery runs low it drives home, charges, and goes back out to finish. Nothing to plug in, nothing to put away."
          />
          <Close variant={variant} currency={page.store.currency} />
        </main>
        <Footer page={page} storeParam={storeParam} />
      </div>
    </CartDrawerProvider>
  );
}

/* ------------------------------------------------------------- buy section */

function Buy({
  variant,
  currency,
  storeName,
  storeParam,
  publishableKey,
  paypalClientId,
}: {
  variant: VariantRow;
  currency: string;
  storeName: string;
  storeParam: string;
  publishableKey: string | null;
  paypalClientId: string | null;
}) {
  const drawer = useCartDrawer();
  const [shot, setShot] = useState(0);
  // Hide the plain "Buy now" the moment Stripe draws a real wallet sheet —
  // two buttons that mean the same thing is a choice nobody wants.
  const [walletReady, setWalletReady] = useState(false);
  const href = (path: string) => `${path}${storeParam}`;
  const sold = variant.available <= 0;
  const save = variant.compareAtCents ? variant.compareAtCents - variant.priceCents : 0;
  const current = SHOTS[shot];

  return (
    <section className="gb-mow-buy gb-product" id="gb-buy">
      <div className="gb-wrap gb-mow-buy__grid">
        <div className="gb-mow-gal">
          <div className="gb-mow-gal__stage">
            <img src={current.src} alt={current.alt} width={1024} height={1024} />
          </div>
          <div className="gb-mow-gal__thumbs" role="tablist" aria-label="Photos">
            {SHOTS.map((s, i) => (
              <button
                type="button"
                role="tab"
                key={s.src}
                className="gb-mow-gal__thumb"
                aria-selected={i === shot}
                aria-label={s.alt}
                onClick={() => setShot(i)}
              >
                <img src={s.src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </div>

        <div className="gb-mow-buy__panel">
          <p className="gb-mow-buy__eyebrow">New from Garden Buddy</p>
          <h1 className="gb-mow-buy__h">The lawn cuts itself now. 🤖</h1>
          <p className="gb-mow-buy__sub">
            You knelt in the garden all spring. This is the part you get to stop doing.
          </p>

          <div className="gb-mow-buy__price">
            {variant.compareAtCents ? <s>{formatMoney(variant.compareAtCents, currency)}</s> : null}
            <b>{formatMoney(variant.priceCents, currency)}</b>
            {save > 0 ? <span className="gb-mow-buy__save">Save {formatMoney(save, currency)}</span> : null}
          </div>

          <ul className="gb-mow-buy__facts">
            <li className="gb-check">Cuts up to a quarter acre on its own</li>
            <li className="gb-check">Docks and charges itself, then carries on</li>
            <li className="gb-check">Rain-proof — it lives outside all season</li>
          </ul>

          {/* The same three ways to pay as the shop's own buy box. Without
              JavaScript the form still posts; with it the drawer opens in
              place, and "Buy now" goes straight through to the checkout. */}
          <form
            method="post"
            action={href("/cart/add")}
            onSubmit={(event) => {
              const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
              if (submitter?.classList.contains("gb-buy__express")) {
                event.currentTarget.action = `${href("/cart/add")}${storeParam ? "&" : "?"}next=checkout`;
                return;
              }
              if (!drawer) return;
              event.preventDefault();
              drawer.add(variant.id, event.currentTarget.querySelector<HTMLButtonElement>(".gb-buy__add"));
            }}
          >
            <input type="hidden" name="variantId" value={variant.id} />

            <button type="submit" className="gb-buy__add" disabled={sold}>
              <svg className="gb-buy__cart" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 3.5h2.2l2.3 11.2h10.3" /><path d="M6.4 6.6h14l-1.6 6.4H7.7" /><circle cx="9.5" cy="19.2" r="1.5" /><circle cx="17.5" cy="19.2" r="1.5" /></svg>
              <span>{sold ? "Sold out" : "Add to cart"}</span>
              {sold ? null : (
                <>
                  <span className="gb-buy__dot" aria-hidden="true">
                    &middot;
                  </span>
                  <span>{formatMoney(variant.priceCents, currency)}</span>
                </>
              )}
            </button>

            {/* Apple Pay on an iPhone or Safari, Google Pay elsewhere —
                mounted by Stripe only once it knows this browser has one. */}
            {publishableKey && !sold ? (
              <ProductExpress
                publishableKey={publishableKey}
                currency={currency}
                variantId={variant.id}
                amountCents={variant.priceCents}
                label={variant.label}
                storeName={storeName}
                shippingCents={0}
                storeParam={storeParam}
                onReady={setWalletReady}
              />
            ) : null}

            <button type="submit" className="gb-buy__express" disabled={sold} hidden={walletReady}>
              <span>Buy now</span>
            </button>
          </form>

          {/* PayPal has to be given something to charge for, so the mower goes
              into the cart before the order is opened. */}
          {paypalClientId && !sold ? (
            <PayPalExpress
              clientId={paypalClientId}
              currency={currency}
              storeParam={storeParam}
              beforeCreate={async () => {
                await fetch(href("/cart/add"), {
                  method: "POST",
                  body: new URLSearchParams({ variantId: variant.id }),
                  credentials: "same-origin",
                  redirect: "manual",
                }).catch(() => {});
              }}
            />
          ) : null}

          <ul className="gb-mow-buy__trust">
            <li>🚚 Free shipping</li>
            <li>↩️ 30-day returns</li>
            <li>🛡️ 2-year warranty</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- photo + copy bands */

function Scene({
  src,
  alt,
  script,
  head,
  body,
  flip = false,
}: {
  src: string;
  alt: string;
  script: string;
  head: string;
  body: string;
  flip?: boolean;
}) {
  return (
    <section className={`gb-mow-scene${flip ? " gb-mow-scene--flip" : ""}`}>
      <div className="gb-wrap gb-mow-scene__in">
        <div className="gb-mow-scene__shot">
          <img src={src} alt={alt} width={1024} height={1024} loading="lazy" />
        </div>
        <div className="gb-mow-scene__copy">
          <p className="gb-script gb-mow-scene__script">{script}</p>
          <h2 className="gb-h2">{head}</h2>
          <p className="gb-lede">{body}</p>
        </div>
      </div>
    </section>
  );
}

function Points() {
  return (
    <section className="gb-mow-pts">
      <div className="gb-wrap">
        <h2 className="gb-mow-pts__h">Four reasons it earns its spot in the shed</h2>
        <ul className="gb-mow-pts__list">
          {POINTS.map((point) => (
            <li className="gb-mow-pts__item" key={point.head}>
              <span className="gb-mow-pts__ico" aria-hidden="true">
                {point.icon}
              </span>
              <h3>{point.head}</h3>
              <p>{point.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Close({ variant, currency }: { variant: VariantRow; currency: string }) {
  const drawer = useCartDrawer();
  return (
    <section className="gb-mow-end">
      <div className="gb-wrap gb-mow-end__in">
        <p className="gb-script gb-mow-end__script">Go and sit down. 🪴</p>
        <h2 className="gb-mow-end__h">{variant.label}</h2>
        <p className="gb-mow-end__price">{formatMoney(variant.priceCents, currency)}</p>
        <form
          method="post"
          action="/cart/add"
          onSubmit={(event) => {
            if (!drawer) return;
            event.preventDefault();
            drawer.add(variant.id, event.currentTarget.querySelector<HTMLButtonElement>(".gb-mow-end__cta"));
          }}
        >
          <input type="hidden" name="variantId" value={variant.id} />
          <button type="submit" className="gb-mow-end__cta" disabled={variant.available <= 0}>
            {variant.available > 0 ? "Add to cart" : "Sold out"}
          </button>
        </form>
      </div>
    </section>
  );
}
