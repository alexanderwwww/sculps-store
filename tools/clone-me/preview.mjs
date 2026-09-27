/**
 * See it before he does.
 *
 * The Swift cannot be compiled here, but almost everything he actually looks
 * at is HTML and canvas: the orb's face, the panel, the board. Those run in
 * Chromium perfectly well. So this pulls the orb's page straight out of
 * main.swift — the real string the app loads, never a copy — renders it at the
 * real size over a desktop-ish ground, and writes PNGs.
 *
 * Every design round goes through here first. Shipping a look I have never
 * seen, and letting him find out, is what made the last five builds his job
 * instead of mine.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const SWIFT = "app/CloneMe.app/Contents/Resources/Shell/main.swift";
const OUT = process.argv[2] || "/home/user/sculps-store/scratchpad/preview";

/** The orb's page, as the app holds it: between `static let orbHTML = """` and the closing `"""`. */
function orbHTML(source) {
  const start = source.indexOf('static let orbHTML = """');
  if (start < 0) throw new Error("no orbHTML in main.swift — did it get renamed?");
  const from = source.indexOf("\n", start) + 1;
  const end = source.indexOf('\n  """', from);
  if (end < 0) throw new Error("orbHTML is not closed");
  // Swift escapes a backslash-u as \\u inside a multiline string; nothing else
  // in this block is escaped, so the page is taken as written.
  return source.slice(from, end);
}

const swift = await readFile(SWIFT, "utf8");
const html = orbHTML(swift);
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"], executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/* Two grounds, because the whole point of glass is what is behind it: a
   photograph-ish desktop and a bright one. A tint that reads on black and
   vanishes on white is not a material. */
const GROUNDS = {
  dark: "linear-gradient(135deg,#1b2430 0%,#2d1f3d 55%,#0f1a24 100%)",
  light: "linear-gradient(135deg,#dfe7f2 0%,#f6efe6 55%,#cfd9e8 100%)",
};

for (const [name, ground] of Object.entries(GROUNDS)) {
  for (const working of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 420, height: 420 }, deviceScaleFactor: 2 });
    await page.setContent(`<!doctype html><style>
      html,body{margin:0;height:100%;background:${ground}}
      .stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
      /* The window's own material, which the canvas only tints. */
      .orb{width:216px;height:216px;border-radius:56px;overflow:hidden;position:relative;
        backdrop-filter:blur(30px) saturate(1.7);-webkit-backdrop-filter:blur(30px) saturate(1.7);
        background:rgba(255,255,255,.10);box-shadow:0 30px 60px -20px rgba(0,0,0,.55),
        inset 0 1px 0 rgba(255,255,255,.35)}
      iframe{border:0;width:100%;height:100%;background:transparent}
    </style><div class="stage"><div class="orb"><iframe id="f"></iframe></div></div>`);
    const frame = page.frameLocator("#f");
    await page.evaluate((source) => {
      const f = document.getElementById("f");
      f.contentDocument.open();
      f.contentDocument.write(source);
      f.contentDocument.close();
    }, html);
    await page.waitForTimeout(600);
    await page.evaluate((on) => {
      const w = document.getElementById("f").contentWindow;
      w.__orb && w.__orb.set({ working: on, doing: on ? "reading what is waiting" : "resting", taken: on ? 3 : 0, budget: 20 });
    }, working);
    // Long enough for the tide to finish moving between the two colours.
    await page.waitForTimeout(working ? 4200 : 1200);
    const file = `${OUT}/orb-${name}-${working ? "working" : "resting"}.png`;
    await page.screenshot({ path: file });
    console.log("wrote", file);
    await page.close();
  }
}

await browser.close();
