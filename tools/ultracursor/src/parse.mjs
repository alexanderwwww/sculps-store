/*
 * Reading numbers and dates the way the sites write them.
 *
 *   count("1.2M") -> 1200000    count("12.3K") -> 12300    count("4,512") -> 4512
 *   startedOn("Started running on Oct 3, 2026") -> "2026-10-03"
 *   startedOn("Started running on 3 Oct 2026")  -> "2026-10-03"
 *   daysSince("2026-10-03", now) -> whole days, or null
 *
 * Anything unreadable is null, never 0: a zero reads as "nobody watched" or
 * "started today", and both would be a lie.
 */

export function count(text) {
  if (text === null || text === undefined) return null;
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  const s = String(text).trim().replace(/ /g, " ");
  const m = /(\d[\d,.\s]*)\s*([kmb])?\b/i.exec(s);
  if (!m) return null;
  let digits = m[1].replace(/\s/g, "");
  const unit = (m[2] || "").toLowerCase();
  if (unit) {
    // "1.2M", "1,2M" (European), "12K"
    digits = digits.replace(",", ".");
    const v = Number(digits);
    if (!Number.isFinite(v)) return null;
    const mul = unit === "k" ? 1e3 : unit === "m" ? 1e6 : 1e9;
    return Math.round(v * mul);
  }
  // "4,512" / "4.512" thousands separators, "12" plain.
  if (/^\d{1,3}([.,]\d{3})+$/.test(digits)) return Number(digits.replace(/[.,]/g, ""));
  const v = Number(digits.replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n) => String(n).padStart(2, "0");

export function startedOn(text) {
  if (!text) return null;
  const s = String(text);
  let m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  let y, mo, d;
  if (m && MONTHS.includes(m[1].toLowerCase())) {
    mo = MONTHS.indexOf(m[1].toLowerCase()) + 1; d = Number(m[2]); y = Number(m[3]);
  } else {
    m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(s);
    if (!m || !MONTHS.includes(m[2].toLowerCase())) return null;
    d = Number(m[1]); mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; y = Number(m[3]);
  }
  if (d < 1 || d > 31) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function daysSince(iso, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const today = Date.parse(new Date(now).toISOString().slice(0, 10) + "T00:00:00Z");
  const days = Math.round((today - t) / 86400000);
  return days >= 0 ? days : null;
}

/** "$24.99", "24.99", 24.99 -> 24.99; anything else null. */
export function price(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** A hashtag is a query with everything but letters and digits taken out. */
export const tagFor = (q) => String(q || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/* Turning what Alex said into search queries (ported from tools/product-research/worker/hunt.mjs). */
const STOP = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "with", "that",
  "this", "is", "are", "be", "best", "good", "me", "my", "i", "want", "find",
  "look", "looking", "search", "actually", "really", "right", "now", "some",
  "what", "which", "who", "can", "you", "it", "its", "at", "by", "from",
]);

export function termsFrom(looking = "") {
  const words = String(looking).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
  return [...new Set(words.filter((w) => w.length > 2 && !STOP.has(w)))];
}

/** The whole phrase first, then the pairs, then single strong words; capped. */
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
