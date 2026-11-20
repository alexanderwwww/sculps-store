import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROUTES, WDA_PIN, SESSION_SETTINGS } from '../src/routes.mjs';
import { WdaClient } from '../src/wda-client.mjs';
import { rig, UDID_A } from './rig.mjs';

async function one(fn) {
  const r = await rig({ phones: 1 });
  const wda = r.wdas[UDID_A];
  const client = new WdaClient({ connect: () => r.usbmux.connect(r.registry.deviceId(UDID_A), 8100) });
  try { await fn({ r, wda, client }); } finally { await r.close(); }
}

test('routes: every route in the table is answered by the fake WDA written from the source', () => one(async ({ client, wda }) => {
  const sid = await client.newSession();
  const bodies = {
    newSession: { capabilities: { alwaysMatch: {} } }, settings: { settings: {} }, tap: { x: 1, y: 1 }, doubleTap: { x: 1, y: 1 },
    touchAndHold: { x: 1, y: 1, duration: 1 }, drag: { fromX: 1, fromY: 1, toX: 2, toY: 2, duration: 0.1 }, keys: { value: ['a'] },
    pressButton: { name: 'home' }, appActivate: { bundleId: 'a.b' }, appTerminate: { bundleId: 'a.b' },
  };
  assert.equal(sid, wda.sessionId);
  for (const name of Object.keys(ROUTES)) {
    if (name.startsWith('alert')) wda.alert = 'Allow?';
    const r = ROUTES[name];
    await assert.doesNotReject(
      client.raw(name, { body: bodies[name], sessionId: r.session === 'yes' ? wda.sessionId : undefined, query: name === 'source' ? { format: 'json' } : undefined }),
      `route ${name} (${r.method} ${r.path}) cited ${r.src}`,
    );
  }
}));

test('routes: every entry cites a file and line in the pinned commit', () => {
  assert.match(WDA_PIN.commit, /^[0-9a-f]{40}$/);
  for (const [name, r] of Object.entries(ROUTES)) {
    assert.match(r.src, /^(Commands|Routing|Categories|Utilities)\/[A-Za-z+]+\.m:\d+/, name);
    assert.ok(r.timeoutMs > 0, `${name} has its own timeout`);
  }
  assert.ok(fs.readFileSync(new URL('../SOURCES.md', import.meta.url), 'utf8').includes(WDA_PIN.commit));
});

test('wda: /status says ready', () => one(async ({ client }) => {
  const s = await client.call('status');
  assert.equal(s.ready, true);
}));

test('wda: a session is created with capabilities.alwaysMatch and the settings are applied', () => one(async ({ client, wda }) => {
  await client.call('tap', { body: { x: 5, y: 6 } });
  assert.deepEqual(wda.callsTo('/session')[0].body, { capabilities: { alwaysMatch: {} } });
  assert.deepEqual(wda.settings, SESSION_SETTINGS);
  assert.deepEqual(wda.callsTo('/wda/tap')[0].body, { x: 5, y: 6 });
  assert.equal(wda.callsTo('/wda/tap')[0].sid, wda.sessionId);
}));

test('wda: a lost session is recreated, settings re-applied, and the call retried once', () => one(async ({ client, wda }) => {
  await client.call('tap', { body: { x: 1, y: 1 } });
  wda.sessionId = 'GONE'; wda.settings = {};
  await client.call('tap', { body: { x: 2, y: 2 } });
  assert.equal(wda.sessionsMade, 2);
  assert.deepEqual(wda.settings, SESSION_SETTINGS);
  assert.equal(wda.callsTo('/wda/tap').length, 3); // 1 ok, 1 refused, 1 retried
}));

test('wda: with retry off (a buy), a lost session is an error and nothing is sent twice', () => one(async ({ client, wda }) => {
  await client.call('tap', { body: { x: 1, y: 1 } });
  wda.sessionId = 'GONE';
  await assert.rejects(client.call('tap', { body: { x: 2, y: 2 }, retry: false }), (e) => e.code === 'invalid session id');
  assert.equal(wda.callsTo('/wda/tap').length, 2);
}));

test('wda: an error envelope becomes an error with the WDA error name and HTTP status', () => one(async ({ client }) => {
  await assert.rejects(client.call('tap', { body: { x: 1 } }), (e) => e.kind === 'wda' && e.code === 'invalid argument' && e.httpStatus === 400);
  await assert.rejects(client.call('pressButton', { body: { name: 'nope' } }), (e) => e.code === 'unknown error' && e.httpStatus === 500);
}));

test('wda: a session-only route called without a session is "unknown command" in the fake, as in the source', () => one(async ({ r }) => {
  const sock = await r.usbmux.connect(r.registry.deviceId(UDID_A), 8100);
  const text = await new Promise((resolve) => {
    let buf = '';
    sock.on('data', (d) => { buf += d; });
    sock.on('close', () => resolve(buf));
    sock.write('POST /wda/tap HTTP/1.1\r\nHost: x\r\nConnection: close\r\nContent-Length: 13\r\n\r\n{"x":1,"y":1}');
  });
  assert.match(text, /^HTTP\/1\.1 404/);
  assert.match(text, /unknown command/);
}));

test('wda: no pop-up is the "no such alert" envelope and reads as null', () => one(async ({ client, wda }) => {
  assert.equal(await client.alertText(), null);
  wda.alert = 'Trust this computer?';
  assert.equal(await client.alertText(), 'Trust this computer?');
}));

test('wda: an HTML answer is refused as NOT_JSON', () => one(async ({ client, wda }) => {
  wda.html = true;
  await assert.rejects(client.call('status'), (e) => e.kind === 'transport' && e.code === 'NOT_JSON');
}));

test('wda: a route that does not answer within its timeout fails with TIMEOUT', () => one(async ({ client, wda }) => {
  wda.delays['/status'] = 400;
  await assert.rejects(client.call('status', { timeoutMs: 80 }), (e) => e.code === 'TIMEOUT');
}));

test('wda: WDA not listening is REFUSED; phone unplugged is NOT_PLUGGED', () => one(async ({ client, wda, r }) => {
  await wda.die();
  await assert.rejects(client.call('status'), (e) => e.kind === 'transport' && e.code === 'REFUSED');
  r.unplug(UDID_A);
  await assert.rejects(client.call('status'), (e) => e.code === 'NOT_PLUGGED');
}));

test('fake wda: answers one request at a time on its command queue, like the real one; /status and /screenshot skip the queue', () => one(async ({ client, wda }) => {
  wda.delays['/source'] = 150;
  const done = [];
  const mark = (name, p) => p.then(() => done.push(name));
  await Promise.all([
    mark('source', client.call('source', { query: { format: 'json' } })),
    mark('locked', client.call('locked')),
    mark('status', client.call('status')),
    mark('screenshot', client.call('screenshot')),
  ]);
  assert.equal(wda.maxInFlight, 1, 'the command queue ran one at a time');
  assert.deepEqual(done.slice(0, 2).sort(), ['screenshot', 'status'], 'the two standalone routes answered while /source was still running');
  assert.deepEqual(done.slice(2), ['source', 'locked']);
}));

test('wda: an HTTP 200 whose body is not the WDA envelope is not a "done"', () => one(async ({ client, wda }) => {
  await client.newSession();
  for (const body of ['null', '[]', '"ok"', '{"status":0}', '42']) {
    wda.reply = (p) => (p === '/wda/tap' ? { status: 200, body } : undefined);
    await assert.rejects(client.call('tap', { body: { x: 1, y: 1 } }), (e) => e.kind === 'transport' && e.code === 'NOT_JSON', body);
  }
  wda.reply = (p) => (p === '/wda/tap' ? { status: 200, body: '{"value":null,"sessionId":"x"}' } : undefined);
  assert.equal(await client.call('tap', { body: { x: 1, y: 1 } }), null);
}));

test('wda: an answer that is not HTTP 200 is an error even when its body is a clean envelope', () => one(async ({ client, wda }) => {
  wda.reply = (p) => (p === '/wda/locked' ? { status: 500, body: '{"value":false,"sessionId":null}' } : undefined);
  await assert.rejects(client.call('locked'), (e) => e.kind === 'transport' && e.code === 'HTTP_STATUS' && e.httpStatus === 500);
}));
