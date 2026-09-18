/**
 * The whole path a job takes, against a fake chat site.
 *
 * This is the test that would have caught what shipped: a card thrown out of
 * the page by a re-render, a send button that does nothing, and a pause
 * pressed while the run is waiting for pictures.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { attachWand } from "../wand.mjs";

let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`  ${ok ? "\x1b[32mPASS" : "\x1b[31mFAIL"}\x1b[0m  ${what}${extra ? " — " + extra : ""}`); };

const host = createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><title>fake</title>
    <div id="prompt-textarea" contenteditable="true"></div>
    <button data-testid="send-button">Send</button>
    <div id="out"></div>
    <script>
      document.querySelector('[data-testid=send-button]').onclick = () => {
        const b = document.getElementById('prompt-textarea');
        if (!b.textContent.trim()) return;
        b.textContent = '';
        document.getElementById('out').textContent = 'sent';
      };
    </script>`);
}).listen(0);
const url = `http://localhost:${host.address().port}/`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage();
await page.goto(url);
const wand = await attachWand(page);

console.log("\nthe card survives a re-render:");
await wand.ask("job", "sub");
check("asking", await wand.asking());
// What a single-page app actually does: drop the top-level nodes it doesn't
// recognise. The overlay lives there, so this is the case that broke it.
await page.evaluate(() => {
  [...document.documentElement.children].forEach((el) => {
    if (el.tagName !== "HEAD" && el.tagName !== "BODY") el.remove();
  });
});
await page.waitForTimeout(150);
check("a card ripped out of the page no longer claims to be asking", (await wand.asking()) === false);
await wand.ask("job", "sub");
check("and showing it again puts it back", await wand.asking());
await page.evaluate(() => [...document.querySelectorAll("button[data-wand]")].find((x) => x.textContent === "Submit").click());
check("Submit is heard", (await wand.answer()) === "run");

console.log("\nsending, and knowing whether it went:");
const box = page.locator("#prompt-textarea");
await box.click();
await page.keyboard.insertText("draw me a reaper");
check("the prompt is in the box", (await box.textContent()).length > 8);
await page.locator('[data-testid="send-button"]').click();
await page.waitForTimeout(300);
check("the box empties when it sends", (await box.textContent()).trim() === "");
check("and the site got it", (await page.locator("#out").textContent()) === "sent");

console.log("\npause reaches the run:");
await wand.running();
await wand.order("pause");
check("paused", await wand.paused());
await wand.order("continue");
check("continue releases it", (await wand.paused()) === false);

await b.close(); host.close();
console.log(fails ? `\n${fails} FAILED\n` : "\nall passed\n");
process.exit(fails ? 1 : 0);
