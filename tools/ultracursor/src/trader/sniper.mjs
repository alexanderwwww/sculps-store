#!/usr/bin/env node
/*
 * ultracursor trader. Training ("Sniper XYZ") = real GMGN coins, fake money,
 * starting at $10, run only when Alex asks. Live = through ultracursor in his
 * own Chrome; not connected yet, so live refuses (execute.mjs).
 *
 *   node src/trader/sniper.mjs --train                run Sniper XYZ until Ctrl-C
 *   node src/trader/sniper.mjs --train --minutes 10   run 10 minutes, then the summary
 *   node src/trader/sniper.mjs --status               summary of the saved training ledger
 *   node src/trader/sniper.mjs --train --fresh        start again (--balance 100 for $100; old ledger kept, renamed; memory kept)
 *   node src/trader/sniper.mjs --sync                 upload the memory snapshot to R2 and exit
 *   --record <file.jsonl>  every GMGN response, for replay      --dir <folder>  (default runtime/trader)
 *   Old names still work: --paper / --training = --train, and src/trader/paper.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { Book } from "./book.mjs";
import { Sniper } from "./scan.mjs";
import { Gmgn } from "./gmgn.mjs";
import { Lanes } from "./lanes.mjs";
import { Memory, memoryDir, traderDir, syncToR2, loadFromR2 } from "./memory.mjs";
import { execute } from "./execute.mjs";
import { pathToFileURL } from "node:url";

export async function main(argv = process.argv.slice(2)) {
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const flag = (...ks) => ks.some((k) => argv.includes(k));
const TRAIN = flag("--train", "--training", "--paper");

const dir = path.resolve(opt("--dir", traderDir()));
if (opt("--dir")) process.env.ULTRA_TRADER_DIR = dir;
fs.mkdirSync(dir, { recursive: true });
const LEDGER = path.join(dir, "ledger.jsonl"), STATE = path.join(dir, "state.json");
const line = (s) => `trades ${s.trades}  wins ${s.wins}  p ${s.p === null ? "-" : (s.p * 100).toFixed(1) + "%"}  balance $${s.balance.toFixed(2)}${s.locked ? ` (+$${s.locked.toFixed(2)} locked)` : ""}  open ${s.open}/${s.slots}  armed ${s.armed}  f ${s.f}  day ${s.dayPnl >= 0 ? "+" : ""}${s.dayPnl}${s.u ? `  u ${s.u}` : ""}${s.recovery ? `  recovering ${s.recovery}` : ""}${s.halted ? "  HALTED " + s.halted : ""}`;

if (flag("--status")) {
  if (!fs.existsSync(STATE)) { console.log("no Sniper XYZ ledger yet"); process.exit(0); }
  const book = new Book({ state: JSON.parse(fs.readFileSync(STATE, "utf8")) });
  const mem = new Memory({ dir: memoryDir(dir) });
  const st = mem.stats();
  console.log(line(book.summary()));
  console.log(`memory ${Math.round(mem.bytes() / 1024)} KB  trades learned ${st.trades}  p13 ${st.p13 ?? "-"}  p21 ${st.p21 ?? "-"}  p34 ${st.p34 ?? "-"}  gut line ${st.strictness}`);
  process.exit(0);
}
if (flag("--sync")) { console.log(JSON.stringify(syncToR2(new Memory({ dir: memoryDir(dir) })))); process.exit(0); }

if (!TRAIN) {
  // live: the one door an order would go through, and it is shut
  try { await execute({ side: "buy", reason: "live mode start" }); } catch (e) { console.log(`live mode: ${e.message}. Training runs with --train.`); process.exit(1); }
}

if (flag("--fresh") && fs.existsSync(STATE)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.renameSync(STATE, STATE + "." + stamp);
  if (fs.existsSync(LEDGER)) fs.renameSync(LEDGER, LEDGER + "." + stamp);
}

const memDir = memoryDir(dir);
const fromCloud = loadFromR2(memDir);
const memory = new Memory({ dir: memDir });
const write = (ev) => {
  fs.appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...ev }) + "\n");
  if (ev.type === "day-summary") memory.daySummary(ev, book.trades.filter((t) => new Date(t.closeT).toISOString().slice(0, 10) === ev.date));
};
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : null;
const startBal = Number(opt("--balance", 10)) || 10;
const book = new Book({ start: startBal, log: write, state: state && state.v === 2 ? state : state ? { ...state, open: [], setups: [] } : null });
book.onClose = (t) => { const lesson = memory.onTrade(t); if (lesson) write({ type: "lesson", ...lesson }); };
if (!state) write({ type: "start", balance: startBal, note: "Sniper XYZ training: fake money, real GMGN coins" });

const gm = new Gmgn({ onCall: (c) => memory.onCall(c) });
let src = gm;
const rec = opt("--record");
if (rec) {
  src = {};
  for (const m of ["trending", "fullInfo", "topBuyers", "candles", "solCandles", "trades", "holderStat", "community", "preview", "callouts", "gas", "prices", "feeInfo"]) {
    src[m] = async (...a) => { const data = await gm[m](...a); fs.appendFileSync(rec, JSON.stringify({ t: Date.now(), m, a, data }) + "\n"); return data; };
  }
}
const sniper = new Sniper({ src, book, memory, log: write });
const lanes = new Lanes({ log: write });
const stamp = () => new Date().toISOString().slice(11, 19);
let scans = 0;
lanes
  .add("scan", Number(opt("--every", 3)) * 1000, async (t) => {
    const r = await sniper.scanLane(t);
    scans++;
    console.log(`${stamp()}  scan #${scans} ${r.ms}ms  seen ${r.seen}  cand ${r.cands}  watch ${r.tiers.watch} ready ${r.tiers.ready} fire ${r.tiers.fire}  armed+${r.fired}  err ${r.errors}  ${r.regime || ""}  |  ${line(book.summary())}`);
  })
  .add("narrative", 5000, async (t) => { const r = await sniper.narrativeLane(t); if (r.read) console.log(`${stamp()}  narrative ${r.ms}ms  read ${r.read}`); })
  .add("positions", 2000, async (t) => { await sniper.positionLane(t); fs.writeFileSync(STATE, JSON.stringify(book.toJSON())); });

process.on("SIGINT", () => lanes.stop());
console.log(`Sniper XYZ (training: fake money, no wallet) ledger ${LEDGER}  memory ${memDir} (${Math.round(memory.bytes() / 1024)} KB${fromCloud.ok ? ", loaded from R2" : ""})`);
await gm.open();
const until = opt("--minutes") ? Date.now() + Number(opt("--minutes")) * 60_000 : Infinity;
await lanes.run({ until });
fs.writeFileSync(STATE, JSON.stringify(book.toJSON()));
memory.save();
memory.off();
await gm.close();
const sync = syncToR2(memory);
const s = book.summary();
console.log(`\nSUMMARY  scans ${scans}  lanes ${JSON.stringify(lanes.stats())}  gmgn calls ${gm.calls}  errors ${gm.errors}  challenged ${gm.challenged || 0}\n${line(s)}\nmemory ${Math.round(memory.bytes() / 1024)} KB  R2: ${sync.ok ? "synced" : sync.why || JSON.stringify(sync.out)}`);
}

// run only as the entry script (pack.sh imports every module to prove it loads)
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) await main();
