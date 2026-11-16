// node aq/dev/statues/build.mjs  -> out/preview.js + out/index.html
import { build } from "esbuild"; import { writeFileSync, mkdirSync } from "node:fs"; import { dirname, join } from "node:path"; import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url)); mkdirSync(join(here, "out"), { recursive: true });
await build({ bundle: true, format: "esm", target: "es2022", entryPoints: [join(here, "preview.js")], outfile: join(here, "out/preview.js"), logLevel: "warning" });
writeFileSync(join(here, "out/index.html"), `<!doctype html><meta charset="utf-8"><title>statues</title><style>html,body{margin:0;overflow:hidden;background:#000}</style><script type="module" src="./preview.js"></script>`);
