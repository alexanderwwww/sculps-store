/**
 * The exit, in one place (build 41). Symbiot's fake trades, the ghost proof and the real
 * trader all call exitReason(), so the exit real money uses is exactly the exit the sim proved.
 *
 *   tp         take profit                 sl         the hard stop (-15%)
 *   crashMs / crashMove   the abort: down 8% inside the first 20 s (Alex: "abort numbers keep")
 *   trailFrom  after a +25% peak, out when half of it is given back
 *   holdMs     out after 2 minutes whatever happens
 *   deadMs / deadMove     the abort: never 2% up and never 2% down after 30 s
 *
 * Check order: tp, sl, crash, give-back, hold, dead. sl before crash keeps a -16% read a
 * 'stop -15%'; hold before dead keeps a flat coin at 120 s a '120 s'. The crash label carries
 * 'stop' (the post-mortem files it with the stops), the dead label does not.
 * A 0 in crashMs or deadMs switches that rule off; so does a crashMove that is not below 0 or a
 * deadMove that is not above 0 (a 0 there would otherwise sell every flat coin at once).
 */

export function exitReason(p, move, ageMs, c) {
  const pc = (x) => Math.round(x * 100);
  if (move >= c.tp) return `+${pc(c.tp)}%`;
  if (move <= c.sl) return `stop ${pc(c.sl)}%`;
  if (c.crashMs > 0 && c.crashMove < 0 && ageMs <= c.crashMs && move <= c.crashMove) return `stop: crash ${pc(move)}% in ${Math.round(ageMs / 1000)} s`;
  if ((p.peak || 0) >= c.trailFrom && move <= p.peak / 2) return `gave back half of +${pc(p.peak)}%`;
  if (ageMs >= c.holdMs) return `${Math.round(c.holdMs / 1000)} s`;
  if (c.deadMs > 0 && c.deadMove > 0 && ageMs >= c.deadMs && (p.peakAll || 0) < c.deadMove && (p.lowAll ?? 0) > -c.deadMove) return `dead: flat ${Math.round(c.deadMs / 1000)} s`;
  return null;
}

/** Every exit setting except tp: the name of a ghost-proof bucket. */
export const rulesKey = (c) => `sl${c.sl}|c${c.crashMs}/${c.crashMove}|d${c.deadMs}/${c.deadMove}|t${c.trailFrom}|h${c.holdMs}`;

/** The same settings as a plain object, frozen into a proof bucket and a real position. */
export const rulesOf = (c) => ({ sl: c.sl, crashMs: c.crashMs, crashMove: c.crashMove, deadMs: c.deadMs, deadMove: c.deadMove, trailFrom: c.trailFrom, holdMs: c.holdMs });

/**
 * Highest and lowest move seen. peak feeds the give-back rule, peakAll and lowAll the dead rule
 * and the post-mortem. For a hunt position peak and peakAll are the same number; peak is kept on
 * every position (not only p.hunt) so a real position, which has no hunt flag, still gives back.
 */
export function track(p, move) {
  if (!Number.isFinite(move)) return;
  p.peakAll = Math.max(p.peakAll || 0, move);
  p.lowAll = Math.min(p.lowAll ?? 0, move);
  p.peak = Math.max(p.peak || 0, move);
}

/** The real targets the ghost proof scores (steps.mjs rotates 21/13/34/21/13). */
export const TIERS = Object.freeze([0.13, 0.21, 0.34]);
/** Network and lowest tip per round trip, USD (plan-2000-steps.md). */
export const NET_USD = 0.03;

/**
 * What a real round trip nets in USD: the fee side on both legs plus the network, at a real
 * stake. Matches plan-2000-steps.md: $5.73 at +21% with a 1.25% side nets +$1.02.
 */
export function realNet(move, side, stakeUsd) {
  return stakeUsd * move - side * stakeUsd - side * stakeUsd * (1 + move) - NET_USD;
}
