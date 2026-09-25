import { chromium } from "playwright";
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const GIF=Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==","base64");
const seen=[];const rungs=[];
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
const c=await b.newContext({userAgent:UA,viewport:{width:1280,height:900}});
await c.route(u=>u.pathname.startsWith("/px/tr"),async r=>{const q=new URL(r.request().url()).searchParams;seen.push(q.get("ev")+"="+(q.get("cd[value]")??""));await r.fulfill({status:200,contentType:"image/gif",body:GIF})});
const p=await c.newPage();
p.on("response",async r=>{if(r.url().includes("/rung")){try{rungs.push(await r.json())}catch{}}});
await p.goto("http://localhost:5173/?store=reaper",{waitUntil:"load"});
await p.waitForTimeout(2500);
const ids=await p.$$eval("[data-variant]",els=>els.map(e=>e.getAttribute("data-variant")));
console.log("variants:",ids);
for(const id of ids){
  const r=await p.evaluate(async id=>{const res=await fetch("/cart/add?store=reaper",{method:"POST",body:new URLSearchParams({variantId:id,quantity:"1"})});return res.url},id);
  console.log("add",id,"->",r);
  if(!/unavailable/.test(r))break;
}
await p.goto("http://localhost:5173/checkout?store=reaper",{waitUntil:"load"});
await p.waitForTimeout(8000);
console.log("checkout url:",p.url());
console.log("events:",seen);
console.log("rungs:",JSON.stringify(rungs));
console.log("cookies:",(await c.cookies()).filter(x=>["_fbp","kerberos_rungs"].includes(x.name)).map(x=>x.name+"="+x.value));
await b.close();
