// Estimated Content Rewards earnings. One function, so the rule is a one-line change once the
// "min payout" wording is read on a live campaign page (still to verify: floor vs threshold - open issue 2).
// Current rule: est = views/1000*cpm; below min -> 0 (held, not paid yet); above max -> max. No min/max -> uncapped.
// A held clip is never shown as a bare $0: payoutInfo() says "below $X minimum" so the UI can explain it.
const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

export function payoutInfo(views, { cpm_usd, min_payout_usd, max_payout_usd } = {}) {
  const v = num(views), cpm = num(cpm_usd);
  if (!v || !cpm || v < 0) return { est: 0, raw: 0, held: false, min: num(min_payout_usd) };
  const raw = (v * cpm) / 1000;
  const min = num(min_payout_usd), max = num(max_payout_usd);
  let est = raw, held = false, capped = false;
  if (min != null && est < min) { est = 0; held = true; }
  if (max != null && est > max) { est = max; capped = true; }
  const r2 = (x) => Math.round(x * 100) / 100;
  return { est: r2(est), raw: r2(raw), held, capped, min };
}
export function estPayout(views, camp = {}) { return payoutInfo(views, camp).est; }
export const heldNote = (info) => (info?.held ? `below $${info.min} minimum` : null);
