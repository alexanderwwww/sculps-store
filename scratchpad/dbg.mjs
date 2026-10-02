import { chromium } from '/home/user/sculps-store/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx = await b.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true}); const pg = await ctx.newPage();
pg.on('console',m=>{ if(['error','warning'].includes(m.type())) console.log('console',m.type(),m.text().slice(0,200)); });
pg.on('pageerror',e=>console.log('pageerror',String(e).slice(0,200)));
await pg.goto('https://blackreaper.us/products/the-scream',{waitUntil:'domcontentloaded'});
await pg.waitForSelector('#proof',{timeout:60000}); await pg.waitForTimeout(3000);
console.log(await pg.evaluate(()=>[...document.querySelectorAll('[data-section]')].map(d=>d.dataset.section+':'+d.innerHTML.length).join(' ')));
await b.close();
