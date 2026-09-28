/**
 * Nothing animates over the glass, forever.
 *
 * His Mac is a 2020 Air — 1.1GHz dual-core i3 on Intel Iris Plus — and plug
 * made it crawl while doing nothing at all. The cause was a one-second
 * infinite spin sitting above the refraction: Chromium re-evaluates a
 * backdrop-filter whenever anything over it changes, so that decoration was
 * running three displacement maps sixty times a second, forever.
 *
 * So: no infinite animation anywhere in this app. A transition that ends is
 * fine — it costs a moment and stops. An `infinite` does not stop, and on this
 * machine that is a core burned on wallpaper.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

let bad = 0;
const check = (ok, what, extra) => {
  console.log(ok ? "  ok  " + what : "FAIL  " + what + (extra ? " — " + extra : ""));
  if (!ok) bad++;
};

const files = (await readdir("renderer")).filter((f) => /\.(html|css|js)$/.test(f));
for (const file of files) {
  const source = await readFile(join("renderer", file), "utf8");
  const forever = [...source.matchAll(/animation[^;{}]*\binfinite\b/g)].map((m) => m[0].trim());
  check(forever.length === 0, `${file} has no endless animation over the glass`,
    forever.join(" · "));
}

/* And the capture, which was the other half of it. */
const main = await readFile("main.js", "utf8");
const app = await readFile("renderer/app.js", "utf8");
const width = Number(/const CAPTURE_WIDTH = (\d+)/.exec(main)?.[1]);
const every = Number(/setInterval\(paintDesktop, (\d+)\)/.exec(app)?.[1]);
check(width <= 1000, `the capture is ${width}px wide — sized for a 2020 Air`);
check(every >= 8000, `it refreshes every ${every}ms while idle`);
check(/isVisible\(\)/.test(main), "and nothing is captured for a window nobody can see");

if (bad) { console.log(`idle: ${bad} failed`); process.exit(1); }
console.log("idle: ok");
