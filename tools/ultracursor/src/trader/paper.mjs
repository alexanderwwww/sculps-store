#!/usr/bin/env node
/*
 * ultracursor paper trader: GMGN data -> gate G -> Fibonacci setups -> a paper
 * ledger starting at $10. PAPER ONLY: no wallet, no key, no signing, no order.
 *
 *   node src/trader/paper.mjs                 run until Ctrl-C, one status line per cycle
 *   node src/trader/paper.mjs --minutes 5     run 5 minutes, then print the summary
 *   node src/trader/paper.mjs --status        print the summary of the saved ledger and exit
 *   node src/trader/paper.mjs --fresh         start again at $10 (old ledger is kept, renamed)
 *   --every <sec> (default 3)  --dir <folder> (default runtime/trader)  --record <file.jsonl>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Book } from "./book.mjs";
import { Scanner } from "./scan.mjs";
import { Gmgn } from "./gmgn.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);

const dir = path.resolve(opt("--dir", path.join(HERE, "..", "..", "runtime", "trader")));
fs.mkdirSync(dir, { recursive: true });
const LEDGER = path.join(dir, "ledger.jsonl"), STATE = path.join(dir, "state.json");

export function readSummary(d = dir) {
  const st = path.join(d, "state.json");
  if (!fs.existsSync(st)) return null;
  const book = new Book({ state: JSON.parse(fs.readFileSync(st, "utf8")) });
  return { ...book.summary(), last: book.trades.slice(-5).map((t) => `${t.symbol} ${(t.ret * 100).toFixed(1)}% ${t.reason}`) };
}
const line = (s) => `trades ${s.trades}  wins ${s.wins}  p ${s.p === null ? "-" : (s.p * 100).toFixed(1) + "%"}  balance $${s.balance.toFixed(2)}  open ${s.open}  armed ${s.armed}  f ${s.f}${s.halted ? "  HALTED " + s.halted : ""}`;

if (flag("--status")) {
  const s = readSummary();
  console.log(s ? line(s) + (s.last.length ? "\nlast: " + s.last.join(" | ") : "") : "no paper ledger yet");
  process.exit(0);
}

if (flag("--fresh") && fs.existsSync(STATE)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.renameSync(STATE, STATE + "." + stamp);
  if (fs.existsSync(LEDGER)) fs.renameSync(LEDGER, LEDGER + "." + stamp);
}

const write = (ev) => fs.appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...ev }) + "\n");
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : null;
const book = new Book({ start: 10, log: write, state });
if (!state) write({ type: "start", balance: 10, note: "paper only" });

const gm = new Gmgn();
let src = gm;
const rec = opt("--record");
if (rec) {
  // every response, so a live session can be replayed through the same loop
  src = {};
  for (const m of ["trending", "fullInfo", "topBuyers", "candles"]) {
    src[m] = async (...a) => { const data = await gm[m](...a); fs.appendFileSync(rec, JSON.stringify({ t: Date.now(), m, a, data }) + "\n"); return data; };
  }
}
const scanner = new Scanner({ src, book, log: write });
const every = Number(opt("--every", 3)) * 1000;
const until = opt("--minutes") ? Date.now() + Number(opt("--minutes")) * 60_000 : Infinity;

let stop = false;
process.on("SIGINT", () => { stop = true; });
console.log(`paper trader (PAPER ONLY, no wallet) ledger ${LEDGER}`);
await gm.open();
let n = 0;
while (!stop && Date.now() < until) {
  const t = Date.now();
  try {
    const r = await scanner.cycle(t);
    n++;
    console.log(`${new Date(t).toISOString().slice(11, 19)}  #${n}  ${r.ms}ms  seen ${r.seen}  cand ${r.cands}  pass ${r.passed}  err ${r.errors}  |  ${line(r)}`);
  } catch (e) {
    console.log(`${new Date(t).toISOString().slice(11, 19)}  cycle failed: ${e.message}`);
  }
  fs.writeFileSync(STATE, JSON.stringify(book.toJSON()));
  const wait = every - (Date.now() - t);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
await gm.close();
const s = book.summary();
console.log(`\nSUMMARY  cycles ${n}  gmgn calls ${gm.calls}  errors ${gm.errors}\n${line(s)}`);
