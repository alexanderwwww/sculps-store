// Runs the PACKED Dock launcher the way the Mac would, with `open` and
// `osascript` replaced by recorders: node found, program installed beside the
// data, server started once, window opened, a newer or older build replaces the
// program but never the records. Linux stand-in for everything the Mac does
// except actually drawing the window (that is proven on his Mac, not here).
//
//   node test/launcher-check.mjs "<path to SPARTAN FORGE BATMAN.app>"
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const app = process.argv[2];
assert.ok(app && existsSync(app), "usage: launcher-check.mjs <app>");
const root = mkdtempSync(join(tmpdir(), "forge-launch-"));
const work = join(root, "Application Support", "SpartanForge");
const stubs = join(root, "stubs");
mkdirSync(stubs, { recursive: true });
const calls = join(root, "calls.log");
writeFileSync(join(stubs, "open"), `#!/bin/bash\nprintf 'open %s\\n' "$*" >> "${calls}"\n`);
writeFileSync(join(stubs, "osascript"), `#!/bin/bash\nprintf 'osascript %s\\n' "$*" >> "${calls}"\n`);
chmodSync(join(stubs, "open"), 0o755);
chmodSync(join(stubs, "osascript"), 0o755);
const port = 48000 + Math.floor(Math.random() * 800);
const chrome = join(root, "Google Chrome.app");
mkdirSync(chrome);

const env = (extra = {}) => ({ ...process.env, PATH: `${stubs}:${process.env.PATH}`, FORGE_HOME: work, FORGE_BASE_PORT: String(port), NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost", HTTP_PROXY: "", http_proxy: "", FORGE_IDLE_MS: "600000", ...extra });
const launch = (bundle, extra) => spawnSync(join(bundle, "Contents", "MacOS", "forge"), [], { env: env(extra), encoding: "utf8", timeout: 30000 });
// A fresh connection every time: fetch would otherwise reuse a socket the old server closed.
const health = async (p = port) => { for (let i = 0; i < 3; i++) { try { return await (await fetch(`http://127.0.0.1:${p}/healthz`, { headers: { Connection: "close" } })).json(); } catch { await new Promise((x) => setTimeout(x, 150)); } } return null; };
const log = () => (existsSync(calls) ? readFileSync(calls, "utf8") : "");
let n = 0;
const ok = (m) => { n++; console.log("  ok  " + m); };

try {
  const buildNow = readFileSync(join(app, "Contents", "Resources", "BUILD"), "utf8").trim();

  let r = launch(app, { FORGE_CHROME: chrome });
  assert.equal(r.status, 0, "first launch failed: " + r.stdout + r.stderr);
  const h = await health();
  assert.equal(h.app, "spartan-forge");
  assert.equal(h.build, buildNow);
  assert.ok(existsSync(join(work, "runtime", "server.mjs")), "program was not installed beside the data");
  assert.equal(readFileSync(join(work, "runtime", "BUILD"), "utf8").trim(), buildNow);
  assert.ok(existsSync(join(work, "data", "state.json")));
  ok(`first launch installs the program, starts the server (build ${buildNow}) and creates the data folder`);

  assert.match(log(), new RegExp(`open -na ${chrome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} --args --app=http://127.0.0.1:${port}/ .*--window-size=440,820`));
  ok("the window is opened in its own small Chrome app window");

  // A weight saved through the real page's API, to prove later steps keep it.
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  const token = /name="forge-token" content="([0-9a-f]+)"/.exec(html)[1];
  const save = await fetch(`http://127.0.0.1:${port}/api/weight`, { method: "POST", headers: { "X-Forge-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), kg: 106.75 }) });
  assert.equal(save.status, 200, await save.text());

  r = launch(app, { FORGE_CHROME: chrome });
  assert.equal(r.status, 0);
  const procs = String(execFileSync("ps", ["-eo", "args"], { encoding: "utf8" }).split("\n").filter((l) => !l.includes("bash") && l.includes(`${work}/runtime/server.mjs`)).length);
  assert.equal(procs, "1", "a second launch must reuse the running server");
  ok("a second launch reuses the running server (one process)");

  // An update: a different build number. The program is replaced, the records stay.
  const newer = join(root, "newer", "SPARTAN FORGE BATMAN.app");
  mkdirSync(join(root, "newer"));
  cpSync(app, newer, { recursive: true });
  writeFileSync(join(newer, "Contents", "Resources", "BUILD"), "9999\n");
  r = launch(newer, { FORGE_CHROME: chrome });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal((await health()).build, "9999");
  assert.equal(readFileSync(join(work, "runtime", "BUILD"), "utf8").trim(), "9999");
  const state = JSON.parse(readFileSync(join(work, "data", "state.json"), "utf8"));
  assert.equal(Object.values(state.weights)[0].kg, 106.75);
  ok("a newer build replaces the old program and keeps the records");

  // Going back to an older build must also take effect (the app in front of you is the truth).
  r = launch(app, { FORGE_CHROME: chrome });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal((await health()).build, buildNow);
  assert.equal(readFileSync(join(work, "runtime", "BUILD"), "utf8").trim(), buildNow);
  assert.equal(Object.values(JSON.parse(readFileSync(join(work, "data", "state.json"), "utf8")).weights)[0].kg, 106.75);
  ok("going back to the older build also takes effect, records untouched");

  // The server answers the launcher's quit request, and refuses anyone else.
  assert.equal((await fetch(`http://127.0.0.1:${port}/shutdown`, { method: "POST" })).status, 403);
  await fetch(`http://127.0.0.1:${port}/shutdown`, { method: "POST", headers: { "X-Forge-Launcher": "1" } });
  for (let i = 0; i < 20 && (await health()); i++) await new Promise((x) => setTimeout(x, 100));
  assert.equal(await health(), null);
  ok("the server quits only on the launcher's request");

  // No Chrome: falls back to the default browser, same URL.
  writeFileSync(calls, "");
  r = launch(app, { FORGE_CHROME: "/nonexistent/Chrome.app", HOME: join(root, "nohome") });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(log(), new RegExp(`open http://127.0.0.1:${port}/`));
  ok("without Chrome it opens the default browser instead");

  // A port taken by something else is skipped, not trampled.
  await fetch(`http://127.0.0.1:${port}/shutdown`, { method: "POST", headers: { "X-Forge-Launcher": "1" } }).catch(() => {});
  for (let i = 0; i < 20 && (await health()); i++) await new Promise((x) => setTimeout(x, 100));
  const { createServer } = await import("node:http");
  const squatter = createServer((q, s) => s.end("not me")).listen(port, "127.0.0.1");
  await new Promise((x) => squatter.once("listening", x));
  r = launch(app, { FORGE_CHROME: chrome });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal((await health(port + 1)).app, "spartan-forge");
  squatter.close();
  ok("a port already used by another program is skipped");

  // Node missing: a dialog, not a crash, and nothing started.
  await fetch(`http://127.0.0.1:${port + 1}/shutdown`, { method: "POST", headers: { "X-Forge-Launcher": "1" } }).catch(() => {});
  for (let i = 0; i < 40 && (await health(port + 1)); i++) await new Promise((x) => setTimeout(x, 100));
  writeFileSync(calls, "");
  const bare = join(root, "bare");
  mkdirSync(bare);
  for (const t of ["bash", "dirname", "tr", "cat", "mkdir", "rm", "cp", "mv", "curl", "sed", "grep", "sort", "ls", "sleep", "printf", "tail", "open", "osascript"]) {
    const found = t === "open" || t === "osascript" ? join(stubs, t) : execFileSync("bash", ["-c", `command -v ${t}`], { encoding: "utf8" }).trim();
    execFileSync("ln", ["-s", found, join(bare, t)]);
  }
  r = spawnSync(join(app, "Contents", "MacOS", "forge"), [], { env: { PATH: bare, FORGE_TEST_NO_NODE: "1", HOME: join(root, "nohome"), FORGE_HOME: join(root, "nonode"), FORGE_BASE_PORT: String(port + 20), SHELL: "/bin/false" }, encoding: "utf8", timeout: 20000 });
  assert.equal(r.status, 1);
  assert.match(log(), /osascript .*needs Node/);
  assert.match(log(), /open https:\/\/nodejs\.org/);
  ok("without Node it explains what to install and opens the download page");
  console.log(`\n${n} launcher checks passed`);
} catch (e) {
  try { console.log("--- forge.log ---\n" + readFileSync(join(work, "forge.log"), "utf8").slice(-1500)); console.log("--- calls ---\n" + log()); } catch {}
  throw e;
} finally {
  spawnSync("bash", ["-c", `pkill -f "${work}/runtime/server.mjs" 2>/dev/null; true`]);
}
