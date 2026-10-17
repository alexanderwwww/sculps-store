/*
 * The Q4 calendar and the day arithmetic (skills/q4.md is the reference).
 *
 * Dates are fixed facts for 2026 (US); the arithmetic is always done from the
 * day the report is made, never assumed.
 */

export const DATES = {
  halloween: "2026-10-31",
  singlesDay: "2026-11-11",
  thanksgiving: "2026-11-26",
  blackFriday: "2026-11-27",
  cyberMonday: "2026-11-30",
  bfcm: "2026-11-27",
  // USPS recommended send-by dates, lower 48 (usps.com/holiday, Sept 2026).
  uspsGroundCutoff: "2026-12-17",
  uspsPriorityCutoff: "2026-12-18",
  uspsExpressCutoff: "2026-12-19",
  christmas: "2026-12-25",
  valentines: "2027-02-14",
  cny2027: "2027-02-06",
};

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const at = (d) => Date.parse(`${d}T00:00:00Z`);

/** Whole days from `today` (ISO or ms) to the ISO date `d`; negative when past. */
export function daysTo(d, today = Date.now()) {
  const t = typeof today === "number" ? at(iso(today)) : at(today);
  return Math.round((at(d) - t) / DAY);
}

/**
 * The calendar block the report carries: today, each date, days to each.
 * `ads` says which ad-cost period today falls in (skills/q4.md point 4).
 */
export function calendar(now = Date.now()) {
  const today = iso(now);
  const days = {};
  for (const [k, v] of Object.entries(DATES)) days[k] = daysTo(v, today);
  let ads = "normal";
  if (today >= "2026-11-15" && today <= "2026-12-25") ads = "high (mid-November to Christmas: every advertiser is bidding)";
  return {
    today,
    halloween: DATES.halloween,
    bfcm: DATES.bfcm,
    christmas: DATES.christmas,
    uspsGroundCutoff: DATES.uspsGroundCutoff,
    cny2027: DATES.cny2027,
    daysTo: days,
    adCosts: ads,
  };
}

/**
 * The last day stock can be ordered from a supplier to make a moment.
 * processingDays + shippingDays come from the supplier's own page; without
 * them this answers null (never a made-up lead time). `launchDays` is the
 * week to set up the store and ads (skills/q4.md point 1).
 */
export function lastOrderDay(moment, processingDays, shippingDays, launchDays = 7) {
  if (![processingDays, shippingDays].every((n) => Number.isFinite(n) && n >= 0)) return null;
  const end = DATES[moment] || moment;
  // Customers need it delivered by the moment; the store needs stock in time
  // to sell for at least two weeks before it (q4.md point 1).
  return iso(at(end) - (processingDays + shippingDays + launchDays + 14) * DAY);
}

/** Is there still a selling window of two weeks or more before `moment`? */
export function stillQ4(moment, processingDays, shippingDays, now = Date.now()) {
  const last = lastOrderDay(moment, processingDays, shippingDays);
  if (!last) return null;
  return daysTo(last, iso(now)) >= 0;
}
