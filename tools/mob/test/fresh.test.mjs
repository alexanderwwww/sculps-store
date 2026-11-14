// A fresh deploy: tables do not exist yet. The first page view and the first API call must work.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { reqOf, dropEnv, r2 } from "./helpers.mjs";
import { _resetMigrated } from "../src/core.mjs";
import { db } from "../src/db.mjs";

const schema = `mob_fresh_${Date.now().toString(36)}`;
const env = { DATABASE_URL: process.env.DATABASE_URL, MOB_SCHEMA: schema, ADMIN_PASSWORD: "pw", MOB_API_TOKEN: "tok", MOB_ENC_KEY: "k", MEDIA: r2({ "oraktys-a.mp4": 10 }) };
after(async () => { await dropEnv(env); });

test("first requests against an unmigrated database succeed", async () => {
  _resetMigrated();
  await db(env).q(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  const R = reqOf(env);
  let r = await R("GET", "/api/posts", { bearer: "tok" });
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual(await r.json(), []);
  _resetMigrated();
  await db(env).q(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  r = await R("POST", "/login", { form: { password: "pw" } });
  assert.equal(r.status, 302);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  r = await R("GET", "/", { cookie });
  assert.equal(r.status, 200);
});
