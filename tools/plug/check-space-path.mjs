/**
 * The worker runs from a path with a space in it — proved, not hoped.
 *
 * It lives in "~/Library/Application Support/Plug/worker", and that space has
 * already broken an app of his once. `new URL(".", import.meta.url).pathname`
 * percent-encodes it, so the bridge went looking for agent.built.js under
 * "Application%20Support", never found it, and answered 500 — while listening
 * perfectly well on its port. From the outside: an app that opens and does
 * nothing, with a worker that is completely healthy.
 *
 * So the worker is copied to a directory whose name contains a space, started
 * there, and actually asked for the file. Anything less than fetching it is not
 * a test of this: the bug is in resolving the path, and only a real read finds
 * it.
 *
 * Usage: node check-space-path.mjs <worker dir>
 */
import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("usage: node check-space-path.mjs <worker dir>");
  process.exit(1);
}

const base = await mkdtemp(join(tmpdir(), "plug-space-"));
/* The space is the whole point of the directory name. */
const home = join(base, "Application Support", "Plug");
const worker = join(home, "worker");
await cp(source, worker, { recursive: true });

/*
 * Install what it needs, exactly as the launcher does on his Mac.
 *
 * The packed worker ships without node_modules — it is installed beside the
 * app on first run, not carried in the zip. So the copy here has none either,
 * and a check that skipped this would be testing a worker that cannot start
 * for a reason that has nothing to do with the space in the path.
 */
const haveDeps = await stat(join(worker, "node_modules", "ws")).then(() => true, () => false);
if (!haveDeps) {
  const installed = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: worker, stdio: "ignore",
  });
  if (installed.status !== 0) {
    console.error("FAIL  could not install what the worker needs");
    process.exit(1);
  }
}

const child = spawn(process.execPath, ["main.mjs"], {
  cwd: worker,
  env: { ...process.env, PLUG_HOME: home, PLUG_PORT: "0", PLUG_ROUND_MS: "600000" },
  stdio: ["ignore", "pipe", "pipe"],
});

let port = null;
let noise = "";
child.stdout.on("data", (chunk) => {
  noise += String(chunk);
  const found = /PORT (\d+)/.exec(noise);
  if (found) port = Number(found[1]);
});
child.stderr.on("data", (chunk) => { noise += String(chunk); });

const until = Date.now() + 15000;
while (!port && Date.now() < until && child.exitCode === null) {
  await new Promise((go) => setTimeout(go, 100));
}

async function done(ok, why) {
  try { child.kill(); } catch { /* already gone */ }
  await rm(base, { recursive: true, force: true }).catch(() => {});
  if (ok) {
    console.log(`  ok  ${why}`);
    process.exit(0);
  }
  console.error(`FAIL  ${why}`);
  if (noise.trim()) console.error(noise.trim().split("\n").slice(-6).join("\n"));
  process.exit(1);
}

if (!port) await done(false, "the worker never came up from a path with a space");

/* The read that actually exercises the bug. */
let served = null;
try {
  const res = await fetch(`http://127.0.0.1:${port}/agent.js`);
  served = res.status;
  const body = await res.text();
  if (res.ok && body.includes("__organicNS")) {
    await done(true, `the worker serves its own code from a path with a space (port ${port})`);
  }
  await done(false, `/agent.js answered ${served} from a path with a space`);
} catch (error) {
  await done(false, `/agent.js could not be read: ${error.message}`);
}
