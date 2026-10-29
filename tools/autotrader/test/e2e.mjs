// The real page in a real browser, clicked the way Alex clicks it: the terminal, the Phantom box, a live run on a fake chain.
// No real wallet and no real money: the key is generated here and the chain + Jupiter are fakes (test/fakechain.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { start } from "../src/server.mjs";
import { b58encode } from "../src/lib/solana.mjs";
import { fakeFeed, moon, up, base } from "./fakefeed.mjs";
import { world } from "./fakechain.mjs";

const require = createRequire(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..", "package.json"));
let pw; try { pw = require("playwright"); } catch { pw = require("playwright-core"); }
const ok = (m) => console.log("  ok  " + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-e2e-"));
const { feed, state } = fakeFeed();
const ch = world(null, {}); ch.W.zero = false;
const j = crypto.generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
const pub = Buffer.from(j.x, "base64url");
const SECRET = b58encode(Buffer.concat([Buffer.from(j.d, "base64url"), pub])), ADDRESS = b58encode(pub);   // the way Phantom exports a key
const app = start({ dataDir: dir, port: 0, feed, now: () => state.now, quiet: true, tickMs: 100, execOverride: null, rpc: ch.rpc, jupiter: ch.jupiter, rug: async () => ({ pass: true, reason: "ok" }) });
const port = await app.listening;
const browser = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && !/400 \(Bad Request\)/.test(m.text()) && errors.push(m.text()));
const text = async () => (await page.textContent("body")).replace(/\s+/g, " ");
const noGmgn = async (when) => { const html = await page.content(); assert.doesNotMatch(html, /gmgn/i, `GMGN on screen ${when}`); };
try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("#termhost:not([hidden]) .agent");
  assert.doesNotMatch(await text(), /Advanced|Press start|Setup|API key|whitelist|signing key/i); ok("no setup menu: it opens straight on the terminal");
  await noGmgn("before the wallet"); ok("no GMGN anywhere on screen");
  const b = page.getByRole("button", { name: "Plug in my wallet and trade", exact: true });
  assert.equal(await b.count(), 1); assert.equal(await page.locator(".plug input").count(), 1);
  assert.equal(await page.locator(".tm__go button").count(), 1, "the Phantom button is the only control");
  assert.match(await page.textContent(".tm__state"), /plug in your wallet/i); ok("no wallet yet: the Phantom box is the one thing to do");
  const hit = await b.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t === el || el.contains(t); });
  assert.ok(hit); ok("the Phantom button is reachable by the mouse");
  await page.fill(".plug input", "not a key"); await b.click();
  await page.waitForFunction(() => /not a private key/i.test(document.body.textContent), null, { timeout: 8000 }); ok("a wrong paste says so, in Phantom's words");
  assert.equal(ch.W.sent.length, 0, "nothing went to the chain on a wrong paste");
  await page.fill(".plug input", SECRET);
  await page.getByRole("button", { name: "Plug in my wallet and trade", exact: true }).click();
  await page.waitForFunction(() => /live/i.test(document.querySelector("header .chip")?.textContent || ""), null, { timeout: 15000 });
  assert.match(await page.textContent("header .chip"), /live/i); ok("pasting the key starts trading by itself: the header goes live");
  assert.ok(!(await page.content()).includes(SECRET), "the key is never on screen"); ok("the key is not on screen after plugging in");
  assert.match(await text(), /Scanner/); assert.match(await text(), /Rug check/); assert.match(await text(), /Executor/);
  await page.waitForFunction((a) => document.querySelector(".tm__tape")?.textContent.includes(a.slice(0, 4)), ADDRESS, { timeout: 8000 });
  assert.match(await page.textContent(".tm__tape"), /Phantom.*Jupiter/); ok("the tape names the Phantom wallet and Jupiter");
  await page.waitForFunction(() => /ALPHA/.test((document.querySelector(".lg__rows")?.textContent || "") + (document.querySelector(".tl__body")?.textContent || "")), null, { timeout: 15000 });
  ok("a signal shows up in the log with its coin name");
  assert.equal(await page.locator(".agent").count(), 7); assert.equal(await page.locator("#termhost").isVisible(), true); assert.equal(await page.locator(".tm__node").count(), 2); ok("the terminal is on screen: seven agents, rug check and executor nodes, live flow");
  for (const t = Date.now(); !ch.W.sent.length && Date.now() - t < 10000;) await page.waitForTimeout(100);
  assert.ok(ch.W.sent.length >= 1 && ch.W.quotes[0].amount === "16180000", "the buy went out as a signed 0.618 x 0.02618 SOL swap (cold organism)"); ok("the buy went out as a signed 0.01618 SOL Jupiter swap (cold organism: 0.618 of 0.02618, never above it)");
  if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, "1.png"), fullPage: true });
  state.byPool = { X1: base, X3: up };
  state.pools = [...state.pools, { pool: "X1", name: "DULLCOIN", mint: "D".repeat(40) + "pump", created: 1_800_000_000_000, liqUsd: 1500, vol5: 99 }, { pool: "X3", name: "MOONBOY", mint: "M".repeat(40) + "pump", created: 1_800_000_000_000, liqUsd: 9000, vol5: 98 }];
  await page.waitForSelector(".chip2", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll(".chip2").length >= 2, null, { timeout: 15000 });
  if (process.env.SHOTS) { await page.waitForTimeout(700); await page.screenshot({ path: path.join(process.env.SHOTS, "2.png"), fullPage: true }); }
  ok("new coins show up as chips and run through the flow");
  state.series = moon; state.px.P1 = 2.6;
  await page.waitForFunction(() => /take profit/.test(document.body.textContent), null, { timeout: 12000 });
  assert.match(await text(), /exit/i); ok("the exit shows up with its reason: take profit");
  if (process.env.SHOTS) { await page.waitForTimeout(1200); await page.screenshot({ path: path.join(process.env.SHOTS, "3.png"), fullPage: true }); }
  for (const sel of ["header .chip", ".agent", ".curve", ".row"]) assert.ok(await page.$(sel), sel);
  await noGmgn("while trading"); ok("still no GMGN anywhere while trading");
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  assert.equal(over, false); ok("no sideways scroll at 1180 px");
  await page.setViewportSize({ width: 420, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false); ok("no sideways scroll at phone width either");
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.getByRole("button", { name: "Pause buying" }).click();
  await page.waitForFunction(() => /buying paused/i.test(document.body.textContent));
  await page.getByRole("button", { name: "Resume buying" }).click();
  await page.waitForFunction(() => !/buying paused/i.test(document.querySelector("header").textContent)); ok("pause and resume work from the screen");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.waitForFunction(() => /stopped/i.test(document.querySelector("header").textContent)); ok("stop works and the header says stopped");
  await page.waitForFunction(() => /stopped/i.test(document.querySelector(".tm__state")?.textContent || "")); ok("the terminal says stopped, not plug in your wallet");
  assert.deepEqual(errors, [], "no console errors"); ok("no errors in the browser console");
  console.log("\nUI checks passed");
} catch (e) { console.log("FAIL  " + (e.message || e)); console.log((await text().catch(() => "")).slice(0, 600)); await page.screenshot({ path: path.join(dir, "fail.png") }).catch(() => {}); console.log("screenshot", path.join(dir, "fail.png")); await browser.close(); await app.close(); process.exit(1); }
await browser.close(); await app.close(); process.exit(0);
