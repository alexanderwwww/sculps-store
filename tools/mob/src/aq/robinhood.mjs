// Robinhood AGENT account link for Aquarius: the CONNECTION, the READ side and the SAFETY LIMITS. Nothing here can place,
// change or cancel an order: the only path to tools/call is callRead(), and it refuses every tool that is not in READ_TOOLS.
//
// What Robinhood's own endpoints said when this was written (read live, 2026-11-18, not from memory):
//  - MCP endpoint https://agent.robinhood.com/mcp/trading (streamable HTTP). No token -> 401 with
//    www-authenticate: Bearer resource_metadata="https://agent.robinhood.com/.well-known/oauth-protected-resource/mcp/trading"
//  - protected-resource metadata: resource = the MCP endpoint, authorization_servers = [the same URL], scopes ["internal"]
//  - authorization-server metadata: issuer https://agent.robinhood.com/mcp/trading, authorization_endpoint https://robinhood.com/oauth,
//    token_endpoint https://api.robinhood.com/oauth2/token/, registration_endpoint https://agent.robinhood.com/oauth/trading/register,
//    PKCE S256, token_endpoint_auth_methods ["none"] (public client), authorization_response_iss_parameter_supported true
//  - registration answers 200 (not 201) with {client_id, client_name:"Robinhood Trading", redirect_uris, token_endpoint_auth_method:"none"}.
//    The client_id is THE SAME for every caller and every redirect_uri: it is one shared public client, not one per app.
//  - token endpoint: form-encoded; unknown client -> 401 {"error":"invalid_client"}; our client + bad code -> 401 {"error":"invalid_grant"}
// Tokens are stored AES-GCM sealed (auth.mjs seal/unseal, key from the MOB_ENC_KEY secret) in mob_aq_state k='rh_tokens'.
// They are never logged, never put in a brain row, never returned by a route, and left out of the R2 backup (keeper.mjs).
import { db } from "../db.mjs";
import { seal, unseal, safeEqual } from "../auth.mjs";

export const RH_MCP = "https://agent.robinhood.com/mcp/trading";
export const RH_RESOURCE_META = "https://agent.robinhood.com/.well-known/oauth-protected-resource/mcp/trading";
export const RH_AS_META = "https://agent.robinhood.com/.well-known/oauth-authorization-server";
const STATE_TTL_MS = 10 * 60000, REFRESH_EARLY_MS = 5 * 60000, CACHE_MS = 60000, TIMEOUT_MS = 20000;
const PROTOCOL = "2025-06-18";

// The ONLY tools this build may call. Names as published for Robinhood's trading MCP (third-party listings, 2026-11-18);
// each one must also be in the server's own tools/list and must not be marked as writing there (see whyNotRead).
// Deliberately NOT here although they read: review_equity_order (simulates an order), get_equity_orders (order history).
export const READ_TOOLS = Object.freeze(["get_accounts", "get_portfolio", "get_equity_positions"]);
// A second lock on top of the allowlist: a name that looks like it does something is refused even if someone adds it above.
const ACTION_WORD = /(^|_)(place|order|orders|buy|sell|trade|cancel|modify|replace|submit|review|execute|exercise|close|open|transfer|withdraw|deposit|create|update|add|remove|delete|set|send)(_|$)/i;
export function whyNotRead(name, def = null) {
  if (typeof name !== "string" || !READ_TOOLS.includes(name)) return `"${name}" is not on the read list of this build`;
  if (ACTION_WORD.test(name)) return `"${name}" is named like an action, not a read`;
  if (!def) return `Robinhood does not offer "${name}"`;
  const a = def.annotations || {};
  if (a.readOnlyHint === false || a.destructiveHint === true) return `Robinhood marks "${name}" as a tool that changes things`;
  return null;
}

// ---------------------------------------------------------------- small helpers
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));
export const pkceChallenge = async (verifier) => b64u(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
const get = async (d, k, dflt = null) => (await d.one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? dflt;
const set = (d, k, v) => d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [k, JSON.stringify(v)]);
const del = (d, k) => d.q(`DELETE FROM mob_aq_state WHERE k=$1`, [k]);
const brain = (d, text) => d.q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('execution','event',$1)`, [text]);
const note = async (d, lastError) => { try { await set(d, "rh_status", { lastError, at: new Date().toISOString() }); } catch {} };
const cut = (s, n = 300) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
export const redirectUri = (env) => `${(env.MOB_BASE_URL || "https://mob.gardenbuddystore.workers.dev").replace(/\/$/, "")}/api/aq/rh/callback`;
const rhHost = (u) => { try { const x = new URL(u); return x.protocol === "https:" && (x.hostname === "robinhood.com" || x.hostname.endsWith(".robinhood.com")); } catch { return false; } };
const fetchT = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

// ---------------------------------------------------------------- discovery + registration
// Read from Robinhood every time a sign-in starts, so a change on their side is seen and never guessed around.
export async function discover() {
  const pr = await fetchT(RH_RESOURCE_META, { headers: { accept: "application/json" } });
  if (!pr.ok) throw new Error(`Robinhood's resource metadata answered HTTP ${pr.status}`);
  const res = await pr.json();
  const r = await fetchT(RH_AS_META, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Robinhood's sign-in metadata answered HTTP ${r.status}`);
  const m = await r.json();
  for (const k of ["authorization_endpoint", "token_endpoint", "registration_endpoint"]) if (!rhHost(m[k])) throw new Error(`Robinhood's sign-in metadata has no usable ${k}`);
  if (!(m.code_challenge_methods_supported || []).includes("S256")) throw new Error("Robinhood's sign-in metadata no longer lists PKCE S256");
  if (!Array.isArray(res.authorization_servers) || !res.authorization_servers.includes(m.issuer)) throw new Error("Robinhood's resource metadata names a different sign-in server");
  return { issuer: m.issuer, authorization_endpoint: m.authorization_endpoint, token_endpoint: m.token_endpoint, registration_endpoint: m.registration_endpoint,
    scope: (res.scopes_supported || m.scopes_supported || []).join(" ") || null, resource: res.resource || RH_MCP, issParam: m.authorization_response_iss_parameter_supported === true };
}
// Registers once and keeps the client_id; registers again only if our redirect address changed.
export async function ensureClient(env, meta = null) {
  const d = db(env), have = await get(d, "rh_client");
  const uri = redirectUri(env);
  if (have?.clientId && have.redirectUri === uri && have.meta?.token_endpoint) return have;
  meta = meta || (await discover());
  const r = await fetchT(meta.registration_endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_name: "Aquarius", redirect_uris: [uri], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", ...(meta.scope ? { scope: meta.scope } : {}) }) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.client_id) throw new Error(`Robinhood did not register the client (HTTP ${r.status}${j?.error ? `, ${cut(j.error, 80)}` : ""})`);
  if (j.client_secret) throw new Error("Robinhood returned a client secret; this build only handles the public client its metadata describes");
  if (Array.isArray(j.redirect_uris) && !j.redirect_uris.includes(uri)) throw new Error("Robinhood registered a different redirect address than the one sent");
  const row = { clientId: j.client_id, clientName: j.client_name || null, redirectUri: uri, authMethod: j.token_endpoint_auth_method || null, registeredAt: new Date().toISOString(), meta };
  await set(d, "rh_client", row);
  return row;
}

// ---------------------------------------------------------------- sign-in (authorization code + PKCE)
export async function connectUrl(env) {
  const d = db(env), meta = await discover(), client = await ensureClient(env, meta);
  if (client.meta?.token_endpoint !== meta.token_endpoint || client.meta?.issuer !== meta.issuer) { client.meta = meta; await set(d, "rh_client", client); }
  const verifier = rand(48), state = rand(24);
  await set(d, "rh_oauth", { state, verifier: await seal(env, verifier), expiresAt: Date.now() + STATE_TTL_MS, issuer: meta.issuer });
  const u = new URL(meta.authorization_endpoint);
  const q = { response_type: "code", client_id: client.clientId, redirect_uri: client.redirectUri, code_challenge: await pkceChallenge(verifier), code_challenge_method: "S256", state, resource: meta.resource };
  if (meta.scope) q.scope = meta.scope;
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return u.toString();
}
const tokenCall = async (client, form) => {
  const r = await fetchT(client.meta.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(form).toString() });
  const j = await r.json().catch(() => null);
  // only the error code and its description ever leave this function on a failure, never the body
  if (!r.ok || !j?.access_token) { const e = new Error(`Robinhood refused the ${form.grant_type === "refresh_token" ? "token renewal" : "sign-in code"} (HTTP ${r.status}${j?.error ? `, ${cut(j.error, 60)}` : ""}${j?.error_description ? `: ${cut(j.error_description, 160)}` : ""})`); e.code = j?.error || null; e.status = r.status; throw e; }
  return j;
};
const saveTokens = async (env, j, prev = null) => {
  const now = Date.now(), exp = Number(j.expires_in);
  const row = { sealed: await seal(env, JSON.stringify({ access: j.access_token, refresh: j.refresh_token || prev?.refresh || null })), since: prev?.since || new Date(now).toISOString(),
    expiresAt: isFinite(exp) && exp > 0 ? new Date(now + exp * 1000).toISOString() : null, renewedAt: new Date(now).toISOString(), canRenew: !!(j.refresh_token || prev?.refresh), scope: j.scope || prev?.scope || null };
  await set(db(env), "rh_tokens", row);
  return row;
};
// The callback. `q` is the URLSearchParams Robinhood sent back. Returns {ok} or {error} (a sentence for Alex, never a token).
export async function finishConnect(env, q) {
  const d = db(env), state = q.get("state") || "";
  const fail = async (m) => { await note(d, m); return { error: m }; };
  // single use: the row is taken out in the same statement that checks it, so a replayed callback finds nothing
  const p = state ? (await d.one(`DELETE FROM mob_aq_state WHERE k='rh_oauth' AND v->>'state' = $1 RETURNING v`, [state]))?.v : null;
  if (!p || !safeEqual(p.state, state)) return fail("The Robinhood sign-in did not match the one started here. Press CONNECT ROBINHOOD again.");
  if (!(p.expiresAt > Date.now())) return fail("The Robinhood sign-in took longer than 10 minutes. Press CONNECT ROBINHOOD again.");
  if (q.get("iss") && q.get("iss") !== p.issuer) return fail("The sign-in answer came from a different server than Robinhood's. Nothing was saved.");
  if (q.get("error")) return fail(`Robinhood did not approve the connection (${cut(q.get("error"), 60)}${q.get("error_description") ? `: ${cut(q.get("error_description"), 160)}` : ""}).`);
  const code = q.get("code");
  if (!code) return fail("Robinhood sent no sign-in code back.");
  const client = await get(d, "rh_client");
  if (!client?.clientId) return fail("The Robinhood client registration is missing. Press CONNECT ROBINHOOD again.");
  try {
    const j = await tokenCall(client, { grant_type: "authorization_code", code, redirect_uri: client.redirectUri, client_id: client.clientId, code_verifier: await unseal(env, p.verifier), resource: client.meta.resource });
    await saveTokens(env, j);
  } catch (e) { return fail(String(e.message || e)); }
  await del(d, "rh_cache"); await note(d, null);
  await brain(d, "Robinhood agent account connected to Aquarius. This build only reads it: no order can be placed, changed or cancelled.");
  return { ok: true };
}
export async function disconnect(env) {
  const d = db(env), had = !!(await get(d, "rh_tokens"));
  await d.q(`DELETE FROM mob_aq_state WHERE k IN ('rh_tokens','rh_oauth','rh_cache','rh_refresh_lock')`);
  const lim = await getLimits(d);
  if (lim.autoTrade) await set(d, "rh_limits", { ...lim, autoTrade: false });
  await note(d, null);
  if (had) await brain(d, "Robinhood disconnected from Aquarius: the stored sign-in was deleted and auto trade was switched off.");
  return { connected: false };
}

// ---------------------------------------------------------------- tokens
async function readTokens(env) {
  const row = await get(db(env), "rh_tokens");
  if (!row?.sealed) return null;
  return { ...row, ...JSON.parse(await unseal(env, row.sealed)) };
}
// One renewal at a time: Robinhood may hand out a new refresh token with each renewal, and two renewals racing would leave
// one of them holding a dead one. The loser of the claim waits and reads what the winner stored.
async function renew(env, t) {
  const d = db(env);
  if (!t.refresh) throw Object.assign(new Error("Robinhood gave no way to renew the sign-in. Connect again."), { relogin: true });
  const mine = await d.one(`INSERT INTO mob_aq_state (k, v, at) VALUES ('rh_refresh_lock', 'true', now()) ON CONFLICT (k) DO UPDATE SET at = now() WHERE mob_aq_state.at < now() - interval '30 seconds' RETURNING k`);
  if (!mine) { await new Promise((r) => setTimeout(r, 1500)); const again = await readTokens(env); if (again && again.access !== t.access) return again; throw new Error("Another request is renewing the Robinhood sign-in. Try again in a moment."); }
  try {
    const client = await get(d, "rh_client");
    const j = await tokenCall(client, { grant_type: "refresh_token", refresh_token: t.refresh, client_id: client.clientId, resource: client.meta.resource });
    await saveTokens(env, j, t);
    return await readTokens(env);
  } catch (e) {
    if (e.code === "invalid_grant") { await d.q(`DELETE FROM mob_aq_state WHERE k IN ('rh_tokens','rh_cache')`); e.relogin = true; e.message = "Robinhood ended the sign-in. Press CONNECT ROBINHOOD to sign in again."; }
    throw e;
  } finally { await del(d, "rh_refresh_lock"); }
}
async function freshTokens(env, { force = false } = {}) {
  const t = await readTokens(env);
  if (!t) return null;
  const soon = t.expiresAt && new Date(t.expiresAt).getTime() - Date.now() < REFRESH_EARLY_MS;
  return force || soon ? renew(env, t) : t;
}

// ---------------------------------------------------------------- minimal MCP client (streamable HTTP)
// One JSON-RPC message per POST. The answer is either application/json or a text/event-stream carrying it.
async function readSse(res, id) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  const take = (block) => { const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n"); if (!data) return null; try { const m = JSON.parse(data); return m && m.id === id && ("result" in m || "error" in m) ? m : null; } catch { return null; } };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buf += dec.decode(value || new Uint8Array(), { stream: !done });
      let i;
      while ((i = buf.search(/\r?\n\r?\n/)) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, ""); const m = take(block); if (m) return m; }
      if (done) return take(buf);
    }
  } finally { try { await reader.cancel(); } catch {} }
}
async function post(env, sess, msg) {
  const send = () => fetchT(RH_MCP, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${sess.tokens.access}`,
    ...(sess.id ? { "mcp-session-id": sess.id } : {}), ...(sess.proto ? { "mcp-protocol-version": sess.proto } : {}) }, body: JSON.stringify(msg) });
  let r = await send();
  if (r.status === 401 && !sess.renewed) { sess.renewed = true; sess.tokens = await renew(env, sess.tokens); r = await send(); }
  if (r.status === 401) throw Object.assign(new Error("Robinhood refused the stored sign-in (401) even after renewing it. Connect again."), { relogin: true });
  const sid = r.headers.get("mcp-session-id"); if (sid) sess.id = sid;
  if (!("id" in msg)) { if (!r.ok) throw new Error(`Robinhood MCP answered HTTP ${r.status} to ${msg.method}`); try { await r.body?.cancel(); } catch {} return null; }
  if (!r.ok) throw new Error(`Robinhood MCP answered HTTP ${r.status} to ${msg.method}`);
  const m = (r.headers.get("content-type") || "").includes("text/event-stream") ? await readSse(r, msg.id) : await r.json().then((j) => (Array.isArray(j) ? j.find((x) => x.id === msg.id) : j));
  if (!m) throw new Error(`Robinhood MCP sent no answer to ${msg.method}`);
  if (m.error) throw new Error(`Robinhood MCP: ${msg.method} failed (${cut(m.error.message, 200)})`);
  return m.result;
}
const rpc = (env, sess, method, params) => post(env, sess, { jsonrpc: "2.0", id: ++sess.n, method, ...(params ? { params } : {}) });
export async function mcpOpen(env) {
  const tokens = await freshTokens(env);
  if (!tokens) throw new Error("Robinhood is not connected");
  const sess = { tokens, id: null, proto: null, n: 0, renewed: false, tools: null };
  const init = await rpc(env, sess, "initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "aquarius", version: "1" } });
  sess.proto = init?.protocolVersion || PROTOCOL; sess.server = init?.serverInfo || null;
  await post(env, sess, { jsonrpc: "2.0", method: "notifications/initialized" });
  return sess;
}
export async function mcpTools(env, sess) {
  const out = []; let cursor;
  for (let i = 0; i < 10; i++) { const r = await rpc(env, sess, "tools/list", cursor ? { cursor } : undefined); out.push(...(r?.tools || [])); cursor = r?.nextCursor; if (!cursor) break; }
  sess.tools = out;
  return out;
}
// THE ONLY PLACE tools/call IS SENT. Not on the read list, or marked as writing by Robinhood = refused before any request.
export async function callRead(env, sess, name, args = {}) {
  const why = whyNotRead(name, (sess.tools || []).find((t) => t.name === name));
  if (why) throw Object.assign(new Error(`Refused: ${why}. This build only reads the account.`), { refused: true });
  const r = await rpc(env, sess, "tools/call", { name, arguments: args });
  if (r?.isError) throw new Error(`Robinhood: ${name} failed (${cut((r.content || []).map((c) => c.text || "").join(" "), 200)})`);
  if (r?.structuredContent != null) return r.structuredContent;
  const text = (r?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  try { return JSON.parse(text); } catch { return text || null; }
}

// ---------------------------------------------------------------- reading the account
// The shape of Robinhood's answers is not published, so nothing is assumed: a value is shown only when a field with a
// plainly named key holds it, otherwise it stays null and the panel says "not read yet". `fields` carries what came back.
const walk = (v, f, depth = 0, key = null) => { if (depth > 6 || v == null) return; f(v, key); if (Array.isArray(v)) v.slice(0, 200).forEach((x) => walk(x, f, depth + 1, key)); else if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, f, depth + 1, k); };
const toNum = (v) => { if (typeof v === "number" && isFinite(v)) return v; if (typeof v === "string" && /^-?\$?[\d,]*\.?\d+$/.test(v.trim())) return Number(v.replace(/[$,]/g, "")); if (v && typeof v === "object" && "amount" in v) return toNum(v.amount); return null; };
const firstNum = (data, keys) => { let out = null; for (const k of keys) { walk(data, (v, key) => { if (out == null && key === k) out = toNum(v); }); if (out != null) break; } return out; };
const VALUE_KEYS = ["total_value", "portfolio_value", "total_equity", "equity", "account_value", "net_liquidation_value", "market_value", "totalValue", "portfolioValue", "equityValue"];
const CASH_KEYS = ["cash", "cash_balance", "buying_power", "withdrawable_cash", "cashBalance", "buyingPower", "cash_available_for_trading"];
const mask = (k, v) => (/number|account_id|acct/i.test(k) && (typeof v === "string" || typeof v === "number") ? `••••${String(v).slice(-4)}` : v);
const flat = (data) => { const out = []; const go = (v, path, depth) => { if (out.length >= 40 || depth > 3 || v == null) return; if (typeof v !== "object") { out.push({ k: path, v: typeof v === "string" ? cut(mask(path, v), 80) : mask(path, v) }); return; } if (Array.isArray(v)) { if (v.length && typeof v[0] !== "object") out.push({ k: path, v: cut(v.join(", "), 80) }); else v.slice(0, 3).forEach((x, i) => go(x, `${path}[${i}]`, depth + 1)); return; } for (const [k, x] of Object.entries(v)) go(x, path ? `${path}.${k}` : k, depth + 1); }; go(data, "", 0); return out; };
export function summarize({ accounts, portfolio, positions }) {
  let list = null; walk(positions, (v) => { if (!list && Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && (x.symbol || x.ticker))) list = v; });
  if (!list && Array.isArray(positions)) list = positions.length ? null : [];
  let empty = false; walk(positions, (v, k) => { if (Array.isArray(v) && !v.length && (k == null || /position|result|item/i.test(k))) empty = true; });
  return { valueUsd: firstNum(portfolio, VALUE_KEYS) ?? firstNum(accounts, VALUE_KEYS), cashUsd: firstNum(portfolio, CASH_KEYS) ?? firstNum(accounts, CASH_KEYS),
    positions: list ? list.slice(0, 50).map((p) => ({ symbol: String(p.symbol || p.ticker), quantity: toNum(p.quantity ?? p.shares ?? p.qty), valueUsd: toNum(p.market_value ?? p.equity ?? p.value ?? p.marketValue), avgCostUsd: toNum(p.average_buy_price ?? p.average_cost ?? p.avg_cost ?? p.cost_basis ?? p.averageBuyPrice) })) : empty ? [] : null,
    fields: { accounts: flat(accounts), portfolio: flat(portfolio) } };
}
// Arguments are never invented: a tool with required arguments is called only when every one of them is a key that
// get_accounts returned under exactly the same name (for example an account number), once per account.
const requiredOf = (def) => (Array.isArray(def?.inputSchema?.required) ? def.inputSchema.required : []);
const accountRows = (accounts) => { let rows = null; walk(accounts, (v) => { if (!rows && Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object")) rows = v; }); return rows || (accounts && typeof accounts === "object" && !Array.isArray(accounts) ? [accounts] : []); };
async function readTool(env, sess, name, accounts, problems) {
  const def = sess.tools.find((t) => t.name === name);
  if (!def) { problems.push(`${name}: Robinhood does not offer it`); return null; }
  const need = requiredOf(def);
  try {
    if (!need.length) return await callRead(env, sess, name, {});
    const rows = accountRows(accounts).filter((a) => need.every((k) => a[k] != null && typeof a[k] !== "object"));
    if (!rows.length) { problems.push(`${name}: needs ${need.join(", ")}, which get_accounts did not return under that name`); return null; }
    const out = []; for (const a of rows.slice(0, 5)) out.push(await callRead(env, sess, name, Object.fromEntries(need.map((k) => [k, a[k]]))));
    return out.length === 1 ? out[0] : out;
  } catch (e) { if (e.relogin) throw e; problems.push(cut(e.message, 200)); return null; }
}
export async function refresh(env) {
  const d = db(env);
  try {
    const sess = await mcpOpen(env), tools = await mcpTools(env, sess), problems = [];
    const accounts = await readTool(env, sess, "get_accounts", null, problems);
    const portfolio = await readTool(env, sess, "get_portfolio", accounts, problems);
    const positions = await readTool(env, sess, "get_equity_positions", accounts, problems);
    const cache = { at: new Date().toISOString(), server: sess.server ? { name: sess.server.name || null, version: sess.server.version || null } : null,
      tools: tools.map((t) => ({ name: t.name, description: cut(t.description, 240), readOnlyHint: t.annotations?.readOnlyHint ?? null, destructiveHint: t.annotations?.destructiveHint ?? null, required: requiredOf(t), read: !whyNotRead(t.name, t) })),
      account: summarize({ accounts, portfolio, positions }), problems };
    await set(d, "rh_cache", cache); await note(d, problems.length ? problems.join(" | ") : null);
    return cache;
  } catch (e) { await note(d, cut(e.message || e, 300)); throw e; }
}

// ---------------------------------------------------------------- limits (nothing can trade until Alex sets them)
export const LIMIT_DEFAULTS = Object.freeze({ maxPerTradeUsd: 0, maxDailyLossUsd: 0, maxOpenPositions: 0, allowStocks: false, allowCrypto: false, autoTrade: false });
const getLimits = async (d) => ({ ...LIMIT_DEFAULTS, ...((await get(d, "rh_limits")) || {}) });
export function validateLimits(body, current = LIMIT_DEFAULTS) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Send the limits as fields" };
  const next = { ...LIMIT_DEFAULTS, ...current };
  for (const [k, v] of Object.entries(body)) {
    if (!(k in LIMIT_DEFAULTS)) return { error: `${k} is not a limit` };
    if (typeof LIMIT_DEFAULTS[k] === "boolean") { if (typeof v !== "boolean") return { error: `${k} must be on or off` }; next[k] = v; continue; }
    if (typeof v !== "number" || !isFinite(v) || v < 0) return { error: `${k} must be a number, 0 or more` };
    if (v > 1e7) return { error: `${k} is too large` };
    if (k === "maxOpenPositions" && !Number.isInteger(v)) return { error: "maxOpenPositions must be a whole number" };
    next[k] = k === "maxOpenPositions" ? v : Math.round(v * 100) / 100;
  }
  if (next.autoTrade && !(next.maxPerTradeUsd > 0 && next.maxDailyLossUsd > 0 && next.maxOpenPositions > 0 && (next.allowStocks || next.allowCrypto)))
    return { error: "Auto trade needs every limit above zero and stocks or crypto switched on first" };
  return { limits: next };
}
export async function saveLimits(env, body) {
  const d = db(env), cur = await getLimits(d), r = validateLimits(body, cur);
  if (r.error) return r;
  await set(d, "rh_limits", r.limits);
  if (JSON.stringify(cur) !== JSON.stringify(r.limits)) await brain(d, `Robinhood limits set by Alex: $${r.limits.maxPerTradeUsd} a trade, $${r.limits.maxDailyLossUsd} daily loss, ${r.limits.maxOpenPositions} open, stocks ${r.limits.allowStocks ? "on" : "off"}, crypto ${r.limits.allowCrypto ? "on" : "off"}, auto trade ${r.limits.autoTrade ? "ON (flag only: live orders are not built)" : "off"}.`);
  return r;
}

// ---------------------------------------------------------------- what the panel and the status route see (no secrets)
// From the state rows only: buildState calls this on every poll, so it never talks to Robinhood.
export function publicState(S) {
  const t = S.rh_tokens || null, c = S.rh_cache || null;
  return { connected: !!t?.sealed, since: t?.since || null, tokenExpiresAt: t?.expiresAt || null, checkedAt: c?.at || null, account: c?.account || null,
    tools: (c?.tools || []).map((x) => x.name), readTools: (c?.tools || []).filter((x) => x.read).map((x) => x.name),
    limits: { ...LIMIT_DEFAULTS, ...(S.rh_limits || {}) }, lastError: S.rh_status?.lastError || null, clientRegistered: !!S.rh_client?.clientId, liveOrders: false };
}
const rows = async (d) => Object.fromEntries((await d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('rh_tokens','rh_cache','rh_limits','rh_status','rh_client')`)).map((r) => [r.k, r.v]));
export async function status(env, { fresh = false } = {}) {
  const d = db(env); let S = await rows(d);
  if (S.rh_tokens?.sealed && (fresh || !S.rh_cache || Date.now() - new Date(S.rh_cache.at).getTime() > CACHE_MS)) { try { await refresh(env); } catch {} S = await rows(d); }
  return { ...publicState(S), toolDetails: S.rh_cache?.tools || [], problems: S.rh_cache?.problems || [], redirectUri: S.rh_client?.redirectUri || redirectUri(env), allowedReadTools: READ_TOOLS };
}
// The 5-minute timer: registers the client once (so the first press of CONNECT has nothing left to set up), and while
// connected keeps the sign-in renewed and the account numbers fresh. Read-only, and it can never throw into the timer.
export async function rhWarm(env) {
  try {
    const d = db(env), S = await rows(d);
    if (!S.rh_client?.clientId) { try { await ensureClient(env); await note(d, null); return { registered: true }; } catch (e) { await note(d, cut(e.message || e, 300)); return { registered: false }; } }
    if (!S.rh_tokens?.sealed) return { connected: false };
    await refresh(env);
    return { connected: true };
  } catch { return { ok: false }; }
}
