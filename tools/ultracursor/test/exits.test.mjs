// Build 41: the one exit symbiot, the ghost proof and the real trader share (exits.mjs).
// A pure truth table: no GMGN, no clock, no money.
import { exitReason, rulesKey, rulesOf, track, realNet, TIERS, NET_USD } from "../src/trader/exits.mjs";
import { DEFAULTS } from "../src/trader/scalp.mjs";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x ?? ""); } };

const C = { tp: 0.40, sl: -0.15, trailFrom: 0.25, holdMs: 120_000, crashMs: 20_000, crashMove: -0.08, deadMs: 30_000, deadMove: 0.02 };
// a coin's reads as [move, ageMs]; returns the first exit, the way a lane sees it
const run = (path, c = C) => { const p = { hunt: true, peak: 0 }; for (const [m, a] of path) { track(p, m); const why = exitReason(p, m, a, c); if (why) return why; } return null; };

ok("symbiot's defaults are the spec's abort numbers", ["tp", "sl", "trailFrom", "holdMs", "crashMs", "crashMove", "deadMs", "deadMove"].every((k) => DEFAULTS[k] === C[k]), DEFAULTS);
ok("+45% -> '+40%'", run([[0.45, 1000]]) === "+40%");
ok("-16% at 5 s -> 'stop -15%' (sl is checked before the crash)", run([[-0.16, 5000]]) === "stop -15%");
ok("-10% at 5 s -> 'stop: crash -10% in 5 s'", run([[-0.10, 5000]]) === "stop: crash -10% in 5 s", run([[-0.10, 5000]]));
ok("-10% at 25 s -> nothing (the crash window is the first 20 s)", run([[-0.10, 25_000]]) === null);
ok("-8% exactly at 20 s is a crash, at 20.001 s it is not", run([[-0.08, 20_000]]) === "stop: crash -8% in 20 s" && run([[-0.08, 20_001]]) === null);
ok("crashMs 0 switches the crash off", run([[-0.10, 5000]], { ...C, crashMs: 0 }) === null);
ok("crashMove 0 switches the crash off (never sells every flat coin)", run([[0, 1000]], { ...C, crashMove: 0 }) === null && run([[-0.10, 5000]], { ...C, crashMove: 0 }) === null);
ok("a +30% peak given back to +14% -> 'gave back half of +30%'", run([[0.30, 5000], [0.14, 10_000]]) === "gave back half of +30%");
ok("flat at 120.001 s -> '120 s' even with the dead rule on (hold before dead)", exitReason({ peak: 0, peakAll: 0, lowAll: 0 }, 0, 120_001, C) === "120 s");
ok("flat at 30 s -> 'dead: flat 30 s'", run([[0, 5000], [0.01, 20_000], [0, 30_000]]) === "dead: flat 30 s");
ok("flat at 29.999 s -> nothing yet", run([[0, 5000], [0, 29_999]]) === null);
ok("a dip to -3% and back to 0 is not dead (it moved)", run([[-0.03, 5000], [0, 31_000]]) === null);
ok("a rise to +3% and back to 0 is not dead (it moved)", run([[0.03, 5000], [0, 31_000]]) === null);
ok("exactly 2% either way counts as moving", run([[0.02, 5000], [0, 31_000]]) === null && run([[-0.02, 5000], [0, 31_000]]) === null);
ok("deadMs 0 or deadMove 0 switch the dead rule off", run([[0, 31_000]], { ...C, deadMs: 0 }) === null && run([[0, 31_000]], { ...C, deadMove: 0 }) === null);
ok("the crash label says stop (post-mortem files it with stops), the dead label does not", /stop/.test(run([[-0.10, 5000]])) && !/stop/.test(run([[0, 31_000]])));
ok("the build-40 labels are byte-identical", run([[0.5, 1]]) === "+40%" && run([[-0.2, 1]]) === "stop -15%" && run([[0.3, 1], [0.1, 2]]) === "gave back half of +30%" && exitReason({ peak: 0.05 }, 0.05, 120_000, C) === "120 s");
ok("a lower tp (a real target) wins first: +13% at +14%", exitReason({ peak: 0.14 }, 0.14, 1000, { ...C, tp: 0.13 }) === "+13%");

const keys = ["sl", "crashMs", "crashMove", "deadMs", "deadMove", "trailFrom", "holdMs"];
ok("rulesKey changes for every exit setting", keys.every((k) => rulesKey({ ...C, [k]: C[k] + 1 }) !== rulesKey(C)));
ok("rulesKey ignores tp (every target shares one bucket)", rulesKey({ ...C, tp: 0.13 }) === rulesKey(C) && rulesKey(C) === "sl-0.15|c20000/-0.08|d30000/0.02|t0.25|h120000", rulesKey(C));
ok("rulesOf freezes exactly the settings rulesKey names, so a real position keys the same", rulesKey(rulesOf(C)) === rulesKey(C) && Object.keys(rulesOf(C)).sort().join() === keys.sort().join());
ok("an exit from frozen rules plus a target equals the sim's", exitReason({ peak: 0 }, -0.1, 5000, { ...rulesOf(C), tp: 0.21 }) === exitReason({ peak: 0 }, -0.1, 5000, C));

{
  const p = {};
  track(p, 0.05); track(p, -0.04); track(p, 0.01); track(p, NaN);
  ok("track: highest and lowest move, and peak on a position with no hunt flag (a real one)", p.peakAll === 0.05 && p.lowAll === -0.04 && p.peak === 0.05, p);
  const q = { peak: 0.3, peakAll: 0.3, lowAll: -0.01 };
  track(q, 0.1);
  ok("track never lowers a peak or raises a low", q.peak === 0.3 && q.peakAll === 0.3 && q.lowAll === -0.01);
}
ok("the real targets are 13, 21, 34 and cannot be changed", TIERS.join() === "0.13,0.21,0.34" && Object.isFrozen(TIERS));
const r2 = (x) => Math.round(x * 100) / 100;
ok("realNet: plan step 1, $5.73 at +21% nets +$1.02", r2(realNet(0.21, 0.0125, 5.73)) === 1.02, realNet(0.21, 0.0125, 5.73));
ok("realNet: plan step 2, $6.12 at +13% nets +$0.60", r2(realNet(0.13, 0.0125, 6.12)) === 0.6, realNet(0.13, 0.0125, 6.12));
ok("realNet: plan step 3, $6.35 at +34% nets +$1.94", r2(realNet(0.34, 0.0125, 6.35)) === 1.94, realNet(0.34, 0.0125, 6.35));
ok("realNet: a -15% stop at $5.73 loses the move, both fee legs and the network", Math.abs(realNet(-0.15, 0.0125, 5.73) - (-0.8595 - 0.0716 - 0.0609 - NET_USD)) < 1e-3, realNet(-0.15, 0.0125, 5.73));
ok("realNet: flat still costs the fees (a win needs net > 0)", realNet(0, 0.0125, 5.73) < 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
