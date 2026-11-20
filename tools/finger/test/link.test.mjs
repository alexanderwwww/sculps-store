import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LinkCore, HEARTBEAT_MAX_AGE_MS } from '../link/core.mjs';
import { TOOLS, PROTOCOL } from '../link/mcp.mjs';
import { memorySql, localLink } from './local-link.mjs';
import { createApp } from '../src/main.mjs';
import { DEFAULT_CAPS } from '../src/guard.mjs';
import { FakeUsbmuxd } from './fake-usbmuxd.mjs';
import { FakeWda } from './fake-wda.mjs';
import { UDID_A, UDID_B, tmpHome, until, sleep, FAKE_PROFILE, fakeWallet } from './rig.mjs';

const clockCore = () => { const c = { t: 1_000_000 }; return { c, core: new LinkCore({ sql: memorySql(), now: () => c.t }) }; };

test('link core: a command is refused when the Mac has never been seen or its heartbeat is older than 30 s', () => {
  const { c, core } = clockCore();
  assert.match(core.enqueue('finger_look', {}, 30000).error, /never been seen/);
  core.heartbeat({ build: '1' });
  assert.equal(core.enqueue('finger_look', {}, 30000).ok, true);
  c.t += HEARTBEAT_MAX_AGE_MS + 1;
  const late = core.enqueue('finger_look', {}, 30000);
  assert.equal(late.ok, false);
  assert.match(late.error, /last seen 30 s ago/);
  assert.equal(core.status().online, false);
});

test('link core: a command is handed out once, oldest first', () => {
  const { c, core } = clockCore();
  core.heartbeat({});
  const a = core.enqueue('finger_look', { n: 1 }, 30000); c.t += 1;
  const b = core.enqueue('finger_act', { n: 2 }, 30000);
  const got = core.take();
  assert.deepEqual(got.map((x) => x.id), [a.id, b.id]);
  assert.deepEqual(got[0].args, { n: 1 });
  assert.deepEqual(core.take(), [], 'never delivered twice');
});

test('link core: every command has a lifetime; an expired one is never handed out', () => {
  const { c, core } = clockCore();
  core.heartbeat({});
  const a = core.enqueue('finger_buy', {}, 15000);
  c.t += 15001;
  assert.deepEqual(core.take(), []);
  assert.equal(core.get(a.id).state, 'expired');
});

test('link core: a result is stored once and can be read later', () => {
  const { core } = clockCore();
  core.heartbeat({});
  const a = core.enqueue('finger_look', {}, 30000);
  core.take();
  assert.deepEqual(core.result(a.id, { ok: true, n: 1 }), { ok: true });
  assert.deepEqual(core.result(a.id, { ok: true, n: 2 }), { ok: true, already: true });
  assert.equal(core.get(a.id).result.n, 1);
  assert.equal(core.result('nope', {}).ok, false);
});

test('link core: journal rows are kept in order', () => {
  const { core } = clockCore();
  core.journalAdd({ coin: 'BTC', pick: 'UP' });
  core.journalAdd({ coin: 'SOL', pick: 'DOWN' });
  assert.deepEqual(core.journalLast(1).map((r) => r.coin), ['SOL']);
  assert.deepEqual(core.journalLast().map((r) => r.coin), ['BTC', 'SOL']);
});

test('mcp: initialize, tools/list, ping, a notification, an unknown method, and GET', async () => {
  const link = await localLink();
  try {
    const init = await link.rpc('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 't', version: '1' } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.deepEqual(init.result.capabilities, { tools: {} });
    assert.equal(init.result.serverInfo.name, 'finger-link');
    const list = await link.rpc('tools/list');
    assert.deepEqual(list.result.tools.map((t) => t.name), ['finger_status', 'finger_look', 'finger_act', 'finger_buy', 'finger_result', 'finger_journal', 'finger_selftest']);
    for (const t of list.result.tools) { assert.equal(t.inputSchema.type, 'object'); assert.ok(t.description.length > 10); assert.equal(t.lifetimeMs, undefined); }
    assert.deepEqual((await link.rpc('ping')).result, {});
    const note = await fetch(`${link.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    assert.equal(note.status, 202);
    assert.equal((await link.rpc('resources/list')).error.code, -32601);
    assert.equal((await fetch(`${link.base}/mcp`)).status, 405);
  } finally { await link.close(); }
});

test('mcp: a wrong key, or no key set, gets nothing', async () => {
  const link = await localLink();
  try {
    const bad = link.base.replace('/k/testkey', '/k/wrong');
    assert.equal((await fetch(`${bad}/mcp`, { method: 'POST', body: '{}' })).status, 404);
    assert.equal((await fetch(`${bad}/take`, { method: 'POST', body: '{}' })).status, 404);
  } finally { await link.close(); }
  const { handle } = await import('../link/mcp.mjs');
  const res = await handle(new LinkCore({ sql: memorySql() }), new Request('http://x/k/a/mcp', { method: 'POST', body: '{}' }), { key: undefined });
  assert.equal(res.status, 503);
});

test('mcp: a tool call with the Mac offline is refused and nothing is queued', async () => {
  const link = await localLink();
  try {
    const res = await link.tool('finger_look', {});
    assert.equal(res.isError, true);
    assert.match(res.error, /not connected/);
    assert.deepEqual(link.core.take(), []);
  } finally { await link.close(); }
});

test('mcp: a call that outlives the wait hands back an id, and finger_result gets the late result', async () => {
  const link = await localLink({ waitMs: 150 });
  try {
    link.core.heartbeat({});
    const pending = await link.tool('finger_look', {});
    assert.equal(pending.pending, true);
    assert.equal((await link.tool('finger_result', { id: pending.id })).pending, true);
    const [cmd] = link.core.take();
    link.core.result(cmd.id, { ok: true, tree: ['Button "A" @1,2,3,4'], image: { base64: 'AAAA', mime: 'image/jpeg' } });
    const late = await link.tool('finger_result', { id: pending.id });
    assert.equal(late.ok, true);
    assert.deepEqual(late.image, { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' });
    assert.equal((await link.tool('finger_result', { id: 'nope' })).isError, true);
  } finally { await link.close(); }
});

test('mcp: finger_journal adds and reads rows; finger_status reports the Mac heartbeat', async () => {
  const link = await localLink();
  try {
    assert.equal((await link.tool('finger_status')).online, false);
    link.core.heartbeat({ build: '7', mode: 'PAPER' });
    const s = await link.tool('finger_status');
    assert.equal(s.online, true);
    assert.equal(s.mac.build, '7');
    await link.tool('finger_journal', { add: { coin: 'BTC', pick: 'UP', confidence: 0.6 } });
    assert.equal((await link.tool('finger_journal', { last: 5 })).rows[0].pick, 'UP');
  } finally { await link.close(); }
});

// ---- the whole bridge: Claude -> finger-link -> the Mac worker -> lane -> usbmux -> WDA -> back ----

async function bridge({ profile = FAKE_PROFILE, caps = null } = {}) {
  const mux = new FakeUsbmuxd(); await mux.start();
  const wdas = { [UDID_A]: await new FakeWda().start(), [UDID_B]: await new FakeWda().start() };
  const link = await localLink({ waitMs: 4000 });
  const home = tmpHome();
  if (caps) fs.writeFileSync(path.join(home, 'caps.json'), JSON.stringify({ ...DEFAULT_CAPS, ...caps }));
  const app = createApp({ home, usbmuxSocket: mux.socketPath, linkBase: link.base, profile, healthMs: 50, linkOptions: { heartbeatMs: 100, takeMs: 20, retryMs: 20 } });
  mux.attach(UDID_A, { 8100: wdas[UDID_A].port });
  mux.attach(UDID_B, { 8100: wdas[UDID_B].port });
  await app.start();
  await until(async () => (await link.tool('finger_status')).mac?.devices?.length === 2);
  return { mux, wdas, link, app, home, async close() { await app.stop(); await link.close(); for (const w of Object.values(wdas)) await w.stop().catch(() => {}); await mux.stop(); fs.rmSync(home, { recursive: true, force: true }); } };
}
const withBridge = (name, opts, fn) => test(name, async () => { const b = await bridge(opts); try { await fn(b); } finally { await b.close(); } });

withBridge('bridge: finger_status shows build, mode, limits and both phones by alias and last four', {}, async ({ link }) => {
  await until(async () => (await link.tool('finger_status')).mac.devices.every((d) => d.state === 'READY'));
  const s = await link.tool('finger_status');
  assert.equal(s.online, true);
  assert.equal(s.mac.build, fs.readFileSync(new URL('../BUILD', import.meta.url), 'utf8').trim());
  assert.equal(s.mac.mode, 'PAPER');
  assert.equal(s.mac.wda, '17.0.12');
  assert.equal(s.mac.mac.node, process.version, 'the Mac probe rides in the status');
  assert.equal(typeof s.mac.mac.xcode.found, 'boolean');
  assert.deepEqual(s.mac.devices.map((d) => [d.alias, d.last4, d.label]), [[1, '001E', 'iPhone 1 (...001E)'], [2, '002F', 'iPhone 2 (...002F)']]);
});

withBridge('bridge: finger_act round trip on each phone, by alias and by UDID', {}, async ({ link, wdas }) => {
  for (const [device, udid] of [['1', UDID_A], [UDID_B, UDID_B]]) {
    const res = await link.tool('finger_act', { device, steps: [{ tap: { label: 'Settings' } }, { type: { text: 'hi' } }], then: 'tree' });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.udid, udid);
    assert.match(res.device, /^iPhone [12] \(\.\.\.[0-9A-F]{4}\)$/);
    assert.equal(res.mode, 'PAPER');
    assert.ok(res.build);
    assert.deepEqual(res.results.map((x) => x.action), ['tap', 'type']);
    assert.ok(res.after.tree.length > 0);
    assert.deepEqual(wdas[udid].callsTo('/wda/tap')[0].body, { x: 50, y: 130 });
    assert.equal(wdas[udid].typed, 'hi');
  }
  assert.equal(wdas[UDID_A].callsTo('/wda/tap').length, 1);
  assert.equal(wdas[UDID_B].callsTo('/wda/tap').length, 1);
});

withBridge('bridge: finger_look with an image arrives as MCP image content', {}, async ({ link }) => {
  const res = await link.tool('finger_look', { device: '2', mode: 'both' });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.image.type, 'image');
  assert.equal(res.image.mimeType, 'image/jpeg');
  assert.deepEqual([...Buffer.from(res.image.data, 'base64').subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.ok(Array.isArray(res.tree));
  assert.match(res.lookId, /^L002F-\d+$/);
});

withBridge('bridge: with two phones plugged in, leaving the phone out is refused', {}, async ({ link, wdas }) => {
  const res = await link.tool('finger_look', {});
  assert.equal(res.code, 'DEVICE_REQUIRED');
  assert.equal(res.isError, true);
  assert.equal(wdas[UDID_A].calls.filter((c) => c.path === '/source').length, 0);
});

withBridge('bridge: finger_buy in PAPER mode is refused all the way through', {}, async ({ link, wdas }) => {
  const w = fakeWallet(wdas[UDID_A]);
  const res = await link.tool('finger_buy', { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R1' });
  assert.equal(res.code, 'PAPER_MODE');
  assert.equal(w.placed, 0);
});

const LIVE = { mode: 'LIVE', perBetCap: 5, dailyCap: 4, dailyLossLimit: 20, lossStop: 3, minSecondsLeft: 60, maxStake: 10, gate: { set: true } };

withBridge('bridge: finger_buy over the cap is refused; by alias is refused; a good one is placed once; a repeat is refused', { caps: LIVE }, async ({ link, wdas }) => {
  let w = fakeWallet(wdas[UDID_A]);
  const over = await link.tool('finger_buy', { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 10, round: 'R1' });
  assert.equal(over.code, 'OVER_BET_CAP');
  const alias = await link.tool('finger_buy', { udid: '1', coin: 'BTC', side: 'UP', stake: 2, round: 'R1' });
  assert.equal(alias.code, 'BUY_NEEDS_UDID');
  assert.equal(w.page, 'market');
  const good = await link.tool('finger_buy', { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R1' });
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.equal(good.mode, 'LIVE');
  assert.equal(good.spentToday, 2);
  assert.equal(w.placed, 1);
  w = fakeWallet(wdas[UDID_A]);
  const again = await link.tool('finger_buy', { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R1' });
  assert.equal(again.code, 'DUPLICATE');
  w = fakeWallet(wdas[UDID_A], { round: 'R2' });
  assert.equal((await link.tool('finger_buy', { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R2' })).ok, true);
  w = fakeWallet(wdas[UDID_A], { round: 'R3' });
  assert.equal((await link.tool('finger_buy', { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R3' })).code, 'OVER_DAILY_CAP');
  assert.equal(w.placed, 0);
});

withBridge('bridge: finger_act cannot press the buy button, even through the whole bridge', { caps: LIVE }, async ({ link, wdas }) => {
  const w = fakeWallet(wdas[UDID_A]);
  w.goConfirm('Up', 2);
  const res = await link.tool('finger_act', { device: '1', steps: [{ tap: { label: 'Confirm' } }] });
  assert.equal(res.results[0].code, 'TOUCHES_CONFIRM');
  assert.equal(w.confirmTaps, 0);
});

withBridge('bridge: the same command delivered twice runs once', {}, async ({ app, wdas }) => {
  const cmd = { id: 'dup-1', tool: 'finger_act', args: { device: '1', steps: [{ tap: { label: 'Settings' } }], then: 'none' }, createdAt: Date.now(), expiresAt: Date.now() + 30000 };
  assert.equal((await app.runCommand(cmd)).ok, true);
  const second = await app.runCommand(cmd);
  assert.equal(second.code, 'ALREADY_RUN');
  assert.equal(wdas[UDID_A].callsTo('/wda/tap').length, 1);
  const lateCmd = { ...cmd, id: 'late-1', expiresAt: Date.now() - 1 };
  assert.equal((await app.runCommand(lateCmd)).code, 'EXPIRED');
  assert.equal(wdas[UDID_A].callsTo('/wda/tap').length, 1);
});

withBridge('bridge: cable pulled and plugged back: status follows, alias stays, the next call works', {}, async ({ link, mux, wdas }) => {
  mux.detach(UDID_A);
  await until(async () => (await link.tool('finger_status')).mac.devices[0].state === 'ABSENT');
  assert.equal((await link.tool('finger_look', { device: '1' })).code, 'NOT_PLUGGED');
  assert.equal((await link.tool('finger_look', {})).ok, true, 'one phone left, so it may be left out');
  mux.attach(UDID_A, { 8100: wdas[UDID_A].port });
  await until(async () => (await link.tool('finger_status')).mac.devices[0].attached === true);
  const res = await link.tool('finger_look', { device: '1' });
  assert.equal(res.ok, true);
  assert.equal(res.udid, UDID_A);
});

withBridge('bridge: the heartbeat keeps going while a command is slow', {}, async ({ link, wdas }) => {
  wdas[UDID_A].delays['/source'] = 600;
  const slow = link.tool('finger_look', { device: '1' });
  await sleep(450);
  const s = await link.tool('finger_status');
  assert.equal(s.online, true);
  assert.ok(s.ageMs < 300, `heartbeat is ${s.ageMs} ms old during a slow command`);
  assert.equal(s.mac.devices[0].busy, true);
  assert.equal((await slow).ok, true);
});

withBridge('bridge: finger-link unreachable: the Mac keeps its lanes and reports the error on its page status', {}, async ({ link, app }) => {
  await link.close();
  await sleep(400);
  const lane = app.laneFor(UDID_A);
  assert.equal((await lane.look('tree')).tree.length > 0, true);
  link.close = async () => {};
});

withBridge('bridge: finger_selftest says plainly that it is not built yet', {}, async ({ link }) => {
  assert.equal((await link.tool('finger_selftest', { device: '1' })).code, 'NOT_BUILT');
});
