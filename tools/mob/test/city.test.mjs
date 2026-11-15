import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { makeEnv, dropEnv, reqOf, login } from "./helpers.mjs";
import { BUILDINGS, WORKERS, layout } from "../city/config.mjs";

let env, R, cookie;
before(async () => { env = await makeEnv(); R = reqOf(env); cookie = await login(env); });
after(async () => { await dropEnv(env); });

test("every /city route needs the admin session", async () => {
  for (const p of ["/city", "/city/app.js", "/city/data"]) {
    const r = await R("GET", p);
    assert.equal(r.status, 302, p); assert.equal(r.headers.get("location"), "/login", p);
  }
  assert.equal((await R("GET", "/city/data", { bearer: "tok-test" })).status, 302, "the bearer token does not open the page or its data");
});
test("page and bundle load for admin and contain no secret", async () => {
  const page = await R("GET", "/city", { cookie }), body = await page.text();
  assert.equal(page.status, 200); assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  assert.ok(body.includes('src="/city/app.js"'));
  const js = await (await R("GET", "/city/app.js", { cookie })).text();
  assert.ok(js.length > 100000);
  for (const secret of [env.ADMIN_PASSWORD, env.MOB_API_TOKEN, env.MOB_ENC_KEY, env.DATABASE_URL, "postgres://"]) { assert.ok(!body.includes(secret) && !js.includes(secret), "leaked " + secret); }
  assert.equal((await R("POST", "/city/data", { cookie, body: {} })).status, 405, "read-only");
});
test("layout: every building gets a spot, none overlap", () => {
  const l = layout(); assert.equal(l.length, BUILDINGS.length);
  for (const a of l) for (const b of l) if (a !== b) assert.ok(Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]) > 7, `${a.id} too close to ${b.id}`);
  assert.equal(new Set(BUILDINGS.map((b) => b.id)).size, BUILDINGS.length, "ids are unique");
});
test("data route: every building has a panel, workers and totals; no invented numbers", async () => {
  const r = await R("GET", "/city/data", { cookie }); assert.equal(r.status, 200);
  const d = await r.json();
  for (const b of BUILDINGS) { const p = d.buildings[b.id]; assert.ok(p, b.id); assert.ok(["open", "construction", "closed", "planned"].includes(p.status), b.id); }
  assert.equal(d.workers.length, WORKERS.length); assert.ok(d.totals && d.board);
  assert.equal(d.buildings.miner.status, "construction"); assert.ok(d.buildings.miner.notes.some((n) => /Waiting for the machine/.test(n)));
  assert.ok(d.buildings.miner.kpis.every((k) => k.no), "miner shows no fake hash or earnings");
  assert.ok(d.buildings.stocks.kpis.some((k) => /paper only/.test(k.v)), "trading is paper only");
  assert.ok(!JSON.stringify(d).match(/sk_live|sk_test|pk_live|pk_test|secret_key/), "no key material in the data");
  assert.equal(d.buildings.bank.lists[0].title.startsWith("Processors"), true);
});
test("income ledger: auth, validation, duplicates, shows as manual on the building and in the total", async () => {
  assert.equal((await R("GET", "/api/income")).status, 401);
  assert.equal((await R("POST", "/api/income", { body: { business: "archive", source: "x", amount_cents: 100 } })).status, 401);
  const bad = await R("POST", "/api/income", { bearer: "tok-test", body: { business: "nope", source: "", amount_cents: 0, currency: "usd1" } });
  assert.equal(bad.status, 400);
  const ok = await R("POST", "/api/income", { bearer: "tok-test", body: { business: "archive", source: "Stripe payment link", amount_cents: 130000, currency: "usd", ext_ref: "pi_test_1", note: "direct sale via payment link, no store order" } });
  assert.equal(ok.status, 201); const e = (await ok.json()).entry; assert.equal(e.amount_cents, 130000); assert.equal(e.currency, "USD"); assert.equal(e.manual, true);
  assert.equal((await R("POST", "/api/income", { cookie, body: { business: "archive", source: "dup", amount_cents: 5, ext_ref: "pi_test_1" } })).status, 409);
  const list = await (await R("GET", "/api/income", { cookie })).json(); assert.equal(list.entries.length, 1);
  const d = await (await R("GET", "/city/data", { cookie })).json();
  const k = d.buildings.archive.kpis.find((x) => x.l === "Manual income (30d)"); assert.equal(k.v, "$1,300.00"); assert.equal(k.tag, "manual");
  assert.equal(d.totals.manual30.USD, 130000); assert.equal(d.totals.manualAll.USD, 130000);
  assert.ok(d.buildings.bank.lists.some((l) => /Manual income ledger/.test(l.title) && l.rows[0].tag === "manual"));
});
test("news: push and read the latest headlines", async () => {
  assert.equal((await R("POST", "/api/news", { body: { headline: "x" } })).status, 401);
  assert.equal((await R("POST", "/api/news", { bearer: "tok-test", body: { headline: "h", topic: "nope" } })).status, 400);
  const r = await R("POST", "/api/news", { bearer: "tok-test", body: { items: [{ headline: "BTC up", topic: "crypto", source: "test", url: "https://example.com/a" }, { headline: "Fed holds", topic: "stocks" }] } });
  assert.equal(r.status, 201);
  const d = await (await R("GET", "/city/data", { cookie })).json(); assert.equal(d.buildings.news.lists[0].rows.length, 2);
});
