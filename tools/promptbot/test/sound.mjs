/**
 * The chime rings once per landing, not once per sparkle — twenty at a time
 * would be a smashed window rather than a bell.
 */
import { chromium } from "playwright";
import { attachWand } from "/home/user/sculps-store/tools/promptbot/wand.mjs";
const SP = "/tmp/claude-0/-home-user-sculps-store/4b2cba19-2b7c-5b69-876f-e326d34c8f06/scratchpad/wtest";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--ignore-certificate-errors", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
await p.goto(`file://${SP}/page.html`);
await p.evaluate(() => {
  window.__osc = 0;
  const real = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function (...a) { window.__osc++; return real.apply(this, a); };
});
const w = await attachWand(p);
let fails = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) fails++; };

await w.point(p.locator("#prompt-textarea"));
await p.waitForTimeout(300);
const one = await p.evaluate(() => window.__osc);
check("one landing rings once (two tones)", one === 2, `${one} tones`);

// Twenty sparkles land in that same burst; none of them may ring again.
await p.waitForTimeout(200);
const still = await p.evaluate(() => window.__osc);
check("the burst's own sparkles stay silent", still === one, `${still} tones`);

// A landing a second later is a new event and should ring.
await p.waitForTimeout(900);
await w.point(p.locator("[data-testid=send-button]"));
await p.waitForTimeout(300);
const two = await p.evaluate(() => window.__osc);
check("the next landing rings again", two === 4, `${two} tones`);

// Quiet while it waits — a chime every two seconds for four minutes is a tap.
await w.idle(true);
await p.waitForTimeout(2500);
const idle = await p.evaluate(() => window.__osc);
check("silent while waiting", idle === two, `${idle} tones`);

await b.close();
console.log(fails ? `\n${fails} FAILED\n` : "\nall passed\n");
process.exit(fails ? 1 : 0);
