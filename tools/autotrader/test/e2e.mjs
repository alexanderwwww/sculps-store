// The real page in a real browser, clicked the way Alex clicks it: setup, paper, controls.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { start } from "../src/server.mjs";
import { fakeFeed, moon } from "./fakefeed.mjs";
import { world } from "./fakechain.mjs";

const require = createRequire(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..", "package.json"));
let pw; try { pw = require("playwright"); } catch { pw = require("playwright-core"); }
const ok = (m) => console.log("  ok  " + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-e2e-"));
const { feed, state } = fakeFeed();
const ch = world(null); ch.W.zero = false; ch.W.sol = 0;
const app = start({ dataDir: dir, port: 0, feed, now: () => state.now, quiet: true, tickMs: 100, rug: async () => ({ pass: true, reason: "ok" }), paperQuote: async () => ({ ok: true, impact: 0.01 }), balance: async () => ch.W.sol, ipv4: async () => "203.0.113.7", rpc: ch.rpc, jupiter: ch.jupiter });
const port = await app.listening;
const browser = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && !/400 \(Bad Request\)/.test(m.text()) && errors.push(m.text()));   // the one deliberate bad save above
const reachable = async (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && (t === el || el.contains(t)); }, sel);
const text = async () => (await page.textContent("body")).replace(/\s+/g, " ");
try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector(".steps");
  assert.match(await text(), /Send SOL to Ultra/); ok("a fresh install opens on ONE thing to do: send SOL to Ultra's own wallet");
  const addr = await page.textContent(".addr");
  assert.match(addr, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/); ok("Ultra's wallet address is on screen, ready to copy");
  assert.equal(await page.getByRole("button", { name: "Start real trading" }).isDisabled(), true); ok("Start real trading is disabled until the wallet is funded");
  assert.doesNotMatch(await text(), /PRIVATE|Make my signing key/); ok("no keys, no API, no whitelist on the main screen");
  ch.W.sol = 0.11;
  await page.waitForFunction(() => /0\.1100 SOL in Ultra/.test(document.body.textContent), null, { timeout: 8000 });
  assert.equal(await page.getByRole("button", { name: "Start real trading" }).isDisabled(), false); ok("funding it is noticed on its own and Start unlocks");
  await page.getByRole("button", { name: "Back up this wallet" }).scrollIntoViewIfNeeded();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Back up this wallet" }).click();
  await page.waitForSelector("textarea");
  assert.ok((await page.inputValue("textarea")).length > 60); ok("the backup button shows the secret key only after a confirmation");
  for (const name of ["Copy address", "Start real trading", "Watch it first (paper)", "Send everything back"]) { const b = page.getByRole("button", { name, exact: true }); await b.first().scrollIntoViewIfNeeded(); const hit = await b.first().evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t === el || el.contains(t); }); assert.ok(hit, `${name} is covered by something else`); }
  ok("the buttons are reachable by the mouse");
  await page.getByRole("button", { name: "Start real trading" }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Start real trading" }).click();
  await page.waitForSelector(".pipe");
  assert.match(await text(), /Scanner/); assert.match(await text(), /Rug check/); assert.match(await text(), /Shadow/); assert.match(await page.textContent("header .chip"), /live/i); ok("one press: the live dashboard with the whole pipeline");
  await page.waitForFunction(() => /ALPHA/.test(document.body.textContent), null, { timeout: 12000 });
  ok("a signal shows up in the night log with its name");
  ch.W.lastKind = "sell"; state.series = moon;
  await page.waitForFunction(() => /take profit/.test(document.body.textContent), null, { timeout: 12000 });
  assert.match(await text(), /exit/); ok("the exit shows up with its reason");
  for (const sel of ["header .chip", ".agent", ".curve", ".row"]) assert.ok(await page.$(sel), sel);
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
  assert.deepEqual(errors, [], "no console errors"); ok("no errors in the browser console");
  fs.mkdirSync(path.join(path.dirname(new URL(import.meta.url).pathname), "shots"), { recursive: true });
  console.log("\nUI checks passed");
} catch (e) { console.log("FAIL  " + (e.message || e)); console.log((await text().catch(() => "")).slice(0, 600)); await page.screenshot({ path: path.join(dir, "fail.png") }).catch(() => {}); console.log("screenshot", path.join(dir, "fail.png")); await browser.close(); await app.close(); process.exit(1); }
await browser.close(); await app.close(); process.exit(0);
