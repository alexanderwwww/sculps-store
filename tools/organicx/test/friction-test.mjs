/**
 * Friction has to fire on the real thing and stay quiet on ordinary copy.
 *
 * A false positive parks a healthy account for twenty hours and the only
 * symptom is that nothing happens — which is harder to notice, and worse,
 * than missing a block once.
 */
import { frictionIn } from "../human.mjs";
let bad = 0;
const ok = (n, g, e = "") => { console.log(`${g ? "  ok  " : "FAIL  "}${n}${e ? " — " + e : ""}`); if (!g) bad++; };

// Things that must NOT trip it — ordinary text from signed-out pages.
const innocent = {
  "tiktok signed out": "Something went wrong. Please try again later. Log in to follow creators, like videos, and view comments.",
  "instagram signed out": "Sorry, this page isn't available. The link you followed may be broken. Log in to Instagram to see photos.",
  "a video caption": "we tried to verify that it works and it did, try again later if you miss it",
  "youtube": "Sign in to like videos, comment, and subscribe. An error occurred. Please try again later.",
  "empty": "",
};
for (const [name, text] of Object.entries(innocent)) {
  const got = frictionIn(text);
  ok(`quiet on ${name}`, got === null, got ?? "");
}

// Things that MUST trip it — what the platforms actually say.
const real = {
  "Action Blocked. Try again later.": "action blocked",
  "You're Temporarily Blocked. It looks like you were misusing this feature by going too fast.": "temporarily blocked",
  "We restrict certain activity to protect our community.": "activity restricted",
  "Please verify your identity to continue.": "asked to confirm it is them",
  "We detected unusual activity on your account": "unusual-activity notice",
  "Complete the captcha to continue": "captcha",
  "Your account has been suspended": "account suspended",
  "Too many requests. Slow down.": "rate limited",
};
for (const [text, expect] of Object.entries(real)) {
  const got = frictionIn(text);
  ok(`catches "${text.slice(0, 38)}…"`, got === expect, got ?? "nothing");
}
console.log(bad ? `\n${bad} failed` : "\nall passed");
process.exit(bad ? 1 : 0);
