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
  assert.match(c, /import \{ parseWake(, decide)? \} from "..\/..\/page\/wake.js"/);
  assert.match(c, /from Alex's voice\): \$\{d\.cmd\}/);
});

// build 3: conversation mode
{
  const { decide } = await import("../page/wake.js");
  const T = 1_000_000, M = 120000;
  let d = decide("random talk", 0, T, M);
  console.assert(d.act === "ignore", "no name, no conversation: ignored");
  d = decide("Aquarius post the clip", 0, T, M);
  console.assert(d.act === "send" && d.cmd === "post the clip" && d.convoUntil === T + M, "name opens the conversation");
  let d2 = decide("and also list the bag", d.convoUntil, T + 30000, M);
  console.assert(d2.act === "send" && d2.cmd === "and also list the bag", "inside the window: no name needed");
  console.assert(decide("later words", d.convoUntil, T + M + 1, M).act === "ignore", "window closed: ignored again");
  console.assert(decide("that's all", d.convoUntil, T + 1000, M).act === "end", "that's all ends it");
  console.assert(decide("hey aquarium do it", 0, T, M).cmd === "do it", "Chrome's mishearing 'aquarium' still wakes him");
  if (!(d.act === "send" && d2.act === "send")) process.exit(1);
  console.log("  ok  conversation mode (no name needed for 2 min after he is called)");
}
