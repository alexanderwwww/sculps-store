import { chromium } from "playwright";
const b = await chromium.launch({ args:["--no-sandbox"], executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport:{width:402,height:874}, deviceScaleFactor:2 });
await p.goto("file:///home/user/sculps-store/scratchpad/bank/card.html");
await p.waitForTimeout(2200);
await p.screenshot({ path:"scratchpad/bank/card.png" });
await b.close();
