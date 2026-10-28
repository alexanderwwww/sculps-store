// One button, end to end: Start -> Ultra attaches to Chrome, finds GMGN logged in, matches the wallet to the chain, trades the
// Instant-trade window, and reports. Headless Chrome + the fake GMGN page; no internet.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { start } from "../src/server.mjs";
import { fakeFeed, moon } from "./fakefeed.mjs";
import { startFakeGmgn, routeGmgn, launchChrome, mintOf, FakeChain, WALLET } from "./fixtures/fake-gmgn.mjs";

async function boot({ loggedIn = true, chipOff = 0 } = {}) {
  const chrome = await launchChrome();
  const chain = new FakeChain({ sol: 0.1 });
  const gm = await startFakeGmgn({ chain, variant: "instant", pxOf: () => 4.8e-5 });
  await routeGmgn(chrome.ctx, gm);
  if (!loggedIn) gm.variant = "loggedOut";
  const rpc = { solBalance: async () => chain.solBalance(), tokenAccounts: async (_o, mint) => { const t = await chain.tokenBalance(mint); return t.raw === "0" ? [] : [{ raw: BigInt(t.raw), pubkey: "x", program: "y", decimals: 6 }]; } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-web-"));
  const { feed, state } = fakeFeed();
  // the coins the fake market offers need real-looking mints that the fake GMGN page serves
  for (const p of state.pools) p.mint = mintOf(p.name);
  const app = start({ dataDir: dir, port: 0, feed, now: () => state.now, quiet: true, tickMs: 60, rug: async () => ({ pass: true, reason: "ok" }), rpc, balance: async () => chain.solBalance(), chrome: async () => ({ browser: chrome.browser, opened: false }), webWalletOf: async () => WALLET });
  if (chipOff) gm.chip = String(chipOff);
  const port = await app.listening, base = `http://127.0.0.1:${port}`;
  const get = async (p) => (await fetch(base + p)).json();
  const post = async (p, body = {}) => { const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json", "x-ultra-token": app.token }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
  const until = async (f, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await new Promise((r) => setTimeout(r, 60)); } throw new Error("timed out"); };
  return { app, chrome, chain, gm, state, get, post, until, dir, close: async () => { await app.close(); await chrome.close(); await gm.close(); } };
}

test("ONE BUTTON: Start finds GMGN logged in, the wallet matches the chain, a signal becomes one trusted preset click, the exit one Sell 100% click", async () => {
  const s = await boot();
  assert.equal((await s.get("/api/state")).source, "web");
  const r = await s.post("/api/go", { mode: "live" });
  assert.equal(r.ok, true, JSON.stringify(r));
  const st = await s.until(async () => { const x = await s.get("/api/state"); return x.engine?.open.length === 1 ? x : null; });
  assert.equal(st.mode, "live"); assert.equal(st.engine.unit, "SOL");
  const buys = s.gm.clicks((e) => e.trusted && /^ip\d$/.test(e.id || ""));
  assert.equal(buys.length, 1); assert.equal(buys[0].id, "ip0");
  assert.equal(s.gm.events.filter((e) => /^(decoy|dp\d)$/.test(e.id || "")).length, 0, "decoys untouched");
  assert.equal(st.engine.open[0].stake, 0.0162);   // 0.01618 shown to 4 places
  s.state.series = moon; s.state.px.P1 = 2.6;
  const done = await s.until(async () => { const x = await s.get("/api/state"); return x.engine.trades === 1 ? x : null; });
  assert.match(done.engine.recentClosed[0].why, /take profit/);
  assert.equal(s.gm.clicks((e) => e.trusted && e.id === "isp3").length, 1, "one Sell 100% click");
  assert.equal((await s.chain.tokenBalance(mintOf("ALPHA"))).raw, "0", "the wallet is flat again");
  await s.close();
});
test("ONE BUTTON: a GMGN that is not logged in says what to do, in plain words", async () => {
  const s = await boot();
  s.gm.variant = "loggedOut";
  const r = await s.post("/api/go", { mode: "live" });
  assert.equal(r.status, 400); assert.match(r.error, /log in to GMGN/i);
  await s.close();
});
test("ONE BUTTON: a wallet that does not match what GMGN shows is refused before any click", async () => {
  const s = await boot({ chipOff: 0.5 });
  const r = await s.post("/api/go", { mode: "live" });
  assert.equal(r.status, 400); assert.match(r.error, /shows 0\.5 SOL/);
  assert.equal(s.gm.clicks((e) => e.trusted).length, 0);
  await s.close();
});
test("ONE BUTTON: Sell everything sells the open position with one Sell 100% click", async () => {
  const s = await boot();
  await s.post("/api/go", { mode: "live" });
  await s.until(async () => (await s.get("/api/state")).engine?.open.length === 1);
  const r = await s.post("/api/flatten");
  assert.equal(r.open, 0);
  assert.equal(s.gm.clicks((e) => e.trusted && e.id === "isp3").length, 1);
  await s.close();
});
