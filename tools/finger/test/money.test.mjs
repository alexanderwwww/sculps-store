// The money guard, the ledger and finger_buy, driven end to end through a lane and the
// fake WDA showing a made-up wallet (rig.mjs FAKE_PROFILE; it is not Phantom).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rig, UDID_A, UDID_B, FAKE_PROFILE, FAKE_WALLET, fakeWallet } from './rig.mjs';
import { Caps, DEFAULT_CAPS, checkBuy, liveBlockers } from '../src/guard.mjs';
import { Ledger, athensDate } from '../src/ledger.mjs';
import { buy } from '../src/buy.mjs';
import { CommandJournal } from '../src/journal.mjs';

const LIVE = { mode: 'LIVE', perBetCap: 10, dailyCap: 20, dailyLossLimit: 20, lossStop: 3, minSecondsLeft: 60, maxStake: 10, gate: { set: true } };
const T0 = Date.parse('2026-11-20T10:00:00Z');

async function setup({ phones = 1, caps = LIVE, profile = FAKE_PROFILE, wallet = {} } = {}) {
  const clock = { t: T0 };
  const now = () => clock.t;
  const r = await rig({ phones, profile, now });
  const capsStore = new Caps({ file: path.join(r.home, 'caps.json') });
  capsStore.write({ ...DEFAULT_CAPS, ...caps });
  const ledger = new Ledger({ file: path.join(r.home, 'ledger.jsonl'), now });
  const wallets = {};
  for (const u of r.udids) wallets[u] = fakeWallet(r.wdas[u], wallet);
  const req = (over = {}) => ({ udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R1', createdAt: clock.t, ...over });
  const go = (over = {}, udid = (over.udid || UDID_A)) => buy(req(over), { lane: r.lanes[udid], caps: capsStore, ledger, profile, now });
  return { r, clock, now, capsStore, ledger, wallets, w: wallets[UDID_A], wda: r.wdas[UDID_A], req, go, close: () => r.close() };
}
const refused = (code) => (e) => { assert.equal(e.refused, true, e.stack); assert.equal(e.code, code, e.message); return true; };
const run = (name, opts, fn) => test(name, async () => { const s = await setup(opts); try { await fn(s); } finally { await s.close(); } });

run('buy: the whole sequence places one bet and writes reservation then outcome', {}, async ({ go, w, ledger, wda }) => {
  const res = await go();
  assert.equal(res.ok, true, res.message);
  assert.equal(w.placed, 1);
  assert.deepEqual(res.read, { coin: 'BTC', side: 'UP', stake: 2, round: 'R1', price: '0.52', secondsLeft: 270 });
  const rows = ledger.rows();
  assert.deepEqual(rows.map((x) => x.type), ['reservation', 'outcome']);
  assert.equal(rows[0].udid, UDID_A);
  assert.equal(rows[0].date, '2026-11-20');
  assert.equal(rows[1].result, 'placed');
  assert.deepEqual(wda.callsTo('/wda/tap').at(-1).body, { x: 195, y: 730 }, 'confirm is tapped at its centre');
  assert.equal(ledger.summary().spentToday, 2);
});

run('guard: over the per-bet cap is refused before anything is touched', { caps: { ...LIVE, perBetCap: 5 } }, async ({ go, w, wda, ledger }) => {
  await assert.rejects(go({ stake: 10 }), refused('OVER_BET_CAP'));
  assert.equal(wda.calls.length, 0);
  assert.equal(w.placed, 0);
  assert.equal(ledger.rows().length, 0);
});

run('guard: a stake that is not $2, $5 or $10 is refused', {}, async ({ go, wda }) => {
  await assert.rejects(go({ stake: 3 }), refused('BAD_STAKE'));
  await assert.rejects(go({ stake: 20 }), refused('BAD_STAKE'));
  await assert.rejects(go({ stake: '2' }), refused('BAD_STAKE'));
  assert.equal(wda.calls.length, 0);
});

run('guard: only $2 is unlocked until the gate unlocks more', { caps: { ...LIVE, maxStake: 2 } }, async ({ go }) => {
  await assert.rejects(go({ stake: 5 }), refused('STAKE_LOCKED'));
});

run('guard: daily cap counts what was bet today and refuses the bet that would cross it', { caps: { ...LIVE, dailyCap: 5 } }, async ({ go, w, wda, ledger }) => {
  assert.equal((await go({ round: 'R1' })).ok, true);
  fakeWallet(wda, { round: 'R2' });
  assert.equal((await go({ round: 'R2' })).ok, true);
  const w3 = fakeWallet(wda, { round: 'R3' });
  await assert.rejects(go({ round: 'R3' }), refused('OVER_DAILY_CAP')); // 2 + 2 + 2 > 5
  assert.equal(w3.page, 'market', 'refused before the wallet was touched');
  assert.equal(ledger.summary().spentToday, 4);
});

run('guard: a blank daily cap, loss limit, loss stop, time threshold or gate blocks every buy', {}, async ({ go, capsStore, wda }) => {
  for (const k of ['dailyCap', 'dailyLossLimit', 'lossStop', 'minSecondsLeft', 'gate']) {
    capsStore.write({ ...DEFAULT_CAPS, ...LIVE, [k]: null });
    await assert.rejects(go(), refused('LIVE_BLOCKED'), k);
  }
  assert.equal(wda.calls.length, 0);
});

run('guard: PAPER mode never places a bet', { caps: { ...LIVE, mode: 'PAPER' } }, async ({ go, wda, w }) => {
  await assert.rejects(go(), refused('PAPER_MODE'));
  assert.equal(wda.calls.length, 0);
  assert.equal(w.placed, 0);
});

run('guard: daily loss stop counts money lost today plus money still in play', { caps: { ...LIVE, dailyLossLimit: 5, dailyCap: 100 } }, async ({ go, wda, ledger }) => {
  const a = await go({ round: 'R1' });
  ledger.append({ type: 'settlement', id: a.ledger.id, result: 'lost', pnl: -2 });
  fakeWallet(wda, { round: 'R2' });
  const b = await go({ round: 'R2' });           // lost 2, 2 in play
  assert.equal(b.ok, true);
  fakeWallet(wda, { round: 'R3' });
  await assert.rejects(go({ round: 'R3' }), refused('DAILY_LOSS_STOP')); // 2 + 2 + 2 > 5
  ledger.append({ type: 'settlement', id: b.ledger.id, result: 'won', pnl: 1.8 });
  assert.equal((await go({ round: 'R3' })).ok, true); // net loss 0.2, room again
});

run('guard: losses in a row stop live buys until Alex resets them', { caps: { ...LIVE, lossStop: 2, dailyCap: 100, dailyLossLimit: 100 } }, async ({ go, wda, ledger, clock }) => {
  for (const round of ['R1', 'R2']) {
    fakeWallet(wda, { round });
    const b = await go({ round });
    clock.t += 1000;
    ledger.append({ type: 'settlement', id: b.ledger.id, result: 'lost', pnl: -2 });
  }
  fakeWallet(wda, { round: 'R3' });
  await assert.rejects(go({ round: 'R3' }), refused('LOSS_RUN_STOP'));
  clock.t += 1000;
  ledger.append({ type: 'reset', what: 'losses' });
  assert.equal((await go({ round: 'R3' })).ok, true);
});

run('guard: double submit: the same coin and round on the same phone is refused the second time', {}, async ({ go, wda, w, ledger }) => {
  assert.equal((await go()).ok, true);
  const w2 = fakeWallet(wda);
  await assert.rejects(go(), refused('DUPLICATE'));
  assert.equal(w2.placed, 0);
  assert.equal(ledger.rows().filter((x) => x.type === 'reservation').length, 1);
});

run('guard: two buys fired at the same moment for the same round place exactly one bet', {}, async ({ go, w, ledger }) => {
  const results = await Promise.allSettled([go(), go()]);
  assert.equal(w.placed, 1);
  assert.equal(results.filter((x) => x.status === 'fulfilled' && x.value.ok).length, 1);
  assert.equal(ledger.rows().filter((x) => x.type === 'reservation').length, 1);
});

run('guard: the same command id delivered twice is run once', {}, async ({ r }) => {
  const j = new CommandJournal({ file: path.join(r.home, 'commands.jsonl') });
  assert.equal(j.begin('c1', 'finger_buy'), true);
  assert.equal(j.begin('c1', 'finger_buy'), false);
  assert.equal(new CommandJournal({ file: path.join(r.home, 'commands.jsonl') }).begin('c1', 'finger_buy'), false, 'still refused after a restart');
});

run('guard: a stale command (asked too long ago) is refused', {}, async ({ go, clock, wda }) => {
  const createdAt = clock.t;
  clock.t += 21000;
  await assert.rejects(go({ createdAt }), refused('STALE_COMMAND'));
  await assert.rejects(go({ createdAt: undefined }), refused('STALE_COMMAND'));
  await assert.rejects(go({ createdAt: clock.t + 60000 }), refused('STALE_COMMAND'));
  assert.equal(wda.calls.length, 0);
});

run('guard: the wallet is not the app on screen', {}, async ({ go, wda, w }) => {
  wda.app = 'com.apple.springboard';
  await assert.rejects(go(), refused('WRONG_APP'));
  assert.equal(wda.callsTo('/wda/tap').length, 0);
});

for (const [field, lie] of [['coin', 'SOL'], ['side', 'Down'], ['stake', 10], ['round', 'R2']]) {
  run(`stale or wrong screen: confirm screen shows a different ${field}: nothing is pressed`, { wallet: { lie: { [field]: lie } } }, async ({ go, w, ledger }) => {
    await assert.rejects(go(), refused('CONFIRM_MISMATCH'));
    assert.equal(w.confirmTaps, 0);
    assert.equal(ledger.rows().length, 0);
  });
}

run('stale screen: reading the confirm screen took longer than the budget: nothing is pressed', {}, async ({ go, w, wda, clock, ledger }) => {
  const realTap = wda.onTap;
  wda.onTap = (x, y) => { realTap(x, y); if (w.page === 'confirm') wda.delays['/source'] = 1; };
  // The clock jumps 2.5 s while the confirm screen is being read.
  const realRoute = wda.route.bind(wda);
  wda.route = (m, p, b, q) => { if (p === '/source' && w.page === 'confirm') clock.t += 2500; return realRoute(m, p, b, q); };
  await assert.rejects(go(), refused('SLOW_SCREEN'));
  assert.equal(w.confirmTaps, 0);
  assert.equal(ledger.rows().length, 0);
});

run('stale screen: too little time left in the round: nothing is pressed', { wallet: { ends: '0:45' } }, async ({ go, w }) => {
  await assert.rejects(go(), refused('TOO_LATE'));
  assert.equal(w.confirmTaps, 0);
});

run('stale screen: a confirm screen that cannot be read, or has two confirm buttons, is refused', {}, async ({ go, w, wda }) => {
  const realTap = wda.onTap;
  wda.onTap = (x, y) => { realTap(x, y); if (w.page === 'confirm') wda.tree.children = wda.tree.children.filter((c) => !c.label.startsWith('Round')); };
  await assert.rejects(go(), refused('CONFIRM_UNREADABLE'));
  assert.equal(w.confirmTaps, 0);
});

run('stale screen: the expected button is not there (a different screen): refused', {}, async ({ go, wda, w }) => {
  wda.tree.children = wda.tree.children.filter((c) => c.label !== 'Up');
  await assert.rejects(go(), refused('SCREEN_NOT_AS_EXPECTED'));
  assert.equal(w.confirmTaps, 0);
});

run('wrong phone: a buy by alias, with no phone, or with an unknown UDID is refused', { phones: 2 }, async ({ r }) => {
  for (const device of ['1', 2, undefined, '', '00008110-000FFFFFFFFFFFFF']) {
    assert.throws(() => r.registry.resolve(device, { forBuy: true }), (e) => e.code === 'BUY_NEEDS_UDID', String(device));
  }
});

run('wrong phone: the bet goes to the phone named by UDID and the other phone is never touched', { phones: 2 }, async ({ go, wallets, r, ledger }) => {
  const res = await go({ udid: UDID_B });
  assert.equal(res.ok, true);
  assert.equal(wallets[UDID_B].placed, 1);
  assert.equal(wallets[UDID_A].placed, 0);
  assert.equal(r.wdas[UDID_A].calls.length, 0);
  assert.equal(ledger.rows()[0].udid, UDID_B);
});

run('wrong phone: the named phone is unplugged: refused, nothing written', { phones: 2 }, async ({ go, r, ledger, wallets }) => {
  r.unplug(UDID_B);
  await assert.rejects(go({ udid: UDID_B }), refused('NOT_PLUGGED'));
  assert.equal(ledger.rows().length, 0);
  assert.equal(wallets[UDID_A].placed, 0);
});

run('two phones: caps are shared, so two buys at the same moment cannot both fit under one cap', { phones: 2, caps: { ...LIVE, dailyCap: 2 } }, async ({ go, wallets, ledger }) => {
  const results = await Promise.allSettled([go({ udid: UDID_A }), go({ udid: UDID_B })]);
  assert.equal(wallets[UDID_A].placed + wallets[UDID_B].placed, 1);
  const lost = results.find((x) => x.status === 'rejected');
  assert.equal(lost.reason.code, 'OVER_DAILY_CAP');
  assert.equal(ledger.summary().spentToday, 2);
});

run('unknown outcome: confirm tapped but the screen does not show the bet: UNKNOWN, and live buys halt on that phone', { phones: 2, wallet: { showPlaced: false } }, async ({ go, wallets, wda, ledger, r }) => {
  const res = await go();
  assert.equal(res.code, 'UNKNOWN');
  assert.equal(wallets[UDID_A].confirmTaps, 1);
  assert.deepEqual(ledger.rows().map((x) => x.type), ['reservation']);
  assert.equal(ledger.summary().unknown.length, 1);
  assert.equal(ledger.summary().spentToday, 2, 'the unknown stake still counts as spent');
  const again = fakeWallet(wda, { round: 'R2' });
  await assert.rejects(go({ round: 'R2' }), refused('UNKNOWN_OPEN'));
  assert.equal(again.page, 'market');
  fakeWallet(r.wdas[UDID_B], { round: 'R2' });
  assert.equal((await go({ udid: UDID_B, round: 'R2' })).ok, true, 'the other phone is not halted');
  // Resolved by an outcome row: buying resumes.
  ledger.append({ type: 'outcome', id: res.ledger.id, result: 'placed' });
  assert.equal((await go({ round: 'R2' })).ok, true);
});

run('unknown outcome: WDA dies on the confirm tap: UNKNOWN, never retried', {}, async ({ go, w, wda, ledger }) => {
  const realTap = wda.onTap;
  let taps = 0;
  wda.onTap = (x, y) => { realTap(x, y); };
  w.afterConfirm = () => { taps++; wda.html = true; };
  const res = await go();
  assert.equal(res.code, 'UNKNOWN');
  assert.equal(taps, 1, 'the confirm tap is sent once and not repeated');
  assert.equal(ledger.summary().unknown.length, 1);
});

run('unknown outcome: a lost session at the confirm tap is not retried', {}, async ({ go, w, wda, ledger }) => {
  const realTap = wda.onTap;
  wda.onTap = (x, y) => { realTap(x, y); if (w.page === 'confirm') wda.sessionId = 'GONE'; };
  const res = await go();
  assert.equal(res.code, 'UNKNOWN');
  assert.equal(w.confirmTaps, 0);
  assert.equal(wda.sessionsMade, 1, 'no new session, no second tap');
  assert.equal(ledger.summary().unknown.length, 1);
});

run('crash between reservation and outcome: after a restart the bet is UNKNOWN and buys are halted', {}, async ({ go, ledger, r, now }) => {
  ledger.append({ type: 'reservation', id: 'crashed', udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R0', read: {} });
  const afterRestart = new Ledger({ file: path.join(r.home, 'ledger.jsonl'), now });
  assert.equal(afterRestart.summary().unknown[0].id, 'crashed');
  await assert.rejects(go(), refused('UNKNOWN_OPEN'));
});

run('a pop-up or a locked phone stops a buy before anything is pressed', {}, async ({ go, wda, w }) => {
  wda.alert = 'Rate this app?';
  await assert.rejects(go(), refused('ALERT_OPEN'));
  wda.alert = null; wda.locked = true;
  await assert.rejects(go(), refused('LOCKED'));
  assert.equal(wda.callsTo('/wda/tap').length, 0);
});

run('the empty Phantom profile (nothing read on the phone yet) blocks live mode and every buy', { profile: JSON.parse(fs.readFileSync(new URL('../profiles/phantom.json', import.meta.url), 'utf8')) }, async ({ go, capsStore, wda }) => {
  await assert.rejects(go(), refused('LIVE_BLOCKED'));
  capsStore.write({ ...DEFAULT_CAPS, ...LIVE, mode: 'PAPER' });
  assert.throws(() => capsStore.setMode('LIVE', JSON.parse(fs.readFileSync(new URL('../profiles/phantom.json', import.meta.url), 'utf8'))), refused('LIVE_BLOCKED'));
  assert.equal(wda.calls.length, 0);
});

test('caps: defaults start in PAPER with blank limits; numbers are validated; LIVE needs everything', () => {
  const dir = fs.mkdtempSync('/tmp/finger caps ');
  const caps = new Caps({ file: path.join(dir, 'caps.json') });
  assert.equal(caps.read().mode, 'PAPER');
  assert.equal(caps.read().dailyCap, null);
  assert.equal(liveBlockers(caps.read(), FAKE_PROFILE).length, 5);
  assert.throws(() => caps.setMode('LIVE', FAKE_PROFILE), refused('LIVE_BLOCKED'));
  assert.throws(() => caps.setNumbers({ dailyCap: '-5' }), refused('BAD_NUMBER'));
  assert.throws(() => caps.setNumbers({ dailyCap: 'lots' }), refused('BAD_NUMBER'));
  assert.throws(() => caps.setNumbers({ perBetCap: '50' }), refused('BAD_NUMBER'));
  assert.throws(() => caps.setNumbers({ perBetCap: '' }), refused('BAD_NUMBER'));
  caps.setNumbers({ dailyCap: '20', dailyLossLimit: '10', lossStop: '3', minSecondsLeft: '60', mode: 'LIVE', gate: { x: 1 }, maxStake: 10 });
  const c = caps.read();
  assert.deepEqual([c.dailyCap, c.dailyLossLimit, c.lossStop, c.minSecondsLeft], [20, 10, 3, 60]);
  assert.equal(c.mode, 'PAPER', 'the numbers form cannot switch the mode');
  assert.equal(c.gate, null, 'the numbers form cannot set the gate');
  assert.equal(c.maxStake, 2, 'the numbers form cannot unlock bigger stakes');
  assert.throws(() => caps.setMode('LIVE', FAKE_PROFILE), refused('LIVE_BLOCKED')); // gate still unset
  caps.setNumbers({ dailyCap: '' });
  assert.equal(caps.read().dailyCap, null);
  fs.rmSync(dir, { recursive: true });
});

test('ledger: the day rolls over at Athens midnight, not UTC midnight', () => {
  assert.equal(athensDate(Date.parse('2026-11-20T21:59:00Z')), '2026-11-20'); // 23:59 in Athens
  assert.equal(athensDate(Date.parse('2026-11-20T22:01:00Z')), '2026-11-21'); // 00:01 in Athens
  assert.equal(athensDate(Date.parse('2026-07-01T20:59:00Z')), '2026-07-01'); // summer: 23:59
  assert.equal(athensDate(Date.parse('2026-07-01T21:01:00Z')), '2026-07-02');
  const dir = fs.mkdtempSync('/tmp/finger ledger ');
  let t = Date.parse('2026-11-20T21:50:00Z');
  const ledger = new Ledger({ file: path.join(dir, 'l.jsonl'), now: () => t });
  ledger.append({ type: 'reservation', id: 'a', udid: UDID_A, coin: 'BTC', side: 'UP', stake: 10, round: 'R1' });
  ledger.append({ type: 'outcome', id: 'a', result: 'placed' });
  assert.equal(ledger.summary().spentToday, 10);
  t = Date.parse('2026-11-20T22:05:00Z');
  assert.equal(ledger.summary().spentToday, 0, 'a new Athens day starts at zero');
  assert.equal(ledger.summary().atRiskToday, 10, 'money still in play carries over');
  ledger.append({ type: 'reservation', id: 'b', udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R2' });
  ledger.append({ type: 'outcome', id: 'b', result: 'not_placed' });
  assert.equal(ledger.summary().spentToday, 0, 'a bet that was not placed is not spent');
  assert.equal(ledger.hasBet(UDID_A.toLowerCase(), 'BTC', 'R2'), true);
  fs.rmSync(dir, { recursive: true });
});
