/**
 * The check that would have caught it.
 *
 * A job in parts crashed the whole run on the first part, inside node's own
 * mkdir, because a call site passed one argument to a function that takes two.
 * Nothing in the app is testable without a browser — but the shape of the run
 * is: which prompt belongs to which part, which prompts open a part, which
 * pictures each one attaches, and what the brief is glued onto.
 *
 * So the planning is pulled out here and checked on its own, and every call
 * into the file is checked for the right number of arguments. Run with:
 *   node test/job-shape.mjs
 */
import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";

const src = await readFile(new URL("../live.mjs", import.meta.url), "utf8");
const overlay = await readFile(new URL("../wand.mjs", import.meta.url), "utf8");

/* 1. Every call matches the declaration it calls.
 *
 * Scanned properly rather than with a regular expression: a call is read from
 * its opening bracket to its matching close, skipping strings, templates and
 * nested brackets, so a comma inside a message is not mistaken for another
 * argument. That mistake is what this test exists to catch in the first place.
 */
const declared = new Map();
for (const m of src.matchAll(/^(?:async )?function (\w+)\(([^)]*)\)/gm)) {
  const args = m[2].split(",").map((a) => a.trim()).filter(Boolean);
  declared.set(m[1], {
    min: args.filter((a) => !a.includes("=") && !a.startsWith("...")).length,
    max: args.some((a) => a.startsWith("...")) ? Infinity : args.length,
  });
}

/** Count the arguments in the call whose "(" is at `open`. */
function countArgs(text, open) {
  let depth = 0;
  let quote = null;
  let args = 0;
  let seen = false;
  // A comma with nothing after it is a trailing comma, not another argument.
  let trailing = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      else if (quote === "`" && ch === "$" && text[i + 1] === "{") {
        // A template's ${...} is code again; walk it with its own depth.
        let d = 1;
        i += 2;
        while (i < text.length && d > 0) {
          if (text[i] === "{") d++;
          else if (text[i] === "}") d--;
          i++;
        }
        i--;
      }
      continue;
    }
    // A comma inside a comment is prose, not an argument.
    if (ch === "/" && text[i + 1] === "/") {
      i = text.indexOf("\n", i);
      if (i < 0) return -1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i);
      if (i < 0) return -1;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      // A string is an argument. Without this the scanner read say("a", "b")
      // as a call with nothing in it.
      if (depth === 1) { seen = true; trailing = false; }
      quote = ch;
      continue;
    }
    if ("([{".includes(ch)) { depth++; continue; }
    if (")]}".includes(ch)) {
      depth--;
      if (depth === 0) return seen ? args + 1 - (trailing ? 1 : 0) : 0;
      continue;
    }
    if (depth === 1 && ch === ",") { args++; trailing = true; continue; }
    if (depth === 1 && !/\s/.test(ch)) { seen = true; trailing = false; }
  }
  return -1;
}

const skip = new Set(["log", "wait", "report", "obey", "safe", "list", "obj"]);
let checked = 0;
for (const [name, want] of declared) {
  if (skip.has(name)) continue;
  const finder = new RegExp(`(?<![\\w.])${name}\\s*\\(`, "g");
  for (const hit of src.matchAll(finder)) {
    const before = src.slice(Math.max(0, hit.index - 30), hit.index);
    if (/function\s+$/.test(before)) continue;
    const n = countArgs(src, hit.index + hit[0].length - 1);
    if (n < 0) continue;
    checked++;
    assert.ok(
      n >= want.min && n <= want.max,
      `${name}() called with ${n} argument${n === 1 ? "" : "s"}, takes ${want.min}${want.max === Infinity ? "+" : `-${want.max}`} — line ${src.slice(0, hit.index).split("\n").length}`,
    );
  }
}

/* 2. The shape of a job in parts. */
const plan = (job) => {
  const parts = Array.isArray(job.parts) && job.parts.length
    ? job.parts
    : [{ name: "", refs: job.refs ?? [], prompts: job.prompts ?? [] }];
  const belongs = parts.flatMap((p, i) => p.prompts.map(() => i));
  const opens = parts.flatMap((p) => p.prompts.map((_, i) => i === 0));
  const flat = parts.flatMap((p) => p.prompts);
  return { parts, belongs, opens, flat };
};

const four = plan({
  parts: [
    { name: "Zombie", refs: ["a.webp"], prompts: ["z1", "z2", "z3"] },
    { name: "Scream", refs: ["b.webp"], prompts: ["s1", "s2", "s3"] },
  ],
});
assert.equal(four.flat.length, 6, "six prompts across two parts");
assert.deepEqual(four.belongs, [0, 0, 0, 1, 1, 1], "each prompt knows its part");
assert.deepEqual(four.opens, [true, false, false, true, false, false], "only the first prompt of a part opens it");
assert.equal(four.parts[four.belongs[3]].refs[0], "b.webp", "part two attaches part two's picture");

const flatJob = plan({ refs: ["only.webp"], prompts: ["one", "two"] });
assert.equal(flatJob.parts.length, 1, "a job with no parts is one part");
assert.deepEqual(flatJob.opens, [true, false], "and still opens once");

console.log(`ok — ${checked} call sites, job shape sound`);

/* 3. The rules the app must never break again, checked in the source itself.
 *
 * These are not style preferences. Each one is a thing that reached the owner's
 * live shop or killed a run, and the comment beside it says which.
 */
const must = [
  // A photograph of a browser window went onto a product page twice.
  [/\.screenshot\(/.test(src) === false, "no screenshot fallback may exist in live.mjs"],
  // A 200 that is not an image was written to disk as a PNG and uploaded.
  [src.includes('type.startsWith("image/")'), "downloads are checked for an image content-type"],
  // Chrome closing ended a run out of ensurePage.
  [src.includes("async function reconnect("), "there is a reconnect() the whole file can use"],
  [/page = await context\.newPage\(\)\.catch/.test(src), "opening a tab cannot throw out of ensurePage"],
  // An empty prompt was consumed and the run walked on.
  [src.includes("nothing came back — running that one again"), "an empty prompt is retried"],
  // The brief and the references have to reach every part.
  [src.includes("opensPart[i] && job.brief"), "the brief is prefixed to the first prompt of a part"],
  // The overlay covered Gemini's own Download button, which is the one path
  // that gets a real file — the app was blocking the control it needed.
  [(overlay.match(/pointerEvents: "none"/g) ?? []).length >= 4, "the card and the finished panel do not take the page's clicks"],
  [overlay.includes('pointerEvents: "auto"'), "the parts that take input opt back in"],
  // "Could not ask" was answered as "not paused", which lost the pause.
  [overlay.includes("window.__wand.paused() : null"), "an unreachable overlay reports null, not false"],
  // addInitScript cannot be removed; it was registered every 400ms.
  [overlay.includes("registered.has(page)"), "the overlay script is registered once per page"],
  // A fresh mount mid-job read "Ready / Waiting." with no buttons.
  [overlay.includes("if (s.running)"), "a restored panel comes back running, with its caption"],
];
for (const [ok, what] of must) assert.ok(ok, `broken rule: ${what}`);

console.log(`ok — ${must.length} standing rules hold`);
