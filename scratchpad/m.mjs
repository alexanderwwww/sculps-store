import { chromium } from '/home/user/sculps-store/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [n,vp] of [['m',{width:390,height:844}],['d',{width:1440,height:900}]]) {
  const ctx = await b.newContext({viewport:vp,ignoreHTTPSErrors:true}); const pg = await ctx.newPage(); pg.setDefaultTimeout(60000);
  await pg.goto('https://blackreaper.us/products/the-scream',{waitUntil:'domcontentloaded'});
  await pg.waitForSelector('[data-section="ad_cards"] img',{state:'attached'}); await pg.waitForTimeout(1500);
  for (const s of await pg.$$('[data-section="ad_cards"]')) {
    await s.scrollIntoViewIfNeeded(); await pg.evaluate(()=>window.scrollBy(0,10)); await pg.waitForTimeout(2500);
  }
  const info = await pg.evaluate(()=>[...document.querySelectorAll('[data-section="ad_cards"] section')].map(s=>{const r=s.querySelector('.cb-night__row');const cs=getComputedStyle(r);return {display:cs.display,flow:cs.gridAutoFlow,cols:cs.gridAutoColumns,tpl:cs.gridTemplateColumns,ovx:cs.overflowX,w:Math.round(r.getBoundingClientRect().width),imgs:[...s.querySelectorAll('img')].map(i=>Math.round(i.getBoundingClientRect().width)+'x'+Math.round(i.getBoundingClientRect().height))}}));
  console.log(n,JSON.stringify(info));
  const secs=await pg.$$('[data-section="ad_cards"]');
  for (let i=0;i<secs.length;i++){ await secs[i].scrollIntoViewIfNeeded(); await pg.waitForTimeout(800); await secs[i].screenshot({path:`sec-${n}${i}.png`}); }
  await ctx.close();
}
await b.close();
