/**
 * Proves the panel draws under the CSP the real sites serve, and that every
 * control on it actually does something.
 *
 * The overlay is a template literal, so a stray backtick or ${ inside it —
 * including in a comment — breaks it at a line nowhere near the cause.
 * Compiling it here is the only thing that catches that.
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { panelSource, CREW } from "../panel.mjs";

const here = dirname(fileURLToPath(import.meta.url));
let bad = 0;
const ok = (n, good, extra = "") => {
  console.log(`${good ? "  ok  " : "FAIL  "}${n}${extra ? " — " + extra : ""}`);
  if (!good) bad++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// It has to be valid JavaScript before it is anything else.
try {
  new Function(panelSource());
  ok("the overlay compiles", true);
} catch (e) {
  ok("the overlay compiles", false, e.message);
}
ok("no node value leaked into it", !panelSource().includes("__CREW__"));

const browser = await chromium.launch({
  executablePath: process.env.OX_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto("file://" + join(here, "page.html"));
await page.evaluate(panelSource());
await sleep(700);

ok("panel mounts", await page.evaluate(() => Boolean(window.__oxPanel)));

// Drawn, not merely created — this is the part a stylesheet policy breaks.
const drawn = await page.evaluate(() => {
  const el = document.getElementById("ox-panel");
  if (!el) return null;
  const cs = getComputedStyle(el);
  const box = el.getBoundingClientRect();
  return {
    opacity: cs.opacity,
    blur: cs.backdropFilter || cs.webkitBackdropFilter,
    w: Math.round(box.width), h: Math.round(box.height),
    cx: Math.round(box.left + box.width / 2),
    radius: cs.borderRadius,
  };
});
ok("pill is painted and settled", drawn && drawn.opacity === "1" && drawn.w > 200 && drawn.h < 60, JSON.stringify(drawn));
ok("it is centred, not parked in a corner", Math.abs(drawn.cx - 600) < 3, String(drawn.cx));
ok("the glass is really glass", Boolean(drawn?.blur && drawn.blur !== "none"), drawn?.blur);
ok("it is a pill, not a card", drawn.radius.startsWith("999px"), drawn.radius);

// Lighting someone up changes only their row.
await page.evaluate(() => window.__oxPanel.working("sam", "@spookyhome — watched 14, liked 2"));
await sleep(350);
const lit = await page.evaluate(() => ({
  who: document.getElementById("ox-who")?.textContent,
  did: document.getElementById("ox-did")?.textContent,
}));
ok("it names who is working", lit.who === "Sam", JSON.stringify(lit));
ok("and what they are doing", (lit.did ?? "").includes("watched 14"), lit.did);

// The update bar moves and then gets out of the way.
await page.evaluate(() => window.__oxPanel.progress(40, "installing"));
await sleep(600);
const mid = await page.evaluate(() => {
  const b = document.getElementById("ox-bar");
  return b ? { w: b.style.width } : null;
});
ok("the bar fills", mid?.w === "40%", JSON.stringify(mid));
await page.evaluate(() => window.__oxPanel.progress(100, "done"));
await sleep(900);
ok("and never sits at 99 — it finishes, then goes", await page.evaluate(() => {
  return document.getElementById("ox-bar-track")?.style.opacity === "0";
}));

// Escape stops it, from anywhere.
await page.keyboard.press("Escape");
await sleep(200);
ok("Escape stops it", await page.evaluate(() => window.__oxPanel.stopped === true));

// So does the button.
await page.evaluate(() => { window.__oxPanel.stopped = false; });
const stopBtn = await page.$("#ox-stop");
await stopBtn.click();
await sleep(200);
ok("the Stop button stops it", await page.evaluate(() => window.__oxPanel.stopped === true));

/* The connection rows are the one thing that decides whether anything else
   can happen, so they are checked rather than looked at. */
await page.evaluate(() => {
  window.__oxPanel.connection("instagram", "connected", "@spookyhome");
  window.__oxPanel.connection("tiktok", "waiting");
  window.__oxPanel.connection("youtube", "off");
});
await sleep(350);
const conns = await page.evaluate(() =>
  ["instagram", "tiktok", "youtube"].map((p) => {
    const dot = document.getElementById("ox-conn-" + p);
    return { p, green: dot.style.background.includes("57, 255, 122"), title: dot.title };
  }),
);
ok("only a connected platform goes green", conns.filter((c) => c.green).length === 1, JSON.stringify(conns));
ok("it carries the handle it actually read", conns[0].title.includes("@spookyhome"), conns[0].title);
ok("one waiting says what to do", conns[1].title.includes("sign in"), conns[1].title);
ok("one off says so", conns[2].title.includes("not connected"), conns[2].title);

await page.screenshot({ path: "/tmp/claude-0/panel.png" });
await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall passed");
process.exit(bad ? 1 : 0);
