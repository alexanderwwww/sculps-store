/**
 * What "today" means for a store.
 *
 * Every day boundary in the admin used to be `new Date().setHours(0,0,0,0)`,
 * which on a Worker is midnight UTC — not midnight anywhere a merchant lives.
 * A store in Athens saw its day roll over at 3am and its "today" numbers carry
 * three hours of yesterday's traffic. Stores already carry a timezone; this is
 * what reads it.
 *
 * No library: Intl knows every zone and its DST history, so the offset is
 * asked for at the instant in question rather than assumed.
 */

/** How far the zone is from UTC at this instant, in milliseconds. */
function offsetAt(timezone: string, when: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(when);

  const field = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = Date.UTC(field("year"), field("month") - 1, field("day"), field("hour"), field("minute"), field("second"));
  // Whole seconds on both sides, so sub-second drift cannot round the offset.
  return wall - Math.floor(when.getTime() / 1000) * 1000;
}

/**
 * Midnight in the store's own timezone, `offsetDays` days back, as the instant
 * a database comparison wants.
 */
export function startOfDayIn(timezone: string, offsetDays = 0, when = new Date()): Date {
  let offset: number;
  try {
    offset = offsetAt(timezone, when);
  } catch {
    // An unknown zone must not take the screen down; UTC is the old behaviour.
    return new Date(new Date(when).setUTCHours(0, 0, 0, 0) - offsetDays * 86_400_000);
  }

  const wall = new Date(when.getTime() + offset);
  wall.setUTCHours(0, 0, 0, 0);
  wall.setUTCDate(wall.getUTCDate() - offsetDays);

  // The offset on the boundary itself can differ from the offset now — the
  // clocks may have changed in between — so it is asked for again there.
  const first = new Date(wall.getTime() - offset);
  const settled = offsetAt(timezone, first);
  return settled === offset ? first : new Date(wall.getTime() - settled);
}
