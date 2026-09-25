import { chromium } from "playwright";
const b = await chromium.launch({ args:["--no-sandbox","--ignore-certificate-errors"], executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [tag, base] of [["after","http://localhost:5173"],["before","https://blackreaper.us"]]) {
  const p = await b.newPage({ viewport:{width:1280,height:900} });
  await p.goto(`${base}/?store=${process.argv[2]}`, { waitUntil:"domcontentloaded", timeout:45000 });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => ({
    sections: [...document.querySelectorAll("[data-section]")].map(e => e.getAttribute("data-section")),
    h: document.body.scrollHeight,
  }));
  console.log(tag, r.h, r.sections.join(","));
  await p.close();
}
await b.close();
