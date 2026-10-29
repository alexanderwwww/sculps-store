import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { start } from "../src/server.mjs";
import { fakeFeed, moon } from "./fakefeed.mjs";
import crypto from "node:crypto";
import { world } from "./fakechain.mjs";
import { b58encode, b58decode } from "../src/lib/solana.mjs";

async function boot(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-srv-"));
  const { feed, state } = fakeFeed();
  const stub = { name: "live", source: "stub", buy: async () => ({ ok: true }), sell: async () => ({ ok: true }) };
  const app = start({ dataDir: dir, port: 0, feed, now: () => state.now, quiet: true, tickMs: 80, execOverride: stub, rug: async () => ({ pass: true, reason: "ok" }), balance: async () => 0.11, ...extra });
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
  assert.equal((await s.post("/api/go", { mode: "live" }, null)).status, 403);
  assert.equal((await s.post("/api/go", { mode: "live" }, "wrong")).status, 403);
  await s.app.close();
});
test("a signal opens, the target closes it, and the state shows the trade with its reason", async () => {
  const s = await boot();
  assert.equal((await s.post("/api/go", { mode: "live" })).ok, true);
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
  await s.post("/api/go", { mode: "live" });
  await s.post("/api/pause", { paused: true });
  assert.equal((await s.get("/api/state")).engine.paused, true);
  await s.post("/api/pause", { paused: false });
  assert.equal((await s.get("/api/state")).engine.paused, false);
  await s.app.close();
});
test("flatten sells every open position through the journal", async () => {
  const s = await boot();
  await s.post("/api/go", { mode: "live" });
  await s.until(async () => (await s.get("/api/state")).engine?.open.length === 1);
  const r = await s.post("/api/flatten");
  assert.equal(r.open, 0);
  const st = await s.get("/api/state");
  assert.equal(st.engine.paused, true); assert.equal(st.engine.trades, 1);
  assert.match(fs.readFileSync(path.join(s.dir, "journal-test.jsonl"), "utf8"), /"why":"flatten"/);
  await s.app.close();
});
test("stop halts the engine, and a restart resumes what was running", async () => {
  const s = await boot();
  await s.post("/api/go", { mode: "live" });
  await s.until(async () => (await s.get("/api/state")).engine?.open.length === 1);
  await s.app.close();
  const again = start({ dataDir: s.dir, port: 0, feed: fakeFeed().feed, now: () => s.state.now, quiet: true, tickMs: 80, execOverride: { name: "live", source: "stub", buy: async () => ({ ok: true }), sell: async () => ({ ok: true }) }, rug: async () => ({ pass: true, reason: "ok" }) });
  const port = await again.listening;
  const st = await (async () => { const t = Date.now(); for (;;) { const x = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json(); if (x.running && x.engine) return x; if (Date.now() - t > 6000) throw new Error("did not resume"); await new Promise((r) => setTimeout(r, 50)); } })();
  assert.equal(st.mode, "live");
  assert.equal(st.engine.open.length, 1, "the open position came back from the journal");
  await fetch(`http://127.0.0.1:${port}/api/stop`, { method: "POST", headers: { "x-ultra-token": again.token, "content-type": "application/json" }, body: "{}" });
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/state`)).json()).running, false);
  await again.close();
});
// A fresh key exported the way Phantom exports it: base58 of 64 bytes (seed + public key). Never a funded wallet.
const phantomKey = () => { const j = crypto.generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" }); const pub = Buffer.from(j.x, "base64url"); return { secret: b58encode(Buffer.concat([Buffer.from(j.d, "base64url"), pub])), address: b58encode(pub) }; };
// Boot on the fake chain and plug the wallet in through the screen's own endpoint. Plugging in starts trading at once.
const ownBoot = async (o = {}, { sol = 0.11 } = {}) => {
  const ch = world(null, o); ch.W.zero = false; ch.W.sol = sol;
  const s = await boot({ execOverride: null, rpc: ch.rpc, jupiter: ch.jupiter, balance: async () => ch.W.sol });
  const key = phantomKey();
  const r = await s.post("/api/wallet", { secret: key.secret });
  assert.equal(r.ok, true); assert.equal(r.address, key.address);
  return { ...s, ch, key, plugged: r };
};

test("PHANTOM: nothing trades before the wallet is plugged in, and a wrong paste is refused in Phantom's words", async () => {
  const ch = world(null, {}); ch.W.zero = false;
  const s = await boot({ execOverride: null, rpc: ch.rpc, jupiter: ch.jupiter });
  const st = await s.get("/api/state");
  assert.equal(st.setup.imported, false); assert.equal(st.own, null); assert.equal(st.running, false); assert.equal(st.source, "phantom");
  const g = await s.post("/api/go", { mode: "live" }); assert.equal(g.status, 400); assert.match(g.error, /Phantom/);
  for (const bad of ["not a key", "", "[1,2,3]", "1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"]) {
    const r = await s.post("/api/wallet", { secret: bad }); assert.equal(r.status, 400, bad); assert.match(r.error, /private key|bytes|match/, bad);
  }
  const k = phantomKey(); const raw = b58decode(k.secret); raw[40] ^= 1;
  assert.match((await s.post("/api/wallet", { secret: b58encode(raw) })).error, /does not match/);
  assert.equal((await s.get("/api/state")).setup.imported, false);
  assert.equal(ch.W.sent.length, 0, "nothing went to the chain");
  await s.app.close();
});
test("PHANTOM: paste the private key once -> it trades that wallet, 0.03236 SOL a buy, and the key is in secrets.json and nowhere else", async () => {
  const s = await ownBoot();
  assert.equal(s.plugged.running, true, "plugging in starts trading by itself");
  const st = await s.until(async () => { const x = await s.get("/api/state"); return x.engine?.open.length === 1 ? x : null; });
  assert.equal(st.source, "phantom"); assert.equal(st.own.address, s.key.address); assert.equal(st.setup.imported, true);
  assert.equal(st.engine.open[0].stake, 0.03236); assert.equal(st.caps.fixedSol, 0.03236); assert.equal(st.caps.perHour, 200);
  assert.equal(s.ch.W.quotes[0].amount, "32360000", "the Jupiter quote is for exactly 0.03236 SOL");
  assert.equal(s.ch.W.lastSwap.userPublicKey, s.key.address, "the swap is for the plugged-in wallet");
  const text = JSON.stringify(st);
  assert.ok(!text.includes(s.key.secret), "the key never appears in the state"); assert.doesNotMatch(text, /PRIVATE KEY|walletPem/);
  assert.equal(fs.statSync(path.join(s.dir, "secrets.json")).mode & 0o777, 0o600, "secrets file is owner-only");
  const pemBody = JSON.parse(fs.readFileSync(path.join(s.dir, "secrets.json"), "utf8")).walletPem.split("\n")[1];
  for (const f of fs.readdirSync(s.dir).filter((x) => x !== "secrets.json")) {
    const body = fs.readFileSync(path.join(s.dir, f), "utf8");
    assert.ok(!body.includes(s.key.secret) && !body.includes(pemBody), `${f} must not hold the key`);
  }
  await s.app.close();
});
test("PHANTOM: an empty wallet still runs (open positions can be sold) and buys nothing", async () => {
  const s = await ownBoot({}, { sol: 0 });
  await s.until(async () => (await s.get("/api/state")).running);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(s.ch.W.sent.length, 0, "no buy goes out with no SOL");
  await s.app.close();
});
test("PHANTOM end to end: plug in -> signed Jupiter swap -> position -> target -> sold from the chain's own numbers", async () => {
  const s = await ownBoot();
  const st = await s.until(async () => { const x = await s.get("/api/state"); return x.engine?.open.length === 1 ? x : null; });
  assert.equal(st.mode, "live"); assert.equal(st.engine.unit, "SOL");
  assert.equal(s.ch.W.sent.length, 1, "exactly one transaction went out for the buy");
  s.state.series = moon; s.state.px.P1 = 2.6;
  const done = await s.until(async () => { const x = await s.get("/api/state"); return x.engine.trades === 1 ? x : null; }, 12000);
  assert.match(done.engine.recentClosed[0].why, /take profit/);
  assert.ok(s.ch.W.sent.length >= 2, "the sale went out as a second transaction");
  assert.ok(s.ch.W.quotes.some((q) => q.outputMint === "So11111111111111111111111111111111111111112"), "the sale was quoted back to SOL");
  await s.app.close();
});
test("PHANTOM: send everything back builds one transfer, refuses bad addresses and refuses while a position is open", async () => {
  const s = await ownBoot({}, { sol: 0 });          // empty at plug-in, so nothing is bought before the transfer
  s.ch.W.sol = 0.11;
  assert.equal((await s.post("/api/withdraw", { to: "nope", all: true })).status, 400);
  const to = "E7rhUgJE1iegQHrE3bA3Sm8CbStMenW1HhayhUETTQyf";
  const r = await s.post("/api/withdraw", { to, all: true });
  assert.equal(r.ok, true); assert.ok(r.sol > 0.109 && r.sol < 0.11, r.sol);
  const tx = s.ch.W.sent[0];
  assert.ok(tx.includes(b58decode(to)), "the destination is in the transaction");
  assert.ok(tx.includes(b58decode(s.key.address)), "it is sent from the plugged-in wallet");
  assert.ok(tx.includes(Buffer.from([2, 0, 0, 0])), "it is a system-program transfer");
  assert.equal((await s.post("/api/go", { mode: "live" })).ok, true);
  await s.until(async () => (await s.get("/api/state")).engine?.open.length === 1);
  assert.equal((await s.post("/api/withdraw", { to, all: true })).status, 400);
  await s.app.close();
});
test("PHANTOM: the same wallet comes back after a restart, and it resumes trading by itself", async () => {
  const s = await ownBoot(); await s.until(async () => (await s.get("/api/state")).engine?.open.length === 1); await s.app.close();
  const again = start({ dataDir: s.dir, port: 0, feed: fakeFeed().feed, now: () => s.state.now, quiet: true, tickMs: 80, execOverride: null, rpc: s.ch.rpc, jupiter: s.ch.jupiter, rug: async () => ({ pass: true, reason: "ok" }) });
  const port = await again.listening;
  const st = await (async () => { const t = Date.now(); for (;;) { const x = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json(); if (x.running && x.engine) return x; if (Date.now() - t > 6000) throw new Error("did not resume"); await new Promise((r) => setTimeout(r, 50)); } })();
  assert.equal(st.own.address, s.key.address); assert.equal(st.setup.imported, true);
  assert.equal(st.engine.open.length, 1, "the open position came back from the journal");
  await again.close();
});
