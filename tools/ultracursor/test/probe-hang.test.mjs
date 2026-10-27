// build 53: a GMGN page that never answers (Alex's real, busy page held page.evaluate for minutes
// and the probe never reported). The probe must come back with a report, in time, saying why.
import { gmgnTradeProbe, SCAN_MS, FULL_SCAN_MS } from "../src/trader/real/probe.mjs";

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : JSON.stringify(x).slice(0, 400)); } };

const never = () => new Promise(() => {});
const frame = { evaluate: never, url: () => "https://gmgn.ai/sol/token/x", name: () => "", locator: () => ({ first: () => ({ ariaSnapshot: never }) }) };
const page = { frames: () => [frame], url: () => "https://gmgn.ai/sol/token/x" };

const t0 = Date.now();
const rep = await gmgnTradeProbe(page);
const took = Date.now() - t0;
ok(`a page that never answers: the probe returns in under ${(SCAN_MS + FULL_SCAN_MS) / 1000 + 3} s (took ${(took / 1000).toFixed(1)} s)`, took < SCAN_MS + FULL_SCAN_MS + 3000, took);
ok("the report says the scans timed out, not that it found a trade box", rep.tradeBox === null && rep.instant.open === false && /timed out/.test(String(rep.frames[0].error)) && /timed out/.test(String(rep.instant.why)), { frames: rep.frames, why: rep.instant.why });

// An Instant window that answers at once: the heavy whole-page scan is not run at all.
let heavy = 0;
const quickFrame = {
  evaluate: async (fn) => {
    const name = fn.name || String(fn).slice(0, 40);
    if (/instantScan/.test(name)) return { open: true, buyPresets: [{ text: "0.01618" }], sellPcts: ["25%", "50%", "100%"], chips: [{ text: "0.13" }], winSol: 0.13, toggle: { count: 1 } };
    heavy++;
    return { controls: [], box: null };
  },
  url: () => "https://gmgn.ai/sol/token/x", name: () => "",
};
const rep2 = await gmgnTradeProbe({ frames: () => [quickFrame], url: () => "https://gmgn.ai/sol/token/x" });
ok("an Instant window with its presets and Sell 100% skips the heavy page scan", heavy === 0 && rep2.instant.open === true && rep2.frames[0].error === null, { heavy, open: rep2.instant.open });

console.log(`\nprobe-hang.test.mjs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
