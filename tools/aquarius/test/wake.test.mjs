import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWake } from "../page/wake.js";

test("wake word: only the words after Aquarius count", () => {
  assert.deepEqual(parseWake("aquarius post the clip"), { woke: true, command: "post the clip" });
  assert.deepEqual(parseWake("Hey Aquarius, list the bag"), { woke: true, command: "list the bag" });
  assert.deepEqual(parseWake("random talk"), { woke: false, command: "" });
  assert.deepEqual(parseWake("AQUARIUS. Check the orders."), { woke: true, command: "Check the orders" });
  assert.deepEqual(parseWake("Aquarius"), { woke: true, command: "" });
  assert.deepEqual(parseWake("aquarius do x and then aquarius do y"), { woke: true, command: "do y" });
  assert.deepEqual(parseWake("aquariusly speaking"), { woke: false, command: "" });
  assert.deepEqual(parseWake(""), { woke: false, command: "" });
});

test("the Swift shell carries the same parser", () => {
  const swift = readFileSync(new URL("../app/Aquarius.app/Contents/Resources/Shell/main.swift", import.meta.url), "utf8");
  assert.match(swift, /func parseWake\(_ transcript: String\) -> \(woke: Bool, command: String\)/);
  assert.match(swift, /\\\\baquarius\\\\b/, "same word-boundary pattern");
  assert.match(swift, /\.caseInsensitive/);
  assert.match(swift, /requiresOnDeviceRecognition = true/);
});
