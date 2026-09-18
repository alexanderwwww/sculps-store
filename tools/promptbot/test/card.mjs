/** Proves the card, the in-page handover, and that Escape from code is ignored. */
import { chromium } from "playwright";
import { attachWand } from "/home/user/sculps-store/tools/promptbot/wand.mjs";

const SP = "/tmp/claude-0/-home-user-sculps-store/4b2cba19-2b7c-5b69-876f-e326d34c8f06/scratchpad/wtest";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--ignore-certificate-errors"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
await page.goto(`file://${SP}/page.html`);
const wand = await attachWand(page);

let fails = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) fails++; };

console.log("\nthe Escape shield:");
await wand.deafen(2000);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("ignores Escape sent by the code", (await wand.paused()) === false);

console.log("\nthe card:");
const pending = wand.ask("Reaper Archway — 8 shots", "8 prompts — drop the product photo below");
await page.waitForTimeout(400);
check("card is on screen", await page.evaluate(() => {
  const c = [...document.documentElement.children].find((e) => e.textContent.includes("Reaper Archway"));
  return Boolean(c) && getComputedStyle(c).display !== "none";
}));
check("Allow and Skip both there", await page.evaluate(() =>
  [...document.querySelectorAll("button")].filter((b) => ["Submit", "Skip"].includes(b.textContent)).length) === 2);

// A file put into its picker, the way dropping one does.
await page.setInputFiles('input[type=file][data-wand]', `${SP}/ref.webp`);
await page.waitForTimeout(600);
check("thumbnail appears once a picture is added", await wand.fileCount() === 1, `count ${await wand.fileCount()}`);

await page.screenshot({ path: `${SP}/card.png` });

await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Submit").click());
check("Submit resolves the question", (await pending) === "run");
check("card hides itself again", await page.evaluate(() => {
  const c = [...document.documentElement.children].find((e) => e.textContent.includes("Reaper Archway"));
  return getComputedStyle(c).display === "none";
}));

console.log("\nhanding the picture to the composer:");
const before = await page.evaluate(() => document.querySelectorAll('img[src^="blob:"]').length);
await wand.give(["#prompt-textarea"], "paste");
await page.waitForTimeout(800);
const after = await page.evaluate(() => document.querySelectorAll('img[src^="blob:"]').length);
check("paste delivers it without touching disk", after > before, `${before} then ${after}`);
check("it landed as a paste", await page.evaluate(() =>
  [...document.querySelectorAll("#shots img")].some((i) => i.dataset.how === "paste")));

console.log("\nthe stop key still works for a person:");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("a real Escape pauses it", await wand.paused());

await browser.close();
console.log(fails ? `\n${fails} FAILED\n` : "\nall passed\n");
process.exit(fails ? 1 : 0);
