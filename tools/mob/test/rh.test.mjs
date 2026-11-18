// Robinhood link (src/aq/robinhood.mjs): sign-in round trip against a fake Robinhood, sealed tokens, renewal on 401,
// the read-only tool list, the limits. Throwaway schema (helpers.makeEnv); every Robinhood URL is mocked: no real call.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeEnv, dropEnv, reqOf, login, mock, resetMocks, res, calls } from "./helpers.mjs";
import { db } from "../src/db.mjs";
import { unseal } from "../src/auth.mjs";
import * as RH from "../src/aq/robinhood.mjs";
import { buildState, _resetSeeded } from "../src/aq/engine.mjs";

let env, R, cookie;
const CB = "https://mob.gardenbuddystore.workers.dev/api/aq/rh/callback";
const st = async (k) => (await db(env).one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? null;
const TOOLS = [
  { name: "get_accounts", description: "List accounts", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "get_portfolio", description: "Portfolio", inputSchema: { type: "object", properties: { account_number: { type: "string" } }, required: ["account_number"] }, annotations: { readOnlyHint: true } },
  { name: "get_equity_positions", description: "Positions", inputSchema: { type: "object", properties: { account_number: { type: "string" } }, required: ["account_number"] } },
  { name: "review_equity_order", description: "Simulate an order", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  { name: "place_equity_order", description: "Place an order", inputSchema: { type: "object" }, annotations: { destructiveHint: true } },
  { name: "cancel_equity_order", description: "Cancel an order", inputSchema: { type: "object" } },
];
// A fake Robinhood: metadata + registration exactly as the real ones answered on 2026-11-18, a token endpoint that checks
// PKCE, and an MCP endpoint that answers JSON for initialize and SSE for the rest. `fake` records what it was asked.
const fake = { reg: 0, token: [], mcp: [], called: [], access: "AT-1", refresh: "RT-1", n: 1, challenge: null, tools: TOOLS, expire: null };
function fakeRobinhood() {
  mock("GET", RH.RH_RESOURCE_META, () => ({ authorization_servers: [RH.RH_MCP], bearer_methods_supported: ["header"], resource: RH.RH_MCP, scopes_supported: ["internal"] }));
  mock("GET", RH.RH_AS_META, () => ({ authorization_endpoint: "https://robinhood.com/oauth", authorization_response_iss_parameter_supported: true, code_challenge_methods_supported: ["S256"], grant_types_supported: ["authorization_code", "refresh_token"],
    issuer: RH.RH_MCP, registration_endpoint: "https://agent.robinhood.com/oauth/trading/register", response_types_supported: ["code"], scopes_supported: ["internal"], token_endpoint: "https://api.robinhood.com/oauth2/token/", token_endpoint_auth_methods_supported: ["none"] }));
  mock("POST", "https://agent.robinhood.com/oauth/trading/register", (c) => { fake.reg++; const b = JSON.parse(c.body); return { client_id: "CLIENT-ABC", client_name: "Robinhood Trading", redirect_uris: b.redirect_uris, token_endpoint_auth_method: "none" }; });
  mock("POST", "https://api.robinhood.com/oauth2/token/", async (c) => {
    const f = Object.fromEntries(new URLSearchParams(String(c.body))); fake.token.push(f);
    if (f.client_id !== "CLIENT-ABC") return res({ error: "invalid_client" }, 401);
    if (f.grant_type === "authorization_code") {
      if (f.code !== "CODE-1" || f.redirect_uri !== CB || (await RH.pkceChallenge(f.code_verifier)) !== fake.challenge) return res({ error: "invalid_grant" }, 401);
    } else if (f.grant_type !== "refresh_token" || f.refresh_token !== fake.refresh) return res({ error: "invalid_grant" }, 401);
    fake.n++; fake.access = `AT-${fake.n}`; fake.refresh = `RT-${fake.n}`;
    return { access_token: fake.access, refresh_token: fake.refresh, token_type: "Bearer", expires_in: 3600, scope: "internal" };
  });
  mock("POST", RH.RH_MCP, (c) => {
    const m = JSON.parse(c.body); fake.mcp.push({ method: m.method, auth: c.headers.authorization, sid: c.headers["mcp-session-id"] || null });
    if (c.headers.authorization !== `Bearer ${fake.access}`) return new Response("authentication required", { status: 401, headers: { "www-authenticate": `Bearer resource_metadata="${RH.RH_RESOURCE_META}"` } });
    if (m.method === "initialize") return res({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "rh-trading", version: "1" } } }, 200, { "mcp-session-id": "SESS-9" });
    if (m.method === "notifications/initialized") return new Response(null, { status: 202 });
    const sse = (result) => new Response(`: hello\n\nevent: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} })}\n\nevent: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: m.id, result })}\n\n`, { headers: { "content-type": "text/event-stream" } });
    if (m.method === "tools/list") return sse({ tools: fake.tools });
    if (m.method === "tools/call") { fake.called.push(m.params);
      const data = { get_accounts: { accounts: [{ account_number: "912345678", type: "agent" }] }, get_portfolio: { total_value: "1234.56", buying_power: { amount: "200.10", currency: "USD" } }, get_equity_positions: { positions: [{ symbol: "AAPL", quantity: "1.5", market_value: "300.00", average_buy_price: "190" }] } }[m.params.name];
      return sse({ content: [{ type: "text", text: JSON.stringify(data) }] }); }
    return res({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no such method" } });
  });
}
before(async () => { env = await makeEnv(); _resetSeeded(); R = reqOf(env); cookie = await login(env); });
after(async () => { await dropEnv(env); });
beforeEach(() => { resetMocks(); fakeRobinhood(); });

test("only Alex's admin session reaches the Robinhood routes", async () => {
  assert.equal((await R("GET", "/api/aq/rh/status")).status, 401);
  assert.equal((await R("GET", "/api/aq/rh/status", { bearer: env.MOB_API_TOKEN })).status, 403);
  assert.equal((await R("POST", "/api/aq/rh/limits", { bearer: env.MOB_API_TOKEN, body: { maxPerTradeUsd: 5 } })).status, 403);
  assert.equal((await R("POST", "/api/aq/rh/disconnect")).status, 401);
  const c = await R("GET", "/api/aq/rh/connect"); assert.equal(c.status, 302); assert.equal(c.headers.get("location"), "/login");
  const cb = await R("GET", "/api/aq/rh/callback?code=x&state=y"); assert.equal(cb.headers.get("location"), "/login");
  assert.equal(calls.length, 0, "nothing was asked of Robinhood without a session");
  const s = await (await R("GET", "/api/aq/rh/status", { cookie })).json();
  assert.equal(s.connected, false); assert.deepEqual(s.limits, RH.LIMIT_DEFAULTS); assert.deepEqual(s.tools, []); assert.equal(s.liveOrders, false);
});

test("connect: registers once, PKCE + state stored server-side, the callback checks state and iss, tokens are stored sealed", async () => {
  const r = await R("GET", "/api/aq/rh/connect", { cookie }); assert.equal(r.status, 302);
  const u = new URL(r.headers.get("location")), q = u.searchParams;
  assert.equal(u.origin + u.pathname, "https://robinhood.com/oauth");
  assert.equal(q.get("response_type"), "code"); assert.equal(q.get("client_id"), "CLIENT-ABC"); assert.equal(q.get("redirect_uri"), CB);
  assert.equal(q.get("code_challenge_method"), "S256"); assert.equal(q.get("resource"), RH.RH_MCP); assert.equal(q.get("scope"), "internal");
  assert.match(q.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/); assert.ok(q.get("state").length >= 32);
  const reg = JSON.parse(calls.find((c) => c.url.endsWith("/register")).body);
  assert.deepEqual(reg.redirect_uris, [CB]); assert.equal(reg.token_endpoint_auth_method, "none");
  const p = await st("rh_oauth"); assert.equal(p.state, q.get("state")); assert.ok(p.expiresAt > Date.now());
  assert.ok(p.verifier.startsWith("v1."), "the verifier is sealed at rest");
  assert.equal(await RH.pkceChallenge(await unseal(env, p.verifier)), q.get("code_challenge"));
  fake.challenge = q.get("code_challenge");
  // a second press does not register again
  await R("GET", "/api/aq/rh/connect", { cookie }); assert.equal(fake.reg, 1);
  const p2 = await st("rh_oauth"), state = p2.state; fake.challenge = await RH.pkceChallenge(await unseal(env, p2.verifier));
  // wrong state: refused, and the pending sign-in is still there for the real answer
  let cb = await R("GET", `/api/aq/rh/callback?code=CODE-1&state=${q.get("state")}`, { cookie });
  assert.equal(cb.headers.get("location"), "/aq?rh=error"); assert.equal(await st("rh_tokens"), null); assert.equal(fake.token.length, 0);
  // wrong issuer: refused before the code is used, and the state is spent
  cb = await R("GET", `/api/aq/rh/callback?code=CODE-1&state=${state}&iss=${encodeURIComponent("https://evil.example")}`, { cookie });
  assert.equal(cb.headers.get("location"), "/aq?rh=error"); assert.equal(fake.token.length, 0); assert.equal(await st("rh_oauth"), null);
  assert.match((await st("rh_status")).lastError, /different server/);
  // the real round trip
  await R("GET", "/api/aq/rh/connect", { cookie }); const p3 = await st("rh_oauth"); fake.challenge = await RH.pkceChallenge(await unseal(env, p3.verifier));
  cb = await R("GET", `/api/aq/rh/callback?code=CODE-1&state=${p3.state}&iss=${encodeURIComponent(RH.RH_MCP)}`, { cookie });
  assert.equal(cb.headers.get("location"), "/aq?rh=connected");
  const sent = fake.token.at(-1); assert.equal(sent.grant_type, "authorization_code"); assert.equal(sent.redirect_uri, CB); assert.equal(sent.client_id, "CLIENT-ABC"); assert.equal(sent.resource, RH.RH_MCP); assert.ok(sent.code_verifier);
  // replay of the same callback finds no pending sign-in
  cb = await R("GET", `/api/aq/rh/callback?code=CODE-1&state=${p3.state}`, { cookie }); assert.equal(cb.headers.get("location"), "/aq?rh=error");
  assert.ok(await st("rh_tokens"), "a failed replay does not delete the stored sign-in");
});

test("tokens: AES-GCM round trip; no token in any state row, brain row, state JSON or status answer", async () => {
  const row = await st("rh_tokens");
  assert.match(row.sealed, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(JSON.parse(await unseal(env, row.sealed)), { access: fake.access, refresh: fake.refresh });
  await assert.rejects(unseal({ MOB_ENC_KEY: "another-key" }, row.sealed), "a different key cannot open it");
  assert.ok(new Date(row.expiresAt) > new Date(Date.now() + 3500e3));
  const status = await (await R("GET", "/api/aq/rh/status?fresh=1", { cookie })).json();
  const state = await buildState(env);
  const everything = JSON.stringify([await db(env).q(`SELECT k, v FROM mob_aq_state`), await db(env).q(`SELECT text, data FROM mob_aq_brain`), state, status]);
  for (const secret of [fake.access, fake.refresh, "AT-", "RT-", "CODE-1"]) assert.ok(!everything.includes(secret), `${secret} is nowhere in the clear`);
  assert.equal(state.robinhood.connected, true); assert.ok(!("sealed" in state.robinhood));
});

test("status: reads the account with the read tools only (JSON and SSE answers, session id), masks nothing it should show", async () => {
  fake.mcp.length = 0; fake.called.length = 0;
  const s = await (await R("GET", "/api/aq/rh/status?fresh=1", { cookie })).json();
  assert.equal(s.connected, true); assert.ok(s.since); assert.ok(s.tokenExpiresAt);
  assert.deepEqual(s.tools, TOOLS.map((t) => t.name)); assert.deepEqual(s.readTools, ["get_accounts", "get_portfolio", "get_equity_positions"]);
  assert.deepEqual(fake.mcp.map((m) => m.method), ["initialize", "notifications/initialized", "tools/list", "tools/call", "tools/call", "tools/call"]);
  assert.equal(fake.mcp[0].sid, null); assert.ok(fake.mcp.slice(1).every((m) => m.sid === "SESS-9"));
  assert.deepEqual(fake.called, [{ name: "get_accounts", arguments: {} }, { name: "get_portfolio", arguments: { account_number: "912345678" } }, { name: "get_equity_positions", arguments: { account_number: "912345678" } }]);
  assert.equal(s.account.valueUsd, 1234.56); assert.equal(s.account.cashUsd, 200.1);
  assert.deepEqual(s.account.positions, [{ symbol: "AAPL", quantity: 1.5, valueUsd: 300, avgCostUsd: 190 }]);
  assert.ok(!JSON.stringify(s).includes("912345678"), "the account number is shown masked"); assert.ok(JSON.stringify(s).includes("••••5678"));
  assert.equal(s.lastError, null);
  // inside a minute the stored read is served again: Robinhood is not asked
  fake.mcp.length = 0; await R("GET", "/api/aq/rh/status", { cookie }); assert.equal(fake.mcp.length, 0);
  const pub = (await buildState(env)).robinhood; assert.equal(pub.account.valueUsd, 1234.56); assert.equal(pub.liveOrders, false);
});

test("401 from Robinhood: the sign-in is renewed once and the call repeated; a sign-in close to expiry is renewed first", async () => {
  const old = fake.access; fake.access = "AT-rotated-elsewhere"; fake.mcp.length = 0; const n = fake.token.length; // Robinhood no longer accepts the stored one
  const s = await (await R("GET", "/api/aq/rh/status?fresh=1", { cookie })).json();
  assert.equal(s.lastError, null); assert.equal(s.account.valueUsd, 1234.56);
  assert.equal(fake.token.length, n + 1); assert.equal(fake.token.at(-1).grant_type, "refresh_token"); assert.equal(fake.token.at(-1).resource, RH.RH_MCP);
  assert.equal(fake.mcp[0].auth, `Bearer ${old}`); assert.equal(fake.mcp[1].auth, `Bearer ${fake.access}`); assert.equal(fake.mcp[1].method, "initialize");
  assert.deepEqual(JSON.parse(await unseal(env, (await st("rh_tokens")).sealed)), { access: fake.access, refresh: fake.refresh }, "the new pair is what is stored");
  // close to expiry: renewed before the first MCP call
  const row = await st("rh_tokens"); await db(env).q(`UPDATE mob_aq_state SET v=$1 WHERE k='rh_tokens'`, [JSON.stringify({ ...row, expiresAt: new Date(Date.now() + 60e3).toISOString() })]);
  fake.mcp.length = 0; await R("GET", "/api/aq/rh/status?fresh=1", { cookie });
  assert.equal(fake.token.length, n + 2); assert.ok(fake.mcp.every((m) => m.auth === `Bearer ${fake.access}`)); assert.equal((await st("rh_tokens")).since, row.since);
  assert.equal(await st("rh_refresh_lock"), null);
});

test("read list: an order tool is refused before any request, whatever the server says about it", async () => {
  const sess = await RH.mcpOpen(env); await RH.mcpTools(env, sess); fake.called.length = 0; const n = calls.length;
  for (const name of ["place_equity_order", "cancel_equity_order", "review_equity_order", "get_equity_orders", "get_order_book", "made_up_tool", undefined])
    await assert.rejects(RH.callRead(env, sess, name, { symbol: "AAPL", quantity: 1 }), /Refused/);
  assert.equal(calls.length, n, "not one request left for a refused tool"); assert.equal(fake.called.length, 0);
  // on the list, but Robinhood marks it as writing or does not offer it: refused too
  assert.match(RH.whyNotRead("get_portfolio", { name: "get_portfolio", annotations: { readOnlyHint: false } }), /changes things/);
  assert.match(RH.whyNotRead("get_portfolio", { name: "get_portfolio", annotations: { destructiveHint: true } }), /changes things/);
  assert.match(RH.whyNotRead("get_portfolio", null), /does not offer/);
  assert.equal(RH.whyNotRead("get_portfolio", { name: "get_portfolio" }), null);
  assert.ok(RH.READ_TOOLS.every((t) => /^get_/.test(t)) && Object.isFrozen(RH.READ_TOOLS));
  // the module has no other way to send tools/call
  const src = (await import("node:fs")).readFileSync(new URL("../src/aq/robinhood.mjs", import.meta.url), "utf8");
  assert.equal(src.split('"tools/call"').length - 1, 1);
  // a required argument get_accounts does not carry is never invented: the tool is skipped and the reason kept
  fake.tools = TOOLS.map((t) => (t.name === "get_portfolio" ? { ...t, inputSchema: { type: "object", required: ["portfolio_id"] } } : t)); fake.called.length = 0;
  const s = await (await R("GET", "/api/aq/rh/status?fresh=1", { cookie })).json(); fake.tools = TOOLS;
  assert.ok(!fake.called.some((c) => c.name === "get_portfolio")); assert.match(s.lastError, /get_portfolio: needs portfolio_id/); assert.equal(s.account.valueUsd, null);
});

test("limits: zero and off by default, numbers 0 or more, auto trade only stores a flag and needs limits first", async () => {
  const L = (body) => R("POST", "/api/aq/rh/limits", { cookie, body });
  assert.deepEqual(RH.LIMIT_DEFAULTS, { maxPerTradeUsd: 0, maxDailyLossUsd: 0, maxOpenPositions: 0, allowStocks: false, allowCrypto: false, autoTrade: false });
  for (const bad of [{ maxPerTradeUsd: -1 }, { maxPerTradeUsd: "5" }, { maxDailyLossUsd: null }, { maxOpenPositions: 1.5 }, { maxOpenPositions: -2 }, { allowStocks: "yes" }, { autoTrade: 1 }, { somethingElse: 1 }, { maxPerTradeUsd: 1e9 }])
    assert.equal((await L(bad)).status, 400, JSON.stringify(bad));
  assert.equal((await R("POST", "/api/aq/rh/limits", { cookie, body: "not json", headers: { "content-type": "application/json" } })).status, 400);
  assert.equal(await st("rh_limits"), null, "a refused change stores nothing");
  let r = await L({ autoTrade: true }); assert.equal(r.status, 400); assert.match((await r.json()).error.message, /needs every limit/);
  r = await L({ maxPerTradeUsd: 25.555, maxDailyLossUsd: 50, maxOpenPositions: 3, allowStocks: true }); assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).limits, { maxPerTradeUsd: 25.56, maxDailyLossUsd: 50, maxOpenPositions: 3, allowStocks: true, allowCrypto: false, autoTrade: false });
  assert.equal((await L({ autoTrade: true })).status, 200);
  assert.equal((await L({ maxPerTradeUsd: 0 })).status, 400, "a limit cannot drop to zero while auto trade is on");
  const rhCalls = () => calls.filter((c) => c.url.includes("robinhood")).length, n = rhCalls();
  assert.equal((await buildState(env)).robinhood.limits.autoTrade, true); assert.equal(rhCalls(), n, "the state the panel polls never talks to Robinhood");
  assert.equal(RH.validateLimits([1]).error, "Send the limits as fields");
});

test("disconnect deletes the sign-in and switches auto trade off; the timer registers the client and never throws", async () => {
  const r = await (await R("POST", "/api/aq/rh/disconnect", { cookie })).json(); assert.equal(r.connected, false);
  for (const k of ["rh_tokens", "rh_oauth", "rh_cache"]) assert.equal(await st(k), null);
  const s = await (await R("GET", "/api/aq/rh/status", { cookie })).json();
  assert.equal(s.connected, false); assert.equal(s.limits.autoTrade, false); assert.equal(s.limits.maxPerTradeUsd, 25.56); assert.equal(s.account, null);
  await assert.rejects(RH.mcpOpen(env), /not connected/);
  // the timer on a fresh install
  await db(env).q(`DELETE FROM mob_aq_state WHERE k='rh_client'`); const reg = fake.reg;
  assert.deepEqual(await RH.rhWarm(env), { registered: true }); assert.equal(fake.reg, reg + 1); assert.equal((await st("rh_client")).redirectUri, CB);
  assert.deepEqual(await RH.rhWarm(env), { connected: false }); assert.equal(fake.reg, reg + 1);
  // Robinhood unreachable: the reason is kept for the panel, nothing is thrown
  await db(env).q(`DELETE FROM mob_aq_state WHERE k='rh_client'`); resetMocks();
  assert.deepEqual(await RH.rhWarm(env), { registered: false }); assert.match((await st("rh_status")).lastError, /unmocked fetch|metadata/);
  // metadata pointing off robinhood.com is refused
  mock("GET", RH.RH_RESOURCE_META, () => ({ authorization_servers: [RH.RH_MCP], resource: RH.RH_MCP }));
  mock("GET", RH.RH_AS_META, () => ({ issuer: RH.RH_MCP, authorization_endpoint: "https://robinhood.com/oauth", token_endpoint: "https://evil.example/token", registration_endpoint: "https://agent.robinhood.com/oauth/trading/register", code_challenge_methods_supported: ["S256"] }));
  await assert.rejects(RH.discover(), /no usable token_endpoint/);
});
