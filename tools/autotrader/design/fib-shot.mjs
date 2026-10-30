// Screenshot of the Fibonacci widget with fake data: node tools/autotrader/design/fib-shot.mjs -> design/fib-widget.png
import path from "node:path"; import fs from "node:fs"; import { createRequire } from "node:module";
const here = path.dirname(new URL(import.meta.url).pathname), ui = path.join(here, "..", "src", "ui");
const require = createRequire(path.join(here, "..", "..", "..", "package.json"));
let pw; try { pw = require("playwright"); } catch { pw = require("playwright-core"); }
const now = 1_800_000_000_000, mk = (f, n = 30) => Array.from({ length: n }, (_, i) => { const o = f(i), c = f(i + 0.8); return { t: now - (n - i) * 60000, o, c, h: Math.max(o, c) * 1.012, l: Math.min(o, c) * 0.988 }; });
function coin(name, f, open) {
  const cs = mk(f); let hi = 0, hA = 0; cs.forEach((k, i) => { if (k.h > hi) { hi = k.h; hA = i; } });
  const lo = Math.min(...cs.slice(0, hA + 1).map((k) => k.l)), at = (r) => hi - r * (hi - lo), price = cs[29].c, entry = open ? cs[26].c : null;
  return { name, open, cs, ticks: Array.from({ length: 20 }, (_, i) => [now - (20 - i) * 6000, price * (1 + Math.sin(i) * 0.004)]), lo, hi, loT: cs[cs.slice(0, hA + 1).findIndex((k) => k.l === lo)].t, hiT: cs[hA].t,
    levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 0.886, 1].map((r) => ({ r, p: at(r) })), zone: { from: 0.236, to: 0.618, top: at(0.236), bottom: at(0.618) }, price, entry, stop: entry ? entry * 0.95 : null, takes: entry ? [entry * 1.05] : [] };
}
const charts = [coin("PEPE2 / SOL", (i) => 0.00012 * (i < 18 ? 1 + i * 0.03 : 1.54 - (i - 18) * 0.022), true), coin("MOONBOY / SOL", (i) => 0.0031 * (1 + Math.sin(i / 4) * 0.15 + i * 0.01), false), coin("DOGWIF / SOL", (i) => 0.42 * (i < 22 ? 1 + i * 0.012 : 1.26 - (i - 22) * 0.015), false)];
const browser = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
await page.setContent(`<html><head><style>${fs.readFileSync(path.join(ui, "style.css"), "utf8")}</style></head><body><main><div id="app"></div></main><script>${fs.readFileSync(path.join(ui, "fib.js"), "utf8")}</script></body></html>`);
await page.evaluate((c) => { document.getElementById("app").append(window.UltraFib.panel(c)); }, charts);
await page.waitForTimeout(300); await page.click(".fib__card"); await page.waitForTimeout(300);
await (await page.$(".fib")).screenshot({ path: path.join(here, "fib-widget.png") });
await browser.close(); console.log("wrote", path.join(here, "fib-widget.png"));
