// The gate real money passes (build 41): proof.mjs. realNet, break-even per target, the Wilson
// lower bound, and every way proven() says no. Pure: no network, no money.
//
//   node test/proof.test.mjs
import { realNet, breakEven, wilsonLow, proven, floors, assumedRt, MIN_TRADES, MIN_WIN } from "../src/trader/real/proof.mjs";
import { rulesKey, rulesOf } from "../src/trader/exits.mjs";
import { DEFAULTS } from "../src/trader/scalp.mjs";

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : typeof x === "string" ? x : JSON.stringify(x)); } };
const near = (a, b, t = 1e-3) => Math.abs(a - b) <= t;
const NOW = 1_800_000_000_000;

ok("realNet: $5.73 at +21%, 1.25% a side -> +$1.02 (plan row 1)", near(realNet(0.21, 0.0125, 5.73), 1.0150, 1e-3), realNet(0.21, 0.0125, 5.73));
ok("realNet: $5.73 stopped at -15% -> -$1.02", near(realNet(-0.15, 0.0125, 5.73), -0.8595 - 0.071625 - 0.06088 - 0.03, 1e-4), realNet(-0.15, 0.0125, 5.73));
ok("realNet: flat is a loss to fees", realNet(0, 0.0125, 5.73) < 0);
const c3 = 0.0302;
ok("break-even at +13% with 3% fees: 64%", near(breakEven(0.13, c3), 0.6436));
ok("break-even at +21%: 50%", near(breakEven(0.21, c3), 0.5006));
ok("break-even at +34%: 37%", near(breakEven(0.34, c3), 0.3678));
ok("wilsonLow(26, 34) = 0.698", near(wilsonLow(26, 34), 0.698, 5e-4), wilsonLow(26, 34));
ok("wilsonLow(0, 0) = 0, and it rises with n at the same rate", wilsonLow(0, 0) === 0 && wilsonLow(52, 68) > wilsonLow(26, 34));

// a sim proof bucket in the shape scalp.mjs writes
const cfg = { ...DEFAULTS };
const rk = rulesKey(cfg);
const combo = "age1|lq1|h2|src:trending|e:fib";
const stat = (w, n, avg, last = NOW - 60_000, rt = 0.025) => ({ n, w, net: avg * n, last, rt, o: [] });
const proof = (s, c = combo, T = 0.21, rules = rulesOf(cfg)) => ({ [rulesKey({ ...cfg, ...rules })]: { rules, keys: { [c]: { [T]: s } } } });
const P = (pr, opts = {}, T = 0.21, c = combo, now = NOW) => proven(pr, c, T, { ...cfg, minTrades: 34, minWin: 0.55, stakeUsd: 5.73, ...opts }, now);

const good = P(proof(stat(30, 34, 0.4)));
ok("30 of 34 won, positive average, fresh, -15% rules: proven", good.ok, good);
ok("it reports n, w, the Wilson bound and what it needed", good.n === 34 && good.w === 30 && good.lb > good.need && good.need >= 0.55 && /30 of 34/.test(good.why), good);
ok("n below the floor: not proven", !P(proof(stat(20, 20, 0.4))).ok && /20 of 34/.test(P(proof(stat(20, 20, 0.4))).why));
ok("below minWin: not proven", !P(proof(stat(17, 34, 0.1)), { minWin: 0.6 }).ok);
const at13 = P(proof(stat(22, 34, 0.2), combo, 0.13), {}, 0.13), at34 = P(proof(stat(22, 34, 0.2), combo, 0.34), {}, 0.34);
ok(`the Wilson bound under need: 22 of 34 at +13% is not proven (bound ${Math.round(at13.lb * 100)}% < need ${Math.round(at13.need * 100)}%)`, !at13.ok && at13.lb < at13.need && at13.need > 0.66, at13);
ok("the same 22 of 34 passes at +34% (break-even 37%, need 55%)", at34.ok && at34.need === 0.55, at34);
ok("average net <= 0: not proven", !P(proof(stat(30, 34, 0))).ok && /loses on average/.test(P(proof(stat(30, 34, -0.01))).why));
ok("the last outcome over 24 h old: not proven", !P(proof(stat(30, 34, 0.4, NOW - 24 * 3_600_000 - 1))).ok);
const loose = rulesOf({ ...cfg, sl: -0.9 });
ok("a bucket whose stop is not -15%: not proven", !proven(proof(stat(30, 34, 0.4), combo, 0.21, loose), combo, 0.21, { ...cfg, sl: -0.9, minTrades: 34, stakeUsd: 5.73 }, NOW).ok);
ok("no bucket under the current rules: not proven", !P(proof(stat(30, 34, 0.4)), { crashMs: 0 }).ok);
const noFib = "age1|lq1|h2|src:trending|e:any";
ok("a combo without '|e:fib': not proven", !P(proof(stat(30, 34, 0.4), noFib), {}, 0.21, noFib).ok && /Fibonacci/.test(P(proof(stat(30, 34, 0.4), noFib), {}, 0.21, noFib).why));
ok("R2 minTrades 5 / minWin 0.4 are clamped to 21 / 0.55", floors({ minTrades: 5, minWin: 0.4 }).minTrades === 21 && floors({ minTrades: 5, minWin: 0.4 }).minWin === 0.55 && MIN_TRADES === 21 && MIN_WIN === 0.55);
ok("with minTrades 5 from R2, 20 trades are still not enough", !P(proof(stat(20, 20, 0.4)), { minTrades: 5 }).ok);
ok("R2 can raise the floors: minTrades 55 blocks 34", !P(proof(stat(30, 34, 0.4)), { minTrades: 55 }).ok);
ok("assumedRt: the proof's own rt plus network at the stake", near(assumedRt({ rt: 0.025 }, 5.73), 0.025 + 0.03 / 5.73, 1e-9) && near(assumedRt(null, 5.73), 0.025 + 0.03 / 5.73, 1e-9));

console.log(`\nproof.test.mjs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
