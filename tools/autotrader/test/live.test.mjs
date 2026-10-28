import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GmgnClient, buildMessage, SOL_MINT } from "../src/lib/gmgn.mjs";
import { gmgnExec, CAPS, KIMCHI } from "../src/lib/exec-gmgn.mjs";
import { judgeGmgnSecurity } from "../src/lib/rug.mjs";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, d ?? ""); } };

const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const WALLET = "4DuDEdhHAdLCDnoQnTp4ikFzTyCVFpSNQDdxwJRibw1D", MINT = "3L3FzorEgwKDEraWb4trNYd62AmjNgc9osn3QMojpump";
const log = []; let mode = { swap: "ok", polls: 1, sellErr: null };
const server = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const u = new URL(req.url, "http://x"); const q = Object.fromEntries(u.searchParams);
    const rec = { method: req.method, path: u.pathname, q, body: body ? JSON.parse(body) : null, headers: req.headers };
    log.push(rec);
    const reply = (data, code = 0, status = 200, extra = {}) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ code, data, ...extra })); };
    if (req.headers["x-apikey"] !== "KEY") return reply(null, 401, 401, { error: "BAD_KEY" });
    // verify the signature on signed routes, the way GMGN would
    if (["/v1/trade/swap", "/v1/trade/query_order"].includes(u.pathname)) {
      const sig = req.headers["x-signature"]; const msg = buildMessage(u.pathname, q, body, q.timestamp);
      if (!sig || !crypto.verify(null, Buffer.from(msg), publicKey, Buffer.from(sig, "base64"))) return reply(null, 403, 403, { error: "BAD_SIGNATURE" });
    }
    if (u.pathname === "/v1/trade/quote") return reply({ output_amount: "5000000000", min_output_amount: "4000000000", slippage: 20 });
    if (u.pathname === "/v1/trade/swap") {
      if (rec.body.input_token !== SOL_MINT && mode.sellErr) return reply(null, 4001, 400, { error: "INSUFFICIENT_BALANCE", message: mode.sellErr });
      if (mode.swap === "reject") return reply(null, 4002, 400, { error: "BAD_REQUEST", message: "nope" });
      return reply({ order_id: "ord-" + log.length, hash: "H", status: "pending", strategy_order_id: "strat-1" });
    }
    if (u.pathname === "/v1/trade/query_order") {
      const n = log.filter((l) => l.path === "/v1/trade/query_order").length;
      if (mode.swap === "fail") return reply({ order_id: q.order_id, status: "failed", error_status: "slippage exceeded" });
      if (n < mode.polls) return reply({ order_id: q.order_id, status: "processed" });
      const buyish = log.filter((l) => l.path === "/v1/trade/swap").slice(-1)[0].body.input_token === SOL_MINT;
      return reply({ order_id: q.order_id, status: "confirmed", hash: "TX", report: buyish ? { input_amount: "11000000", output_amount: "5000000000", price_usd: "0.0001" } : { input_amount: "5000000000", output_amount: "15400000", price_usd: "0.0002" } });
    }
    reply(null, 404, 404);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const host = `http://127.0.0.1:${server.address().port}`;
const client = new GmgnClient({ apiKey: "KEY", privateKeyPem: pem, host });
const mk = (over = {}) => gmgnExec({ client, wallet: WALLET, balanceSol: async () => 0.11, cfg: DEFAULTS, caps: { ...CAPS, pollMs: 1, ...over }, wait: async () => {} });

// signatures and request shape
let ex = mk();
let r = await ex.buy({ mint: MINT });
ok("buy goes through quote -> signed swap -> polled to confirmed", r.ok && r.orderId && r.outAmount === "5000000000", r);
const sw = log.find((l) => l.path === "/v1/trade/swap");
ok("the server accepted our signature (real Ed25519 verify)", !!sw);
ok("swap body has the documented fields", sw.body.chain === "sol" && sw.body.from_address === WALLET && sw.body.input_token === SOL_MINT && sw.body.output_token === MINT && sw.body.input_amount === String(Math.round(0.0132 * 1e9)) && sw.body.slippage === 20 && sw.body.is_anti_mev === true, sw.body);
ok("a GMGN-side stop and target ride along as a safety net", sw.body.condition_orders.length === 2 && sw.body.condition_orders[0].order_type === "loss_stop" && sw.body.condition_orders[0].price_scale === "25" && sw.body.condition_orders[1].order_type === "profit_stop" && sw.body.condition_orders[1].price_scale === "115", sw.body.condition_orders);
ok("auth query carries timestamp and client_id and the API key header", !!sw.q.timestamp && !!sw.q.client_id && sw.headers["x-apikey"] === "KEY");
ok("stake is 12% of the wallet (0.0132 SOL) and never above the cap", Math.abs(r.sol - 0.0132) < 1e-9);
ex = mk(); mode.polls = 1;
const big = gmgnExec({ client, wallet: WALLET, balanceSol: async () => 5, cfg: DEFAULTS, caps: { ...CAPS, pollMs: 1 }, wait: async () => {} });
log.length = 0; r = await big.buy({ mint: MINT });
ok("a 5 SOL wallet still only risks 0.05 SOL per trade", r.ok && log.find((l) => l.path === "/v1/trade/swap").body.input_amount === "50000000", log.find((l) => l.path === "/v1/trade/swap")?.body);
// guards
log.length = 0; ex = mk();
r = await ex.buy({ mint: KIMCHI });
ok("Kimchi is never bought and nothing is sent", !r.ok && /Kimchi/.test(r.why) && log.length === 0, r);
const small = gmgnExec({ client, wallet: WALLET, balanceSol: async () => 0.02, cfg: DEFAULTS, caps: { ...CAPS, pollMs: 1 }, wait: async () => {} });
r = await small.buy({ mint: MINT });
ok("a stake too small to trade is refused before any request", !r.ok && /too small/.test(r.why) && log.length === 0, r);
let bal = 0.11; const dd = gmgnExec({ client, wallet: WALLET, balanceSol: async () => bal, cfg: DEFAULTS, caps: { ...CAPS, pollMs: 1 }, wait: async () => {} });
await dd.buy({ mint: MINT }); bal = 0.07; log.length = 0;
r = await dd.buy({ mint: MINT });
ok("30% down from the start halts trading, with the reason, and sends nothing", !r.ok && /halted/.test(r.why) && log.length === 0, r);
const hr = gmgnExec({ client, wallet: WALLET, balanceSol: async () => 0.11, cfg: DEFAULTS, caps: { ...CAPS, pollMs: 1, perHour: 2 }, wait: async () => {} });
await hr.buy({ mint: MINT }); await hr.buy({ mint: MINT }); log.length = 0;
r = await hr.buy({ mint: MINT });
ok("the hourly cap stops the third buy", !r.ok && /last hour/.test(r.why) && log.length === 0, r);
// failure paths
mode.swap = "reject"; log.length = 0; r = await mk().buy({ mint: MINT });
ok("a rejected swap is a clean failure with GMGN's words", !r.ok && /BAD_REQUEST|nope/.test(r.why), r);
mode.swap = "fail"; r = await mk().buy({ mint: MINT });
ok("a failed order is reported as failed, never as bought", !r.ok && /failed/.test(r.why) && r.orderId, r);
mode.swap = "ok"; mode.polls = 99; r = await mk({ pollTries: 3 }).buy({ mint: MINT });
ok("an order still pending after polling is UNKNOWN, not success and not silently dropped", !r.ok && r.unknown === true && r.sent === true, r);
mode.polls = 1;
const bad = new GmgnClient({ apiKey: "WRONG", privateKeyPem: pem, host });
ok("a wrong API key surfaces as an error", await bad.userInfo().then(() => false, (e) => /BAD_KEY|401/.test(e.message)));
ok("signed calls without a signing key refuse locally", await new GmgnClient({ apiKey: "KEY", host }).order("x").then(() => false, (e) => /signing key/.test(e.message)));
// sells
log.length = 0; r = await mk().sell({ mint: MINT });
const sell = log.find((l) => l.path === "/v1/trade/swap");
ok("sell is 100% of the position by bps", r.ok && sell.body.input_token === MINT && sell.body.output_token === SOL_MINT && sell.body.input_amount_bps === "10000", sell?.body);

// the engine, live, end to end
const T0 = 1_800_000_000_000, M = 60000;
const c = (i, o, cl, h = Math.max(o, cl), l = Math.min(o, cl), v = 10) => ({ t: T0 + i * M, o, h, l, c: cl, v });
const base = Array.from({ length: 30 }, (_, i) => c(i, 1, 1 + (i % 2 ? 0.001 : -0.001)));
const up = [...base, c(30, 1, 1.05, 1.06, 1, 40), c(31, 1.05, 1.12, 1.13, 1.05, 60), c(32, 1.12, 1.2, 1.21, 1.12, 90)];
let series = up, now = T0 + 33 * M;
const feed = { newPools: async () => [{ pool: "P", name: "TEST", mint: MINT, created: T0, liqUsd: 9000, vol5: 5 }], trendingPools: async () => [], candles: async () => series };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-live-"));
mode = { swap: "ok", polls: 1, sellErr: null };
const live = gmgnExec({ client, wallet: WALLET, balanceSol: async () => 0.11, cfg: DEFAULTS, caps: { ...CAPS, pollMs: 1 }, wait: async () => {} });
const eng = new Engine({ feed, exec: live, journal: new Journal(path.join(dir, "j.jsonl")), rug: async () => ({ pass: true, reason: "ok" }), now: () => now, startEq: 0.11 });
await eng.tick();
ok("live tick: a confirmed buy opens one position with the real stake and order id", eng.open.size === 1 && Math.abs([...eng.open.values()][0].stake - 0.0132) < 1e-9 && [...eng.open.values()][0].orderId, eng.status());
series = [...up, c(33, 1.2, 2.5, 2.6, 1.2, 80)]; now += 2 * M;
await eng.tick();
ok("take-profit closes with the REAL fill: 0.0154 SOL back on 0.0132 = +16.7%", eng.closed.length === 1 && Math.abs(eng.closed[0].ret - (0.0154 / 0.0132 - 1)) < 1e-6, eng.closed[0]);
ok("the journal has intent, open, sell-intent, close in that order", (() => { const t = fs.readFileSync(path.join(dir, "j.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).type); return t.filter((x) => !x.startsWith("shadow")).join() === "intent,open,sell-intent,close"; })());
// GMGN's own safety order sold first
mode.sellErr = "insufficient token balance"; series = up; now += 20 * M;
const eng2 = new Engine({ feed, exec: gmgnExec({ client, wallet: WALLET, balanceSol: async () => 0.11, cfg: DEFAULTS, caps: { ...CAPS, pollMs: 1 }, wait: async () => {} }), journal: new Journal(path.join(dir, "j2.jsonl")), rug: async () => ({ pass: true, reason: "ok" }), now: () => now, startEq: 0.11 });
mode.sellErr = null; await eng2.tick(); mode.sellErr = "insufficient token balance"; series = [...up, c(33, 1.2, 1.0, 1.2, 0.95, 80)]; now += M;
await eng2.tick();
ok("if GMGN's safety order already sold, the close is flagged as estimated and the position is not stuck", eng2.open.size === 0 && /GMGN's own/.test(eng2.closed[0]?.note || ""), eng2.closed[0]);
// an order that was still pending is not forgotten: it is rechecked, then opened
mode = { swap: "ok", polls: 99, sellErr: null };
const eng3 = new Engine({ feed, exec: gmgnExec({ client, wallet: WALLET, balanceSol: async () => 0.11, cfg: DEFAULTS, caps: { ...CAPS, pollMs: 1, pollTries: 2 }, wait: async () => {} }), journal: new Journal(path.join(dir, "j3.jsonl")), rug: async () => ({ pass: true, reason: "ok" }), now: () => now, startEq: 0.11 });
series = up; await eng3.tick();
ok("a pending order is tracked as unknown, with no position yet and no lost money", eng3.open.size === 0 && eng3.unknown.size === 1, eng3.status());
mode.polls = 0; await eng3.tick();
ok("once GMGN confirms it, the position opens with the real amounts", eng3.open.size === 1 && eng3.unknown.size === 0 && [...eng3.open.values()][0].stake === 0.011, [...eng3.open.values()]);
// security judge
ok("security: live mint authority is refused", !judgeGmgnSecurity({ renounced_mint: false, renounced_freeze_account: true, rug_ratio: 0.01 }).pass);
ok("security: high rug_ratio and heavy top-10 are refused with reasons", /rug_ratio/.test(judgeGmgnSecurity({ renounced_mint: true, renounced_freeze_account: true, rug_ratio: 0.5, top_10_holder_rate: 0.7 }).reason));
ok("security: a clean coin passes", judgeGmgnSecurity({ renounced_mint: true, renounced_freeze_account: true, rug_ratio: 0.02, top_10_holder_rate: 0.2, buy_tax: 0, sell_tax: 0, is_wash_trading: false }).pass);
server.close();
console.log(`\nlive tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
