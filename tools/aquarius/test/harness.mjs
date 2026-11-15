// A plain page that mounts the genie (no extension), for screenshots and the icon. Exports build(outHtml).
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
export async function harness(out) {
  const r = await build({ stdin: { contents: `import { mountGenie } from "./page/genie.js"; const host = document.getElementById("g"); window.G = mountGenie(host.attachShadow({ mode: "open" }), window.CFG || {}, { post: (m) => (window.posted = window.posted || []).push(m) });`, resolveDir: join(HERE, ".."), loader: "js" },
    bundle: true, format: "iife", write: false, nodePaths: [join(HERE, "../../../node_modules")], target: "chrome120" });
  writeFileSync(out, `<!doctype html><html><body style="margin:0;background:transparent"><div id="g" style="width:260px;height:320px"></div><script>window.CFG={build:"1"}</script><script>${r.outputFiles[0].text}</script></body></html>`);
}
