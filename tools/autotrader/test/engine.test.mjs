import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS, entrySignal, managePosition } from "../src/lib/strategy.mjs";
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, d ?? ""); } };
const T0 = 1_800_000_000_000, M = 60000;
const mk = (i, o, c, h = Math.max(o, c), l = Math.min(o, c), v = 10) => ({ t: T0 + i * M, o, h, l, c, v });
// flat 30 candles, then a breakout on rising volume
const base = Array.from({ length: 30 }, (_, i) => mk(i, 1, 1.0 + (i % 2 ? 0.001 : -0.001)));
const spike = [mk(30, 1, 1.05, 1.06, 1, 40), mk(31, 1.05, 1.12, 1.13, 1.05, 60), mk(32, 1.12, 1.2, 1.21, 1.12, 90)];
const up = [...base, ...spike];
const meta = { created: T0, liqUsd: 9000 };
ok("breakout with volume and green candles is a signal", entrySignal(up, up.length - 1, DEFAULTS, meta).ok, entrySignal(up, up.length - 1, DEFAULTS, meta));
ok("flat market is not", !entrySignal(base, base.length - 1, DEFAULTS, meta).ok);
ok("thin liquidity is refused with its reason", /liquidity/.test(entrySignal(up, up.length - 1, DEFAULTS, { ...meta, liqUsd: 500 }).why));
ok("too-young pool is refused", /age/.test(entrySignal(up, up.length - 1, DEFAULTS, { created: T0 + 31 * M, liqUsd: 9000 }).why));
const dump = [...up, mk(33, 1.2, 1.0, 1.2, 0.95, 80)];
const x1 = managePosition(dump, up.length - 1, DEFAULTS);
ok("stop loss fires and is a loss after costs", !x1.open && /stop/.test(x1.why) && x1.ret < 0, x1);
const moon = [...up, mk(33, 1.2, 1.5, 1.8, 1.2, 80)];
const x2 = managePosition(moon, up.length - 1, DEFAULTS);
ok("take profit fires and is a win after costs", !x2.open && /take profit/.test(x2.why) && x2.ret > 0, x2);
ok("nothing fired yet = still open", managePosition(up, up.length - 1, DEFAULTS).open === true);

// engine with a fake feed, a crash in the middle, and a restart
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-"));
const jf = path.join(dir, "j.jsonl");
let series = up, now = T0 + 33 * M;
const pool = { pool: "P1", name: "TEST", mint: "MINT111111", created: T0, liqUsd: 9000, vol5: 100 };
const feed = { newPools: async () => [pool], trendingPools: async () => [], candles: async () => series };
let sold = 0;
const exec = { name: "paper", buy: async () => ({ ok: true }), sell: async () => { sold++; } };
const rug = async () => ({ pass: true, reason: "ok" });
let e = new Engine({ feed, exec, journal: new Journal(jf), rug, now: () => now });
await e.tick();
ok("one tick opens one position", e.open.size === 1 && e.status().open[0].name === "TEST", e.status());
ok("the signal's reason is recorded", /breakout/.test([...e.open.values()][0].enter));
e = new Engine({ feed, exec, journal: new Journal(jf), rug, now: () => now });             // "crash" and restart
ok("after a restart the position is still known (the ultracursor bug)", e.open.size === 1, e.status());
series = [...up, mk(33, 1.2, 1.5, 1.8, 1.2, 80)];
now += 2 * M;
await e.tick();
ok("it closes on take profit with a positive pnl and calls the executor", e.open.size === 0 && e.closed.length === 1 && e.closed[0].pnl > 0 && sold === 1, e.status());
ok("equity moved by exactly the pnl", Math.abs(e.equity - (100 + e.closed[0].pnl)) < 1e-9);
// rug-check veto
const jf2 = path.join(dir, "j2.jsonl");
series = up;
const e2 = new Engine({ feed, exec, journal: new Journal(jf2), rug: async () => ({ pass: false, reason: "danger: Freeze Authority still enabled" }), now: () => now });
await e2.tick();
ok("a failed rug check means no position and the reason is shown", e2.open.size === 0 && Object.keys(e2.status().whyNot).some((k) => /rug check/.test(k)), e2.status().whyNot);
// executor refusal
const e3 = new Engine({ feed, exec: { name: "paper", buy: async () => ({ ok: false, why: "no route" }), sell: async () => {} }, journal: new Journal(path.join(dir, "j3.jsonl")), rug, now: () => now });
await e3.tick();
ok("an executor refusal leaves no position and journals a fail", e3.open.size === 0 && /"type":"fail"/.test(fs.readFileSync(path.join(dir, "j3.jsonl"), "utf8")));
// intent with no fill is never silently lost
fs.writeFileSync(path.join(dir, "j4.jsonl"), JSON.stringify({ type: "intent", id: "X1", name: "GHOST" }) + "\n");
const e4 = new Engine({ feed, exec, journal: new Journal(path.join(dir, "j4.jsonl")), rug, now: () => now });
ok("an intent with no fill is closed out as failed on restart", /restart before fill/.test(fs.readFileSync(path.join(dir, "j4.jsonl"), "utf8")) && e4.open.size === 0);
// maxOpen
const e5 = new Engine({ feed: { ...feed, newPools: async () => Array.from({ length: 6 }, (_, k) => ({ ...pool, pool: "P" + k, mint: "M" + k, name: "T" + k })) }, exec, journal: new Journal(path.join(dir, "j5.jsonl")), rug, now: () => now });
await e5.tick();
ok(`never more than ${DEFAULTS.maxOpen} open`, e5.open.size === DEFAULTS.maxOpen, e5.open.size);
// shadow book: every passing signal is also tracked on paper, and a bad paper edge pauses LIVE buys only
const jfS = path.join(dir, "jS.jsonl");
series = up; now = T0 + 33 * M;
const eS = new Engine({ feed, exec, journal: new Journal(jfS), rug, now: () => now });
await eS.tick();
ok("a signal opens a shadow paper trade as well", eS.shadow.size === 1, eS.status().shadowOpen);
series = [...up, mk(33, 1.2, 1.5, 1.8, 1.2, 80)]; now += 2 * M;
await eS.tick();
ok("the shadow trade closes with its own result and feeds the edge", eS.shadowClosed.length === 1 && eS.edge().avg > 0 && eS.edge().n === 1, eS.edge());
const eR = new Engine({ feed, exec: { name: "live", buy: async () => ({ ok: true }), sell: async () => ({ ok: true }) }, journal: new Journal(path.join(dir, "jR.jsonl")), rug, now: () => now });
for (let k = 0; k < 14; k++) eR.shadowClosed.push({ ret: -0.08, name: "x" });
series = up; await eR.tick();
ok("live buys pause when the last paper signals lose, and say why", eR.open.size === 0 && Object.keys(eR.status().whyNot).some((k) => /shadow edge/.test(k)), eR.status().whyNot);
const eP = new Engine({ feed, exec, journal: new Journal(path.join(dir, "jP.jsonl")), rug, now: () => now });
for (let k = 0; k < 14; k++) eP.shadowClosed.push({ ret: -0.08, name: "x" });
await eP.tick();
ok("the same bad edge does not stop the paper bot itself (it is how it recovers)", eP.open.size === 1, eP.status().whyNot);
const eRe = new Engine({ feed, exec, journal: new Journal(jfS), rug, now: () => now });
ok("shadow results survive a restart", eRe.shadowClosed.length === 1, eRe.shadowClosed);
console.log(`\nautotrader tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
