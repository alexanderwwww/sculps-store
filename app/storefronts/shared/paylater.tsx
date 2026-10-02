/**
 * Klarna and Affirm, with their own official marks, for the product page,
 * the bundle picker, the sticky bar, the cart and the checkout.
 *
 * The marks are the brands' own files (Klarna's badge from Klarna's CDN,
 * Affirm's logo from Affirm's CDN), served from /pay/ so nothing is redrawn.
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

/** Klarna's own pink badge. Height follows the text around it. */
export function KlarnaMark({ className = "", height = "1.45em" }: { className?: string; height?: string }) {
  return (
    <img
      className={`pl-mark pl-mark--klarna ${className}`}
      src="/pay/klarna.svg"
      alt="Klarna"
      width={45}
      height={20}
      style={{ height, width: "auto", display: "inline-block", verticalAlign: "middle" }}
    />
  );
}

/** Affirm's own logo. `tone`: black letters, white letters with the blue arc, or all white. */
export function AffirmMark({
  className = "",
  height = "1.35em",
  tone = "dark",
}: {
  className?: string;
  height?: string;
  tone?: "dark" | "white" | "white-arc";
}) {
  const src = tone === "white" ? "/pay/affirm-white.svg" : tone === "white-arc" ? "/pay/affirm-white-arc.svg" : "/pay/affirm.svg";
  return (
    <img
      className={`pl-mark pl-mark--affirm ${className}`}
      src={src}
      alt="Affirm"
      width={50}
      height={20}
      style={{ height, width: "auto", display: "inline-block", verticalAlign: "middle" }}
    />
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
