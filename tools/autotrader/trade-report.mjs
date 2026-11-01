// node trade-report.mjs  -> .claude/skills/gmgn-fib/lab/trades/trades.jsonl + REPORT.md
// One line per CLOSED trade, read-only from the bridge (GET status+log): entry text, ret, exit kind and the timing/cost fields Ultra now logs (build 84):
// est {ret, low, peak, kind, trig, at, sellMs, holdMs, buyMs, rt, liq}. The lab reads this file every cycle: every trade, end to end.
import fs from "node:fs";
import path from "node:path";
const src = fs.readFileSync(path.resolve("../../app/routes/ultra.$.tsx"), "utf8");
const KEY = (src.match(/KEY *= *"([^"]+)"/) || [])[1];
const B = `https://kerberos.gardenbuddystore.workers.dev/ultra/${KEY}`;
const get = async (p) => (await fetch(`${B}/${p}`, { signal: AbortSignal.timeout(30000) })).json();
const [st, lg] = await Promise.all([get("status"), get("log")]);
const lines = (lg.lines || []).filter((x) => x && typeof x === "object");
const buys = new Map();
for (const x of lines) if (x.type === "buy") (buys.get(x.name) || buys.set(x.name, []).get(x.name)).push(x);
const OUT = path.resolve("../../.claude/skills/gmgn-fib/lab/trades"); fs.mkdirSync(OUT, { recursive: true });
const F = path.join(OUT, "trades.jsonl");
const have = new Set(fs.existsSync(F) ? fs.readFileSync(F, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).key) : []);
let added = 0;
for (const x of lines) {
  if (x.type !== "sell" || x.partial) continue;
  const key = `${x.name}@${x.at}`; if (have.has(key)) continue;
  const b = [...(buys.get(x.name) || [])].reverse().find((y) => y.at < x.at) || null;
  const rise = b && /rising ([\d.]+)%/.exec(b.why || ""), flow = b && /(\d+) buys vs (\d+) sells/.exec(b.why || ""), vol = b && /\$(\d+) volume/.exec(b.why || "");
  const rec = { key, name: x.name, at: x.at, sellAt: new Date(x.at).toISOString(), ret: x.ret, pnl: x.pnl, stake: x.stake, exit: x.why, est: x.est || null,
    entry: b ? b.why : null, buyAt: b ? b.at : null, holdS: b ? Math.round((x.at - b.at) / 1000) : null, idlePick: !!(b && /idle pick/.test(b.why || "")), risePct: rise ? +rise[1] : null, buys5: flow ? +flow[1] : null, sells5: flow ? +flow[2] : null, vol5: vol ? +vol[1] : null };
  fs.appendFileSync(F, JSON.stringify(rec) + "\n"); have.add(key); added++;
}
const all = fs.readFileSync(F, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const n = all.length, rets = all.map((r) => r.ret || 0), wins = rets.filter((r) => r > 0).length, avg = n ? rets.reduce((a, b) => a + b, 0) / n : 0;
const by = (f) => { const m = {}; for (const r of all) { const k = f(r); (m[k] ||= []).push(r.ret || 0); } return Object.entries(m).map(([k, v]) => `| ${k} | ${v.length} | ${(100 * v.filter((x) => x > 0).length / v.length).toFixed(0)}% | ${(100 * v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}% |`).join("\n"); };
const md = `# Ultra trade report (auto)\nUpdated ${new Date().toISOString()}: ${n} closed trades (+${added} new), wins ${wins}, avg ret ${(avg * 100).toFixed(2)}%, wallet equity ${st.engine?.equity}, build ${st.build}\n\n## by exit\n| exit | n | win | avg |\n|---|---|---|---|\n${by((r) => (r.exit || "").replace(/[-+]?\d+(\.\d+)?%/g, "x%").slice(0, 28))}\n\n## by entry type\n| type | n | win | avg |\n|---|---|---|---|\n${by((r) => (r.idlePick ? "idle pick" : "signal"))}\n\n## by round trip measured before the buy (rt, build 83+)\n| rt | n | win | avg |\n|---|---|---|---|\n${by((r) => (r.est?.rt == null ? "n/a" : r.est.rt < 0.01 ? "<1%" : r.est.rt < 0.02 ? "1-2%" : ">=2%"))}\n\n## latency (build 84+): decision-to-sold ms, buy call ms\n${all.filter((r) => r.est?.sellMs != null).slice(-15).map((r) => `- ${r.name} ret ${(100 * r.ret).toFixed(2)}% sellMs ${r.est.sellMs} buyMs ${r.est.buyMs} holdMs ${r.est.holdMs} rt ${r.est.rt} liq ${r.est.liq}`).join("\n") || "(none yet)"}\n`;
fs.writeFileSync(path.join(OUT, "REPORT.md"), md);
console.log(`trades ${n} (+${added}), wins ${wins}, avg ${(avg * 100).toFixed(2)}%`);
