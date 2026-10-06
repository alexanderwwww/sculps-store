/**
 * The ways to pay, as small coloured marks in each brand's own colours —
 * so a customer recognises Cash App by its green before reading a word.
 * Only the methods agreed for the store are shown (see payments skill).
 */
const BADGE: Record<string, { label: string; style: React.CSSProperties }> = {
  visa: { label: "VISA", style: { background: "#fff", color: "#1A1F71", border: "1px solid #E3E3E3", fontStyle: "italic", fontWeight: 900, letterSpacing: ".02em" } },
  mastercard: { label: "mastercard", style: { background: "#fff", color: "#EB001B", border: "1px solid #E3E3E3", fontWeight: 800 } },
  amex: { label: "AMEX", style: { background: "#2E77BC", color: "#fff", fontWeight: 900, letterSpacing: ".04em" } },
  discover: { label: "DISCOVER", style: { background: "#fff", color: "#F58220", border: "1px solid #E3E3E3", fontWeight: 900, letterSpacing: ".02em" } },
  applepay: { label: " Pay", style: { background: "#000", color: "#fff", fontWeight: 700 } },
  googlepay: { label: "G Pay", style: { background: "#fff", color: "#3C4043", border: "1px solid #DADCE0", fontWeight: 700 } },
  cashapp: { label: "$ Cash App Pay", style: { background: "#00D64F", color: "#fff", fontWeight: 800 } },
  afterpay: { label: "afterpay", style: { background: "#B2FCE4", color: "#000", fontWeight: 900 } },
};

export function PayBadges({ methods, className = "" }: { methods: string[]; className?: string }) {
  const shown = ["visa", "mastercard", "amex", "discover", ...methods.filter((m) => m in BADGE)];
  return (
    <ul className={`paybadges ${className}`} aria-label="Ways to pay" style={{ listStyle: "none", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, margin: "12px 0 0", padding: 0 }}>
      {shown.map((m) => (
        <li
          key={m}
          aria-label={m === "applepay" ? "Apple Pay" : m === "googlepay" ? "Google Pay" : undefined}
          style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 10px", borderRadius: 6, fontSize: 12, lineHeight: 1, whiteSpace: "nowrap", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", ...BADGE[m].style }}
        >
          {m === "applepay" ? (
            <>
              <svg viewBox="0 0 14 17" width="11" height="13" fill="currentColor" aria-hidden="true" style={{ marginRight: 3 }}>
                <path d="M11.6 9c0-2 1.7-3 1.8-3-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.2.8-.6 0-1.6-.7-2.7-.7C3.1 4.5 1.8 5.3 1 6.6c-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.2 2.6 2.1 1.1 0 1.4-.7 2.7-.7s1.6.7 2.7.7c1.1 0 1.8-1 2.5-2.1.8-1.2 1.1-2.3 1.1-2.4 0 0-2.1-.8-2.1-3.8zM9.6 3c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.2z" />
              </svg>
              Pay
            </>
          ) : m === "cashapp" ? (
            <>
              <span aria-hidden="true" style={{ display: "inline-grid", placeItems: "center", width: 16, height: 16, borderRadius: 4, background: "#fff", color: "#00D64F", fontWeight: 900, fontSize: 12, marginRight: 5 }}>$</span>
              Cash App Pay
            </>
          ) : (
            BADGE[m].label
          )}
        </li>
      ))}
    </ul>
  );
}


/**
 * The ways to pay as a slow moving band under the buy box: the marks drift
 * past in a loop, the way the big shops show them. Two copies of the row
 * side by side make the loop seamless.
 */
export function PayMarquee({ methods }: { methods: string[] }) {
  if (!methods.length) return null;
  return (
    <div className="paymarquee" aria-label="Ways to pay">
      <div className="paymarquee__track">
        <PayBadges methods={methods} className="paymarquee__row" />
        <PayBadges methods={methods} className="paymarquee__row" />
        <PayBadges methods={methods} className="paymarquee__row" />
        <PayBadges methods={methods} className="paymarquee__row" />
      </div>
    </div>
  );
}
