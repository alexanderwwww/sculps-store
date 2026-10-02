// The packed app is a different program from the source tree: every local require must be in package.json build.files.
import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
test("every file the app requires is packed", () => {
  const files = JSON.parse(fs.readFileSync("package.json", "utf8")).build.files;
  const need = new Set();
  for (const f of fs.readdirSync(".").filter((x) => x.endsWith(".js"))) for (const m of fs.readFileSync(f, "utf8").matchAll(/require\("\.\/([\w.-]+\.js)"\)/g)) need.add(m[1]);
  for (const n of need) assert.ok(files.includes(n), n + " is required but not in build.files");
});
