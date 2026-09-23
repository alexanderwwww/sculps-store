/**
 * Turning what Alex said into where to look.
 *
 * He types a sentence — "halloween projectors that are actually selling" —
 * and that has to become a handful of search terms, a hashtag or two, and an
 * Ad Library query. No cleverness: the words he used are the words we search,
 * plus the obvious shapes around them. Guessing at what he "really meant" is
 * how a sweep comes back about the wrong product.
 */

const STOP = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "with", "that",
  "this", "is", "are", "be", "best", "good", "me", "my", "i", "want", "find",
  "look", "looking", "search", "actually", "really", "right", "now", "some",
  "what", "which", "who", "can", "you", "it", "its", "at", "by", "from",
]);

/** The words worth searching, in the order he wrote them. */
export function termsFrom(looking = "") {
  const words = String(looking).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(kept)];
}

/**
 * The queries a sweep runs.
 *
 * The whole phrase first — that is what he asked for — then the pairs, which
 * is how people actually search, then the single strong words. Capped, because
 * a sweep that runs forty queries finishes nothing.
 */
export function queriesFrom(looking = "", extra = [], limit = 6) {
  const terms = termsFrom(looking);
  const phrase = terms.join(" ").trim();
  const out = [];
  const add = (q) => {
    const v = String(q).trim().toLowerCase();
    if (v && v.length > 2 && !out.includes(v)) out.push(v);
  };
  if (phrase) add(phrase);
  for (const e of extra) add(e);
  for (let i = 0; i + 1 < terms.length; i++) add(`${terms[i]} ${terms[i + 1]}`);
  for (const t of terms) if (t.length > 4) add(t);
  return out.slice(0, limit);
}

/** A hashtag is a query with the spaces taken out. */
export const tagFor = (q) => String(q).toLowerCase().replace(/[^a-z0-9]+/g, "");

export const adLibraryUrl = (q) =>
  "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=" +
  encodeURIComponent(q) + "&search_type=keyword_unordered";

export const tiktokSearchUrl = (q) =>
  "https://www.tiktok.com/search/video?q=" + encodeURIComponent(q);

export const instagramTagUrl = (q) =>
  "https://www.instagram.com/explore/tags/" + encodeURIComponent(tagFor(q)) + "/";

/**
 * "Started running on Jan 3, 2025" → how many days that is.
 * An unreadable date is null, never a zero that would read as "brand new".
 */
export function runningDays(started, now = Date.now()) {
  if (!started) return null;
  const t = Date.parse(String(started));
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((now - t) / 86400000);
  return days >= 0 ? days : null;
}

/**
 * A price actually written on the page.
 *
 * Ad copy says "€39.99" or "$24" often enough to be worth reading, and a price
 * read off a seller's own ad is a real price. Anything else — a guess from the
 * category, a number from memory — would make every sum after it a lie, so
 * there is no fallback here on purpose.
 */
export function priceIn(text = "") {
  const m = /(?:[€$£]\s?|\b(?:eur|usd|gbp)\s)(\d{1,4}(?:[.,]\d{1,2})?)/i.exec(String(text));
  if (!m) return null;
  const v = Number(String(m[1]).replace(",", "."));
  // Under 3 is shipping or nothing; over 2000 is not an impulse product.
  return Number.isFinite(v) && v >= 3 && v <= 2000 ? v : null;
}
