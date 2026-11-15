import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeEnv, dropEnv, reqOf } from "./helpers.mjs";
import { db } from "../src/db.mjs";

let env, R;
const KEY = "aq-key-test";
before(async () => { env = await makeEnv({ AQUARIUS_KEY: KEY }); R = reqOf(env); });
after(async () => { await dropEnv(env); });
beforeEach(async () => { await db(env).q(`TRUNCATE mob_aquarius RESTART IDENTITY`); });

test("say needs the bearer; feed needs the key and returns the last 20, oldest first, with CORS", async () => {
  assert.equal((await R("POST", "/api/aquarius/say", { body: { text: "hi" } })).status, 401);
  assert.equal((await R("POST", "/api/aquarius/say", { body: { text: "hi" }, bearer: "wrong" })).status, 401);
  for (let i = 1; i <= 23; i++) {
    const r = await R("POST", "/api/aquarius/say", { bearer: "tok-test", body: { text: `msg ${i}`, ...(i === 23 ? { face: "smug", suit: true } : {}) } });
    assert.equal(r.status, 201);
  }
  assert.equal((await R("GET", "/api/aquarius/feed")).status, 401);
  assert.equal((await R("GET", "/api/aquarius/feed?key=nope")).status, 401);
  const r = await R("GET", `/api/aquarius/feed?key=${KEY}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  const { messages } = await r.json();
  assert.equal(messages.length, 20);
  assert.equal(messages[0].text, "msg 4");
  assert.deepEqual([messages[19].text, messages[19].face, messages[19].suit], ["msg 23", "smug", true]);
  assert.ok(messages[19].id > messages[0].id);
});

test("say validates text, face and suit", async () => {
  const S = (body) => R("POST", "/api/aquarius/say", { bearer: "tok-test", body });
  assert.equal((await S({ text: "" })).status, 400);
  assert.equal((await S({ text: "x".repeat(501) })).status, 400);
  assert.equal((await S({ text: "ok", face: "angry" })).status, 400);
  assert.equal((await S({ text: "ok", suit: "yes" })).status, 400);
  assert.equal((await S({ text: "ok", to_chat: "yes" })).status, 400);
  assert.equal((await S({ text: "type me", to_chat: true })).status, 201);
  const f = await (await R("GET", `/api/aquarius/feed?key=${KEY}`)).json();
  assert.equal(f.messages.at(-1).to_chat, true);
  assert.equal((await S({ text: "bubble only" })).status, 201);
  assert.equal((await (await R("GET", `/api/aquarius/feed?key=${KEY}`)).json()).messages.at(-1).to_chat, false);
  for (const face of ["happy", "focused", "smug", "worried", "talking"]) assert.equal((await S({ text: "ok", face })).status, 201);
});

test("heard takes the app key; inbox needs the bearer, returns untaken commands once", async () => {
  assert.equal((await R("POST", "/api/aquarius/heard", { body: { text: "post the clip" } })).status, 401);
  assert.equal((await R("POST", `/api/aquarius/heard?key=${KEY}`, { body: { text: "  " } })).status, 400);
  assert.equal((await R("POST", `/api/aquarius/heard?key=${KEY}`, { body: { text: "post the clip" } })).status, 201);
  assert.equal((await R("POST", "/api/aquarius/heard", { headers: { "x-aquarius-key": KEY }, body: { text: "list the bag" } })).status, 201);
  assert.equal((await R("GET", "/api/aquarius/inbox")).status, 401);
  // the key cannot read the inbox
  assert.equal((await R("GET", `/api/aquarius/inbox?key=${KEY}`)).status, 401);
  const first = await (await R("GET", "/api/aquarius/inbox", { bearer: "tok-test" })).json();
  assert.deepEqual(first.commands.map((c) => c.text), ["post the clip", "list the bag"]);
  const second = await (await R("GET", "/api/aquarius/inbox", { bearer: "tok-test" })).json();
  assert.deepEqual(second.commands, []);
  // heard commands never show up in his speech feed
  const feed = await (await R("GET", `/api/aquarius/feed?key=${KEY}`)).json();
  assert.deepEqual(feed.messages, []);
});

test("preflight answers with CORS; no key configured means locked", async () => {
  const p = await R("OPTIONS", "/api/aquarius/feed");
  assert.equal(p.status, 204); assert.equal(p.headers.get("access-control-allow-origin"), "*");
  const R2 = reqOf({ ...env, AQUARIUS_KEY: undefined });
  assert.equal((await R2("GET", "/api/aquarius/feed?key=")).status, 401);
});

test("brain: bearer only; write, update and read back what was tried and what paid", async () => {
  await db(env).q(`TRUNCATE mob_aquarius_brain RESTART IDENTITY`);
  assert.equal((await R("GET", "/api/aquarius/brain")).status, 401);
  assert.equal((await R("GET", `/api/aquarius/brain?key=${KEY}`)).status, 401);
  const B = (body, p = "/api/aquarius/brain") => R("POST", p, { bearer: "tok-test", body });
  assert.equal((await B({ business: "flip" })).status, 400, "idea required");
  assert.equal((await B({ idea: "x", cost: "lots" })).status, 400);
  assert.equal((await B({ idea: "x", kill_date: "next week" })).status, 400);
  const r = await B({ idea: "Chrome Hearts rings at €180", business: "flip", cost: 120, expected_return: 60, kill_date: "2026-11-30", source: "gem run 14 Nov" });
  assert.equal(r.status, 201);
  const row = await r.json();
  assert.equal(row.idea, "Chrome Hearts rings at €180"); assert.equal(Number(row.cost), 120);
  await B({ idea: "Timmy shorts", business: "clipping", cost: 0 });
  const u = await B({ result: "sold 2 in 3 days", score: 8.5 }, `/api/aquarius/brain/${row.id}`);
  assert.equal(u.status, 200); const ur = await u.json();
  assert.deepEqual([ur.result, Number(ur.score)], ["sold 2 in 3 days", 8.5]);
  assert.equal((await B({ score: 1 }, "/api/aquarius/brain/999")).status, 404);
  assert.equal((await B({}, `/api/aquarius/brain/${row.id}`)).status, 400);
  const all = await (await R("GET", "/api/aquarius/brain", { bearer: "tok-test" })).json();
  assert.equal(all.rows.length, 2); assert.equal(all.rows[0].idea, "Timmy shorts");
  const flip = await (await R("GET", "/api/aquarius/brain?business=flip", { bearer: "tok-test" })).json();
  assert.deepEqual(flip.rows.map((x) => x.idea), ["Chrome Hearts rings at €180"]);
});

test("link: the key routes to Aquarius's own mailbox; MCP act waits for the app's answer", async () => {
  const { LINK_WAIT_MS } = await import("../src/worker.mjs");
  LINK_WAIT_MS.v = 4000;
  const L = (what) => `/api/aquarius/link/lk-test/${what}`;
  const envL = { ...env, AQ_LINK_KEY: "lk-test" }; const RL = reqOf(envL);
  assert.equal((await RL("GET", "/api/aquarius/link/wrong/next")).status, 404);
  assert.equal((await R("GET", "/api/aquarius/link/lk-test/next")).status, 404, "no key configured = closed");
  const rpc = async (method, params) => (await (await RL("POST", L("mcp"), { body: { jsonrpc: "2.0", id: 1, method, params } })).json()).result;
  assert.deepEqual((await rpc("tools/list")).tools.map((t) => t.name), ["aquarius_status", "aquarius_act", "aquarius_result"]);
  assert.match((await rpc("tools/call", { name: "aquarius_act", arguments: { action: "look" } })).content[0].text, /not on right now/);
  assert.equal((await RL("POST", L("status"), { body: { app: "Aquarius", build: "1", chrome: true } })).status, 200);
  assert.match((await rpc("tools/call", { name: "aquarius_status", arguments: {} })).content[0].text, /^connected[\s\S]*"app": "Aquarius"/);
  // the app answers while the MCP call waits
  const pending = rpc("tools/call", { name: "aquarius_act", arguments: { action: "navigate", url: "https://www.google.com/", why: "t" } });
  let cmd = null;
  for (let i = 0; i < 30 && !cmd; i++) { cmd = await (await RL("GET", L("next"))).json(); if (!cmd) await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(cmd.action, "navigate"); assert.equal(cmd.input.url, "https://www.google.com/");
  assert.equal(await (await RL("GET", L("next"))).json(), null, "taken once");
  await RL("POST", L("result"), { body: { id: cmd.id, text: "ok: true\nurl: https://www.google.com/" } });
  assert.match((await pending).content[0].text, /ok: true/);
  // a slow answer gives an id; aquarius_result picks it up
  LINK_WAIT_MS.v = 300;
  const slow = (await rpc("tools/call", { name: "aquarius_act", arguments: { action: "look" } })).content[0].text;
  const id = slow.match(/id "([a-z0-9]+)"/)[1];
  const c2 = await (await RL("GET", L("next"))).json();
  await RL("POST", L("result"), { body: { id: c2.id, text: "late answer" } });
  assert.equal((await rpc("tools/call", { name: "aquarius_result", arguments: { id } })).content[0].text, "late answer");
  LINK_WAIT_MS.v = 40000;
});
