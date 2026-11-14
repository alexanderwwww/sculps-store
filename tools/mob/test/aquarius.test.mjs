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
