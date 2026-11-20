// Shared test setup: a fake usbmuxd, two fake iPhones each running a fake WDA, and the
// real finger modules on top.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FakeUsbmuxd } from './fake-usbmuxd.mjs';
import { FakeWda, el, screen } from './fake-wda.mjs';
import { Usbmux } from '../src/usbmux.mjs';
import { Registry } from '../src/devices.mjs';
import { Lane } from '../src/lane.mjs';

export const UDID_A = '00008110-000A1111AAAA001E';
export const UDID_B = '00008120-000B2222BBBB002F';

export const tmpHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'finger home '));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(10); }
  throw new Error('condition not met in time');
}

// A made-up wallet app, for the money tests only. It is NOT Phantom: the real screens are
// read on the phone at M4. Tapping walks market -> stake -> confirm -> placed.
export const FAKE_WALLET = 'test.fake.wallet';
export const FAKE_PROFILE = {
  readable: true,
  bundleId: FAKE_WALLET,
  confirmLabels: [],                       // the guard takes confirm.label by itself
  screen: { width: 390, height: 844 },     // the fake phone's screen, in points
  guardRects: [[20, 700, 350, 60]],        // where the fake wallet puts Confirm
  flow: { side: { UP: 'Up', DOWN: 'Down' }, stake: { 2: '$2', 5: '$5', 10: '$10' }, review: 'Review' },
  confirm: {
    label: 'Confirm',
    fields: {
      coin: '^Coin: (BTC|SOL|ETH)$', side: '^Side: (Up|Down)$', stake: '^Stake: \\$(\\d+)$',
      round: '^Round: (.+)$', price: '^Price: (.+)$', secondsLeft: '^Ends in (\\d+):(\\d\\d)$',
    },
  },
  placed: '^Bet placed$',
};

export function fakeWallet(wda, o = {}) {
  const w = { coin: 'BTC', round: 'R1', ends: '4:30', side: null, stake: null, placed: 0, confirmTaps: 0, showPlaced: true, lie: {}, ...o };
  const inside = (x, y, r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
  const R = { up: [20, 300, 160, 60], down: [210, 300, 160, 60], s2: [20, 400, 100, 50], s5: [140, 400, 100, 50], s10: [260, 400, 100, 50], review: [20, 500, 350, 60], confirm: [20, 700, 350, 60] };
  const market = () => screen(el('StaticText', `${w.coin} Up or Down`, 20, 100, 350, 40), el('Button', 'Up', ...R.up), el('Button', 'Down', ...R.down));
  const stake = () => screen(el('Button', '$2', ...R.s2), el('Button', '$5', ...R.s5), el('Button', '$10', ...R.s10), el('Button', 'Review', ...R.review));
  const confirm = () => screen(
    el('StaticText', `Coin: ${w.lie.coin || w.coin}`, 20, 100, 350, 30),
    el('StaticText', `Side: ${w.lie.side || w.side}`, 20, 140, 350, 30),
    el('StaticText', `Stake: $${w.lie.stake || w.stake}`, 20, 180, 350, 30),
    el('StaticText', `Round: ${w.lie.round || w.round}`, 20, 220, 350, 30),
    el('StaticText', 'Price: 0.52', 20, 260, 350, 30),
    el('StaticText', `Ends in ${w.ends}`, 20, 300, 350, 30),
    el('Button', 'Confirm', ...R.confirm));
  const done = () => screen(el('StaticText', w.showPlaced ? 'Bet placed' : 'Working...', 20, 100, 350, 40));
  w.page = 'market';
  w.rect = R;
  wda.app = FAKE_WALLET;
  wda.tree = market();
  w.goConfirm = (side = 'Up', st = 2) => { w.side = side; w.stake = st; w.page = 'confirm'; wda.tree = confirm(); };
  wda.onTap = (x, y) => {
    if (w.page === 'market') {
      if (inside(x, y, R.up)) w.side = 'Up'; else if (inside(x, y, R.down)) w.side = 'Down'; else return;
      w.page = 'stake'; wda.tree = stake();
    } else if (w.page === 'stake') {
      if (inside(x, y, R.s2)) w.stake = 2; else if (inside(x, y, R.s5)) w.stake = 5; else if (inside(x, y, R.s10)) w.stake = 10;
      else if (inside(x, y, R.review)) { w.page = 'confirm'; wda.tree = confirm(); }
    } else if (w.page === 'confirm' && inside(x, y, R.confirm)) {
      w.confirmTaps++; w.placed++; w.page = 'done'; wda.tree = done();
      if (w.afterConfirm) w.afterConfirm();
    }
  };
  return w;
}

// phones: how many fake iPhones (1 or 2), plugged in and listed by the registry.
export async function rig({ phones = 2, profile = null, caps = null, now = Date.now, healthQueueMs = undefined } = {}) {
  const mux = new FakeUsbmuxd();
  await mux.start();
  const home = tmpHome();
  const udids = [UDID_A, UDID_B].slice(0, phones);
  const wdas = {};
  for (const u of udids) wdas[u] = await new FakeWda({ name: u }).start();
  const usbmux = new Usbmux({ socketPath: mux.socketPath, timeoutMs: 2000 });
  const registry = new Registry({ file: path.join(home, 'devices.json') });
  const plug = (u) => registry.attach({ deviceId: mux.attach(u, { 8100: wdas[u].port }), udid: u });
  const unplug = (u) => { const id = registry.deviceId(u); mux.detach(u); registry.detach(id); };
  udids.forEach(plug);
  const lanes = {};
  for (const u of udids) lanes[u] = new Lane({ udid: u, usbmux, registry, profile, caps, now, healthQueueMs });
  return {
    mux, home, udids, wdas, usbmux, registry, lanes, plug, unplug,
    async close() {
      for (const w of Object.values(wdas)) await w.stop().catch(() => {});
      await mux.stop();
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}
