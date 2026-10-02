import { chromium } from '/home/user/sculps-store/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx = await b.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true}); const pg = await ctx.newPage();
await pg.goto('https://blackreaper.us/products/the-scream',{waitUntil:'domcontentloaded'});
await pg.waitForSelector('#proof',{timeout:60000}); await pg.waitForTimeout(3000);
console.log(await pg.evaluate(()=>{const d=document.querySelector('[data-section="ad_cards"]');const k=Object.keys(d).find(k=>k.startsWith('__reactFiber'));let f=d[k];const out=[];
 for(let i=0;i<3&&f;i++){out.push(f.type?.name||String(f.type)); f=f.child}
 const sec=d[k].memoizedProps?.children?.props?.section; return JSON.stringify({chain:out,type:sec?.type,nblocks:sec?.blocks?.length,b0:sec?.blocks?.[0]});}));
await b.close();
