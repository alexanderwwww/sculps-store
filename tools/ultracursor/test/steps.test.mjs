// The real-money plan (build 41): steps.mjs against design/symbiot/plan-2000-steps.md, row by
// row to the cent, plus the rules no stake may break (never bigger after a loss, never over the
// cap), pause/halt/done, the progress bar and the goals. Pure: no network, no money.
//
//   node test/steps.test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../src/trader/real/steps.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.ULTRA_REPO || path.resolve(HERE, "../../..");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : typeof x === "string" ? x : JSON.stringify(x)); } };

// ---------------------------------------------------------------- the table, row by row
const md = fs.readFileSync(path.join(REPO, "design/symbiot/plan-2000-steps.md"), "utf8");
const rows = md.split("\n").filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.split("|").slice(1, -1).map((x) => x.trim()));
const money = (s) => Number(s.replace(/[$,+%]/g, ""));
ok("the table has 76 rows", rows.length === 76, rows.length);
let bal = 15, bad = [];
rows.forEach((r, i) => {
  const no = i + 1, T = P.targetFor(no), row = P.planRow(bal, T);
  const got = [no, P.round2(bal), row.stake, Math.round(T * 100), P.round2(row.fees), P.round2(row.out), P.round2(row.profit), P.round2(row.after)];
  const want = [Number(r[0]), money(r[1]), money(r[2]), money(r[3]), money(r[4]), money(r[5]), money(r[6]), money(r[7])];
  if (got.some((g, k) => Math.abs(g - want[k]) > 1e-9)) bad.push(`${no}: ${got.join(" ")} | ${want.join(" ")}`);
  bal = row.after;
});
ok("76 take-profits from $15 reproduce every row to the cent", bad.length === 0, bad.slice(0, 3));
ok("final balance $2,019.25", P.round2(bal) === 2019.25, bal);
ok("targets rotate 21/13/34/21/13", [1, 2, 3, 4, 5, 6, 7, 8].map(P.targetFor).join(",") === "0.21,0.13,0.34,0.21,0.13,0.21,0.13,0.34");
ok("step 1: $5.73 at +21% nets +$1.02 (the plan's own row)", P.planRow(15, 0.21).stake === 5.73 && P.round2(P.planRow(15, 0.21).profit) === 1.02);

// ---------------------------------------------------------------- a lost step repeats smaller
{
  let L = P.newLedger(15);
  const s1 = P.stakeFor(L, 15);
  const lossBal = 15 - s1 * 0.15 - P.feesPlan(s1, -0.15);
  L = P.onClose(L, { net: -1, stake: s1, balUsd: lossBal, nowMs: 0 });
  const s2 = P.stakeFor(L, lossBal);
  ok("a stop repeats step 1 as attempt 2", L.step.no === 1 && L.step.attempt === 2 && L.afterLoss === true, L.step);
  ok("with a smaller stake from the smaller balance", s2 < s1 && s2 === P.round2(0.382 * lossBal), { s1, s2 });
  L = P.onClose(L, { net: 0.5, stake: s2, balUsd: lossBal + 0.5, nowMs: 1 });
  ok("a win after it moves on to step 2, attempt 1", L.step.no === 2 && L.step.attempt === 1 && L.afterLoss === false && L.step.target === 0.13, L.step);
  ok("a win of exactly 0 is not a win (net must be > 0)", P.onClose(P.newLedger(15), { net: 0, stake: 5.73, balUsd: 15, nowMs: 0 }).step.no === 1);
}

// ---------------------------------------------------------------- property: no martingale, never over the cap
{
  let seed = 41;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let worst = null, over = null, runs = 0, trades = 0;
  for (let run = 0; run < 10_000; run++) {
    let L = P.newLedger(15), b = 15 + rnd() * 200, t = 0, prev = null, lastLoss = false;
    L.peakUsd = b;
    for (let k = 0; k < 40; k++) {
      L = P.resume(L, b, t);
      if (L.halted || L.done) break;
      const s = P.stakeFor(L, b);
      if (s > P.MAX_STAKE_USD + 1e-9) over = { run, k, s };
      if (lastLoss && prev !== null && s > prev + 1e-9) worst = { run, k, prev, s };
      try { P.assertNoMartingale(L.lastStake, s, L.afterLoss); } catch (e) { worst = { run, k, e: e.message }; }
      const win = rnd() < 0.6, T = P.targetFor(L.step.no), move = win ? T : -0.15 - rnd() * 0.5;
      const net = s * move - P.feesPlan(s, move) + 0;
      b += net;
      L = P.onClose(L, { net, stake: s, balUsd: b, nowMs: t });
      prev = s; lastLoss = !(net > 0); t += 2 * P.HALT_MS; trades++;
    }
    runs++;
  }
  ok(`10,000 random runs (${trades} trades): the stake never grows after a loss`, worst === null, worst);
  ok("and never passes MAX_STAKE_USD ($19.10)", over === null, over);
  ok("assertNoMartingale throws on a bigger stake after a loss, not after a win", (() => { try { P.assertNoMartingale(5, 5.01, true); return false; } catch { return P.assertNoMartingale(5, 9, false) === true; } })());
  ok("the cap holds on a big balance: $500 stakes $19.10", P.stakeFor(P.newLedger(15), 500) === 19.1);
}

// ---------------------------------------------------------------- pause, halt, done
{
  let L = P.newLedger(15), b = 15;
  for (let i = 0; i < 3; i++) { b -= 0.4; L = P.onClose(L, { net: -0.4, stake: 5, balUsd: b, nowMs: 1000 }); }
  ok("3 losses in a row: PAUSED for 1 h", L.paused && L.paused.until === 1000 + 3_600_000 && /3 losses/.test(L.paused.why), L.paused);
  ok("the pause lifts after the hour, not before", P.resume(L, b, 1000 + 3_599_999).paused && !P.resume(L, b, 1000 + 3_600_000).paused);
  let H = P.newLedger(15); H.peakUsd = 30;
  H = P.onClose(H, { net: -10, stake: 10, balUsd: 0.618 * 30, nowMs: 5 });
  ok("balance at 61.8% of the peak: HALTED for 24 h", H.halted && H.halted.until === 5 + 24 * 3_600_000, H.halted);
  const R = P.resume(H, 18.54, 5 + 24 * 3_600_000);
  ok("after 24 h the halt lifts and the peak restarts at the balance", !R.halted && R.peakUsd === 18.54, R);
  const S = P.onClose(P.newLedger(15), { net: -12.1, stake: 5.73, balUsd: 2.9, nowMs: 9 });
  ok("under $3: HALTED 'too small', with no end", S.halted && /too small/.test(S.halted.why) && S.halted.until === null && P.resume(S, 2.9, 1e15).halted, S.halted);
  const D = P.onClose(P.newLedger(15), { net: 5, stake: 19.1, balUsd: 2000, nowMs: 9 });
  ok("$2,000: DONE", D.done === true);
}

// ---------------------------------------------------------------- progress and goals
{
  ok("progress is 0 at $15 and 1 at $2,000", P.progress(15) === 0 && P.progress(2000) === 1 && P.progress(10) === 0 && P.progress(5000) === 1);
  let mono = true, last = -1;
  for (let x = 15; x <= 2000; x *= 1.01) { const p = P.progress(x); if (p < last) mono = false; last = p; }
  ok("progress is monotonic (log scale) and moves on step 1", mono && P.progress(16.02) > 0.01, P.progress(16.02));
  const walk = []; for (let x = 15; x < 2000;) { const g = P.nextGoal(x); walk.push(g); x = g; }
  ok("nextGoal walks 20, 30, 50, 63.6 … 2000", walk.join(",") === "20,30,50,63.6,102.9,166.5,269.4,435.9,705.3,1141,1846,2000", walk.join(","));
  ok("nextGoal is null once $2,000 is reached", P.nextGoal(2000) === null);
  ok("stepGoal = the plan row's balance after (step 4 from $18.56 -> $19.82)", P.round2(P.stepGoal({ ...P.newLedger(15), step: { no: 4, attempt: 1 } }, 18.56)) === 19.82);
}

// ---------------------------------------------------------------- frozen
{
  const tries = [() => { P.TARGETS[0] = 0.9; }, () => { P.GOALS.push(1); }, () => { P.PLAN.MAX_STAKE_USD = 99; }, () => { P.PLAN.SL = -0.9; }];
  let threw = 0;
  for (const t of tries) { try { t(); } catch { threw++; } }
  ok("TARGETS, GOALS and PLAN are frozen: every write throws", threw === tries.length && P.TARGETS[0] === 0.21 && P.PLAN.MAX_STAKE_USD === 19.1 && P.SL === -0.15, threw);
  ok("the plan constants", P.STEPS === 76 && P.GOAL_USD === 2000 && P.STAKE_F === 0.382 && P.PLAN_FEE_SIDE === 0.0125 && P.PLAN_NET_USD === 0.03 && P.MAX_STAKE_USD === 19.1);
}

console.log(`\nsteps.test.mjs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
