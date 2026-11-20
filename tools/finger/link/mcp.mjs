// The MCP endpoint Claude talks to, and the small HTTP API the Mac talks to.
// MCP facts are from the specification, github.com/modelcontextprotocol/modelcontextprotocol
// at commit bbc31f8ded5762eae4df115b93942f5e71c8b3a7, docs/specification/2025-06-18:
//   basic/transports.mdx:88-99   one POST per JSON-RPC message, answered with application/json
//   basic/transports.mdx:127     GET may answer 405 when the server offers no stream
//   basic/transports.mdx:212     a notification is answered 202 Accepted
//   basic/lifecycle.mdx:59-113   initialize, protocolVersion, serverInfo, notifications/initialized
//   server/tools.mdx:85,135,187  tools/list inputSchema; tools/call result content + isError
//   server/tools.mdx:225-227     image content: {type:'image', data, mimeType}
// This file has no Cloudflare in it, so Node can test it; worker.mjs wraps it.

export const PROTOCOL = '2025-06-18';
const WAIT_MS = 25000;   // how long a tool call waits for the Mac before handing back an id
const POLL_MS = 250;

const DEVICE = { type: 'string', description: 'Which iPhone: its UDID, or its number (1, 2). May be left out when only one is plugged in.' };

export const TOOLS = [
  { name: 'finger_status', lifetimeMs: 0,
    description: 'What finger on the Mac reports right now: build, mode (PAPER or LIVE), money numbers, and each iPhone with its state.',
    inputSchema: { type: 'object', properties: {} } },
  // lifetimeMs: how long the Mac has to take the call. maxRunMs: the longest it may then
  // run before finger_result stops saying "pending" and says the answer was lost.
  { name: 'finger_look', lifetimeMs: 30000, maxRunMs: 120000,
    description: 'Look at an iPhone screen. mode "tree" (default) gives lines like: Button "label" @x,y,w,h in points. "image" gives a picture. "both" gives both. Returns a lookId.',
    inputSchema: { type: 'object', properties: { device: DEVICE, mode: { type: 'string', enum: ['tree', 'image', 'both'] } } } },
  { name: 'finger_act', lifetimeMs: 30000, maxRunMs: 600000,
    description: 'Do steps on an iPhone, in order, stopping at the first that fails. Each step is one of: {tap:{label}} or {tap:{x,y,of:lookId}}, {double:{...}}, {hold:{...,seconds}}, {swipe:{from:[x,y],to:[x,y],of,holdBefore}} (holdBefore = seconds the finger presses before it moves, default 0; the swipe speed cannot be set), {type:{text}}, {home:{}}, {press:{button}}, {open:{bundleId}}, {close:{bundleId}}, {alert:{accept:true}} or {alert:{dismiss:true}}, {wait:{ms}}. A step is reported as sent; the look afterwards shows what happened. A step answered "NO_ANSWER" may or may not have landed: look before repeating it. This tool is not for betting; use finger_buy. Inside the wallet app it is limited on purpose: it refuses any touch on or near a buy or confirm button and anything on the confirm screen, types digits only, and only dismisses pop-ups. Until the wallet\'s screens have been recorded it does not touch inside the wallet at all, unless Alex has switched wallet setup on, on the Mac, for an empty wallet.',
    inputSchema: { type: 'object', required: ['steps'], properties: { device: DEVICE, steps: { type: 'array', items: { type: 'object' } }, then: { type: 'string', enum: ['tree', 'image', 'both', 'none'] } } } },
  { name: 'finger_buy', lifetimeMs: 15000, maxRunMs: 120000,
    description: 'Place one bet in the wallet. The Mac checks every money rule, reads the confirm screen and only then presses confirm. Needs the full UDID.',
    inputSchema: { type: 'object', required: ['udid', 'coin', 'side', 'stake', 'round'], properties: {
      udid: { type: 'string' }, coin: { type: 'string', enum: ['BTC', 'SOL', 'ETH'] }, side: { type: 'string', enum: ['UP', 'DOWN'] },
      stake: { type: 'number', enum: [2, 5, 10] }, round: { type: 'string' } } } },
  { name: 'finger_result', lifetimeMs: 0,
    description: 'The result of an earlier call that took longer than the wait.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'finger_journal', lifetimeMs: 0,
    description: 'Add a decision or bet row ({add:{...}}), or read the last rows ({last:n}).',
    inputSchema: { type: 'object', properties: { add: { type: 'object' }, last: { type: 'number' } } } },
  { name: 'finger_selftest', lifetimeMs: 60000, maxRunMs: 600000,
    description: 'Run the self-test on an iPhone and report each step.',
    inputSchema: { type: 'object', properties: { device: DEVICE } } },
];

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const rpcOk = (id, result) => json({ jsonrpc: '2.0', id, result });
const rpcErr = (id, code, message) => json({ jsonrpc: '2.0', id, error: { code, message } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What the Mac posted becomes MCP content. An image rides next to its text.
function toContent(result) {
  const { image, ...rest } = result || {};
  const content = [{ type: 'text', text: JSON.stringify(rest) }];
  if (image && image.base64) content.push({ type: 'image', data: image.base64, mimeType: image.mime });
  return { content, isError: rest.ok === false };
}

// A call the Mac took and never answered. It is NOT the same as "nothing was done".
const LOST = (id) => ({ ok: false, code: 'NO_ANSWER', lost: true, id, error: 'this call was handed to the Mac and no answer came back. It may or may not have been carried out: look at the phone before repeating it. (finger_status lists results the Mac is still trying to send, under mac.undelivered.)' });

const text = (obj, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], isError });

async function callTool(core, name, args, waitMs) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return text({ ok: false, error: `no tool named ${name}` }, true);
  if (name === 'finger_status') return text(core.status());
  if (name === 'finger_journal') {
    if (args.add && typeof args.add === 'object') return text(core.journalAdd(args.add));
    return text({ ok: true, rows: core.journalLast(args.last) });
  }
  if (name === 'finger_result') {
    const c = core.get(String(args.id || ''));
    if (!c) return text({ ok: false, error: 'no call with that id' }, true);
    if (c.state === 'done') return toContent(c.result);
    if (c.state === 'expired') return text({ ok: false, error: 'that call expired before the Mac took it; nothing was done' }, true);
    if (c.state === 'lost') return text(LOST(c.id), true);
    return text({ ok: false, pending: true, id: c.id, state: c.state });
  }
  const q = core.enqueue(name, args, tool.lifetimeMs, tool.maxRunMs);
  if (!q.ok) return text(q, true);
  const until = Date.now() + waitMs;
  for (;;) {
    const c = core.get(q.id);
    if (c.state === 'done') return toContent(c.result);
    if (c.state === 'expired') return text({ ok: false, error: 'the Mac did not take this call in time; nothing was done' }, true);
    if (c.state === 'lost') return text(LOST(q.id), true);
    if (Date.now() >= until) return text({ ok: false, pending: true, id: q.id, note: 'still running on the Mac; ask finger_result with this id' });
    await sleep(POLL_MS);
  }
}

async function mcp(core, request, waitMs) {
  if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: { allow: 'POST' } });
  let msg;
  try { msg = await request.json(); } catch { return rpcErr(null, -32700, 'not JSON'); }
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcErr(null, -32600, 'not a JSON-RPC request');
  if (msg.id === undefined || msg.id === null) return new Response(null, { status: 202 });
  const p = msg.params || {};
  if (msg.method === 'initialize') {
    return rpcOk(msg.id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'finger-link', version: '1' } });
  }
  if (msg.method === 'ping') return rpcOk(msg.id, {});
  if (msg.method === 'tools/list') {
    return rpcOk(msg.id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  }
  if (msg.method === 'tools/call') {
    return rpcOk(msg.id, await callTool(core, String(p.name), p.arguments && typeof p.arguments === 'object' ? p.arguments : {}, waitMs));
  }
  return rpcErr(msg.id, -32601, `no method ${msg.method}`);
}

// Routes, all under /k/<key>/ :
//   POST mcp        Claude
//   POST heartbeat  the Mac, every 5 s
//   POST take       the Mac, asks for queued commands
//   POST result     the Mac, {id, result}
export async function handle(core, request, { key, waitMs = WAIT_MS } = {}) {
  const url = new URL(request.url);
  const m = /^\/k\/([^/]+)\/(mcp|heartbeat|take|result)$/.exec(url.pathname);
  if (!key) return json({ ok: false, error: 'finger-link has no key set' }, 503);
  if (!m || m[1] !== key) return json({ ok: false, error: 'not found' }, 404);
  if (m[2] === 'mcp') return mcp(core, request, waitMs);
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'not JSON' }, 400); }
  if (m[2] === 'heartbeat') return json(core.heartbeat(body));
  if (m[2] === 'take') return json({ ok: true, commands: core.take() });
  return json(core.result(String(body.id || ''), body.result));
}
