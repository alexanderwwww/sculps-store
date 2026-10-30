// Screenshot of the Fibonacci widget with fake data: node tools/autotrader/design/fib-shot.mjs -> design/fib-widget.png
import path from "node:path"; import fs from "node:fs"; import { createRequire } from "node:module";
const here = path.dirname(new URL(import.meta.url).pathname), ui = path.join(here, "..", "src", "ui");
const require = createRequire(path.join(here, "..", "..", "..", "package.json"));
let pw; try { pw = require("playwright"); } catch { pw = require("playwright-core"); }
const now = 1_800_000_000_000, mk = (f, n = 30) => Array.from({ length: n }, (_, i) => { const o = f(i), c = f(i + 0.8); return { t: now - (n - i) * 60000, o, c, h: Math.max(o, c) * 1.012, l: Math.min(o, c) * 0.988 }; });
// Real data: candles go into a real Engine and the picture draws engine.status().charts, the same swing the fib gate reads.
const { Engine } = await import("../src/lib/engine.mjs"); const { Journal } = await import("../src/lib/journal.mjs"); const { DEFAULTS } = await import("../src/lib/strategy.mjs");
const os = await import("node:os");
const feed = { quotes: async () => new Map(), newPools: async () => [], trendingPools: async () => [], candles: async () => [] };
const exec = { name: "live", source: "own", buy: async () => ({ ok: false }), sell: async () => ({ ok: true }), sizeSol: async () => ({ bal: 1, sol: 0.02 }) };
const e = new Engine({ feed, exec, journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fs-")), "j.jsonl")), rug: async () => ({ pass: true }), cfg: { ...DEFAULTS }, now: () => now });
const coins = [["PEPE2 / SOL", (i) => 0.00012 * (i < 18 ? 1 + i * 0.03 : 1.54 - (i - 18) * 0.022), true], ["MOONBOY / SOL", (i) => 0.0031 * (1 + Math.sin(i / 4) * 0.15 + i * 0.01), false], ["DOGWIF / SOL", (i) => 0.42 * (i < 22 ? 1 + i * 0.012 : 1.26 - (i - 22) * 0.015), false]];
coins.forEach(([name, f, open], k) => {
  const pool = "pool" + k, cs = mk(f, 40), price = cs[39].c; e.cc.set(pool, { cs, at: now }); e.live.set(pool, { price });
  e.ph.set(pool, Array.from({ length: 60 }, (_, i) => [now - (60 - i) * 3000, price * (1 + Math.sin(i) * 0.004)]));
  if (open) e.open.set("x" + k, { id: "x" + k, pool, name, mint: "M" + k, entryPx: cs[36].c, stake: 0.02, at: now - 180000 }); else e.ready.push({ pool, name, mint: "M" + k });
});
const charts = e.status().charts; if (charts.length !== 3) throw new Error("engine gave " + charts.length + " charts");
const browser = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
await page.setContent(`<html><head><style>${fs.readFileSync(path.join(ui, "style.css"), "utf8")}</style></head><body><main><div id="app"></div></main><script>${fs.readFileSync(path.join(ui, "fib.js"), "utf8")}</script></body></html>`);
await page.evaluate((c) => { document.getElementById("app").append(window.UltraFib.panel(c)); }, charts);
await page.waitForTimeout(300); await page.click(".fib__card"); await page.waitForTimeout(300);
await (await page.$(".fib")).screenshot({ path: path.join(here, "fib-widget.png") });
await browser.close(); console.log("wrote", path.join(here, "fib-widget.png"));
