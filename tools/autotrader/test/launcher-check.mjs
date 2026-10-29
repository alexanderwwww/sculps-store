// Runs the PACKED Dock launcher the way the Mac would, with `open` and `osascript` replaced by recorders.
//   node test/launcher-check.mjs "<path to Ultra.app>"
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, cpSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const app = process.argv[2];
assert.ok(app && existsSync(app), "usage: launcher-check.mjs <app>");
const root = mkdtempSync(join(tmpdir(), "ultra-launch-"));
const work = join(root, "Application Support", "Ultra");
const stubs = join(root, "stubs"); mkdirSync(stubs, { recursive: true });
const calls = join(root, "calls.log");
for (const [n, l] of [["open", "open"], ["osascript", "osascript"]]) { writeFileSync(join(stubs, n), `#!/bin/bash\nprintf '${l} %s\\n' "$*" >> "${calls}"\n`); chmodSync(join(stubs, n), 0o755); }
const port = 48100 + Math.floor(Math.random() * 700);
const chrome = join(root, "Google Chrome.app"); mkdirSync(chrome);
const env = (extra = {}) => ({ ...process.env, PATH: `${stubs}:${process.env.PATH}`, ULTRA_HOME: work, ULTRA_BASE_PORT: String(port), ULTRA_LINK: "off", NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost", HTTP_PROXY: "", http_proxy: "", ...extra });
const launch = (bundle, extra) => spawnSync(join(bundle, "Contents", "MacOS", "ultra"), [], { env: env(extra), encoding: "utf8", timeout: 30000 });
const log = () => (existsSync(calls) ? readFileSync(calls, "utf8") : "");
const H = { connection: "close" };
const health = async (p) => (await fetch(`http://127.0.0.1:${p}/healthz`, { headers: H })).json();
const stop = (p) => fetch(`http://127.0.0.1:${p}/shutdown`, { method: "POST", headers: { ...H, "X-Ultra-Launcher": "1" } }).catch(() => {});
const ok = (m) => console.log("  ok  " + m);
const build = readFileSync(join(app, "Contents", "Resources", "BUILD"), "utf8").trim();

try {
  let r = launch(app, { ULTRA_CHROME: chrome });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const h = await health(port);
  assert.equal(h.app, "ultra"); assert.equal(h.build, build);
  ok(`first launch: the program is installed beside the data and the server answers (build ${h.build})`);
  assert.ok(existsSync(join(work, "runtime", "server.mjs")) && existsSync(join(work, "runtime", "lib", "engine.mjs")), "runtime installed");
  assert.match(log(), new RegExp(`open -na ${chrome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} --args --app=http://127.0.0.1:${port}/ `));
  ok("the window opens as its own Chrome app window at the right address");

  // the plugged-in Phantom key and the records survive a newer build. A freshly generated, empty key, written with the
  // packed app's own code; Stop is saved too, so no server here ever tries to trade it or reach the network.
  const data = join(work, "data");
  const { Secrets } = await import(pathToFileURL(join(app, "Contents", "Resources", "app", "lib", "secrets.mjs")).href);
  const jwk = crypto.generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
  const { b58encode } = await import(pathToFileURL(join(app, "Contents", "Resources", "app", "lib", "solana.mjs")).href);
  const secret = b58encode(Buffer.concat([Buffer.from(jwk.d, "base64url"), Buffer.from(jwk.x, "base64url")]));
  new Secrets(data).importWallet(secret);
  writeFileSync(join(data, "config.json"), JSON.stringify({ userStopped: true }));
  const secretsBefore = readFileSync(join(data, "secrets.json"), "utf8");
  r = launch(app, { ULTRA_CHROME: chrome });
  assert.equal(r.status, 0); assert.equal((await health(port)).app, "ultra");
  ok("opening it again reuses the running server");
  const newer = join(root, "newer", "Ultra.app"); mkdirSync(join(root, "newer"), { recursive: true }); cpSync(app, newer, { recursive: true });
  writeFileSync(join(newer, "Contents", "Resources", "BUILD"), String(Number(build) + 1) + "\n");
  r = launch(newer, { ULTRA_CHROME: chrome });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((await health(port)).build, String(Number(build) + 1));
  assert.equal(readFileSync(join(work, "runtime", "BUILD"), "utf8").trim(), String(Number(build) + 1));
  ok("a newer build replaces the old server and program");
  assert.equal(readFileSync(join(data, "secrets.json"), "utf8"), secretsBefore);
  assert.equal(statSync(join(data, "secrets.json")).mode & 0o777, 0o600);
  assert.equal(new Secrets(data).imported, true);
  assert.ok(!/PRIVATE KEY/.test(readFileSync(join(work, "ultra.log"), "utf8")) && !readFileSync(join(work, "ultra.log"), "utf8").includes(secret), "no key in the log");
  ok("the plugged-in Phantom wallet is still there after the upgrade (the data folder is never touched)");
  r = launch(app, { ULTRA_CHROME: chrome });
  assert.equal(r.status, 0); assert.equal((await health(port)).build, build);
  ok("an OLDER bundle also wins: the app in front of you is the truth (no stale-cache trap)");
  await stop(port); await new Promise((x) => setTimeout(x, 400));

  // no Chrome: the default browser
  r = launch(app, { ULTRA_CHROME: "/nonexistent/Chrome.app", HOME: join(root, "nohome") });
  assert.equal(r.status, 0, r.stderr);
  assert.match(log(), new RegExp(`open http://127.0.0.1:${port}/\\n`));
  ok("with no Chrome it opens the default browser instead");
  await stop(port); await new Promise((x) => setTimeout(x, 400));

  // no Node
  const bare = join(root, "bare"); mkdirSync(bare); for (const n of ["bash", "sed", "tr", "cat", "mkdir", "rm", "mv", "cp", "curl", "grep", "sleep", "dirname", "ls", "sort"]) { const w = spawnSync("bash", ["-c", `command -v ${n}`], { encoding: "utf8" }).stdout.trim(); if (w) { try { writeFileSync(join(bare, n), `#!/bin/bash\nexec ${w} "$@"\n`); chmodSync(join(bare, n), 0o755); } catch {} } }
  writeFileSync(join(bare, "open"), `#!/bin/bash\nprintf 'open %s\\n' "$*" >> "${calls}"\n`); chmodSync(join(bare, "open"), 0o755);
  writeFileSync(join(bare, "osascript"), `#!/bin/bash\nprintf 'osascript %s\\n' "$*" >> "${calls}"\n`); chmodSync(join(bare, "osascript"), 0o755);
  r = spawnSync(join(app, "Contents", "MacOS", "ultra"), [], { env: { PATH: bare, ULTRA_TEST_NO_NODE: "1", HOME: join(root, "nohome"), ULTRA_HOME: join(root, "nonode"), ULTRA_BASE_PORT: String(port + 20), SHELL: "/bin/false" }, encoding: "utf8", timeout: 20000 });
  assert.notEqual(r.status, 0);
  assert.match(log(), /osascript .*needs Node/);
  ok("without Node it explains what to install, in a normal Mac dialog");
  console.log("\nlauncher checks passed");
} catch (e) {
  console.log("FAIL  " + (e.message || e), e.cause?.code || "", (e.stack || "").split("\n").slice(1, 3).join(" "));
  try { console.log("--- ultra.log ---\n" + readFileSync(join(work, "ultra.log"), "utf8").slice(-1500)); console.log("--- calls ---\n" + log()); } catch {}
  await stop(port); process.exit(1);
}
await stop(port).catch(() => {});
process.exit(0);
