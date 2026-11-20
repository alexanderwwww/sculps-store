// finger_buy: the whole guarded sequence, on the Mac, with no Claude round trip inside it
// (PLAN section 7). It is the only code that presses the confirm button.
//
// The profile says how the wallet's screens read. profiles/phantom.json is empty until the
// real screens have been read on the phone (M4), and with an empty profile no buy can run.
// The profile shape used here is provisional and is settled against the real tree at M4.
import { randomUUID } from 'node:crypto';
import { checkBuy, Refusal } from './guard.mjs';
import { readTree, foregroundApp } from './actions.mjs';
import { findByLabel, centre } from './tree.mjs';

function one(elements, label, what) {
  const found = findByLabel(elements, label);
  if (found.length !== 1) throw new Refusal('SCREEN_NOT_AS_EXPECTED', `expected exactly one "${label}" (${what}), found ${found.length}`);
  return found[0];
}

async function tapLabel(ctx, label, what) {
  const { elements } = await readTree(ctx);
  await ctx.wda.call('tap', { body: centre(one(elements, label, what).rect), retry: false });
}

// Reads the confirm screen. Every field must be there exactly once.
export function readConfirm(elements, profile) {
  const read = {};
  for (const [name, pattern] of Object.entries(profile.confirm.fields)) {
    const re = new RegExp(pattern);
    const hits = elements.map((e) => re.exec(e.label)).filter(Boolean);
    if (hits.length !== 1) throw new Refusal('CONFIRM_UNREADABLE', `the confirm screen shows "${name}" ${hits.length} times, expected once`);
    read[name] = hits[0].slice(1);
  }
  return {
    coin: read.coin[0],
    side: read.side[0].toUpperCase(),
    stake: Number(read.stake[0]),
    round: read.round[0],
    price: read.price[0],
    secondsLeft: Number(read.secondsLeft[0]) * 60 + Number(read.secondsLeft[1]),
  };
}

function mustMatch(read, req, caps) {
  for (const k of ['coin', 'side', 'stake', 'round']) {
    if (read[k] !== req[k]) throw new Refusal('CONFIRM_MISMATCH', `the confirm screen says ${k} = ${read[k]}, the request says ${req[k]}`);
  }
  if (!(read.secondsLeft >= caps.minSecondsLeft)) {
    throw new Refusal('TOO_LATE', `${read.secondsLeft} s left in the round, under the minimum of ${caps.minSecondsLeft} s`);
  }
}

// req: { udid, coin, side, stake, round, createdAt }
// deps: { lane, caps (Caps), ledger, profile, now }
export async function buy(req, { lane, caps: capsStore, ledger, profile, now = Date.now }) {
  let caps = capsStore.read();
  checkBuy({ req, caps, profile, ledger, now: now() });                       // 1

  return lane.exclusive(async (ctx) => {
    const app = await foregroundApp(ctx);                                      // 2
    if (app !== profile.bundleId) throw new Refusal('WRONG_APP', `the wallet is not on screen (showing ${app || 'nothing'})`);

    await tapLabel(ctx, profile.flow.side[req.side], 'side');                  // 3
    await tapLabel(ctx, profile.flow.stake[String(req.stake)], 'stake');
    await tapLabel(ctx, profile.flow.review, 'review');

    const t0 = now();                                                          // 4
    const { elements } = await readTree(ctx);
    const readMs = now() - t0;
    const read = readConfirm(elements, profile);
    caps = capsStore.read();
    mustMatch(read, req, caps);
    const confirm = one(elements, profile.confirm.label, 'confirm');
    if (readMs > caps.confirmBudgetMs) throw new Refusal('SLOW_SCREEN', `reading the confirm screen took ${readMs} ms; the screen may be stale`);

    // 5. Checked again and written in one go, with no pause in between, so two phones
    // buying at the same moment cannot both fit under the same cap.
    checkBuy({ req, caps, profile, ledger, now: now() });
    const id = randomUUID();
    const row = ledger.append({ type: 'reservation', id, udid: req.udid, coin: read.coin, side: read.side, stake: read.stake, round: read.round, read });

    if (now() - t0 > caps.confirmBudgetMs) {                                   // 6
      ledger.append({ type: 'outcome', id, result: 'not_placed', why: 'too slow before the tap' });
      throw new Refusal('SLOW_SCREEN', 'too much time passed before the confirm tap; nothing was pressed');
    }
    try {
      await ctx.wda.call('tap', { body: centre(confirm.rect), retry: false });
    } catch (e) {
      // The tap may or may not have landed. No outcome row is written: the bet stays UNKNOWN.
      return { ok: false, code: 'UNKNOWN', message: `the confirm tap got no clean answer (${e.message}); live buys on this phone are halted until the bet is resolved`, read, ledger: row };
    }

    let placed = false;                                                        // 7
    try {
      const after = await readTree(ctx);
      const re = new RegExp(profile.placed);
      placed = after.elements.some((e) => re.test(e.label));
    } catch { /* stays unknown */ }
    if (!placed) {
      return { ok: false, code: 'UNKNOWN', message: 'confirm was tapped but the screen does not show the bet as placed; live buys on this phone are halted until the bet is resolved', read, ledger: row };
    }
    ledger.append({ type: 'outcome', id, result: 'placed' });
    return { ok: true, message: `bet placed: ${read.coin} ${read.side} $${read.stake}, round ${read.round}`, read, ledger: row };
  });
}
