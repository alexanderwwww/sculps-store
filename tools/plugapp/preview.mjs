/**
 * See the real window before he does.
 *
 * It loads renderer/index.html exactly as Electron does, fakes the desktop
 * behind it with a picture that has hard edges in it, and shoots both shapes.
 * Glass is invisible against a flat background, so the ground has windows,
 * type and stripes in it — anything that would hide a slab is the wrong test.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

const OUT = process.argv[2] || "/home/user/sculps-store/scratchpad/plugapp";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--no-sandbox", "--allow-file-access-from-files"],
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

/*
 * A DARK desktop as well as a light one.
 *
 * Everything so far was rendered over a pale wallpaper, which is the one
 * surface the design's dark ink works on. He runs a dark desktop and saw the
 * type as "light blue, and not working on every surface" — which is what dark
 * type looks like through clear glass over something dark, and I had never
 * once looked at it.
 */
const DARK = `
  background:
    radial-gradient(800px 600px at 20% 15%, #1b2a4a 0, rgba(27,42,74,0) 60%),
    radial-gradient(900px 700px at 85% 80%, #2a1b3d 0, rgba(42,27,61,0) 60%),
    linear-gradient(160deg,#080a12,#141a2b 55%,#0a0f1c);`;
const DESK = `
  background:
    radial-gradient(900px 600px at 12% 18%, #ffd2ec 0, rgba(255,210,236,0) 62%),
    radial-gradient(1000px 800px at 88% 25%, #9fd0ff 0, rgba(159,208,255,0) 60%),
    radial-gradient(900px 700px at 55% 105%, #ffc084 0, rgba(255,192,132,0) 60%),
    linear-gradient(155deg,#79a9ff,#c7a6ff 50%,#ffb3c6);`;
const STUFF = `
  <div style="position:absolute;left:30px;top:60px;width:520px;height:420px;border-radius:12px;
    background:#fff;box-shadow:0 30px 70px rgba(20,30,80,.28);overflow:hidden">
    <div style="height:36px;background:#f3f3f5;border-bottom:1px solid #e3e3e8"></div>
    <div style="padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      ${["#1c1c1c,#6b6b6b","#0f5c46,#c9b27a","#e08a2e,#f7d3a3","#6fbf3a,#dff2a8","#b8322f,#f4c0b0","#2b3a8f,#8fa2ff"]
        .map((g) => `<div style="height:120px;border-radius:6px;background:linear-gradient(135deg,${g})"></div>`).join("")}
    </div>
  </div>
  <div style="position:absolute;right:24px;top:80px;width:240px;height:520px;border-radius:12px;
    background:#fffbe8;box-shadow:0 30px 70px rgba(20,30,80,.25);padding:30px 20px;
    font:14px/1.9 -apple-system,sans-serif;color:#3b3320">
    <b style="font-size:20px">restock</b><br>— CH cross ring<br>— datejust 36<br>— birkin 30 gold<br>— jodie teen
  </div>
  <div style="position:absolute;left:40px;bottom:40px;width:420px;height:150px;
    background:repeating-linear-gradient(90deg,#101820 0 10px,#f2f4f8 10px 20px);border-radius:10px"></div>`;

async function shot(name, shapeClass, size, state, ground = DESK) {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 1000 },
    deviceScaleFactor: 2,
  });
  await page.goto(pathToFileURL(`${process.cwd()}/renderer/index.html`).href);
  /* Electron supplies window.plug; in the browser there is none, so the
     desktop is painted here the same way the app paints it. */
  await page.evaluate(({ shapeClass, size, DESK, STUFF }) => {
    document.body.className = shapeClass;
    document.body.style.cssText += "width:100vw;height:100vh";
    const ground = document.createElement("div");
    ground.style.cssText = `position:fixed;inset:0;z-index:-2;${DESK}`;
    ground.innerHTML = STUFF;
    document.body.appendChild(ground);
    const glass = document.querySelector(".glass");
    glass.style.cssText += `position:absolute;left:${(1100 - size.w) / 2}px;top:${(1000 - size.h) / 2}px;`
      + `width:${size.w}px;height:${size.h}px;inset:auto;`;
    /* The window's own capture of the desktop, which is what the filter bends. */
    const img = document.getElementById("desk");
    img.remove();
    const behind = document.querySelector(".behind");
    const copy = ground.cloneNode(true);
    copy.style.cssText = `position:absolute;left:${-((1100 - size.w) / 2)}px;top:${-((1000 - size.h) / 2)}px;`
      + `width:1100px;height:1000px;${DESK}`;
    behind.appendChild(copy);
    document.getElementById("pill").hidden = shapeClass !== "shape-pill";
    document.getElementById("phone").hidden = shapeClass !== "shape-phone";
  }, { shapeClass, size, DESK: ground, STUFF });
  if (state) {
    await page.waitForTimeout(200);
    if (state.onDark) await page.evaluate(() => document.body.classList.add("on-dark"));
    await page.evaluate((s) => window.__plug.set(s), state);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("wrote", `${OUT}/${name}.png`);
  await page.close();
}

await shot("pill", "shape-pill", { w: 320, h: 64 });
await shot("phone", "shape-phone", { w: 393, h: 852 });

/* The screen he actually lives with: both shops in, a day under way. */
await shot("working", "shape-phone", { w: 393, h: 852 }, {
  build: "001",
  shops: {
    depop: { signedIn: true, who: "@alleqsh" },
    vestiaire: { signedIn: true, who: "alleqsh" },
  },
  day: 5,
  target: 7,
  doneToday: 4,
  held: null,
  doing: "listing the Chrome Hearts cross ring",
  feed: [
    { site: "depop", line: "listed — CH cross ring · €380" },
    { site: "vestiaire", line: "offer accepted — Birkin 30 · €12,900" },
    { site: "depop", line: "answered — “is this still available?”" },
    { site: "vestiaire", line: "refreshed — Datejust 36" },
  ],
});
/* The same screens over a dark desktop, with the ink switched. */
for (const [name, shapeClass, size] of [
  ["dark-pill", "shape-pill", { w: 320, h: 64 }],
  ["dark-phone", "shape-phone", { w: 393, h: 852 }],
]) {
  await shot(name, shapeClass, size, {
    build: "003", shops: {}, doing: "Depop \u00b7 checking your shop", onDark: true,
  }, DARK);
}

await browser.close();
