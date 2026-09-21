/**
 * Proves the overlay actually draws, under the content security policy the
 * real sites serve.
 *
 * This exists because "it mounted and returned true" is not evidence. The
 * wand's first overlay did exactly that and drew nothing for a day.
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { attach, say, click, type, moveTo, sleep } from "../browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const EXE = process.env.OX_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};

const browser = await chromium.launch({
  executablePath: EXE,
  args: ["--no-sandbox", "--ignore-certificate-errors", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
await page.goto("file://" + join(here, "page.html"));
await attach(page);

// It is present...
check("overlay mounts", await page.evaluate(() => Boolean(window.__ox)));

// ...and it is actually PAINTED, which is the part the CSP breaks.
const drawn = await page.evaluate(() => {
  const nodes = [...document.documentElement.children].filter((n) => n.tagName === "DIV");
  if (!nodes.length) return { count: 0 };
  const cs = nodes.map((n) => getComputedStyle(n));
  return {
    count: nodes.length,
    positioned: cs.filter((s) => s.position === "fixed").length,
    onTop: cs.filter((s) => s.zIndex === "2147483647").length,
    hasGlow: cs.some((s) => (s.boxShadow || "").includes("57, 255, 122")),
  };
});
check("cursor is drawn, not just created", drawn.positioned >= 2 && drawn.onTop >= 2, JSON.stringify(drawn));
check("the green survived the CSP", drawn.hasGlow === true);

// The label says things. Read it after the fade, not during: a computed
// opacity sampled mid-transition is an intermediate value, which reads as a
// failure when nothing is wrong.
await say(page, "watching a clip");
/*
 * Wait for the value, not for a duration.
 *
 * This slept 400ms for a 220ms fade and failed about one run in four,
 * because a computed opacity sampled while the main thread is busy is still
 * mid-transition. A test that sleeps a fixed time to wait for an animation is
 * flaky by construction, and a flaky test is worse than no test — it teaches
 * you to ignore a red run.
 */
const label = await page
  .waitForFunction(() => {
    const el = document.getElementById("ox-label");
    if (!el || getComputedStyle(el).opacity !== "1") return null;
    return { text: el.textContent, opacity: "1" };
  }, null, { timeout: 5000 })
  .then((h) => h.jsonValue())
  .catch(() => null);
check("label shows text", label?.text === "watching a clip" && label.opacity === "1", JSON.stringify(label));

/*
 * The cursor lands ON the target, not merely somewhere new.
 *
 * Note the page's own inline style attributes are blocked by the CSP above —
 * that is deliberate, and it is why the button is not where its markup asks
 * to be. The overlay draws anyway, because styles set through the CSSOM are
 * not covered by style-src. That difference is the whole reason this file
 * exists.
 */
const like = await page.$("#like");
const box = await like.boundingBox();
await moveTo(page, like);
const at = await page.evaluate(() => {
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(
    document.getElementById("ox-cursor")?.style.transform ?? "",
  );
  return m ? { x: +m[1], y: +m[2] } : null;
});
const inside =
  at && at.x >= box.x && at.x <= box.x + box.width && at.y >= box.y && at.y <= box.y + box.height;
check("cursor landed inside the target", Boolean(inside), JSON.stringify({ at, box }));
check("not dead centre", at && Math.abs(at.x - (box.x + box.width / 2)) > 0.01);

// A click lands on the element, not near it.
await page.evaluate(() => { window.__clicked = false; document.getElementById("like").onclick = () => (window.__clicked = true); });
await click(page, await page.$("#like"));
check("click reaches the button", await page.evaluate(() => window.__clicked === true));

// Typing produces keystrokes over time, not a paste.
await (await page.$("#box")).click();
const t0 = Date.now();
await type(page, "omg the witch one is unreal", { typing: { cpsMin: 9, cpsMax: 14, typoRate: 0.06 } });
const ms = Date.now() - t0;
const text = await page.inputValue("#box");
check("typed character by character", ms > 900, `${ms}ms`);
check("text arrived", text.length > 10, JSON.stringify(text));

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
