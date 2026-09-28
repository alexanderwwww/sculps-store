/**
 * How fast plug is allowed to grow.
 *
 * His rule, in his words: "he will multiply his work by golden ratio, F, phi",
 * and then, when the arithmetic was shown to him: "so let's make a limit of
 * the seven days. So seven days, it will be the limit of the ratio scale, and
 * then it will start from one again."
 *
 * So the target for day n is round(PHI^(n-1)), and the cycle is seven days:
 *
 *     1 → 2 → 3 → 4 → 7 → 11 → 18 → 1 → …
 *
 * Forty-six new items a week when there is stock for it. The reset is not a
 * detail — unbounded it reaches 521 on day fourteen and 17,000 by day twenty,
 * which is not growth, it is a shop being closed by the marketplace that hosts
 * it.
 */
export const PHI = 1.618;
export const CYCLE_DAYS = 7;

/** The target for a given day of the cycle, 1-indexed. */
export function targetForDay(day) {
  const n = ((Math.floor(day) - 1) % CYCLE_DAYS + CYCLE_DAYS) % CYCLE_DAYS + 1;
  return Math.round(Math.pow(PHI, n - 1));
}

/** The whole week, for showing him where he is in it. */
export function cycle() {
  const days = [];
  for (let d = 1; d <= CYCLE_DAYS; d++) days.push(targetForDay(d));
  return days;
}

/** Which day of the cycle a date falls on, counted from the day it started. */
export function dayOfCycle(started, now = new Date()) {
  const oneDay = 86_400_000;
  const from = Date.UTC(started.getFullYear(), started.getMonth(), started.getDate());
  const to = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const elapsed = Math.floor((to - from) / oneDay);
  if (elapsed < 0) return 1;
  return (elapsed % CYCLE_DAYS) + 1;
}

/**
 * What to do today.
 *
 * Two limits sit on top of the target and both are his:
 *
 *   ready — nothing is listed that he does not have. The schedule is a
 *   ceiling on ambition, never a reason to invent stock.
 *
 *   allowed — what the marketplace will take today without the account being
 *   looked at. A shop that hits eighteen by being rude to Depop is a shop that
 *   is gone before day nineteen.
 *
 * And no catch-up. A quiet Tuesday does not become a flood on Wednesday: that
 * burst is the single most recognisable thing an automated seller does, and it
 * is what he meant by "no automatic catch-up flood".
 */
export function plan({ day, done = 0, ready = Infinity, allowed = Infinity }) {
  const target = targetForDay(day);
  const ceiling = Math.min(target, ready, allowed);
  const left = Math.max(0, ceiling - done);
  let held = null;
  if (ceiling < target) held = ready < allowed ? "not enough ready stock" : "the marketplace's own limit";
  return {
    day,
    target,
    done,
    left,
    held,
    /* Cross-listing one item on both marketplaces is ONE item. The count is of
       things he owns, not of listings posted, or the number flatters itself by
       double. */
    counts: "items, not listings",
  };
}
