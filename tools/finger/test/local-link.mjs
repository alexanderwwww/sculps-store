// finger-link run locally for the tests: the same core.mjs and mcp.mjs the Worker uses,
// with node:sqlite standing in for the Durable Object's SQLite and node:http for the Worker.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { LinkCore } from '../link/core.mjs';
import { handle } from '../link/mcp.mjs';

export function memorySql() {
  const db = new DatabaseSync(':memory:');
  return { all: (query, ...params) => db.prepare(query).all(...params) };
}

export async function localLink({ key = 'testkey', waitMs = 3000, now = Date.now } = {}) {
  const core = new LinkCore({ sql: memorySql(), now });
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(`http://link${req.url}`, {
      method: req.method, headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    const out = await handle(core, request, { key, waitMs });
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/k/${key}`;
  let id = 0;
  const rpc = async (method, params) => {
    const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    return res.json();
  };
  // A tool call the way Claude makes it; returns the parsed text part and the image part.
  const tool = async (name, args = {}) => {
    const { result } = await rpc('tools/call', { name, arguments: args });
    const text = JSON.parse(result.content.find((c) => c.type === 'text').text);
    return { ...text, isError: result.isError, image: result.content.find((c) => c.type === 'image') || null };
  };
  return { core, base, rpc, tool, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}
