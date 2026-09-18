/**
 * The run must end with one zip somewhere findable, and no folder left behind.
 */
import { mkdir, writeFile, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

const ROOT = "/tmp/claude-0/-home-user-sculps-store/4b2cba19-2b7c-5b69-876f-e326d34c8f06/scratchpad/wtest/ziptest";
const OUT = join(ROOT, "out");
const DESK = join(ROOT, "Desktop");
await rm(ROOT, { recursive: true, force: true });
await mkdir(DESK, { recursive: true });

const slug = "black-reaper-everything";
const dir = join(OUT, slug);
await mkdir(join(dir, "reference"), { recursive: true });
for (let i = 1; i <= 5; i++) await writeFile(join(dir, `0${i}-01.png`), Buffer.alloc(64, i));
await writeFile(join(dir, "reference", "ref-1.jpg"), Buffer.alloc(32));

let fails = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) fails++; };

// The same two commands the runner issues.
const zipPath = join(DESK, `${slug}.zip`);
await run("zip", ["-qrj", zipPath, dir], { cwd: OUT });
await rm(dir, { recursive: true, force: true });

check("the zip exists", await stat(zipPath).then(() => true).catch(() => false));
const listed = (await run("unzip", ["-l", zipPath])).stdout;
const names = listed.split("\n").filter((l) => l.includes(".png")).map((l) => l.trim().split(/\s+/).pop());
check("every picture is in it", names.length === 5, names.join(", "));
check("no folders inside it — pictures at the root", names.every((n) => !n.includes("/")), names[0]);
check("the loose folder is gone", await stat(dir).then(() => false).catch(() => true));
check("nothing else left in the output folder", (await readdir(OUT)).length === 0, (await readdir(OUT)).join(", "));

await rm(ROOT, { recursive: true, force: true });
console.log(fails ? `\n${fails} FAILED\n` : "\nall passed\n");
process.exit(fails ? 1 : 0);
