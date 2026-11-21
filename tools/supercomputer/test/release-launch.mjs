// Starts the RELEASE build (unzipped) in Chromium and opens the real pro.kraken.com trade page.
//   node test/release-launch.mjs <unzippedExtDir> <shotsDir>
// Fails only if the extension itself does not start. What the real page allowed is printed, not assumed.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const [ext, shots] = process.argv.slice(2); mkdirSync(shots, { recursive: true });
const prof = join(shots, ".release-profile"); rmSync(prof, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(prof, { channel: "chromium", viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 }).catch(() => null);
if (!sw) { console.log("FAIL  service worker did not start"); process.exit(1); }
console.log(`  ok  release service worker started (${sw.url().split("/")[2]})`);
const page = await ctx.newPage(); const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
try {
  await page.goto("https://pro.kraken.com/app/trade/btc-usd", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(20000);
  const r = await page.evaluate(() => { const h = document.querySelector("#supercomputer-root"); const s = h && h.shadowRoot;
    return { url: location.href, title: document.title, widget: !!s, coin: s ? s.querySelector(".cname").textContent : null, price: s ? s.querySelector(".price").textContent : null,
      call: s ? s.querySelector(".c5 .big").textContent : null, feed: s ? s.querySelector(".feed").textContent : null }; });
  console.log(`      real page: ${JSON.stringify(r)}`);
  await page.screenshot({ path: join(shots, "11-real-pro-kraken.png") });
} catch (e) { console.log(`      real page could not be checked from here: ${e.message.split("\n")[0]}`); }
const ours = errs.filter((e) => /supercomputer|chrome-extension/.test(e));
console.log(ours.length ? `FAIL  widget errors on the real page: ${ours.join(" | ")}` : "  ok  no widget errors on the real page");
await ctx.close();
process.exit(ours.length ? 1 : 0);
