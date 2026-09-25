import { chromium } from "playwright";
const b = await chromium.launch({ args:["--no-sandbox"], executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [w,h,tag] of [[1440,950,"d"],[430,930,"m"]]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  await p.route("**/media/**", async (route) => {
    const u = new URL(route.request().url());
    try { const r = await fetch("https://blackreaper.us" + u.pathname + u.search);
      await route.fulfill({ status:r.status, body:Buffer.from(await r.arrayBuffer()), headers:{ "content-type": r.headers.get("content-type")||"image/webp" } });
    } catch { await route.abort(); }
  });
  await p.goto("http://localhost:5173/?store=cryo",{waitUntil:"networkidle"});
  await p.evaluate(()=>document.querySelectorAll('img[loading="lazy"]').forEach(i=>i.removeAttribute("loading")));
  await p.waitForTimeout(2500);
  for (let i=0;i<3;i++){ await p.evaluate(v=>window.scrollTo(0,v), i*(h-60)); await p.waitForTimeout(500);
    await p.screenshot({ path:`scratchpad/${tag}${i}.png` }); }
  await p.close();
}
await b.close();
