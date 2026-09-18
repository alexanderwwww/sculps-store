/**
 * Exercises the real attach code against a stand-in composer, so the three
 * paths are proven before anybody restarts their machine for it.
 */
import { chromium } from "playwright";
import { attachWand } from "/home/user/sculps-store/tools/promptbot/wand.mjs";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const SP = "/tmp/claude-0/-home-user-sculps-store/4b2cba19-2b7c-5b69-876f-e326d34c8f06/scratchpad/wtest";
const live = await readFile("/home/user/sculps-store/tools/promptbot/live.mjs", "utf8");
const fileSel = live.match(/file: \[(.+?)\]/)[1].replace(/['"]/g, "");
const site = { ask: ["#prompt-textarea"], file: [fileSel] };
console.log(`(composer file input selector under test: ${fileSel})`);
const REF = [`${SP}/ref.webp`];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--ignore-certificate-errors"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto(`file://${SP}/page.html`);

const wand = await attachWand(page);

// The functions under test, lifted verbatim out of live.mjs.
const src = await readFile("/home/user/sculps-store/tools/promptbot/live.mjs", "utf8");
const grab = (name) => {
  const i = src.indexOf(`async function ${name}(`);
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") { depth++; started = true; }
    else if (src[j] === "}") { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
};
const mod = `
import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";
export function init(s, f) { site = s; find = f; }
let site, find;
export ${grab("putFiles")}
export ${grab("blobCount")}
`;
await (await import("node:fs/promises")).writeFile(`${SP}/under-test.mjs`, mod);
const { init, putFiles } = await import(`${SP}/under-test.mjs`);

const find = async (page, list) => {
  for (const s of list) {
    const el = page.locator(s).first();
    if (await el.count().then((n) => n > 0)) return el;
  }
  return null;
};
init(site, find);

let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fails++;
};

console.log("\nattach, all three routes:");

// 1 — the file dialog
const how1 = await putFiles(page, REF, wand, "test");
check("file dialog (the + button)", how1 === "chosen", `returned ${how1}`);
await page.reload();
await wand.reattach();

// 2 — paste, with the + button removed so it has to fall through
await page.evaluate(() => document.getElementById("plus").remove());
const how2 = await putFiles(page, REF, wand, "test");
check("paste", how2 === "pasted", `returned ${how2}`);
await page.reload();
await wand.reattach();

// 3 — drop, with the + gone and paste refused
await page.evaluate(() => {
  document.getElementById("plus").remove();
  const box = document.getElementById("prompt-textarea");
  box.replaceWith(box.cloneNode(true));   // drops the paste listener
});
const how3 = await putFiles(page, REF, wand, "test");
check("drop", how3 === "dropped", `returned ${how3}`);

// 4 — nothing available at all, must report failure rather than claim success
await page.reload();
await wand.reattach();
await page.evaluate(() => {
  document.getElementById("plus").remove();
  document.querySelector('input[type=file]').remove();
  const box = document.getElementById("prompt-textarea");
  box.replaceWith(box.cloneNode(true));
  document.addEventListener("drop", (e) => e.stopImmediatePropagation(), true);
});
const how4 = await putFiles(page, REF, wand, "test");
check("reports failure when nothing works", how4 === null, `returned ${how4}`);

console.log("\noverlay:");
check("wand mounted", wand.mounted);
check("cursor drawn", await page.evaluate(() => {
  // It has no id — it's found the way a person finds it, by being the wand.
  return [...document.documentElement.children].some(
    (el) => el.textContent === "\u{1FA84}" && getComputedStyle(el).position === "fixed",
  );
}));
check("panel drawn", await page.evaluate(() => Boolean(document.querySelector("div[style*='2147483647']"))));
await wand.idle(true);
await page.waitForTimeout(2000);
let sparks = 0;
for (let i = 0; i < 10 && !sparks; i++) {
  await page.waitForTimeout(400);
  sparks = await page.evaluate(() =>
    [...document.documentElement.children].filter(
      (el) => getComputedStyle(el).backgroundImage.includes("radial-gradient"),
    ).length,
  );
}
check("sparkles while idle", sparks > 0, `${sparks} on screen`);

const p1 = await page.evaluate(() => {
  const w = [...document.documentElement.children].find((el) => el.textContent === "\u{1FA84}");
  return w.style.transform;
});
await page.waitForTimeout(1400);
const p2 = await page.evaluate(() => {
  const w = [...document.documentElement.children].find((el) => el.textContent === "\u{1FA84}");
  return w.style.transform;
});
check("wand moves while idle", p1 !== p2, `${p1} then ${p2}`);
await wand.idle(false);
check("escape stops it", await (async () => { await page.keyboard.press("Escape"); return wand.stopped(); })());

await page.screenshot({ path: `${SP}/proof.png` });
await browser.close();
console.log(fails ? `\n${fails} FAILED\n` : "\nall passed\n");
process.exit(fails ? 1 : 0);
