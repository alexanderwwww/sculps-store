import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { buildPlist, parsePlist } from '../src/plist.mjs';
import { encodeFrame, FrameReader, swapPort, Usbmux } from '../src/usbmux.mjs';
import { FakeUsbmuxd } from './fake-usbmuxd.mjs';
import { UDID_A, UDID_B, until } from './rig.mjs';

test('plist: round trip of every type usbmuxd uses', () => {
  const obj = { MessageType: 'Connect', DeviceID: 7, PortNumber: 42015, Flag: true, Off: false, Ratio: 1.5,
    Name: 'a <b> & "c"', List: [1, 'two', { three: 3 }], Empty: {}, None: [], Blob: Buffer.from([0, 1, 2, 255]) };
  assert.deepEqual(parsePlist(buildPlist(obj)), obj);
});

test('plist: reads Apple-style formatting with whitespace and empty tags', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>DeviceList</key>
\t<array>
\t\t<dict>
\t\t\t<key>DeviceID</key>
\t\t\t<integer>3</integer>
\t\t\t<key>Properties</key>
\t\t\t<dict><key>SerialNumber</key><string>ABC</string><key>Note</key><string/></dict>
\t\t</dict>
\t</array>
</dict>
</plist>`;
  assert.deepEqual(parsePlist(xml), { DeviceList: [{ DeviceID: 3, Properties: { SerialNumber: 'ABC', Note: '' } }] });
});

test('plist: refuses what it does not understand', () => {
  assert.throws(() => parsePlist('<plist version="1.0"><date>2026</date></plist>'), /unsupported/);
  assert.throws(() => parsePlist('hello'), /no <plist>/);
});

test('usbmux: port 8100 is sent as 42015', () => {
  assert.equal(swapPort(8100), 42015);
  assert.equal(swapPort(42015), 8100);
});

test('usbmux: frame header is 16 bytes little-endian: length, version 1, message 8, tag', () => {
  const f = encodeFrame(9, { MessageType: 'ListDevices' });
  assert.equal(f.readUInt32LE(0), f.length);
  assert.equal(f.readUInt32LE(4), 1);
  assert.equal(f.readUInt32LE(8), 8);
  assert.equal(f.readUInt32LE(12), 9);
});

test('usbmux: frames split byte by byte and frames glued together both decode', () => {
  const a = encodeFrame(1, { A: 1 }), b = encodeFrame(2, { B: 'two' });
  const split = new FrameReader();
  const got = [];
  for (const byte of Buffer.concat([a, b])) got.push(...split.push(Buffer.from([byte])));
  assert.deepEqual(got.map((f) => [f.tag, parsePlist(f.payload)]), [[1, { A: 1 }], [2, { B: 'two' }]]);
  const glued = new FrameReader().push(Buffer.concat([a, b, a.subarray(0, 5)]));
  assert.equal(glued.length, 2);
  assert.throws(() => new FrameReader().push(Buffer.alloc(16)), /bad frame length/);
});

async function withMux(fn) {
  const mux = new FakeUsbmuxd();
  await mux.start();
  try { await fn(mux, new Usbmux({ socketPath: mux.socketPath, timeoutMs: 1500 })); } finally { await mux.stop(); }
}

const echoServer = () => new Promise((resolve) => {
  const s = net.createServer((c) => c.on('data', (d) => c.write(Buffer.concat([Buffer.from('echo:'), d]))));
  s.listen(0, '127.0.0.1', () => resolve(s));
});

test('fake usbmuxd: ListDevices gives USB phones only, never the Network duplicate', () => withMux(async (mux, usbmux) => {
  mux.attach(UDID_A, {}, { network: true });
  mux.attach(UDID_B, {});
  const list = await usbmux.listDevices();
  assert.deepEqual(list.map((d) => [d.udid, d.connectionType]), [[UDID_A, 'USB'], [UDID_B, 'USB']]);
}));

test('fake usbmuxd: Listen reports phones already plugged in, then attach and detach', () => withMux(async (mux, usbmux) => {
  mux.attach(UDID_A, {});
  const events = [];
  const l = await usbmux.listen((e) => events.push(e));
  await until(() => events.length === 1);
  const idB = mux.attach(UDID_B, {});
  await until(() => events.length === 2);
  mux.detach(UDID_B);
  await until(() => events.length === 3);
  assert.deepEqual(events.map((e) => e.type), ['attached', 'attached', 'detached']);
  assert.equal(events[1].udid, UDID_B);
  assert.equal(events[2].deviceId, idB);
  l.close();
}));

test('fake usbmuxd: Connect result 0 turns the socket into the raw stream to the phone port', () => withMux(async (mux, usbmux) => {
  const echo = await echoServer();
  const id = mux.attach(UDID_A, { 8100: echo.address().port });
  const sock = await usbmux.connect(id, 8100);
  const got = await new Promise((r) => { sock.once('data', r); sock.write('hello'); });
  assert.equal(got.toString(), 'echo:hello');
  assert.deepEqual(mux.connects, [{ deviceId: id, port: 8100, result: 0 }]);
  sock.destroy(); echo.close();
}));

test('fake usbmuxd: Connect result 2 is "not plugged in", result 3 is "nothing listening"', () => withMux(async (mux, usbmux) => {
  const id = mux.attach(UDID_A, {});
  await assert.rejects(usbmux.connect(999, 8100), (e) => e.code === 'BAD_DEVICE');
  await assert.rejects(usbmux.connect(id, 8100), (e) => e.code === 'REFUSED');
}));

test('fake usbmuxd: replies that arrive one byte at a time still work, raw stream included', () => withMux(async (mux, usbmux) => {
  mux.splitReplies = true;
  const echo = await echoServer();
  const id = mux.attach(UDID_A, { 8100: echo.address().port });
  assert.equal((await usbmux.listDevices()).length, 1);
  const sock = await usbmux.connect(id, 8100);
  const got = await new Promise((r) => { sock.once('data', r); sock.write('x'); });
  assert.equal(got.toString(), 'echo:x');
  sock.destroy(); echo.close();
}));

test('usbmux: no usbmuxd socket gives a plain error, not a hang', async () => {
  await assert.rejects(new Usbmux({ socketPath: '/nonexistent/usbmuxd' }).listDevices(), (e) => e.code === 'NO_USBMUXD');
});

test('usbmux: a replug gives the phone a new DeviceID', () => withMux(async (mux) => {
  const first = mux.attach(UDID_A, {});
  mux.detach(UDID_A);
  assert.notEqual(mux.attach(UDID_A, {}), first);
}));

// ---- added after review ----

test('usbmux: kLibUSBMuxVersion goes on Connect only, as in the cited client; a reply that is not a plist message is refused', () => withMux(async (mux, usbmux) => {
  const echo = await echoServer();
  const id = mux.attach(UDID_A, { 8100: echo.address().port });
  await usbmux.listDevices();
  (await usbmux.listen(() => {})).close();
  (await usbmux.connect(id, 8100)).destroy();
  const sent = Object.fromEntries(mux.messages.map((m) => [m.MessageType, m]));
  assert.deepEqual(Object.keys(sent), ['ListDevices', 'Listen', 'Connect']);
  assert.equal(sent.Connect.kLibUSBMuxVersion, 3);
  assert.equal('kLibUSBMuxVersion' in sent.ListDevices, false);
  assert.equal('kLibUSBMuxVersion' in sent.Listen, false);
  for (const m of Object.values(sent)) { assert.equal(m.ProgName, 'finger'); assert.equal(typeof m.ClientVersionString, 'string'); }
  mux.replyMessageType = 1; // the old binary "result" message: its bytes are not a plist
  await assert.rejects(usbmux.listDevices(), (e) => e.code === 'PROTOCOL' && /message type 1/.test(e.message));
  echo.close();
}));
