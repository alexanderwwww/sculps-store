/**
 * Proves a generated picture actually reaches the disk, including from a page
 * whose policy forbids fetching it — the exact case that lost eight of them.
 */
import { chromium } from "playwright";
import { attachWand } from "/home/user/sculps-store/tools/promptbot/wand.mjs";
import { mkdir, readdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import http from "node:http";

const SP = "/tmp/claude-0/-home-user-sculps-store/4b2cba19-2b7c-5b69-876f-e326d34c8f06/scratchpad/wtest";
const OUT = join(SP, "saved");
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// A host serving one picture, and a page that is forbidden from fetching it.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAO0lEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgH8DKVAAAdW0yXcAAAAASUVORK5CYII=",
  "base64",
);
const cdn = http.createServer((_, res) => {
  res.writeHead(200, { "content-type": "image/png", "access-control-allow-origin": "*" });
  res.end(png);
});
await new Promise((r) => cdn.listen(8732, r));

const host = http.createServer((req, res) => {
  res.writeHead(200, {
    "content-type": "text/html",
    // The policy that caused the loss: script may not reach the image host.
    "content-security-policy": "default-src 'self' 'unsafe-inline'; img-src *; connect-src 'self'",
  });
  res.end(`<!doctype html><body style="background:#111"><img id="generated" src="http://localhost:8732/shot.png" width="100" height="100"></body>`);
});
await new Promise((r) => host.listen(8731, r));

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--ignore-certificate-errors"],
});
const context = await browser.newContext();
const page = await context.newPage();
await page.goto("http://localhost:8731/");
const wand = await attachWand(page);

let fails = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) fails++; };

console.log("\nsaving:");
// Confirm the page really can't do it, so the test is testing the real thing.
const pageFetch = await page.evaluate(() =>
  fetch("http://localhost:8732/shot.png").then(() => "allowed").catch(() => "blocked"));
check("the page is genuinely blocked from fetching it", pageFetch === "blocked", pageFetch);

// The route that ships.
const buf = await context.request
  .get("http://localhost:8732/shot.png", { headers: { referer: page.url() } })
  .then((r) => (r.ok() ? r.body() : null))
  .catch(() => null);
check("the browser context can fetch it anyway", Boolean(buf), buf ? `${buf.length} bytes` : "nothing");
if (buf) await writeFile(join(OUT, "01-01.png"), buf);

// And the last resort.
const shot = await page.locator("#generated").screenshot().catch(() => null);
check("photographing it also works", Boolean(shot), shot ? `${shot.length} bytes` : "nothing");

const files = await readdir(OUT);
check("a file is on disk", files.length > 0, files.join(", "));

console.log("\nthe finished panel:");
await wand.done("5 pictures saved", "~/Downloads/Magic Wand/reaper");
await page.waitForTimeout(300);
check("panel is on screen", await page.evaluate(() =>
  [...document.documentElement.children].some(
    (e) => e.textContent.includes("5 pictures saved") && getComputedStyle(e).display !== "none")));
check("Open the folder is there", await page.evaluate(() =>
  [...document.querySelectorAll("button")].some((b) => b.textContent === "Open the folder")));
await page.screenshot({ path: join(SP, "done.png") });
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Open the folder").click());
check("clicking it is reported back", await wand.wantsFolder());
check("and only reported once", (await wand.wantsFolder()) === false);

await browser.close();
host.close(); cdn.close();
console.log(fails ? `\n${fails} FAILED\n` : "\nall passed\n");
process.exit(fails ? 1 : 0);
