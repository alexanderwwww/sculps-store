// node aq/dev/statues/shoot.mjs <outdir> <dpr> <god[,god]|all> <view[,view]>   e.g. shoot.mjs /tmp/s 1 zeus front,34,side,face,far
import { createRequire } from "node:module"; import { mkdirSync } from "node:fs"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const out = process.argv[2] || "/tmp/statues", dpr = Number(process.argv[3] || 1), gods = (process.argv[4] || "all") === "all" ? ["zeus", "athena", "apollo", "hermes", "dionysus", "hecate", "lineup"] : process.argv[4].split(","), views = (process.argv[5] || "front,34,side").split(",");
mkdirSync(out, { recursive: true }); const errors = [];
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: dpr }); const p = await ctx.newPage();
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); else if (m.type() === "log") console.log("  log:", m.text()); }); p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await p.goto((process.env.URL || "http://localhost:8791/") + "?god=" + (gods[0] === "lineup" ? "zeus" : gods[0]) + (process.env.KIT ? "&kit=1" : "")); await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
for (const g of gods) { const vs = g === "lineup" ? ["front"] : views; if (g === "lineup") await p.setViewportSize({ width: 1800, height: 900 }); else await p.setViewportSize({ width: 900, height: 1000 });
  for (const v of vs) { await p.waitForTimeout(100); const info = await p.evaluate(([g, v]) => window.__show(g, v), [g, v]); await p.waitForTimeout(350);
    const name = process.env.FINAL ? (g === "lineup" ? "statues-lineup" : v === "34" ? "statue-" + g : `statue-${g}-${v}`) : `${g}-${v}`; await p.screenshot({ path: `${out}/${name}.png` });
    const dark = await p.evaluate(() => { const c = document.querySelector("canvas"), d = document.createElement("canvas"); d.width = 64; d.height = 64; const x = d.getContext("2d"); x.drawImage(c, 0, 0, 64, 64); const px = x.getImageData(0, 0, 64, 64).data; let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return s / (64 * 64 * 3); });
    console.log(name, JSON.stringify(info), "meanLuma", dark.toFixed(0)); } }
console.log("console errors/warnings:", errors.length); for (const e of errors.slice(0, 20)) console.log("  ", e);
await b.close();
