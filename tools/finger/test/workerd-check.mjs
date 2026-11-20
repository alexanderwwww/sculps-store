// Runs the real finger-link worker (worker.mjs + its SQLite Durable Object) in local
// workerd through `wrangler dev`, and drives one full round trip. Nothing is deployed:
// `wrangler dev` runs on this machine only. Needs the wrangler already installed at the
// repo root, so it is `npm run check:workerd`, not part of `npm test`.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'finger-workerd-'));
const port = 8791;
const base = `http://127.0.0.1:${port}/k/localkey`;
const child = spawn(path.join(repo, 'node_modules', '.bin', 'wrangler'),
  ['dev', '--config', path.join(here, '..', 'link', 'wrangler.toml'), '--port', String(port), '--ip', '127.0.0.1', '--var', 'FINGER_KEY:localkey', '--persist-to', state],
  { cwd: repo, env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }, stdio: 'ignore', detached: true });

const post = async (p, body) => (await fetch(`${base}/${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const tool = async (name, args) => {
  const r = await post('mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  return r.result;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; ; i++) {
    try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { if (i > 60) throw new Error('wrangler dev did not start'); await sleep(500); }
  }
  const init = await post('mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(init.result.serverInfo.name, 'finger-link');
  assert.equal((await tool('finger_look', {})).isError, true, 'refused while the Mac has never been seen');
  assert.deepEqual(await post('heartbeat', { build: '1' }), { ok: true });
  const call = tool('finger_look', { device: '1' });           // waits inside the Durable Object
  await sleep(700);
  const { commands } = await post('take', {});
  assert.equal(commands.length, 1);
  assert.deepEqual((await post('take', {})).commands, [], 'handed out once');
  await post('result', { id: commands[0].id, result: { ok: true, tree: ['x'], image: { base64: 'AAAA', mime: 'image/jpeg' } } });
  const res = await call;
  assert.equal(res.isError, false);
  assert.deepEqual(res.content[1], { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' });
  assert.equal((await fetch(`http://127.0.0.1:${port}/k/wrong/mcp`, { method: 'POST', body: '{}' })).status, 404);

  // A result too big to keep (9 MB; the documented limit for a string or row is 8 MB) must
  // not come back as HTTP 500 and leave the call pending for ever: it ends, and says why.
  const big = tool('finger_look', { device: '1' });
  await sleep(700);
  const [cmd] = (await post('take', {})).commands;
  const stored = await fetch(`${base}/result`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: cmd.id, result: { ok: true, image: { base64: 'A'.repeat(9 * 1000 * 1000), mime: 'image/jpeg' } } }) });
  assert.equal(stored.status, 200, 'the Mac is told the result was taken');
  const bigRes = await big;
  assert.equal(bigRes.isError, true);
  assert.equal(JSON.parse(bigRes.content[0].text).code, 'RESULT_TOO_BIG');
  // 3.5 MB, under finger's own 4 MB limit, is kept whole.
  const mid = tool('finger_look', { device: '1' });
  await sleep(700);
  const [cmd2] = (await post('take', {})).commands;
  await post('result', { id: cmd2.id, result: { ok: true, image: { base64: 'A'.repeat(3500000), mime: 'image/jpeg' } } });
  assert.equal((await mid).content[1].data.length, 3500000);
  // A call taken and never answered: the schema's deadline column exists and is read.
  assert.equal(JSON.parse((await tool('finger_result', { id: cmd2.id })).content[0].text).ok, true);
  console.log('workerd check passed: initialize, offline refusal, heartbeat, queue, single delivery, wait inside the Durable Object, image result, key check, over-size result ends as RESULT_TOO_BIG, 3.5 MB result kept');
} finally {
  // wrangler stops its workerd when asked nicely; the hard kill is only the backstop.
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  await sleep(2000);
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  fs.rmSync(state, { recursive: true, force: true });
  fs.rmSync(path.join(here, '..', 'link', '.wrangler'), { recursive: true, force: true });
}
