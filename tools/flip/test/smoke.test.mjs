/**
 * Boot the packed worker and watch it, the way his Mac does.
 *
 * This exists because I shipped a build that died on launch with
 * `cloud.knowledge is not a function` — one call added in one file, the method
 * never added to the other, and nothing between my keyboard and his Dock ever
 * ran the thing. Every check I had was a syntax check, and syntax was never
 * the problem.
 *
 * So this runs the worker out of the bundle, from a directory with a space in
 * its name, exactly as the launcher does, and holds it to three facts:
 *
 *   1. it stays up — no exit, for long enough that an import-time or
 *      first-tick crash would have happened
 *   2. it prints its port, which means the bridge bound
 *   3. /agent.js answers 200, which means the page can be dressed
 *
 * The network is not reachable here, so every cloud call fails. That is the
 * point: a worker that cannot phone home must still run. If one of those
 * rejections is unhandled, this catches it as an exit.
 *
 *   node test/smoke.test.mjs <bundle worker dir>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, cpSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";

/* Everything is resolved from this file, never from the working directory —
   pack.sh runs it from wherever it happens to be, and a test that only passes
   when you are standing in the right folder is a test that lies. */
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const from = process.argv[2] || join(ROOT, "app/Flip.app/Contents/Resources/worker");
assert.ok(existsSync(join(from, "main.mjs")), `no worker at ${from}`);

// The space is deliberate: "Application Support" is where this runs, and a
// path helper that cannot cope with it has broken this app twice.
const root = mkdtempSync(join(tmpdir(), "flip-smoke-"));
const home = join(root, "Application Support", "Flip");
const dir = join(home, "worker");
cpSync(from, dir, { recursive: true });

// `ws` is the worker's only dependency and the launcher installs it there.
const deps = ["worker/node_modules", "node_modules", "../../node_modules"]
  .map((p) => resolve(ROOT, p))
  .find((p) => existsSync(join(p, "ws")));
assert.ok(deps, "cannot find ws to link — run npm install first");
symlinkSync(deps, join(dir, "node_modules"));

const child = spawn(process.execPath, ["main.mjs"], {
  cwd: dir,
  env: { ...process.env, FLIP_PORT: "0", FLIP_HOME: home },
  stdio: ["ignore", "pipe", "pipe"],
});

let out = "";
let port = null;
child.stdout.on("data", (d) => {
  out += d;
  const m = /PORT (\d+)/.exec(out);
  if (m) port = Number(m[1]);
});
child.stderr.on("data", (d) => { out += d; });

const died = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
const waited = new Promise((resolve) => setTimeout(() => resolve("alive"), 6000));
const result = await Promise.race([died, waited]);

if (result !== "alive") {
  console.error(out.trim());
  console.error(`\n  FAIL  the worker exited with code ${result} — it would do that on his Mac`);
  process.exit(1);
}

assert.ok(port, `the worker never printed a port:\n${out}`);

const res = await fetch(`http://127.0.0.1:${port}/agent.js`).catch((e) => ({ status: 0, error: e }));
child.kill();
if (res.status !== 200) {
  console.error(out.trim());
  console.error(`\n  FAIL  /agent.js answered ${res.status}`);
  process.exit(1);
}

// A crash that is caught and logged is still a crash worth seeing.
for (const bad of ["is not a function", "Cannot find module", "ERR_MODULE_NOT_FOUND", "undefined is not"]) {
  if (out.includes(bad)) {
    console.error(out.trim());
    console.error(`\n  FAIL  "${bad}" in the worker's own output`);
    process.exit(1);
  }
}

console.log(`  ok  the worker stays up on a path with a space, port ${port}, /agent.js 200`);
