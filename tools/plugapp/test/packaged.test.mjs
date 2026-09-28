/**
 * Everything the app requires is actually IN the app.
 *
 * plug shipped and died on launch with "Cannot find module './shops.js'",
 * because electron-builder only packs what its `files` list names and shops.js
 * was not on it. Every other test passed — they all ran from the source tree,
 * where the file is obviously there. The packed app is a different program.
 *
 * So this reads every local import in the source and asks whether the packed
 * bundle would contain it. No packing needed, which means it runs in a second
 * and there is no excuse to skip it.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";

let bad = 0;
const check = (ok, what, extra) => {
  console.log(ok ? "  ok  " + what : "FAIL  " + what + (extra ? " — " + extra : ""));
  if (!ok) bad++;
};

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const globs = pkg.build?.files ?? [];
check(globs.length > 0, "the build names the files it ships");

/** Would this path be packed, given the globs? */
function packed(path) {
  return globs.some((glob) => {
    if (glob === path) return true;
    if (glob.endsWith("/**")) return path.startsWith(glob.slice(0, -2));
    return false;
  });
}

/** Every local import and require, from every file the app is made of. */
async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "test", ".git"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else if (/\.(js|mjs|cjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const files = await walk(".");
const LOCAL = /(?:require\(|from\s+)["'](\.[^"']+)["']/g;

for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const [, spec] of source.matchAll(LOCAL)) {
    const target = relative(process.cwd(), resolve(dirname(file), spec));
    const exists = await stat(target).then(() => true, () => false);
    check(exists, `${file} → ${spec} exists`);
    check(packed(target), `${file} → ${spec} is in the packaged app`, target);
  }
}

/* And the one the renderer loads by path rather than by import. */
for (const asset of ["assets/plug-icon.png", "renderer/index.html"]) {
  check(packed(asset), `${asset} is in the packaged app`);
}

if (bad) { console.log(`packaged: ${bad} failed`); process.exit(1); }
console.log("packaged: ok");
