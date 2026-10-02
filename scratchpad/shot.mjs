import { chromium } from '/home/user/sculps-store/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [n,vp] of [['m',{width:390,height:844}],['d',{width:1440,height:900}]]) {
  const ctx = await b.newContext({viewport:vp,ignoreHTTPSErrors:true}); const pg = await ctx.newPage(); pg.setDefaultTimeout(60000);
  await pg.goto('https://blackreaper.us/products/the-scream',{waitUntil:'domcontentloaded'});
  await pg.waitForSelector('[data-section="ad_cards"] img',{state:'attached',timeout:60000}); await pg.waitForTimeout(2500);
  const secs=await pg.$$('[data-section="ad_cards"]');
  for (const s of secs) { await s.scrollIntoViewIfNeeded(); await pg.waitForTimeout(1200); }
  const first=await pg.$('[data-section="social_proof_images"]'); const last=secs[secs.length-1];
  const a=await first.boundingBox(), l=await last.boundingBox(); const sy=await pg.evaluate(()=>scrollY);
  await pg.screenshot({path:`live-${n}.png`,fullPage:true,clip:{x:0,y:a.y+sy,width:vp.width,height:Math.min(2400,l.y+l.height-a.y)}});
  console.log(n,JSON.stringify(await pg.evaluate(()=>[...document.querySelectorAll('[data-section="ad_cards"]')].map(d=>({h:Math.round(d.getBoundingClientRect().height),w:Math.round(d.getBoundingClientRect().width)})))));
  await ctx.close();
}
await b.close();
