/**
 * The gate real money passes (build 41). Pure.
 *
 * Symbiot's ghost proof (scalp.mjs) scores every hunt trade at each real target T with the very
 * exit real money uses (exits.mjs), at the real stake: proof[rulesKey] = {rules, keys: {combo:
 * {T: {n, w, net, last, rt, o}}}}. A combo + target is proven only when ALL of these hold:
 *   - the bucket's exit rules stop at -15% (the plan's stop)
 *   - the combo is a Fibonacci entry (Alex: "always a Fibonacci entry")
 *   - n >= max(21, real.json minTrades)
 *   - the Wilson lower bound of the win rate >= need = max(minWin, 0.55, break-even + 3%)
 *     (Alex: "+13% steps only when the sim proves ~66% wins": break-even at +13% is ~64%)
 *   - the average net is above 0
 *   - the last outcome is under 24 h old
 * R2 real.json can only raise minTrades and minWin: the floors 21 and 0.55 are local.
 */
import { realNet as netOf, rulesKey } from "../exits.mjs";
import { SL, PLAN_FEE_SIDE, PLAN_NET_USD } from "./steps.mjs";

export const MIN_TRADES = 21, MIN_WIN = 0.55, MARGIN = 0.03, FRESH_MS = 24 * 60 * 60_000;

/** One formula for what a real round trip nets, shared with the ghost proof (exits.mjs). */
export const realNet = netOf;

/** The win rate at which a -15% stop and +T take-profit break even, round trip cost cRt. */
export const breakEven = (T, cRt) => (0.15 + cRt) / (T + 0.15);

/** Wilson score lower bound (z 0.8416: 80% one-sided). */
export function wilsonLow(w, n, z = 0.8416) {
  if (!(n > 0)) return 0;
  const p = w / n, z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

/** R2 can raise the floors, never lower them. */
export function floors({ minTrades, minWin } = {}) {
  return {
    minTrades: Math.max(MIN_TRADES, Number.isFinite(minTrades) ? Math.ceil(minTrades) : 0),
    minWin: Math.max(MIN_WIN, Number.isFinite(minWin) ? minWin : 0),
  };
}

/** The round trip the proof assumed for this combo at T (its fee side on both legs + network). */
export function assumedRt(stat, stakeUsd) {
  const rt = stat && Number.isFinite(stat.rt) && stat.rt > 0 ? stat.rt : 2 * PLAN_FEE_SIDE;
  return rt + PLAN_NET_USD / (stakeUsd > 0 ? stakeUsd : 5.73);
}

/** The exit rules a bucket was scored under (its own record, else read from its name). */
function bucketSl(B, rk) {
  if (B && B.rules && Number.isFinite(B.rules.sl)) return B.rules.sl;
  const m = /^sl(-?[\d.]+)\|/.exec(rk || "");
  return m ? Number(m[1]) : NaN;
}

/**
 * proof: the sim's current proof map; cfg: the sim's exit settings (they name the bucket) plus
 * {minTrades, minWin, cRt?, stakeUsd?} from the real side.
 * -> {ok, n, w, rate, lb, need, avg, cRt, rules, why}
 */
export function proven(proof, combo, T, cfg = {}, nowMs = Date.now()) {
  const rk = rulesKey(cfg);
  const B = proof && proof[rk];
  const out = (ok, why, x = {}) => ({ ok, n: 0, w: 0, rate: 0, lb: 0, need: null, avg: 0, cRt: null, rules: B ? B.rules || null : null, why, ...x });
  if (!B || !B.keys) return out(false, "no sim proof under these exit rules");
  const sl = bucketSl(B, rk);
  if (sl !== SL) return out(false, `the sim's stop is ${Math.round(sl * 100)}%, not -15%`);
  if (typeof combo !== "string" || !combo.split("|").includes("e:fib")) return out(false, "not a Fibonacci entry");
  const S = B.keys[combo] && B.keys[combo][T];
  if (!S || !(S.n > 0)) return out(false, `no sim trades on this setup at +${Math.round(T * 100)}%`);
  const f = floors(cfg);
  const n = S.n, w = S.w, rate = w / n, lb = wilsonLow(w, n), avg = S.net / n;
  const cRt = Number.isFinite(cfg.cRt) ? cfg.cRt : assumedRt(S, cfg.stakeUsd);
  const need = Math.max(f.minWin, MIN_WIN, breakEven(T, cRt) + MARGIN);
  const x = { n, w, rate, lb, need, avg, cRt };
  if (n < f.minTrades) return out(false, `${n} of ${f.minTrades} sim trades`, x);
  if (!(nowMs - (S.last || 0) < FRESH_MS)) return out(false, "the last sim trade is over 24 h old", x);
  if (!(avg > 0)) return out(false, `loses on average (${avg.toFixed(3)} USD a trade)`, x);
  if (lb < need) return out(false, `${w} of ${n} won (at least ${Math.round(lb * 100)}%), needs ${Math.round(need * 100)}%`, x);
  return out(true, `${w} of ${n} won after fees (needs ${Math.round(need * 100)}%)`, x);
}
