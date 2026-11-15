// Screenshots of every face, with and without the suit, and mid-typing; plus the 1024 icon render of his head.
//   node test/shots.mjs <dir>
import { harness } from "./harness.mjs";
import { createRequire } from "node:module";
import path from "node:path"; import fs from "node:fs";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const DIR = process.argv[2]; fs.mkdirSync(DIR, { recursive: true });
const html = path.join(DIR, "harness.html"); await harness(html);
const b = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const p = await b.newPage({ viewport: { width: 260, height: 320 }, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto("file://" + html); await p.waitForTimeout(800);
const shot = async (name) => { await p.waitForTimeout(250); await p.screenshot({ path: path.join(DIR, name + ".png"), omitBackground: true }); };
for (const suit of [false, true]) for (const face of ["happy", "focused", "smug", "worried", "talking"]) {
  await p.evaluate(([f, s]) => { G.freeze(1.3); G.setSuit(s); G.setFace(f); }, [face, suit]); await shot(`face-${face}${suit ? "-suit" : ""}`);
}
await p.evaluate(() => { G.setFace("happy"); G.setSuit(false); G.freeze(null); G.receive({ type: "say", text: "🧞 Aquarius online. Three listings went live and two offers came in overnight.", face: "smug" }); });
await p.waitForTimeout(1200); await p.screenshot({ path: path.join(DIR, "typing.png"), omitBackground: true });
// the icon: his head, big, on transparent
const q = await b.newPage({ viewport: { width: 260, height: 320 }, deviceScaleFactor: 4 });
await q.goto("file://" + html); await q.waitForTimeout(600);
await q.evaluate(() => { G.freeze(1.3); G.setFace("happy"); });
await q.waitForTimeout(300);
const box = await q.evaluate(() => G.state().body);
await q.screenshot({ path: path.join(DIR, "head.png"), omitBackground: true, clip: { x: 72, y: 36, width: 116, height: 116 } });
console.log(errs.length ? "PAGE ERRORS:\n" + errs.join("\n") : "  ok  no page errors", JSON.stringify(box));
await b.close();
