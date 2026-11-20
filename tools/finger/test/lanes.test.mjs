// Every action, end to end: tool-level call -> lane -> WDA client -> usbmux -> fake usbmuxd
// -> fake WDA, for BOTH fake phones.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rig, UDID_A, UDID_B, sleep, until, FAKE_PROFILE, fakeWallet } from './rig.mjs';
import { el, screen } from './fake-wda.mjs';
import { Registry } from '../src/devices.mjs';
import { sniff, imageSize, decodeScreenshot, mapping, fit, LookStore } from '../src/screen.mjs';
import { fakeJpeg, fakePng, fakeHeic } from './fake-wda.mjs';
import { flatten, lines, fingerprint } from '../src/tree.mjs';
import { ROUTES } from '../src/routes.mjs';
import { LIMITS } from '../src/actions.mjs';
import { Caps } from '../src/guard.mjs';

const both = (name, fn) => {
  for (const udid of [UDID_A, UDID_B]) {
    test(`${name} [phone ${udid === UDID_A ? 1 : 2}]`, async () => {
      const r = await rig();
      try { await fn({ r, udid, lane: r.lanes[udid], wda: r.wdas[udid], other: r.wdas[udid === UDID_A ? UDID_B : UDID_A] }); } finally { await r.close(); }
    });
  }
};
const last = (wda, p) => wda.callsTo(p).at(-1);
const okStep = (res) => { assert.equal(res.ok, true, JSON.stringify(res.results)); return res; };

both('look tree: lines in points, a lookId, the foreground app', async ({ lane, wda, other, udid }) => {
  const seen = await lane.look('tree');
  assert.deepEqual(seen.tree, ['Button "Settings" @20,100,60,60', 'Button "Safari" @100,100,60,60']);
  assert.match(seen.lookId, new RegExp(`^L${udid.slice(-4)}-\\d+$`));
  assert.equal(seen.app, 'com.apple.springboard');
  assert.equal(last(wda, '/source').method, 'GET');
  assert.equal(other.calls.length, 0, 'the other phone was not touched');
});

both('look image: JPEG bytes sniffed, pixel size reported', async ({ lane, wda }) => {
  const seen = await lane.look('image');
  assert.equal(seen.image.mime, 'image/jpeg');
  assert.deepEqual([seen.image.width, seen.image.height], [1170, 2532]);
  assert.equal(sniff(Buffer.from(seen.image.base64, 'base64')), 'jpeg');
  assert.equal(seen.tree, undefined);
  assert.equal(wda.settings.screenshotQuality, 1);
});

both('look both: tree and image together', async ({ lane }) => {
  const seen = await lane.look('both');
  assert.equal(seen.tree.length, 2);
  assert.equal(seen.image.width, 1170);
});

both('tap by label: taps the centre of the element', async ({ lane, wda, other }) => {
  const res = okStep(await lane.act([{ tap: { label: 'Settings' } }]));
  assert.deepEqual(last(wda, '/wda/tap').body, { x: 50, y: 130 });
  assert.match(res.results[0].sent, /^tap sent at 50,130$/);
  assert.ok(res.after.tree, 'the look after comes back');
  assert.equal(other.callsTo('/wda/tap').length, 0);
});

both('tap by coordinate from a tree look (points)', async ({ lane, wda }) => {
  const seen = await lane.look('tree');
  okStep(await lane.act([{ tap: { x: 120, y: 125, of: seen.lookId } }]));
  assert.deepEqual(last(wda, '/wda/tap').body, { x: 120, y: 125 });
});

both('tap by coordinate from an image look (pixels become points)', async ({ lane, wda }) => {
  const seen = await lane.look('image');
  okStep(await lane.act([{ tap: { x: 300, y: 600, of: seen.lookId } }]));
  assert.deepEqual(last(wda, '/wda/tap').body, { x: 100, y: 200 }); // 1170 px across 390 points = 3 px per point
});

both('double tap', async ({ lane, wda }) => {
  okStep(await lane.act([{ double: { label: 'Safari' } }]));
  assert.deepEqual(last(wda, '/wda/doubleTap').body, { x: 130, y: 130 });
});

both('hold', async ({ lane, wda }) => {
  okStep(await lane.act([{ hold: { label: 'Safari', seconds: 2 } }]));
  assert.deepEqual(last(wda, '/wda/touchAndHold').body, { x: 130, y: 130, duration: 2 });
});

both('swipe', async ({ lane, wda }) => {
  const seen = await lane.look('tree');
  // WDA's "duration" on this route is the press BEFORE the drag, not the swipe time
  // (FBElementCommands.m:463-470), so a plain swipe sends 0 and the step has no "seconds".
  okStep(await lane.act([{ swipe: { from: [200, 700], to: [200, 200], of: seen.lookId } }]));
  assert.deepEqual(last(wda, '/wda/dragfromtoforduration').body, { fromX: 200, fromY: 700, toX: 200, toY: 200, duration: 0 });
  okStep(await lane.act([{ swipe: { from: [200, 700], to: [200, 200], holdBefore: 0.5, of: seen.lookId } }], 'none'));
  assert.equal(last(wda, '/wda/dragfromtoforduration').body.duration, 0.5);
  const old = await lane.act([{ swipe: { from: [200, 700], to: [200, 200], seconds: 3, of: seen.lookId } }], 'none');
  assert.equal(old.results[0].code, 'BAD_REQUEST');
  assert.match(old.results[0].error, /no speed setting/);
  assert.equal(wda.callsTo('/wda/dragfromtoforduration').length, 2, 'a "seconds" swipe is not sent as a long press');
});

both('type: sent as an array of characters', async ({ lane, wda }) => {
  okStep(await lane.act([{ type: { text: 'héllo 1' } }]));
  assert.deepEqual(last(wda, '/wda/keys').body, { value: ['h', 'é', 'l', 'l', 'o', ' ', '1'] });
  assert.equal(wda.typed, 'héllo 1');
});

both('home', async ({ lane, wda }) => {
  wda.app = 'com.apple.Preferences';
  const res = okStep(await lane.act([{ home: {} }]));
  assert.equal(last(wda, '/wda/homescreen').sid, null, 'home is sent without a session');
  assert.equal(res.after.app, 'com.apple.springboard');
});

both('press a hardware button', async ({ lane, wda }) => {
  okStep(await lane.act([{ press: { button: 'volumeup' } }]));
  assert.deepEqual(last(wda, '/wda/pressButton').body, { name: 'volumeup' });
  const bad = await lane.act([{ press: { button: 'power' } }]);
  assert.equal(bad.ok, false);
  assert.equal(wda.callsTo('/wda/pressButton').length, 1);
});

both('open and close an app', async ({ lane, wda }) => {
  const opened = okStep(await lane.act([{ open: { bundleId: 'com.apple.Preferences' } }]));
  assert.equal(opened.after.app, 'com.apple.Preferences');
  const closed = okStep(await lane.act([{ close: { bundleId: 'com.apple.Preferences' } }]));
  assert.equal(closed.results[0].sent, 'com.apple.Preferences closed');
  assert.equal(closed.after.app, 'com.apple.springboard');
});

both('wait', async ({ lane }) => {
  const t = Date.now();
  okStep(await lane.act([{ wait: { ms: 60 } }], 'none'));
  assert.ok(Date.now() - t >= 55);
});

both('pop-up: only alert steps are allowed, then the rest runs', async ({ lane, wda }) => {
  wda.alert = 'Allow notifications?';
  const blocked = await lane.act([{ tap: { label: 'Settings' } }]);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.results[0].code, 'ALERT_OPEN');
  assert.equal(blocked.alert, 'Allow notifications?');
  assert.equal(wda.callsTo('/wda/tap').length, 0);
  const res = okStep(await lane.act([{ alert: { dismiss: true } }, { tap: { label: 'Settings' } }]));
  assert.equal(res.alert, null);
  assert.equal(wda.callsTo('/alert/dismiss').length, 1);
  wda.alert = 'Again?';
  okStep(await lane.act([{ alert: { accept: true, name: 'OK' } }]));
  assert.deepEqual(last(wda, '/alert/accept').body, { name: 'OK' });
});

both('steps stop at the first that fails', async ({ lane, wda }) => {
  const res = await lane.act([{ tap: { label: 'Settings' } }, { tap: { label: 'Nope' } }, { tap: { label: 'Safari' } }]);
  assert.equal(res.ok, false);
  assert.deepEqual(res.results.map((x) => x.ok), [true, false]);
  assert.equal(res.results[1].code, 'NO_SUCH_LABEL');
  assert.equal(wda.callsTo('/wda/tap').length, 1);
});

both('a locked phone refuses everything and says "unlock it"', async ({ lane, wda, r, udid }) => {
  wda.locked = true;
  await assert.rejects(lane.act([{ tap: { label: 'Settings' } }]), (e) => e.code === 'LOCKED' && /unlock it/.test(e.message));
  assert.equal(lane.status().state, 'LOCKED');
  assert.equal(wda.callsTo('/wda/tap').length, 0);
  assert.equal(wda.callsTo('/wda/unlock').length, 0, 'finger never tries to unlock');
  assert.ok(r.registry.label(udid).includes(udid.slice(-4)));
});

both('coordinate tap refused when the screen changed since the look', async ({ lane, wda }) => {
  const seen = await lane.look('tree');
  wda.tree = screen(el('Button', 'Buy now', 20, 100, 60, 60));
  const res = await lane.act([{ tap: { x: 50, y: 130, of: seen.lookId } }]);
  assert.equal(res.results[0].code, 'SCREEN_CHANGED');
  assert.equal(wda.callsTo('/wda/tap').length, 0);
});

both('coordinate tap refused without a look, with another phone\'s look, or an ambiguous label', async ({ lane, wda, r, udid }) => {
  assert.equal((await lane.act([{ tap: { x: 5, y: 5 } }])).results[0].code, 'NO_SUCH_LOOK');
  const otherLane = r.lanes[udid === UDID_A ? UDID_B : UDID_A];
  const theirs = await otherLane.look('tree');
  assert.equal((await lane.act([{ tap: { x: 5, y: 5, of: theirs.lookId } }])).results[0].code, 'NO_SUCH_LOOK');
  wda.tree = screen(el('Button', 'OK', 0, 0, 10, 10), el('Button', 'OK', 50, 50, 10, 10));
  assert.equal((await lane.act([{ tap: { label: 'OK' } }])).results[0].code, 'AMBIGUOUS_LABEL');
  assert.equal(wda.callsTo('/wda/tap').length, 0);
});

both('image look refused when the image does not match the screen shape (rotated)', async ({ lane, wda }) => {
  wda.windowSize = { width: 844, height: 390 };
  await assert.rejects(lane.look('image'), (e) => e.code === 'BAD_MAPPING');
});

both('cable pulled: fails fast, then works again after replug with the same alias', async ({ lane, wda, r, udid }) => {
  const alias = r.registry.list().find((d) => d.udid === udid).alias;
  r.unplug(udid);
  await assert.rejects(lane.look('tree'), (e) => e.code === 'NOT_PLUGGED' && /not plugged in/.test(e.message));
  assert.equal(lane.status().state, 'ABSENT');
  r.plug(udid);
  assert.equal((await lane.look('tree')).tree.length, 2);
  assert.equal(r.registry.list().find((d) => d.udid === udid).alias, alias);
  assert.equal(lane.status().state, 'READY');
});

both('WDA not started: refused with a plain line, lane says STARTING', async ({ lane, wda }) => {
  await wda.die();
  await assert.rejects(lane.look('tree'), (e) => e.code === 'WDA_NOT_RUNNING');
  assert.equal(lane.status().state, 'STARTING');
  await wda.revive();
  assert.equal((await lane.look('tree')).tree.length, 2);
});

both('WDA dies in the middle of a command: the command fails, the next one works after it is back', async ({ lane, wda }) => {
  wda.delays['/source'] = 150;
  const p = lane.look('tree');
  await sleep(60);
  await wda.die();
  await assert.rejects(p);
  await wda.revive();
  wda.delays = {};
  assert.equal((await lane.look('tree')).tree.length, 2);
  assert.equal(wda.sessionsMade, 0, 'a look needs no session');
  await lane.act([{ tap: { label: 'Settings' } }]);
  assert.equal(wda.sessionsMade, 1);
});

both('health check: only when idle, never during a slow /source, and it goes through the lane', async ({ lane, wda }) => {
  wda.delays['/source'] = 200;
  const p = lane.look('tree');
  await sleep(30);
  assert.equal(lane.healthTick(), false, 'busy lane: no health check queued');
  await p;
  assert.equal(wda.callsTo('/status').length, 0);
  assert.equal(lane.healthTick(), true);
  await until(() => lane.idle);
  assert.equal(wda.callsTo('/status').length, 1);
  assert.equal(wda.callsTo('/wda/locked').length, 2, 'one for the look, one for the health check: it also goes through the command queue');
  assert.equal(wda.maxInFlight, 1);
  assert.equal(lane.status().state, 'READY');
});

both('health check: three failures in a row mark the lane DEAD, one success brings it back', async ({ lane, wda }) => {
  wda.html = true;
  for (let i = 0; i < 3; i++) { lane.healthTick(); await until(() => lane.idle); }
  assert.equal(lane.status().state, 'DEAD');
  wda.html = false;
  lane.healthTick(); await until(() => lane.idle);
  assert.equal(lane.status().state, 'READY');
});

test('two phones at once: a slow phone does not hold up the other; each lane is strictly serial', async () => {
  const r = await rig();
  try {
    r.wdas[UDID_A].delays['/source'] = 300;
    const t = Date.now();
    const slow = Promise.all([r.lanes[UDID_A].look('tree'), r.lanes[UDID_A].look('tree')]);
    await r.lanes[UDID_B].act([{ tap: { label: 'Safari' } }]);
    const fast = Date.now() - t;
    await slow;
    assert.ok(fast < 250, `phone 2 took ${fast} ms while phone 1 was slow`);
    assert.ok(Date.now() - t >= 600, 'phone 1 ran its two looks one after the other');
    assert.equal(r.wdas[UDID_A].maxInFlight, 1);
    assert.equal(r.wdas[UDID_A].callsTo('/wda/tap').length, 0);
    assert.equal(r.wdas[UDID_B].callsTo('/wda/tap').length, 1);
  } finally { await r.close(); }
});

test('registry: alias is bound on first sight and survives a replug in swapped order and a restart', async () => {
  const r = await rig();
  try {
    assert.deepEqual(r.registry.list().map((d) => [d.alias, d.udid]), [[1, UDID_A], [2, UDID_B]]);
    r.unplug(UDID_A); r.unplug(UDID_B);
    r.plug(UDID_B); r.plug(UDID_A); // B first this time
    assert.deepEqual(r.registry.list().map((d) => [d.alias, d.udid]), [[1, UDID_A], [2, UDID_B]]);
    assert.equal(r.registry.resolve('1'), UDID_A);
    assert.equal(r.registry.resolve(2), UDID_B);
    assert.equal(r.registry.resolve(UDID_B.toLowerCase()), UDID_B, 'UDIDs match whatever the letter case');
    const again = new Registry({ file: path.join(r.home, 'devices.json') });
    assert.deepEqual(again.list().map((d) => [d.alias, d.udid, d.attached]), [[1, UDID_A, false], [2, UDID_B, false]]);
    // The taps really go to the right phone after the swap.
    await r.lanes[UDID_A].act([{ tap: { label: 'Settings' } }], 'none');
    assert.equal(r.wdas[UDID_A].callsTo('/wda/tap').length, 1);
    assert.equal(r.wdas[UDID_B].callsTo('/wda/tap').length, 0);
  } finally { await r.close(); }
});

test('registry: the phone may be left out only when exactly one is plugged in; a buy needs the full UDID', async () => {
  const r = await rig();
  try {
    assert.throws(() => r.registry.resolve(undefined), (e) => e.code === 'DEVICE_REQUIRED');
    assert.throws(() => r.registry.resolve('9'), (e) => e.code === 'UNKNOWN_DEVICE');
    assert.throws(() => r.registry.resolve('1', { forBuy: true }), (e) => e.code === 'BUY_NEEDS_UDID');
    assert.throws(() => r.registry.resolve(undefined, { forBuy: true }), (e) => e.code === 'BUY_NEEDS_UDID');
    assert.equal(r.registry.resolve(UDID_A, { forBuy: true }), UDID_A);
    r.unplug(UDID_B);
    assert.equal(r.registry.resolve(undefined), UDID_A);
    assert.equal(r.registry.label(UDID_A), 'iPhone 1 (...001E)');
  } finally { await r.close(); }
});

test('gestures near the buy button: tap, double, hold, coordinate tap and swipe across it are all refused', async () => {
  const r = await rig({ phones: 1, profile: FAKE_PROFILE });
  try {
    const lane = r.lanes[UDID_A], wda = r.wdas[UDID_A];
    const w = fakeWallet(wda);
    w.goConfirm('Up', 2);
    const seen = await lane.look('tree');
    const tries = [
      { tap: { label: 'Confirm' } },
      { double: { label: 'Confirm' } },
      { hold: { label: 'Confirm', seconds: 1 } },
      { tap: { x: 100, y: 720, of: seen.lookId } },
      { tap: { x: 100, y: 695, of: seen.lookId } },                       // inside the margin around it
      { swipe: { from: [100, 600], to: [100, 800], of: seen.lookId } },   // straight through it
      { swipe: { from: [5, 730], to: [385, 730], of: seen.lookId } },     // across it sideways
    ];
    for (const step of tries) {
      const res = await lane.act([step], 'none');
      assert.equal(res.results[0].code, 'TOUCHES_CONFIRM', JSON.stringify(step));
    }
    assert.equal(w.confirmTaps, 0);
    assert.equal(wda.callsTo('/wda/tap').length + wda.callsTo('/wda/doubleTap').length + wda.callsTo('/wda/touchAndHold').length + wda.callsTo('/wda/dragfromtoforduration').length, 0);
    // On the confirm screen even a gesture that stays clear of the button is refused.
    assert.equal((await lane.act([{ swipe: { from: [100, 300], to: [100, 500], of: seen.lookId } }], 'none')).results[0].code, 'CONFIRM_SCREEN');
    assert.equal((await lane.act([{ tap: { label: 'Coin: BTC' } }], 'none')).results[0].code, 'CONFIRM_SCREEN');
    assert.equal(wda.callsTo('/wda/tap').length + wda.callsTo('/wda/dragfromtoforduration').length, 0);
    // On the market screen a swipe that stays clear of where the button sits is fine.
    fakeWallet(wda);
    const market = await lane.look('tree');
    assert.equal((await lane.act([{ swipe: { from: [100, 300], to: [100, 500], of: market.lookId } }], 'none')).ok, true);
  } finally { await r.close(); }
});

test('typing inside the wallet: digits and a decimal point only', async () => {
  const r = await rig({ phones: 1, profile: FAKE_PROFILE });
  try {
    const lane = r.lanes[UDID_A], wda = r.wdas[UDID_A];
    fakeWallet(wda);
    assert.equal((await lane.act([{ type: { text: 'apple banana cherry' } }], 'none')).results[0].code, 'TYPE_BLOCKED');
    assert.equal((await lane.act([{ type: { text: '12.50' } }], 'none')).ok, true);
    assert.equal(wda.typed, '12.50');
  } finally { await r.close(); }
});

test('screen: magic bytes, sizes, and HEIC or unknown bytes are refused', () => {
  assert.equal(sniff(fakeJpeg(10, 20)), 'jpeg');
  assert.equal(sniff(fakePng(10, 20)), 'png');
  assert.equal(sniff(fakeHeic()), 'heic');
  assert.equal(sniff(Buffer.from('<html>not an image</html>')), null);
  assert.deepEqual(imageSize(fakeJpeg(1170, 2532), 'jpeg'), { width: 1170, height: 2532 });
  assert.deepEqual(imageSize(fakePng(750, 1334), 'png'), { width: 750, height: 1334 });
  assert.throws(() => decodeScreenshot(fakeHeic().toString('base64')), (e) => e.code === 'BAD_IMAGE' && /heic/.test(e.message));
  assert.throws(() => decodeScreenshot(Buffer.from('<html>hello world</html>').toString('base64')), (e) => e.code === 'BAD_IMAGE');
  assert.throws(() => decodeScreenshot(''), (e) => e.code === 'BAD_IMAGE');
});

test('screen: X and Y ratios are worked out separately and refused when they differ by more than 1%', () => {
  assert.deepEqual(mapping({ width: 1170, height: 2532 }, { width: 390, height: 844 }), { sx: 3, sy: 3 });
  assert.ok(mapping({ width: 1170, height: 2540 }, { width: 390, height: 844 }));
  assert.throws(() => mapping({ width: 1170, height: 2532 }, { width: 390, height: 780 }), (e) => e.code === 'BAD_MAPPING');
  assert.throws(() => mapping({ width: 1170, height: 2532 }, {}), (e) => e.code === 'BAD_MAPPING');
});

test('screen: the downscale path uses the resampler it is given, and says so when there is none', async () => {
  const shot = decodeScreenshot(fakeJpeg(1170, 2532).toString('base64'));
  const none = await fit(shot, 900, null);
  assert.equal(none.downscaled, false);
  assert.equal(none.width, 1170);
  let asked = null;
  const small = await fit(shot, 900, async (bytes, maxPx) => { asked = maxPx; return fakeJpeg(416, 900); });
  assert.equal(asked, 900);
  assert.deepEqual([small.width, small.height, small.downscaled], [416, 900, true]);
  assert.deepEqual(mapping(small, { width: 390, height: 844 }).sx.toFixed(2), '1.07');
  await assert.rejects(fit(shot, 900, async () => Buffer.from('garbage bytes here')), (e) => e.code === 'BAD_IMAGE');
  assert.equal((await fit(decodeScreenshot(fakePng(300, 600).toString('base64')), 900, async () => { throw new Error('not called'); })).downscaled, false);
});

test('screen: a look older than the limit is refused; old looks are dropped', async () => {
  let t = 1000;
  const r = await rig({ phones: 1, now: () => t });
  try {
    const lane = r.lanes[UDID_A];
    const seen = await lane.look('tree');
    t += 16000;
    assert.equal((await lane.act([{ tap: { x: 50, y: 130, of: seen.lookId } }], 'none')).results[0].code, 'STALE_LOOK');
    assert.equal(r.wdas[UDID_A].callsTo('/wda/tap').length, 0);
    const store = new LookStore({ keep: 2 });
    const a = store.add({}); store.add({}); store.add({});
    assert.equal(store.get(a), null);
  } finally { await r.close(); }
});

test('tree: only elements with text and a real rect are kept; the fingerprint follows the text', () => {
  const root = screen(el('Other', '', 0, 0, 10, 10), el('Button', 'Go', 1.4, 2.6, 30, 40), el('TextField', 'Amount', 0, 50, 100, 30, { value: '5' }), el('Button', 'Hidden', 0, 0, 0, 0));
  const els = flatten(root);
  assert.deepEqual(lines(els), ['Button "Go" @1,3,30,40', 'TextField "Amount" ="5" @0,50,100,30']);
  const changed = flatten(screen(el('Button', 'Go', 1.4, 2.6, 30, 40), el('TextField', 'Amount', 0, 50, 100, 30, { value: '6' })));
  assert.notEqual(fingerprint(els), fingerprint(changed));
});

both('WDA restarted and lost its settings (screenshots back to HEIC): a new session is made and the picture is JPEG again', async ({ lane, wda }) => {
  assert.equal((await lane.look('image')).image.mime, 'image/jpeg');
  wda.settings = {}; // what a WDA restart does; the old session id still looks valid to finger
  const seen = await lane.look('image');
  assert.equal(seen.image.mime, 'image/jpeg');
  assert.equal(wda.sessionsMade, 2);
});

// ---- added after review: each of these failed before its fix ----

const wallet = async (fn, { profile = FAKE_PROFILE, caps = null } = {}) => {
  const r = await rig({ phones: 1, profile, caps });
  try { await fn({ r, lane: r.lanes[UDID_A], wda: r.wdas[UDID_A], w: fakeWallet(r.wdas[UDID_A]) }); } finally { await r.close(); }
};
const sentTouches = (wda) => ['/wda/tap', '/wda/doubleTap', '/wda/touchAndHold', '/wda/dragfromtoforduration'].reduce((n, p) => n + wda.callsTo(p).length, 0);

test('race: the wallet moves to its confirm screen while the phone is holding a tap: the tap was refused before it was sent', () => wallet(async ({ lane, wda, w }) => {
  const seen = await lane.look('tree');                     // the market screen: nothing at 100,720
  assert.ok(!seen.tree.some((l) => /Confirm/.test(l)));
  wda.delays['/wda/tap'] = 300;                             // WDA holds the tap (waiting for the app to go idle)
  setTimeout(() => w.goConfirm('Up', 2), 100);              // ...and the app moves on meanwhile
  for (const step of [{ tap: { x: 100, y: 720, of: seen.lookId } }, { double: { x: 100, y: 720, of: seen.lookId } }, { hold: { x: 100, y: 720, of: seen.lookId } },
    { swipe: { from: [100, 600], to: [100, 800], of: seen.lookId } }]) {
    const res = await lane.act([step], 'none');
    assert.equal(res.results[0].code, 'TOUCHES_CONFIRM', JSON.stringify(res.results));
  }
  await sleep(350);
  assert.equal(sentTouches(wda), 0);
  assert.equal(w.confirmTaps, 0);
  assert.equal(w.placed, 0);
}));

test('wallet guard: a button with no label of its own (the word sits in a child text) is protected as a whole', () => wallet(async ({ lane, wda, w }) => {
  // Moved away from the recorded rectangle, so only the reading of the tree can protect it.
  wda.tree = screen(
    el('StaticText', 'Up or Down', 20, 100, 350, 30),
    { type: 'Button', label: '', name: '', value: null, rect: { x: 20, y: 500, width: 350, height: 60 }, children: [el('StaticText', 'Confirm', 165, 520, 60, 20)] });
  const seen = await lane.look('tree');
  for (const [x, y] of [[40, 530], [360, 505], [195, 530]]) {
    assert.equal((await lane.act([{ tap: { x, y, of: seen.lookId } }], 'none')).results[0].code, 'TOUCHES_CONFIRM', `${x},${y}`);
  }
  assert.equal(sentTouches(wda), 0);
}));

test('wallet guard: "Confirm Bet", "CONFIRM" and a hidden Confirm are all the confirm button; a profile with no confirmLabels still guards', () => wallet(async ({ lane, wda }) => {
  for (const [label, extra] of [['Confirm Bet', {}], ['CONFIRM', {}], ['Confirm', { isVisible: '0' }]]) {
    wda.tree = screen(el('StaticText', 'Something', 20, 100, 350, 30), el('Button', label, 20, 500, 350, 60, extra));
    const seen = await lane.look('tree');
    const res = await lane.act([{ tap: { x: 100, y: 530, of: seen.lookId } }], 'none');
    assert.equal(res.results[0].code, 'TOUCHES_CONFIRM', label);
  }
  assert.equal(sentTouches(wda), 0);
}, { profile: { ...FAKE_PROFILE, confirmLabels: undefined } }));

test('wallet guard: a phone whose screen is not the size the wallet was recorded on is not touched inside the wallet', () => wallet(async ({ lane, wda }) => {
  wda.windowSize = { width: 430, height: 932 };
  const res = await lane.act([{ tap: { label: 'Up' } }], 'none');
  assert.equal(res.results[0].code, 'WALLET_SCREEN_UNKNOWN');
  assert.equal(sentTouches(wda), 0);
}));

test('wallet guard: a pop-up inside the wallet is only ever dismissed', () => wallet(async ({ lane, wda }) => {
  for (const step of [{ alert: { accept: true } }, { alert: { accept: true, name: 'Confirm' } }, { alert: { dismiss: true, name: 'Confirm' } }]) {
    wda.alert = 'Place this bet?';
    const res = await lane.act([step], 'none');
    assert.equal(res.results[0].code, 'ALERT_BLOCKED', JSON.stringify(step));
  }
  assert.equal(wda.callsTo('/alert/accept').length + wda.callsTo('/alert/dismiss').length, 0);
  assert.equal(wda.alert, 'Place this bet?');
  assert.equal((await lane.act([{ alert: { dismiss: true } }], 'none')).ok, true);
  assert.equal(wda.alert, null);
}));

const REAL_PROFILE = JSON.parse(fs.readFileSync(new URL('../profiles/phantom.json', import.meta.url), 'utf8'));

test('the shipped phantom.json: inside the wallet nothing is tapped, nothing but digits is typed, no pop-up is accepted', async () => {
  const home = fs.mkdtempSync('/tmp/finger real profile ');
  const caps = new Caps({ file: path.join(home, 'caps.json') });
  const r = await rig({ phones: 1, profile: REAL_PROFILE, caps });
  try {
    const lane = r.lanes[UDID_A], wda = r.wdas[UDID_A];
    const w = fakeWallet(wda);
    wda.app = REAL_PROFILE.bundleId;
    w.goConfirm('Up', 2);
    assert.equal((await lane.look('tree')).tree.length, 7, 'looking at the wallet is fine');
    const seen = await lane.look('tree');
    for (const step of [{ tap: { label: 'Confirm' } }, { double: { label: 'Confirm' } }, { hold: { label: 'Confirm' } }, { tap: { x: 195, y: 730, of: seen.lookId } },
      { swipe: { from: [30, 730], to: [360, 730], of: seen.lookId } }, { tap: { label: 'Coin: BTC' } }]) {
      assert.equal((await lane.act([step], 'none')).results[0].code, 'WALLET_NOT_RECORDED', JSON.stringify(step));
    }
    assert.equal((await lane.act([{ type: { text: 'apple banana cherry dog eagle fig grape hat ink jam kite lemon' } }], 'none')).results[0].code, 'TYPE_BLOCKED');
    wda.alert = 'Confirm?';
    assert.equal((await lane.act([{ alert: { accept: true } }], 'none')).results[0].code, 'ALERT_BLOCKED');
    wda.alert = null;
    assert.equal(sentTouches(wda) + wda.callsTo('/wda/keys').length + wda.callsTo('/alert/accept').length, 0);
    assert.equal(w.confirmTaps, 0);
    // Outside the wallet the phone is worked as before.
    wda.app = 'com.apple.Preferences';
    const out = await lane.act([{ tap: { label: 'Confirm' } }], 'none');
    assert.equal(out.ok, true, JSON.stringify(out));
    // Wallet setup, switched on by Alex on the page: taps go through (the wallet is empty), typing stays digits only.
    fakeWallet(wda);
    wda.app = REAL_PROFILE.bundleId;
    caps.setWalletSetup(true);
    assert.equal((await lane.act([{ tap: { label: 'BTC Up or Down' } }], 'none')).ok, true);
    assert.equal((await lane.act([{ type: { text: 'apple banana' } }], 'none')).results[0].code, 'TYPE_BLOCKED');
    caps.setWalletSetup(false);
    assert.equal((await lane.act([{ tap: { label: 'BTC Up or Down' } }], 'none')).results[0].code, 'WALLET_NOT_RECORDED');
  } finally { await r.close(); fs.rmSync(home, { recursive: true, force: true }); }
});

both('coordinates off the screen and numbers that are not numbers are refused, and nothing is sent', async ({ lane, wda }) => {
  const seen = await lane.look('tree');
  const of = seen.lookId;
  for (const step of [{ tap: { x: -50, y: 99999, of } }, { tap: { x: 1e15, y: 5, of } }, { tap: { x: 391, y: 5, of } }, { tap: { x: 5, y: 845, of } }, { hold: { x: 5000, y: 5000, of } },
    { swipe: { from: [-9999, -9999], to: [50000, 50000], of } }, { swipe: { from: [10, 10], to: [10, 900], of } }]) {
    assert.equal((await lane.act([step], 'none')).results[0].code, 'OFF_SCREEN', JSON.stringify(step));
  }
  for (const step of [{ hold: { label: 'Safari', seconds: true } }, { hold: { label: 'Safari', seconds: '5' } }, { hold: { label: 'Safari', seconds: null } }, { hold: { label: 'Safari', seconds: 11 } },
    { hold: { label: 'Safari', seconds: 0 } }, { swipe: { from: [1, 1], to: [5, 5], holdBefore: null, of } }, { swipe: { from: [1, 1], to: [5, 5], holdBefore: '1', of } },
    { swipe: { from: [1, 1], to: [5, 5], holdBefore: 11, of } }, { wait: { ms: '100' } }, { wait: { ms: true } }, { wait: { ms: 10001 } }, { wait: {} }]) {
    assert.equal((await lane.act([step], 'none')).results[0].code, 'BAD_REQUEST', JSON.stringify(step));
  }
  assert.equal(wda.callsTo('/wda/tap').length + wda.callsTo('/wda/touchAndHold').length + wda.callsTo('/wda/dragfromtoforduration').length, 0);
  okStep(await lane.act([{ tap: { x: 390, y: 844, of } }, { hold: { label: 'Safari', seconds: 10 } }, { wait: { ms: 0 } }], 'none')); // the edges themselves are fine
});

both('at most 20 steps in one call', async ({ lane, wda }) => {
  const step = { wait: { ms: 0 } };
  await assert.rejects(lane.act(Array(LIMITS.maxSteps + 1).fill(step), 'none'), (e) => e.code === 'BAD_REQUEST' && /1 to 20/.test(e.message));
  await assert.rejects(lane.act([], 'none'), (e) => e.code === 'BAD_REQUEST');
  assert.equal((await lane.act(Array(20).fill(step), 'none')).results.length, 20);
});

both('a look is capped: a huge tree is cut with a line that says so, and a picture over the limit is refused', async ({ lane, wda }) => {
  wda.tree = screen(...Array.from({ length: 2000 }, (_, i) => el('StaticText', `Row number ${i} with a fairly long label to make it weigh something`, 0, i, 300, 20)));
  const seen = await lane.look('tree');
  assert.equal(seen.tree.length, LIMITS.treeMaxLines + 1);
  assert.equal(seen.tree.at(-1), `... ${2000 - LIMITS.treeMaxLines} more lines not shown`);
  assert.ok(Buffer.byteLength(JSON.stringify(seen)) < LIMITS.treeMaxBytes + 2000);
  wda.tree = screen(...Array.from({ length: 300 }, (_, i) => el('StaticText', 'x'.repeat(1000) + i, 0, i, 300, 20)));
  const wide = await lane.look('tree');
  assert.ok(Buffer.byteLength(JSON.stringify(wide.tree)) <= LIMITS.treeMaxBytes, 'bytes are capped as well as lines');
  assert.match(wide.tree.at(-1), /more lines not shown$/);
  // A picture heavier than the limit (a real JPEG header with 3 MB behind it).
  const realRoute = wda.route.bind(wda);
  wda.route = (m, p, b, q) => (p === '/screenshot' ? Buffer.concat([fakeJpeg(1170, 2532), Buffer.alloc(3 * 1000 * 1000)]).toString('base64') : realRoute(m, p, b, q));
  await assert.rejects(lane.look('image'), (e) => e.code === 'IMAGE_TOO_BIG');
});

both('hidden and switched-off elements: hidden ones are not listed and cannot be tapped by label; switched-off ones say so', async ({ lane, wda }) => {
  wda.tree = screen(el('Button', 'Old screen', 20, 100, 60, 60, { isVisible: '0', isEnabled: '1' }), el('Button', 'Send', 100, 100, 60, 60, { isVisible: '1', isEnabled: '0' }),
    el('Button', 'Next', 200, 100, 60, 60, { isVisible: '1', isEnabled: '1' }), el('Button', 'Next', 200, 300, 60, 60, { isVisible: '0', isEnabled: '1' }));
  const seen = await lane.look('tree');
  assert.deepEqual(seen.tree, ['Button "Send" @100,100,60,60 (off)', 'Button "Next" @200,100,60,60']);
  assert.equal((await lane.act([{ tap: { label: 'Old screen' } }], 'none')).results[0].code, 'NO_SUCH_LABEL');
  okStep(await lane.act([{ tap: { label: 'Next' } }], 'none')); // the hidden twin does not make it ambiguous
  assert.deepEqual(last(wda, '/wda/tap').body, { x: 230, y: 130 });
});

test('health check: WDA alive but its command queue stuck goes DEAD (/status alone would have said READY for ever)', async () => {
  const r = await rig({ phones: 1, healthQueueMs: 60 });
  try {
    const lane = r.lanes[UDID_A], wda = r.wdas[UDID_A];
    await lane.look('tree');
    assert.equal(lane.status().state, 'READY');
    wda.delays['/wda/locked'] = 5000;            // the main queue is stuck behind this
    for (let i = 0; i < 3; i++) { assert.equal(lane.healthTick(), true); await until(() => lane.idle); }
    assert.equal(wda.callsTo('/status').length, 3, '/status is standalone: it kept answering the whole time');
    assert.equal(lane.status().state, 'DEAD');
    assert.match(lane.status().lastError, /command queue is not answering/);
  } finally { await r.close(); }
});

test('health check: a locked phone shows as LOCKED from the health check alone, and READY again when unlocked', async () => {
  const r = await rig({ phones: 1 });
  try {
    const lane = r.lanes[UDID_A], wda = r.wdas[UDID_A];
    wda.locked = true;
    lane.healthTick(); await until(() => lane.idle);
    assert.equal(lane.status().state, 'LOCKED');
    wda.locked = false;
    lane.healthTick(); await until(() => lane.idle);
    assert.equal(lane.status().state, 'READY');
  } finally { await r.close(); }
});

test('a step the phone never answers: the result says it may have landed, nothing more is asked of the phone, the lane is not READY', async () => {
  const r = await rig({ phones: 1 });
  const keep = ROUTES.tap.timeoutMs;
  try {
    const lane = r.lanes[UDID_A], wda = r.wdas[UDID_A];
    await lane.look('tree');
    ROUTES.tap.timeoutMs = 120;
    wda.delays['/wda/tap'] = 2000;
    const before = wda.callsTo('/alert/text').length;
    const t = Date.now();
    const res = await lane.act([{ tap: { label: 'Settings' } }, { tap: { label: 'Safari' } }], 'tree');
    const took = Date.now() - t;
    assert.equal(res.ok, false);
    assert.equal(res.results[0].code, 'NO_ANSWER');
    assert.match(res.results[0].error, /may or may not have landed: look before repeating/);
    assert.equal(res.results.length, 1);
    assert.ok(took < 1500, `took ${took} ms: no second wait for a pop-up check or a look`);
    assert.equal(wda.callsTo('/alert/text').length, before + 1, 'only the check before the steps (a hung phone would have held a second one too)');
    assert.equal(wda.callsTo('/source').length, 2, 'the first look and the label lookup; no look afterwards');
    assert.equal(res.after.code, 'NOT_LOOKED');
    assert.notEqual(lane.status().state, 'READY');
  } finally { ROUTES.tap.timeoutMs = keep; await r.close(); }
});
