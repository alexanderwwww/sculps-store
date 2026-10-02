/**
 * "Pay over time" messaging, drawn by Stripe from the real amount.
 *
 * Stripe's Payment Method Messaging Element works out, for this exact price,
 * which Klarna and Affirm plans a customer would be offered and writes the
 * sentence itself ("4 interest-free payments of $75 with Klarna", "as low as
 * $N/mo with Affirm"), with the legally required terms behind its info icon.
 * Nothing about an installment amount is typed or computed by this store.
 *
 * It runs on the pay-over-time Stripe account's publishable key (public by
 * design), separate from the card account the rest of the page uses. Until
 * the element says it is ready, `fallback` stands in; if Stripe cannot be
 * reached the fallback simply stays.
 */
import { useEffect, useRef, useState } from "react";

const SRC = "https://js.stripe.com/v3/";

function loadStripeJs(): Promise<void> {
  const w = window as any;
  if (w.Stripe) return Promise.resolve();
  if (w.__gbStripeLoad) return w.__gbStripeLoad;
  w.__gbStripeLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Stripe could not be loaded."));
    document.head.appendChild(script);
  });
  return w.__gbStripeLoad;
}

export function BnplMessage({
  publishableKey,
  amountCents,
  currency = "USD",
  compact = false,
  fallback = null,
  className,
}: {
  publishableKey: string | null;
  amountCents: number;
  currency?: string;
  compact?: boolean;
  fallback?: React.ReactNode;
  className?: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!publishableKey || !(amountCents > 0)) return;
    let dead = false;
    let element: any = null;
    setReady(false);
    loadStripeJs()
      .then(() => {
        if (dead || !host.current) return;
        const w = window as any;
        w.__bnplStripe = w.__bnplStripe ?? {};
        const stripe = (w.__bnplStripe[publishableKey] ??= w.Stripe(publishableKey));
        const elements = stripe.elements({
          appearance: {
            variables: {
              fontSizeBase: compact ? "12px" : "15px",
              colorText: "#17120f",
              colorTextSecondary: "#5b524b",
              fontFamily: "inherit",
              spacingUnit: "3px",
            },
          },
        });
        element = elements.create("paymentMethodMessaging", {
          amount: Math.round(amountCents),
          currency: currency.toUpperCase(),
          countryCode: "US",
          paymentMethodTypes: ["klarna", "affirm"],
        });
        element.on?.("ready", () => { if (!dead) setReady(true); });
        element.mount(host.current);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      try { element?.destroy(); } catch { /* already gone */ }
    };
  }, [publishableKey, amountCents, currency, compact]);

  if (!publishableKey) return null;
  return (
    <div className={className}>
      <div ref={host} />
      {!ready ? fallback : null}
    </div>
  );
}
