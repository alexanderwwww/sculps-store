// Bundles three.js + the genie into ONE self-contained page (no CDN, no module imports from file://).
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const here = new URL(".", import.meta.url).pathname;
const out = process.argv[2] || new URL("../app/Aquarius.app/Contents/Resources/page/genie.html", import.meta.url).pathname;
const r = await build({ entryPoints: [here + "genie.js"], bundle: true, format: "iife", minify: true, write: false, target: "safari15", nodePaths: [here + "../../../node_modules"] });
const js = r.outputFiles[0].text;
if (js.includes("</script")) throw new Error("bundle contains </script");
const html = readFileSync(here + "template.html", "utf8");
if (!html.includes("/*BUNDLE*/")) throw new Error("template anchor missing");
writeFileSync(out, html.replace("/*BUNDLE*/", () => js));
console.log(`  ok  page built ${out} (${(js.length / 1024).toFixed(0)}K)`);
