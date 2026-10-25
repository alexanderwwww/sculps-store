/** Safe for the browser: constants and formatting shared by the archive account and admin pages. */
export const OFFER_HOURS = 12;

export function dollars(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

/** Shown to a buyer who is waiting for an answer, e.g. "Mysterious Archive typically replies within a day." Empty = not shown. */
export const REPLY_TIME = "";
