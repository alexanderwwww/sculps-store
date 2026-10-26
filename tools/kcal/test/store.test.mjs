import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, SCHEMA } from "../src/lib/store.mjs";

const fresh = (t0 = "2026-10-26T10:00:00Z") => {
  const dir = mkdtempSync(join(tmpdir(), "kcal-store-"));
  let now = new Date(t0);
  const clock = () => now;
  const s = new Store(dir, clock).open();
  s.advance = (ms) => { now = new Date(now.getTime() + ms); };
  return s;
};
const TODAY = "2026-10-26";

test("one weight per day: saving again corrects it and keeps the old value in the log", () => {
  const s = fresh();
  assert.deepEqual(s.setWeight(TODAY, 106.75, TODAY), { ok: true, replaced: false });
  assert.deepEqual(s.setWeight(TODAY, 106.5, TODAY), { ok: true, replaced: true });
  assert.equal(Object.keys(s.state.weights).length, 1);
  assert.equal(s.state.weights[TODAY].kg, 106.5);
  const rev = s.state.revisions.filter((r) => r.kind === "weight");
  assert.equal(rev.length, 2);
  assert.equal(rev[1].before.kg, 106.75);
  assert.ok(s.state.weights[TODAY].savedAt);
});

test("decimals keep two places", () => {
  const s = fresh();
  s.setWeight(TODAY, 106.754, TODAY);
  assert.equal(s.state.weights[TODAY].kg, 106.75);
});

test("backfilling an earlier day works; the future and invalid dates are refused", () => {
  const s = fresh();
  assert.equal(s.setWeight("2026-10-20", 110, TODAY).ok, true);
  assert.equal(s.setWeight("2026-10-27", 110, TODAY).ok, false);
  assert.equal(s.setWeight("2026-02-30", 110, TODAY).ok, false);
  assert.equal(s.setWeight(TODAY, 12, TODAY).ok, false);
  assert.equal(s.setWeight(TODAY, "abc", TODAY).ok, false);
  assert.equal(Object.keys(s.state.weights).length, 1);
});

test("an unlogged day stays unlogged: no record is created for it", () => {
  const s = fresh();
  s.setWeight(TODAY, 100, TODAY);
  assert.equal(s.state.intake[TODAY], undefined);
  assert.equal(s.setIntake(TODAY, "", "complete", TODAY).ok, false);
});

test("intake: complete and partial are distinct and need a status", () => {
  const s = fresh();
  assert.equal(s.setIntake(TODAY, 1800, "partial", TODAY).ok, true);
  assert.equal(s.state.intake[TODAY].status, "partial");
  assert.equal(s.setIntake(TODAY, 2100, "complete", TODAY).ok, true);
  assert.equal(s.state.intake[TODAY].status, "complete");
  assert.equal(s.state.intake[TODAY].zero, false);
  assert.equal(s.setIntake(TODAY, 2100, "whatever", TODAY).ok, false);
  assert.equal(s.setIntake(TODAY, -5, "complete", TODAY).ok, false);
});

test("zero intake only exists as an explicit, confirmed record", () => {
  const s = fresh();
  assert.equal(s.setZeroIntake(TODAY, false, TODAY).ok, false);
  assert.equal(s.setZeroIntake(TODAY, undefined, TODAY).ok, false);
  assert.equal(s.state.intake[TODAY], undefined);
  const r = s.setZeroIntake(TODAY, true, TODAY);
  assert.equal(r.ok, true);
  assert.deepEqual({ k: s.state.intake[TODAY].kcal, z: s.state.intake[TODAY].zero, st: s.state.intake[TODAY].status }, { k: 0, z: true, st: "complete" });
});

test("zero intake can be undone back to exactly what was there, and corrected by saving calories", () => {
  const s = fresh();
  s.setIntake(TODAY, 1500, "partial", TODAY);
  const z = s.setZeroIntake(TODAY, true, TODAY);
  assert.equal(z.previous.kcal, 1500);
  s.restoreIntake(TODAY, z.previous);
  assert.equal(s.state.intake[TODAY].kcal, 1500);
  assert.equal(s.state.intake[TODAY].status, "partial");
  // from nothing: undo returns to "not logged", not to 0
  s.clearIntake(TODAY);
  const z2 = s.setZeroIntake(TODAY, true, TODAY);
  assert.equal(z2.previous, null);
  s.restoreIntake(TODAY, null);
  assert.equal(s.state.intake[TODAY], undefined);
  // correction
  s.setZeroIntake(TODAY, true, TODAY);
  s.setIntake(TODAY, 1900, "complete", TODAY);
  assert.equal(s.state.intake[TODAY].zero, false);
  assert.equal(s.state.intake[TODAY].kcal, 1900);
});

test("the mission ends on December 25: later days are refused, earlier days can still be corrected", () => {
  const s = fresh("2026-12-30T10:00:00Z");
  assert.equal(s.setWeight("2026-12-26", 100, "2026-12-30").ok, false);
  assert.match(s.setWeight("2026-12-26", 100, "2026-12-30").error, /ended/);
  assert.equal(s.setWeight("2026-12-25", 100, "2026-12-30").ok, true);
  assert.equal(s.setWeight("2026-12-20", 101, "2026-12-30").ok, true);
  assert.equal(s.setIntake("2026-12-31", 1000, "complete", "2026-12-31").ok, false);
});

test("the end date cannot be changed through settings", () => {
  const s = fresh();
  s.setSettings({ mission: { endDate: "2027-06-01", primaryGoalKg: 95 } });
  assert.equal(s.state.settings.mission.endDate, "2026-12-25");
  assert.equal(s.state.settings.mission.primaryGoalKg, 95);
});

test("settings are validated and a bad patch changes nothing", () => {
  const s = fresh();
  const before = JSON.stringify(s.state.settings);
  assert.equal(s.setSettings({ profile: { age: "abc" } }).ok, false);
  assert.equal(s.setSettings({ profile: { baselineKcal: 1000 } }).ok, false); // below resting 1800
  assert.equal(s.setSettings({ reminders: { times: ["25:00"] } }).ok, false);
  assert.equal(JSON.stringify(s.state.settings), before);
  assert.equal(s.setSettings({ reminders: { enabled: true, times: ["21:00", "08:30", "21:00"] } }).ok, true);
  assert.deepEqual(s.state.settings.reminders.times, ["08:30", "21:00"]);
});

test("activity: validated, optional, and clearing removes it", () => {
  const s = fresh();
  assert.equal(s.setActivity(TODAY, { exerciseMin: 45, intensity: "moderate", sleepHours: 7.5, stress: 2, note: "walk" }, TODAY).ok, true);
  assert.equal(s.state.activity[TODAY].exerciseMin, 45);
  assert.equal(s.setActivity(TODAY, { exerciseMin: 45 }, TODAY).ok, false); // minutes need an intensity
  assert.equal(s.setActivity(TODAY, { stress: 9 }, TODAY).ok, false);
  assert.equal(s.setActivity(TODAY, { sleepHours: 30 }, TODAY).ok, false);
  const c = s.setActivity(TODAY, { exerciseMin: "", sleepHours: "", stress: "", note: "" }, TODAY);
  assert.equal(c.cleared, true);
  assert.equal(s.state.activity[TODAY], undefined);
});

test("storage survives a restart with everything intact, and leaves no temp file behind", () => {
  const s = fresh();
  s.setWeight(TODAY, 106.75, TODAY);
  s.setIntake(TODAY, 2000, "complete", TODAY);
  const again = new Store(s.dir, () => new Date("2026-10-27T10:00:00Z")).open();
  assert.equal(again.state.weights[TODAY].kg, 106.75);
  assert.equal(again.state.intake[TODAY].kcal, 2000);
  assert.ok(!existsSync(join(s.dir, "state.json.tmp")));
});

test("automatic backups are throttled to one a minute and trimmed", () => {
  const s = fresh();
  s.setWeight("2026-10-20", 100, TODAY);
  s.setWeight("2026-10-21", 100, TODAY);
  s.setWeight("2026-10-22", 100, TODAY);
  assert.equal(s.listBackups().length, 1);
  s.advance(61_000);
  s.setWeight("2026-10-23", 100, TODAY);
  assert.equal(s.listBackups().length, 2);
  for (let i = 0; i < 70; i++) { s.advance(61_000); s.setWeight("2026-10-24", 100 + i / 100, TODAY); }
  assert.ok(s.listBackups().length <= 60);
});

test("a backup can be restored, and the current records are saved first", () => {
  const s = fresh();
  s.setWeight("2026-10-20", 100, TODAY);
  const name = s.backupNow("manual");
  s.advance(5000);
  s.setWeight("2026-10-21", 99, TODAY);
  assert.equal(Object.keys(s.state.weights).length, 2);
  s.restore(name);
  assert.equal(Object.keys(s.state.weights).length, 1);
  assert.ok(s.listBackups().some((b) => b.name.includes("before-restore")));
  assert.throws(() => s.restore("../../etc/passwd"));
  assert.throws(() => s.restore("state-nope.json"));
});

test("a damaged records file is recovered from the newest backup, and the damaged file is kept", () => {
  const s = fresh();
  s.setWeight("2026-10-20", 100, TODAY);
  s.setIntake("2026-10-20", 2000, "complete", TODAY);
  writeFileSync(s.file, "{ this is not json");
  const again = new Store(s.dir).open();
  assert.equal(again.state.weights["2026-10-20"].kg, 100);
  assert.match(again.loadNotice, /damaged/);
  assert.ok(readdirSync(s.dir).some((n) => n.startsWith("state.damaged-")));
  assert.equal(JSON.parse(readFileSync(s.file, "utf8")).schema, SCHEMA);
});

test("a damaged file with no backup refuses to start empty over it", () => {
  const dir = mkdtempSync(join(tmpdir(), "kcal-damaged-"));
  writeFileSync(join(dir, "state.json"), "garbage");
  assert.throws(() => new Store(dir).open(), /no usable backup/);
  assert.equal(readFileSync(join(dir, "state.json"), "utf8"), "garbage");
});

test("records from a newer app version are never overwritten by an older one", () => {
  const dir = mkdtempSync(join(tmpdir(), "kcal-newer-"));
  const body = JSON.stringify({ schema: SCHEMA + 5, weights: { "2026-10-20": { kg: 100 } } });
  writeFileSync(join(dir, "state.json"), body);
  assert.throws(() => new Store(dir).open(), /newer version/);
  assert.equal(readFileSync(join(dir, "state.json"), "utf8"), body);
});

test("an update keeps old records: a file saved without newer settings fields is filled in, not wiped", () => {
  const dir = mkdtempSync(join(tmpdir(), "kcal-old-"));
  writeFileSync(join(dir, "state.json"), JSON.stringify({ schema: 1, createdAt: "x", settings: { profile: { age: 30 } }, weights: { "2026-10-20": { kg: 101, savedAt: "x" } }, intake: {}, activity: {}, revisions: [] }));
  const s = new Store(dir).open();
  assert.equal(s.state.weights["2026-10-20"].kg, 101);
  assert.equal(s.state.settings.profile.age, 30);
  assert.equal(s.state.settings.profile.rmrKcal, 1800);
  assert.equal(s.state.settings.mission.endDate, "2026-12-25");
  assert.ok(s.state.settings.reminders.times.length);
});

test("drafts: saved, read back, cleared", () => {
  const s = fresh();
  assert.equal(s.readDraft(), null);
  s.writeDraft({ date: TODAY, kg: "106.7" });
  assert.equal(s.readDraft().kg, "106.7");
  assert.ok(s.readDraft().savedAt);
  s.writeDraft(null);
  assert.equal(s.readDraft(), null);
});

test("deleting a weight keeps a revision, and removing a missing one is an error not a crash", () => {
  const s = fresh();
  s.setWeight(TODAY, 100, TODAY);
  assert.equal(s.clearWeight(TODAY).ok, true);
  assert.equal(s.state.weights[TODAY], undefined);
  assert.ok(s.state.revisions.some((r) => r.kind === "weight-removed"));
  assert.equal(s.clearWeight(TODAY).ok, false);
});

/* -------------------------------------------------------------------- meals */
test("meals add up to the day's total and the day stays open until it is finished", () => {
  const s = fresh();
  assert.equal(s.addMeal(TODAY, 450, "breakfast", TODAY).ok, true);
  assert.equal(s.addMeal(TODAY, 700, "lunch", TODAY).ok, true);
  const day = s.state.intake[TODAY];
  assert.equal(day.kcal, 1150);
  assert.equal(day.status, "partial");
  assert.equal(day.meals.length, 2);
  assert.equal(day.meals[1].label, "lunch");
  assert.equal(s.finishDay(TODAY, TODAY).ok, true);
  assert.equal(s.state.intake[TODAY].status, "complete");
  assert.equal(s.state.intake[TODAY].kcal, 1150);
});

test("a meal added to a finished day opens it again; a typed total is kept as a line", () => {
  const s = fresh();
  s.setIntake(TODAY, 1800, "complete", TODAY);
  s.addMeal(TODAY, 300, "snack", TODAY);
  const day = s.state.intake[TODAY];
  assert.equal(day.status, "partial");
  assert.equal(day.kcal, 2100);
  assert.deepEqual(day.meals.map((m) => m.label), ["earlier total", "snack"]);
});

test("a meal on top of a zero day starts fresh and the zero is gone", () => {
  const s = fresh();
  s.setZeroIntake(TODAY, true, TODAY);
  s.addMeal(TODAY, 500, "dinner", TODAY);
  const day = s.state.intake[TODAY];
  assert.equal(day.zero, false);
  assert.equal(day.kcal, 500);
  assert.equal(day.meals.length, 1);
});

test("meal validation: positive, sane, dated; finishing needs something logged", () => {
  const s = fresh();
  assert.equal(s.addMeal(TODAY, 0, "x", TODAY).ok, false);
  assert.equal(s.addMeal(TODAY, -5, "x", TODAY).ok, false);
  assert.equal(s.addMeal(TODAY, 9000, "x", TODAY).ok, false);
  assert.equal(s.addMeal("2026-10-27", 300, "x", TODAY).ok, false);
  assert.equal(s.addMeal(TODAY, "abc", "x", TODAY).ok, false);
  assert.equal(s.finishDay(TODAY, TODAY).ok, false); // nothing logged: never becomes zero by itself
  assert.equal(s.state.intake[TODAY], undefined);
});

test("removing a meal recomputes the total; removing the last one makes the day not logged again", () => {
  const s = fresh();
  s.addMeal(TODAY, 400, "breakfast", TODAY);
  s.addMeal(TODAY, 600, "lunch", TODAY);
  s.removeMeal(TODAY, 0);
  assert.equal(s.state.intake[TODAY].kcal, 600);
  assert.equal(s.removeMeal(TODAY, 5).ok, false);
  s.removeMeal(TODAY, 0);
  assert.equal(s.state.intake[TODAY], undefined);
});

test("a typed total replaces meals", () => {
  const s = fresh();
  s.addMeal(TODAY, 400, "breakfast", TODAY);
  s.setIntake(TODAY, 2000, "complete", TODAY);
  assert.equal(s.state.intake[TODAY].meals, undefined);
  assert.equal(s.state.intake[TODAY].kcal, 2000);
});

test("undoing a removal puts the meals back exactly", () => {
  const s = fresh();
  s.addMeal(TODAY, 400, "breakfast", TODAY);
  s.addMeal(TODAY, 600, "lunch", TODAY);
  const r = s.removeMeal(TODAY, 1);
  s.restoreIntake(TODAY, r.previous);
  assert.equal(s.state.intake[TODAY].kcal, 1000);
  assert.equal(s.state.intake[TODAY].meals.length, 2);
});
