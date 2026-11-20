// The page, the probe, the launcher and the bundle rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePlist, buildPlist } from '../src/plist.mjs';
import { probe, probeXcode } from '../src/probe.mjs';
import { startPage } from '../src/ui.mjs';
import { Caps } from '../src/guard.mjs';
import { Ledger } from '../src/ledger.mjs';
import { createApp } from '../src/main.mjs';
import http from 'node:http';
import { FakeUsbmuxd } from './fake-usbmuxd.mjs';
import { FakeWda } from './fake-wda.mjs';
import { tmpHome, until, sleep, FAKE_PROFILE, UDID_A } from './rig.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EMPTY_PROFILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles', 'phantom.json'), 'utf8'));

async function page(profile = EMPTY_PROFILE) {
  const home = tmpHome();
  const caps = new Caps({ file: path.join(home, 'caps.json') });
  const ledger = new Ledger({ file: path.join(home, 'ledger.jsonl') });
  const p = await startPage({ port: 0, getStatus: () => ({ build: '1', mode: caps.read().mode, devices: [] }), caps, ledger, profile });
  const post = (route, body, headers = { 'content-type': 'application/json' }) => fetch(p.url + route, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { p, caps, ledger, post, close: async () => { await p.close(); fs.rmSync(home, { recursive: true, force: true }); } };
}

test('page: serves on 127.0.0.1 only, shows status, and says why live is off', async () => {
  const s = await page();
  try {
    assert.match(s.p.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const html = await (await fetch(s.p.url)).text();
    assert.match(html, /<title>finger<\/title>/);
    const status = await (await fetch(s.p.url + 'api/status')).json();
    assert.equal(status.mode, 'PAPER');
    assert.ok(status.liveBlockers.some((b) => /confirm screen has not been read/.test(b)));
  } finally { await s.close(); }
});

test('page: the money numbers are saved from the page; bad numbers are refused', async () => {
  const s = await page();
  try {
    const ok = await (await s.post('api/caps', { dailyCap: '20', dailyLossLimit: '10', lossStop: '3', minSecondsLeft: '60' })).json();
    assert.equal(ok.ok, true);
    assert.equal(s.caps.read().dailyCap, 20);
    const bad = await s.post('api/caps', { dailyCap: 'abc' });
    assert.equal(bad.status, 400);
    assert.equal(s.caps.read().dailyCap, 20);
  } finally { await s.close(); }
});

test('page: live mode cannot be switched on while the Phantom profile is empty or the gate is unset', async () => {
  const s = await page();
  try {
    await s.post('api/caps', { dailyCap: '20', dailyLossLimit: '10', lossStop: '3', minSecondsLeft: '60' });
    const res = await s.post('api/mode', { mode: 'LIVE' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'LIVE_BLOCKED');
    assert.equal(s.caps.read().mode, 'PAPER');
  } finally { await s.close(); }
  const t = await page(FAKE_PROFILE);
  try {
    await t.post('api/caps', { dailyCap: '20', dailyLossLimit: '10', lossStop: '3', minSecondsLeft: '60' });
    assert.match((await (await t.post('api/mode', { mode: 'LIVE' })).json()).error, /go-live gate/);
  } finally { await t.close(); }
});

test('page: another website cannot change the numbers (wrong origin or a plain form post)', async () => {
  const s = await page();
  try {
    assert.equal((await s.post('api/caps', { dailyCap: '999' }, { 'content-type': 'application/json', origin: 'https://evil.example' })).status, 403);
    assert.equal((await s.post('api/caps', 'dailyCap=999', { 'content-type': 'application/x-www-form-urlencoded' })).status, 403);
    assert.equal((await s.post('api/caps', '{"dailyCap":"999"}', { 'content-type': 'text/plain' })).status, 403);
    assert.equal(s.caps.read().dailyCap, null);
  } finally { await s.close(); }
});

test('page: the page script has no syntax error and only calls routes the server has', () => {
  const html = fs.readFileSync(path.join(ROOT, 'ui', 'index.html'), 'utf8');
  const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
  assert.doesNotThrow(() => new Function(script));
  const called = [...script.matchAll(/(?:fetch|send)\('(\/api\/[a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(called)].sort(), ['/api/caps', '/api/mode', '/api/reset-losses', '/api/resolve', '/api/status', '/api/wallet-setup']);
  const served = fs.readFileSync(path.join(ROOT, 'src', 'ui.mjs'), 'utf8');
  for (const route of called) assert.ok(served.includes(`'${route}'`), route);
  assert.ok(!/https?:\/\/(?!127\.0\.0\.1)/.test(html), 'the page loads nothing from the internet');
});

test('probe: reads Xcode the way the cited source does (fake xcode-select and Info.plist)', async () => {
  const exec = async (cmd, args) => { assert.deepEqual([cmd, args], ['xcode-select', ['--print-path']]); return '/Applications/Xcode.app/Contents/Developer\n'; };
  const readFile = (f) => { assert.equal(f, '/Applications/Xcode.app/Contents/Info.plist'); return Buffer.from(buildPlist({ CFBundleIdentifier: 'com.apple.dt.Xcode', CFBundleShortVersionString: '16.2' })); };
  assert.deepEqual(await probeXcode({ exec, readFile }), { found: true, developerDir: '/Applications/Xcode.app/Contents/Developer', bundleId: 'com.apple.dt.Xcode', version: '16.2' });
  const tools = await probeXcode({ exec: async () => '/Library/Developer/CommandLineTools', readFile: () => { throw new Error('ENOENT'); } });
  assert.equal(tools.found, false);
  assert.equal((await probeXcode({ exec: async () => { throw new Error('not found'); } })).found, false);
  assert.equal((await probeXcode({ exec, readFile: () => Buffer.from('bplist00....') })).version, null);
  const all = await probe({ exec, readFile });
  assert.equal(all.node, process.version);
  assert.equal(typeof all.memoryGb, 'number');
});

test('bundle: Info.plist parses and names the launcher; the launcher is executable and valid bash', () => {
  const info = parsePlist(fs.readFileSync(path.join(ROOT, 'app/finger.app/Contents/Info.plist')));
  assert.equal(info.CFBundleExecutable, 'finger');
  assert.equal(info.CFBundleName, 'finger');
  const launcher = path.join(ROOT, 'app/finger.app/Contents/MacOS', info.CFBundleExecutable);
  assert.ok(fs.statSync(launcher).mode & 0o100, 'launcher has its exec bit');
  execFileSync('bash', ['-n', launcher]);
});

// Builds a bundle the way pack.sh will (worker files under Resources/worker, Node under
// Resources/node) in a folder with a space in its name, and runs the real launcher.
// Under Linux bash: this proves the launcher's logic, not macOS.
function stageBundle() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'finger bundle '));
  const app = path.join(base, 'My Apps', 'finger.app');
  fs.cpSync(path.join(ROOT, 'app/finger.app'), app, { recursive: true });
  const res = path.join(app, 'Contents', 'Resources');
  fs.mkdirSync(path.join(res, 'worker'), { recursive: true });
  for (const f of ['BUILD', 'src', 'ui', 'profiles']) fs.cpSync(path.join(ROOT, f), path.join(res, 'worker', f), { recursive: true });
  fs.symlinkSync(process.execPath, path.join(res, 'node'));
  return { base, app, res, launcher: path.join(app, 'Contents', 'MacOS', 'finger'), support: path.join(base, 'Application Support', 'finger') };
}

// A stand-in for macOS "open": it writes what it was asked to open into a file.
function fakeOpen(b, env) {
  const bin = path.join(b.base, 'fake bin');
  const log = path.join(b.base, 'opened.txt');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'open'), `#!/bin/bash\necho "$1" >> "${log}"\n`, { mode: 0o755 });
  const out = { ...env, PATH: `${bin}:${env.PATH}` };
  delete out.FINGER_NO_OPEN;
  return { env: out, opened: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []) };
}

test('launcher: first launch from a path with a space installs the worker, starts it, and the page answers with the build', async () => {
  const mux = new FakeUsbmuxd(); await mux.start();
  const b = stageBundle();
  const env = { ...process.env, FINGER_SUPPORT: b.support, FINGER_NO_OPEN: '1', FINGER_USBMUXD: mux.socketPath, FINGER_PORT: '0' };
  delete env.NODE_TEST_CONTEXT; // the worker is a normal Node process, not a child of the test runner
  const child = spawn(b.launcher, [], { env, detached: true, stdio: 'ignore' });
  try {
    const urlFile = path.join(b.support, 'data', 'page.url');
    await until(() => fs.existsSync(urlFile) && fs.readFileSync(urlFile, 'utf8').length > 0, 10000)
      .catch((e) => { throw new Error(`${e.message}; launcher log: ${fs.existsSync(path.join(b.support, 'finger.log')) ? fs.readFileSync(path.join(b.support, 'finger.log'), 'utf8') : 'none'}`); });
    const status = await (await fetch(fs.readFileSync(urlFile, 'utf8') + 'api/status')).json();
    assert.equal(status.build, fs.readFileSync(path.join(ROOT, 'BUILD'), 'utf8').trim());
    assert.equal(status.mode, 'PAPER');
    assert.equal(fs.readFileSync(path.join(b.support, 'worker', 'BUILD'), 'utf8'), fs.readFileSync(path.join(ROOT, 'BUILD'), 'utf8'));

    // The worker is killed: the launcher starts it again by itself.
    const pid = Number(fs.readFileSync(path.join(b.support, 'data', 'finger.pid'), 'utf8'));
    fs.rmSync(urlFile);
    process.kill(pid, 'SIGKILL');
    await until(() => fs.existsSync(urlFile) && fs.readFileSync(urlFile, 'utf8').length > 0, 10000);
    const newPid = Number(fs.readFileSync(path.join(b.support, 'data', 'finger.pid'), 'utf8'));
    assert.notEqual(newPid, pid);
    assert.equal((await (await fetch(fs.readFileSync(urlFile, 'utf8') + 'api/status')).json()).mode, 'PAPER');

    // A second double-click while it is running opens the running copy's page, steps aside,
    // and leaves the first alone: its page.url and its worker folder are not touched.
    const urlBefore = fs.readFileSync(urlFile, 'utf8');
    const workerStamp = fs.statSync(path.join(b.support, 'worker')).ino;
    const { env: env2, opened } = fakeOpen(b, env);
    const second = spawn(b.launcher, [], { env: env2, stdio: 'ignore' });
    const code = await new Promise((r) => second.on('exit', r));
    assert.equal(code, 0);
    assert.equal(Number(fs.readFileSync(path.join(b.support, 'data', 'finger.pid'), 'utf8')), newPid);
    assert.deepEqual(opened(), [urlBefore], 'the second double-click opened the page of the copy that is running');
    assert.equal(fs.readFileSync(urlFile, 'utf8'), urlBefore, 'page.url was not deleted');
    assert.equal(fs.statSync(path.join(b.support, 'worker')).ino, workerStamp, 'the worker folder was not swapped under the running worker');
    assert.equal((await (await fetch(urlBefore + 'api/status')).json()).mode, 'PAPER', 'the running copy still answers');
  } finally {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
    await mux.stop();
    fs.rmSync(b.base, { recursive: true, force: true });
  }
});

test('launcher: the bundle is the truth: a different installed build is replaced, newer or older, and data is kept', async () => {
  const b = stageBundle();
  try {
    const worker = path.join(b.support, 'worker');
    for (const installed of ['0', '999']) {
      fs.mkdirSync(path.join(worker, 'src'), { recursive: true });
      fs.writeFileSync(path.join(worker, 'BUILD'), installed + '\n');
      fs.writeFileSync(path.join(worker, 'src', 'main.mjs'), 'process.exit(3)\n');
      fs.writeFileSync(path.join(worker, 'stale-file'), 'old');
      fs.mkdirSync(path.join(b.support, 'data'), { recursive: true });
      fs.writeFileSync(path.join(b.support, 'data', 'caps.json'), '{"dailyCap":20}');
      // The bundle's worker here exits 3 at once ("already running"), so the launcher returns.
      fs.writeFileSync(path.join(b.res, 'worker', 'src', 'main.mjs'), 'process.exit(3)\n');
      execFileSync(b.launcher, [], { env: { ...process.env, FINGER_SUPPORT: b.support, FINGER_NO_OPEN: '1' }, timeout: 20000 });
      assert.equal(fs.readFileSync(path.join(worker, 'BUILD'), 'utf8'), fs.readFileSync(path.join(ROOT, 'BUILD'), 'utf8'), `installed build ${installed} was replaced`);
      assert.equal(fs.existsSync(path.join(worker, 'stale-file')), false);
      assert.equal(fs.readFileSync(path.join(b.support, 'data', 'caps.json'), 'utf8'), '{"dailyCap":20}');
    }
    assert.match(fs.readFileSync(path.join(b.support, 'finger.log'), 'utf8'), /installed build/);
  } finally { fs.rmSync(b.base, { recursive: true, force: true }); }
});

test('worker: with no usbmuxd at all the page still comes up and says so', async () => {
  const home = tmpHome();
  const app = createApp({ home, usbmuxSocket: '/nonexistent/usbmuxd', profile: EMPTY_PROFILE });
  await app.start();
  try {
    const s = await (await fetch(app.pageUrl + 'api/status')).json();
    assert.match(s.usbmuxError, /usbmuxd socket/);
    assert.deepEqual(s.devices, []);
  } finally { await app.stop(); fs.rmSync(home, { recursive: true, force: true }); }
});

const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const shipped = ['src', 'ui', 'link', 'profiles', 'app'].flatMap((d) => files(path.join(ROOT, d)));

test('bundle: no dependency and no import outside Node built-ins and finger itself', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'node_modules')), false);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  for (const f of shipped.filter((x) => x.endsWith('.mjs'))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^import .* from '([^']+)';$/gm)) {
      assert.ok(m[1].startsWith('node:') || m[1].startsWith('./') || m[1].startsWith('../') || m[1] === 'cloudflare:workers', `${path.relative(ROOT, f)} imports ${m[1]}`);
    }
  }
});

test('bundle: nothing from the other apps, no self-update, no remote code, no approval cards, no seed or passcode handling', () => {
  const banned = /gmgn|depop|ultracursor|organic|cursor|approv|self-?update|autoupdate|remote-?flag|eval\(|new Function|child_process.*exec\(|seed ?phrase|mnemonic|passcode\s*[:=]|kimchi|robinhood|aquarius/i;
  // Lines that are allowed to name a banned word, because they say finger does NOT do it.
  const allowed = [/never a phrase or a PIN/, /cursor: ?pointer/];
  for (const f of shipped) {
    if (fs.lstatSync(f).isSymbolicLink()) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (banned.test(line) && !allowed.some((a) => a.test(line))) assert.fail(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
    });
  }
});

test('link config: its own worker name, a SQLite Durable Object, and no key or account in the file', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'link', 'wrangler.toml'), 'utf8');
  assert.match(toml, /^name = "finger-link"$/m);
  assert.match(toml, /new_sqlite_classes = \["FingerLink"\]/);
  assert.match(toml, /class_name = "FingerLink"/);
  assert.ok(!/account_id|route|kerberos|gardenbuddy|FINGER_KEY\s*=/.test(toml));
  assert.match(fs.readFileSync(path.join(ROOT, 'link', 'worker.mjs'), 'utf8'), /export class FingerLink extends DurableObject/);
});

// ---- added after review: each of these failed before its fix ----

// One request with every header chosen by the test (fetch will not send a made-up Host).
function rawRequest(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('page: a website that points its own name at 127.0.0.1 (DNS rebinding) gets nothing, not even the status', async () => {
  const s = await page();
  try {
    const port = new URL(s.p.url).port;
    const evil = { host: `evil.example:${port}`, origin: `http://evil.example:${port}`, 'content-type': 'application/json' };
    for (const [route, body] of [['api/caps', { dailyCap: '999' }], ['api/mode', { mode: 'LIVE' }], ['api/reset-losses', {}], ['api/wallet-setup', { on: true }], ['api/resolve', { id: 'x', result: 'placed' }]]) {
      assert.equal((await rawRequest(s.p.url + route, { method: 'POST', headers: evil, body: JSON.stringify(body) })).status, 403, route);
    }
    assert.equal(s.caps.read().dailyCap, null);
    assert.equal(s.caps.read().walletSetup, false);
    assert.equal(s.ledger.rows().length, 0);
    assert.equal((await rawRequest(s.p.url + 'api/status', { headers: { host: `evil.example:${port}` } })).status, 403);
    assert.equal((await rawRequest(s.p.url, { headers: { host: `evil.example:${port}` } })).status, 403);
    assert.equal((await rawRequest(s.p.url + 'api/status', { headers: { host: `127.0.0.1:${Number(port) + 1}` } })).status, 403, 'the port counts too');
    // The page itself, by either of its two names.
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`]) {
      assert.equal((await rawRequest(s.p.url + 'api/status', { headers: { host } })).status, 200, host);
      const ok = await rawRequest(s.p.url + 'api/caps', { method: 'POST', headers: { host, origin: `http://${host}`, 'content-type': 'application/json' }, body: '{"dailyCap":"20"}' });
      assert.equal(ok.status, 200, host);
    }
    // Our Host, somebody else's Origin.
    assert.equal((await rawRequest(s.p.url + 'api/caps', { method: 'POST', headers: { host: `127.0.0.1:${port}`, origin: 'http://localhost:9', 'content-type': 'application/json' }, body: '{"dailyCap":"999"}' })).status, 403);
    assert.equal(s.caps.read().dailyCap, 20);
  } finally { await s.close(); }
});

test('page: a bet with no known outcome is resolved from the page; wallet setup is switched from the page', async () => {
  const s = await page();
  try {
    s.ledger.append({ type: 'reservation', id: 'u1', udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R1' });
    assert.equal(s.ledger.summary().unknown.length, 1);
    assert.equal((await s.post('api/resolve', { id: 'nope', result: 'placed' })).status, 400);
    assert.equal((await s.post('api/resolve', { id: 'u1', result: 'perhaps' })).status, 400);
    assert.equal((await s.post('api/resolve', { id: 'u1', result: 'not_placed' })).status, 200);
    assert.equal(s.ledger.summary().unknown.length, 0);
    assert.equal(s.ledger.summary().spentToday, 0);
    assert.equal((await s.post('api/wallet-setup', { on: 'yes' })).status, 400);
    assert.equal((await s.post('api/wallet-setup', { on: true })).status, 200);
    assert.equal(s.caps.read().walletSetup, true);
    assert.equal(s.caps.read().mode, 'PAPER');
    assert.equal((await s.post('api/reset-losses', {})).status, 200);
    assert.equal(s.ledger.rows().at(-1).type, 'reset');
  } finally { await s.close(); }
});

test('worker: with a torn or damaged line in every file it keeps, finger still starts, the page says what is wrong, and looking still works', async () => {
  const mux = new FakeUsbmuxd(); await mux.start();
  const wda = await new FakeWda().start();
  const home = tmpHome();
  fs.writeFileSync(path.join(home, 'ledger.jsonl'), '{"t":1,"date":"2026-11-20","type":"reset","what":"losses"}\nnot json at all\n{"t":17636,"type":"reserv');
  fs.writeFileSync(path.join(home, 'commands.jsonl'), '{"id":"old-1","tool":"finger_act","t":1}\n{"id":"old-2","tool":"fin');
  fs.writeFileSync(path.join(home, 'caps.json'), '{"mode":"LIVE","dailyCap":2');
  fs.writeFileSync(path.join(home, 'devices.json'), '{"x":{"alias":1,"udid":"X"}}}');
  fs.writeFileSync(path.join(home, 'outbox.json'), '{"half":');
  const link = { base: 'http://127.0.0.1:9/k/none' }; // nothing listens there; only the outbox file is read
  let app;
  try {
    assert.doesNotThrow(() => { app = createApp({ home, usbmuxSocket: mux.socketPath, profile: EMPTY_PROFILE, linkBase: link.base, linkOptions: { heartbeatMs: 50, takeMs: 50, retryMs: 50 } }); });
    mux.attach(UDID_A, { 8100: wda.port });
    await app.start();
    const res = await fetch(app.pageUrl + 'api/status');
    assert.equal(res.status, 200);
    const s = await res.json();
    assert.equal(s.mode, 'PAPER');
    const said = s.problems.join(' | ');
    assert.match(said, /money limits file could not be read/);
    assert.match(said, /1 line of the money ledger cannot be read/);
    assert.match(said, /1 unfinished row was found at the end of the money ledger/);
    assert.match(said, /list of known iPhones could not be read/);
    await until(() => app.registry.list().length === 1);
    const look = await app.runCommand({ id: 'c-look', tool: 'finger_look', args: {}, createdAt: Date.now(), expiresAt: Date.now() + 30000 });
    assert.equal(look.ok, true, JSON.stringify(look));
    const act = await app.runCommand({ id: 'c-act', tool: 'finger_act', args: { steps: [{ tap: { label: 'Settings' } }], then: 'none' }, createdAt: Date.now(), expiresAt: Date.now() + 30000 });
    assert.equal(act.ok, true, JSON.stringify(act));
    assert.equal((await app.runCommand({ id: 'old-1', tool: 'finger_act', args: {}, createdAt: Date.now(), expiresAt: Date.now() + 30000 })).code, 'ALREADY_RUN', 'ids on the good lines still count');
  } finally {
    if (app) await app.stop();
    await wda.stop(); await mux.stop();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('worker: the page status carries the wallet lines (not recorded; setup on means unguarded and zero balance)', async () => {
  const home = tmpHome();
  const app = createApp({ home, usbmuxSocket: '/nonexistent/usbmuxd', profile: EMPTY_PROFILE });
  await app.start();
  try {
    let s = await (await fetch(app.pageUrl + 'api/status')).json();
    assert.deepEqual([s.walletRecorded, s.walletSetup, s.problems.length], [false, false, 0]);
    assert.ok(s.liveBlockers.some((b) => /round's result/.test(b)), 'the missing result reader is named on the page');
    app.caps.setWalletSetup(true);
    s = await (await fetch(app.pageUrl + 'api/status')).json();
    assert.match(s.problems.join(' '), /nothing guards its buy button\. The wallet balance must be zero/);
  } finally { await app.stop(); fs.rmSync(home, { recursive: true, force: true }); }
});

test('worker: a wallet profile finger cannot guard stops finger from starting', () => {
  const home = tmpHome();
  try {
    assert.throws(() => createApp({ home, usbmuxSocket: '/nonexistent/usbmuxd', profile: { ...EMPTY_PROFILE, bundleId: null } }), /wallet profile cannot be used: bundleId/);
    assert.throws(() => createApp({ home, usbmuxSocket: '/nonexistent/usbmuxd', profile: { ...FAKE_PROFILE, guardRects: [], confirmLabels: [] } }), /guardRects/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('launcher: a different build while finger is running: the old worker is stopped first, the new build is installed, one worker runs it, and the page is opened', async () => {
  const mux = new FakeUsbmuxd(); await mux.start();
  const b = stageBundle();
  const base = { ...process.env, FINGER_SUPPORT: b.support, FINGER_USBMUXD: mux.socketPath, FINGER_PORT: '0' };
  delete base.NODE_TEST_CONTEXT;
  const { env, opened } = fakeOpen(b, base);
  const pidFile = path.join(b.support, 'data', 'finger.pid');
  const urlFile = path.join(b.support, 'data', 'page.url');
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const first = spawn(b.launcher, [], { env, detached: true, stdio: 'ignore' });
  let second = null;
  try {
    await until(() => opened().length === 1, 10000);
    const oldPid = Number(fs.readFileSync(pidFile, 'utf8'));
    const build = fs.readFileSync(path.join(ROOT, 'BUILD'), 'utf8').trim();
    assert.equal((await (await fetch(fs.readFileSync(urlFile, 'utf8') + 'api/status')).json()).build, build);
    // The app is replaced by another build, and double-clicked while the old one runs.
    fs.writeFileSync(path.join(b.res, 'worker', 'BUILD'), '777\n');
    second = spawn(b.launcher, [], { env, detached: true, stdio: 'ignore' });
    await until(() => !alive(oldPid), 15000);
    await until(async () => {
      try { return (await (await fetch(fs.readFileSync(urlFile, 'utf8') + 'api/status')).json()).build === '777'; } catch { return false; }
    }, 20000);
    assert.equal(fs.readFileSync(path.join(b.support, 'worker', 'BUILD'), 'utf8'), '777\n');
    await until(() => opened().length === 2, 10000);
    assert.match(fs.readFileSync(path.join(b.support, 'finger.log'), 'utf8'), /stopping the running worker \(\d+\) to install another build/);
    await sleep(3000); // long enough for both launchers to have settled who runs the worker
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.ok(alive(pid) && pid !== oldPid, 'one worker, a new one, is running');
    assert.equal((await (await fetch(fs.readFileSync(urlFile, 'utf8') + 'api/status')).json()).build, '777');
  } finally {
    for (const c of [first, second]) { if (c) try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }
    await mux.stop();
    fs.rmSync(b.base, { recursive: true, force: true });
  }
});
