import { chromium } from '/home/user/sculps-store/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [n,vp] of [['m',{width:390,height:844}],['d',{width:1440,height:900}]]) {
  const ctx = await b.newContext({viewport:vp,ignoreHTTPSErrors:true}); const pg = await ctx.newPage(); pg.setDefaultTimeout(60000);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e).slice(0,120)));
  await pg.goto('https://blackreaper.us/products/the-scream',{waitUntil:'domcontentloaded'});
  await pg.waitForSelector('[data-section="ad_cards"] img',{state:'attached'}); await pg.waitForTimeout(1500);
  const secs=await pg.$$('[data-section="ad_cards"]'); await secs[1].scrollIntoViewIfNeeded();
  const pos=[]; for(let i=0;i<7;i++){ pos.push(await pg.evaluate(()=>Math.round(document.querySelectorAll('[data-section="ad_cards"] .cb-night__row')[1].scrollLeft))); await pg.waitForTimeout(2400); }
  console.log(n,pos.join(','),'errors',errs.length); await ctx.close();
}
await b.close();
