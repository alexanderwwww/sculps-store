import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { start } from "../src/server.mjs";

async function boot(nowIso = "2026-10-26T10:00:00Z", extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "forge-srv-"));
  const notes = [];
  const clock = { now: new Date(nowIso) };
  const srv = await start({ dataDir: dir, port: 0, clock: () => clock.now, zone: "Europe/Athens", build: "t", quiet: true, notify: (t, x) => notes.push([t, x]), ...extra });
  const base = `http://127.0.0.1:${srv.port}`;
  const call = async (path, method = "GET", body, headers = {}) => {
    const res = await fetch(base + "/api/" + path, { method, headers: { "X-Forge-Token": srv.token, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, res };
  };
  return { srv, base, call, notes, clock, dir, close: srv.close };
}

test("serves the page with a per-run token, and health", async () => {
  const t = await boot();
  try {
    const h = await (await fetch(t.base + "/healthz")).json();
    assert.deepEqual({ ok: h.ok, app: h.app }, { ok: true, app: "spartan-forge" });
    const html = await (await fetch(t.base + "/")).text();
    assert.ok(html.includes(t.srv.token));
    assert.ok(!html.includes("__TOKEN__"));
    assert.ok(html.includes("SPARTAN FORGE: BATMAN"));
    for (const p of ["/app.js", "/style.css", "/icon.png"]) assert.equal((await fetch(t.base + p)).status, 200, p);
  } finally { await t.close(); }
});

test("the API refuses calls without the token or from another host name", async () => {
  const t = await boot();
  try {
    assert.equal((await fetch(t.base + "/api/state")).status, 403);
    assert.equal((await fetch(t.base + "/api/state", { headers: { "X-Forge-Token": "wrong" } })).status, 403);
    assert.equal((await t.call("state")).status, 200);
    const status = await new Promise((ok) => {
      http.get({ host: "127.0.0.1", port: t.srv.port, path: "/api/state", headers: { Host: "evil.example.com", "X-Forge-Token": t.srv.token } }, (r) => { r.resume(); ok(r.statusCode); });
    });
    assert.equal(status, 403);
  } finally { await t.close(); }
});

test("log a day end to end: weight, calories, activity; progress comes back at once", async () => {
  const t = await boot();
  try {
    let r = await t.call("weight", "POST", { date: "2026-10-26", kg: "106,75" });
    assert.equal(r.status, 200);
    assert.equal(r.json.state.weights["2026-10-26"].kg, 106.75);
    assert.equal(r.json.state.summary.startKg, 106.75);
    r = await t.call("intake", "POST", { date: "2026-10-26", kcal: "2150", status: "complete" });
    assert.equal(r.json.state.summary.calories.completeDays, 1);
    r = await t.call("activity", "POST", { date: "2026-10-26", exerciseMin: 40, intensity: "light", sleepHours: 7, stress: 2 });
    assert.equal(r.json.state.activity["2026-10-26"].exerciseMin, 40);
    assert.equal(r.json.state.today, "2026-10-26");
  } finally { await t.close(); }
});

test("a second save of the same day replaces; it never makes a duplicate", async () => {
  const t = await boot();
  try {
    await t.call("weight", "POST", { date: "2026-10-26", kg: 107 });
    await t.call("weight", "POST", { date: "2026-10-26", kg: 106.5 });
    const s = (await t.call("state")).json;
    assert.equal(Object.keys(s.weights).length, 1);
    assert.equal(s.weights["2026-10-26"].kg, 106.5);
  } finally { await t.close(); }
});

test("fasting needs confirmation, records an explicit zero, and the undo restores the previous state", async () => {
  const t = await boot();
  try {
    let r = await t.call("intake/zero", "POST", { date: "2026-10-26" });
    assert.equal(r.status, 400);
    assert.equal((await t.call("state")).json.intake["2026-10-26"], undefined);
    r = await t.call("intake/zero", "POST", { date: "2026-10-26", confirmed: true });
    assert.equal(r.json.state.intake["2026-10-26"].zero, true);
    assert.equal(r.json.previous, null);
    r = await t.call("intake/restore", "POST", { date: "2026-10-26", record: r.json.previous });
    assert.equal(r.json.state.intake["2026-10-26"], undefined);
  } finally { await t.close(); }
});

test("bad input is a clear error and changes nothing", async () => {
  const t = await boot();
  try {
    for (const [p, b] of [["weight", { kg: "abc" }], ["weight", { kg: 10 }], ["weight", { date: "2026-10-27", kg: 100 }], ["intake", { kcal: 100 }], ["intake", { kcal: 100, status: "x" }], ["intake", { kcal: -1, status: "complete" }]]) {
      const r = await t.call(p, "POST", b);
      assert.equal(r.status, 400, p + JSON.stringify(b));
      assert.ok(r.json.error);
    }
    const s = (await t.call("state")).json;
    assert.equal(Object.keys(s.weights).length + Object.keys(s.intake).length, 0);
    const bad = await fetch(t.base + "/api/weight", { method: "POST", headers: { "X-Forge-Token": t.srv.token }, body: "{not json" });
    assert.equal(bad.status, 400);
  } finally { await t.close(); }
});

test("empty weight text is refused rather than saved as zero", async () => {
  const t = await boot();
  try {
    const r = await t.call("weight", "POST", { date: "2026-10-26", kg: "" });
    assert.equal(r.status, 400);
  } finally { await t.close(); }
});

test("drafts survive a restart of the server", async () => {
  const t = await boot();
  await t.call("draft", "PUT", { date: "2026-10-26", kg: "106.7", kcal: "1200" });
  await t.close();
  const again = await start({ dataDir: t.dir, port: 0, clock: () => new Date("2026-10-26T10:05:00Z"), zone: "Europe/Athens", quiet: true });
  try {
    const res = await fetch(`http://127.0.0.1:${again.port}/api/state`, { headers: { "X-Forge-Token": again.token } });
    const s = await res.json();
    assert.equal(s.draft.kg, "106.7");
    assert.equal(s.draft.kcal, "1200");
  } finally { await again.close(); }
});

test("CSV export downloads with a name, a BOM, and empty cells for unlogged values", async () => {
  const t = await boot();
  try {
    await t.call("weight", "POST", { date: "2026-10-25", kg: 107 });
    await t.call("intake/zero", "POST", { date: "2026-10-26", confirmed: true });
    const r = await t.call("export.csv");
    assert.equal(r.status, 200);
    assert.match(r.res.headers.get("content-disposition"), /spartan-forge-2026-10-26\.csv/);
    const raw = Buffer.from(await (await fetch(t.base + "/api/export.csv", { headers: { "X-Forge-Token": t.srv.token } })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // UTF-8 BOM so Excel reads it right
    assert.ok(r.text.startsWith("date,"));
    assert.match(r.text, /2026-10-26,,,0,complete day,zero/);
  } finally { await t.close(); }
});

test("backups can be made, listed and restored over HTTP", async () => {
  const t = await boot();
  try {
    await t.call("weight", "POST", { date: "2026-10-25", kg: 107 });
    const b = await t.call("backup", "POST", {});
    assert.ok(b.json.name);
    await t.call("weight", "POST", { date: "2026-10-26", kg: 106 });
    const r = await t.call("restore", "POST", { name: b.json.name });
    assert.equal(Object.keys(r.json.state.weights).length, 1);
    assert.equal((await t.call("restore", "POST", { name: "../x" })).status, 400);
  } finally { await t.close(); }
});

test("the day rolls over by the zone's calendar, not UTC", async () => {
  const t = await boot("2026-10-26T22:30:00Z"); // 01:30 on the 27th in Athens
  try {
    assert.equal((await t.call("state")).json.today, "2026-10-27");
  } finally { await t.close(); }
});

test("after December 25 the mission is ended, nothing is deleted, and history is still readable and exportable", async () => {
  const t = await boot("2026-12-24T10:00:00Z");
  try {
    await t.call("weight", "POST", { date: "2026-12-24", kg: 100 });
    t.clock.now = new Date("2026-12-27T10:00:00Z");
    const s = (await t.call("state")).json;
    assert.equal(s.summary.missionEnded, true);
    assert.equal(s.weights["2026-12-24"].kg, 100);
    assert.equal((await t.call("weight", "POST", { date: "2026-12-26", kg: 99 })).status, 400);
    assert.equal((await t.call("weight", "POST", { date: "2026-12-24", kg: 99.5 })).status, 200);
    assert.equal((await t.call("export.csv")).status, 200);
  } finally { await t.close(); }
});

test("reminders fire once at the set time, only when something is missing, and say honestly what is missing", async () => {
  const t = await boot("2026-10-26T17:59:40Z"); // 20:59 in Athens (UTC+3 until 25 Oct; +2 after: 19:59)
  try {
    // 2026-10-26 is after Athens' clock change on the 25th: UTC+2, so 17:59Z is 19:59.
    await t.call("settings", "POST", { reminders: { enabled: true, times: ["20:00"], onlyIfMissing: true } });
    t.srv.tickReminders();
    assert.equal(t.notes.length, 0); // not yet 20:00
    t.clock.now = new Date("2026-10-26T18:00:05Z");
    t.srv.tickReminders();
    assert.equal(t.notes.length, 1);
    assert.match(t.notes[0][1], /weight and calories/);
    t.srv.tickReminders();
    assert.equal(t.notes.length, 1); // once per time per day
    // everything logged: no reminder
    await t.call("weight", "POST", { date: "2026-10-27", kg: 100 }).catch(() => {});
    t.clock.now = new Date("2026-10-27T18:00:05Z");
    await t.call("weight", "POST", { date: "2026-10-27", kg: 100 });
    await t.call("intake", "POST", { date: "2026-10-27", kcal: 2000, status: "complete" });
    t.srv.tickReminders();
    assert.equal(t.notes.length, 1);
  } finally { await t.close(); }
});

test("reminders do nothing when switched off or after the mission ended", async () => {
  const t = await boot("2026-12-28T18:00:05Z");
  try {
    await t.call("settings", "POST", { reminders: { enabled: true, times: ["20:00"], onlyIfMissing: false } });
    t.srv.tickReminders();
    assert.equal(t.notes.length, 0);
  } finally { await t.close(); }
});

test("a second server on the same port fails cleanly (the launcher then just opens the window)", async () => {
  const t = await boot();
  try {
    await assert.rejects(() => start({ dataDir: mkdtempSync(join(tmpdir(), "forge-dup-")), port: t.srv.port, quiet: true }), (e) => e.code === "EADDRINUSE");
  } finally { await t.close(); }
});
