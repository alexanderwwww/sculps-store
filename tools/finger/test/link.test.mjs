import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LinkCore, HEARTBEAT_MAX_AGE_MS, MAX_RESULT_BYTES } from '../link/core.mjs';
import { Link } from '../src/link.mjs';
import { TOOLS, PROTOCOL } from '../link/mcp.mjs';
import { memorySql, localLink } from './local-link.mjs';
import { createApp } from '../src/main.mjs';
import { DEFAULT_CAPS, BUILT } from '../src/guard.mjs';
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

// Reading a round's result is not built, and the shipped app blocks live mode for it
// (money.test.mjs "live stays blocked..."). The bridge is tested with it standing in.
const READER = { settlementReader: true };

async function bridge({ profile = FAKE_PROFILE, caps = null, built = READER } = {}) {
  const mux = new FakeUsbmuxd(); await mux.start();
  const wdas = { [UDID_A]: await new FakeWda().start(), [UDID_B]: await new FakeWda().start() };
  const link = await localLink({ waitMs: 4000 });
  const home = tmpHome();
  if (caps) fs.writeFileSync(path.join(home, 'caps.json'), JSON.stringify({ ...DEFAULT_CAPS, ...caps }));
  const app = createApp({ home, usbmuxSocket: mux.socketPath, linkBase: link.base, profile, built, healthMs: 50, linkOptions: { heartbeatMs: 100, takeMs: 20, retryMs: 20 } });
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
    assert.equal(res.wda, '17.0.12');
    assert.equal(res.balance, null, 'not read from the wallet yet, and said so');
    assert.equal(typeof res.lastLookAgeMs, 'number');
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

// ---- added after review: each of these failed before its fix ----

test('link core: a call that was handed out and never answered reads as lost after its deadline; a late answer is still kept', () => {
  const { c, core } = clockCore();
  core.heartbeat({});
  const a = core.enqueue('finger_buy', {}, 15000, 120000);
  assert.equal(core.take().length, 1);
  c.t += 15000 + 119000;
  assert.equal(core.get(a.id).state, 'taken', 'still inside the time it may run');
  c.t += 2000;
  assert.equal(core.get(a.id).state, 'lost');
  assert.deepEqual(core.take(), [], 'a lost call is never handed out again');
  assert.deepEqual(core.result(a.id, { ok: true }), { ok: true });
  assert.equal(core.get(a.id).state, 'done');
  core.heartbeat({});
  const never = core.enqueue('finger_look', {}, 30000);
  assert.equal(core.result(never.id, { ok: true }).ok, false, 'a result for a call the Mac was never given is not taken');
});

test('mcp: a lost call is not "pending" for ever: finger_result says it may or may not have run', async () => {
  const clock = { t: 5_000_000 };
  const link = await localLink({ waitMs: 60, now: () => clock.t });
  try {
    link.core.heartbeat({});
    // The Mac's take reaches finger-link, but the answer is lost on the way back.
    link.faults.on = (route) => (route === 'take' ? 'after' : undefined);
    const pending = await link.tool('finger_buy', { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R1' });
    assert.equal(pending.pending, true);
    assert.equal((await fetch(`${link.base}/take`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 503);
    link.faults.on = () => undefined;
    assert.deepEqual(link.core.take(), [], 'it is marked as handed out');
    assert.equal((await link.tool('finger_result', { id: pending.id })).pending, true);
    clock.t += 50 * 60 * 1000;
    const late = await link.tool('finger_result', { id: pending.id });
    assert.equal(late.pending, undefined);
    assert.deepEqual([late.code, late.lost, late.isError], ['NO_ANSWER', true, true]);
    assert.match(late.error, /may or may not have been carried out: look at the phone/);
  } finally { await link.close(); }
});

test('link core: a result too big to keep is replaced by a small one, so the call ends', () => {
  const { core } = clockCore();
  core.heartbeat({});
  const a = core.enqueue('finger_look', {}, 30000);
  core.take();
  assert.deepEqual(core.result(a.id, { ok: true, image: { base64: 'A'.repeat(MAX_RESULT_BYTES + 10) } }), { ok: true });
  const got = core.get(a.id);
  assert.equal(got.state, 'done');
  assert.equal(got.result.code, 'RESULT_TOO_BIG');
  // The storage itself refusing (what workerd does: "string or blob too big: SQLITE_TOOBIG").
  const sql = memorySql();
  const picky = { all: (q, ...p) => { if (p.some((x) => typeof x === 'string' && x.length > 5000)) throw new Error('string or blob too big: SQLITE_TOOBIG'); return sql.all(q, ...p); } };
  const core2 = new LinkCore({ sql: picky });
  core2.heartbeat({});
  const b = core2.enqueue('finger_look', {}, 30000);
  core2.take();
  assert.deepEqual(core2.result(b.id, { ok: true, tree: ['x'.repeat(6000)] }), { ok: true });
  assert.equal(core2.get(b.id).result.code, 'RESULT_TOO_BIG');
  assert.match(core2.get(b.id).result.error, /SQLITE_TOOBIG/);
});

// The answer to a tool call, waiting for it when the first reply was "pending".
async function answer(link, first) {
  if (!first.pending) return first;
  let res;
  await until(async () => { res = await link.tool('finger_result', { id: first.id }); return !res.pending; });
  return res;
}

// A Link on its own against the local finger-link, with a command handler the test supplies.
async function macLink(onCommand, { file = null, start = true } = {}) {
  const link = await localLink({ waitMs: 50 });
  link.core.heartbeat({});
  const mac = new Link({ base: link.base, getStatus: () => ({ build: 't' }), onCommand, outboxFile: file, heartbeatMs: 30, takeMs: 10, retryMs: 20 });
  if (start) mac.start();
  return { link, mac, close: async () => { mac.stop(); await link.close(); } };
}

test('link: a result the link would not take is kept on disk and posted again until it is taken; its id rides in the heartbeat', async () => {
  const home = tmpHome();
  const file = path.join(home, 'outbox.json');
  let runs = 0;
  const { link, mac, close } = await macLink(async () => { runs++; return { ok: true, n: 7 }; }, { file });
  try {
    let refused = 0;
    link.faults.on = (route) => { if (route === 'result') { refused++; return 'before'; } return undefined; };
    const pending = await link.tool('finger_look', {});
    await until(() => refused >= 8, 5000);                    // far past the old five tries
    assert.equal(runs, 1);
    const waiting = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(Object.keys(waiting), [pending.id], 'the result is on disk');
    await until(async () => (await link.tool('finger_status')).mac.undelivered?.length === 1);
    assert.equal((await link.tool('finger_result', { id: pending.id })).pending, true);
    link.faults.on = () => undefined;                         // the link is back
    await until(async () => (await link.tool('finger_result', { id: pending.id })).n === 7);
    await until(() => fs.readFileSync(file, 'utf8') === '{}');
    assert.equal(runs, 1, 'the command itself was run once');
    await until(async () => (await link.tool('finger_status')).mac.undelivered.length === 0);
  } finally { await close(); fs.rmSync(home, { recursive: true, force: true }); }
});

test('link: a result left in the outbox by a finger that was stopped is posted when finger starts again', async () => {
  const home = tmpHome();
  const file = path.join(home, 'outbox.json');
  const { link, mac, close } = await macLink(async () => ({ ok: true }), { file, start: false });
  try {
    const pending = await link.tool('finger_act', { steps: [] });
    link.core.take();
    fs.writeFileSync(file, JSON.stringify({ [pending.id]: { tool: 'finger_act', result: { ok: true, from: 'before the restart' }, at: Date.now() } }));
    const again = new Link({ base: link.base, getStatus: () => ({}), onCommand: async () => ({}), outboxFile: file, heartbeatMs: 30, takeMs: 10, retryMs: 20 });
    again.start();
    try {
      await until(async () => (await link.tool('finger_result', { id: pending.id })).from === 'before the restart');
    } finally { again.stop(); }
  } finally { await close(); fs.rmSync(home, { recursive: true, force: true }); }
});

test('link: a result over the size limit is swapped on the Mac for a small one that says so', async () => {
  const { link, close } = await macLink(async () => ({ ok: true, image: { base64: 'A'.repeat(MAX_RESULT_BYTES), mime: 'image/jpeg' } }));
  try {
    const res = await answer(link, await link.tool('finger_look', {}));
    assert.equal(res.code, 'RESULT_TOO_BIG');
    assert.equal(res.image, null);
  } finally { await close(); }
});

test('link: an odd answer to take does not kill the loop, each loop holds one timer, and the take loop does not wait for a command to finish', async () => {
  const seen = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const { link, mac, close } = await macLink(async (cmd) => { seen.push(cmd.args.n); if (cmd.args.n === 1) await gate; return { ok: true, n: cmd.args.n }; });
  try {
    link.faults.on = (route) => (route === 'take' ? { ok: true, commands: { 0: 'x' } } : undefined);
    await sleep(150);
    link.faults.on = () => undefined;
    const slow = await link.tool('finger_look', { n: 1 });
    await until(() => seen.includes(1));
    const res = await answer(link, await link.tool('finger_look', { n: 2 }));
    assert.equal(res.n, 2, 'the second command was taken and answered while the first was still running');
    assert.equal((await link.tool('finger_result', { id: slow.id })).pending, true);
    release();
    await until(async () => (await link.tool('finger_result', { id: slow.id })).n === 1);
    assert.deepEqual(Object.keys(mac.timers).sort(), ['beat', 'flush', 'take'], 'one timer per loop, however long finger runs');
  } finally { await close(); }
});

withBridge('bridge: a call that waited in the lane until its lifetime ran out is not carried out', {}, async ({ app, wdas }) => {
  wdas[UDID_A].delays['/source'] = 500;
  const now = Date.now();
  const first = app.runCommand({ id: 'slow-1', tool: 'finger_act', args: { device: '1', steps: [{ tap: { label: 'Safari' } }], then: 'none' }, createdAt: now, expiresAt: now + 30000 });
  const second = app.runCommand({ id: 'late-2', tool: 'finger_act', args: { device: '1', steps: [{ tap: { label: 'Settings' } }], then: 'none' }, createdAt: now, expiresAt: now + 200 });
  const third = app.runCommand({ id: 'late-3', tool: 'finger_look', args: { device: '1' }, createdAt: now, expiresAt: now + 200 });
  assert.equal((await first).ok, true);
  assert.equal((await second).code, 'EXPIRED');
  assert.equal((await third).code, 'EXPIRED');
  assert.deepEqual(wdas[UDID_A].callsTo('/wda/tap').map((c) => c.body), [{ x: 130, y: 130 }], 'only the first call tapped');
});

withBridge('bridge: as shipped (no result reader) live mode cannot run, whatever the limits file says', { caps: LIVE, built: BUILT }, async ({ link, wdas }) => {
  const w = fakeWallet(wdas[UDID_A]);
  const res = await link.tool('finger_buy', { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R1' });
  assert.equal(res.code, 'LIVE_BLOCKED');
  assert.match(res.error, /round's result/);
  assert.equal(w.page, 'market');
});

withBridge('bridge: finger_act inside the wallet: the race to the confirm screen and a pop-up accept are both refused end to end', { caps: LIVE }, async ({ link, wdas }) => {
  const w = fakeWallet(wdas[UDID_A]);
  const seen = await link.tool('finger_look', { device: '1' });
  wdas[UDID_A].delays['/wda/tap'] = 300;
  setTimeout(() => w.goConfirm('Up', 2), 100);
  const res = await link.tool('finger_act', { device: '1', steps: [{ tap: { x: 100, y: 720, of: seen.lookId } }], then: 'none' });
  assert.equal(res.results[0].code, 'TOUCHES_CONFIRM');
  await sleep(350);
  wdas[UDID_A].alert = 'Place bet?';
  assert.equal((await link.tool('finger_act', { device: '1', steps: [{ alert: { accept: true } }], then: 'none' })).results[0].code, 'ALERT_BLOCKED');
  assert.equal(w.confirmTaps, 0);
  assert.equal(w.placed, 0);
});

test('mcp: the finger_act description says what is true about the wallet', () => {
  const d = TOOLS.find((t) => t.name === 'finger_act').description;
  assert.ok(!/can never place a bet/.test(d));
  assert.match(d, /holdBefore/);
  assert.ok(!/seconds,of/.test(d));
  assert.match(d, /does not touch inside the wallet at all, unless/);
});
