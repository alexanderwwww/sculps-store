/**
 * Ceiling Buddy's cart drawer.
 *
 * Same contract as Garden Buddy's — POST to /cart/add, read /cart, send the
 * customer to /checkout — with this store's own chrome. It is a separate file
 * rather than a shared one because the drawer's styling is part of the theme,
 * and the themes are deliberately not shared between stores.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { LoadedProductPage, VariantRow } from "~/lib/store.server";
import { formatMoney, savedAmount } from "~/lib/money";
import { PayPalExpress } from "../garden-buddy/paypal-express";
import { ProductExpress } from "../garden-buddy/product-express";

interface DrawerLine {
  variantId: string;
  quantity: number;
  label: string;
  sublabel: string | null;
  productTitle: string;
  unitPriceCents: number;
  lineTotalCents: number;
  compareAtCents: number | null;
  imageUrl: string | null;
}

interface CartPayload {
  cart: {
    lines: DrawerLine[];
    subtotalCents: number;
    totalCents: number;
    currency: string;
    itemCount: number;
    discount: { code: string; label: string; amountCents: number } | null;
    discountReason: string | null;
  };
}

interface CartDrawerApi {
  add: (variantId: string) => void;
  open: () => void;
  itemCount: number;
}

const Ctx = createContext<CartDrawerApi | null>(null);

/** Null when the drawer is not mounted, e.g. inside a preview render. */
export function useCartDrawer(): CartDrawerApi | null {
  return useContext(Ctx);
}

const IcoClose = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

/**
 * The fallback mark, for a store that has not uploaded one.
 *
 * It used to be the only mark: the drawer said "so it is obviously this shop
 * and not a template" and then hard-coded one shop's logo into the template,
 * so every borrower's cart opened under somebody else's name.
 */
const LOGO = "/media/3958921693410617.webp";

export function CartDrawerProvider({
  page,
  storeParam = "",
  photo,
  paypalClientId = null,
  publishableKey = null,
  children,
}: {
  page: LoadedProductPage;
  storeParam?: string;
  photo?: { src: string; alt: string } | null;
  /** PayPal's public client id, when the store has PayPal connected. */
  paypalClientId?: string | null;
  /** Stripe's publishable key, for the Apple Pay button. */
  publishableKey?: string | null;
  children: React.ReactNode;
}) {
  const href = (path: string) => `${path}${storeParam}`;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /* Stripe draws nothing when the browser has no wallet, but the element it
     mounts into is not empty, so a CSS :empty test cannot see that. The
     component says when it is ready; until it does the slot is not in the
     row at all and PayPal has the width to itself. */
  const [walletReady, setWalletReady] = useState(false);
  const fetcher = useFetcher<CartPayload>();
  const loaded = useRef(false);

  const reload = useCallback(() => {
    fetcher.load(href("/cart"));
    // fetcher identity is stable for the life of the component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeParam]);

  // One read on mount so the header badge is right before anyone clicks.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    reload();
  }, [reload]);

  /**
   * ?cart=1 — an add that happened without JavaScript.
   *
   * The form posts, the server puts the line in and sends the customer back
   * to the page they were on with this flag. Opening the drawer here is what
   * makes that path look identical to the instant one, instead of looking
   * like the button did nothing. The flag is then wiped from the address bar
   * so a refresh does not reopen it forever.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("cart") !== "1") return;
    setOpen(true);
    reload();
    url.searchParams.delete("cart");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [reload]);

  const add = useCallback(
    (variantId: string) => {
      if (!variantId) return;
      setBusy(true);
      setOpen(true);
      const body = new FormData();
      body.set("variantId", variantId);
      fetch(href("/cart/add"), { method: "POST", body })
        .then(() => reload())
        .finally(() => setBusy(false));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [reload, storeParam],
  );

  const show = useCallback(() => {
    setOpen(true);
    reload();
  }, [reload]);

  // Escape closes it, the way every drawer on the web does.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const cart = fetcher.data?.cart ?? null;
  const lines = cart?.lines ?? [];
  const currency = cart?.currency ?? page.store.currency;

  /* Prices, without the cents when there are none.
     "$199.00" and "+$70.00" are receipt formatting. The shop writes money
     the way a person says it. */
  const money = (cents: number, ccy: string) =>
    formatMoney(cents, ccy).replace(/([.,])00\b/, "");
  /* Money off is always whole dollars. "$48.01 off" is a number a computer
     wrote; nobody says it out loud and nobody believes it. */
  const off = (cents: number, ccy: string) => money(Math.round(cents / 100) * 100, ccy);

  // What the cart already saves against the same things at full price.
  const saved = lines.reduce(
    (n, l) => n + (l.compareAtCents && l.compareAtCents > l.unitPriceCents ? (l.compareAtCents - l.unitPriceCents) * l.quantity : 0),
    0,
  );

  /* The shelf: everything else the shop sells.
     Not "one upgrade and two add-ons" any more -- the whole range, sideways,
     because a cart is the one place somebody is already buying. The test
     product is excluded by hand: it exists to prove the checkout works and
     it was being offered to customers as an add-on at fifty cents. */
  const haveProducts = new Set(lines.map((l) => l.productTitle));
  const shelf = (page.addOnProducts ?? [])
    .filter((x) => (x.entryVariantId || x.variantId) && !haveProducts.has(x.title) && !/^test\b/i.test(x.title))
    .map((x) => {
      const compare = x.addCompareAtCents ?? 0;
      return { ...x, compareCents: compare, saveCents: compare > x.addCents ? compare - x.addCents : 0 };
    })
    .sort((a, b) => b.saveCents - a.saveCents || a.addCents - b.addCents);

  // Swapping a bundle replaces the cart rather than adding a second one —
  // nobody wants the tray twice.
  const swap = useCallback(
    (variantId: string) => {
      setBusy(true);
      const body = new FormData();
      body.set("variantId", variantId);
      fetch(href(`/cart/add?replace=1`), { method: "POST", body })
        .then(() => reload())
        .finally(() => setBusy(false));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [reload, storeParam],
  );

  return (
    <Ctx.Provider value={{ add, open: show, itemCount: cart?.itemCount ?? 0 }}>
      {children}

      <div className={`cb cb-drawer${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label="Cart">
        <div className="cb-drawer__veil" onClick={() => setOpen(false)} />
        <div className="cb-drawer__panel">
          <div className="cb-drawer__head">
            <img className="cb-drawer__logo" src={page.store.logoUrl ?? LOGO} alt={page.store.name} />
            <h3>Your cart</h3>
            <button type="button" className="cb-drawer__x" onClick={() => setOpen(false)} aria-label="Close">
              {IcoClose}
            </button>
          </div>

          <div className="cb-drawer__body">
            {busy && !lines.length ? (
              <div className="cb-drawer__empty">Adding…</div>
            ) : lines.length === 0 ? (
              <div className="cb-drawer__empty">Nothing in here yet.</div>
            ) : (
              lines.map((l) => (
                <div className="cb-line" key={l.variantId}>
                  {/* The picture of the thing they are actually buying.
                      It used to be a 74px thumbnail while the upsells beside
                      it were 200px, so the cart gave more room to what had
                      not been chosen than to what had. */}
                  <div className="cb-line__pic">
                    {l.imageUrl || photo ? (
                      <img src={l.imageUrl || photo!.src} alt={l.productTitle} />
                    ) : null}
                  </div>
                  <div className="cb-line__meta">
                    <div className="cb-line__t">{l.label}</div>
                    {l.sublabel ? <div className="cb-line__s">{l.sublabel}</div> : null}
                    <div className="cb-line__row">
                      <span className="cb-line__s">Qty {l.quantity}</span>
                      <span className="cb-line__p">
                        {l.compareAtCents && l.compareAtCents > l.unitPriceCents ? (
                          <s>{money(l.compareAtCents * l.quantity, currency)}</s>
                        ) : null}
                        {money(l.lineTotalCents, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Everything else the shop sells, sideways, with what each one
              actually saves against its own full price. No invented numbers:
              a tile only carries a banner when that variant has a compare-at
              price above what it costs. */}
          {shelf.length ? (
            <div className="cb-shelf">
              <div className="cb-shelf__h">Goes with this</div>
              <div className="cb-shelf__row">
                {shelf.map((x) => (
                  <button type="button" className="cb-shelf__item" key={x.id} onClick={() => add(x.entryVariantId || x.variantId)} disabled={busy}>
                    <span className="cb-shelf__pic">
                      {x.imageUrl ? <img src={x.imageUrl} alt="" loading="lazy" /> : null}
                      {/* Across the top of the photograph, so the saving is
                          read first and the row costs no extra height. */}
                      {x.saveCents > 0 ? (
                        <span className="cb-shelf__flag">{off(x.saveCents, currency)} off</span>
                      ) : null}
                    </span>
                    <span className="cb-shelf__t">{x.title}</span>
                    <span className="cb-shelf__p">
                      {x.compareCents > x.addCents ? <s>{money(x.compareCents, currency)}</s> : null}
                      {money(x.addCents, currency)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* What they are about to pay, then the three ways to pay it.
              This sits above everything on offer: the decision already made
              gets the top of the drawer, and the ones not made yet go under
              it. It was the other way round. */}
          <div className="cb-drawer__foot">
            <div className="cb-drawer__sum">
              <span>Subtotal</span>
              <span>{money(cart?.subtotalCents ?? 0, currency)}</span>
            </div>
            {saved > 0 ? (
              <div className="cb-drawer__saved">You save {money(saved, currency)}</div>
            ) : null}
            <a className="cb-btn" href={href("/checkout")} aria-disabled={lines.length === 0}>
              Checkout
            </a>
            {/* Apple Pay and PayPal, side by side and half-width each, so the
                two of them together take the room one used to. Venmo and Pay
                Later are gone from here -- three ways to pay is a choice, six
                is a menu. */}
            {lines.length && (publishableKey || paypalClientId) ? (
              <div className="cb-drawer__wallets">
                {publishableKey ? (
                  <div className={walletReady ? "cb-drawer__wallet" : "cb-drawer__wallet is-idle"}>
                    <ProductExpress
                      mode="cart"
                      publishableKey={publishableKey}
                      currency={currency}
                      variantId={lines[0]!.variantId}
                      amountCents={cart?.totalCents ?? 0}
                      label={page.store.name}
                      storeName={page.store.name}
                      shippingCents={0}
                      storeParam={storeParam}
                      onReady={(hasWallet) => setWalletReady(hasWallet)}
                    />
                  </div>
                ) : null}
                {paypalClientId ? (
                  <div className="cb-drawer__wallet">
                    <PayPalExpress clientId={paypalClientId} currency={currency} storeParam={storeParam} only="paypal" />
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="cb-reassure">Free shipping · 30-day returns</div>
          </div>

        </div>
      </div>
    </Ctx.Provider>
  );
}
