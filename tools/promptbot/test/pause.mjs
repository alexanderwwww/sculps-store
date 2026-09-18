/**
 * Pause, continue, stop — the three buttons, and Escape.
 *
 * The thing worth testing is not that a button exists but that Escape no
 * longer ends the run: a pause has to be something the runner can wait out
 * and then carry on from.
 */
import { chromium } from "playwright";
import { attachWand } from "../wand.mjs";
let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`  ${ok ? "\x1b[32mPASS" : "\x1b[31mFAIL"}\x1b[0m  ${what}${extra ? " — " + extra : ""}`); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage();
await page.setContent("<title>t</title><main>hello</main>");
const wand = await attachWand(page);

check("starts neither paused nor stopped", !(await wand.paused()) && !(await wand.stopped()));

await wand.running();
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("escape pauses", await wand.paused());
check("escape does not stop", !(await wand.stopped()));

const label = await page.evaluate(() => [...document.querySelectorAll("button[data-wand]")].map((x) => x.textContent));
check("the panel offers Continue, Add pictures and Stop", label.includes("Continue") && label.includes("Add pictures") && label.includes("Stop"), label.join(", "));

await page.evaluate(() => [...document.querySelectorAll("button[data-wand]")].find((x) => x.textContent === "Continue").click());
await page.waitForTimeout(150);
check("continue resumes", !(await wand.paused()));

await page.evaluate(() => [...document.querySelectorAll("button[data-wand]")].find((x) => x.textContent === "Add pictures").click());
await page.waitForTimeout(150);
check("add pictures pauses and asks for the card", (await wand.paused()) && (await wand.wantsCard()));
check("and only asks once", !(await wand.wantsCard()));

await page.evaluate(() => [...document.querySelectorAll("button[data-wand]")].find((x) => x.textContent === "Stop").click());
await page.waitForTimeout(150);
check("stop stops", await wand.stopped());

await b.close();
console.log(fails ? `\n${fails} FAILED\n` : "\nall passed\n");
process.exit(fails ? 1 : 0);
