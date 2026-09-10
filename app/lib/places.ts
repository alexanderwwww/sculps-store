/**
 * Where a place is, roughly.
 *
 * Live View flies a sale from the buyer to the store, which needs a point for
 * the store. Rather than ask him to type coordinates, the point is derived
 * from the business address he already fills in for invoices and tax: the
 * centre of the US state, or of the country.
 *
 * These are real geographic centroids, not guesses at his address. The store
 * pin is only ever as precise as "Oklahoma", which is all a globe at this
 * scale can show anyway — and when there is no address at all, there is no
 * point and no arc, rather than a made-up one.
 */

/** Geographic centres of the US states, in degrees. */
const US_STATES: Record<string, [number, number]> = {
  AL: [32.8, -86.8], AK: [64.0, -152.0], AZ: [34.3, -111.7], AR: [34.9, -92.4],
  CA: [37.2, -119.4], CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5],
  DC: [38.9, -77.0], FL: [28.6, -82.4], GA: [32.6, -83.4], HI: [20.3, -156.4],
  ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3], IA: [42.1, -93.5],
  KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.1, -92.0], ME: [45.4, -69.2],
  MD: [39.0, -76.8], MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3],
  MS: [32.7, -89.7], MO: [38.4, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8],
  NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.2, -74.7], NM: [34.4, -106.1],
  NY: [42.9, -75.5], NC: [35.5, -79.4], ND: [47.4, -100.5], OH: [40.3, -82.8],
  OK: [35.6, -97.5], OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.6],
  SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.8, -86.4], TX: [31.5, -99.3],
  UT: [39.3, -111.7], VT: [44.1, -72.7], VA: [37.5, -78.9], WA: [47.4, -120.5],
  WV: [38.6, -80.6], WI: [44.6, -89.7], WY: [43.0, -107.6],
};

/** Geographic centres of the countries the checkout offers. */
const COUNTRIES: Record<string, [number, number]> = {
  US: [39.8, -98.6], CA: [56.1, -106.3], GB: [54.0, -2.9], AU: [-25.3, 133.8],
  NZ: [-41.5, 172.8], IE: [53.4, -8.2], DE: [51.2, 10.5], FR: [46.6, 2.2],
  NL: [52.1, 5.3], ES: [40.2, -3.7], IT: [42.8, 12.6], SE: [62.2, 17.6],
  NO: [64.6, 17.9], DK: [56.0, 9.5], MX: [23.6, -102.6], GR: [39.07, 21.82],
  PT: [39.6, -8.0], BE: [50.6, 4.7], AT: [47.6, 14.1], CH: [46.8, 8.2],
  PL: [52.1, 19.4], CZ: [49.8, 15.5], FI: [64.5, 26.0], JP: [36.2, 138.3],
};

/**
 * A point for a business address. State first because it is ten times more
 * precise than the country, then the country, then nothing.
 */
export function pointForAddress(
  region: string | null | undefined,
  country: string | null | undefined,
): { lat: number; lon: number } | null {
  const code = (region ?? "").trim().toUpperCase();
  const nation = (country ?? "").trim().toUpperCase();

  if (nation === "US" || (!nation && US_STATES[code])) {
    const state = US_STATES[code];
    if (state) return { lat: state[0], lon: state[1] };
  }
  const place = COUNTRIES[nation];
  if (place) return { lat: place[0], lon: place[1] };
  return null;
}
