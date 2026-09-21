/**
 * The guard has to be structural, not a convention.
 *
 * The failure it prevents is silent: research done from a logged-in context
 * works perfectly and costs an account three weeks later. So the check is
 * tested, not trusted.
 */
import { chromium } from "playwright";
import { anonymous, adLibrary, hashtag, runningDays, proven } from "../research.mjs";

let bad = 0;
const ok = (n, good, extra = "") => {
  console.log(`${good ? "  ok  " : "FAIL  "}${n}${extra ? " — " + extra : ""}`);
  if (!good) bad++;
};

const browser = await chromium.launch({
  executablePath: process.env.OX_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

// A context that was not made by anonymous() is refused, whatever it holds.
const loggedIn = await browser.newContext();
for (const [name, call] of [
  ["adLibrary", () => adLibrary(loggedIn, { query: "halloween projector" })],
  ["hashtag", () => hashtag(loggedIn, "tiktok", "halloweendecor")],
]) {
  let threw = null;
  await call().catch((e) => (threw = e.message));
  ok(`${name} refuses a signed-in context`, /signed-out context/.test(threw ?? ""), threw ?? "it did not throw");
}

const anon = await anonymous(browser);
ok("anonymous() is marked", anon.__anonymous === true);
ok("anonymous() carries no cookies", (await anon.cookies()).length === 0);

// The number that decides whether an ad is worth reading.
const now = new Date("2026-09-21");
ok("running days counts from the start date", runningDays("Aug 1, 2026", now) === 51, String(runningDays("Aug 1, 2026", now)));
ok("a six-week ad is proven", proven({ started: "Aug 1, 2026" }, now) === true);
ok("a four-day ad is not", proven({ started: "Sep 17, 2026" }, now) === false);
ok("an ad with no date is not", proven({ started: null }, now) === false);

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall passed");
process.exit(bad ? 1 : 0);
