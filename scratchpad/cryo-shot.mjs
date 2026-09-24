import { chromium } from "playwright";
const b = await chromium.launch({ args:["--ignore-certificate-errors"], executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [w,h,n] of [[1440,1000,"page-desktop"],[400,900,"page-mobile"]]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  await p.goto("http://localhost:5173/?store=cryo",{waitUntil:"networkidle"});
  await p.evaluate(()=>document.querySelectorAll('img[loading="lazy"]').forEach(i=>i.removeAttribute("loading")));
  await p.screenshot({ path:`scratchpad/cryo-${n}.png`, fullPage:false });
  await p.evaluate(()=>window.scrollTo(0, 4000)); await p.waitForTimeout(800);
  await p.screenshot({ path:`scratchpad/cryo-${n}-mid.png` });
  await p.close();
}
await b.close();
