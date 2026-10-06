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
          {BADGE[m].label}
        </li>
      ))}
    </ul>
  );
}
