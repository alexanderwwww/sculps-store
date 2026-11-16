// node aq/dev/statues/bench.mjs : builds every statue headless (no WebGL) and prints triangles + build time. Fails on any budget miss.
import { build } from "esbuild"; import { dirname, join } from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import { mkdirSync } from "node:fs";
const here = dirname(fileURLToPath(import.meta.url)); mkdirSync(join(here, "out"), { recursive: true });
await build({ bundle: true, format: "esm", platform: "node", entryPoints: [join(here, "../../world/statues.js")], outfile: join(here, "out/statues.node.mjs"), logLevel: "warning" });
const ctx = new Proxy({}, { get: (t, k) => (k === "createRadialGradient" || k === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0, style: {} }) };
const { makeStatue } = await import(pathToFileURL(join(here, "out/statues.node.mjs")).href + "?t=" + Date.now());
let bad = 0, total = 0;
for (const g of ["zeus", "athena", "apollo", "hermes", "dionysus", "hecate"]) { const t = performance.now(), s = makeStatue(g, { sync: true }), ms = performance.now() - t; total += ms; let tris = 0, meshes = 0; const nan = [];
  s.traverse((o) => { if (o.isMesh) { meshes++; tris += o.geometry.index.count / 3; const p = o.geometry.attributes.position.array; for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) { nan.push(o.name || "mesh"); break; } } });
  const box = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }; s.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], b.min.getComponent(i) + o.position.getComponent(i)); box.max[i] = Math.max(box.max[i], b.max.getComponent(i) + o.position.getComponent(i)); } } });
  const ok = meshes <= 4 && tris < 25000 && !nan.length && s.userData.god === g && Array.isArray(s.userData.flames) && s.userData.flames.length === (g === "hecate" ? 2 : 0) && Math.abs(box.min[1]) < 1e-6; if (!ok) bad++;
  console.log(g.padEnd(9), "draw calls", meshes, "tris", tris, "build", ms.toFixed(0) + " ms", "height", box.max[1].toFixed(2), "flames", s.userData.flames.length, ok ? "OK" : "FAIL"); const again = performance.now(); makeStatue(g, { scale: 0.8 }); if (performance.now() - again > 5) { console.log("  cache miss on second build"); bad++; } }
console.log("total build", total.toFixed(0), "ms");
// async path: a fresh module copy returns at once and fills the marble in later
const fresh = await import(pathToFileURL(join(here, "out/statues.node.mjs")).href + "?async=" + Date.now());
const t1 = performance.now(), gs = ["zeus", "hecate", "zeus"].map((g) => fresh.makeStatue(g)), ret = performance.now() - t1, before = gs.map((s) => s.children[0].geometry.index.count / 3);
let longest = 0, last = performance.now(); const tick = setInterval(() => { const n = performance.now(); longest = Math.max(longest, n - last); last = n; }, 1);
await Promise.all(gs.map((s) => s.userData.ready)); clearInterval(tick); const after = gs.map((s) => s.children[0].geometry.index.count / 3);
const aok = before.every((b) => b < 1000) && after.every((a) => a > 15000) && gs[0].children[0].geometry === gs[2].children[0].geometry && gs[1].userData.flames.length === 2; if (!aok) bad++;
console.log("async: returned in", ret.toFixed(0), "ms, marble tris before", before.join("/"), "after", after.join("/"), "longest main-thread block", longest.toFixed(0), "ms", aok ? "OK" : "FAIL");
process.exit(bad ? 1 : 0);
