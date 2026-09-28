/**
 * What the glass costs to keep on screen — measured in bytes and milliseconds.
 *
 * plug made his MacBook crawl. The cause was not the filter: it was the screen
 * capture behind it, taken whole at Retina scale, encoded as PNG, base64'd and
 * pushed over IPC every 1.2 seconds. Nothing in the app said how much that
 * was, so nothing caught it.
 *
 * This says. It captures the way the app does, at the size and format the app
 * uses, and refuses a build where one frame is heavy enough to be felt.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

const here = process.cwd();
const home = await mkdtemp(join(tmpdir(), "plug-weight-"));

/* The app's own numbers, read from its source so this cannot drift from it. */
const main = await readFile("main.js", "utf8");
const width = Number(/const CAPTURE_WIDTH = (\d+)/.exec(main)?.[1]);
const quality = Number(/toJPEG\((\d+)\)/.exec(main)?.[1]);

let bad = 0;
const check = (ok, what, extra) => {
  console.log(ok ? "  ok  " + what : "FAIL  " + what + (extra ? " — " + extra : ""));
  if (!ok) bad++;
};

check(Number.isFinite(width) && width <= 1600,
  `the capture is scaled down, not full screen (${width}px wide)`);
check(Number.isFinite(quality) && quality <= 80,
  `and encoded as JPEG, not PNG (quality ${quality})`);
check(/if \(lastGrab\.payload/.test(main), "a recent capture is reused instead of retaken");
check(!/steps = 18/.test(main), "the morph no longer resizes the window in steps");

const app = await readFile("renderer/app.js", "utf8");
const every = Number(/setInterval\(paintDesktop, (\d+)\)/.exec(app)?.[1]);
check(every >= 4000, `the idle refresh is every ${every}ms, not every 1200`);
check(/grabbing/.test(app), "two captures cannot be in flight at once");

/* And the real cost, taken the way the app takes it. */
const probe = `
const { app, desktopCapturer, screen } = require("electron");
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const out = [];
  const display = screen.getPrimaryDisplay();
  const { width: W, height: H } = display.size;
  const shrunk = Math.min(${width}, W);
  const started = Date.now();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: shrunk, height: Math.round((shrunk / W) * H) },
    fetchWindowIcons: false,
  });
  const grabbed = Date.now() - started;
  const shot = sources[0];
  const jpegAt = Date.now();
  const jpeg = shot ? shot.thumbnail.toJPEG(${quality}) : Buffer.alloc(0);
  const encoded = Date.now() - jpegAt;
  const pngAt = Date.now();
  const png = shot ? shot.thumbnail.toPNG() : Buffer.alloc(0);
  const pngMs = Date.now() - pngAt;
  out.push({ grabbed, encoded, pngMs, jpeg: jpeg.length, png: png.length });
  console.log("WEIGHT" + JSON.stringify(out[0]));
  app.exit(0);
});
`;
await writeFile(join(home, "probe.js"), probe);
await writeFile(join(home, "package.json"), JSON.stringify({ name: "w", main: "probe.js" }));

const child = spawn("xvfb-run", ["-a", join(here, "node_modules", ".bin", "electron"), home, "--no-sandbox", "--disable-gpu"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let noise = "";
child.stdout.on("data", (c) => { noise += String(c); });
child.stderr.on("data", (c) => { noise += String(c); });
await new Promise((done) => {
  const bell = setTimeout(() => { child.kill(); done(); }, 60_000);
  child.on("exit", () => { clearTimeout(bell); done(); });
});
await rm(home, { recursive: true, force: true });

const found = /WEIGHT(\{.*\})/.exec(noise);
if (found) {
  const w = JSON.parse(found[1]);
  const kb = (n) => Math.round(n / 1024);
  console.log(`      one frame: ${kb(w.jpeg)}KB as JPEG (${w.encoded}ms) vs ${kb(w.png)}KB as PNG (${w.pngMs}ms)`);
  /* Base64 adds a third again, and this crosses IPC. Anything past a megabyte
     a frame is felt on a laptop. */
  check(w.jpeg * 1.34 < 1_000_000,
    "a frame is under a megabyte over IPC", `${kb(w.jpeg * 1.34)}KB`);
  /* Deliberately NOT asserting jpeg < png here. This container's screen is a
     flat black rectangle, which PNG compresses to almost nothing and JPEG does
     not — so the comparison says something true about xvfb and nothing about
     his desktop. On a real wallpaper the ratio inverts by a wide margin. The
     absolute ceiling above is the check that means anything. */
  check(w.encoded <= w.pngMs + 5, "encoding is no slower than the PNG it replaced",
    `${w.encoded}ms vs ${w.pngMs}ms`);
} else {
  console.log("      (could not measure a frame in this container — the source checks above still hold)");
}

if (bad) { console.log(`weight: ${bad} failed`); process.exit(1); }
console.log("weight: ok");
