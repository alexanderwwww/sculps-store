/**
 * The real-money plan (build 41, Alex 2026-10-20: "$15 to $2,000, every step"). Pure and frozen.
 *
 * design/symbiot/plan-2000-steps.md row by row: the stake is 38.2% of the balance (φ⁻², rounded
 * to the cent), take-profits rotate 21/13/34/21/13, the stop is -15%, the fee is 1.25% each side
 * plus $0.03 network. A step that loses is repeated with the stake from the smaller balance:
 * never bigger after a loss (no martingale).
 *
 * Nothing here can be reached from R2 real.json, symbiot.json or uc-trader.json. A bigger stake
 * (MAX_STAKE_USD) needs a new build, when Alex says scale.
 */

export const STEPS = 76;
export const GOAL_USD = 2000;
export const STAKE_F = 0.382;
export const SL = -0.15;
export const PLAN_FEE_SIDE = 0.0125;
export const PLAN_NET_USD = 0.03;
export const TARGETS = Object.freeze([0.21, 0.13, 0.34, 0.21, 0.13]);
// Alex's $20/$30/$50 ladder, then the ×φ micro-goals from plan-2000.md
export const GOALS = Object.freeze([20, 30, 50, 63.6, 102.9, 166.5, 269.4, 435.9, 705.3, 1141, 1846, 2000]);
// 0.382 × $50: the plan is capped at about the $50 rung until Alex says scale (a new build)
export const MAX_STAKE_USD = 19.10;
export const PAUSE_AFTER = 3, PAUSE_MS = 60 * 60_000;            // 3 losses in a row: 1 h off
export const DRAWDOWN = 0.618, HALT_MS = 24 * 60 * 60_000;       // down to 61.8% of the peak: 24 h off
export const MIN_USD = 3;                                        // under $3 the fees eat the stake

export const PLAN = Object.freeze({ STEPS, GOAL_USD, STAKE_F, SL, PLAN_FEE_SIDE, PLAN_NET_USD, TARGETS, GOALS, MAX_STAKE_USD, PAUSE_AFTER, PAUSE_MS, DRAWDOWN, HALT_MS, MIN_USD });

/** The table rounds to the cent this way (proven: 0 of 76 rows differ, final $2,019.25). */
export const round2 = (x) => Math.round(x * 100) / 100;

export const targetFor = (no) => TARGETS[(Math.max(1, Math.floor(no)) - 1) % TARGETS.length];

/**
 * One row of plan-2000-steps.md: the stake is 38.2% of the balance in, rounded to the cent;
 * fees = 1.25% of the stake + 1.25% of what comes back + $0.03. Unrounded: the table carries
 * the balance unrounded and only prints cents. `stake` overrides the plan stake (a capped step).
 */
export function planRow(balIn, T, stake = round2(STAKE_F * balIn)) {
  const fees = PLAN_FEE_SIDE * stake + PLAN_FEE_SIDE * stake * (1 + T) + PLAN_NET_USD;
  const out = stake * (1 + T) - fees;
  const profit = out - stake;
  return { balIn, stake, target: T, fees, out, profit, after: balIn + profit };
}

/** The plan's fee on a round trip that closed at `move` (the stepRow's feesPlan). */
export const feesPlan = (stake, move) => PLAN_FEE_SIDE * stake + PLAN_FEE_SIDE * stake * (1 + move) + PLAN_NET_USD;

/** A fresh step ledger: step 1 of 76, nothing lost yet. */
export function newLedger(startUsd = 15) {
  return { step: { no: 1, attempt: 1, target: targetFor(1) }, lastStake: null, afterLoss: false, lossStreak: 0, peakUsd: startUsd, paused: null, halted: null, done: false, trades: 0, wins: 0, losses: 0 };
}

/** 38.2% of the balance, never above MAX_STAKE_USD, never above the last stake after a loss. */
export function stakeFor(L, balUsd) {
  const cap = L && L.afterLoss && Number.isFinite(L.lastStake) ? L.lastStake : Infinity;
  return round2(Math.min(STAKE_F * balUsd, MAX_STAKE_USD, cap));
}

/** The balance this step reaches if it wins. */
export function stepGoal(L, balUsd) {
  return planRow(balUsd, targetFor(L.step.no), stakeFor(L, balUsd)).after;
}

/** The next rung above the balance: 20, 30, 50, 63.6 ... 2000 (null once $2,000 is reached). */
export const nextGoal = (bal) => GOALS.find((g) => g > bal) ?? null;

/** 0 at the start, 1 at $2,000, on a log scale so the bar moves every step. */
export function progress(bal, startUsd = 15) {
  if (!(bal > 0) || !(startUsd > 0) || startUsd >= GOAL_USD) return 0;
  const x = Math.log(bal / startUsd) / Math.log(GOAL_USD / startUsd);
  return Math.min(1, Math.max(0, x));
}

/** Throws (the trader HALTs) if a stake grows after a loss. */
export function assertNoMartingale(prev, next, lastWasLoss) {
  if (lastWasLoss && Number.isFinite(prev) && next > prev + 1e-9) throw new Error(`martingale refused: $${next} after a loss at $${prev}`);
  return true;
}

/**
 * A round trip closed. `net` is the chain's net of the round trip (SOL or USD, only its sign is
 * read): above 0 the step moves on, otherwise the same step repeats with attempt + 1 and the
 * next stake comes from the smaller balance, capped at this one. Then the pause/halt/done rules.
 */
export function onClose(L, { net, stake, balUsd, nowMs }) {
  const won = net > 0;
  const n = { ...L, step: { ...L.step }, trades: L.trades + 1, lastStake: stake };
  if (won) {
    n.wins = L.wins + 1;
    n.step = { no: L.step.no + 1, attempt: 1, target: targetFor(L.step.no + 1) };
    n.afterLoss = false; n.lossStreak = 0;
  } else {
    n.losses = L.losses + 1;
    n.step = { no: L.step.no, attempt: L.step.attempt + 1, target: targetFor(L.step.no) };
    n.afterLoss = true; n.lossStreak = L.lossStreak + 1;
  }
  n.peakUsd = Math.max(L.peakUsd || 0, balUsd);
  return limits(n, balUsd, nowMs);
}

/** Pause and halt rules, read after every close and on start. */
export function limits(L, balUsd, nowMs) {
  const n = { ...L };
  if (balUsd >= GOAL_USD) { n.done = true; return n; }
  if (balUsd < MIN_USD) { n.halted = { why: "too small: under $3", at: nowMs, until: null }; return n; }
  if (n.peakUsd > 0 && balUsd <= DRAWDOWN * n.peakUsd) {
    n.halted = { why: `down to 61.8% of the $${round2(n.peakUsd).toFixed(2)} peak`, at: nowMs, until: nowMs + HALT_MS };
    return n;
  }
  if (n.lossStreak >= PAUSE_AFTER) {
    // the count starts again after the pause, so the 4th loss in a row does not pause at once
    n.paused = { why: `${PAUSE_AFTER} losses in a row`, until: nowMs + PAUSE_MS };
    n.lossStreak = 0;
  }
  return n;
}

/**
 * Before a new buy: a pause or a 24 h halt that has run out is lifted. A halt without an end
 * ('too small', a stuck sell) stays until Alex. After a drawdown halt the peak restarts at the
 * balance, or the same drawdown would halt it again at once.
 */
export function resume(L, balUsd, nowMs) {
  const n = { ...L };
  if (n.paused && nowMs >= n.paused.until) n.paused = null;
  if (n.halted && n.halted.until && nowMs >= n.halted.until) { n.halted = null; n.peakUsd = balUsd; }
  return n;
}
