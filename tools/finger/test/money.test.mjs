// The money guard, the ledger and finger_buy, driven end to end through a lane and the
// fake WDA showing a made-up wallet (rig.mjs FAKE_PROFILE; it is not Phantom).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rig, UDID_A, UDID_B, FAKE_PROFILE, FAKE_WALLET, fakeWallet } from './rig.mjs';
import { Caps, DEFAULT_CAPS, checkBuy, liveBlockers, checkProfile } from '../src/guard.mjs';
import { Registry } from '../src/devices.mjs';
import { Ledger, athensDate } from '../src/ledger.mjs';
import { buy } from '../src/buy.mjs';
import { CommandJournal } from '../src/journal.mjs';

const LIVE = { mode: 'LIVE', perBetCap: 10, dailyCap: 20, dailyLossLimit: 20, lossStop: 3, minSecondsLeft: 60, maxStake: 10, gate: { set: true } };
const T0 = Date.parse('2026-11-20T10:00:00Z');
// Reading a round's result off the wallet is not built, and the shipped app blocks live
// mode because of it (the test "live stays blocked..." below). The buy sequence is tested
// here on its own, so these tests say the reader is there.
const READER = { settlementReader: true };

async function setup({ phones = 1, caps = LIVE, profile = FAKE_PROFILE, wallet = {} } = {}) {
  const clock = { t: T0 };
  const now = () => clock.t;
  const r = await rig({ phones, profile, now });
  const capsStore = new Caps({ file: path.join(r.home, 'caps.json'), built: READER });
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
  ledger.settle(a.ledger.id, 'lost', -2);
  fakeWallet(wda, { round: 'R2' });
  const b = await go({ round: 'R2' });           // lost 2, 2 in play
  assert.equal(b.ok, true);
  fakeWallet(wda, { round: 'R3' });
  await assert.rejects(go({ round: 'R3' }), refused('DAILY_LOSS_STOP')); // 2 + 2 + 2 > 5
  ledger.settle(b.ledger.id, 'won', 1.8);
  assert.equal((await go({ round: 'R3' })).ok, true); // net loss 0.2, room again
});

run('guard: losses in a row stop live buys until Alex resets them', { caps: { ...LIVE, lossStop: 2, dailyCap: 100, dailyLossLimit: 100 } }, async ({ go, wda, ledger, clock }) => {
  for (const round of ['R1', 'R2']) {
    fakeWallet(wda, { round });
    const b = await go({ round });
    clock.t += 1000;
    ledger.settle(b.ledger.id, 'lost', -2);
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

run('guard: two buys fired at the same moment for the same round place exactly one bet, and the second touches nothing', {}, async ({ go, w, wda, ledger }) => {
  const results = await Promise.allSettled([go(), go()]);
  assert.equal(w.placed, 1);
  assert.equal(results.find((x) => x.status === 'rejected').reason.code, 'DUPLICATE');
  assert.equal(wda.callsTo('/wda/tap').length, 4, 'side, stake, review and confirm for the first buy; no tap at all for the second');
  assert.equal(w.page, 'done', 'the wallet is not left sitting on a confirm screen');
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
  // Resolved (the page's "It was placed" button calls this): buying resumes.
  assert.throws(() => ledger.resolve('no-such-id', 'placed'), refused('NOT_UNKNOWN'));
  assert.throws(() => ledger.resolve(res.ledger.id, 'maybe'), refused('BAD_REQUEST'));
  ledger.resolve(res.ledger.id, 'placed');
  assert.throws(() => ledger.resolve(res.ledger.id, 'not_placed'), refused('NOT_UNKNOWN'), 'a resolved bet cannot be flipped');
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

run('confirm tap refused by the phone (lost session): not retried, recorded as NOT placed, and buying is not halted', {}, async ({ go, w, wda, ledger }) => {
  const realTap = wda.onTap;
  wda.onTap = (x, y) => { realTap(x, y); if (w.page === 'confirm') wda.sessionId = 'GONE'; };
  const res = await go();
  assert.equal(res.code, 'NOT_PLACED', res.message);
  assert.equal(w.confirmTaps, 0);
  assert.equal(wda.sessionsMade, 1, 'no new session, no second tap');
  assert.deepEqual(ledger.rows().map((x) => [x.type, x.result]), [['reservation', undefined], ['outcome', 'not_placed']]);
  assert.equal(ledger.summary().unknown.length, 0, 'the phone provably did not get the tap, so nothing is unknown');
  assert.equal(ledger.summary().spentToday, 0);
  fakeWallet(wda, { round: 'R2' });
  assert.equal((await go({ round: 'R2' })).ok, true, 'the next buy on this phone goes through');
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
  assert.equal(liveBlockers(caps.read(), FAKE_PROFILE, READER).length, 5);
  assert.equal(liveBlockers(caps.read(), FAKE_PROFILE).length, 6, 'as shipped there is one more: no result reader');
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
  assert.equal(ledger.summary().openStakes, 10, 'a bet with no result recorded carries over');
  assert.equal(ledger.summary().openSince, '2026-11-20');
  ledger.append({ type: 'reservation', id: 'b', udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R2' });
  ledger.append({ type: 'outcome', id: 'b', result: 'not_placed' });
  assert.equal(ledger.summary().spentToday, 0, 'a bet that was not placed is not spent');
  assert.equal(ledger.hasBet(UDID_A.toLowerCase(), 'BTC', 'R2'), true);
  fs.rmSync(dir, { recursive: true });
});

// ---- added after review: each of these failed before its fix ----

test('guard: live stays blocked, as shipped, until finger can read a round\'s result from the wallet', () => {
  const dir = fs.mkdtempSync('/tmp/finger built ');
  const caps = new Caps({ file: path.join(dir, 'caps.json') }); // no "built": what the app ships with
  caps.write({ ...DEFAULT_CAPS, ...LIVE, mode: 'PAPER' });
  assert.throws(() => caps.setMode('LIVE', FAKE_PROFILE), (e) => e.code === 'LIVE_BLOCKED' && /round's result/.test(e.message));
  // Even with LIVE written into the file by hand, no buy runs.
  caps.write({ ...DEFAULT_CAPS, ...LIVE });
  const ledger = new Ledger({ file: path.join(dir, 'l.jsonl'), now: () => T0 });
  const req = { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R1', createdAt: T0 };
  assert.throws(() => checkBuy({ req, caps: caps.read(), profile: FAKE_PROFILE, ledger, now: T0, built: caps.built }), refused('LIVE_BLOCKED'));
  assert.throws(() => checkBuy({ req, caps: caps.read(), profile: FAKE_PROFILE, ledger, now: T0 }), refused('LIVE_BLOCKED'));
  fs.rmSync(dir, { recursive: true });
});

test('ledger: a result frees the stake; a bet with no result still counts days later and the refusal names its day, not today', () => {
  const dir = fs.mkdtempSync('/tmp/finger settle ');
  let t = T0;
  const ledger = new Ledger({ file: path.join(dir, 'l.jsonl'), now: () => t });
  const bet = (id, round) => { ledger.append({ type: 'reservation', id, udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round }); ledger.append({ type: 'outcome', id, result: 'placed' }); };
  for (const [id, round] of [['a', 'R1'], ['b', 'R2'], ['c', 'R3']]) bet(id, round);
  assert.equal(ledger.summary().openStakes, 6);
  ledger.settle('a', 'won', 1.8);
  assert.equal(ledger.summary().openStakes, 4, 'a settled bet is no longer open');
  assert.equal(ledger.summary().lossToday, -1.8);
  assert.throws(() => ledger.settle('a', 'lost', -2), refused('ALREADY_SETTLED'));
  assert.throws(() => ledger.settle('b', 'lost', -5), refused('BAD_REQUEST'), 'a loss bigger than the stake');
  assert.throws(() => ledger.settle('b', 'lost', undefined), refused('BAD_REQUEST'), 'a result needs its number');
  assert.throws(() => ledger.settle('b', 'won', -1), refused('BAD_REQUEST'));
  assert.throws(() => ledger.settle('zzz', 'lost', -2), refused('NOT_PLACED'));
  t += 3 * 24 * 3600 * 1000;                       // three days on, two bets never got a result
  const s = ledger.summary();
  assert.deepEqual([s.spentToday, s.lossToday, s.openStakes, s.openSince], [0, 0, 4, '2026-11-20']);
  const caps = { ...DEFAULT_CAPS, ...LIVE, dailyLossLimit: 5 };
  const req = { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R9', createdAt: t };
  assert.throws(() => checkBuy({ req, caps, profile: FAKE_PROFILE, ledger, now: t, built: READER }),
    (e) => e.code === 'DAILY_LOSS_STOP' && /no result recorded \(oldest from 2026-11-20\)/.test(e.message) && !/still in play/.test(e.message));
  ledger.settle('b', 'lost', -2);
  ledger.settle('c', 'lost', -2);
  assert.equal(ledger.summary().openStakes, 0);
  assert.equal(ledger.summary().lossToday, 4, 'a result counts on the day it was recorded');
  assert.equal(ledger.summary().lossRun, 2);
  fs.rmSync(dir, { recursive: true });
});

test('guard: a number that is not a number refuses the buy instead of letting it through', () => {
  const dir = fs.mkdtempSync('/tmp/finger nan ');
  const file = path.join(dir, 'l.jsonl');
  const ledger = new Ledger({ file, now: () => T0 });
  const req = { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R9', createdAt: T0 };
  const caps = { ...DEFAULT_CAPS, ...LIVE, dailyLossLimit: 6, dailyCap: 100 };
  const tryBuy = (c = caps) => checkBuy({ req, caps: c, profile: FAKE_PROFILE, ledger, now: T0, built: READER });
  for (const id of ['a', 'b', 'c']) { ledger.append({ type: 'reservation', id, udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: `R-${id}` }); ledger.append({ type: 'outcome', id, result: 'placed' }); }
  // Hand-written settlement rows with no pnl: before, lossToday became NaN and the 4th buy was ALLOWED.
  ledger.append({ type: 'settlement', id: 'a', result: 'lost' });
  ledger.append({ type: 'settlement', id: 'b', result: 'lost' });
  assert.ok(Number.isFinite(ledger.summary().lossToday));
  assert.match(ledger.summary().damaged, /2 lines of the money ledger cannot be read/);
  assert.throws(tryBuy, refused('LEDGER_DAMAGED'));
  // A stake stored as text.
  fs.writeFileSync(file, '');
  ledger.append({ type: 'reservation', id: 's', udid: UDID_A, coin: 'BTC', side: 'UP', stake: '2', round: 'R1' });
  assert.equal(ledger.summary().spentToday, 0, 'never "022"');
  assert.throws(tryBuy, refused('LEDGER_DAMAGED'));
  // Limits that are not numbers, handed straight to the check.
  fs.writeFileSync(file, '');
  assert.doesNotThrow(tryBuy);
  for (const k of ['dailyCap', 'dailyLossLimit', 'lossStop', 'perBetCap', 'maxStake', 'minSecondsLeft', 'commandMaxAgeMs']) {
    for (const v of [NaN, undefined, 'x', '100', Infinity]) {
      assert.throws(() => tryBuy({ ...caps, [k]: v }), (e) => e.refused === true, `${k} = ${String(v)}`);
    }
  }
  // The same values hand-written into caps.json read as blank (and a blank blocks), never as a limit.
  const store = new Caps({ file: path.join(dir, 'caps.json'), built: READER });
  fs.writeFileSync(store.file, JSON.stringify({ ...DEFAULT_CAPS, ...LIVE, dailyCap: '100', dailyLossLimit: 'x' }));
  const read = store.read();
  assert.deepEqual([read.dailyCap, read.dailyLossLimit, read.mode], [null, null, 'PAPER']);
  assert.match(read.problem, /dailyCap, dailyLossLimit/);
  assert.throws(() => tryBuy(read), refused('PAPER_MODE'));
  fs.rmSync(dir, { recursive: true });
});

test('caps: the page takes plain numbers only, inside sane bounds', () => {
  const dir = fs.mkdtempSync('/tmp/finger numbers ');
  const caps = new Caps({ file: path.join(dir, 'caps.json') });
  const bad = [['perBetCap', true], ['perBetCap', [5]], ['perBetCap', '0x5'], ['perBetCap', '5e0'], ['dailyCap', 1e308], ['dailyCap', '1e308'], ['dailyCap', 0.0001],
    ['dailyCap', '0'], ['dailyCap', ' 20'], ['dailyCap', '5000'], ['lossStop', 0.5], ['lossStop', '2.5'], ['minSecondsLeft', '30.5'], ['minSecondsLeft', '99999'], ['dailyLossLimit', {}]];
  for (const [k, v] of bad) assert.throws(() => caps.setNumbers({ [k]: v }), refused('BAD_NUMBER'), `${k} = ${JSON.stringify(v)}`);
  assert.equal(fs.existsSync(caps.file), false, 'nothing was saved');
  caps.setNumbers({ perBetCap: 5, dailyCap: '20.50', dailyLossLimit: 10, lossStop: '3', minSecondsLeft: 60 });
  const c = caps.read();
  assert.deepEqual([c.perBetCap, c.dailyCap, c.dailyLossLimit, c.lossStop, c.minSecondsLeft], [5, 20.5, 10, 3, 60]);
  fs.rmSync(dir, { recursive: true });
});

test('damaged files: a torn last line is set aside and reported; any other bad line stops buys only; nothing throws', () => {
  const dir = fs.mkdtempSync('/tmp/finger torn ');
  const file = path.join(dir, 'ledger.jsonl');
  let ledger = new Ledger({ file, now: () => T0 });
  ledger.append({ type: 'reservation', id: 'a', udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R1' });
  ledger.append({ type: 'outcome', id: 'a', result: 'placed' });
  fs.appendFileSync(file, '{"t":17636,"type":"reserv');                     // a write cut short
  assert.equal(ledger.summary().spentToday, 2, 'reading still works with the torn line there');
  assert.equal(ledger.summary().damaged, null);
  ledger = new Ledger({ file, now: () => T0 });                              // finger starts again
  assert.equal(ledger.summary().torn, 1);
  assert.equal(fs.readFileSync(`${file}.torn`, 'utf8'), '{"t":17636,"type":"reserv\n', 'the piece is kept, not thrown away');
  ledger.append({ type: 'reservation', id: 'b', udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R2' });
  assert.equal(ledger.rows().length, 3, 'the next row is not glued onto the torn one');
  assert.equal(ledger.summary().damaged, null);
  const req = { udid: UDID_A, coin: 'BTC', side: 'UP', stake: 2, round: 'R9', createdAt: T0 };
  const caps = { ...DEFAULT_CAPS, ...LIVE, dailyCap: 100 };
  ledger.append({ type: 'outcome', id: 'b', result: 'not_placed' });
  assert.doesNotThrow(() => checkBuy({ req, caps, profile: FAKE_PROFILE, ledger, now: T0, built: READER }), 'a torn tail does not stop buying');
  // A torn tail that is found while finger is running is also moved before the next append.
  fs.appendFileSync(file, '{"t":1,"ty');
  ledger.append({ type: 'reset', what: 'losses' });
  assert.equal(ledger.summary().torn, 2);
  assert.equal(ledger.summary().damaged, null);
  // A bad line in the middle.
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('\n', '\n{{{ not json\n'));
  const s = ledger.summary();
  assert.equal(s.spentToday, 2, 'the good rows are still counted');
  assert.match(s.damaged, /1 line of the money ledger cannot be read/);
  assert.throws(() => checkBuy({ req, caps, profile: FAKE_PROFILE, ledger, now: T0, built: READER }), refused('LEDGER_DAMAGED'));

  // The command journal: finger starts, and the ids on the good lines still hold.
  const cmds = path.join(dir, 'commands.jsonl');
  new CommandJournal({ file: cmds }).begin('c1', 'finger_act');
  fs.appendFileSync(cmds, '{"id":"c2","tool":"fing');
  let j;
  assert.doesNotThrow(() => { j = new CommandJournal({ file: cmds }); });
  assert.equal(j.begin('c1', 'finger_act'), false);
  assert.equal(j.begin('c3', 'finger_act'), true);
  assert.equal(new CommandJournal({ file: cmds }).begin('c3', 'finger_act'), false, 'the row after a torn one was written whole');
  fs.writeFileSync(cmds, 'garbage\n' + fs.readFileSync(cmds, 'utf8'));
  assert.equal(new CommandJournal({ file: cmds }).bad, 1);

  // The limits file and the list of phones.
  const capsFile = path.join(dir, 'caps.json');
  fs.writeFileSync(capsFile, '{"mode":"LIVE","dailyCap":2');
  const store = new Caps({ file: capsFile });
  const c = store.read();
  assert.deepEqual([c.mode, c.dailyCap], ['PAPER', null]);
  assert.match(c.problem, /could not be read/);
  assert.match(store.read().problem, /could not be read/, 'still said on the next read');
  assert.equal(fs.existsSync(`${capsFile}.bad`), true);
  store.setNumbers({ dailyCap: '20' });
  assert.equal(store.read().problem, null);
  const devs = path.join(dir, 'devices.json');
  fs.writeFileSync(devs, '{"00008110-000a1111aaaa001e":{"alias":1,"udid":"00008110-000A1111AAAA001E"}}}}');
  let reg;
  assert.doesNotThrow(() => { reg = new Registry({ file: devs }); });
  assert.match(reg.problem, /could not be read/);
  assert.deepEqual(reg.list(), []);
  fs.rmSync(dir, { recursive: true });
});

run('stale screen: the clock passes the budget between reading the screen and the tap: nothing is pressed, recorded as not placed', {}, async ({ go, w, ledger, clock }) => {
  const real = ledger.append.bind(ledger);
  ledger.append = (row) => { const out = real(row); if (row.type === 'reservation') clock.t += 2500; return out; };
  await assert.rejects(go(), refused('SLOW_SCREEN'));
  assert.equal(w.confirmTaps, 0);
  assert.deepEqual(ledger.rows().map((x) => [x.type, x.result]), [['reservation', undefined], ['outcome', 'not_placed']]);
  assert.equal(ledger.summary().unknown.length, 0);
});

run('stale screen: a confirm field shown twice is refused', {}, async ({ go, w, wda }) => {
  const realTap = wda.onTap;
  wda.onTap = (x, y) => { realTap(x, y); if (w.page === 'confirm') wda.tree.children.push({ ...wda.tree.children.find((c) => c.label.startsWith('Stake')), rect: { x: 20, y: 340, width: 350, height: 30 } }); };
  await assert.rejects(go(), (e) => e.code === 'CONFIRM_UNREADABLE' && /"stake" 2 times/.test(e.message));
  assert.equal(w.confirmTaps, 0);
});

// A sheet over an older screen: the old screen's elements are still in the tree, marked
// not visible, the way WDA reports them ("0").
const under = (label, y, extra = {}) => ({ type: 'StaticText', label, name: label, value: null, rect: { x: 20, y, width: 350, height: 30 }, isVisible: '0', isEnabled: '1', ...extra });

run('hidden elements: a stale coin, stake and round left underneath are not read, and do not get in the way', {}, async ({ go, w, wda }) => {
  const realTap = wda.onTap;
  wda.onTap = (x, y) => {
    realTap(x, y);
    if (w.page === 'confirm') wda.tree.children.unshift(under('Coin: SOL', 100), under('Stake: $10', 180), under('Round: R0', 220));
  };
  const res = await go();
  assert.equal(res.ok, true, res.message);
  assert.deepEqual([res.read.coin, res.read.stake, res.read.round], ['BTC', 2, 'R1'], 'read from what is shown, not from what is underneath');
});

for (const [what, extra] of [['hidden', { isVisible: '0' }], ['switched off', { isEnabled: '0' }]]) {
  run(`hidden elements: a confirm button that is ${what} is not pressed`, {}, async ({ go, w, wda, ledger }) => {
    const realTap = wda.onTap;
    wda.onTap = (x, y) => { realTap(x, y); if (w.page === 'confirm') Object.assign(wda.tree.children.find((c) => c.label === 'Confirm'), extra); };
    await assert.rejects(go(), refused('SCREEN_NOT_AS_EXPECTED'));
    assert.equal(w.confirmTaps, 0);
    assert.equal(ledger.rows().length, 0);
  });
}

run('confirm tap: it gets only what is left of the budget; a tap the phone holds longer is UNKNOWN, not "placed"', { caps: { ...LIVE, confirmBudgetMs: 200 } }, async ({ go, w, wda, ledger }) => {
  const realTap = wda.onTap;
  // The phone holds the confirm tap for 700 ms (WDA waiting for the app to go idle).
  wda.onTap = (x, y) => { realTap(x, y); if (w.page === 'confirm') wda.delays['/wda/tap'] = 700; };
  const t = Date.now();
  const res = await go();
  assert.equal(res.code, 'UNKNOWN', JSON.stringify(res));
  assert.ok(Date.now() - t < 650, `finger waited ${Date.now() - t} ms for a tap it allows 200 ms`);
  assert.equal(ledger.summary().unknown.length, 1);
});

run('confirm tap: answered, but later than the budget by the clock: UNKNOWN', {}, async ({ go, w, wda, clock, ledger }) => {
  const realRoute = wda.route.bind(wda);
  wda.route = (m, p, b, q) => { if (p === '/wda/tap' && w.page === 'confirm') clock.t += 2500; return realRoute(m, p, b, q); };
  const res = await go();
  assert.equal(res.code, 'UNKNOWN');
  assert.match(res.message, /answered 2500 ms after the screen was read/);
  assert.equal(w.confirmTaps, 1);
  assert.equal(ledger.summary().unknown.length, 1);
});

run('a buy that waited in the lane until it was stale touches nothing', {}, async ({ go, r, wda, w, clock }) => {
  wda.delays['/source'] = 200;
  const slow = r.lanes[UDID_A].look('tree');     // holds the lane
  const late = go();
  clock.t += 21000;                               // 21 s pass while the buy waits its turn
  await slow;
  wda.delays = {};
  await assert.rejects(late, refused('STALE_COMMAND'));
  assert.equal(wda.callsTo('/wda/tap').length, 0, 'no side, stake or review tap');
  assert.equal(w.page, 'market');
});

test('profile: one finger cannot guard does not load', () => {
  assert.doesNotThrow(() => checkProfile(FAKE_PROFILE));
  const real = JSON.parse(fs.readFileSync(new URL('../profiles/phantom.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => checkProfile(real));
  assert.equal(real.bundleId, 'app.phantom');
  assert.throws(() => checkProfile({ ...real, bundleId: null }), /bundleId/);
  // Filled at M4 with the button it presses but nothing in confirmLabels: still guarded, loads.
  assert.doesNotThrow(() => checkProfile({ ...FAKE_PROFILE, confirmLabels: undefined }));
  assert.throws(() => checkProfile({ ...FAKE_PROFILE, confirm: { ...FAKE_PROFILE.confirm, label: '' } }), /nothing to guard/);
  assert.throws(() => checkProfile({ ...FAKE_PROFILE, guardRects: [] }), /guardRects/);
  assert.throws(() => checkProfile({ ...FAKE_PROFILE, screen: null }), /screen/);
  assert.throws(() => checkProfile({ ...FAKE_PROFILE, confirm: { ...FAKE_PROFILE.confirm, fields: { ...FAKE_PROFILE.confirm.fields, round: undefined } } }), /confirm\.fields\.round/);
  assert.throws(() => checkProfile({ ...FAKE_PROFILE, confirmLabels: ['(unclosed'] }), /regular expression/);
});
