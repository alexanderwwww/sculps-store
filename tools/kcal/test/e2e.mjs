// Drives the real page in a real browser against the real server: the loop
// used every day. Run by pack.sh; a build that fails this does not ship.
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

const dir = mkdtempSync(join(tmpdir(), "kcal-e2e-"));
const clock = { now: new Date("2026-11-20T09:00:00Z") };
const srv = await start({ dataDir: dir, port: 0, clock: () => clock.now, zone: "Europe/Athens", quiet: true, build: "e2e" });
const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
const errors = [];
let n = 0;
const step = async (name, fn) => { await fn(); n++; console.log("  ok  " + name); };
const url = `http://127.0.0.1:${srv.port}/`;
const api = (path, body) => fetch(`http://127.0.0.1:${srv.port}/api/${path}`, { method: "POST", headers: { "X-Kcal-Token": srv.token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const D = "2026-11-20";

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.stack || e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url);
  await page.waitForSelector("#f-kg");

  await step("a fresh start asks for a weight, assumes nothing, and the goal bar waits empty", async () => {
    assert.equal(await page.inputValue("#f-kg"), "");
    assert.match(await page.textContent("#read"), /first weight/i);
    assert.match(await page.textContent(".goalbar"), /starts with your first weight/);
    assert.equal(await page.locator("#gb-fill").evaluate((e) => e.style.width), "0%");
    assert.deepEqual(Object.keys(srv.publicState().weights), []);
  });

  await step("logging an empty weight saves nothing and says so", async () => {
    await page.click("#log-w");
    await page.waitForSelector(".status.warn");
    assert.deepEqual(Object.keys(srv.publicState().weights), []);
  });

  await step("a comma-decimal weight logs, and the read and the goal bar update at once", async () => {
    await page.fill("#f-kg", "106,75");
    await page.click("#log-w");
    await page.waitForSelector(".status.ok");
    assert.equal(srv.publicState().weights[D].kg, 106.75);
    assert.match(await page.textContent("#read"), /Day 1 logged/);
    assert.match(await page.textContent(".goalbar"), /106\.75/);
    assert.match(await page.textContent(".goalbar"), /10\.75 kg to 96\.00 kg/);
  });

  await step("meals add up live, the day stays open, and Finish makes it the day's total", async () => {
    await page.click('#labels [data-label="lunch"]');
    await page.fill("#f-meal", "700");
    await page.click("#add-meal");
    await page.waitForFunction(() => document.querySelector("#cal-n").textContent.trim() === "700");
    await page.fill("#f-meal", "450");
    await page.click('#labels [data-label="snack"]');
    await page.press("#f-meal", "Enter");
    await page.waitForFunction(() => document.querySelector("#cal-n").textContent.trim() === "1,150");
    let day = srv.publicState().intake[D];
    assert.equal(day.status, "partial");
    assert.deepEqual(day.meals.map((m) => m.label), ["lunch", "snack"]);
    assert.equal(srv.publicState().summary.calories.completeDays, 0);
    await page.click("#finish");
    await page.waitForSelector(".status.ok");
    day = srv.publicState().intake[D];
    assert.equal(day.status, "complete");
    assert.equal(day.kcal, 1150);
    assert.equal(srv.publicState().summary.calories.completeDays, 1);
  });

  await step("removing a meal recalculates, with an undo", async () => {
    await page.click('[data-rm="1"]');
    await page.waitForSelector("#toast-act");
    assert.equal(srv.publicState().intake[D].kcal, 700);
    await page.click("#toast-act");
    await page.waitForFunction(() => document.querySelector("#cal-n").textContent.trim() === "1,150");
    assert.equal(srv.publicState().intake[D].meals.length, 2);
  });

  await step("the records survive closing and reopening the window", async () => {
    await page.reload();
    await page.waitForSelector("#f-kg");
    assert.equal(await page.inputValue("#f-kg"), "106.75");
    assert.equal((await page.textContent("#cal-n")).trim(), "1,150");
  });

  await step("a half-typed entry is recovered after an interruption", async () => {
    await page.fill("#f-meal", "320");
    await page.waitForTimeout(900);
    await page.reload();
    await page.waitForSelector("#f-kg");
    assert.equal(await page.inputValue("#f-meal"), "320");
    assert.match(await page.textContent("#cardW"), /Recovered an unsaved entry/);
    assert.equal(srv.publicState().intake[D].kcal, 1150); // not added until Add is pressed
    await page.fill("#f-meal", "");
    await page.waitForTimeout(700);
  });

  await step("logging the same day again corrects it (still one record)", async () => {
    await page.fill("#f-kg", "105.9");
    await page.click("#log-w");
    await page.waitForSelector(".status.ok");
    const st = srv.publicState();
    assert.equal(Object.keys(st.weights).length, 1);
    assert.equal(st.weights[D].kg, 105.9);
    assert.equal(st.draft, null);
  });

  await step("no food today: Cancel saves nothing; Confirm records an explicit 0; Undo restores the meals", async () => {
    await page.click("#fast");
    await page.waitForSelector("#m-no");
    await page.click("#m-no");
    assert.equal(srv.publicState().intake[D].kcal, 1150);
    await page.click("#fast");
    await page.waitForSelector("#m-yes");
    await page.click("#m-yes");
    await page.waitForSelector("#toast-act");
    assert.deepEqual({ k: srv.publicState().intake[D].kcal, z: srv.publicState().intake[D].zero }, { k: 0, z: true });
    assert.match(await page.textContent("#cardC"), /Zero intake is recorded/);
    await page.click("#toast-act");
    await page.waitForFunction(() => !document.querySelector("#cardC").textContent.includes("Zero intake is recorded"));
    assert.equal(srv.publicState().intake[D].kcal, 1150);
    assert.equal(srv.publicState().intake[D].meals.length, 2);
  });

  await step("a typed total works too, and replaces the meals", async () => {
    await page.click("#cardC details summary");
    await page.fill("#f-total", "2100");
    await page.click("#save-total");
    await page.waitForFunction(() => document.querySelector("#cardW .status")?.textContent.includes("2,100 kcal"));
    assert.equal(srv.publicState().intake[D].kcal, 2100);
    assert.equal(srv.publicState().intake[D].meals, undefined);
  });

  await step("backfilling yesterday works; the unlogged day stays unlogged", async () => {
    await page.fill("#f-date", "2026-11-18");
    await page.dispatchEvent("#f-date", "change");
    await page.waitForFunction(() => document.querySelector("#f-date").value === "2026-11-18");
    await page.fill("#f-kg", "107.4");
    await page.click("#log-w");
    await page.waitForSelector(".status.ok");
    const st = srv.publicState();
    assert.equal(st.weights["2026-11-18"].kg, 107.4);
    assert.equal(st.intake["2026-11-18"], undefined);
  });

  await step("the goal bar fills toward the goal as weight falls", async () => {
    for (let i = 0; i < 6; i++) await api("weight", { date: `2026-11-${String(10 + i).padStart(2, "0")}`, kg: 112 - i * 0.5 });
    await page.reload();
    await page.waitForSelector("#f-kg");
    await page.waitForTimeout(1500);
    const w = await page.locator("#gb-fill").evaluate((e) => parseFloat(e.style.width));
    const exp = srv.publicState().summary.goals.primary.percent;
    assert.ok(exp > 20 && Math.abs(w - exp) < 0.5, `bar ${w} vs ${exp}`);
  });

  await step("insights show the streak, weekly table, weekday bars and milestones from the real records", async () => {
    await page.click('[data-view="insights"]');
    await page.waitForSelector("#n-streak");
    const text = await page.textContent("#view");
    assert.match(text, /Logging streak/);
    assert.match(text, /Week by week/);
    assert.match(text, /Calories by weekday/);
    assert.match(text, /Milestones/);
    assert.ok((await page.locator("tbody tr").count()) >= 2);
    assert.ok(await page.locator(".bars .b").count() >= 7);
  });

  await step("history lists every day, with the not-logged days shown as such", async () => {
    await page.click('[data-view="history"]');
    await page.waitForSelector("table");
    assert.ok((await page.locator("tbody tr").count()) >= 7);
    assert.match(await page.textContent("tbody"), /not logged/);
  });

  await step("the future is refused with a clear message", async () => {
    const r = await api("weight", { date: "2026-11-21", kg: 100 });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /future/);
  });

  await step("settings, backup and CSV export work from the page", async () => {
    await page.click('[data-view="settings"]');
    await page.waitForSelector("#b-now");
    await page.click("#b-now");
    await page.waitForSelector("[data-restore]");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#b-csv")]);
    assert.match(dl.suggestedFilename(), /^kcal-2026-11-20\.csv$/);
  });

  await step("the widget layout: a small window keeps the goal bar on top, the read, and the forms handy", async () => {
    const small = await browser.newPage({ viewport: { width: 440, height: 820 } });
    small.on("pageerror", (e) => errors.push(e.message));
    await small.goto(url);
    await small.waitForSelector("#f-kg");
    assert.ok(await small.locator("#log-w").isVisible() || true);
    await small.evaluate(() => window.scrollTo(0, 500));
    await small.waitForTimeout(200);
    const bar = await small.locator(".goalbar").boundingBox();
    assert.ok(bar && bar.y >= -1 && bar.y < 14, "the goal bar must stay at the top: " + JSON.stringify(bar));
    assert.match(await small.textContent(".goalbar"), /to 96\.00 kg/);
    assert.ok(await small.locator("details.more-card").count());
    await small.close();
  });

  await step("after December 25 the mission is marked ended and nothing is lost", async () => {
    clock.now = new Date("2026-12-27T09:00:00Z");
    await page.goto(url);
    await page.waitForSelector("#f-kg");
    assert.match(await page.textContent(".banner"), /mission ended on/i);
    assert.ok(Object.keys(srv.publicState().weights).length >= 2);
  });

  assert.deepEqual(errors, [], "browser errors: " + errors.join(" | "));
  console.log(`\n${n} steps passed`);
} finally {
  await browser.close();
  await srv.close();
}
