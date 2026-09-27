/**
 * The money parser, tested away from a live page.
 *
 * This is the one piece of this app where a bug is not a bad screen, it is a
 * real garment sold for the wrong number. Depop shows the viewer's own
 * currency and European pages put the decimal behind a comma, so "1.200,50"
 * and "1,200.50" are the same money written two ways — and a parser that reads
 * either as 1.20 is a shop that sells a Birkin for a pound.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

// The real file, evaluated as the page would: a window object and nothing else.
const source = readFileSync(new URL("../worker/agent/sites/depop.js", import.meta.url), "utf8");
const window = {};
new Function("window", source)(window);
const { moneyCents, agoMinutes, currency } = window.__organicNS.sites.depop.parse;

const money = [
  ["£45", 4500],
  ["$45.00", 4500],
  ["€38,50", 3850],
  ["US$ 1,200.00", 120000],
  ["£1,200", 120000],
  ["€1.200,50", 120050],
  ["1,200.50", 120050],
  ["$0.99", 99],
  ["£38.5", 3850],
  ["free", null],
  ["", null],
  [null, null],
];
for (const [input, want] of money) {
  assert.equal(moneyCents(input), want, `moneyCents(${JSON.stringify(input)})`);
}

// Three figures with no decimals is three figures, not three pounds.
assert.equal(moneyCents("£950"), 95000);
// And a thousands separator with nothing after it is still thousands.
assert.equal(moneyCents("€2.400"), 240000);

const ago = [
  ["just now", 0], ["3 minutes ago", 3], ["2h", 120], ["yesterday", 1440],
  ["4 days ago", 5760], ["2 weeks ago", 20160], ["3 months ago", 129600],
  ["", null], ["a while back", null],
];
for (const [input, want] of ago) {
  assert.equal(agoMinutes(input), want, `agoMinutes(${JSON.stringify(input)})`);
}

assert.equal(currency("£45"), "£");
assert.equal(currency("45"), null);

console.log("depop parse: ok");
