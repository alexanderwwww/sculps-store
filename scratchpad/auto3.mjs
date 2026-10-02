import { chromium } from '/home/user/sculps-store/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx = await b.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true}); const pg = await ctx.newPage(); pg.setDefaultTimeout(60000);
await pg.goto('https://blackreaper.us/products/the-scream',{waitUntil:'domcontentloaded'});
await pg.waitForSelector('[data-section="ad_cards"] img',{state:'attached'}); await pg.waitForFunction(()=>getComputedStyle(document.querySelectorAll('[data-section="ad_cards"] .cb-night__row')[1]).display==='grid',null,{timeout:90000}); await pg.waitForTimeout(2000);
await pg.evaluate(()=>{const r=document.querySelectorAll('[data-section="ad_cards"] .cb-night__row')[1]; r.scrollIntoView({block:'center'});});
await pg.waitForTimeout(800);
console.log('manual', await pg.evaluate(async()=>{const r=document.querySelectorAll('[data-section="ad_cards"] .cb-night__row')[1]; r.scrollTo({left:390,behavior:'smooth'}); await new Promise(x=>setTimeout(x,1200)); return r.scrollLeft}));
await pg.evaluate(()=>{document.querySelectorAll('[data-section="ad_cards"] .cb-night__row')[1].scrollTo({left:0})});
for(let i=0;i<7;i++){await pg.waitForTimeout(2500); console.log('auto',await pg.evaluate(()=>document.querySelectorAll('[data-section="ad_cards"] .cb-night__row')[1].scrollLeft));}
await b.close();
