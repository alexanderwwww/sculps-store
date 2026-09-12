/**
 * Garden Buddy — the slide-out cart.
 *
 * New markup. There is no live-store source for it: the live shop is on
 * Shopify's stock cart drawer, which is the thing he wants replaced. So it is
 * built out of the theme's own tokens and `gb-*` class conventions and nothing
 * else — no colour, radius or font here that is not already in `theme.css`.
 *
 * What it is: a right-hand panel on desktop, a full-height sheet on mobile,
 * over a native `<dialog>` so escape closes it, focus is trapped while it is
 * open and returns to whatever opened it, and the page behind cannot scroll.
 *
 * What drives it:
 *   - reading the cart — `useFetcher().load("/cart")`, the existing cart
 *     route's own loader, so prices are the server's and never the browser's.
 *   - writing — a plain `fetch()` to the existing `/cart/add` and `/cart`.
 *     Deliberately not `fetcher.submit`: `/cart/add` answers with a 302 to
 *     `/cart`, which a fetcher turns into a real navigation (the exact
 *     page-load the drawer exists to avoid), and any fetcher action also
 *     revalidates the storefront loader — which records a visit and re-fires
 *     ViewContent, so changing a quantity would inflate the store's own
 *     analytics. A small JSON cart endpoint would remove both; it is named in
 *     the report.
 *   - no JavaScript — the buy box keeps its plain form and the header keeps
 *     its `/cart` link, so the old flow still works untouched.
 */
import { ProductExpress } from "./product-express";
import { PayPalExpress } from "./paypal-express";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { LoadedProductPage, VariantRow } from "~/lib/store.server";
import { formatMoney } from "~/lib/money";

/* ------------------------------------------------------------------- types */

interface DrawerLine {
  variantId: string;
  quantity: number;
  label: string;
  sublabel: string | null;
  productTitle: string;
  unitPriceCents: number;
  lineTotalCents: number;
}

/** The shape of what `/cart`'s loader returns, as far as the drawer reads it. */
interface CartPayload {
  cart: {
    lines: DrawerLine[];
    subtotalCents: number;
    totalCents: number;
    currency: string;
    itemCount: number;
    /** worked out on the server; the drawer only ever displays it */
    discount: { code: string; label: string; amountCents: number } | null;
    discountReason: string | null;
  };
}

interface CartDrawerApi {
  /** Add a variant and show the drawer. */
  add: (variantId: string, opener: HTMLElement | null) => void;
  /** Show the drawer without adding anything (the header's cart button). */
  open: (opener: HTMLElement | null) => void;
}

const Ctx = createContext<CartDrawerApi | null>(null);

/** Null when the drawer is not mounted, e.g. inside a preview render. */
export function useCartDrawer(): CartDrawerApi | null {
  return useContext(Ctx);
}

/* ------------------------------------------------------------------ icons */
/* Both are already in the theme: the cart glyph is the header's, the close
   cross is the header burger's close icon. */

const IcoCart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7h12l1 14H5L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
);
const IcoClose = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

/* ---------------------------------------------------------------- provider */

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
  /** The buy box's first photo — the only picture of this product we hold. */
  photo?: { src: string; alt: string } | null;
  /** the store's Stripe publishable key, for the wallet buttons above Checkout */
  publishableKey?: string | null;
  /** PayPal's public client id, when the store has PayPal connected */
  paypalClientId?: string | null;
  children: React.ReactNode;
}) {
  const href = (path: string) => `${path}${storeParam}`;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const fetcher = useFetcher<CartPayload>();

  const reload = useCallback(() => {
    fetcher.load(href("/cart"));
    // fetcher identity is stable for the life of the component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeParam]);

  const show = useCallback((from: HTMLElement | null) => {
    opener.current = from;
    setOpen(true);
  }, []);

  // Arriving on ?cart=1 — the cart link, or /cart — opens the drawer at
  // once, and the flag is dropped from the address so a refresh or a back
  // does not open it again.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("cart") !== "1") return;
    show(null);
    params.delete("cart");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  }, [show]);

  const add = useCallback(
    (variantId: string, from: HTMLElement | null) => {
      show(from);
      setBusy(true);
      // `redirect: "manual"` keeps the 302 to /cart from being followed; the
      // Set-Cookie that mints the cart token is applied either way.
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

  // The code is text the customer typed. The server decides what it is worth
  // and answers with a sentence when it cannot be used.
  const [discountError, setDiscountError] = useState<string | null>(null);

  const sendDiscount = useCallback(
    (body: Record<string, string>) => {
      setBusy(true);
      setDiscountError(null);
      fetch(href("/cart"), {
        method: "POST",
        body: new URLSearchParams(body),
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      })
        .then((response) => response.json().catch(() => null))
        .then((data) => {
          const answer = data as { discountError?: string | null } | null;
          setDiscountError(answer?.discountError ?? null);
        })
        .catch(() => {
          setDiscountError("That code could not be checked just now. Please try again.");
        })
        .finally(() => {
          setBusy(false);
          reload();
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeParam, reload],
  );

  const close = useCallback(() => setOpen(false), []);

  // Opening loads the cart; the storefront's own loader does not carry it.
  useEffect(() => {
    if (open && fetcher.state === "idle" && !fetcher.data) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The dialog itself: modal for the focus trap and the backdrop, body scroll
  // locked behind it, focus handed back to whatever opened it.
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

  const api: CartDrawerApi = { add, open: show };
  const cart = (fetcher.data as CartPayload | undefined)?.cart ?? null;
  const loading = fetcher.state !== "idle" || busy;

  /**
   * The welcome-back card.
   *
   * Someone who filled a cart and came back later is the single warmest
   * visitor a store gets, and the old behaviour was to show her the home page
   * as though nothing had happened. This says "it is still here" once and
   * then never again that session — a popup that keeps reappearing is the
   * reason people hate popups.
   *
   * It only ever shows for a cart that already has something in it, so it
   * cannot fire at a first-time visitor.
   */
  const [recall, setRecall] = useState<null | CartPayload["cart"]>(null);
  const recallAsked = useRef(false);

  useEffect(() => {
    if (recallAsked.current) return;
    recallAsked.current = true;

    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem("gb:recall") === "1";
    } catch {
      /* private mode — treat as not dismissed */
    }
    if (dismissed) return;

    // The drawer opening on its own would be worse than a card: it covers the
    // page and it looks like a bug. So this asks the server quietly instead.
    const timer = setTimeout(() => {
      fetch(href("/cart"), { headers: { Accept: "application/json" } })
        .then((response) => (response.ok ? (response.json() as Promise<CartPayload>) : null))
        .then((payload) => {
          const found = payload?.cart;
          if (found && found.itemCount > 0) setRecall(found);
        })
        .catch(() => undefined);
    }, 1200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissRecall = useCallback(() => {
    setRecall(null);
    try {
      sessionStorage.setItem("gb:recall", "1");
    } catch {
      /* nothing to remember it with; it simply shows once per load */
    }
  }, []);

  return (
    <Ctx.Provider value={api}>
      {children}

      {recall ? (
        <div className="gb gb-recall" role="dialog" aria-label="Your cart is still here">
          <button type="button" className="gb-recall__x" onClick={dismissRecall} aria-label="Close">
            {IcoClose}
          </button>
          <div className="gb-recall__row">
            {photo ? <img className="gb-recall__img" src={photo.src} alt="" /> : null}
            <div className="gb-recall__body">
              <div className="gb-recall__kicker">Still in your cart</div>
              <div className="gb-recall__title">{recall.lines[0]?.productTitle ?? page.product.title}</div>
              <div className="gb-recall__meta">
                {recall.itemCount} item{recall.itemCount === 1 ? "" : "s"} ·{" "}
                <strong>{formatMoney(recall.totalCents, recall.currency)}</strong>
              </div>
            </div>
          </div>
          <div className="gb-recall__acts">
            <button
              type="button"
              className="gb-recall__go"
              onClick={() => {
                dismissRecall();
                show(null);
              }}
            >
              Back to my cart
            </button>
            <button type="button" className="gb-recall__no" onClick={dismissRecall}>
              Keep looking
            </button>
          </div>
        </div>
      ) : null}

      <dialog
        ref={dialogRef}
        className="gb gb-drawer"
        aria-modal="true"
        aria-label="Cart"
        onClose={close}
        onCancel={close}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
      >
        <div className="gb-drawer__panel" aria-busy={loading}>
          <div className="gb-drawer__head">
            <h2 className="gb-drawer__title">
              <span className="gb-drawer__title-ic" aria-hidden="true">
                {IcoCart}
              </span>
              Your cart
              {cart && cart.itemCount > 0 ? (
                <span className="gb-drawer__count">{cart.itemCount}</span>
              ) : null}
            </h2>
            <button type="button" className="gb-drawer__x" onClick={close} aria-label="Close cart">
              {IcoClose}
            </button>
          </div>

          <Shipping store={page.store} subtotalCents={cart?.subtotalCents ?? 0} />

          <div className="gb-drawer__body">
            {!cart ? (
              <p className="gb-drawer__note">Loading your cart…</p>
            ) : cart.lines.length === 0 ? (
              <div className="gb-drawer__empty">
                <p className="gb-drawer__note">Your cart is empty.</p>
                <button type="button" className="gb-btn gb-btn--ghost" onClick={close}>
                  Keep looking
                </button>
              </div>
            ) : (
              <ul className="gb-drawer__lines">
                {cart.lines.map((line) => (
                  <li className="gb-drawer__line" key={line.variantId}>
                    <div className="gb-drawer__shot">
                      {photo ? (
                        <img src={photo.src} alt={photo.alt} loading="lazy" />
                      ) : (
                        <div className="gb-ph">Product photo not added yet</div>
                      )}
                    </div>
                    <div className="gb-drawer__line-body">
                      <p className="gb-drawer__line-name">{line.label}</p>
                      <p className="gb-drawer__line-sub">{line.sublabel || line.productTitle}</p>
                      <div className="gb-drawer__qty" aria-label={`Quantity of ${line.label}`}>
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
                      </div>
                    </div>
                    <p className="gb-drawer__line-total">
                      {formatMoney(line.lineTotalCents, cart.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <Upsell
              variants={page.variants}
              currency={page.store.currency}
              inCart={cart ? cart.lines.map((l) => l.variantId) : []}
              onAdd={(variantId, from) => add(variantId, from)}
            />
          </div>

          <div className="gb-drawer__foot">
            <DiscountField
              currency={cart?.currency ?? page.store.currency}
              applied={cart?.discount ?? null}
              error={discountError ?? cart?.discountReason ?? null}
              busy={loading}
              onApply={(code) => sendDiscount({ intent: "discount", code })}
              onRemove={() => sendDiscount({ intent: "discount-remove" })}
            />
            <div className="gb-drawer__totals">
              <span>Subtotal</span>
              <strong>
                {formatMoney(cart?.subtotalCents ?? 0, cart?.currency ?? page.store.currency)}
              </strong>
            </div>
            <p className="gb-drawer__fine">Taxes and shipping are worked out at checkout.</p>
            {/* Apple Pay / Google Pay for the cart as it stands, one tap. */}
            {publishableKey && cart && cart.lines.length > 0 ? (
              <ProductExpress
                mode="cart"
                publishableKey={publishableKey}
                currency={cart.currency ?? page.store.currency}
                variantId={cart.lines[0].variantId}
                amountCents={cart.totalCents}
                label={`${page.store.name} order`}
                storeName={page.store.name}
                shippingCents={0}
                storeParam={storeParam}
                onReady={() => undefined}
              />
            ) : null}
            {/* PayPal, Pay Later and Venmo, on the cart as it stands. Their
                own SDK draws them, and they only appear when the store has
                PayPal connected. */}
            {paypalClientId && cart && cart.lines.length > 0 ? (
              <PayPalExpress
                clientId={paypalClientId}
                currency={cart.currency ?? page.store.currency}
                storeParam={storeParam}
              />
            ) : null}
            <a
              className="gb-drawer__checkout"
              href={href("/checkout")}
              aria-disabled={!cart || cart.lines.length === 0}
              onClick={(event) => {
                if (!cart || cart.lines.length === 0) event.preventDefault();
              }}
            >
              Checkout
            </a>
            {/* Apple Pay / Google Pay would go here. They come out of Stripe's
                payment element, which needs a payment intent, and a payment
                intent only exists once checkout has started — so there is
                nothing behind those buttons on this page. The slot is left out
                rather than drawn dead. */}
          </div>
        </div>
      </dialog>
    </Ctx.Provider>
  );
}

/* ---------------------------------------------------------------- discount */

/**
 * The discount code box.
 *
 * It holds nothing but the typed text. The applied line and the reason a code
 * was refused both come from the server, so this cannot show a saving the
 * server has not agreed to.
 */
function DiscountField({
  currency,
  applied,
  error,
  busy,
  onApply,
  onRemove,
}: {
  currency: string;
  applied: { code: string; label: string; amountCents: number } | null;
  error: string | null;
  busy: boolean;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const [code, setCode] = useState("");

  if (applied) {
    return (
      <>
        <div className="gb-drawer__totals" style={{ fontSize: 16 }}>
          <span>
            {applied.code} · {applied.label}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>−{formatMoney(applied.amountCents, currency)}</span>
            <button
              type="button"
              className="gb-drawer__x"
              onClick={onRemove}
              disabled={busy}
              aria-label={`Remove discount code ${applied.code}`}
            >
              {IcoClose}
            </button>
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="gb-drawer__up-head">Discount code</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          className="gb-co__input"
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && code.trim()) {
              event.preventDefault();
              onApply(code.trim());
            }
          }}
          placeholder="Discount code"
          aria-label="Discount code"
          aria-invalid={error ? "true" : undefined}
          style={{ minHeight: 48, flex: 1 }}
        />
        <button
          type="button"
          className="gb-drawer__up-add"
          onClick={() => onApply(code.trim())}
          disabled={busy || !code.trim()}
        >
          Apply
        </button>
      </div>
      {error ? (
        <span className="gb-co__err" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </span>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------- ship / upsell */

/**
 * Free shipping, straight off the store row. Always-free says so; a threshold
 * counts down to it; a store with neither gets no line at all — the number is
 * never guessed.
 */
function Shipping({
  store,
  subtotalCents,
}: {
  store: LoadedProductPage["store"];
  subtotalCents: number;
}) {
  if (store.shipAlwaysFree) {
    return <p className="gb-drawer__ship gb-drawer__ship--done">Free shipping on every order.</p>;
  }
  const threshold = store.shipFreeOverCents;
  if (threshold == null || threshold <= 0) return null;

  const left = threshold - subtotalCents;
  const pct = Math.max(0, Math.min(100, Math.round((subtotalCents / threshold) * 100)));
  return (
    <div className={`gb-drawer__ship${left <= 0 ? " gb-drawer__ship--done" : ""}`}>
      <p>
        {left <= 0 ? (
          "You have free shipping."
        ) : (
          <>
            You are <strong>{formatMoney(left, store.currency)}</strong> away from free shipping.
          </>
        )}
      </p>
      <span className="gb-drawer__bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

/** The bundles this cart does not have yet — real variants, real prices. */
function Upsell({
  variants,
  currency,
  inCart,
  onAdd,
}: {
  variants: VariantRow[];
  currency: string;
  inCart: string[];
  onAdd: (variantId: string, from: HTMLElement | null) => void;
}) {
  const rest = variants.filter((v) => !inCart.includes(v.id) && v.available > 0);
  if (rest.length === 0) return null;

  return (
    <div className="gb-drawer__up">
      <p className="gb-drawer__up-head">Add another bundle</p>
      <ul className="gb-drawer__up-list">
        {rest.map((variant) => (
          <li className="gb-drawer__up-item" key={variant.id}>
            <span className="gb-drawer__up-body">
              <span className="gb-drawer__up-name">{variant.label}</span>
              {variant.sublabel ? (
                <span className="gb-drawer__up-sub">{variant.sublabel}</span>
              ) : null}
            </span>
            <span className="gb-drawer__up-price">
              {variant.compareAtCents ? (
                <s>{formatMoney(variant.compareAtCents, currency)}</s>
              ) : null}
              <b>{formatMoney(variant.priceCents, currency)}</b>
            </span>
            <button
              type="button"
              className="gb-drawer__up-add"
              onClick={(event) => onAdd(variant.id, event.currentTarget)}
            >
              Add
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
