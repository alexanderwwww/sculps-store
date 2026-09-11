/**
 * Apple Pay (and Google Pay) on the product page itself.
 *
 * One tap on the bundle, one tap on the button, and the wallet sheet is up
 * with the address already in it — no cart, no checkout page, no typing. It
 * is the same money path as the checkout's wallet row, run from here:
 *
 *   sheet confirmed → the chosen bundle becomes the cart → the intent is
 *   made for that cart → the order row is written (the same action the
 *   checkout uses, with the same checks) → Stripe confirms the payment →
 *   the thank-you page.
 *
 * Nothing is charged that the server has not priced: the sheet shows the
 * bundle price, and if the server's figure differs (a code left on the cart,
 * a tax) the sheet is told so and the button is simply pressed again.
 *
 * Until Stripe has said which wallets this browser has, the plain black
 * "Buy now" underneath stays visible. Only a wallet that can actually take
 * money replaces it.
 */
import { useEffect, useRef, useState } from "react";

interface Props {
  /**
   * "product": the chosen bundle becomes the cart, then it is paid.
   * "cart": the cart as it stands is paid — the drawer's own button.
   */
  mode?: "product" | "cart";
  publishableKey: string;
  currency: string;
  variantId: string;
  amountCents: number;
  label: string;
  storeName: string;
  shippingCents: number;
  storeParam: string;
  /** called with true once a wallet button is actually on screen */
  onReady: (hasWallet: boolean) => void;
}

const STRIPE_SRC = "https://js.stripe.com/v3/";

function loadStripe(): Promise<void> {
  const w = window as any;
  if (w.Stripe) return Promise.resolve();
  if (w.__gbStripeLoad) return w.__gbStripeLoad;
  w.__gbStripeLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = STRIPE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Stripe could not be loaded."));
    document.head.appendChild(script);
  });
  return w.__gbStripeLoad;
}

export function ProductExpress(props: Props) {
  const { mode = "product", publishableKey, currency, variantId, amountCents, label, storeName, shippingCents, storeParam, onReady } = props;
  const className = mode === "cart" ? "gb-drawer__wallet" : "gb-buy__wallet";
  const rowRef = useRef<HTMLDivElement | null>(null);
  const elementsRef = useRef<any>(null);
  const stripeRef = useRef<any>(null);
  const latest = useRef({ variantId, amountCents, label });
  latest.current = { variantId, amountCents, label };
  const [error, setError] = useState<string | null>(null);

  const href = (path: string) => `${path}${storeParam}`;
  const rates = () => [{ id: "standard", amount: shippingCents, displayName: shippingCents === 0 ? "Free shipping" : "Shipping" }];

  useEffect(() => {
    let cancelled = false;
    let express: any = null;

    const boot = async () => {
      await loadStripe();
      if (cancelled || !rowRef.current) return;
      const stripe = (window as any).Stripe(publishableKey);
      const elements = stripe.elements({
        mode: "payment",
        amount: Math.max(50, latest.current.amountCents),
        currency: currency.toLowerCase(),
        appearance: { variables: { borderRadius: "999px" } },
      });
      stripeRef.current = stripe;
      elementsRef.current = elements;

      express = elements.create("expressCheckout", {
        buttonHeight: 52,
        buttonTheme: { applePay: "black", googlePay: "black" },
        layout: { overflow: "never" },
        paymentMethods: {
          applePay: typeof (window as any).ApplePaySession !== "undefined" ? "always" : "never",
          googlePay: "always",
          link: "never",
        },
      });

      express.on("ready", (event: any) => {
        const available = event?.availablePaymentMethods;
        const any = Boolean(available && Object.values(available).some(Boolean));
        if (!cancelled) onReady(any);
      });

      // The sheet is opening: this is where it is told what it is for.
      express.on("click", (event: any) => {
        event.resolve({
          emailRequired: true,
          phoneNumberRequired: true,
          billingAddressRequired: true,
          shippingAddressRequired: true,
          shippingRates: rates(),
          lineItems: [{ name: latest.current.label, amount: latest.current.amountCents }],
          business: { name: storeName },
        });
      });

      express.on("shippingaddresschange", (event: any) => {
        try {
          event.resolve({ shippingRates: rates() });
        } catch {
          /* nothing to do */
        }
      });
      express.on("shippingratechange", (event: any) => {
        try {
          event.resolve({});
        } catch {
          /* nothing to do */
        }
      });

      express.on("confirm", async (event: any) => {
        setError(null);
        try {
          const submitted = await elements.submit();
          if (submitted?.error) throw new Error(submitted.error.message ?? "Please check the payment details.");

          // 1. On the product page this bundle, and only this bundle, becomes
          //    the cart. In the drawer the cart is already what it is.
          if (mode === "product") {
            await fetch(`${href("/cart/add")}${storeParam ? "&" : "?"}replace=1`, {
              method: "POST",
              body: new URLSearchParams({ variantId: latest.current.variantId }),
              credentials: "same-origin",
              redirect: "manual",
            });
          }

          // 2. A payment intent for that cart.
          const intentRes = await fetch(href("/checkout/intent"), { method: "POST", body: new URLSearchParams(), credentials: "same-origin" });
          const intent = (await intentRes.json()) as { clientSecret: string | null; error: string | null };
          if (!intent.clientSecret) throw new Error(intent.error ?? "The payment could not be started.");

          // 3. The order, through the checkout's own action and checks.
          const details = event?.billingDetails ?? {};
          const shipping = event?.shippingAddress ?? null;
          const address = shipping?.address ?? details.address ?? {};
          const body = new URLSearchParams({
            intent: "pay",
            source: "wallet",
            shownTotal: String(latest.current.amountCents + shippingCents),
            name: String(shipping?.name ?? details.name ?? "").trim(),
            email: String(details.email ?? "").trim(),
            phone: String(details.phone ?? "").trim(),
            address1: String(address.line1 ?? "").trim(),
            address2: String(address.line2 ?? "").trim(),
            city: String(address.city ?? "").trim(),
            region: String(address.state ?? "").trim(),
            postalCode: String(address.postal_code ?? "").trim(),
            country: String(address.country ?? "").trim().toUpperCase(),
          });
          const payRes = await fetch(href("/checkout/pay"), { method: "POST", body, credentials: "same-origin" });
          const answer = (await payRes.json()) as any;
          if (!answer?.ok) {
            if (answer?.repriced && typeof answer.totalCents === "number") {
              elements.update({ amount: Math.max(50, answer.totalCents) });
              throw new Error(`The total is ${(answer.totalCents / 100).toFixed(2)} ${currency.toUpperCase()} — tap the button once more to pay that amount.`);
            }
            throw new Error(answer?.error ?? "The order could not be placed.");
          }
          if (answer.repriced) {
            elements.update({ amount: Math.max(50, answer.totalCents) });
            throw new Error(`The total is ${(answer.totalCents / 100).toFixed(2)} ${currency.toUpperCase()} — tap the button once more to pay that amount.`);
          }

          // 4. The charge. Stripe takes over and lands on the thank-you page.
          const result = await stripe.confirmPayment({
            elements,
            clientSecret: answer.clientSecret,
            confirmParams: { return_url: answer.returnTo },
          });
          if (result?.error) throw new Error(result.error.message ?? "The payment did not go through.");
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : "The payment did not go through.";
          setError(message);
          try {
            event.paymentFailed({ reason: "fail" });
          } catch {
            /* the sheet may already be gone */
          }
        }
      });

      express.mount(rowRef.current);
    };

    boot().catch((failure: Error) => {
      if (!cancelled) setError(failure.message);
    });
    return () => {
      cancelled = true;
      try {
        express?.unmount();
      } catch {
        /* never mounted */
      }
    };
    // Mounted once; the amount follows the bundle below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishableKey]);

  // A different bundle: the sheet must say its price.
  useEffect(() => {
    try {
      elementsRef.current?.update?.({ amount: Math.max(50, amountCents) });
    } catch {
      /* not mounted yet */
    }
  }, [amountCents]);

  return (
    <>
      <div ref={rowRef} className={className} />
      {error ? (
        <p className={mode === "cart" ? "gb-drawer__wallet-err" : "gb-buy__wallet-err"} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
