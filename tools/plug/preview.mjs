/**
 * See it before he does.
 *
 * The window itself is Swift and cannot be compiled here, but the screens he
 * actually looks at are HTML — so they run in Chromium perfectly well. This
 * renders them at the real size, over a desktop with things behind it, and
 * writes PNGs.
 *
 * Every design round goes through here first. Shipping a screen nobody has
 * laid eyes on is what made eleven builds his job instead of mine.
 */
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const OUT = process.argv[2] || "/home/user/sculps-store/scratchpad/plug-ui";
await mkdir(OUT, { recursive: true });

const icon = "data:image/png;base64," + (await readFile("design/icon-source.png")).toString("base64");
/* The same two substitutions the window makes, or this renders a page the app
   never shows — placeholders and all. */
const welcome = (await readFile("app/Plug.app/Contents/Resources/Shell/welcome.html", "utf8"))
  .replace(/\{\{MARK\}\}/g, icon)
  .replace(/\{\{BUILD\}\}/g, "001");

const browser = await chromium.launch({
  args: ["--no-sandbox"],
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

/* A desktop with edges in it. A flat gradient behind glass proves nothing —
   transparency is only visible when there is something to see through it. */
const GROUND = `
  position:absolute;inset:0;
  background:
    radial-gradient(1200px 700px at 18% 12%, #4a7fd6 0%, transparent 60%),
    radial-gradient(900px 600px at 82% 78%, #6fa8ff 0%, transparent 62%),
    linear-gradient(140deg,#1b3b77 0%,#2f6ad0 45%,#8fc2ff 100%);`;
const CLUTTER = `
  <div style="position:absolute;left:24px;top:120px;width:260px;height:320px;border-radius:18px;
    background:linear-gradient(160deg,#ff5f6d,#ffc371);opacity:.92"></div>
  <div style="position:absolute;right:20px;top:60px;width:230px;height:240px;border-radius:18px;
    background:repeating-linear-gradient(45deg,#101820 0 14px,#f2f4f8 14px 28px);opacity:.85"></div>
  <div style="position:absolute;left:60px;bottom:40px;font:800 74px/1 -apple-system,sans-serif;
    color:rgba(255,255,255,.55)">DEPOP</div>`;

/*
 * The window's own material, as the app really makes it: no tinted panel, a
 * hairline edge, and the desktop reading through. A preview that flatters the
 * glass is worse than none — it agrees with you and ships a slab.
 */
const GLASS = `
  position:relative;border-radius:46px;overflow:hidden;
  border:1px solid rgba(255,255,255,.34);
  box-shadow:0 40px 90px -30px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.28);`;

async function shot(name, { width, height, inner, state }) {
  const page = await browser.newPage({
    viewport: { width: width + 240, height: height + 160 },
    deviceScaleFactor: 2,
  });
  await page.setContent(`<!doctype html><style>
    html,body{margin:0;height:100%;font-family:-apple-system,sans-serif}
    .desk{${GROUND}}
    .stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
  </style><div class="desk">${CLUTTER}</div>
  <div class="stage"><div style="${GLASS}width:${width}px;height:${height}px">${inner}</div></div>`);
  if (state) {
    await page.waitForTimeout(150);
    await page.evaluate(([s, mark]) => {
      const w = document.querySelector("iframe").contentWindow;
      w.__plug.mark(mark);
      w.__plug.set(s);
    }, [state, icon]);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("wrote", `${OUT}/${name}.png`);
  await page.close();
}

const framed = `<iframe style="border:0;width:100%;height:100%;background:transparent"
  srcdoc="${welcome.replace(/"/g, "&quot;")}"></iframe>`;

/* The phone, at the size of a real one — 393 by 852. */
await shot("welcome-fresh", {
  width: 393, height: 852, inner: framed,
  state: { build: "001", shops: {}, doing: "" },
});
await shot("welcome-connected", {
  width: 393, height: 852, inner: framed,
  state: {
    build: "001",
    shops: { depop: { signedIn: true, who: "@alleqsh" }, vestiaire: { signedIn: true, who: "alleqsh" } },
    doing: "reading the Depop shelf",
  },
});

await browser.close();
