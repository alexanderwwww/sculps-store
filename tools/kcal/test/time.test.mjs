import test from "node:test";
import assert from "node:assert/strict";
import { isDate, dayDiff, addDays, todayIn, clockIn, eachDay } from "../src/lib/time.mjs";

test("calendar dates are validated", () => {
  assert.ok(isDate("2026-12-25"));
  assert.ok(!isDate("2026-02-30"));
  assert.ok(!isDate("2026-2-3"));
  assert.ok(!isDate("tomorrow"));
  assert.ok(!isDate(undefined));
});

test("day arithmetic ignores daylight-saving changes", () => {
  // Europe springs forward 2026-03-29, the US on 2026-03-08; Europe falls back 2026-10-25.
  assert.equal(dayDiff("2026-03-28", "2026-03-30"), 2);
  assert.equal(dayDiff("2026-03-07", "2026-03-09"), 2);
  assert.equal(dayDiff("2026-10-24", "2026-10-26"), 2);
  assert.equal(addDays("2026-03-28", 2), "2026-03-30");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("the 25th is a full day: it is the last day of the mission, inclusive", () => {
  assert.equal(dayDiff("2026-12-25", "2026-12-25") + 1, 1);
  assert.equal(dayDiff("2026-12-24", "2026-12-25") + 1, 2);
});

test("today is the calendar day in the chosen zone, not UTC", () => {
  const instant = new Date("2026-10-26T22:30:00Z");
  assert.equal(todayIn("Europe/Athens", instant), "2026-10-27"); // already after midnight in Athens
  assert.equal(todayIn("America/Los_Angeles", instant), "2026-10-26");
  assert.equal(todayIn("UTC", instant), "2026-10-26");
  assert.equal(clockIn("Europe/Athens", instant), "00:30");
});

test("eachDay is inclusive and empty when reversed", () => {
  assert.deepEqual(eachDay("2026-03-28", "2026-03-30"), ["2026-03-28", "2026-03-29", "2026-03-30"]);
  assert.deepEqual(eachDay("2026-03-30", "2026-03-28"), []);
});

test("an invalid date throws instead of guessing", () => {
  assert.throws(() => dayDiff("2026-02-30", "2026-03-01"));
});
