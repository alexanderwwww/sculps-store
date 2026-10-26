import test from "node:test";
import assert from "node:assert/strict";
import { summarize, regression, expenditureFor, rmrAt, DEFAULT_SETTINGS, MET, validateWeight, validateKcal, weightAtOrBefore } from "../src/lib/calc.mjs";
import { addDays } from "../src/lib/time.mjs";

const mk = () => ({ settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), weights: {}, intake: {}, activity: {}, revisions: [] });
const w = (s, d, kg) => { s.weights[d] = { kg, savedAt: "x" }; };
const eat = (s, d, kcal, status = "complete", zero = false) => { s.intake[d] = { kcal, status, zero, savedAt: "x" }; };

test("nothing is assumed before the first weight", () => {
  const s = summarize(mk(), "2026-10-26");
  assert.equal(s.started, false);
  assert.equal(s.startKg, null);
  assert.equal(s.latestKg, null);
  assert.equal(s.goals.primary.remainingKg, null);
  assert.equal(s.forecast.available, false);
  assert.equal(s.days.remaining, 61); // 26 Oct .. 25 Dec inclusive
});

test("start is the first real measurement; totals, remaining and percent", () => {
  const st = mk();
  w(st, "2026-10-20", 110);
  w(st, "2026-10-26", 106.75);
  const s = summarize(st, "2026-10-26");
  assert.equal(s.startKg, 110);
  assert.equal(s.startDate, "2026-10-20");
  assert.equal(s.latestKg, 106.75);
  assert.equal(s.totalChangeKg, -3.25);
  assert.equal(s.goals.primary.remainingKg, 10.75);
  assert.equal(s.goals.primary.percent, 23.2); // 3.25 / 14
  assert.equal(s.goals.secondary.remainingKg, 16.75);
  assert.equal(s.days.elapsed, 7);
  assert.equal(s.days.total, 67);
});

test("difference from the preceding day exists only when both consecutive days exist", () => {
  const st = mk();
  w(st, "2026-10-24", 108);
  w(st, "2026-10-26", 107);
  assert.equal(summarize(st, "2026-10-26").previousDay, null);
  w(st, "2026-10-25", 107.6);
  const p = summarize(st, "2026-10-26").previousDay;
  assert.equal(p.changeKg, -0.6);
  assert.equal(p.date, "2026-10-25");
});

test("goal already reached is reported as reached and percent is capped", () => {
  const st = mk();
  w(st, "2026-10-01", 100);
  w(st, "2026-10-26", 95);
  const g = summarize(st, "2026-10-26").goals.primary;
  assert.equal(g.reached, true);
  assert.equal(g.percent, 100);
  assert.equal(g.remainingKg, 0);
});

test("starting at or below a goal does not invent a percentage", () => {
  const st = mk();
  w(st, "2026-10-26", 95);
  const g = summarize(st, "2026-10-26").goals.primary;
  assert.equal(g.percent, null);
  assert.equal(g.alreadyAtStart, true);
});

test("the 25th is the last mission day; after it the mission is ended and nothing extends", () => {
  const st = mk();
  w(st, "2026-12-01", 100);
  const onLast = summarize(st, "2026-12-25");
  assert.equal(onLast.missionEnded, false);
  assert.equal(onLast.days.remaining, 1);
  const after = summarize(st, "2026-12-26");
  assert.equal(after.missionEnded, true);
  assert.equal(after.missionActive, false);
  assert.equal(after.days.remaining, 0);
  assert.equal(after.days.elapsed, 25); // 1 Dec .. 25 Dec
  assert.equal(after.endDate, "2026-12-25");
});

test("seven-day trend needs enough weights and says why when it cannot", () => {
  const st = mk();
  w(st, "2026-10-20", 110);
  w(st, "2026-10-26", 109);
  const t = summarize(st, "2026-10-26").trend7;
  assert.equal(t.available, false);
  assert.match(t.reason, /at least 3/);
});

test("seven-day trend gives the weekly change from a fitted line", () => {
  const st = mk();
  // exactly -0.1 kg per day over 7 days
  for (let i = 0; i < 7; i++) w(st, addDays("2026-10-20", i), 110 - i * 0.1);
  const t = summarize(st, "2026-10-26").trend7;
  assert.equal(t.available, true);
  assert.equal(t.weeklyChangeKg, -0.7);
  assert.equal(t.count, 7);
});

test("regression: slope and standard error on a known set", () => {
  const r = regression([[0, 10], [1, 12], [2, 11], [3, 14], [4, 15]]);
  assert.ok(Math.abs(r.slope - 1.2) < 1e-9);
  assert.ok(r.se > 0);
  assert.equal(regression([[1, 1], [1, 2]]), null);
  assert.equal(regression([[1, 1]]), null);
});

test("forecast refuses to guess with too little data", () => {
  const st = mk();
  for (let i = 0; i < 4; i++) w(st, addDays("2026-10-20", i * 2), 110 - i);
  const f = summarize(st, "2026-10-26").forecast;
  assert.equal(f.available, false);
  assert.match(f.reason, /at least 5/);
});

test("forecast: a steady fall gives a goal date, a range, and a projection", () => {
  const st = mk();
  // 110 falling 0.2 kg/day with a little noise, 12 days
  const noise = [0.05, -0.04, 0.03, -0.05, 0.02, 0.04, -0.03, 0.0, -0.02, 0.05, -0.04, 0.01];
  for (let i = 0; i < 12; i++) w(st, addDays("2026-10-15", i), 110 - i * 0.2 + noise[i]);
  const s = summarize(st, "2026-10-26");
  const f = s.forecast;
  assert.equal(f.available, true);
  assert.ok(f.goalDate, f.reason);
  assert.ok(f.goalDate.earliest <= f.goalDate.date && f.goalDate.date <= f.goalDate.latest);
  // about 107.8 now, goal 96: 11.8 / 0.2 = about 59 days out, so a date in late December
  assert.ok(f.goalDate.date > "2026-12-10" && f.goalDate.date < "2027-01-10", f.goalDate.date);
  assert.ok(Math.abs(f.weeklyChangeKg - -1.4) < 0.15);
  assert.equal(f.projectedAtEnd.date, "2026-12-25");
  assert.ok(f.projectedAtEnd.rangeKg[0] <= f.projectedAtEnd.kg && f.projectedAtEnd.kg <= f.projectedAtEnd.rangeKg[1]);
});

test("forecast beyond December 25 is flagged and does not extend the mission", () => {
  const st = mk();
  for (let i = 0; i < 10; i++) w(st, addDays("2026-10-17", i), 120 - i * 0.1 + (i % 2 ? 0.01 : -0.01));
  const s = summarize(st, "2026-10-26");
  assert.equal(s.forecast.goalDate.afterMissionEnd, true);
  assert.match(s.forecast.reason, /not extended/);
  assert.equal(s.endDate, "2026-12-25");
});

test("forecast: a flat trend gives no goal date and says it is flat", () => {
  const st = mk();
  const v = [100.02, 99.98, 100.01, 99.99, 100.03, 99.97, 100.0, 100.02];
  v.forEach((x, i) => w(st, addDays("2026-10-19", i), x));
  const f = summarize(st, "2026-10-26").forecast;
  assert.equal(f.goalDate, null);
  assert.match(f.reason, /flat/);
});

test("forecast: a rising trend gives no goal date and says it is rising", () => {
  const st = mk();
  for (let i = 0; i < 8; i++) w(st, addDays("2026-10-19", i), 100 + i * 0.2);
  const f = summarize(st, "2026-10-26").forecast;
  assert.equal(f.goalDate, null);
  assert.match(f.reason, /rising/);
});

test("forecast: very noisy weights give no goal date and say they are too uneven", () => {
  const st = mk();
  const v = [104, 100, 105, 99, 106, 101, 104, 100];
  v.forEach((x, i) => w(st, addDays("2026-10-19", i), x));
  const f = summarize(st, "2026-10-26").forecast;
  assert.equal(f.goalDate, null);
  assert.match(f.reason, /uneven|flat|rising/);
});

test("expenditure: baseline equals the entered 2,790 at the measured weight, resting scales 10 kcal per kg", () => {
  const p = DEFAULT_SETTINGS.profile;
  const e = expenditureFor(p, 110, 110, null);
  assert.equal(Math.round(e.rmr), 1800);
  assert.equal(Math.round(e.total), 2790);
  assert.equal(rmrAt(p, 100, 110), 1700);
  assert.equal(Math.round(expenditureFor(p, 100, 110, null).total), Math.round(1700 * (2790 / 1800)));
});

test("exercise is not double counted: only minutes above the baseline allowance, net of resting", () => {
  const p = DEFAULT_SETTINGS.profile; // allowance 30 min
  const none = expenditureFor(p, 110, 110, { exerciseMin: 30, intensity: "moderate" });
  assert.equal(none.extra, 0); // already inside the multiplier
  const less = expenditureFor(p, 110, 110, { exerciseMin: 10, intensity: "vigorous" });
  assert.equal(less.extra, 0);
  const more = expenditureFor(p, 110, 110, { exerciseMin: 90, intensity: "moderate" });
  // 60 extra minutes, (5-1) MET net, 110 kg: 4 * 110 * 1 = 440
  assert.equal(Math.round(more.extra), 440);
  assert.equal(Math.round(more.total), Math.round(more.baseline + 440));
  assert.equal(MET.light, 3);
});

test("missing intake is unknown, never zero; partial is not a total; zero is explicit", () => {
  const st = mk();
  w(st, "2026-10-20", 110);
  eat(st, "2026-10-21", 2000);
  eat(st, "2026-10-22", 900, "partial");
  eat(st, "2026-10-23", 0, "complete", true);
  // 24 and 25 are not logged at all
  const c = summarize(st, "2026-10-25").calories;
  assert.equal(c.elapsedDays, 6);
  assert.equal(c.completeDays, 2);
  assert.equal(c.partialDays, 1);
  assert.equal(c.zeroDays, 1);
  assert.equal(c.unloggedDays, 3);
  assert.equal(c.totalKcal, 2000);
  assert.equal(c.averageKcal, 1000); // (2000 + 0) / 2 complete days; partial and unlogged are left out
  assert.equal(c.coverage, 0.33);
});

test("an unlogged day does not drag the average down", () => {
  const st = mk();
  w(st, "2026-10-20", 110);
  eat(st, "2026-10-20", 2000);
  const c = summarize(st, "2026-10-26").calories;
  assert.equal(c.averageKcal, 2000);
  assert.equal(c.unloggedDays, 6);
});

test("energy balance needs three complete days and is labelled an estimate", () => {
  const st = mk();
  w(st, "2026-10-20", 110);
  eat(st, "2026-10-20", 2000);
  eat(st, "2026-10-21", 2000);
  assert.equal(summarize(st, "2026-10-26").energy.balance.available, false);
  eat(st, "2026-10-22", 2000);
  const b = summarize(st, "2026-10-26").energy.balance;
  assert.equal(b.available, true);
  assert.equal(b.days, 3);
  assert.ok(b.averagePerDayKcal < 0); // 2000 eaten against about 2790 spent
  assert.match(b.label, /estimate/);
});

test("validation", () => {
  assert.equal(validateWeight(106.75), null);
  assert.ok(validateWeight(5));
  assert.ok(validateWeight(NaN));
  assert.equal(validateKcal(0), null);
  assert.ok(validateKcal(-1));
  assert.ok(validateKcal(25000));
});

test("weightAtOrBefore never looks forward", () => {
  const st = mk();
  w(st, "2026-10-20", 110);
  w(st, "2026-10-25", 108);
  assert.equal(weightAtOrBefore(st.weights, "2026-10-22").kg, 110);
  assert.equal(weightAtOrBefore(st.weights, "2026-10-19"), null);
});
