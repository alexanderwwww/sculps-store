// Calendar-day arithmetic on plain "YYYY-MM-DD" strings. A day is never a
// Date in the local zone: that is how a daylight-saving change adds or loses a
// day. Everything here goes through UTC midnight, where every day is 24 hours.

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDate(s) {
  if (typeof s !== "string") return false;
  const m = RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function toUtc(s) {
  if (!isDate(s)) throw new Error(`not a calendar date: ${s}`);
  const m = RE.exec(s);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Whole days from a to b (b later = positive). */
export function dayDiff(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

export function addDays(s, n) {
  const t = new Date(toUtc(s) + n * 86400000);
  return t.toISOString().slice(0, 10);
}

/** The calendar day it is right now in the given IANA zone. */
export function todayIn(tz, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA is YYYY-MM-DD
}

/** Hours and minutes on the wall clock in the given zone, as "HH:MM". */
export function clockIn(tz, now = new Date()) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return f.replace(/^24:/, "00:");
}

export function systemZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function eachDay(from, to) {
  const out = [];
  if (dayDiff(from, to) < 0) return out;
  for (let d = from; ; d = addDays(d, 1)) {
    out.push(d);
    if (d === to) break;
  }
  return out;
}
