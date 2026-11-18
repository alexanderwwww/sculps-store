// Dev only: a SYMBIOTE state for screenshots, made by replaying the recorded real stream (test/sym-stream.json.gz) through
// the real rules. Right/fake verdicts here use the stream facts only (no RPC offline), so they are a screenshot aid, not data.
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine, LANES, WALLET_SOL, HEALTH, judgeHealth } from "../../src/aq/sym/rules.mjs";
const here = dirname(fileURLToPath(import.meta.url)), REC = join(here, "../../test/sym-stream.json.gz");
let cached = null;
export function symFixture() {
  if (cached) return cached;
  const now = Date.now(), e = createEngine(); const trades = [], lessons = [], feed = [], missed = [], explode = [];
  if (existsSync(REC)) {
    const rec = JSON.parse(gunzipSync(readFileSync(REC)).toString()), t0 = now - rec.secs * 1000;
    for (const x of rec.ev) { const at = t0 + x.t; if (x.k === "c") e.onCreate({ ...x, src: "chain" }); else if (x.k === "t") e.onTrade(x, at); else e.onComplete(x, at); if (x.t % 5000 < 40) { e.sweep(at); const b = e.drain(); trades.push(...b.trades); lessons.push(...b.lessons); feed.push(...b.feed); missed.push(...b.missed); explode.push(...b.explode); } }
    for (const c of [...e.coins.values()].filter((c) => !c.done && !c.n).slice(0, 12)) feed.push({ at: c.createdAt, k: "launch", mint: c.mint, sym: c.symbol, gta: c.gta });
  }
  const cov = e.coverage(), seen = new Set();
  const right = explode.filter((x) => !seen.has(x.mint) && seen.add(x.mint)).map((x) => { const h = e.streamHealth(x.mint) || {}; const v = judgeHealth({ ...h, top10Share: 0.2, sameFunderMax: 1, mintAuthority: null, freezeAuthority: null, rugDanger: false, socials: 1 });
    return { mint: x.mint, symbol: x.symbol, lane: x.lane, status: v.ok ? "candidate" : "fake_pump", gain_pct: x.gainPct, flagged_at: new Date(x.at).toISOString(), failed: v.failed }; });
  const lanes = Object.fromEntries(Object.keys(LANES).map((l) => { const t = trades.filter((x) => x.lane === l); return [l, { walletSol: WALLET_SOL + t.reduce((a, x) => a + (x.proceeds - x.cost) / x.cost, 0), trades: t.length, wins: t.filter((x) => x.netPct > 0).length, avgPct: t.length ? t.reduce((a, x) => a + x.netPct, 0) / t.length : null }]; }));
  const brain = lessons.map((l, i) => ({ id: 1000 + i, at: new Date(now - (lessons.length - i) * 4000).toISOString(), ...l }));
  const reasons = {}; for (const m of missed) reasons[m.reason] = (reasons[m.reason] || 0) + 1;
  const gta = [...e.coins.values()].filter((c) => c.gta).map((c) => ({ mint: c.mint, symbol: c.symbol, name: c.name, px0: c.px0, last: c.last, minutes: 3 }));
  cached = { state: { paper: true, running: true, updatedAt: new Date(now).toISOString(), lanes, right, gta, recent: [], health: HEALTH, missedReasons: Object.entries(reasons).map(([reason, n]) => ({ reason, n })),
    live: { source: "curve", perSec: 37.9, coverage: cov, sockets: { pumpportal: true, chain: true }, feed: feed.sort((a, b) => b.at - a.at).slice(0, 40) },
    sources: [["brain records (all)", "mob_aq_brain", 52000 + brain.length], ["symbiote lessons", "mob_aq_brain", brain.length], ["launches seen", "mob_aq_sym_coins", cov.launches], ["symbiote paper trades", "mob_aq_sym_trades", trades.length],
      ["pain (24 h)", "mob_aq_brain", brain.filter((b) => b.kind === "pain").length], ["pain (total)", "mob_aq_brain", brain.filter((b) => b.kind === "pain").length + 212], ["scars (lessons that changed a rule)", "mob_aq_brain", 14], ["missed coins (with reason)", "mob_aq_sym_missed", missed.length], ["right calls", "mob_aq_sym_right", right.filter((r) => r.status === "candidate").length], ["fake pumps", "mob_aq_sym_right", right.filter((r) => r.status === "fake_pump").length]].map(([label, table, n]) => ({ label, table, n })) },
    brain };
  return cached;
}
