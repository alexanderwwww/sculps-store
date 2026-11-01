// UNBIASED pool logger (Mara found our backtests only saw the 2.8% of new pools that ever trade).
// Every minute: read the plain new_pools feed (no ranking), remember EVERY pool with its first-seen numbers.
// When a pool is ~70 minutes old fetch its 1-minute candles ONCE (dead pools come back with few/no candles: that IS the data).
// Resumes from state.json after a restart. Output: .claude/skills/gmgn-fib/lab/unbiased/{births.jsonl,aged.jsonl,state.json}
import fs from "node:fs";
import path from "node:path";
import { newPools, candles } from "./src/lib/gecko.mjs";
const DIR = path.resolve("../../.claude/skills/gmgn-fib/lab/unbiased");
fs.mkdirSync(DIR, { recursive: true });
const SF = path.join(DIR, "state.json"), BF = path.join(DIR, "births.jsonl"), AF = path.join(DIR, "aged.jsonl");
const state = fs.existsSync(SF) ? JSON.parse(fs.readFileSync(SF, "utf8")) : { seen: {}, pending: {} };
const save = () => fs.writeFileSync(SF, JSON.stringify(state));
const AGE_MIN = Number(process.env.AGE_MIN || 70);
let births = 0, aged = 0;
async function discover() {
  for (const page of [1, 2]) {
    let list = []; try { list = await newPools(page); } catch (e) { console.error("newPools", page, e.message.slice(0, 60)); continue; }
    for (const m of list) {
      if (state.seen[m.pool]) continue;
      state.seen[m.pool] = m.created || Date.now();
      if (parseInt(m.pool.slice(-2), 36) % 10 >= 7) continue;   // random 70% sample (address hash, unrelated to price) so candle requests fit GeckoTerminal's limit; every birth is still logged
      state.pending[m.pool] = { pool: m.pool, name: m.name, mint: m.mint, dex: m.dex, created: m.created, firstSeen: Date.now() };
      fs.appendFileSync(BF, JSON.stringify({ ...m, firstSeen: Date.now() }) + "\n"); births++;
    }
  }
}
async function age() {
  const due = Object.values(state.pending).filter((p) => (Date.now() - p.created) / 60000 >= AGE_MIN).sort((a, b) => a.created - b.created).slice(0, 12);
  for (const p of due) {
    let cs = null; try { cs = await candles(p.pool, { limit: 200 }); } catch (e) { if (!/404/.test(e.message)) { p.tries = (p.tries || 0) + 1; if (p.tries < 3) continue; } cs = []; }
    fs.appendFileSync(AF, JSON.stringify({ ...p, ageMin: +((Date.now() - p.created) / 60000).toFixed(1), n: cs.length, cs }) + "\n"); aged++;
    delete state.pending[p.pool];
  }
  // keep state small: forget pools older than 3 days
  for (const [k, t] of Object.entries(state.seen)) if (Date.now() - t > 3 * 86400e3) delete state.seen[k];
}
console.log("lab-logger start; pending", Object.keys(state.pending).length);
for (;;) {
  const t0 = Date.now();
  try { await discover(); await age(); save(); } catch (e) { console.error("loop", e.message.slice(0, 80)); }
  console.log(new Date().toISOString(), "births", births, "aged", aged, "pending", Object.keys(state.pending).length);
  const wait = 60000 - (Date.now() - t0); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
