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
import type { LoadedProductPage } from "~/lib/store.server";
import { formatMoney } from "~/lib/money";

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

export function CartDrawerProvider({
  page,
  storeParam = "",
  photo,
  children,
}: {
  page: LoadedProductPage;
  storeParam?: string;
  photo?: { src: string; alt: string } | null;
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

  return (
    <Ctx.Provider value={{ add, open: show, itemCount: cart?.itemCount ?? 0 }}>
      {children}

      <div className={`cb cb-drawer${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label="Cart">
        <div className="cb-drawer__veil" onClick={() => setOpen(false)} />
        <div className="cb-drawer__panel">
          <div className="cb-drawer__head">
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

          <div className="cb-drawer__foot">
            <div className="cb-drawer__sum">
              <span>Subtotal</span>
              <span>{formatMoney(cart?.subtotalCents ?? 0, currency)}</span>
            </div>
            <a className="cb-btn" href={href("/checkout")} aria-disabled={lines.length === 0}>
              Checkout
            </a>
            <div className="cb-reassure">Free shipping · 30-day returns</div>
          </div>
        </div>
      </div>
    </Ctx.Provider>
  );
}
