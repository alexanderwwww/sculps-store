/**
 * Before and after, side by side.
 *
 * "Before" is the deployed site, which is still the two forks. "After" is this
 * checkout, which is the shared template. If the merge was honest, the pairs
 * are the same picture.
 */
import { chromium } from "playwright";
const b = await chromium.launch({ args:["--no-sandbox","--ignore-certificate-errors"], executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const stores = process.argv.slice(2);
for (const store of stores) {
  for (const [tag, base] of [["after", "http://localhost:5173"], ["before", "https://blackreaper.us"]]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    if (tag === "after") {
      await p.route("**/media/**", async (r) => {
        const u = new URL(r.request().url());
        try { const res = await fetch("https://blackreaper.us" + u.pathname + u.search);
          await r.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { "content-type": res.headers.get("content-type") || "image/webp" } });
        } catch { await r.abort(); }
      });
    }
    try {
      await p.goto(`${base}/?store=${store}`, { waitUntil: "networkidle", timeout: 45000 });
      await p.evaluate(()=>document.querySelectorAll('img[loading="lazy"]').forEach(i=>i.removeAttribute("loading")));
      await p.waitForTimeout(2000);
      const h = await p.evaluate(() => document.body.scrollHeight);
      console.log(`${store} ${tag}: height ${h}`);
      await p.screenshot({ path: `scratchpad/ab-${store}-${tag}.png` });
    } catch (e) { console.log(`${store} ${tag}: FAILED ${e.message.slice(0,80)}`); }
    await p.close();
  }
}
await b.close();
