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
import { FakeUsbmuxd } from './fake-usbmuxd.mjs';
import { tmpHome, until, FAKE_PROFILE } from './rig.mjs';

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
  const called = [...script.matchAll(/fetch\('(\/api\/[a-z-]+)'/g)].map((m) => m[1]);
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

    // A second double-click while it is running steps aside and leaves the first alone.
    const second = spawn(b.launcher, [], { env, stdio: 'ignore' });
    const code = await new Promise((r) => second.on('exit', r));
    assert.equal(code, 0);
    assert.equal(Number(fs.readFileSync(path.join(b.support, 'data', 'finger.pid'), 'utf8')), newPid);
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
