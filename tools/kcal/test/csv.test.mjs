import test from "node:test";
import assert from "node:assert/strict";
import { toCsv, HEADER } from "../src/lib/csv.mjs";

const base = () => ({ weights: {}, intake: {}, activity: {} });

test("empty records give just the header", () => {
  assert.equal(toCsv(base()), HEADER.join(",") + "\r\n");
});

test("not logged stays empty, a day total is labelled, zero is labelled zero", () => {
  const s = base();
  s.weights["2026-10-20"] = { kg: 110, savedAt: "t1" };
  s.intake["2026-10-21"] = { kcal: 2000, status: "complete", zero: false, savedAt: "t2" };
  s.intake["2026-10-22"] = { kcal: 0, status: "complete", zero: true, savedAt: "t3" };
  s.intake["2026-10-23"] = { kcal: 800, status: "partial", zero: false, savedAt: "t4" };
  const rows = toCsv(s).trim().split("\r\n");
  assert.equal(rows.length, 5);
  const cell = (r, i) => rows[r].split(",")[i];
  assert.equal(cell(1, 3), ""); // weight-only day: calories empty
  assert.equal(cell(2, 3), "2000");
  assert.equal(cell(2, 4), "complete day");
  assert.equal(cell(3, 3), "0");
  assert.equal(cell(3, 5), "zero");
  assert.equal(cell(4, 4), "partial");
});

test("notes with commas, quotes and line breaks are quoted; formula starters are defused", () => {
  const s = base();
  s.activity["2026-10-20"] = { exerciseMin: 30, intensity: "light", note: 'a "walk", then\nrest' };
  s.activity["2026-10-21"] = { note: "=SUM(A1:A9)" };
  const csv = toCsv(s);
  assert.match(csv, /"a ""walk"", then\nrest"/);
  assert.match(csv, /'=SUM/);
});

test("rows are in date order and only days with something appear", () => {
  const s = base();
  s.weights["2026-10-25"] = { kg: 1, savedAt: "x" };
  s.weights["2026-10-20"] = { kg: 2, savedAt: "x" };
  const rows = toCsv(s).trim().split("\r\n");
  assert.equal(rows.length, 3);
  assert.ok(rows[1].startsWith("2026-10-20"));
});
