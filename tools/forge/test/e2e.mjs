// Drives the real page in a real browser against the real server: the loop
// he will use every day. Run by pack.sh; a build that fails this does not ship.
import { createRequire } from "node:module";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { start } from "../src/server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "..", "..", "..", "package.json"));
let pw;
try { pw = require("playwright"); } catch { pw = require("playwright-core"); }
const exe = process.env.PW_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

const dir = mkdtempSync(join(tmpdir(), "forge-e2e-"));
const clock = { now: new Date("2026-11-20T09:00:00Z") };
const srv = await start({ dataDir: dir, port: 0, clock: () => clock.now, zone: "Europe/Athens", quiet: true, build: "e2e" });
const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
const errors = [];
let n = 0;
const step = async (name, fn) => { await fn(); n++; console.log("  ok  " + name); };
const url = `http://127.0.0.1:${srv.port}/`;

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url);
  await page.waitForSelector("#f-kg");

  await step("a fresh start asks for a weight and assumes nothing", async () => {
    assert.equal(await page.inputValue("#f-kg"), "");
    assert.match(await page.textContent("#formCard"), /First|first weight|Welcome/i);
    assert.deepEqual(Object.keys(srv.publicState().weights), []);
  });

  await step("saving an empty form saves nothing and says so", async () => {
    await page.click("#save");
    await page.waitForSelector(".status.warn");
    assert.deepEqual(Object.keys(srv.publicState().weights), []);
  });

  await step("a comma decimal weight and calories save, and the results appear at once", async () => {
    await page.fill("#f-kg", "106,75");
    await page.fill("#f-kcal", "2150");
    await page.click("#save");
    await page.waitForSelector(".status.ok");
    const st = srv.publicState();
    assert.equal(st.weights["2026-11-20"].kg, 106.75);
    assert.equal(st.intake["2026-11-20"].kcal, 2150);
    assert.equal(st.intake["2026-11-20"].status, "complete");
    const text = await page.textContent("#right");
    assert.match(text, /106\.75/);
    assert.match(text, /Starting weight/);
  });

  await step("the records survive closing and reopening the window", async () => {
    await page.reload();
    await page.waitForSelector("#f-kg");
    assert.equal(await page.inputValue("#f-kg"), "106.75");
    assert.equal(await page.inputValue("#f-kcal"), "2150");
  });

  await step("a half-typed entry is recovered after an interruption", async () => {
    await page.fill("#f-kg", "105.9");
    await page.waitForTimeout(900);
    await page.reload();
    await page.waitForSelector("#f-kg");
    assert.equal(await page.inputValue("#f-kg"), "105.9");
    assert.match(await page.textContent("#formCard"), /Recovered an unsaved entry/);
    assert.equal(srv.publicState().weights["2026-11-20"].kg, 106.75); // not saved until Save
  });

  await step("saving the same day again corrects it (still one record)", async () => {
    await page.click("#save");
    await page.waitForSelector(".status.ok");
    const st = srv.publicState();
    assert.equal(Object.keys(st.weights).length, 1);
    assert.equal(st.weights["2026-11-20"].kg, 105.9);
    assert.equal(st.draft, null);
  });

  await step("fasting: Cancel saves nothing; Confirm records an explicit 0; Undo restores what was there", async () => {
    await page.click("#fast");
    await page.waitForSelector("#m-no");
    await page.click("#m-no");
    assert.equal(srv.publicState().intake["2026-11-20"].kcal, 2150);
    await page.click("#fast");
    await page.waitForSelector("#m-yes");
    await page.click("#m-yes");
    await page.waitForSelector("#toast-act");
    assert.deepEqual({ k: srv.publicState().intake["2026-11-20"].kcal, z: srv.publicState().intake["2026-11-20"].zero }, { k: 0, z: true });
    assert.match(await page.textContent("#formCard"), /Zero intake is recorded/);
    await page.click("#toast-act");
    await page.waitForFunction(() => !document.querySelector("#formCard").textContent.includes("Zero intake is recorded"));
    assert.equal(srv.publicState().intake["2026-11-20"].kcal, 2150);
    assert.equal(srv.publicState().intake["2026-11-20"].zero, false);
  });

  await step("backfilling yesterday works and shows in history; the unlogged day stays unlogged", async () => {
    await page.fill("#f-date", "2026-11-18");
    await page.dispatchEvent("#f-date", "change");
    await page.waitForFunction(() => document.querySelector("#f-date").value === "2026-11-18");
    await page.fill("#f-kg", "107.4");
    await page.click("#save");
    await page.waitForSelector(".status.ok");
    const st = srv.publicState();
    assert.equal(st.weights["2026-11-18"].kg, 107.4);
    assert.equal(st.intake["2026-11-18"], undefined);
    await page.click('[data-view="history"]');
    await page.waitForSelector("table");
    const rows = await page.locator("tbody tr").count();
    assert.equal(rows, 2);
    assert.match(await page.textContent("tbody"), /not logged/);
  });

  await step("the future is refused with a clear message", async () => {
    await page.click('[data-view="today"]');
    await page.waitForSelector("#f-kg");
    const r = await fetch(`http://127.0.0.1:${srv.port}/api/weight`, { method: "POST", headers: { "X-Forge-Token": srv.token, "Content-Type": "application/json" }, body: JSON.stringify({ date: "2026-11-21", kg: 100 }) });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /future/);
  });

  await step("settings, backup and CSV export work from the page", async () => {
    await page.click('[data-view="settings"]');
    await page.waitForSelector("#b-now");
    await page.click("#b-now");
    await page.waitForSelector("[data-restore]");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#b-csv")]);
    assert.match(dl.suggestedFilename(), /^spartan-forge-2026-11-20\.csv$/);
  });

  await step("the widget layout: a small window shows the glance first and keeps the form handy", async () => {
    const small = await browser.newPage({ viewport: { width: 440, height: 820 } });
    small.on("pageerror", (e) => errors.push(e.message));
    await small.goto(url);
    await small.waitForSelector("#glance .glance");
    const glance = await small.textContent("#glance");
    assert.match(glance, /Latest/);
    assert.match(glance, /Days left/);
    assert.ok(await small.locator("#save").isVisible());
    assert.ok(await small.locator("details.more-card").count());
    await small.close();
  });

  await step("after December 25 the mission is marked ended and nothing is lost", async () => {
    clock.now = new Date("2026-12-27T09:00:00Z");
    await page.goto(url);
    await page.waitForSelector("#f-kg");
    assert.match(await page.textContent(".banner"), /mission ended on/i);
    assert.equal(Object.keys(srv.publicState().weights).length, 2);
  });

  assert.deepEqual(errors, [], "browser errors: " + errors.join(" | "));
  console.log(`\n${n} steps passed`);
} finally {
  await browser.close();
  await srv.close();
}
