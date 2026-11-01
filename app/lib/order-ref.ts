/* Order references for Mysterious Archive: MST47832, not 1001 (Alex, 2026-11-01).
   Three letters, five digits. The digits are a permutation of 00000-99999 (multiply by an odd number that shares no
   factor with 10, add an offset, mod 100000), so two orders never share a reference, and a customer's reference can be
   turned back into the order number for the admin search. */
const MST_MUL = 38461, MST_ADD = 7919, MST_INV = 57141; // 38461 * 57141 = 1 (mod 100000)
/** The order number behind an MST reference (admin search); null when it is not one. */
export function orderNumberFromReference(text: string): number | null {
  const m = /^\s*MST(\d{5})\s*$/i.exec(text);
  if (!m) return null;
  return (((Number(m[1]) - MST_ADD) % 100000 + 100000) * MST_INV) % 100000;
}


export function mstReference(orderNumber: number): string {
  return `MST${String((orderNumber * MST_MUL + MST_ADD) % 100000).padStart(5, "0")}`;
}
