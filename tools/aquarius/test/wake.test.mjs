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

test("the extension uses the same parser (one source)", () => {
  const c = readFileSync(new URL("../ext/src/content.js", import.meta.url), "utf8");
  assert.match(c, /import \{ parseWake \} from "..\/..\/page\/wake.js"/);
  assert.match(c, /from Alex's voice\): \$\{cmd\}/);
});
