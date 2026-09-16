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

/** The store's logo, so the drawer is obviously this shop and not a template. */
const LOGO = "/media/3958921693410617.webp";

export function CartDrawerProvider({
  page,
  storeParam = "",
  photo,
  paypalClientId = null,
  children,
}: {
  page: LoadedProductPage;
  storeParam?: string;
  photo?: { src: string; alt: string } | null;
  /** PayPal's public client id, when the store has PayPal connected. */
  paypalClientId?: string | null;
  children: React.ReactNode;
}) {
  const href = (path: string) => `${path}${storeParam}`;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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

  // The upgrade: the dearer bundle, when the cart is not already on it.
  //
  // "Not in the cart" is not enough on its own. Once someone has taken the
  // bundle, the only variant left is the cheaper base one — and offering that
  // is asking them to spend less, under a heading that says "Add". So the
  // upsell has to cost more than what they are already holding, or there is
  // no upsell to make.
  const inCart = new Set(lines.map((l) => l.variantId));
  const paying = lines.reduce((top, l) => Math.max(top, l.unitPriceCents), 0);
  const upsell: VariantRow | null =
    lines.length && page.variants.length > 1
      ? page.variants
          .filter((v) => !inCart.has(v.id) && v.priceCents > paying)
          .reduce<VariantRow | null>((best, v) => (!best || v.priceCents > best.priceCents ? v : best), null)
      : null;

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
            <img className="cb-drawer__logo" src={LOGO} alt={page.store.name} />
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
                  <div className="cb-line__pic">
                    {l.imageUrl || photo ? (
                      <img src={l.imageUrl || photo!.src} alt={l.productTitle} loading="lazy" />
                    ) : null}
                  </div>
                  <div>
                    <div className="cb-line__t">{l.label}</div>
                    {l.sublabel ? <div className="cb-line__s">{l.sublabel}</div> : null}
                    <div className="cb-line__s">Qty {l.quantity}</div>
                  </div>
                  <div className="cb-line__p">{formatMoney(l.lineTotalCents, currency)}</div>
                </div>
              ))
            )}
          </div>

          {/* The upgrade, offered where the decision is still open. It is the
              other bundle, not an unrelated product — and only when it is not
              already the thing in the cart. */}
          {upsell ? (
            <button type="button" className="cb-up" onClick={() => swap(upsell.id)} disabled={busy}>
              <span className="cb-up__pic">
                {upsell.imageUrl ? <img src={upsell.imageUrl} alt="" /> : null}
              </span>
              <span className="cb-up__txt">
                <b>Add the 100" screen</b>
                <i>{upsell.label}</i>
              </span>
              <span className="cb-up__add">
                {/* What the swap actually costs on top of what is in the cart.
                    The upsell is only ever dearer than that, so this reads as
                    a plus and never as a minus with a plus in front of it. */}
                +{formatMoney(Math.max(0, upsell.priceCents - paying), currency)}
              </span>
            </button>
          ) : null}

          <div className="cb-drawer__foot">
            <div className="cb-drawer__sum">
              <span>Subtotal</span>
              <span>{formatMoney(cart?.subtotalCents ?? 0, currency)}</span>
            </div>
            <a className="cb-btn" href={href("/checkout")} aria-disabled={lines.length === 0}>
              Checkout
            </a>
            {/* Their own buttons, so the wallet someone already trusts is one
                tap away instead of a form. Nothing is priced here — the server
                prices the cart for both the create and the capture. */}
            {paypalClientId && lines.length ? (
              <div className="cb-drawer__wallets">
                <span className="cb-drawer__or">or pay with</span>
                <PayPalExpress clientId={paypalClientId} currency={currency} storeParam={storeParam} />
              </div>
            ) : null}
            <div className="cb-reassure">Free shipping · 30-day returns</div>
          </div>
        </div>
      </div>
    </Ctx.Provider>
  );
}
