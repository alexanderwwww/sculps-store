/**
 * plug actually starts — as an application, not as a set of files.
 *
 * Electron is launched for real, headless, and asked the things that have gone
 * wrong before on his Mac:
 *
 *   - does the window come up at all, or does it die on a require
 *   - does each marketplace get its OWN persistent session, under a name we
 *     chose, so a rebuild cannot sign him out
 *   - does the glass filter exist in the page it will actually run in
 *   - do the two dead sign-in buttons come off a real page
 *
 * None of this needs his machine, and every one of them has cost him a build.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = process.cwd();
const home = await mkdtemp(join(tmpdir(), "plug-run-"));

/*
 * The checks run INSIDE Electron's main process, because that is the only
 * place the answers exist. A script that asks from outside is asking about a
 * different program.
 */
const probe = `
const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");
const out = [];
const say = (ok, what, extra) => out.push({ ok, what, extra: extra ?? null });

const { ipcMain } = require("electron");
/* The screen asks the app for these the moment it loads. This harness is not
   the app, so they are answered with nothing — otherwise the log fills with
   "no handler registered" and the real failures are buried. */
for (const name of ["desktop", "where", "pass", "shape", "signin", "close-shop", "open-external"]) {
  ipcMain.handle(name, () => null);
}

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 393, height: 852, show: false, frame: false, transparent: true,
      webPreferences: {
        preload: path.join(${JSON.stringify(here)}, "preload.js"),
        contextIsolation: true, nodeIntegration: false,
      },
    });
    say(true, "the window is created");

    await win.loadFile(path.join(${JSON.stringify(here)}, "renderer", "index.html"));
    say(true, "the screen loads");

    /* The glass has to be in the page it will really run in — not only in a
       preview. This asks the live document. */
    const glass = await win.webContents.executeJavaScript(\`
      (function () {
        const f = document.querySelector('#glass-filters filter#lg-phone');
        const maps = f ? f.querySelectorAll('feDisplacementMap').length : 0;
        const scales = f ? Array.from(f.querySelectorAll('feDisplacementMap')).map(n => Number(n.getAttribute('scale'))) : [];
        const refract = getComputedStyle(document.querySelector('.refract')).backdropFilter || '';
        return { maps, scales, refract };
      })()
    \`, true);
    say(glass.maps === 3, "the phone filter has three displacements — the chromatic split", JSON.stringify(glass.scales));
    /* It opens as the pill, so that is the filter it should be using. Checking
       for the phone's here would be testing the wrong shape — the window was
       right and the assertion was wrong. */
    say(/lg-pill/.test(glass.refract), "the pill refracts through the pill's own filter", glass.refract.slice(0, 60));
    say(!/blur\\((?!2px)/.test(glass.refract), "and it was not quietly replaced with a blur", glass.refract.slice(0, 60));

    /* And the phone's, because a map drawn for 320x64 puts the rim through the
       middle of a 393x852 window. */
    const asPhone = await win.webContents.executeJavaScript(\`
      (function () {
        document.body.className = "shape-phone";
        const f = document.querySelector('#glass-filters filter#lg-phone');
        return {
          refract: getComputedStyle(document.querySelector('.refract')).backdropFilter || '',
          w: f ? Number(f.getAttribute('width')) : 0,
          h: f ? Number(f.getAttribute('height')) : 0,
        };
      })()
    \`, true);
    say(/lg-phone/.test(asPhone.refract), "and the phone refracts through the phone's", asPhone.refract.slice(0, 60));
    say(asPhone.w === 393 && asPhone.h === 852,
      "the phone's filter is built at the phone's real size", asPhone.w + "x" + asPhone.h);

    /* The sign-in that has to survive rebuilds: a partition WE named, which
       lives under the app's data directory and does not move when the binary
       does. */
    const { SITES, Shop, ONLY_EMAIL } = require(path.join(${JSON.stringify(here)}, "shops.js"));
    const depop = session.fromPartition(SITES.depop.partition);
    const vest = session.fromPartition(SITES.vestiaire.partition);
    say(SITES.depop.partition === "persist:depop" && SITES.vestiaire.partition === "persist:vestiaire",
      "each shop has its own named, persistent session");
    say(depop !== vest, "and the two shops cannot see each other's cookies");
    await depop.cookies.set({ url: "https://www.depop.com/", name: "plug_probe", value: "1" });
    const mine = await depop.cookies.get({ name: "plug_probe" });
    const theirs = await vest.cookies.get({ name: "plug_probe" });
    say(mine.length === 1 && theirs.length === 0,
      "a cookie set in one shop is not visible in the other");

    /* The two dead buttons, off a real page in a real browser. */
    const sheet = new BrowserWindow({ show: false, webPreferences: { partition: "persist:probe" } });
    await sheet.loadURL("data:text/html," + encodeURIComponent(\`<body><div id=s>
      <button>\\u03a3\\u03c5\\u03bd\\u03ad\\u03c7\\u03b5\\u03b9\\u03b1 \\u03bc\\u03b5 \\u03c4\\u03b7\\u03bd Google</button>
      <button>Continue with Apple</button>
      <a href="/login/email/">Continue with email</a>
      <button>Apple Pay checkout is something else and a much longer label</button>
      </div></body>\`));
    await sheet.webContents.executeJavaScript(ONLY_EMAIL, true);
    const left = await sheet.webContents.executeJavaScript("document.body.innerText", true);
    say(!/Google/.test(left), "the Google button is gone, accent and all", left.replace(/\\n/g, " | "));
    say(!/Continue with Apple/.test(left), "the Apple button is gone");
    say(/Continue with email/.test(left), "the one route that works is untouched");
    say(/Apple Pay/.test(left), "Apple Pay is not mistaken for sign-in");
  } catch (error) {
    say(false, "it threw", String(error && error.message));
  }
  console.log("PLUGTEST" + JSON.stringify(out));
  app.exit(0);
});
`;

await writeFile(join(home, "probe.js"), probe);
await writeFile(join(home, "package.json"), JSON.stringify({ name: "probe", main: "probe.js" }));

/*
 * Under a virtual display, not --headless.
 *
 * Electron's headless mode still wants a display connection for GTK and dies
 * with "Can't create a GtkStyleContext" — which reads as the app being broken
 * rather than as the container having no screen. xvfb gives it one.
 */
const electron = join(here, "node_modules", ".bin", "electron");
const child = spawn("xvfb-run", ["-a", electron, home, "--no-sandbox", "--disable-gpu"], {
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let noise = "";
child.stdout.on("data", (c) => { noise += String(c); });
child.stderr.on("data", (c) => { noise += String(c); });

const code = await new Promise((done) => {
  const bell = setTimeout(() => { child.kill(); done(124); }, 60_000);
  child.on("exit", (c) => { clearTimeout(bell); done(c ?? 1); });
});

await rm(home, { recursive: true, force: true });

const found = /PLUGTEST(\[.*\])/s.exec(noise);
if (!found) {
  console.error("FAIL  Electron never reported (exit " + code + ")");
  console.error(noise.trim().split("\n").slice(-12).join("\n"));
  process.exit(1);
}
let bad = 0;
for (const row of JSON.parse(found[1])) {
  console.log(row.ok ? "  ok  " + row.what : "FAIL  " + row.what + (row.extra ? " — " + row.extra : ""));
  if (!row.ok) bad++;
}
if (bad) { console.log(`app: ${bad} failed`); process.exit(1); }
console.log("app: ok");
