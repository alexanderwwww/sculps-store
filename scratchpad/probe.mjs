import { chromium } from "playwright";
const b = await chromium.launch({ args:["--no-sandbox"], executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport:{width:1100,height:760} });
await p.goto("http://localhost:5173/?store=cryo",{waitUntil:"networkidle"});
await p.evaluate(()=>{ try{localStorage.removeItem("kb_popup_seen")}catch{} });
await p.reload({waitUntil:"networkidle"});
await p.waitForTimeout(1200);
await p.dispatchEvent("body","mouseout",{clientY:-1});
await p.waitForTimeout(900);
console.log(await p.evaluate(()=>{
  const el=document.querySelector(".pp__rub");
  if(!el) return "no .pp__rub";
  const cs=getComputedStyle(el);
  const sheets=[...document.styleSheets].map(s=>s.href||"inline");
  let found=false;
  for (const s of document.styleSheets) { try { for (const r of s.cssRules) { if (r.cssText && r.cssText.includes(".pp__rub")) found=true; } } catch {} }
  const hits=[];
  for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) {
    if (!r.selectorText) continue;
    try { if (el.matches(r.selectorText) && /font-size|font:/.test(r.style.cssText)) hits.push(r.selectorText + " => " + r.style.fontSize); } catch {}
  } } catch {} }
  return { fontSize: cs.fontSize, hits };
}));
await b.close();
