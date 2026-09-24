import { chromium } from "playwright";
const B = "http://localhost:5173/?store=cryo";
const b = await chromium.launch({ args: ["--ignore-certificate-errors"], executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errs = [];
for (const [w,h,name] of [[1440,900,"desktop"],[400,900,"mobile"]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on("pageerror", e => errs.push(`${name}: ${e.message}`));
  await p.goto(B, { waitUntil: "networkidle" });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(name, "overflow", overflow);
  if (name === "mobile") {
    const burger = await p.$('button[aria-label*="enu" i], .cy-burger, [aria-label="Menu"]');
    console.log("burger present:", !!burger);
    if (burger) { await burger.click(); await p.waitForTimeout(400); console.log("panel open:", !!(await p.$(".cy-menu.is-open"))); console.log("panel has buy:", !!(await p.$(".cy-menu .cy-btn"))); await p.keyboard.press("Escape"); await p.waitForTimeout(500); console.log("panel closed by Escape:", !(await p.$(".cy-menu.is-open"))); }
  }
  // add to cart
  const add = await p.$('button[type="submit"]');
  if (add) {
    await add.click();
    await p.waitForTimeout(1500);
    const open = await p.$('.cy-drawer.is-open');
    console.log(name, "drawer opened:", !!open);
    if (open) console.log(name, "drawer text:", (await open.innerText()).replace(/\s+/g," ").slice(0,160));
  }
  await p.screenshot({ path: `/tmp/claude-0/-home-user-sculps-store/4b2cba19-2b7c-5b69-876f-e326d34c8f06/scratchpad/cryo-${name}.png`, fullPage: false });
  await p.close();
}
console.log("pageerrors:", errs.length ? errs : "none");
await b.close();
