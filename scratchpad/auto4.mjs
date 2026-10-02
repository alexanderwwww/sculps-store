import { chromium } from '/home/user/sculps-store/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [n,vp] of [['m',{width:390,height:844}]]) {
const ctx = await b.newContext({viewport:vp,ignoreHTTPSErrors:true}); const pg = await ctx.newPage(); pg.setDefaultTimeout(90000);
pg.on('requestfailed',r=>{ if(/\.js/.test(r.url())) console.log('JSFAIL',r.url().split('/').pop(),r.failure()?.errorText)});
await pg.goto('https://blackreaper.us/products/the-scream',{waitUntil:'domcontentloaded'});
await pg.waitForFunction(()=>{const r=document.querySelectorAll('[data-section="ad_cards"] .cb-night__row')[1];return r&&getComputedStyle(r).display==='grid'});
await pg.waitForTimeout(6000);
await pg.evaluate(()=>document.querySelectorAll('[data-section="ad_cards"] .cb-night__row')[1].scrollIntoView({block:'center'}));
const out=[]; for(let i=0;i<10;i++){await pg.waitForTimeout(2400); out.push(await pg.evaluate(()=>{const r=document.querySelectorAll('[data-section="ad_cards"] .cb-night__row')[1];return Math.round(r.scrollLeft)+'/'+r.scrollWidth}));}
console.log(n,out.join(' ')); await ctx.close(); }
await b.close();
