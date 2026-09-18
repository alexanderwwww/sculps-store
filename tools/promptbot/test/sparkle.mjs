import { chromium } from "playwright";
import { attachWand } from "/home/user/sculps-store/tools/promptbot/wand.mjs";
const SP = "/tmp/claude-0/-home-user-sculps-store/4b2cba19-2b7c-5b69-876f-e326d34c8f06/scratchpad/wtest";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--ignore-certificate-errors"] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
await p.goto(`file://${SP}/page.html`);
const w = await attachWand(p);
const count = () => p.evaluate(() => [...document.documentElement.children]
  .filter((e) => getComputedStyle(e).backgroundImage.includes("radial-gradient")).length);
await w.point(p.locator("#prompt-textarea"));
await p.waitForTimeout(300);
console.log(`  burst on a click: ${await count()} sparkles in the air`);
await p.screenshot({ path: `${SP}/sparkle.png` });
await w.idle(true);
await p.waitForTimeout(2500);
console.log(`  while waiting:    ${await count()} sparkles in the air`);
await b.close();
