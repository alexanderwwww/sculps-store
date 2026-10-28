import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { start } from "../src/server.mjs";
import { fakeFeed, moon } from "./fakefeed.mjs";

const WALLET = "4DuDEdhHAdLCDnoQnTp4ikFzTyCVFpSNQDdxwJRibw1D";
async function boot(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-srv-"));
  const { feed, state } = fakeFeed();
  const app = start({ dataDir: dir, port: 0, feed, now: () => state.now, quiet: true, tickMs: 80, rug: async () => ({ pass: true, reason: "ok" }), paperQuote: async () => ({ ok: true, impact: 0.01 }), balance: async () => 0.11, ipv4: async () => "203.0.113.7", ...extra });
  const port = await app.listening;
  const base = `http://127.0.0.1:${port}`;
  const get = async (p) => (await fetch(base + p)).json();
  const post = async (p, body = {}, token = app.token) => { const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-ultra-token": token } : {}) }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
  const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await new Promise((r) => setTimeout(r, 40)); } throw new Error("timed out"); };
  return { app, dir, state, base, get, post, until, port };
}

test("health, page and assets answer; the page carries a token", async () => {
  const s = await boot();
  assert.deepEqual(await s.get("/healthz"), { ok: true, app: "ultra", build: "dev" });
  const html = await (await fetch(s.base + "/")).text();
  assert.match(html, /data-token="[0-9a-f]{32}"/);
  for (const a of ["/app.js", "/style.css", "/icon.png"]) assert.equal((await fetch(s.base + a)).status, 200, a);
  await s.app.close();
});
test("a foreign Host header is refused", async () => {
  const s = await boot();
  const r = await new Promise((res) => { import("node:http").then(({ request }) => { const q = request({ host: "127.0.0.1", port: s.port, path: "/healthz", headers: { host: "evil.example" } }, (m) => res(m.statusCode)); q.end(); }); });
  assert.equal(r, 403);
  await s.app.close();
});
test("POSTs need the page's token", async () => {
  const s = await boot();
  assert.equal((await s.post("/api/go", { mode: "paper" }, null)).status, 403);
  assert.equal((await s.post("/api/go", { mode: "paper" }, "wrong")).status, 403);
  await s.app.close();
});
test("setup: the signing key is made here and only the PUBLIC half is ever returned", async () => {
  const s = await boot();
  const r = await s.post("/api/keypair");
  assert.match(r.publicKey, /BEGIN PUBLIC KEY/);
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE/);
  const st = await s.get("/api/state");
  assert.doesNotMatch(JSON.stringify(st), /PRIVATE KEY/);
  const file = path.join(s.dir, "secrets.json");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, "secrets file is owner-only");
  assert.equal((await s.post("/api/keypair")).publicKey, r.publicKey, "asking again returns the same key");
  await s.app.close();
});
test("setup: bad API keys and wallets are refused, good ones saved and masked", async () => {
  const s = await boot();
  assert.equal((await s.post("/api/setup", { apiKey: "bad key!!" })).status, 400);
  assert.equal((await s.post("/api/setup", { wallet: "not-a-wallet" })).status, 400);
  const ok = await s.post("/api/setup", { apiKey: "gmgn_abcdef123456", wallet: WALLET });
  assert.equal(ok.ok, true);
  const st = await s.get("/api/state");
  assert.equal(st.setup.apiKey, "gmgn…3456");
  assert.equal(st.setup.wallet, WALLET);
  assert.doesNotMatch(JSON.stringify(st), /gmgn_abcdef123456/);
  await s.app.close();
});
test("real trading with GMGN keys refuses to start until that setup is complete", async () => {
  const s = await boot();
  await s.post("/api/source", { source: "gmgn" });
  const r = await s.post("/api/go", { mode: "live" });
  assert.equal(r.status, 400); assert.match(r.error, /setup/i);
  assert.equal((await s.post("/api/go", { mode: "nonsense" })).status, 400);
  await s.app.close();
});
test("paper mode: a signal opens, the target closes it, and the state shows the trade with its reason", async () => {
  const s = await boot();
  assert.equal((await s.post("/api/go", { mode: "paper" })).ok, true);
  await s.until(async () => (await s.get("/api/state")).engine?.open.length === 1);
  s.state.series = moon; s.state.px.P1 = 2.6;
  const st = await s.until(async () => { const x = await s.get("/api/state"); return x.engine.trades === 1 ? x : null; });
  assert.match(st.engine.recentClosed[0].why, /take profit/);
  assert.ok(st.engine.equity > 100);
  assert.equal(st.engine.curve[0], 100);
  assert.ok(st.engine.watching.thin >= 1, "the thin pool is counted as too thin");
  await s.app.close();
});
test("pause stops new buys, resume starts them again", async () => {
  const s = await boot();
  await s.post("/api/go", { mode: "paper" });
  await s.post("/api/pause", { paused: true });
  assert.equal((await s.get("/api/state")).engine.paused, true);
  await s.post("/api/pause", { paused: false });
  assert.equal((await s.get("/api/state")).engine.paused, false);
  await s.app.close();
});
test("flatten sells every open position through the journal", async () => {
  const s = await boot();
  await s.post("/api/go", { mode: "paper" });
  await s.until(async () => (await s.get("/api/state")).engine?.open.length === 1);
  const r = await s.post("/api/flatten");
  assert.equal(r.open, 0);
  const st = await s.get("/api/state");
  assert.equal(st.engine.paused, true); assert.equal(st.engine.trades, 1);
  assert.match(fs.readFileSync(path.join(s.dir, "journal-paper.jsonl"), "utf8"), /"why":"flatten"/);
  await s.app.close();
});
test("stop halts the engine, and a restart resumes what was running", async () => {
  const s = await boot();
  await s.post("/api/go", { mode: "paper" });
  await s.until(async () => (await s.get("/api/state")).engine?.open.length === 1);
  await s.app.close();
  const again = start({ dataDir: s.dir, port: 0, feed: fakeFeed().feed, now: () => s.state.now, quiet: true, tickMs: 80, rug: async () => ({ pass: true, reason: "ok" }), paperQuote: async () => ({ ok: true, impact: 0.01 }) });
  const port = await again.listening;
  const st = await (async () => { const t = Date.now(); for (;;) { const x = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json(); if (x.running && x.engine) return x; if (Date.now() - t > 6000) throw new Error("did not resume"); await new Promise((r) => setTimeout(r, 50)); } })();
  assert.equal(st.mode, "paper");
  assert.equal(st.engine.open.length, 1, "the open position came back from the journal");
  await fetch(`http://127.0.0.1:${port}/api/stop`, { method: "POST", headers: { "x-ultra-token": again.token, "content-type": "application/json" }, body: "{}" });
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/state`)).json()).running, false);
  await again.close();
});
test("the setup test reports each failing check by name", async () => {
  const s = await boot({ balance: async () => { throw new Error("rpc down"); } });
  const r = await s.post("/api/test");
  assert.ok(r.steps.some((x) => /Signing key/.test(x.name) && !x.ok));
  assert.ok(r.steps.every((x) => typeof x.why === "string"));
  await s.app.close();
});

import http from "node:http";
import crypto from "node:crypto";
import { buildMessage } from "../src/lib/gmgn.mjs";
test("LIVE end to end: setup in the app -> real mode -> a signed swap reaches GMGN with the right body; the position opens from the confirmed order", async () => {
  const calls = [];
  let pub = null;
  const gmgn = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const u = new URL(req.url, "http://x"); const q = Object.fromEntries(u.searchParams); calls.push({ path: u.pathname, q, body: body ? JSON.parse(body) : null });
      const reply = (data) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ code: 0, data })); };
      if (["/v1/trade/swap", "/v1/trade/query_order"].includes(u.pathname)) {
        const ok = crypto.verify(null, Buffer.from(buildMessage(u.pathname, q, body, q.timestamp)), pub, Buffer.from(req.headers["x-signature"] || "", "base64"));
        if (!ok) { res.writeHead(403, { "content-type": "application/json" }); return res.end(JSON.stringify({ code: 403, error: "BAD_SIGNATURE" })); }
      }
      if (u.pathname === "/v1/trade/quote") return reply({ output_amount: "5000000000" });
      if (u.pathname === "/v1/trade/swap") return reply({ order_id: "O1", status: "pending" });
      if (u.pathname === "/v1/trade/query_order") return reply({ order_id: "O1", status: "confirmed", hash: "TX", report: { input_amount: "13200000", output_amount: "5000000000" } });
      reply({});
    });
  });
  await new Promise((r) => gmgn.listen(0, "127.0.0.1", r));
  const s = await boot({ gmgnHost: `http://127.0.0.1:${gmgn.address().port}` });
  const kp = await s.post("/api/keypair"); pub = crypto.createPublicKey(kp.publicKey);
  await s.post("/api/setup", { apiKey: "gmgn_abcdef123456", wallet: WALLET });
  const t = await s.post("/api/test");
  assert.ok(t.steps.every((x) => x.ok), JSON.stringify(t.steps));
  assert.equal((await s.post("/api/source", { source: "gmgn" })).ok, true);
  assert.equal((await s.post("/api/go", { mode: "live" })).ok, true);
  const st = await s.until(async () => { const x = await s.get("/api/state"); return x.engine?.open.length === 1 ? x : null; });
  assert.equal(st.mode, "live"); assert.equal(st.engine.unit, "SOL");
  const sw = calls.find((c) => c.path === "/v1/trade/swap");
  assert.equal(sw.body.from_address, WALLET); assert.equal(sw.body.input_amount, "13200000"); assert.equal(sw.body.is_anti_mev, true);
  assert.equal(st.engine.open[0].stake, 0.0132);
  s.state.series = moon; s.state.px.P1 = 2.6;
  const done = await s.until(async () => { const x = await s.get("/api/state"); return x.engine.trades === 1 ? x : null; });
  assert.equal(done.engine.recentClosed[0].why.includes("take profit"), true);
  assert.ok(calls.filter((c) => c.path === "/v1/trade/swap").length >= 2, "the exit went out as a second signed swap");
  await s.app.close(); gmgn.close();
});

import { world } from "./fakechain.mjs";
import { b58decode } from "../src/lib/solana.mjs";
const ownBoot = async (o = {}) => { const ch = world(null, o); ch.W.zero = false; const s = await boot({ rpc: ch.rpc, jupiter: ch.jupiter, balance: async () => ch.W.sol }); await s.post("/api/source", { source: "own" }); return { ...s, ch }; };

test("OWN WALLET: the app makes its wallet; the state shows the address and never a secret", async () => {
  const s = await ownBoot();
  const st = await s.get("/api/state");
  assert.equal(b58decode(st.own.address).length, 32);
  assert.equal(st.source, "own");
  assert.doesNotMatch(JSON.stringify(st), /PRIVATE|secretKey/);
  const again = await s.get("/api/state"); assert.equal(again.own.address, st.own.address);
  assert.equal(fs.statSync(path.join(s.dir, "secrets.json")).mode & 0o777, 0o600);
  await s.app.close();
});
test("OWN WALLET: starting with an empty wallet says exactly where to send SOL", async () => {
  const s = await ownBoot(); s.ch.W.sol = 0;
  const addr = (await s.get("/api/state")).own.address;
  const r = await s.post("/api/go", { mode: "live" });
  assert.equal(r.status, 400); assert.ok(r.error.includes(addr), r.error);
  await s.app.close();
});
test("OWN WALLET end to end: press start -> signed swap -> position -> target -> sold from the chain's own numbers", async () => {
  const s = await ownBoot();
  assert.equal((await s.post("/api/go", { mode: "live" })).ok, true);
  const st = await s.until(async () => { const x = await s.get("/api/state"); return x.engine?.open.length === 1 ? x : null; });
  assert.equal(st.mode, "live"); assert.equal(st.engine.unit, "SOL");
  assert.equal(s.ch.W.sent.length, 1, "exactly one transaction went out for the buy");
  assert.equal(st.engine.open[0].stake, 0.0125);
  s.state.series = moon; s.state.px.P1 = 2.6; s.ch.W.lastKind = "sell";
  const done = await s.until(async () => { const x = await s.get("/api/state"); return x.engine.trades === 1 ? x : null; }, 12000);
  assert.match(done.engine.recentClosed[0].why, /take profit/);
  assert.ok(s.ch.W.sent.length >= 2, "the sale went out as a second transaction");
  await s.app.close();
});
test("OWN WALLET: backup needs confirmation and returns a 64-byte key that matches the address", async () => {
  const s = await ownBoot();
  const addr = (await s.get("/api/state")).own.address;
  assert.equal((await s.post("/api/backup", {})).status, 400);
  const b = await s.post("/api/backup", { confirm: true });
  const raw = b58decode(b.secretKey); assert.equal(raw.length, 64); assert.equal(b58decode(addr).equals(raw.subarray(32)), true);
  await s.app.close();
});
test("OWN WALLET: send everything back builds one transfer, refuses bad addresses and refuses while a position is open", async () => {
  const s = await ownBoot();
  assert.equal((await s.post("/api/withdraw", { to: "nope", all: true })).status, 400);
  const to = "E7rhUgJE1iegQHrE3bA3Sm8CbStMenW1HhayhUETTQyf";
  const r = await s.post("/api/withdraw", { to, all: true });
  assert.equal(r.ok, true); assert.ok(r.sol > 0.109 && r.sol < 0.11, r.sol);
  const tx = s.ch.W.sent[0];
  assert.ok(tx.includes(b58decode(to)), "the destination is in the transaction");
  assert.ok(tx.includes(Buffer.from([2, 0, 0, 0])), "it is a system-program transfer");
  await s.post("/api/go", { mode: "live" });
  await s.until(async () => (await s.get("/api/state")).engine?.open.length === 1);
  assert.equal((await s.post("/api/withdraw", { to, all: true })).status, 400);
  await s.app.close();
});
test("OWN WALLET: the same wallet comes back after a restart", async () => {
  const s = await ownBoot(); const a1 = (await s.get("/api/state")).own.address; await s.app.close();
  const again = start({ dataDir: s.dir, port: 0, feed: fakeFeed().feed, quiet: true, tickMs: 80, rpc: s.ch.rpc, jupiter: s.ch.jupiter, balance: async () => 0.11 });
  const port = await again.listening;
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/state`)).json()).own.address, a1);
  await again.close();
});
