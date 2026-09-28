/**
 * Pressing "Sign in with email" really opens that marketplace, inside plug.
 *
 * Not "the click fires" — that was tested and it told me nothing. This runs
 * the REAL main.js, presses the button the way he does, and then asks the
 * question that matters: is there now a Depop page on screen, inside the
 * glass, with the two dead buttons already stripped from it?
 *
 * The marketplaces are served from a local HTTPS server with Chromium's
 * resolver pointed at it, so nothing leaves the machine and the answer does
 * not depend on the network. depop.com is on Chrome's preloaded HSTS list, so
 * it has to be https or the navigation is rewritten and fails before it starts.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:https";

const here = process.cwd();
const home = await mkdtemp(join(tmpdir(), "plug-signin-"));

/* A stand-in for each marketplace's sign-in sheet, with the two buttons that
   cannot work and the one that can. */
const SHEET = `<!doctype html><html><head><title>sign in</title></head><body>
  <div id="sheet">
    <button>Συνέχεια με την Google</button>
    <button>Continue with Apple</button>
    <a href="/login/email/">Continue with email</a>
  </div>
  <form><input type="email" name="email"><input type="password" name="password"></form>
</body></html>`;

const server = createServer({
  key: await readFile("test/fixtures/dev-key.pem").catch(() => null),
  cert: await readFile("test/fixtures/dev-cert.pem").catch(() => null),
}, (_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(SHEET);
});
await new Promise((go) => server.listen(0, "127.0.0.1", go));
const { port } = server.address();

const probe = `
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const out = [];
const say = (ok, what, extra) => out.push({ ok, what, extra: extra ?? null });

/* The real app, loaded as the app loads it. */
process.env.PLUG_TEST = "1";
require(path.join(${JSON.stringify(here)}, "main.js"));

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 1200));
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { say(false, "the window came up"); return done(); }
  say(true, "the window came up");

  const wc = win.webContents;
  /* Open the phone and press the button, exactly as he does. */
  await wc.executeJavaScript('document.getElementById("pill").click(); true;', true);
  await new Promise((r) => setTimeout(r, 900));
  await wc.executeJavaScript(\`
    window.__plug.set({ shops: {}, doing: "" });
    const b = document.querySelector("#slot-depop button");
    if (b) b.click();
    Boolean(b);
  \`, true).then((pressed) => say(pressed, "the sign-in button is there to press"));

  /* Ask the app directly, so a thrown handler is reported rather than silent. */
  const direct = await wc.executeJavaScript(
    'window.plug.signin("depop").then(r => JSON.stringify(r), e => "THREW " + e.message)', true)
    .catch((e) => "OUTER " + e.message);
  say(!/THREW|OUTER/.test(String(direct)), "asking the app to sign in does not throw", String(direct));

  /* Give the page time to load over the local server. */
  await new Promise((r) => setTimeout(r, 2500));

  const views = win.contentView.children.filter((v) => v.webContents);
  say(views.length > 0, "a marketplace view was created", "views: " + views.length);

  const shop = views[views.length - 1];
  if (shop) {
    const url = shop.webContents.getURL();
    say(/depop\\.com/.test(url), "it went to Depop", url);
    const b = shop.getBounds();
    say(b.width > 200 && b.height > 400, "and it is on screen, inside the glass",
      JSON.stringify(b));
    say(shop.getVisible !== undefined ? shop.getVisible() !== false : true,
      "the view is visible");

    const page = await shop.webContents.executeJavaScript("document.body.innerText", true)
      .catch((e) => "THREW " + e.message);
    say(/Continue with email/.test(page), "the email route is on the page", page.slice(0, 80));
    say(!/Google/.test(page), "and Google has already been stripped from it");
    say(!/Continue with Apple/.test(page), "and Apple too");
  }

  /* Two shops cannot be on screen at once: the second draws over the first and
     the one underneath keeps taking the clicks. */
  await wc.executeJavaScript('window.plug.openShop("vestiaire")', true).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const live = win.contentView.children.filter((v) => v.webContents && v.getVisible());
  say(live.length === 1, "only one marketplace is ever on screen", "visible: " + live.length);
  say(live[0] ? /vestiairecollective/.test(live[0].webContents.getURL()) : false,
    "and it is the one he just asked for", live[0] ? live[0].webContents.getURL() : "none");

  /*
   * Folding away takes the page with it.
   *
   * Otherwise a phone-sized web page stays pinned over a 320x64 pill, covering
   * it and every button on it, and nothing he presses reaches plug again.
   */
  await wc.executeJavaScript('window.plug.shape("pill")', true).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  const after = win.contentView.children.filter((v) => v.webContents && v.getVisible());
  say(after.length === 0, "folding to the pill takes the marketplace down with it",
    "still visible: " + after.length);
  const b2 = win.getBounds();
  say(b2.width === 320 && b2.height === 64, "and the window really is the pill again",
    JSON.stringify(b2));

  done();
});

function done() {
  console.log("SIGNIN" + JSON.stringify(out));
  app.exit(0);
}
`;
await writeFile(join(home, "probe.js"), probe);
await writeFile(join(home, "package.json"), JSON.stringify({ name: "s", main: "probe.js" }));

const child = spawn("xvfb-run", ["-a", join(here, "node_modules", ".bin", "electron"), home,
  "--no-sandbox", "--disable-gpu", "--ignore-certificate-errors", "--no-proxy-server",
  `--host-resolver-rules=MAP www.depop.com 127.0.0.1:${port},MAP www.vestiairecollective.com 127.0.0.1:${port}`,
], { stdio: ["ignore", "pipe", "pipe"] });

let noise = "";
child.stdout.on("data", (c) => { noise += String(c); });
child.stderr.on("data", (c) => { noise += String(c); });
await new Promise((done) => {
  const bell = setTimeout(() => { child.kill(); done(); }, 90_000);
  child.on("exit", () => { clearTimeout(bell); done(); });
});
server.close();
await rm(home, { recursive: true, force: true });

const found = /SIGNIN(\[.*\])/s.exec(noise);
if (!found) {
  console.error("FAIL  the app never reported");
  console.error(noise.trim().split("\n").slice(-14).join("\n"));
  process.exit(1);
}
let bad = 0;
for (const row of JSON.parse(found[1])) {
  console.log(row.ok ? "  ok  " + row.what : "FAIL  " + row.what + (row.extra ? " — " + row.extra : ""));
  if (!row.ok) bad++;
}
if (bad) { console.log(`sign-in: ${bad} failed`); process.exit(1); }
console.log("sign-in: ok");
