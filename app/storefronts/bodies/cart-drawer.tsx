/**
 * The bodies cart drawer.
 *
 * Its own, not Garden Buddy's: that one is styled with gb- classes and carries
 * a recall popup, a scratch card and an upsell carousel this brand does not
 * want. This is the same mechanism — the /cart route is the source of truth,
 * the browser only displays what the server priced — in this theme's language.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { LoadedProductPage } from "~/lib/store.server";
import { formatMoney } from "~/lib/money";
import { ProductExpress } from "~/storefronts/garden-buddy/product-express";
import { PayPalExpress } from "~/storefronts/garden-buddy/paypal-express";

interface DrawerLine {
  variantId: string;
  quantity: number;
  label: string;
  sublabel: string | null;
  productTitle: string;
  unitPriceCents: number;
  lineTotalCents: number;
  imageUrl: string | null;
}
interface CartPayload {
  cart: {
    lines: DrawerLine[];
    subtotalCents: number;
    totalCents: number;
    currency: string;
    itemCount: number;
  };
}

interface Api {
  add: (variantId: string, from: HTMLElement | null) => void;
  open: (from: HTMLElement | null) => void;
  itemCount: number;
}
const Ctx = createContext<Api | null>(null);
export function useCartDrawer(): Api | null {
  return useContext(Ctx);
}

export function CartDrawerProvider({
  page,
  storeParam = "",
  photo,
  publishableKey = null,
  paypalClientId = null,
  children,
}: {
  page: LoadedProductPage;
  storeParam?: string;
  photo?: { src: string; alt: string } | null;
  publishableKey?: string | null;
  paypalClientId?: string | null;
  children: React.ReactNode;
}) {
  const href = (p: string) => `${p}${storeParam}`;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const fetcher = useFetcher<CartPayload>();

  const reload = useCallback(() => {
    fetcher.load(href("/cart"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeParam]);

  // The header badge needs the count before anything is opened.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = useCallback((from: HTMLElement | null) => {
    opener.current = from;
    setOpen(true);
  }, []);

  const add = useCallback(
    (variantId: string, from: HTMLElement | null) => {
      show(from);
      setBusy(true);
      fetch(href("/cart/add"), {
        method: "POST",
        body: new URLSearchParams({ variantId }),
        credentials: "same-origin",
        redirect: "manual",
      })
        .catch(() => {})
        .finally(() => {
          setBusy(false);
          reload();
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeParam, reload, show],
  );

  const setQuantity = useCallback(
    (variantId: string, quantity: number) => {
      setBusy(true);
      fetch(href("/cart"), {
        method: "POST",
        body: new URLSearchParams({ variantId, quantity: String(quantity) }),
        credentials: "same-origin",
      })
        .catch(() => {})
        .finally(() => {
          setBusy(false);
          reload();
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeParam, reload],
  );

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
    if (dialog.open) dialog.close();
    opener.current?.focus();
  }, [open]);

  const cart = (fetcher.data as CartPayload | undefined)?.cart ?? null;
  const api: Api = { add, open: show, itemCount: cart?.itemCount ?? 0 };
  const loading = busy || fetcher.state !== "idle";
  const currency = cart?.currency ?? page.store.currency;

  return (
    <Ctx.Provider value={api}>
      {children}

      <dialog
        className="bd-drawer"
        ref={dialogRef}
        aria-label="Cart"
        onClose={close}
        onCancel={close}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
      >
        <div className="bd-drawer__in" aria-busy={loading}>
          <div className="bd-drawer__head">
            <h2>Your cart</h2>
            <button type="button" className="bd-drawer__x" onClick={close} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <div className="bd-drawer__body">
            {!cart || cart.lines.length === 0 ? (
              <p className="bd-drawer__empty">{loading ? "One moment…" : "Nothing in here yet."}</p>
            ) : (
              cart.lines.map((line) => (
                <div className="bd-line" key={line.variantId}>
                  <span className="bd-line__pic">
                    {line.imageUrl || photo ? (
                      <img src={line.imageUrl ?? photo!.src} alt="" loading="lazy" />
                    ) : null}
                  </span>
                  <span>
                    <span className="bd-line__name">{line.label}</span>
                    <span className="bd-line__note">{line.sublabel || line.productTitle}</span>
                    <span className="bd-line__qty">
                      <button
                        type="button"
                        onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                        aria-label={line.quantity <= 1 ? `Remove ${line.label}` : `One fewer ${line.label}`}
                      >
                        −
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                        disabled={line.quantity >= 20}
                        aria-label={`One more ${line.label}`}
                      >
                        +
                      </button>
                    </span>
                  </span>
                  <span className="bd-line__total">{formatMoney(line.lineTotalCents, currency)}</span>
                </div>
              ))
            )}
          </div>

          <div className="bd-drawer__foot">
            <div className="bd-drawer__tot">
              <span>Subtotal</span>
              <span>{formatMoney(cart?.subtotalCents ?? 0, currency)}</span>
            </div>

            {publishableKey && cart && cart.lines.length > 0 ? (
              <ProductExpress
                mode="cart"
                publishableKey={publishableKey}
                currency={currency}
                variantId={cart.lines[0].variantId}
                amountCents={cart.totalCents}
                label={page.store.name}
                storeName={page.store.name}
                shippingCents={0}
                storeParam={storeParam}
                onReady={() => undefined}
              />
            ) : null}

            <a className="bd-btn bd-btn--big" href={href("/checkout")}>
              Checkout
            </a>

            {paypalClientId && cart && cart.lines.length > 0 ? (
              <PayPalExpress clientId={paypalClientId} currency={currency} storeParam={storeParam} />
            ) : null}
          </div>
        </div>
      </dialog>
    </Ctx.Provider>
  );
}
