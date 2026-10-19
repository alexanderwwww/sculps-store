// pack.test.mjs: pack.sh and run.command, driven for real.
//
// pack.sh is what makes the zip that lands on his Mac, and run.command is the
// first thing that runs there. Neither may reach him unrun (AGENTS rules 1-3),
// so this test:
//
//   1. packs a copy of this folder with a small made-up src/ and checks the zip
//      from the outside, with code that shares nothing with pack.sh: exec bits
//      as the zip stores them, the plist read as a plist, ONE build number
//      everywhere, every src file byte for byte, node --check on every script,
//      a real .icns, the Dock launcher asking Terminal for run.command;
//   2. proves pack.sh refuses to make a zip when a test fails, a script does
//      not parse, a file SPEC.md lists is missing, an import would not resolve
//      on his Mac, a path is built with .pathname, the BUILD anchor is doubled;
//   3. runs the PACKED run.command, under every bash it is given (macOS ships
//      bash 3.2.57: pass one as ULTRA_TEST_BASH), against a fake Chrome and a
//      stub runner, through its whole loop: first launch (install once, open
//      Chrome on TikTok, restart on 97 with the build from build.txt), second
//      launch (bundle is truth in either direction, nothing reinstalled, Chrome
//      not reopened), a crash exit, a package bump, the one-at-a-time rules and
//      a Mac without Chrome;
//   4. packs a copy of the REAL folder (real src/, real BUILD) and checks that
//      zip the same way.
//
// Never needs the network and never opens a real browser.
// Env: ULTRA_REPO  repo root (default two levels up), as for pack.sh
//      ULTRA_TEST_BASH  another bash to run run.command with (e.g. 3.2.57)
//      ULTRA_ICON_PREVIEW  write the packed icon's 1024px PNG here, to look at
//      ULTRA_KEEP=1  keep the temp folder

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = process.env.ULTRA_REPO || path.resolve(HERE, "../..");
const BASHES = ["bash", ...(process.env.ULTRA_TEST_BASH ? [process.env.ULTRA_TEST_BASH] : [])];
// The runner modules SPEC.md lists; pack.sh refuses a bundle without them.
const REQUIRED = [
  "ultra.mjs", "cloud.mjs", "ui.mjs", "overlay.js", "signals.mjs", "q4.mjs", "report.mjs",
  "sites/adlibrary.mjs", "sites/tiktok.mjs", "sites/instagram.mjs", "sites/trends.mjs", "sites/stores.mjs",
  "skills/q4.md", "package.json",
];

const T = fs.mkdtempSync(path.join(os.tmpdir(), "uc-pack-test-"));
const children = [];
let passed = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failures.push(name); console.log(`FAIL  ${name}${detail ? `\n      ${String(detail).split("\n").join("\n      ")}` : ""}`); }
}
const section = (s) => console.log(`\n== ${s}`);
const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 300000, ...opts });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || ""), error: r.error };
};
const bashName = (sh) => `bash ${run(sh, ["-c", "echo $BASH_VERSION"]).out.trim()}`;
const tail = (s, n = 12) => s.trim().split("\n").slice(-n).join("\n");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const relFiles = (d) => walk(d).map((f) => path.relative(d, f)).sort();
const write = (p, s, mode) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); if (mode) fs.chmodSync(p, mode); };
const freePort = () => new Promise((res, rej) => {
  const s = net.createServer(); s.unref(); s.on("error", rej);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});

// ---------------------------------------------------------------- the copy

// A made-up runner with the shape SPEC.md gives it: relative imports between
// modules, sites/ and skills/ subfolders, overlay.js read by path, and the one
// package (playwright-core) imported bare.
const FAKE_SRC = {
  "package.json": JSON.stringify({ type: "module", dependencies: { "playwright-core": "1.63.0" } }, null, 2) + "\n",
  "ultra.mjs": 'import { ping } from "./cloud.mjs";\nimport { sweep } from "./sites/tiktok.mjs";\nconsole.log(ping(), typeof sweep);\n',
  "cloud.mjs": 'export const ping = () => "pong";\n',
  "ui.mjs": 'import { readFileSync } from "node:fs";\nimport { fileURLToPath } from "node:url";\nexport const overlay = readFileSync(fileURLToPath(new URL("./overlay.js", import.meta.url)), "utf8");\n',
  "overlay.js": "(() => { window.__uc = { build() {} }; })();\n",
  "signals.mjs": "export const signals = (t) => (/where (do|can) i (get|buy)/i.test(t) ? 1 : 0);\n",
  "q4.mjs": 'export const BFCM = "2026-11-27";\n',
  "report.mjs": 'import { signals } from "./signals.mjs";\nexport const buildReport = () => ({ signals: signals("") });\n',
  "sites/adlibrary.mjs": 'import { chromium } from "playwright-core";\nexport async function sweep() { return { source: "adlibrary", ok: typeof chromium.connectOverCDP }; }\n',
  "sites/tiktok.mjs": 'import { signals } from "../signals.mjs";\nexport async function sweep() { return { source: "tiktok", n: signals("") }; }\n',
  "sites/instagram.mjs": 'export async function sweep() { return { source: "instagram" }; }\n',
  "sites/trends.mjs": 'export async function sweep() { return { source: "trends" }; }\n',
  "sites/stores.mjs": 'export async function sweep() { return { source: "stores" }; }\n',
  "skills/q4.md": "# Q4\nBFCM 27-30 Nov 2026.\n",
  "skills/goals.md": "budget: 50\n",
};
const PASSING_TEST = 'console.log("trivial test ran");\n';

// A copy of this folder: the real run.command, pack.sh, app/ and BUILD, with
// src/ either made up or the real one, and a test/ that holds only what the
// case needs (never this file: pack.sh would start itself again).
function makeCopy(name, { realSrc = false, build = null, tests = { "ok.test.mjs": PASSING_TEST } } = {}) {
  const dir = path.join(T, name, "ultracursor");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ["run.command", "pack.sh", "BUILD"]) fs.cpSync(path.join(HERE, f), path.join(dir, f));
  fs.cpSync(path.join(HERE, "app"), path.join(dir, "app"), { recursive: true });
  if (realSrc) {
    fs.cpSync(path.join(HERE, "src"), path.join(dir, "src"), {
      recursive: true, filter: (s) => !/(^|\/)(node_modules|\.DS_Store)$/.test(s),
    });
  } else {
    for (const [rel, body] of Object.entries(FAKE_SRC)) write(path.join(dir, "src", rel), body);
  }
  for (const [rel, body] of Object.entries(tests)) write(path.join(dir, "test", rel), body);
  if (build != null) fs.writeFileSync(path.join(dir, "BUILD"), `${build}\n`);
  return dir;
}

const pack = (dir, out, env = {}) => run("bash", [path.join(dir, "pack.sh"), out], {
  cwd: dir, env: { ...process.env, ULTRA_REPO: REPO, TMPDIR: "/tmp", ...env },
});

// ---------------------------------------------------------------- the zip, from the outside

function plist(file) {
  const r = run("python3", ["-c", "import json,plistlib,sys; print(json.dumps(plistlib.load(open(sys.argv[1],'rb'))))", file]);
  try { return JSON.parse(r.out); } catch { return { error: r.out }; }
}

function icns(file) {
  const d = fs.readFileSync(file);
  const chunks = {};
  if (d.subarray(0, 4).toString("latin1") !== "icns") return { error: "no icns magic" };
  if (d.readUInt32BE(4) !== d.length) return { error: "icns length field is wrong" };
  for (let i = 8; i < d.length;) {
    const type = d.subarray(i, i + 4).toString("latin1");
    const n = d.readUInt32BE(i + 4);
    const png = d.subarray(i + 8, i + n);
    const isPng = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    chunks[type] = { png, w: isPng ? png.readUInt32BE(16) : 0, h: isPng ? png.readUInt32BE(20) : 0 };
    if (n < 8) return { error: `chunk ${type} has length ${n}` };
    i += n;
  }
  return { chunks };
}

// Everything his Mac will meet, checked on the zip itself and on an unzip of it
// into a folder whose path has a space ("Application Support" has one).
function checkZip(label, zip, srcDir, build) {
  check(`${label}: the zip exists`, exists(zip));
  if (!exists(zip)) return null;

  // The modes Archive Utility will apply are the ones stored in the zip.
  const info = run("unzip", ["-Z", zip]).out.split("\n");
  const entry = (p) => info.find((l) => l.trim().endsWith(` ${p}`)) || "";
  for (const p of ["ultracursor.app/Contents/MacOS/ultracursor", "ultracursor.app/Contents/Resources/run.command"]) {
    const l = entry(p);
    check(`${label}: ${p.split("/").pop()} is stored executable, as a Unix entry`,
      /^-rwxr-xr-x\s+\S+\s+unx\b/.test(l), l || "(not in the zip)");
  }
  const names = run("unzip", ["-Z1", zip]).out.trim().split("\n");
  check(`${label}: the zip holds ultracursor.app and nothing beside it`,
    names.length > 0 && names.every((n) => n.startsWith("ultracursor.app/")), names.filter((n) => !n.startsWith("ultracursor.app/")).join(", "));
  check(`${label}: no node_modules, no .DS_Store in the zip`, !names.some((n) => /node_modules|\.DS_Store/.test(n)));

  const into = path.join(T, `${label} unzip`, "Application Support");
  fs.mkdirSync(into, { recursive: true });
  const uz = run("unzip", ["-q", zip, "-d", into]);
  check(`${label}: unzips`, uz.code === 0, uz.out);
  const C = path.join(into, "ultracursor.app", "Contents");
  const R = path.join(C, "Resources");
  const X = (p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } };
  check(`${label}: MacOS/ultracursor is executable after unzip`, X(path.join(C, "MacOS", "ultracursor")));
  check(`${label}: Resources/run.command is executable after unzip`, X(path.join(R, "run.command")));

  const p = plist(path.join(C, "Info.plist"));
  const want = {
    CFBundleName: "ultracursor", CFBundleDisplayName: "ultracursor", CFBundleExecutable: "ultracursor",
    CFBundleIdentifier: "com.blackreaper.ultracursor", CFBundleIconFile: "AppIcon", CFBundlePackageType: "APPL",
    CFBundleVersion: String(build), CFBundleShortVersionString: String(build),
  };
  const bad = Object.entries(want).filter(([k, v]) => p[k] !== v).map(([k, v]) => `${k}=${JSON.stringify(p[k])} want ${JSON.stringify(v)}`);
  check(`${label}: Info.plist says ultracursor, com.blackreaper.ultracursor, build ${build}`, bad.length === 0, bad.join("; ") || p.error);
  check(`${label}: the executable the plist names is the one in MacOS/`, exists(path.join(C, "MacOS", p.CFBundleExecutable || "?")));

  const rc = read(path.join(R, "run.command"));
  const lines = rc.split("\n").filter((l) => /^BUILD=/.test(l));
  check(`${label}: run.command says BUILD="${build}" exactly once`, lines.length === 1 && lines[0] === `BUILD="${build}"`, lines.join(" | "));
  for (const sh of BASHES) {
    for (const f of [path.join(R, "run.command"), path.join(C, "MacOS", "ultracursor")]) {
      const r = run(sh, ["-n", f]);
      check(`${label}: ${path.basename(f)} parses under ${bashName(sh)}`, r.code === 0, r.out);
    }
  }

  const src = relFiles(srcDir).filter((f) => !/(^|\/)(node_modules|\.DS_Store)(\/|$)/.test(f));
  const missing = src.filter((f) => !exists(path.join(R, f)) || !fs.readFileSync(path.join(R, f)).equals(fs.readFileSync(path.join(srcDir, f))));
  check(`${label}: all ${src.length} src files are in Resources, byte for byte`, missing.length === 0, missing.join(", "));
  const extra = relFiles(R).filter((f) => !src.includes(f) && f !== "run.command" && f !== "AppIcon.icns");
  check(`${label}: nothing in Resources nobody put there`, extra.length === 0, extra.join(", "));
  const absent = REQUIRED.filter((f) => !exists(path.join(R, f)));
  check(`${label}: every runner file SPEC.md lists is inside`, absent.length === 0, absent.join(", "));

  const scripts = relFiles(R).filter((f) => /\.(m?js)$/.test(f));
  const broken = scripts.filter((f) => run(process.execPath, ["--check", path.join(R, f)]).code !== 0);
  check(`${label}: node --check passes on all ${scripts.length} .mjs/.js inside`, scripts.length > 0 && broken.length === 0, broken.join(", "));

  const ic = icns(path.join(R, "AppIcon.icns"));
  const sizes = { ic10: 1024, ic14: 512, ic13: 256, ic09: 512, ic08: 256, ic07: 128, ic12: 64, ic11: 32 };
  const wrong = ic.error ? [ic.error] : Object.entries(sizes)
    .filter(([t, s]) => !ic.chunks[t] || ic.chunks[t].w !== s || ic.chunks[t].h !== s).map(([t, s]) => `${t} want ${s}`);
  check(`${label}: AppIcon.icns is an icns with all 8 PNG sizes`, wrong.length === 0, wrong.join(", "));

  // The Dock icon: run the packed launcher with a stand-in for macOS's open.
  const fake = path.join(T, `${label} fakebin`);
  write(path.join(fake, "open"), '#!/bin/bash\nprintf "%s\\n" "$@" > "$OPEN_LOG"\n', 0o755);
  for (const sh of BASHES) {
    const log = path.join(fake, "open.log");
    fs.rmSync(log, { force: true });
    const r = run(sh, [path.join(C, "MacOS", "ultracursor")], { env: { ...process.env, PATH: `${fake}:${process.env.PATH}`, OPEN_LOG: log } });
    const got = exists(log) ? read(log) : "";
    check(`${label}: under ${bashName(sh)} the Dock icon opens Terminal on the packed run.command`,
      r.code === 0 && got === `-a\nTerminal\n${path.join(R, "run.command")}\n`, got || r.out);
  }
  return { C, R, icon: ic.chunks?.ic10?.png };
}

// ---------------------------------------------------------------- run.command, driven

const FAKE_CDP = `
const http = require("http"), fs = require("fs");
const [port, pidFile] = process.argv.slice(2);
http.createServer((q, s) => {
  if (q.url.startsWith("/json/version")) { s.setHeader("content-type", "application/json"); s.end('{"Browser":"FakeChrome/1"}'); }
  else { s.statusCode = 404; s.end(); }
}).listen(Number(port), "127.0.0.1", () => fs.writeFileSync(pidFile, String(process.pid)));
`;

// What ultra.mjs does as far as run.command can tell: it runs in WORK, reads
// ULTRA_BUILD, and exits. Each launch follows a plan of exit codes; a 97 first
// writes build.txt the way a self-update does.
const STUB_ULTRA = `
import fs from "node:fs";
const log = process.env.UC_LOG;
const runs = fs.existsSync(log + "/runs.log") ? fs.readFileSync(log + "/runs.log", "utf8").trim().split("\\n").filter(Boolean).length : 0;
fs.appendFileSync(log + "/runs.log", JSON.stringify({
  build: process.env.ULTRA_BUILD ?? null, cwd: process.cwd(), node: process.version,
  files: fs.readdirSync(".").sort(), sites: fs.existsSync("sites") ? fs.readdirSync("sites").sort() : null,
}) + "\\n");
const plan = (fs.existsSync(log + "/plan") ? fs.readFileSync(log + "/plan", "utf8") : "0").trim().split(/\\s+/);
const step = plan[runs] ?? "0";
if (step === "hang") setInterval(() => {}, 1000);
else { if (step === "97") fs.writeFileSync("build.txt", process.env.UC_NEXT_BUILD + "\\n"); process.exit(Number(step)); }
`;

async function runCommandCases(sh, packedRunCommand, build) {
  const tag = bashName(sh);
  const base = path.join(T, `run.command ${tag}`);
  const HOME = path.join(base, "home");
  const WORK = path.join(HOME, "Library", "Application Support", "ultracursor", "runtime");
  const LOG = path.join(base, "log");
  // The bundle sits under a path with a space too, like a translocated app.
  const RES = path.join(base, "Downloaded Apps", "ultracursor.app", "Contents", "Resources");
  const BIN = path.join(base, "bin");
  fs.mkdirSync(HOME, { recursive: true });
  fs.mkdirSync(LOG, { recursive: true });
  write(path.join(RES, "run.command"), read(packedRunCommand), 0o755);
  write(path.join(RES, "ultra.mjs"), STUB_ULTRA);
  write(path.join(RES, "package.json"), FAKE_SRC["package.json"]);
  write(path.join(RES, "sites", "a.mjs"), "export const v = 1;\n");
  write(path.join(RES, "skills", "q4.md"), "# Q4\n");
  write(path.join(RES, "AppIcon.icns"), "icns");
  // node, npm and open as his Mac would have them, except npm and open record
  // what they were asked instead of reaching the network or the desktop.
  fs.mkdirSync(BIN, { recursive: true });
  fs.symlinkSync(process.execPath, path.join(BIN, "node"));
  // The fake npm installs every dependency package.json lists, at the listed
  // version (playwright-core at UC_NPM_VERSION when set), except the ones named
  // in UC_NPM_SKIP: an install that silently leaves one out.
  write(path.join(BIN, "npm"), `#!/bin/bash
printf '%s|%s\\n' "$PWD" "$*" >> "$UC_LOG/npm.log"
node -e '
const fs = require("fs"), path = require("path");
const deps = require(path.resolve("package.json")).dependencies || {};
const skip = (process.env.UC_NPM_SKIP || "").split(",").filter(Boolean);
for (const [n, v] of Object.entries(deps)) {
  if (skip.includes(n)) continue;
  const d = path.join("node_modules", n);
  fs.mkdirSync(d, { recursive: true });
  const ver = n === "playwright-core" && process.env.UC_NPM_VERSION ? process.env.UC_NPM_VERSION : v;
  fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: n, version: ver }) + "\\n");
}'
`, 0o755);
  write(path.join(BIN, "open"), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$UC_LOG/open.log"\n', 0o755);
  write(path.join(LOG, "cdp.cjs"), FAKE_CDP);
  write(path.join(base, "chrome"), `#!/bin/bash
printf '%s\\n' "$@" > "$UC_LOG/chrome.args"
for a in "$@"; do case "$a" in --remote-debugging-port=*) port="\${a#*=}" ;; esac; done
exec node "$UC_LOG/cdp.cjs" "$port" "$UC_LOG/chrome.pid"
`, 0o755);

  const PORT = await freePort();
  const env = (extra = {}) => ({
    ...process.env, HOME, PATH: `${BIN}:${process.env.PATH}`, SHELL: "/bin/bash", UC_LOG: LOG, UC_NEXT_BUILD: String(build + 1),
    ULTRA_TEST_PORT: String(PORT), ULTRA_TEST_CHROME: path.join(base, "chrome"), ...extra,
  });
  const launch = (plan, extra) => {
    fs.writeFileSync(path.join(LOG, "plan"), plan);
    fs.rmSync(path.join(LOG, "runs.log"), { force: true });
    const r = run(sh, [path.join(RES, "run.command")], { env: env(extra), timeout: 90000 });
    const runs = exists(path.join(LOG, "runs.log")) ? read(path.join(LOG, "runs.log")).trim().split("\n").map((l) => JSON.parse(l)) : [];
    return { ...r, runs };
  };
  const lines = (f) => (exists(path.join(LOG, f)) ? read(path.join(LOG, f)).trim().split("\n").filter(Boolean) : []);
  const cdpUp = () => new Promise((res) => {
    const q = http.get({ host: "127.0.0.1", port: PORT, path: "/json/version", timeout: 1000 }, (s) => { s.resume(); res(s.statusCode === 200); });
    q.on("error", () => res(false)); q.on("timeout", () => { q.destroy(); res(false); });
  });
  const killChrome = async () => {
    const pidf = path.join(LOG, "chrome.pid");
    if (exists(pidf)) { try { process.kill(Number(read(pidf)), "SIGTERM"); } catch {} fs.rmSync(pidf); }
    for (let i = 0; i < 50 && (await cdpUp()); i++) await new Promise((r) => setTimeout(r, 100));
  };
  const say = (s) => `[${tag}] ${s}`;

  // 1. First launch on a Mac that has never run it.
  let r = launch("97 0");
  const npm = lines("npm.log");
  check(say("first launch: exits 0 after the runner's second run"), r.code === 0, tail(r.out));
  check(say("first launch: npm install --omit=dev, once, in WORK (under Application Support)"),
    npm.length === 1 && npm[0] === `${WORK}|install --omit=dev --no-audit --no-fund`, npm.join("\n"));
  const args = lines("chrome.args");
  check(say("first launch: Chrome opened on TikTok with port, its own profile, no first-run screens"),
    JSON.stringify(args) === JSON.stringify([`--remote-debugging-port=${PORT}`, `--user-data-dir=${HOME}/.ultracursor-chrome`,
      "--no-first-run", "--no-default-browser-check", "https://www.tiktok.com/"]), args.join(" "));
  check(say(`first launch: runner ran in WORK as build ${build}, then as build ${build + 1} after exit 97`),
    r.runs.length === 2 && r.runs[0].build === String(build) && r.runs[1].build === String(build + 1)
      && r.runs.every((x) => x.cwd === WORK), JSON.stringify(r.runs.map((x) => [x.build, x.cwd])));
  check(say("first launch: scripts copied in, sites/ and skills/ included, run.command and the icon not"),
    ["package.json", "sites", "skills", "ultra.mjs", "node_modules"].every((f) => r.runs[0]?.files.includes(f))
      && !r.runs[0]?.files.includes("run.command") && !r.runs[0]?.files.includes("AppIcon.icns")
      && exists(path.join(WORK, "skills", "q4.md")) && exists(path.join(WORK, "sites", "a.mjs")), JSON.stringify(r.runs[0]?.files));
  check(say(`first launch: Terminal title says "ultracursor · build ${build}", then "build ${build + 1}"`),
    r.out.includes(`\x1b]0;ultracursor · build ${build}\x07`) && r.out.includes(`\x1b]0;ultracursor · build ${build + 1}\x07`));
  check(say("first launch: says the update happened, and to sign into TikTok, Instagram and Facebook once"),
    r.out.includes(`Updated to build ${build + 1}.`) && r.out.includes("Sign into TikTok, Instagram and Facebook once in that Chrome window."));
  check(say("first launch: never asks him to type, paste or press anything in this window"),
    !/\b(type|paste|press any key|press return|press enter|terminal)\b/i.test(r.out), r.out.match(/.*\b(type|paste|press|terminal)\b.*/i)?.[0]);
  check(say("first launch: pid and loop markers cleaned up on exit"),
    !exists(path.join(WORK, "runner.pid")) && !exists(path.join(WORK, "runner.looping")));
  check(say("first launch: Chrome is left open"), await cdpUp());

  // 2. Second launch: Chrome still open, and WORK holds what a self-update to
  // a newer build left behind. The bundle wins, in either direction.
  write(path.join(WORK, "old.mjs"), "export {};\n");
  write(path.join(WORK, "sites", "stale.mjs"), "export {};\n");
  write(path.join(WORK, ".next", "ultra.mjs"), "half a download\n");
  write(path.join(WORK, "build.txt"), `${build + 5}\n`);
  write(path.join(WORK, "state.json"), '{"lastHuntId":"h1","lastReportAt":null}\n');
  write(path.join(RES, "sites", "a.mjs"), "export const v = 2;\n");
  fs.rmSync(path.join(LOG, "chrome.args"), { force: true });
  r = launch("0");
  check(say("second launch: exits 0"), r.code === 0, tail(r.out));
  check(say("second launch: nothing reinstalled"), lines("npm.log").length === 1, lines("npm.log").join("\n"));
  check(say("second launch: Chrome already up, not opened again"),
    !exists(path.join(LOG, "chrome.args")) && r.out.includes("Chrome is already open and ready."));
  check(say(`second launch: runs as the bundle's build ${build}, not build.txt's ${build + 5}`),
    r.runs.length === 1 && r.runs[0].build === String(build), JSON.stringify(r.runs));
  check(say("second launch: a script the bundle does not have is gone, top level and in sites/"),
    !exists(path.join(WORK, "old.mjs")) && JSON.stringify(r.runs[0]?.sites) === '["a.mjs"]', JSON.stringify(r.runs[0]?.sites));
  check(say("second launch: the bundle's sites/a.mjs replaced the old one"), exists(path.join(WORK, "sites", "a.mjs")) && read(path.join(WORK, "sites", "a.mjs")).includes("v = 2"));
  check(say("second launch: half-done update (.next) and the old build.txt cleared, state.json and node_modules kept"),
    !exists(path.join(WORK, ".next")) && !r.runs[0]?.files.includes("build.txt") && read(path.join(WORK, "state.json")).includes('"h1"')
      && exists(path.join(WORK, "node_modules", "playwright-core", "package.json")));

  // 3. Any exit other than 97 ends the sitting with that code.
  r = launch("3 0");
  check(say("runner exits 3: not restarted, run.command exits 3 and says it stopped"),
    r.code === 3 && r.runs.length === 1 && r.out.includes(`ultracursor has stopped (build ${build}).`), `code ${r.code}, runs ${r.runs.length}\n${tail(r.out, 4)}`);

  // 4. A bundle that asks for another playwright-core version installs again.
  const pj = path.join(RES, "package.json");
  write(pj, JSON.stringify({ type: "module", dependencies: { "playwright-core": "1.64.0" } }));
  r = launch("0", { UC_NPM_VERSION: "1.64.0" });
  check(say("package.json asks for a new playwright-core: installed again"), r.code === 0 && lines("npm.log").length === 2, lines("npm.log").join("\n"));
  r = launch("0", { UC_NPM_VERSION: "1.64.0" });
  check(say("and not again on the launch after"), r.code === 0 && lines("npm.log").length === 2, lines("npm.log").join("\n"));
  write(pj, FAKE_SRC["package.json"]);

  // 4b. Build 2 adds Claude's SDK beside Playwright: a bundle that lists a new
  // library installs again, once; an install that ends without one says so.
  write(pj, JSON.stringify({ type: "module", dependencies: { "playwright-core": "1.63.0", "@anthropic-ai/sdk": "0.125.0" } }));
  const npmBefore = lines("npm.log").length;
  r = launch("0");
  check(say("package.json lists a new library: installed again"), r.code === 0 && lines("npm.log").length === npmBefore + 1
    && exists(path.join(WORK, "node_modules", "@anthropic-ai", "sdk", "package.json")), lines("npm.log").join("\n"));
  r = launch("0");
  check(say("and not again on the launch after"), r.code === 0 && lines("npm.log").length === npmBefore + 1, lines("npm.log").join("\n"));
  fs.rmSync(path.join(WORK, "node_modules", "@anthropic-ai"), { recursive: true, force: true });
  r = launch("0", { UC_NPM_SKIP: "@anthropic-ai/sdk" });
  check(say("an install that leaves a library out stops and names it"), r.code !== 0 && r.runs.length === 0
    && r.out.includes("Setup finished without: @anthropic-ai/sdk."), tail(r.out, 5));
  write(pj, FAKE_SRC["package.json"]);
  fs.rmSync(path.join(WORK, "node_modules", "@anthropic-ai"), { recursive: true, force: true });

  // 5-7. One at a time. A stand-in for another window's run.command: a bash
  // whose command line names run.command (the loop keeps bash from exec'ing).
  const other = () => {
    const c = spawn("bash", ["-c", "while :; do sleep 1; done", "run.command"], { stdio: "ignore" });
    children.push(c);
    return c;
  };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  let o = other();
  write(path.join(WORK, "runner.pid"), `${o.pid}\n`);
  write(path.join(WORK, "keep.mjs"), "export {};\n");
  r = launch("0");
  check(say("another window running with Chrome up: this one exits 0 and touches nothing"),
    r.code === 0 && r.runs.length === 0 && r.out.includes("already running in its other window")
      && exists(path.join(WORK, "keep.mjs")) && read(path.join(WORK, "runner.pid")).trim() === String(o.pid) && alive(o.pid), tail(r.out, 4));

  await killChrome();
  r = launch("0");
  check(say("another window still setting up (Chrome not up yet): never interrupted"),
    r.code === 0 && r.runs.length === 0 && r.out.includes("still starting in its other window") && alive(o.pid), tail(r.out, 4));

  // This time Chrome is found the way run.command looks for it on a Mac, in a
  // path with spaces: ~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
  // (/Applications/Google Chrome.app does not exist here, so the search goes on).
  write(path.join(HOME, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"), read(path.join(base, "chrome")), 0o755);
  write(path.join(WORK, "runner.looping"), `${o.pid}\n`);
  fs.rmSync(path.join(LOG, "chrome.args"), { force: true });
  r = launch("0", { ULTRA_TEST_CHROME: "" });
  await new Promise((res) => setTimeout(res, 300));
  check(say("another window running but its Chrome was closed: this one takes over and reopens Chrome"),
    r.code === 0 && r.runs.length === 1 && !alive(o.pid) && lines("chrome.args")[0] === `--remote-debugging-port=${PORT}`
      && r.out.includes("Chrome was closed. Restarting ultracursor in this window."), tail(r.out, 6));
  check(say("Chrome found under ~/Applications, through the spaces in its path"), lines("chrome.args").includes("https://www.tiktok.com/"));

  // 8. A Node older than 20 first on PATH (playwright-core 1.63 refuses to
  // run on 18) is passed over for a newer one further down the search: here
  // /usr/local/bin/node if the machine has one, else ~/.volta/bin/node.
  const BIN18 = path.join(base, "old node");
  write(path.join(BIN18, "node"), `#!/bin/bash
case "$*" in *process.versions.node*) echo 18 ;; *) echo "used" >> "$UC_LOG/node18.log"; exit 1 ;; esac
`, 0o755);
  fs.mkdirSync(path.join(HOME, ".volta", "bin"), { recursive: true });
  fs.symlinkSync(process.execPath, path.join(HOME, ".volta", "bin", "node"));
  r = launch("0", { PATH: `${BIN18}:${BIN}:${process.env.PATH}` });
  check(say("Node 18 first on PATH: passed over, the runner runs on Node 20 or newer"),
    r.code === 0 && r.runs.length === 1 && Number(r.runs[0].node.slice(1).split(".")[0]) >= 20 && lines("node18.log").length === 0,
    `${JSON.stringify(r.runs.map((x) => x.node))}\n${tail(r.out, 4)}`);

  // 9. A Mac without Chrome: says so, opens the download page, stops.
  r = launch("0", { ULTRA_TEST_CHROME: path.join(base, "no such chrome") });
  check(say("no Chrome: exits 1, says so in plain words, opens google.com/chrome"),
    r.code === 1 && r.out.includes("Google Chrome isn't installed.") && lines("open.log").includes("https://www.google.com/chrome/") && r.runs.length === 0,
    tail(r.out, 6));

  await killChrome();
}

// ---------------------------------------------------------------- go

const timer = setTimeout(() => { console.log("FAIL  pack.test.mjs timed out"); cleanup(); process.exit(1); }, 20 * 60 * 1000);
function cleanup() {
  for (const c of children) { try { c.kill("SIGKILL"); } catch {} }
  for (const f of walk(T).filter((f) => f.endsWith("chrome.pid"))) { try { process.kill(Number(read(f)), "SIGKILL"); } catch {} }
  if (!process.env.ULTRA_KEEP) fs.rmSync(T, { recursive: true, force: true });
  else console.log(`kept ${T}`);
}

try {
  console.log(`pack.test.mjs  (${BASHES.map((sh) => `${bashName(sh)} = ${sh}`).join(", ")})`);

  section("1. pack a copy with a made-up src/, build 7");
  const A = makeCopy("made-up", { build: 7 });
  fs.chmodSync(path.join(A, "run.command"), 0o644);
  fs.chmodSync(path.join(A, "app/ultracursor.app/Contents/MacOS/ultracursor"), 0o644);
  const zipA = path.join(T, "out dir", "ultracursor-7.zip");
  let r = pack(A, zipA);
  check("pack.sh exits 0", r.code === 0, tail(r.out, 20));
  check("pack.sh ran the copy's test", r.out.includes("trivial test ran"));
  check("the copy's own run.command and Info.plist were stamped with 7",
    /^BUILD="7"$/m.test(read(path.join(A, "run.command"))) && (read(path.join(A, "app/ultracursor.app/Contents/Info.plist")).match(/<string>7<\/string>/g) || []).length === 2);
  const a = checkZip("made-up", zipA, path.join(A, "src"), 7);

  section("2. pack.sh refuses, and leaves no zip");
  const refuse = (name, mutate, expect, opts = {}) => {
    const dir = makeCopy(`refuse ${name}`, opts);
    mutate(dir);
    const out = path.join(T, `refuse ${name}`, "out.zip");
    write(out, "a zip from an earlier run");
    const res = pack(dir, out);
    check(`refuses ${name}`, res.code !== 0 && !exists(out) && res.out.includes(expect),
      `code ${res.code}, zip left: ${exists(out)}\n${tail(res.out, 6)}`);
  };
  refuse("when a test fails", () => {}, "fail.test.mjs failed: nothing packed",
    { tests: { "ok.test.mjs": PASSING_TEST, "fail.test.mjs": 'console.log("boom"); process.exit(1);\n' } });
  refuse("when a src script does not parse", (d) => write(path.join(d, "src/q4.mjs"), "export const = ;\n"), "node --check failed: src/q4.mjs");
  refuse("when a file SPEC.md lists is missing", (d) => fs.rmSync(path.join(d, "src/sites/trends.mjs")), "src/sites/trends.mjs is missing");
  refuse("an import package.json does not install", (d) => write(path.join(d, "src/report.mjs"), 'import pad from "left-pad";\nexport const x = pad;\n'),
    '"left-pad" is not a dependency in package.json');
  refuse("a relative import that is not in the bundle", (d) => write(path.join(d, "src/cloud.mjs"), 'export * from "./gone.mjs";\n'),
    '"./gone.mjs" is not in the bundle');
  refuse("a path built with .pathname", (d) => write(path.join(d, "src/q4.mjs"), 'export const dir = new URL(".", import.meta.url).pathname;\n'),
    "builds a path with .pathname");
  refuse("two BUILD= lines in run.command", (d) => fs.appendFileSync(path.join(d, "run.command"), 'BUILD="9"\n'), "exactly one BUILD=");
  refuse("a BUILD that is not a number", (d) => fs.writeFileSync(path.join(d, "BUILD"), "1.2\n"), "BUILD must be a whole number");
  {
    const res = pack(A, path.join(T, "out.tar"));
    check("refuses an output that is not a .zip", res.code !== 0 && res.out.includes("must be a .zip"), tail(res.out, 3));
  }

  section("3. the packed run.command, driven");
  if (a) for (const sh of BASHES) await runCommandCases(sh, path.join(a.R, "run.command"), 7);

  section("4. pack a copy of the REAL folder (real src/, real BUILD)");
  const realBuild = Number(read(path.join(HERE, "BUILD")).trim());
  const B = makeCopy("real", { realSrc: true });
  const zipB = path.join(T, "out dir", `ultracursor-${realBuild}.zip`);
  r = pack(B, zipB);
  check(`pack.sh exits 0 on the real src/ (build ${realBuild})`, r.code === 0, tail(r.out, 20));
  const b = r.code === 0 ? checkZip("real", zipB, path.join(HERE, "src"), realBuild) : null;
  const icon = b?.icon || a?.icon;
  if (icon && process.env.ULTRA_ICON_PREVIEW) {
    fs.writeFileSync(process.env.ULTRA_ICON_PREVIEW, icon);
    console.log(`  icon preview written to ${process.env.ULTRA_ICON_PREVIEW}`);
  }
} catch (e) {
  failures.push(`crashed: ${e.stack || e}`);
  console.log(`FAIL  crashed: ${e.stack || e}`);
} finally {
  clearTimeout(timer);
  cleanup();
}

console.log(`\npack.test.mjs: ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
process.exit(0);
