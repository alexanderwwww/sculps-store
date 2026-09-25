import { chromium } from "playwright";
const b = await chromium.launch({ args:["--no-sandbox"], executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport:{width:430,height:930} });
await p.route("**/media/**", async (route) => {
  const u = new URL(route.request().url());
  try {
    const r = await fetch("https://blackreaper.us" + u.pathname + u.search);
    const buf = Buffer.from(await r.arrayBuffer());
    await route.fulfill({ status: r.status, body: buf, headers: { "content-type": r.headers.get("content-type") || "image/webp" } });
  } catch (e) { await route.abort(); }
});
await p.goto("http://localhost:5173/?store=cryo",{waitUntil:"networkidle"});
await p.evaluate(()=>document.querySelectorAll('img[loading="lazy"]').forEach(i=>i.removeAttribute("loading")));
await p.waitForTimeout(2500);
const h = await p.evaluate(()=>document.body.scrollHeight);
console.log("height", h);
let i=0;
for (let y=0; y<h && i<14; y+=880, i++){
  await p.evaluate(v=>window.scrollTo(0,v), y);
  await p.waitForTimeout(600);
  await p.screenshot({ path:`scratchpad/m${String(i).padStart(2,"0")}.png` });
}
await b.close();
