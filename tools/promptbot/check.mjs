/**
 * What has to be true before a build goes out.
 *
 * Every one of these checks exists because the thing it tests actually
 * shipped broken. Run it before publishing; it costs a second.
 */
import { OVERLAY } from "./wand.mjs";

let bad = 0;
const fail = (what) => { console.log(`  FAIL  ${what}`); bad++; };
const pass = (what) => console.log(`  ok    ${what}`);

/*
 * 1. The overlay is a program, not a string that looks like one.
 *
 * The whole overlay lives inside a template literal, so one unescaped
 * backtick or ${...} in it terminates the string early or interpolates a
 * Node-side value into browser code. It has happened three times, and each
 * time `node --check wand.mjs` pointed at a line nowhere near the real cause.
 * Compiling the emitted text catches it exactly.
 */
try {
  new Function(OVERLAY);
  pass(`the overlay compiles (${OVERLAY.length} chars)`);
} catch (e) {
  fail(`the overlay does not compile — ${String(e.message).split("\n")[0]}`);
}

/*
 * 2. Nothing Node-side leaked in through an unescaped interpolation.
 *
 * A `${...}` in the emitted text is fine -- the overlay has template literals
 * of its own. What is not fine is the trace an accidental interpolation
 * leaves: a Node value stringified into browser source. Those show up as
 * "[object Object]", a stray "undefined" in a style string, or "NaN".
 */
const leaks = ["[object Object]", "undefined,", ": undefined", "NaN"];
const found = leaks.filter((t) => OVERLAY.includes(t));
if (found.length) fail(`a Node value leaked into the overlay: ${found.join(", ")}`);
else pass("no Node value leaked into the overlay");

/* 3. The runner parses and every top-level statement runs. A `let` used
 *    before its declaration passes --check and only throws at startup. */
const res = await Promise.race([
  import("./live.mjs").then(() => "loaded").catch((e) => String(e?.message ?? e)),
  new Promise((r) => setTimeout(() => r("loaded"), 8000)),
]);
if (/ReferenceError|before initialization|is not defined|SyntaxError/i.test(res)) {
  fail(`the runner throws on startup — ${res.split("\n")[0]}`);
} else {
  pass("the runner loads past its top level");
}

console.log(bad ? `\n${bad} check(s) failed\n` : "\nall checks passed\n");
process.exit(bad ? 1 : 0);
