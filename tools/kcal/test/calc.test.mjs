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

/* ---------------------------------------------------------------- analytics */
import { analytics, coach } from "../src/lib/calc.mjs";

test("analytics before the first weight is empty and invents nothing", () => {
  const a = analytics(mk(), "2026-10-26");
  assert.equal(a.started, false);
  assert.deepEqual(a.weeks, []);
  assert.equal(a.streak, null);
});

test("weekly table: Monday to Sunday averages, change against the previous logged week, complete-day calories only", () => {
  const st = mk();
  // 2026-10-26 is a Monday
  w(st, "2026-10-26", 110); w(st, "2026-10-27", 109.6); w(st, "2026-10-29", 109.4);
  w(st, "2026-11-02", 108.5); w(st, "2026-11-03", 108.1);
  eat(st, "2026-10-26", 2000); eat(st, "2026-10-27", 1000, "partial"); eat(st, "2026-10-28", 2200);
  const a = analytics(st, "2026-11-04");
  assert.equal(a.weeks.length, 2);
  assert.equal(a.weeks[0].start, "2026-10-26");
  assert.equal(a.weeks[0].avgKg, 109.67);
  assert.equal(a.weeks[0].weightDays, 3);
  assert.equal(a.weeks[0].avgKcal, 2100); // the partial day is left out
  assert.equal(a.weeks[0].completeDays, 2);
  assert.equal(a.weeks[1].avgKg, 108.3);
  assert.equal(a.weeks[1].changeKg, -1.37);
  assert.equal(a.weeks[1].avgKcal, null);
  assert.equal(a.weeks[1].days, 3); // the current week only counts days so far
});

test("logging streak counts mornings in a row; today not yet logged does not break it", () => {
  const st = mk();
  for (const d of ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-24", "2026-10-25"]) w(st, d, 100);
  assert.equal(analytics(st, "2026-10-25").streak.current, 2);
  assert.equal(analytics(st, "2026-10-26").streak.current, 2); // 26th still to come
  assert.equal(analytics(st, "2026-10-27").streak.current, 0); // the 26th was missed
  assert.equal(analytics(st, "2026-10-25").streak.longest, 3);
  assert.equal(analytics(st, "2026-10-25").consistency.percent, 83);
});

test("lowest weight, new low, biggest one-day drop", () => {
  const st = mk();
  w(st, "2026-10-20", 110); w(st, "2026-10-21", 109); w(st, "2026-10-22", 109.5); w(st, "2026-10-23", 107.9);
  const a = analytics(st, "2026-10-23");
  assert.equal(a.lows.lowestKg, 107.9);
  assert.equal(a.lows.newLowToday, true);
  assert.deepEqual(a.biggestDrop, { date: "2026-10-23", kg: -1.6 });
  w(st, "2026-10-24", 108.4);
  assert.equal(analytics(st, "2026-10-24").lows.newLowToday, false);
});

test("milestones: each whole kg below the start and the percent marks, dated by the real weight that reached them", () => {
  const st = mk();
  w(st, "2026-10-20", 110.5); w(st, "2026-10-21", 109.9); w(st, "2026-10-22", 107.2);
  const a = analytics(st, "2026-10-22");
  const kgm = a.milestones.filter((m) => m.kind === "kg");
  assert.deepEqual(kgm.map((m) => m.level), [110, 109, 108]);
  assert.ok(kgm.some((m) => m.level === 109 && m.date === "2026-10-22"));
  assert.ok(kgm.some((m) => m.level === 110 && m.date === "2026-10-21"));
  assert.ok(!kgm.some((m) => m.level === 107));
  const pc = a.milestones.filter((m) => m.kind === "percent");
  assert.ok(pc.some((m) => m.percent === 10)); // 110.5 to 96 is 14.5 kg; 10% is 1.45 kg: 109.05 reached at 107.2
  assert.ok(!pc.some((m) => m.percent === 50));
});

test("weekday calories use complete days only", () => {
  const st = mk();
  w(st, "2026-10-26", 100);
  eat(st, "2026-10-26", 2000); // Monday
  eat(st, "2026-11-02", 1600); // Monday
  eat(st, "2026-10-27", 900, "partial"); // Tuesday, partial: ignored
  const a = analytics(st, "2026-11-03");
  assert.equal(a.weekdays[0].dow, "Mon");
  assert.equal(a.weekdays[0].avgKcal, 1800);
  assert.equal(a.weekdays[1].avgKcal, null);
});

test("burn comparison keeps unlogged days empty", () => {
  const st = mk();
  w(st, "2026-10-20", 110);
  eat(st, "2026-10-21", 2000);
  const a = analytics(st, "2026-10-22");
  const day = (d) => a.burn.find((b) => b.date === d);
  assert.equal(day("2026-10-20").kcal, null);
  assert.equal(day("2026-10-20").status, "none");
  assert.equal(day("2026-10-21").kcal, 2000);
  assert.ok(day("2026-10-21").estimatedBurn > 2000);
});

test("coach: facts only, calm about a gain, no praise for eating less", () => {
  const st = mk();
  assert.match(coach(summarize(st, "2026-10-26"), analytics(st, "2026-10-26")).headline, /first weight/);
  w(st, "2026-10-26", 110);
  let c = coach(summarize(st, "2026-10-26"), analytics(st, "2026-10-26"));
  assert.match(c.headline, /Day 1 logged/);
  w(st, "2026-10-27", 110.4);
  c = coach(summarize(st, "2026-10-27"), analytics(st, "2026-10-27"));
  assert.match(c.headline, /up from yesterday/);
  assert.ok(c.lines.some((l) => /normal|scale|water/i.test(l)));
  w(st, "2026-10-28", 109.2);
  c = coach(summarize(st, "2026-10-28"), analytics(st, "2026-10-28"));
  assert.match(c.headline, /New low/);
  const all = JSON.stringify(c).toLowerCase();
  assert.ok(!/skip|starv|fast longer|burn off|cheat/.test(all));
});

/* ------------------------------------------------------------ achievements */
import { achievements } from "../src/lib/calc.mjs";
const ach = (st, today) => Object.fromEntries(achievements(st, today).map((a) => [a.id, a]));

test("achievements before the first weight: all locked, none invented", () => {
  const a = achievements(mk(), "2026-10-26");
  assert.ok(a.length >= 12);
  assert.ok(a.every((x) => !x.unlocked && x.date === null && x.progress === 0));
});

test("first weight unlocks Day 1 on its date; the rest wait", () => {
  const st = mk();
  w(st, "2026-10-27", 110);
  const a = ach(st, "2026-10-27");
  assert.equal(a["first-weight"].unlocked, true);
  assert.equal(a["first-weight"].date, "2026-10-27");
  assert.equal(a["streak-3"].unlocked, false);
  assert.equal(a["kg-1"].unlocked, false);
  assert.equal(a["goal"].unlocked, false);
});

test("streak medals unlock on the day the run reaches the length, and a broken run keeps what it earned", () => {
  const st = mk();
  for (let i = 0; i < 8; i++) w(st, addDays("2026-10-27", i), 110 - i * 0.1);
  // a gap, then more
  w(st, "2026-11-08", 108);
  const a = ach(st, "2026-11-08");
  assert.equal(a["streak-3"].date, "2026-10-29");
  assert.equal(a["streak-7"].date, "2026-11-02");
  assert.equal(a["streak-14"].unlocked, false);
  assert.ok(a["streak-14"].progress > 0.5 && a["streak-14"].progress < 0.6); // best run 8 of 14
});

test("kilo and percent medals are dated by the first real weight that reached them, and use the lowest weight", () => {
  const st = mk();
  w(st, "2026-10-27", 110);
  w(st, "2026-10-28", 108.9); // 1.1 down
  w(st, "2026-10-29", 109.5); // bounced up: the medal stays
  w(st, "2026-10-30", 104.9); // 5.1 down, 36% of 14 kg
  const a = ach(st, "2026-10-30");
  assert.equal(a["kg-1"].date, "2026-10-28");
  assert.equal(a["kg-2"].date, "2026-10-30");
  assert.equal(a["kg-5"].date, "2026-10-30");
  assert.equal(a["kg-10"].unlocked, false);
  assert.equal(a["pct-25"].date, "2026-10-30");
  assert.equal(a["pct-50"].unlocked, false);
  assert.ok(Math.abs(a["pct-50"].progress - 5.1 / 7) < 0.01);
});

test("goal medals unlock only on a real measurement at or below the goal", () => {
  const st = mk();
  w(st, "2026-10-27", 100);
  w(st, "2026-10-28", 96.4);
  assert.equal(ach(st, "2026-10-28")["goal"].unlocked, false);
  w(st, "2026-10-29", 95.9);
  const a = ach(st, "2026-10-29");
  assert.equal(a["goal"].date, "2026-10-29");
  assert.equal(a["goal2"].unlocked, false);
});

test("food medals come from finished days only; open days and zero-intake days earn nothing special", () => {
  const st = mk();
  w(st, "2026-10-27", 110);
  eat(st, "2026-10-27", 1500, "partial");
  assert.equal(ach(st, "2026-10-27")["complete-1"].unlocked, false);
  eat(st, "2026-10-28", 0, "complete", true);
  // a zero-intake day is recorded, but it never earns a food medal
  const a = ach(st, "2026-10-28");
  assert.equal(a["complete-1"].unlocked, false);
  assert.equal(a["full-7"].progress, 0);
});

test("full days in a row need both the weight and a finished day, seven running", () => {
  const st = mk();
  for (let i = 0; i < 7; i++) { w(st, addDays("2026-10-27", i), 110); eat(st, addDays("2026-10-27", i), 2000); }
  const a = ach(st, "2026-11-02");
  assert.equal(a["full-7"].date, "2026-11-02");
  assert.equal(a["complete-7"].date, "2026-11-02");
  eat(st, "2026-11-03", 2000, "partial"); w(st, "2026-11-03", 110);
  assert.equal(ach(st, "2026-11-03")["full-7"].unlocked, true); // earned stays earned
});

test("a lower week, new lows and halfway", () => {
  const st = mk();
  // Monday 2026-10-26 week avg 110, next week avg 109
  w(st, "2026-10-26", 110); w(st, "2026-10-27", 110);
  w(st, "2026-11-02", 109); w(st, "2026-11-03", 109);
  const a = ach(st, "2026-11-04");
  assert.equal(a["week-down"].unlocked, true);
  assert.equal(a["half"].unlocked, false);
  const st2 = mk();
  w(st2, "2026-10-27", 110);
  assert.equal(ach(st2, "2026-12-01")["half"].unlocked, true); // day 36 of 60 passes the middle
  for (let i = 1; i <= 6; i++) w(st2, addDays("2026-10-27", i), 110 - i);
  assert.equal(ach(st2, "2026-11-02")["lows-5"].unlocked, true);
});
