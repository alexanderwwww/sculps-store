import { chromium } from '/home/user/sculps-store/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
for (const [n,vp] of [['m',{width:390,height:844}],['d',{width:1440,height:900}]]) {
  const pg = await b.newPage({viewport:vp});
  await pg.goto('https://blackreaper.us/products/the-scream',{waitUntil:'networkidle'});
  const el = await pg.$('section.cb-night--cards'); 
  console.log(n, !!el);
  if (el) { await el.scrollIntoViewIfNeeded(); await pg.waitForTimeout(1500); await el.screenshot({path:`cards-${n}.png`}); }
  await pg.screenshot({path:`top-${n}.png`});
}
await b.close();
