/**
 * The buttons actually work when clicked.
 *
 * He reported "the buttons don't work, so the app's main function is not
 * there" — and every test so far checked that they EXIST, which is not the
 * same thing at all. A control is drawn, positioned and reachable by the
 * mouse, and those are three different things.
 *
 * So this clicks them, in a real Electron window, and asks what happened.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = process.cwd();
const home = await mkdtemp(join(tmpdir(), "plug-click-"));

const probe = `
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const out = [];
const say = (ok, what, extra) => out.push({ ok, what, extra: extra ?? null });

let signinAsked = null;
let shapeAsked = null;
ipcMain.handle("signin", (_e, site) => { signinAsked = site; return { ok: true }; });
ipcMain.handle("shape", (_e, next) => { shapeAsked = next; return next; });
ipcMain.handle("desktop", () => null);
ipcMain.handle("where", () => ({ x: 0, y: 0, width: 393, height: 852 }));
ipcMain.handle("pass", () => []);
ipcMain.handle("close-shop", () => ({ ok: true }));
ipcMain.handle("open-external", () => null);

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 393, height: 852, show: false, frame: false, transparent: true,
      webPreferences: {
        preload: path.join(${JSON.stringify(here)}, "preload.js"),
        contextIsolation: true, nodeIntegration: false,
      },
    });
    await win.loadFile(path.join(${JSON.stringify(here)}, "renderer", "index.html"));
    const wc = win.webContents;

    /* Put it in the phone shape with both shops signed OUT, which is the state
       he is looking at when he presses the button. */
    await wc.executeJavaScript(\`
      document.body.className = "shape-phone";
      document.getElementById("pill").hidden = true;
      document.getElementById("phone").hidden = false;
      window.__plug.set({ build: "t", shops: {}, doing: "" });
      true;
    \`, true);

    const seen = await wc.executeJavaScript(\`
      (function () {
        const b = document.querySelector("#slot-depop button");
        if (!b) return { there: false };
        const r = b.getBoundingClientRect();
        const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          there: true,
          drag: getComputedStyle(b).webkitAppRegion || "",
          /* What is ACTUALLY under the mouse at the button's centre. If it is
             not the button, something transparent is sitting over it. */
          onTop: mid ? (mid.tagName + "." + (mid.className || "")).slice(0, 60) : "nothing",
          isButton: mid === b,
        };
      })()
    \`, true);

    say(seen.there, "the sign-in button exists");
    say(seen.isButton, "and it is what the mouse actually hits at its centre", seen.onTop);
    say(seen.drag !== "drag", "it is not swallowed by the window's drag region", "app-region: " + seen.drag);

    /* Now really click it, the way a mouse does. */
    await wc.executeJavaScript(\`
      document.querySelector("#slot-depop button").click(); true;
    \`, true);
    await new Promise((r) => setTimeout(r, 300));
    say(signinAsked === "depop", "clicking it asks the app to open Depop's sign-in",
      "asked: " + signinAsked);

    /* And the pill opening into the phone. */
    await wc.executeJavaScript(\`
      document.body.className = "shape-pill";
      document.getElementById("pill").hidden = false;
      document.getElementById("pill").click(); true;
    \`, true);
    await new Promise((r) => setTimeout(r, 300));
    say(shapeAsked === "phone", "tapping the pill opens the phone", "asked: " + shapeAsked);
  } catch (error) {
    say(false, "it threw", String(error && error.message));
  }
  console.log("CLICKTEST" + JSON.stringify(out));
  app.exit(0);
});
`;
await writeFile(join(home, "probe.js"), probe);
await writeFile(join(home, "package.json"), JSON.stringify({ name: "c", main: "probe.js" }));

const child = spawn("xvfb-run", ["-a", join(here, "node_modules", ".bin", "electron"), home, "--no-sandbox", "--disable-gpu"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let noise = "";
child.stdout.on("data", (c) => { noise += String(c); });
child.stderr.on("data", (c) => { noise += String(c); });
await new Promise((done) => {
  const bell = setTimeout(() => { child.kill(); done(); }, 60_000);
  child.on("exit", () => { clearTimeout(bell); done(); });
});
await rm(home, { recursive: true, force: true });

const found = /CLICKTEST(\[.*\])/s.exec(noise);
if (!found) {
  console.error("FAIL  Electron never reported");
  console.error(noise.trim().split("\n").slice(-10).join("\n"));
  process.exit(1);
}
let bad = 0;
for (const row of JSON.parse(found[1])) {
  console.log(row.ok ? "  ok  " + row.what : "FAIL  " + row.what + (row.extra ? " — " + row.extra : ""));
  if (!row.ok) bad++;
}
if (bad) { console.log(`click: ${bad} failed`); process.exit(1); }
console.log("click: ok");
