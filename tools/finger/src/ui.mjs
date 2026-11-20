// The page Alex sees, served on 127.0.0.1 only. The money numbers are typed here and
// nowhere else; no tool call reaches these routes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveBlockers } from './guard.mjs';

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'index.html');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 65536) req.destroy(); else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export function startPage({ port, getStatus, caps, ledger, profile }) {
  const send = (res, status, body, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, fs.readFileSync(PAGE), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/status') {
        return send(res, 200, { ...getStatus(), liveBlockers: liveBlockers(caps.read(), profile) });
      }
      if (req.method === 'POST') {
        // Only this page may change the numbers: a form on some other site cannot send JSON
        // here, and its Origin would not be ours.
        const origin = req.headers.origin;
        const ours = `http://${req.headers.host}`;
        if (!/^application\/json/.test(req.headers['content-type'] || '') || (origin && origin !== ours)) {
          return send(res, 403, { ok: false, error: 'only the finger page can change this' });
        }
        const body = await readBody(req);
        if (url.pathname === '/api/caps') return send(res, 200, { ok: true, caps: caps.setNumbers(body) });
        if (url.pathname === '/api/mode') return send(res, 200, { ok: true, caps: caps.setMode(body.mode, profile) });
        if (url.pathname === '/api/reset-losses') { ledger.append({ type: 'reset', what: 'losses' }); return send(res, 200, { ok: true }); }
      }
      return send(res, 404, { ok: false, error: 'not found' });
    } catch (e) {
      return send(res, e.refused ? 400 : 500, { ok: false, code: e.code || 'ERROR', error: e.message });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/`,
        close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }),
      });
    });
  });
}
