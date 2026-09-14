/**
 * The bodies cart drawer.
 *
 * Its own, not Garden Buddy's: that one is styled with gb- classes and carries
 * a recall popup, a scratch card and an upsell carousel this brand does not
 * want. This is the same mechanism — the /cart route is the source of truth,
 * the browser only displays what the server priced — in this theme's language.
 *
 * Styles live in the `<style>` element rendered below (class prefix `bdc-`),
 * the way screen.tsx carries its own; only `.bd-btn` is borrowed from theme.css.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { LoadedProductPage, VariantRow } from "~/lib/store.server";
import { BUNDLE_OFF_CENTS, formatMoney } from "~/lib/money";
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
  /** the full price when the line is at the bundle price; null otherwise */
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
  };
}

/** One thing to put in the cart. `bundle` asks /cart/add for the bundle price. */
export interface AddItem {
  variantId: string;
  bundle?: boolean;
}
interface Api {
  add: (variantId: string, from: HTMLElement | null) => void;
  /**
   * Several lines, one after the other. The cart row is read-modify-write on
   * the server, so two adds in flight at once would lose one — these go in
   * sequence and the drawer reloads once at the end.
   */
  addMany: (items: AddItem[], from: HTMLElement | null) => void;
  open: (from: HTMLElement | null) => void;
  itemCount: number;
}
const Ctx = createContext<Api | null>(null);
export function useCartDrawer(): Api | null {
  return useContext(Ctx);
}

/** "$699" — whole prices shown whole, cents kept when there are any. */
const whole = (cents: number, currency: string) => formatMoney(cents, currency).replace(/\.00$/, "");
/** What the socks cost inside the bundle. Computed from the row, never typed. */
const bundleSocksCents = (socks: VariantRow) => Math.max(0, socks.priceCents - BUNDLE_OFF_CENTS);

const STRIP = ["Free shipping worldwide", "Pay in 4 with PayPal", "Screen built in"];

/* ----------------------------------------------------------------- styles */

const CSS = `
.bdc-drawer{border:0;padding:0;width:100%;max-width:440px;height:100dvh;max-height:100dvh;margin:0 0 0 auto;background:#fff;color:var(--ink,#0B0C0E);font-family:var(--body,"Instrument Sans",sans-serif);box-shadow:-24px 0 60px rgba(11,12,14,.18);overscroll-behavior:contain}
.bdc-drawer::backdrop{background:rgba(11,12,14,.5)}
.bdc-drawer[open]{animation:bdc-in .38s cubic-bezier(.2,.7,.2,1)}
.bdc-drawer[open]::backdrop{animation:bdc-fade .32s ease-out}
@keyframes bdc-in{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes bdc-fade{from{opacity:0}to{opacity:1}}
.bdc-in{display:flex;flex-direction:column;height:100%;transition:opacity .2s}
.bdc-in[aria-busy="true"] .bdc-body,.bdc-in[aria-busy="true"] .bdc-foot{opacity:.6;pointer-events:none}
.bdc-body,.bdc-foot{transition:opacity .2s}

.bdc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 14px}
.bdc-head h2{display:flex;align-items:center;gap:10px;margin:0;font-family:var(--sans,"Archivo",sans-serif);font-weight:800;font-stretch:118%;font-size:20px;letter-spacing:-.02em;text-transform:uppercase;line-height:1}
.bdc-count{display:inline-grid;place-items:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:var(--ink,#0B0C0E);color:#fff;font-size:11px;font-weight:700;letter-spacing:0}
.bdc-x{width:38px;height:38px;border:0;background:transparent;color:inherit;cursor:pointer;display:grid;place-items:center;border-radius:50%;margin-right:-8px}
.bdc-x:hover{background:rgba(11,12,14,.06)}
.bdc-x:focus-visible{outline:3px solid var(--ink,#0B0C0E);outline-offset:2px}
.bdc-x svg{width:18px;height:18px}

.bdc-strip{background:var(--lime,#C6FF3D);color:var(--lime-ink,#0E1600);overflow:hidden;flex:0 0 auto}
.bdc-strip__track{display:flex;width:max-content;animation:bdc-slide 28s linear infinite}
.bdc-strip:hover .bdc-strip__track{animation-play-state:paused}
.bdc-strip__run{display:flex;align-items:center;gap:28px;list-style:none;margin:0;padding:8px 14px}
.bdc-strip__run li{font-family:var(--sans,"Archivo",sans-serif);font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;white-space:nowrap;display:flex;align-items:center;gap:28px}
.bdc-strip__run li::after{content:"·";opacity:.5}
@keyframes bdc-slide{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}

.bdc-body{flex:1 1 auto;overflow-y:auto;padding:4px 20px 20px}
.bdc-line{display:grid;grid-template-columns:96px 1fr auto;gap:14px;align-items:center;padding-block:16px;border-bottom:1px solid var(--rule-2,rgba(11,12,14,.06));border-radius:12px}
.bdc-line.is-new{animation:bdc-pulse 1.4s ease-out}
@keyframes bdc-pulse{0%{background:rgba(198,255,61,.55);box-shadow:0 0 0 6px rgba(198,255,61,.55)}100%{background:transparent;box-shadow:0 0 0 6px transparent}}
.bdc-line__pic{width:96px;height:96px;border-radius:12px;background:#fff;box-shadow:inset 0 0 0 1px var(--rule,rgba(11,12,14,.12));overflow:hidden;display:grid;place-items:center}
.bdc-line__pic img{width:100%;height:100%;object-fit:cover;display:block}
.bdc-line__body{display:grid;gap:4px;min-width:0}
.bdc-line__name{font-family:var(--sans,"Archivo",sans-serif);font-weight:800;font-stretch:112%;font-size:14px;text-transform:uppercase;line-height:1.1;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bdc-tag{display:inline-block;padding:3px 7px;border-radius:999px;background:var(--lime,#C6FF3D);color:var(--lime-ink,#0E1600);font-size:8.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;line-height:1}
.bdc-line__note{font-size:13px;color:var(--ink-2,#4E525B);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bdc-qty{display:inline-flex;align-items:center;margin-top:6px;border-radius:999px;box-shadow:inset 0 0 0 1.5px var(--ink,#0B0C0E);width:max-content}
.bdc-qty button{width:32px;height:32px;border:0;background:transparent;color:inherit;font:inherit;font-size:18px;line-height:1;cursor:pointer;border-radius:999px}
.bdc-qty button:hover{background:rgba(11,12,14,.06)}
.bdc-qty button[disabled]{opacity:.35;cursor:not-allowed}
.bdc-qty button:focus-visible{outline:2px solid var(--ink,#0B0C0E);outline-offset:-2px}
.bdc-qty span{min-width:22px;text-align:center;font-family:var(--sans,"Archivo",sans-serif);font-weight:700;font-size:13px}
.bdc-line__price{display:grid;justify-items:end;gap:2px;font-family:var(--sans,"Archivo",sans-serif);font-weight:800;font-size:15px;white-space:nowrap}
.bdc-line__price s{color:var(--ink-3,#8A8F99);font-weight:400;font-size:12px}

.bdc-up{display:grid;grid-template-columns:56px 1fr auto;gap:12px;align-items:center;margin-top:16px;padding:12px;border-radius:14px;border:1px solid var(--rule,rgba(11,12,14,.12));background:#fff}
.bdc-up__pic{width:56px;height:56px;border-radius:10px;overflow:hidden;background:#fff;box-shadow:inset 0 0 0 1px var(--rule,rgba(11,12,14,.12));display:grid;place-items:center}
.bdc-up__pic img{width:100%;height:100%;object-fit:cover;display:block}
.bdc-up__pic span{font-family:var(--sans,"Archivo",sans-serif);font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;text-align:center;padding:4px;color:var(--ink-2,#4E525B)}
.bdc-up__body{display:grid;gap:3px;min-width:0}
.bdc-up__kick{font-family:var(--sans,"Archivo",sans-serif);font-size:9.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2,#4E525B)}
.bdc-up__txt{font-size:13.5px;line-height:1.3}
.bdc-up__txt b{font-family:var(--sans,"Archivo",sans-serif);font-weight:800}

.bdc-empty{display:grid;justify-items:start;gap:16px;padding:40px 0}
.bdc-empty p{margin:0;font-family:var(--sans,"Archivo",sans-serif);font-weight:800;font-stretch:118%;font-size:26px;letter-spacing:-.02em;text-transform:uppercase;line-height:1}
.bdc-note{margin:32px 0;font-size:14px;color:var(--ink-2,#4E525B)}

.bdc-foot{flex:0 0 auto;border-top:1px solid var(--rule,rgba(11,12,14,.12));padding:14px 20px calc(16px + env(safe-area-inset-bottom));display:grid;gap:10px;background:#fff}
.bdc-tot{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--sans,"Archivo",sans-serif);font-weight:800;font-size:15px;text-transform:uppercase;letter-spacing:.02em}
.bdc-tot span:last-child{font-size:18px}
.bdc-four{margin:-6px 0 0;font-size:12.5px;color:var(--ink-2,#4E525B)}
.bdc-four b{color:var(--ink,#0B0C0E);font-weight:600}
.bdc-pay{display:flex;gap:6px;flex-wrap:wrap;list-style:none;margin:2px 0 0;padding:0}
.bdc-pay li{width:38px;height:24px;border-radius:6px;box-shadow:inset 0 0 0 1px var(--rule,rgba(11,12,14,.12));background:#fff;overflow:hidden;display:grid;place-items:center}
.bdc-pay svg{width:38px;height:24px;display:block}
.bdc-checkout{display:flex;justify-content:center;gap:8px}
.bdc-checkout span{opacity:.7;font-weight:700}
.bdc-drawer .gb-drawer__wallet{margin:0;border-radius:999px;overflow:hidden}
.bdc-drawer .gb-drawer__wallet:empty{display:none}
.bdc-drawer .gb-drawer__wallet-err,.bdc-drawer .gb-ppx__err{margin:0;color:#B3341C;font-size:13px;line-height:1.4}
.bdc-drawer .gb-ppx:empty{display:none}

@media (max-width:480px){.bdc-drawer{max-width:none}.bdc-line{grid-template-columns:84px 1fr auto;gap:12px}.bdc-line__pic{width:84px;height:84px}}
@media (prefers-reduced-motion:reduce){.bdc-drawer[open],.bdc-drawer[open]::backdrop,.bdc-strip__track,.bdc-line.is-new{animation:none}}
`;

/* ------------------------------------------------------ payment badges */
/* Drawn here as marks, not fetched: nothing external, nothing that can 404. */

const Badges = (
  <ul className="bdc-pay" aria-label="Apple Pay, Google Pay, PayPal, Visa, Mastercard and American Express accepted">
    <li title="Apple Pay">
      <svg viewBox="0 0 38 24" aria-hidden="true">
        <path d="M11.3 8.2c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.4-.7 2.1.8.1 1.6-.4 2.1-1zm.7 1.2c-1.2-.1-2.1.6-2.7.6-.6 0-1.4-.6-2.3-.6-1.2 0-2.3.7-2.9 1.8-1.2 2.1-.3 5.3.9 7 .6.9 1.3 1.8 2.2 1.8.9 0 1.2-.6 2.3-.6s1.4.6 2.3.6c1 0 1.6-.9 2.2-1.7.7-1 1-1.9 1-2 0 0-1.9-.7-1.9-2.9 0-1.8 1.5-2.7 1.6-2.7-.9-1.3-2.2-1.4-2.7-1.3z" fill="#0B0C0E" />
        <text x="17.5" y="17" fontFamily="Archivo, Helvetica, Arial, sans-serif" fontWeight="700" fontSize="9.5" fill="#0B0C0E">Pay</text>
      </svg>
    </li>
    <li title="Google Pay">
      <svg viewBox="0 0 38 24" aria-hidden="true">
        <text x="5" y="16.5" fontFamily="Archivo, Helvetica, Arial, sans-serif" fontWeight="700" fontSize="10" fill="#4285F4">G</text>
        <text x="14" y="16.5" fontFamily="Archivo, Helvetica, Arial, sans-serif" fontWeight="600" fontSize="9.5" fill="#5F6368">Pay</text>
      </svg>
    </li>
    <li title="PayPal">
      <svg viewBox="0 0 38 24" aria-hidden="true">
        <text x="4" y="16" fontFamily="Archivo, Helvetica, Arial, sans-serif" fontWeight="800" fontStyle="italic" fontSize="9" fill="#003087">Pay</text>
        <text x="19.5" y="16" fontFamily="Archivo, Helvetica, Arial, sans-serif" fontWeight="800" fontStyle="italic" fontSize="9" fill="#009CDE">Pal</text>
      </svg>
    </li>
    <li title="Visa">
      <svg viewBox="0 0 38 24" aria-hidden="true">
        <text x="7" y="16.5" fontFamily="Archivo, Helvetica, Arial, sans-serif" fontWeight="800" fontStyle="italic" fontSize="11" letterSpacing="-.3" fill="#1A1F71">VISA</text>
      </svg>
    </li>
    <li title="Mastercard">
      <svg viewBox="0 0 38 24" aria-hidden="true">
        <circle cx="15" cy="12" r="6.5" fill="#EB001B" />
        <circle cx="23" cy="12" r="6.5" fill="#F79E1B" fillOpacity=".9" />
      </svg>
    </li>
    <li title="American Express">
      <svg viewBox="0 0 38 24" aria-hidden="true">
        <rect x="3" y="4" width="32" height="16" rx="2" fill="#2E77BC" />
        <text x="19" y="15.5" textAnchor="middle" fontFamily="Archivo, Helvetica, Arial, sans-serif" fontWeight="800" fontSize="7" letterSpacing=".2" fill="#fff">AMEX</text>
      </svg>
    </li>
  </ul>
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

  // The lines an add just put in; they get the highlight once the cart
  // comes back from the server with them in it.
  const pendingFlash = useRef<string[] | null>(null);
  const [flash, setFlash] = useState<string[]>([]);

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

  const post = useCallback(
    (item: AddItem) => {
      const url = new URL(href("/cart/add"), window.location.origin);
      if (item.bundle) url.searchParams.set("bundle", "1");
      return fetch(url.toString(), {
        method: "POST",
        body: new URLSearchParams({ variantId: item.variantId }),
        credentials: "same-origin",
        redirect: "manual",
      }).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeParam],
  );

  const addMany = useCallback(
    (items: AddItem[], from: HTMLElement | null) => {
      show(from);
      setBusy(true);
      pendingFlash.current = items.map((i) => i.variantId);
      items
        .reduce<Promise<unknown>>((chain, item) => chain.then(() => post(item)), Promise.resolve())
        .finally(() => {
          setBusy(false);
          reload();
        });
    },
    [post, reload, show],
  );

  const add = useCallback((variantId: string, from: HTMLElement | null) => addMany([{ variantId }], from), [addMany]);

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

  // The cart came back after an add: pulse the lines that add put in.
  useEffect(() => {
    if (!cart || fetcher.state !== "idle" || !pendingFlash.current) return;
    const ids = pendingFlash.current;
    pendingFlash.current = null;
    setFlash(ids);
    const timer = setTimeout(() => setFlash([]), 1500);
    return () => clearTimeout(timer);
  }, [cart, fetcher.state]);

  const api: Api = { add, addMany, open: show, itemCount: cart?.itemCount ?? 0 };
  const loading = busy || fetcher.state !== "idle";
  const currency = cart?.currency ?? page.store.currency;
  const lines = cart?.lines ?? [];
  const hasLines = lines.length > 0;

  // The board is this page's product; the socks are the add-ons. Offer the
  // matching socks only when the board is in and no socks are — by label,
  // the way the buy box pairs them.
  const boardIds = new Set(page.variants.map((v) => v.id));
  const sockIds = new Set(page.addOns.map((v) => v.id));
  const boardLine = lines.find((l) => boardIds.has(l.variantId)) ?? null;
  const hasSocks = lines.some((l) => sockIds.has(l.variantId));
  const boardVariant = boardLine ? page.variants.find((v) => v.id === boardLine.variantId) ?? null : null;
  const upsell =
    boardVariant && !hasSocks
      ? page.addOns.find((v) => v.label === boardVariant.label && v.available > 0) ?? null
      : null;

  return (
    <Ctx.Provider value={api}>
      {children}

      <dialog
        className="bdc-drawer"
        ref={dialogRef}
        aria-label="Your bag"
        onClose={close}
        onCancel={close}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="bdc-in" aria-busy={loading}>
          <div className="bdc-head">
            <h2>
              Your bag
              {cart && cart.itemCount > 0 ? <span className="bdc-count">{cart.itemCount}</span> : null}
            </h2>
            <button type="button" className="bdc-x" onClick={close} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <div className="bdc-strip" aria-label={STRIP.join(". ")}>
            <div className="bdc-strip__track" aria-hidden="true">
              {[0, 1].map((run) => (
                <ul className="bdc-strip__run" key={run}>
                  {STRIP.map((t) => <li key={t}>{t}</li>)}
                  {STRIP.map((t) => <li key={`${t}-2`}>{t}</li>)}
                </ul>
              ))}
            </div>
          </div>

          <div className="bdc-body">
            {!cart ? (
              <p className="bdc-note">One moment…</p>
            ) : !hasLines ? (
              <div className="bdc-empty">
                <p>Nothing in here yet.</p>
                <a className="bd-btn" href={`/${storeParam}`}>Shop the board</a>
              </div>
            ) : (
              <>
                {lines.map((line) => {
                  const bundled = line.compareAtCents != null && line.compareAtCents > line.unitPriceCents;
                  return (
                    <div className={`bdc-line${flash.includes(line.variantId) ? " is-new" : ""}`} key={line.variantId}>
                      <span className="bdc-line__pic">
                        {line.imageUrl || photo ? <img src={line.imageUrl ?? photo!.src} alt="" loading="lazy" /> : null}
                      </span>
                      <span className="bdc-line__body">
                        <span className="bdc-line__name">
                          {line.label}
                          {bundled ? <span className="bdc-tag">Bundle</span> : null}
                        </span>
                        <span className="bdc-line__note">{line.sublabel || line.productTitle}</span>
                        <span className="bdc-qty">
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
                      <span className="bdc-line__price">
                        <span>{whole(line.lineTotalCents, currency)}</span>
                        {bundled ? <s>{whole(line.compareAtCents! * line.quantity, currency)}</s> : null}
                      </span>
                    </div>
                  );
                })}

                {upsell ? (
                  <div className="bdc-up">
                    <span className="bdc-up__pic">
                      {upsell.imageUrl ? <img src={upsell.imageUrl} alt="" loading="lazy" /> : <span>{upsell.label}</span>}
                    </span>
                    <span className="bdc-up__body">
                      <span className="bdc-up__kick">Goes with it</span>
                      <span className="bdc-up__txt">
                        Add matching grip socks · <b>{whole(bundleSocksCents(upsell), currency)}</b> with the board
                      </span>
                    </span>
                    <button
                      type="button"
                      className="bd-btn bd-btn--sm"
                      onClick={(event) => addMany([{ variantId: upsell.id, bundle: true }], event.currentTarget)}
                      aria-label={`Add ${upsell.label} grip socks`}
                    >
                      Add
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {cart && hasLines ? (
            <div className="bdc-foot">
              <div className="bdc-tot">
                <span>Subtotal</span>
                <span>{whole(cart.subtotalCents, currency)}</span>
              </div>
              {/* The subtotal split four ways, computed — never typed. */}
              <p className="bdc-four">
                or 4 payments of <b>{formatMoney(Math.round(cart.subtotalCents / 4), currency)}</b> with PayPal Pay in 4
              </p>

              {Badges}

              {publishableKey ? (
                <ProductExpress
                  mode="cart"
                  publishableKey={publishableKey}
                  currency={currency}
                  variantId={lines[0].variantId}
                  amountCents={cart.totalCents}
                  label={page.store.name}
                  storeName={page.store.name}
                  shippingCents={0}
                  storeParam={storeParam}
                  onReady={() => undefined}
                />
              ) : null}
              {paypalClientId ? (
                <PayPalExpress clientId={paypalClientId} currency={currency} storeParam={storeParam} />
              ) : null}

              <a className="bd-btn bd-btn--big bdc-checkout" href={href("/checkout")}>
                Checkout <span aria-hidden="true">·</span> {whole(cart.totalCents, currency)}
              </a>
            </div>
          ) : null}
        </div>
      </dialog>
    </Ctx.Provider>
  );
}
