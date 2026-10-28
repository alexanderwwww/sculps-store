// node run.mjs   -> Ultra, PAPER mode. Status at http://127.0.0.1:9340/ and data/status.json. Live money is a separate, later switch.
import fs from "node:fs";
import http from "node:http";
import { Engine } from "./lib/engine.mjs";
import { Journal } from "./lib/journal.mjs";
import { liveFeed } from "./lib/feed.mjs";
import { paperExec } from "./lib/exec-paper.mjs";
import { DEFAULTS } from "./lib/strategy.mjs";

const journal = new Journal("data/journal.jsonl");
const eng = new Engine({ feed: liveFeed, exec: paperExec({ cfg: DEFAULTS }), journal });
const save = () => fs.writeFileSync("data/status.json", JSON.stringify(eng.status(), null, 1));
http.createServer((_, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(eng.status(), null, 1)); }).listen(9340, "127.0.0.1");
const every = Number(process.env.ULTRA_TICK_MS || 45000), max = Number(process.env.ULTRA_TICKS || Infinity);
console.log(`ultra paper: resumed ${eng.open.size} open, ${eng.closed.length} closed, equity ${eng.equity.toFixed(2)}`);
for (let n = 0; n < max; n++) { await eng.tick(); save(); await new Promise((r) => setTimeout(r, every)); }
process.exit(0);
