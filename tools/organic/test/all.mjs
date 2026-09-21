/** Run the numbered tests one after another; Chrome ports must not overlap. */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const tests = readdirSync(here).filter((f) => /^\d+-.*\.mjs$/.test(f)).sort();
let bad = 0;
for (const t of tests) {
  console.log(`\n== ${t}`);
  const r = spawnSync(process.execPath, [join(here, t)], { stdio: "inherit", timeout: 300000 });
  if (r.status !== 0) bad++;
}
console.log(bad ? `\n${bad} test file(s) failed` : "\nALL PASSED");
process.exit(bad ? 1 : 0);
