/**
 * The ways it used to die quietly.
 *
 * Every check here is something that actually happened on Alex's Mac: a tab
 * closed, a second tab opened, a page that tore the overlay out. None of them
 * should end a run, and none of them should leave it sitting there looking
 * finished when it isn't.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { attachWand } from "../wand.mjs";

let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`  ${ok ? "\x1b[32mPASS" : "\x1b[31mFAIL"}\x1b[0m  ${what}${extra ? " — " + extra : ""}`); };

const host = createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><title>fake</title><div id="prompt-textarea" contenteditable="true"></div>`);
}).listen(0);
const url = `http://localhost:${host.address().port}/`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext();

let page = await ctx.newPage();
await page.goto(url);
let wand = await attachWand(page);
check("the overlay mounts", wand.mounted);

console.log("\na tab that gets closed:");
const second = await ctx.newPage();
await second.goto(url);
await page.close();
check("the old page knows it is closed", page.isClosed());
// what ensurePage does
const alive = ctx.pages().filter((p) => !p.isClosed() && p.url().startsWith(url));
check("another tab on the same site is found", alive.length === 1);
page = alive[alive.length - 1];
wand = await attachWand(page);
check("and the overlay follows it there", wand.mounted && (await wand.present()));

console.log("\nasking on the tab it moved to:");
await wand.ask("job", "sub");
check("the card is asking", await wand.asking());
check("no answer until something is pressed", (await wand.answer()) === null);
check("an order from Claude answers it", (await wand.order("go")) && (await wand.answer()) === "run");

console.log("\nnothing here throws on a dead page:");
const dead = await ctx.newPage();
await dead.goto(url);
const deadWand = await attachWand(dead);
await dead.close();
check("stopped() survives", (await deadWand.stopped()) === false);
check("paused() survives", (await deadWand.paused()) === false);
check("order() survives", (await deadWand.order("pause")) === false);
check("say() survives", (await deadWand.say("a", "b")) === undefined);

await b.close(); host.close();
console.log(fails ? `\n${fails} FAILED\n` : "\nall passed\n");
process.exit(fails ? 1 : 0);
