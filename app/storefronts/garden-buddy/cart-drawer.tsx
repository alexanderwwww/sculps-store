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
  compareAtCents: number | null;
  imageUrl: string | null;
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
  /** How many items are in the cart, for the header's badge. 0 until loaded. */
  itemCount: number;
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
          const code = pending.current;
          if (code) {
            pending.current = null;
            try {
              sessionStorage.removeItem("gb:offer");
            } catch {
              /* it was never stored */
            }
            sendDiscountRef.current?.({ intent: "discount", code });
            return;
          }
          reload();
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeParam, reload, show],
  );

  // `add` is defined before `sendDiscount`; the ref lets it reach the finished
  // function without reordering the two.
  const sendDiscountRef = useRef<((body: Record<string, string>) => void) | null>(null);

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

  sendDiscountRef.current = sendDiscount;

  const close = useCallback(() => setOpen(false), []);

  // The header's offer button carries its code in the address. The cart may
  // not exist yet, so the code is remembered and applied on the first add —
  // the server still decides what it is worth.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("discount");
    if (!code) return;
    pending.current = code;
    try {
      sessionStorage.setItem("gb:offer", code);
    } catch {
      /* nothing to remember it with; the click still works in this page */
    }
  }, []);
  useEffect(() => {
    if (pending.current) return;
    try {
      pending.current = sessionStorage.getItem("gb:offer");
    } catch {
      /* no storage, no carried-over offer */
    }
  }, []);

  // The header's badge needs the count before anything is opened, so the cart
  // is read once on mount.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const cart = (fetcher.data as CartPayload | undefined)?.cart ?? null;
  const api: CartDrawerApi = { add, open: show, itemCount: cart?.itemCount ?? 0 };
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
  const recallShown = useRef(false);

  /**
   * Ask, once, whether there is already a cart.
   *
   * Through the fetcher, not a bare `fetch("/cart")` — that address answers a
   * navigation with a whole HTML document, so parsing it as JSON threw and the
   * card silently never appeared. React Router's loader call is the only thing
   * that returns the cart as data.
   */
  useEffect(() => {
    if (recallAsked.current) return;
    recallAsked.current = true;

    try {
      if (sessionStorage.getItem("gb:recall") === "1") return;
    } catch {
      /* private mode — treat as not dismissed */
    }

    const timer = setTimeout(() => reload(), 1000);
    return () => clearTimeout(timer);
  }, [reload]);

  /**
   * The welcome-back card.
   *
   * Someone who filled a cart and came back later is the warmest visitor a
   * store gets, and the old behaviour was to show her the home page as though
   * nothing had happened. This says "it is still here" once and then never
   * again that session — a popup that keeps reappearing is the reason people
   * hate popups. It never shows while the drawer is open, and never for an
   * empty cart, so it cannot fire at a first-time visitor.
   */
  useEffect(() => {
    if (recallShown.current || open || !cart || cart.itemCount < 1) return;
    try {
      if (sessionStorage.getItem("gb:recall") === "1") return;
    } catch {
      /* nothing to remember it with */
    }
    recallShown.current = true;
    setRecall(cart);
  }, [cart, open]);

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
        (() => {
          const line = recall.lines[0];
          const shot = line?.imageUrl ?? photo?.src ?? null;
          // What it was, against what it is. Shown only when there is a real
          // saving — an invented one is worse than none.
          const was = line?.compareAtCents ?? null;
          const now = line?.unitPriceCents ?? 0;
          const saved = was && was > now ? was - now : 0;
          return (
            <div className="gb gb-recall" role="dialog" aria-modal="true" aria-label="Your cart is still here">
              <div className="gb-recall__scrim" onClick={dismissRecall} />
              <div className="gb-recall__box">
                <button type="button" className="gb-recall__x" onClick={dismissRecall} aria-label="Close">
                  {IcoClose}
                </button>

                {/* The product, big, on white — the way it looks in the shop. */}
                <div className="gb-recall__shot">
                  {shot ? <img src={shot} alt="" /> : null}
                  {saved > 0 ? (
                    <span className="gb-recall__save">Save {formatMoney(saved, recall.currency)}</span>
                  ) : null}
                </div>

                <div className="gb-recall__panel">
                  {page.store.logoUrl ? (
                    <img className="gb-recall__logo" src={page.store.logoUrl} alt={page.store.name} />
                  ) : (
                    <div className="gb-recall__word">{page.store.name}</div>
                  )}

                  <div className="gb-recall__kicker">Still in your cart</div>
                  <h2 className="gb-recall__title">You left this behind.</h2>

                  <div className="gb-recall__name">{line?.label ?? page.product.title}</div>

                  <div className="gb-recall__price">
                    {was && was > now ? <s>{formatMoney(was, recall.currency)}</s> : null}
                    <strong>{formatMoney(recall.totalCents, recall.currency)}</strong>
                  </div>

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
            </div>
          );
        })()
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
                      {/* The variant's own picture when it has one — the
                          bundles differ, so one shared photo would lie. */}
                      {line.imageUrl || photo ? (
                        <img
                          src={line.imageUrl ?? photo!.src}
                          alt={line.imageUrl ? line.label : photo!.alt}
                          loading="lazy"
                        />
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
              heading="Add another bundle"
              variants={page.variants}
              currency={page.store.currency}
              inCart={cart ? cart.lines.map((l) => l.variantId) : []}
              onAdd={(variantId, from) => add(variantId, from)}
            />

            {/* The store's other products, offered once the cart has something
                in it — an empty drawer is not the place to cross-sell. */}
            {cart && cart.lines.length > 0 ? (
              <Upsell
                heading="Goes with it"
                variants={page.addOns}
                currency={page.store.currency}
                inCart={cart.lines.map((l) => l.variantId)}
                onAdd={(variantId, from) => add(variantId, from)}
              />
            ) : null}
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
  heading,
  variants,
  currency,
  inCart,
  onAdd,
}: {
  heading: string;
  variants: VariantRow[];
  currency: string;
  inCart: string[];
  onAdd: (variantId: string, from: HTMLElement | null) => void;
}) {
  const rest = variants.filter((v) => !inCart.includes(v.id) && v.available > 0);
  if (rest.length === 0) return null;

  return (
    <div className="gb-drawer__up">
      <p className="gb-drawer__up-head">{heading}</p>
      <ul className="gb-drawer__up-list">
        {rest.map((variant) => {
          // The badge is worked out from the two prices. A variant with no
          // compare-at gets none rather than a made-up one.
          const off =
            variant.compareAtCents && variant.compareAtCents > variant.priceCents
              ? Math.round(((variant.compareAtCents - variant.priceCents) / variant.compareAtCents) * 100)
              : 0;
          const saved = variant.compareAtCents ? variant.compareAtCents - variant.priceCents : 0;
          return (
            <li className={`gb-drawer__up-item${off >= 40 ? " gb-drawer__up-item--deal" : ""}`} key={variant.id}>
              <span className="gb-drawer__up-shot">
                {variant.imageUrl ? (
                  <img src={variant.imageUrl} alt={variant.label} loading="lazy" />
                ) : (
                  <span className="gb-ph">No photo</span>
                )}
                {off > 0 ? <span className="gb-drawer__up-flag">−{off}%</span> : null}
              </span>
              <span className="gb-drawer__up-name">{variant.label}</span>
              <span className="gb-drawer__up-price">
                <b>{formatMoney(variant.priceCents, currency)}</b>
                {off > 0 ? <s>{formatMoney(variant.compareAtCents!, currency)}</s> : null}
              </span>
              {/* Half price or better is the whole reason to look twice, so it
                  is said in words as well as in the badge. */}
              {off >= 40 ? (
                <span className="gb-drawer__up-deal">
                  Save {formatMoney(saved, currency)} — only with this order
                </span>
              ) : variant.sublabel ? (
                <span className="gb-drawer__up-sub">{variant.sublabel}</span>
              ) : null}
              <button
                type="button"
                className="gb-drawer__up-add"
                onClick={(event) => onAdd(variant.id, event.currentTarget)}
                aria-label={`Add ${variant.label}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                Add
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
