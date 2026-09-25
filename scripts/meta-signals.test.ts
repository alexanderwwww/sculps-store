/**
 * The pure half of the Meta signal layer, tested.
 *
 * Run: npx tsx --test scripts/meta-signals.test.ts
 *
 * Everything in here is a decision that decides what an ad account learns —
 * which rung fires, what a cookie says, who counts as a machine — so each one
 * is checked rather than eyeballed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSIDERED_SCROLL,
  CONSIDERED_SECONDS,
  type LadderRung,
  cleanFbclid,
  decideRung,
  isBotUserAgent,
  isValidFbc,
  isValidFbp,
  newFbc,
  newFbp,
  parseRungCookie,
  rungCookie,
  shouldSendToCapi,
} from "../app/lib/meta.signals";

const none = new Set<LadderRung>();
const engaged = new Set<LadderRung>(["Engaged"]);

test("Engaged fires once per session", () => {
  assert.equal(decideRung({ rung: "Engaged", already: none, seconds: 0, scrollMax: 0 }).send, true);
  assert.equal(decideRung({ rung: "Engaged", already: engaged, seconds: 0, scrollMax: 0 }).send, false);
});

test("Considered needs scroll, seconds and an Engaged signal", () => {
  const deep = { seconds: 40, scrollMax: 80 };
  assert.equal(decideRung({ rung: "Considered", already: none, ...deep }).send, false);
  assert.equal(decideRung({ rung: "Considered", already: engaged, ...deep }).send, true);
  // exactly on the threshold counts
  assert.equal(
    decideRung({ rung: "Considered", already: engaged, seconds: CONSIDERED_SECONDS, scrollMax: CONSIDERED_SCROLL }).send,
    true,
  );
  // one short of either does not
  assert.equal(
    decideRung({ rung: "Considered", already: engaged, seconds: CONSIDERED_SECONDS - 1, scrollMax: 100 }).send,
    false,
  );
  assert.equal(
    decideRung({ rung: "Considered", already: engaged, seconds: 999, scrollMax: CONSIDERED_SCROLL - 1 }).send,
    false,
  );
});

test("HotLead and CardStarted have no time or scroll gate", () => {
  for (const rung of ["HotLead", "CardStarted"] as const) {
    assert.equal(decideRung({ rung, already: none, seconds: 0, scrollMax: 0 }).send, true);
    assert.equal(decideRung({ rung, already: new Set([rung]), seconds: 0, scrollMax: 0 }).send, false);
  }
});

test("the ledger cookie round-trips and ignores rubbish", () => {
  const value = rungCookie(["Engaged", "Considered"], true);
  assert.match(value, /^kerberos_rungs=Engaged,Considered; Path=\/; SameSite=Lax; Max-Age=86400; Secure$/);
  const read = parseRungCookie("a=b; kerberos_rungs=Engaged,Considered,Nonsense; c=d");
  assert.deepEqual([...read].sort(), ["Considered", "Engaged"]);
  assert.equal(parseRungCookie(null).size, 0);
  assert.equal(rungCookie(["Engaged"], false).includes("Secure"), false);
});

test("_fbp is Meta's format", () => {
  const value = newFbp(1758800000000, 1234567890);
  assert.equal(value, "fb.1.1758800000000.1234567890");
  assert.equal(isValidFbp(value), true);
  assert.equal(isValidFbp(newFbp()), true);
  for (const bad of ["", "fb.1.abc.123", "fb.2.1758800000000.1", "1758800000000.1", "fb.1.1758800000000."]) {
    assert.equal(isValidFbp(bad), false, bad);
  }
});

test("_fbc is Meta's format and carries the click id unchanged", () => {
  const value = newFbc("IwAR0abc-_.XYZ", 1758800000000);
  assert.equal(value, "fb.1.1758800000000.IwAR0abc-_.XYZ");
  assert.equal(isValidFbc(value), true);
  // a click id that is not one is dropped rather than mangled into a cookie
  assert.equal(newFbc("bad id with spaces"), null);
  assert.equal(cleanFbclid("<script>"), null);
  assert.equal(cleanFbclid("  IwAR9  "), "IwAR9");
  assert.equal(isValidFbc("fb.1.1758800000000."), false);
});

test("obvious machines are dropped, real browsers are not", () => {
  const people = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0",
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Mobile Safari/537.36",
  ];
  for (const ua of people) assert.equal(isBotUserAgent(ua), false, ua);

  const machines = [
    "",
    "   ",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "facebookexternalhit/1.1",
    "curl/8.4.0",
    "python-requests/2.32.3",
    "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 AhrefsBot/7.0",
  ];
  for (const ua of machines) assert.equal(isBotUserAgent(ua as string), true, JSON.stringify(ua));
});

test("Purchase is never dropped, whatever the user agent", () => {
  assert.equal(shouldSendToCapi("Purchase", null), true);
  assert.equal(shouldSendToCapi("Purchase", "curl/8.4.0"), true);
  assert.equal(shouldSendToCapi("AddToCart", null), false);
  assert.equal(shouldSendToCapi("AddToCart", "Mozilla/5.0 (iPhone) Safari/604.1"), true);
  assert.equal(shouldSendToCapi("Engaged", "Googlebot/2.1"), false);
});
