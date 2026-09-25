import { chromium } from "playwright";
const b = await chromium.launch({ args:["--no-sandbox"], executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport:{width:1440,height:950} });
await p.goto("http://localhost:5173/?store=cryo",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1200);
console.log(await p.evaluate(() => {
  const out = {};
  out.docW = document.documentElement.scrollWidth;
  out.winW = window.innerWidth;
  const wide = [...document.querySelectorAll("*")].filter(e => {
    const r = e.getBoundingClientRect();
    return r.right > window.innerWidth + 1 || r.left < -1;
  }).slice(0, 12).map(e => ({ cls: e.className?.toString?.().slice(0,40), tag: e.tagName, left: Math.round(e.getBoundingClientRect().left), right: Math.round(e.getBoundingClientRect().right) }));
  out.offenders = wide;
  const g = document.querySelector(".cy-buy__grid"); const s = document.querySelector(".cy-header .cy-wrap") || document.querySelector(".cy-wrap");
  const cs = getComputedStyle(document.querySelector(".cy-buy__grid"));
  out.gridCss = { maxWidth: cs.maxWidth, padding: cs.padding, width: cs.width, cols: cs.gridTemplateColumns };
  out.gal = g && g.getBoundingClientRect();
  out.strip = s && s.getBoundingClientRect();
  return JSON.parse(JSON.stringify(out));
}));
await b.close();
