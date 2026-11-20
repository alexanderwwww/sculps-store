// finger_buy: the whole guarded sequence, on the Mac, with no Claude round trip inside it
// (PLAN section 7). It is the only code that presses the confirm button.
//
// The profile says how the wallet's screens read. profiles/phantom.json is empty until the
// real screens have been read on the phone (M4), and with an empty profile no buy can run.
// The profile shape used here is provisional and is settled against the real tree at M4.
//
// NOT DONE HERE YET (PLAN section 7, to be decided before M4): the stake is not read back
// after it is entered (step 3), and the price on the confirm screen is read into the ledger
// but not compared with anything, because finger_buy has no price parameter (step 4).
import { randomUUID } from 'node:crypto';
import { checkBuy, Refusal } from './guard.mjs';
import { readTree, foregroundApp } from './actions.mjs';
import { findByLabel, shown, centre } from './tree.mjs';
import { WDA_ERRORS } from './routes.mjs';

// WDA error answers that mean the tap was NOT performed: the session is checked by the
// router before the handler runs (Routing/FBRoute.m:171-173), an unknown path runs no
// handler (Commands/FBUnknownCommands.m:26-29), and the tap handler returns "invalid
// argument" before it taps (Commands/FBElementCommands.m:503-509). Any other error may
// have come after the touch, so it stays UNKNOWN.
const NOT_TAPPED = [WDA_ERRORS.noSession, WDA_ERRORS.unknownCommand, WDA_ERRORS.invalidArgument];

function one(found, label, what) {
  if (found.length !== 1) throw new Refusal('SCREEN_NOT_AS_EXPECTED', `expected exactly one "${label}" (${what}) on the screen, found ${found.length}`);
  if (!found[0].enabled) throw new Refusal('SCREEN_NOT_AS_EXPECTED', `"${found[0].label}" (${what}) is switched off on the screen`);
  return found[0];
}

async function tapLabel(ctx, label, what) {
  const { elements } = await readTree(ctx);
  await ctx.wda.call('tap', { body: centre(one(findByLabel(elements, label), label, what).rect), retry: false });
}

// Reads the confirm screen from what is really shown (a screen left underneath, hidden, is
// not read). Every field must be there exactly once.
export function readConfirm(elements, profile) {
  const read = {};
  for (const [name, pattern] of Object.entries(profile.confirm.fields)) {
    const re = new RegExp(pattern);
    const hits = shown(elements).map((e) => re.exec(e.label)).filter(Boolean);
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
// deps: { lane, caps (Caps), ledger, profile, now, expiresAt }
export async function buy(req, { lane, caps: capsStore, ledger, profile, now = Date.now, expiresAt }) {
  let caps = capsStore.read();
  const check = () => checkBuy({ req, caps, profile, ledger, now: now(), built: capsStore.built });
  check();                                                                     // 1

  return lane.exclusive(async (ctx) => {
    // The buy may have waited in the lane behind another call: everything is checked again
    // before the first tap, so a late or repeated buy touches nothing.
    caps = capsStore.read();
    check();

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
    const label = new RegExp(profile.confirm.label, 'i');
    const confirm = one(shown(elements).filter((e) => label.test(e.label)), profile.confirm.label, 'confirm');
    if (readMs > caps.confirmBudgetMs) throw new Refusal('SLOW_SCREEN', `reading the confirm screen took ${readMs} ms; the screen may be stale`);

    // 5. Checked again and written in one go, with no pause in between, so two phones
    // buying at the same moment cannot both fit under the same cap.
    check();
    const id = randomUUID();
    const row = ledger.append({ type: 'reservation', id, udid: req.udid, coin: read.coin, side: read.side, stake: read.stake, round: read.round, read });
    const unknown = (message) => ({ ok: false, code: 'UNKNOWN', message: `${message}; live buys on this phone are halted until the bet is resolved`, read, ledger: row });

    // 6. The tap has what is left of the budget and no longer. WDA can hold a tap while it
    // waits for the app to go idle (up to waitForIdleTimeout, 10 s by default: SOURCES.md
    // "what a tap waits on"), and a tap that lands that late lands on a screen nobody read.
    const left = caps.confirmBudgetMs - (now() - t0);
    if (!(left > 0)) {
      ledger.append({ type: 'outcome', id, result: 'not_placed', why: 'too slow before the tap' });
      throw new Refusal('SLOW_SCREEN', 'too much time passed before the confirm tap; nothing was pressed');
    }
    try {
      await ctx.wda.call('tap', { body: centre(confirm.rect), retry: false, timeoutMs: Math.max(1, Math.ceil(left)) });
    } catch (e) {
      if (e.kind === 'wda' && NOT_TAPPED.includes(e.code)) {
        ledger.append({ type: 'outcome', id, result: 'not_placed', why: `the phone refused the tap: ${e.message}` });
        return { ok: false, code: 'NOT_PLACED', message: `the phone refused the confirm tap (${e.message}); nothing was pressed and no bet was placed`, read, ledger: row };
      }
      // The tap may or may not have landed. No outcome row is written: the bet stays UNKNOWN.
      return unknown(`the confirm tap got no clean answer (${e.message})`);
    }
    const took = now() - t0;
    if (took > caps.confirmBudgetMs) return unknown(`the confirm tap was answered ${took} ms after the screen was read, over the ${caps.confirmBudgetMs} ms allowed, so it may have landed on a different screen`);

    let placed = false;                                                        // 7
    try {
      const after = await readTree(ctx);
      const re = new RegExp(profile.placed);
      placed = shown(after.elements).some((e) => re.test(e.label));
    } catch { /* stays unknown */ }
    if (!placed) return unknown('confirm was tapped but the screen does not show the bet as placed');
    ledger.append({ type: 'outcome', id, result: 'placed' });
    return { ok: true, message: `bet placed: ${read.coin} ${read.side} $${read.stake}, round ${read.round}`, read, ledger: row };
  }, { expiresAt });
}
