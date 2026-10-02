/**
 * Klarna and Affirm, as marks and short lines, for the product page, the
 * sticky bar, the cart and the announcement bar.
 *
 * The figures are not guesses. Through Stripe in the US, Klarna's "Pay in 4"
 * is four interest-free payments for orders of $1-$2,000 (Stripe's Klarna
 * docs), so a quarter of the price is the real instalment. Affirm's plans run
 * from four interest-free payments to monthly financing up to 36 months
 * (Stripe's Affirm guide), so its line names the plan, not a monthly figure
 * that depends on the customer's APR.
 */
import { formatMoney } from "~/lib/money";

export const KLARNA_PINK = "#FFB3C7";
export const AFFIRM_BLUE = "#4A4AF4";

/** Klarna's pink badge with its wordmark. */
export function KlarnaMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`pl-klarna ${className}`}
      aria-label="Klarna"
      style={{
        display: "inline-flex", alignItems: "center", background: KLARNA_PINK, color: "#0B051D",
        borderRadius: "999px", padding: ".18em .6em .2em", fontWeight: 800, fontSize: ".86em",
        letterSpacing: "-.02em", lineHeight: 1.05, whiteSpace: "nowrap", verticalAlign: "middle",
      }}
    >
      Klarna.
    </span>
  );
}

/** Affirm's wordmark with the blue arc over it. */
export function AffirmMark({ className = "", light = false }: { className?: string; light?: boolean }) {
  return (
    <span
      className={`pl-affirm ${className}`}
      aria-label="Affirm"
      style={{ display: "inline-flex", alignItems: "center", color: light ? "#fff" : "#0B051D", verticalAlign: "middle", lineHeight: 0 }}
    >
      <svg viewBox="0 0 64 22" aria-hidden="true" style={{ height: "1.35em", width: "auto", overflow: "visible" }}>
        <path d="M20 8.5 C 28 0.5, 46 0.5, 54 8.5" fill="none" stroke={AFFIRM_BLUE} strokeWidth="3.2" strokeLinecap="round" />
        <text x="32" y="20.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="currentColor" fontFamily="inherit" letterSpacing="-.3">affirm</text>
      </svg>
    </span>
  );
}

/** One quarter of the price, as Klarna's Pay in 4 would split it. */
export function quarter(cents: number, currency: string) {
  return formatMoney(Math.round(cents / 4), currency);
}

/** The line that sits beside the price and in the cart. */
export function PayLaterLine({ amountCents, currency, className = "" }: { amountCents: number; currency: string; className?: string }) {
  if (!(amountCents > 0)) return null;
  return (
    <span className={`pl-line ${className}`}>
      <span className="pl-line__k">
        <KlarnaMark /> <span>4 interest-free payments of <b>{quarter(amountCents, currency)}</b></span>
      </span>
      <span className="pl-line__a">
        <AffirmMark /> <span>or pay monthly</span>
      </span>
    </span>
  );
}
