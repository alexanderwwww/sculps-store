import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const src = readFileSync("/home/user/sculps-store/tools/promptbot/live.mjs","utf8");
const fn = src.match(/async function blobCount\(page\) \{[\s\S]*?\n\}\n/)[0];
const site = { ask:['div#prompt-textarea[contenteditable="true"]'], composer:['form[data-type="unified-composer"]',"form"], thread:['[data-message-author-role]',"article"] };
const blobCount = new Function("site", fn + "; return blobCount;")(site);
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await b.newPage();
let bad=0; const check=(n,got,want)=>{ console.log(got===want?"PASS":"FAIL",n,got,"want",want); if(got!==want) bad++; };
const px = (c)=>"data:image/svg+xml;utf8,"+encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' fill='${c}'/></svg>`);
// new-style composer: no form, https thumbnails above the box, plus small icons and a sidebar logo
await page.setContent(`<body><aside><img src="${px('red')}" width=40 height=40></aside><div class="wrap"><div class="strip">
 <img src="${px('#111')}" width=120 height=120><img src="${px('#222')}" width=120 height=120><img src="${px('#333')}" width=120 height=120><img src="${px('#444')}" width=120 height=120>
</div><div id="prompt-textarea" contenteditable="true" style="height:40px"></div><div class="tools"><img src="${px('blue')}" width=24 height=24></div></div></body>`);
check("new composer: 4 thumbnails counted, icons ignored", await blobCount(page), 4);
await page.evaluate(()=>{ for (const i of document.querySelectorAll(".strip img")) i.remove(); });
check("empty composer counts 0", await blobCount(page), 0);
// old-style: blob thumbnails inside a form still count
await page.setContent(`<body><form data-type="unified-composer"><img id=a width=20 height=20><div id="prompt-textarea" contenteditable="true"></div></form></body>`);
await page.evaluate(async ()=>{ const blob = await (await fetch("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")).blob(); document.getElementById("a").src = URL.createObjectURL(blob); await new Promise(r=>setTimeout(r,200)); });
check("old composer: blob thumbnail still counts", await blobCount(page), 1);
// a generated picture in the thread must not count
await page.setContent(`<body><div data-message-author-role="assistant"><img src="${px('green')}" width=300 height=300></div><form><div id="prompt-textarea" contenteditable="true"></div></form></body>`);
check("thread picture ignored", await blobCount(page), 0);
await b.close(); process.exit(bad?1:0);
