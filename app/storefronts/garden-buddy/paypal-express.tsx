/**
 * PayPal, Pay Later and Venmo, wherever a cart exists.
 *
 * One component for the cart drawer and anywhere else the buttons belong, so
 * the SDK is loaded once per page and the create/capture contract lives in a
 * single place. Their own SDK draws them — these are the buttons people have
 * already pressed a thousand times somewhere else, not an imitation.
 *
 * Nothing about money is sent from here. `/checkout/paypal` prices the cart
 * on the server for both the create and the capture, so a tampered page buys
 * nothing at a price nobody agreed to.
 */
import { useEffect, useRef, useState } from "react";

let sdkPromise: Promise<void> | null = null;

/** One script per page, however many places ask for the buttons. */
function loadSdk(clientId: string, currency: string): Promise<void> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    const params = new URLSearchParams({
      "client-id": clientId,
      currency: currency.toUpperCase(),
      components: "buttons",
      // Pay Later is the reason this is worth having: instalments for US
      // customers, which a Greek Stripe account cannot offer.
      "enable-funding": "venmo,paylater",
      // The card fields belong to Stripe on this site. Two card forms next to
      // each other is a worse checkout, not a better one.
      "disable-funding": "card",
    });
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?${params}`;
    script.async = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("PayPal SDK blocked")));
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export function PayPalExpress({
  clientId,
  currency,
  storeParam = "",
  beforeCreate,
}: {
  clientId: string;
  currency: string;
  storeParam?: string;
  /**
   * Run before the PayPal order is created. The drawer needs nothing here —
   * what it shows is already the cart. A product page does: the thing being
   * bought has to be in the cart before PayPal is asked for a total.
   */
  beforeCreate?: () => Promise<void>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const drawn = useRef(false);
  // The buttons are rendered once; this keeps the callback current without
  // tearing them down and drawing them again.
  const latest = useRef(beforeCreate);
  latest.current = beforeCreate;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (drawn.current || !host.current) return;
    drawn.current = true;
    let cancelled = false;

    loadSdk(clientId, currency)
      .then(() => {
        const sdk = (window as any).paypal;
        const element = host.current;
        if (cancelled || !sdk?.Buttons || !element?.isConnected) return;

        sdk
          .Buttons({
            style: { layout: "vertical", shape: "pill", height: 46, label: "paypal", tagline: false },
            createOrder: async () => {
              if (latest.current) await latest.current();
              const response = await fetch(`/checkout/paypal${storeParam}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ step: "create" }),
              });
              const payload = (await response.json()) as { id?: string; error?: string };
              if (!response.ok || !payload.id) throw new Error(payload.error ?? "PayPal could not start.");
              return payload.id;
            },
            onApprove: async (data: { orderID: string }) => {
              const response = await fetch(`/checkout/paypal${storeParam}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ step: "capture", orderID: data.orderID }),
              });
              const payload = (await response.json()) as { ok?: boolean; orderId?: string; error?: string };
              if (!response.ok || !payload.ok || !payload.orderId) {
                setError(payload.error ?? "PayPal could not take the payment. Nothing has been charged.");
                return;
              }
              window.location.href = `/thanks?order=${encodeURIComponent(payload.orderId)}${
                storeParam ? `&${storeParam.replace(/^\?/, "")}` : ""
              }`;
            },
            onError: () =>
              setError("PayPal could not be reached. Nothing has been charged — checkout still works."),
            // Closing the window is not a failure and must not look like one.
            onCancel: () => setError(null),
          })
          .render(element)
          .catch(() => undefined);
      })
      // A blocked SDK is silent. The Checkout button below is untouched and
      // the customer is not told about a problem they cannot do anything with.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [clientId, currency, storeParam]);

  return (
    <div className="gb-ppx">
      <div ref={host} />
      {error ? (
        <p className="gb-ppx__err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
