// kcal. A small local server: the records live in files on
// this Mac, the screen is a web page served on 127.0.0.1 and opened in its own
// window by the launcher. Nothing leaves the Mac. No packages to install.

import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { Store } from "./lib/store.mjs";
import { summarize, analytics, coach } from "./lib/calc.mjs";
import { toCsv } from "./lib/csv.mjs";
import { todayIn, clockIn, systemZone, isDate } from "./lib/time.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP = "kcal";

export function start({ dataDir, port = 47329, clock = () => new Date(), zone = systemZone(), build = "dev", quiet = false, notify = defaultNotify, idleExitMs = 0, onShutdown = () => {} } = {}) {
  const store = new Store(dataDir, clock).open();
  const token = randomBytes(16).toString("hex");
  const ui = join(HERE, "ui");
  const today = () => todayIn(zone, clock());
  let lastBeat = 0;
  let beats = 0;
  const startedAt = Date.now();
  const log = (...a) => { if (!quiet) console.log(new Date().toISOString(), ...a); };

  const send = (res, code, body, type = "application/json; charset=utf-8", extra = {}) => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
    res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const fail = (res, code, error) => send(res, code, { ok: false, error });

  const publicState = () => {
    const s = store.state;
    return {
      ok: true,
      build,
      zone,
      today: today(),
      settings: s.settings,
      weights: s.weights,
      intake: s.intake,
      activity: s.activity,
      summary: summarize(s, today()),
      analytics: analytics(s, today()),
      coach: coach(summarize(s, today()), analytics(s, today())),
      notice: store.loadNotice,
      draft: store.readDraft(),
      reminders: reminderStatus(),
    };
  };

  /* ------------------------------------------------------------ reminders */
  const fired = new Map(); // "YYYY-MM-DD HH:MM" -> true
  function missingToday() {
    const t = today();
    const s = store.state;
    const m = [];
    if (!s.weights[t]) m.push("weight");
    if (!s.intake[t] || s.intake[t].status !== "complete") m.push("calories");
    return m;
  }
  function reminderStatus() {
    const r = store.state.settings.reminders;
    return { ...r, missingToday: missingToday(), howItWorks: "Reminders appear while the app is open and the Mac is awake: as a macOS notification and a banner in the window. A closed app or a sleeping Mac cannot remind you." };
  }
  function tickReminders() {
    const r = store.state.settings.reminders;
    if (!r.enabled) return;
    const sum = summarize(store.state, today());
    if (sum.missionEnded) return;
    const hhmm = clockIn(zone, clock());
    const key = `${today()} ${hhmm}`;
    if (!r.times.includes(hhmm) || fired.has(key)) return;
    fired.set(key, true);
    const missing = missingToday();
    if (r.onlyIfMissing && missing.length === 0) return;
    const text = missing.length ? `Today's ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not logged yet.` : "Time for your daily log.";
    notify("kcal", text);
    log("reminder:", text);
  }
  const reminderTimer = setInterval(tickReminders, 15_000);
  reminderTimer.unref?.();

  /* ------------------------------------------------------------- routes */
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const host = req.headers.host || "";
      // Only this machine, only by this name: a web page on the internet must
      // not be able to talk to the records through the browser.
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return fail(res, 403, "Wrong host.");

      // The launcher asks an older copy of the app to quit when a new build is opened.
      // A custom header cannot be sent by another website without a permission check
      // this server never grants, so only a local program can do this.
      if (req.method === "POST" && url.pathname === "/shutdown") {
        if (req.headers["x-kcal-launcher"] !== "1") return fail(res, 403, "No.");
        send(res, 200, { ok: true });
        setTimeout(() => close().then(() => onShutdown()), 50);
        return;
      }
      if (req.method === "GET" && url.pathname === "/healthz") return send(res, 200, { ok: true, app: APP, build });
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        const html = readFileSync(join(ui, "index.html"), "utf8").replace("__TOKEN__", token).replaceAll("__BUILD__", String(build));
        return send(res, 200, html, "text/html; charset=utf-8");
      }
      const asset = { "/app.js": "application/javascript; charset=utf-8", "/style.css": "text/css; charset=utf-8", "/icon.png": "image/png" }[url.pathname];
      if (req.method === "GET" && asset) {
        const p = join(ui, url.pathname.slice(1));
        if (!existsSync(p)) return fail(res, 404, "Not found.");
        return send(res, 200, readFileSync(p), asset);
      }

      if (!url.pathname.startsWith("/api/")) return fail(res, 404, "Not found.");
      if (req.headers["x-kcal-token"] !== token) return fail(res, 403, "This window is out of date. Close it and open the app again.");

      let body = {};
      if (req.method !== "GET") {
        const chunks = [];
        let size = 0;
        for await (const c of req) {
          size += c.length;
          if (size > 200_000) return fail(res, 413, "Too large.");
          chunks.push(c);
        }
        try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; } catch { return fail(res, 400, "That was not valid JSON."); }
      }
      const t = today();
      const day = (b) => (b && b.date !== undefined ? b.date : t);
      const done = (r) => (r.ok ? send(res, 200, { ...r, state: publicState() }) : fail(res, 400, r.error));
      const route = `${req.method} ${url.pathname}`;

      switch (route) {
        case "GET /api/state": return send(res, 200, publicState());
        case "POST /api/heartbeat": lastBeat = Date.now(); beats++; return send(res, 200, { ok: true });
        case "POST /api/weight": return done(store.setWeight(day(body), typeof body.kg === "string" ? Number(body.kg.replace(",", ".")) : body.kg, t));
        case "POST /api/weight/clear": return done(store.clearWeight(day(body)));
        case "POST /api/intake": return done(store.setIntake(day(body), typeof body.kcal === "string" ? Number(body.kcal.replace(",", ".")) : body.kcal, body.status, t));
        case "POST /api/intake/zero": return done(store.setZeroIntake(day(body), body.confirmed === true, t));
        case "POST /api/meal": return done(store.addMeal(day(body), typeof body.kcal === "string" ? Number(body.kcal.replace(",", ".")) : body.kcal, body.label, t));
        case "POST /api/meal/remove": return done(store.removeMeal(day(body), Number(body.index)));
        case "POST /api/intake/finish": return done(store.finishDay(day(body), t));
        case "POST /api/intake/clear": return done(store.clearIntake(day(body)));
        case "POST /api/intake/restore": return done(store.restoreIntake(day(body), body.record ?? null));
        case "POST /api/activity": return done(store.setActivity(day(body), body, t));
        case "POST /api/settings": return done(store.setSettings(body));
        case "PUT /api/draft": store.writeDraft(body && Object.keys(body).length ? body : null); return send(res, 200, { ok: true });
        case "POST /api/backup": return send(res, 200, { ok: true, name: store.backupNow("manual"), backups: store.listBackups() });
        case "GET /api/backups": return send(res, 200, { ok: true, backups: store.listBackups() });
        case "POST /api/restore": try { store.restore(String(body.name || "")); return send(res, 200, { ok: true, state: publicState() }); } catch (e) { return fail(res, 400, e.message); }
        case "POST /api/reminder-test": notify("kcal", "This is how a reminder looks."); return send(res, 200, { ok: true });
        case "GET /api/export.csv": {
          const name = `kcal-${t}.csv`;
          return send(res, 200, "﻿" + toCsv(store.state), "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename="${name}"` });
        }
        default: return fail(res, 404, "Not found.");
      }
    } catch (e) {
      log("error", e);
      fail(res, 500, "Something went wrong inside the app. Your records were not changed by this request.");
    }
  });

  // When the window is closed the page stops sending heartbeats, and the
  // server quits (after five quiet minutes: a minimised window's timers are
  // slowed to about one a minute, and that must not count as closed).
  let idleTimer = null;
  if (idleExitMs > 0) {
    idleTimer = setInterval(() => {
      const quietFor = Date.now() - (lastBeat || startedAt);
      if (quietFor > (beats ? idleExitMs : idleExitMs * 3)) {
        log("window closed, quitting");
        close().then(() => process.exit(0));
      }
    }, 5_000);
  }

  const close = () =>
    new Promise((ok) => {
      clearInterval(reminderTimer);
      if (idleTimer) clearInterval(idleTimer);
      server.close(() => ok());
      server.closeAllConnections?.();
    });

  return new Promise((ok, no) => {
    server.once("error", no);
    server.listen(port, "127.0.0.1", () => ok({ server, store, port: server.address().port, token, close, tickReminders, publicState }));
  });
}

function defaultNotify(title, text) {
  if (process.platform !== "darwin") return;
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  execFile("osascript", ["-e", `display notification "${esc(text)}" with title "${esc(title)}"`], () => {});
}

// Run directly: node server.mjs
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.KCAL_DATA || join(homedir(), "Library", "Application Support", "kcal", "data");
  mkdirSync(dataDir, { recursive: true });
  const port = Number(process.env.KCAL_PORT || 47329);
  const build = process.env.KCAL_BUILD || "dev";
  start({ dataDir, port, build, idleExitMs: Number(process.env.KCAL_IDLE_MS || 300_000), onShutdown: () => process.exit(0) })
    .then((s) => {
      console.log(`kcal build ${build} on http://127.0.0.1:${s.port}  data: ${dataDir}`);
      if (s.store.loadNotice) console.log("NOTICE:", s.store.loadNotice);
    })
    .catch((e) => {
      if (e.code === "EADDRINUSE") {
        console.log("Already running.");
        process.exit(0);
      }
      console.error(e.message);
      process.exit(1);
    });
}
