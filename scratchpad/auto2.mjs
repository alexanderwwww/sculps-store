import { chromium } from '/home/user/sculps-store/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx = await b.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true}); const pg = await ctx.newPage(); pg.setDefaultTimeout(60000);
await pg.goto('https://blackreaper.us/products/the-scream',{waitUntil:'domcontentloaded'});
await pg.waitForSelector('[data-section="ad_cards"] img',{state:'attached'}); await pg.waitForTimeout(4000);
const secs=await pg.$$('[data-section="ad_cards"]'); await secs[1].scrollIntoViewIfNeeded(); await pg.waitForTimeout(500);
console.log(await pg.evaluate(()=>{const r=document.querySelectorAll('[data-section="ad_cards"] .cb-night__row')[1];const b=r.getBoundingClientRect();const cs=getComputedStyle(r);return JSON.stringify({disp:cs.display,flow:cs.gridAutoFlow,ovx:cs.overflowX,cls:r.className,sl:r.scrollLeft,sw:r.scrollWidth,cw:r.clientWidth,top:Math.round(b.top),h:Math.round(b.height),vh:innerHeight,rm:matchMedia('(prefers-reduced-motion: reduce)').matches,js:[...document.scripts].map(s=>s.src).filter(x=>/storefront|ceiling/.test(x))})}));
for(let i=0;i<4;i++){await pg.waitForTimeout(2600); console.log(await pg.evaluate(()=>document.querySelectorAll('[data-section="ad_cards"] .cb-night__row')[1].scrollLeft));}
await b.close();
