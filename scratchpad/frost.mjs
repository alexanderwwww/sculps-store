import { chromium } from "playwright";
const b = await chromium.launch({ args:["--no-sandbox"], executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport:{width:1100,height:760} });
await p.route("**/media/**", async (r) => {
  const u = new URL(r.request().url());
  try { const res = await fetch("https://blackreaper.us"+u.pathname+u.search);
    await r.fulfill({status:res.status, body:Buffer.from(await res.arrayBuffer()), headers:{"content-type":res.headers.get("content-type")||"image/webp"}});
  } catch { await r.abort(); }
});
await p.goto("http://localhost:5173/?store=cryo",{waitUntil:"networkidle"});
// The card waits 22 seconds or an exit. Reach for the exit.
await p.evaluate(()=>{ try{localStorage.removeItem("kb_popup_seen")}catch{} });
await p.reload({waitUntil:"networkidle"});
await p.waitForTimeout(1500);
await p.mouse.move(500,300); await p.mouse.move(500,-5);
await p.dispatchEvent("body","mouseout",{clientY:-1});
await p.waitForTimeout(1200);
const seen = await p.$(".pp");
console.log("popup:", !!seen, "frost:", !!(await p.$(".pp__frost")));
if (seen) {
  await p.screenshot({ path:"scratchpad/frost-1-iced.png" });
  const box = await (await p.$(".pp__ice")).boundingBox();
  if (box) {
    await p.mouse.move(box.x+10, box.y+box.height/2);
    await p.mouse.down();
    for (let i=0;i<=24;i++){ await p.mouse.move(box.x+ (box.width*i/24), box.y+box.height/2 + Math.sin(i/2)*12); await p.waitForTimeout(18); }
    await p.mouse.up();
    await p.waitForTimeout(250);
    await p.screenshot({ path:"scratchpad/frost-2-wiped.png" });
    await p.waitForTimeout(900);
    await p.screenshot({ path:"scratchpad/frost-3-clear.png" });
  }
}
await b.close();
