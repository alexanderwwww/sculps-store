/**
 * Apple Pay and Google Pay under Buy now, on Square.
 *
 * One tap on the product page: the wallet sheet shows the price the customer
 * is looking at and hands back who and where, the chosen bundle is put in the
 * cart, and the server charges the token. The server re-prices the cart and
 * never takes more than the sheet showed (it can take less, when a discount on
 * the cart applies). A browser without a wallet draws nothing.
 */
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Square?: any;
  }
}

let loading: Promise<void> | null = null;
function loadSquare(): Promise<void> {
  if (typeof window !== "undefined" && window.Square) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://web.squarecdn.com/v1/square.js";
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("square.js"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function SquareWallets({
  appId,
  locationId,
  variantId,
  amountCents,
  currency,
  storeName,
  storeParam = "",
  row = false,
}: {
  appId: string;
  locationId: string;
  /** the bundle to buy; absent in the cart drawer, where the cart is already the order */
  variantId?: string;
  amountCents: number;
  currency: string;
  storeName: string;
  storeParam?: string;
  /** side by side, half width each, under a small "Express checkout" label (the cart drawer) */
  row?: boolean;
}) {
  const googleRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const afterMsgRef = useRef<HTMLDivElement>(null);
  const [hasAfter, setHasAfter] = useState(false);
  const apple = useRef<any>(null);
  const [hasApple, setHasApple] = useState(false);
  const [hasGoogle, setHasGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const [error, setError] = useState<string | null>(null);
  // The click handlers read the current bundle, not the one at mount.
  const live = useRef({ variantId, amountCents });
  live.current = { variantId, amountCents };

  const charge = async (result: any) => {
    if (result?.status !== "OK" || !result.token) {
      if (result?.status !== "Cancel") setError(result?.errors?.[0]?.message ?? "The payment was not completed. Nothing has been charged.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (live.current.variantId) {
        // replace=1 is read from the address, not the body: this cart becomes
        // exactly the bundle on the sheet, so the totals match.
        const add = new URLSearchParams({ variantId: live.current.variantId });
        const addUrl = `/cart/add${storeParam ? `${storeParam}&` : "?"}replace=1`;
        const added = await fetch(addUrl, { method: "POST", body: add, headers: { "X-Cart-Ajax": "1" }, credentials: "same-origin" });
        if (!added.ok) {
          setError("That bundle could not be added. Nothing has been charged.");
          setBusy(false);
          return;
        }
      }
      const contact = result.details?.shipping?.contact ?? result.details?.billing ?? {};
      const body = new FormData();
      body.set("mode", "pay");
      body.set("source", "wallet");
      body.set("sourceId", result.token);
      body.set("maxCents", String(live.current.amountCents));
      body.set("name", [contact.givenName, contact.familyName].filter(Boolean).join(" "));
      body.set("email", String(contact.email ?? ""));
      body.set("phone", String(contact.phone ?? ""));
      body.set("address1", String((contact.addressLines ?? [])[0] ?? ""));
      body.set("address2", String((contact.addressLines ?? [])[1] ?? ""));
      body.set("city", String(contact.city ?? ""));
      body.set("region", String(contact.state ?? ""));
      body.set("postalCode", String(contact.postalCode ?? ""));
      body.set("country", String(contact.countryCode ?? "US"));
      const response = await fetch(`/checkout/square${storeParam}`, { method: "POST", body, credentials: "same-origin" });
      const payload = (await response.json().catch(() => ({ error: "The payment could not be completed. Nothing has been charged." }))) as { ok?: boolean; orderId?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.orderId) {
        setError(payload.error ?? "The payment could not be completed. Nothing has been charged.");
        setBusy(false);
        return;
      }
      window.location.href = `/thanks?order=${payload.orderId}`;
    } catch {
      setError("We could not confirm your payment. Please check your email for a receipt before trying again.");
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const made: any[] = [];
    (async () => {
      try {
        await loadSquare();
        const payments = window.Square.payments(appId, locationId);
        const request = payments.paymentRequest({
          countryCode: "US",
          currencyCode: currency.toUpperCase(),
          total: { amount: (amountCents / 100).toFixed(2), label: storeName },
          requestShippingContact: true,
        });
        try {
          const ap = await payments.applePay(request);
          if (!cancelled) {
            apple.current = ap;
            setHasApple(true);
          }
        } catch {
          if (!cancelled) setHasApple(false);
        }
        try {
          const gp = await payments.googlePay(request);
          made.push(gp);
          if (cancelled || !googleRef.current) return;
          googleRef.current.innerHTML = "";
          await gp.attach(googleRef.current, { buttonColor: "black", buttonSizeMode: "fill", buttonType: "long" });
          if (cancelled) return;
          googleRef.current.onclick = async (event) => {
            event.preventDefault();
            if (busyRef.current) return;
            await charge(await gp.tokenize());
          };
          setHasGoogle(true);
        } catch {
          if (!cancelled) setHasGoogle(false);
        }
        // Afterpay: Square only gives it when the account and this amount
        // qualify, so it appears exactly when it can be paid with.
        try {
          const ap = await payments.afterpayClearpay(request);
          made.push(ap);
          ap.addEventListener("afterpay_shippingaddresschanged", () => ({
            shippingOptions: [
              {
                id: "free",
                label: "Free shipping",
                amount: "0.00",
                total: (amountCents / 100).toFixed(2),
                taxLineItems: [{ label: "Tax", amount: "0.00" }],
              },
            ],
          }));
          if (cancelled || !afterRef.current) return;
          afterRef.current.innerHTML = "";
          await ap.attach(afterRef.current);
          if (cancelled) return;
          afterRef.current.onclick = async (event) => {
            event.preventDefault();
            if (busyRef.current) return;
            await charge(await ap.tokenize());
          };
          if (afterMsgRef.current) {
            afterMsgRef.current.innerHTML = "";
            await ap.attachMessaging(afterMsgRef.current).catch(() => undefined);
          }
          setHasAfter(true);
        } catch {
          if (!cancelled) setHasAfter(false);
        }
      } catch {
        /* Square could not load; the Buy now button still works */
      }
    })();
    return () => {
      cancelled = true;
      for (const w of made) Promise.resolve(w?.destroy?.()).catch(() => undefined);
    };
    // Rebuilt when the bundle (and so the price on the sheet) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, locationId, amountCents]);

  return (
    <div className={`cb-wallet cb-sqwallet${row ? " cb-sqwallet--row" : ""}`} data-ready={hasApple || hasGoogle || hasAfter ? "1" : undefined}>
      {row ? <div className="cb-sqwallet__label"><span>Express checkout</span></div> : null}
      {hasApple ? (
        <button
          type="button"
          className="cb-sqwallet__apple"
          aria-label="Buy with Apple Pay"
          disabled={busy}
          // tokenize must be the first thing the click does, or Safari refuses the sheet.
          onClick={() => {
            if (busyRef.current) return;
            const pending = apple.current?.tokenize();
            if (pending) void pending.then(charge).catch(() => setError("Apple Pay was not completed. Nothing has been charged."));
          }}
        />
      ) : null}
      <div className="cb-sqwallet__google" ref={googleRef} hidden={!hasGoogle} />
      <div className="cb-sqwallet__after" ref={afterRef} hidden={!hasAfter} />
      {row ? null : <div className="cb-sqwallet__aftermsg" ref={afterMsgRef} hidden={!hasAfter} />}
      {error ? (
        <p className="cb-sqwallet__err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
