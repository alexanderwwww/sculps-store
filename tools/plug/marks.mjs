/**
 * plug's mark, drawn and looked at before he is asked to choose.
 *
 * Three takes on one squircle, rendered at 1024 and then shown together at
 * 128, 48 and 20 points — because 1024 flatters everything and 20 is the size
 * he actually lives with in the Dock. An icon judged only at full size is how
 * you end up with a green square with mush on it, which is exactly what the
 * wordmark turned out to be.
 *
 * Whichever he picks becomes the .icns through make-icon.mjs.
 *
 * Usage: node tools/plug/marks.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const OUT = process.argv[2] || "scratchpad/plug-icon";
await mkdir(OUT, { recursive: true });
const b = await chromium.launch({ args:["--no-sandbox"], executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/* Three takes, all on the same squircle so they can be judged against each
   other rather than against a memory. */
const TAKES = {
  // 1. The prongs. Reads as a plug at 16px, which is the only size that matters.
  prongs: `
    <div class="tile" style="background:linear-gradient(155deg,#111 0%,#2b2b2e 100%)">
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <rect x="34" y="18" width="10" height="30" rx="5" fill="#fff"/>
        <rect x="56" y="18" width="10" height="30" rx="5" fill="#fff"/>
        <path d="M26 48h48v10a24 24 0 0 1-24 24 24 24 0 0 1-24-24z" fill="#fff"/>
      </svg>
    </div>`,
  // 2. The wordmark. Lowercase, tight, confident.
  word: `
    <div class="tile" style="background:linear-gradient(155deg,#39FF7A 0%,#0FC85A 100%)">
      <span style="font:800 300px/1 -apple-system,'SF Pro Display',Inter,sans-serif;
        letter-spacing:-.06em;color:#06240F">plug</span>
    </div>`,
  // 3. Glass: the app's own material as its mark.
  glass: `
    <div class="tile" style="background:linear-gradient(155deg,#2193b0 0%,#c471ed 55%,#f64f59 100%)">
      <div style="position:absolute;inset:16px;border-radius:26px;
        backdrop-filter:blur(8px);border:1.5px solid rgba(255,255,255,.7);
        box-shadow:inset 0 2px 12px rgba(255,255,255,.35)"></div>
      <svg viewBox="0 0 100 100" width="62%" height="62%" style="position:relative">
        <rect x="35" y="22" width="9" height="26" rx="4.5" fill="#fff"/>
        <rect x="56" y="22" width="9" height="26" rx="4.5" fill="#fff"/>
        <path d="M28 48h44v9a22 22 0 0 1-22 22 22 22 0 0 1-22-22z" fill="#fff"/>
      </svg>
    </div>`,
};

for (const [name, art] of Object.entries(TAKES)) {
  const p = await b.newPage({ viewport:{width:1024,height:1024}, deviceScaleFactor:1 });
  await p.setContent(`<!doctype html><style>
    html,body{margin:0;width:1024px;height:1024px;background:transparent}
    .tile{position:absolute;inset:0;border-radius:230px;display:flex;
      align-items:center;justify-content:center;overflow:hidden}
    svg{display:block}
  </style><div style="position:absolute;inset:0;transform:scale(1);">
    <div style="position:absolute;inset:0;font-size:0">${art}</div></div>`);
  await p.waitForTimeout(250);
  await p.screenshot({ path:`${OUT}/${name}-1024.png`, omitBackground:true });
  // And the size that decides it.
  await p.setViewportSize({ width:1024, height:1024 });
  console.log("wrote", name);
  await p.close();
}

/* A contact sheet at real Dock size, because 1024 flatters everything.
   The PNGs go in as data URIs: a page loaded with setContent cannot read
   file:// and quietly renders a broken-image glyph instead, which looks like
   an icon that did not come out. */
const { readFile } = await import("node:fs/promises");
const data = {};
for (const n of Object.keys(TAKES)) {
  data[n] = "data:image/png;base64," + (await readFile(`${OUT}/${n}-1024.png`)).toString("base64");
}
const sheet = await b.newPage({ viewport:{width:900,height:300}, deviceScaleFactor:2 });
await sheet.setContent(`<!doctype html><style>
  body{margin:0;background:#1d2430;display:flex;gap:56px;align-items:center;
    justify-content:center;height:300px;font:600 13px -apple-system,sans-serif;color:#9fb0c6}
  figure{margin:0;text-align:center} img{display:block;margin:0 auto 14px}
</style>
${Object.keys(TAKES).map((n)=>`<figure>
  <img src="${data[n]}" width="128" height="128">
  <img src="${data[n]}" width="48" height="48" style="margin-top:-6px">
  <img src="${data[n]}" width="20" height="20" style="margin-top:-6px">
  ${n}</figure>`).join("")}`);
await sheet.waitForTimeout(400);
await sheet.screenshot({ path:`${OUT}/sheet.png` });
await b.close();
console.log("sheet written");
