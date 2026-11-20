// Money rules (PLAN section 7). They live on the Mac. The numbers are typed by Alex on the
// page and kept in caps.json; no tool call can change them.
import fs from 'node:fs';

export const STAKES = [2, 5, 10];
export const COINS = ['BTC', 'SOL', 'ETH'];
export const SIDES = ['UP', 'DOWN'];

// Blank (null) means "not typed yet", and a blank number blocks every buy.
export const DEFAULT_CAPS = {
  mode: 'PAPER',
  perBetCap: 10,
  dailyCap: null,
  dailyLossLimit: null,
  lossStop: null,        // this many losses in a row stops live buys
  minSecondsLeft: null,  // a round with less time left than this is skipped
  maxStake: 2,           // $2 until the go-live gate unlocks more (PLAN section 11)
  gate: null,            // the go-live gate numbers; unset until Alex answers
  commandMaxAgeMs: 20000,
  confirmBudgetMs: 2000, // from reading the confirm screen to the confirm tap being answered
  // Before the wallet's screens are recorded (profile.readable), finger_act does not touch
  // inside the wallet at all. Alex can switch this on, on the page, for setting up with an
  // EMPTY wallet. It does nothing once the screens are recorded.
  walletSetup: false,
};

// What may be typed on the page. The upper bounds are finger's own, there to catch a slip
// of the finger (1e308, 99999), not a rule from anywhere else.
const NUMBER_RULES = {
  perBetCap: { max: 10, whole: false },
  dailyCap: { max: 1000, whole: false },
  dailyLossLimit: { max: 1000, whole: false },
  lossStop: { max: 100, whole: true },
  minSecondsLeft: { max: 3600, whole: true },
};

const fin = (...v) => v.every((x) => typeof x === 'number' && Number.isFinite(x));

export class Refusal extends Error {
  constructor(code, message) { super(message); this.code = code; this.refused = true; }
}

// What finger can do by itself today. Live mode needs all of it.
//   settlementReader: reading a round's result off the wallet and writing the settlement row.
//   It is not built (it needs Phantom's real screens, M4), so the daily loss stop and the
//   losses-in-a-row stop have nothing to count yet, and live mode stays off.
export const BUILT = { settlementReader: false };

export class Caps {
  constructor({ file, built = BUILT }) { this.file = file; this.built = built; this.problem = null; }

  // Never throws. A file that cannot be read is set aside and everything goes back to
  // PAPER with blank limits. A value that is not a plain number above zero reads as blank
  // (and a blank blocks buys): a hand-edited "100" or "x" never becomes a limit.
  read() {
    let stored = {};
    if (fs.existsSync(this.file)) {
      try {
        stored = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('not an object');
      } catch {
        stored = {};
        fs.renameSync(this.file, `${this.file}.bad`);
        this.problem = 'the money limits file could not be read. It was set aside; the mode is PAPER and the limits are blank until they are typed again.';
      }
    }
    const caps = { ...DEFAULT_CAPS, ...stored };
    const wrong = [];
    for (const k of Object.keys(NUMBER_RULES)) {
      if (caps[k] !== null && !(fin(caps[k]) && caps[k] > 0)) { wrong.push(k); caps[k] = null; }
    }
    for (const k of ['maxStake', 'commandMaxAgeMs', 'confirmBudgetMs']) {
      if (!(fin(caps[k]) && caps[k] > 0)) { wrong.push(k); caps[k] = DEFAULT_CAPS[k]; }
    }
    if (caps.mode !== 'LIVE' && caps.mode !== 'PAPER') wrong.push('mode');
    if (caps.mode !== 'LIVE' || wrong.length) caps.mode = 'PAPER';
    caps.walletSetup = caps.walletSetup === true;
    caps.problem = wrong.length ? `the money limits file has values that are not numbers (${wrong.join(', ')}): they count as blank and the mode is PAPER` : this.problem;
    return caps;
  }

  write(caps) {
    const { problem, ...keep } = caps;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(keep, null, 2));
    fs.renameSync(tmp, this.file);
    this.problem = null;
    return keep;
  }

  // The numbers Alex types on the page. Blank clears a number.
  setNumbers(patch) {
    const caps = this.read();
    for (const [k, rule] of Object.entries(NUMBER_RULES)) {
      if (!(k in patch)) continue;
      const raw = patch[k];
      if (raw === '' || raw === null) { caps[k] = null; continue; }
      const s = typeof raw === 'number' ? String(raw) : raw;
      const shape = rule.whole ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
      const n = typeof s === 'string' && shape.test(s) ? Number(s) : NaN;
      if (!(n > 0 && n <= rule.max)) {
        throw new Refusal('BAD_NUMBER', `${k} must be a ${rule.whole ? 'whole number' : 'number'} above zero and at most ${rule.max}`);
      }
      caps[k] = n;
    }
    if (caps.perBetCap === null) throw new Refusal('BAD_NUMBER', 'the per-bet cap cannot be blank or above $10');
    return this.write(caps);
  }

  // LIVE can be switched on only when every number is typed, the go-live gate is answered,
  // the confirm screen is known to be readable (decision 26) and results can be read.
  setMode(mode, profile) {
    const caps = this.read();
    if (mode === 'PAPER') { caps.mode = 'PAPER'; return this.write(caps); }
    if (mode !== 'LIVE') throw new Refusal('BAD_MODE', 'mode is PAPER or LIVE');
    const why = liveBlockers(caps, profile, this.built);
    if (why.length) throw new Refusal('LIVE_BLOCKED', `live mode stays off: ${why.join('; ')}`);
    caps.mode = 'LIVE';
    return this.write(caps);
  }

  setWalletSetup(on) {
    if (typeof on !== 'boolean') throw new Refusal('BAD_REQUEST', 'on is true or false');
    return this.write({ ...this.read(), walletSetup: on });
  }
}

export function liveBlockers(caps, profile, built = BUILT) {
  const why = [];
  if (!profile || profile.readable !== true) why.push('the confirm screen has not been read on the phone yet');
  if (!built || built.settlementReader !== true) why.push('finger cannot read a round\'s result from the wallet yet, so the loss stops have nothing to count');
  if (caps.dailyCap === null) why.push('the daily cap is blank');
  if (caps.dailyLossLimit === null) why.push('the daily loss limit is blank');
  if (caps.lossStop === null) why.push('the losses-in-a-row stop is blank');
  if (caps.minSecondsLeft === null) why.push('the minimum time left is blank');
  if (!caps.gate) why.push('the go-live gate numbers are not set');
  return why;
}

// Step 1 of a buy, again when its turn in the phone's lane comes, and again in the same
// tick as the reservation row is written. Throws a Refusal; returns nothing when the buy
// may go on. Every comparison is written so that a value that is not a number refuses.
export function checkBuy({ req, caps, profile, ledger, now, built = BUILT }) {
  if (caps.mode !== 'LIVE') throw new Refusal('PAPER_MODE', 'mode is PAPER: no real bet is placed');
  const why = liveBlockers(caps, profile, built);
  if (why.length) throw new Refusal('LIVE_BLOCKED', `live mode cannot run: ${why.join('; ')}`);
  if (!fin(caps.perBetCap, caps.maxStake, caps.dailyCap, caps.dailyLossLimit, caps.lossStop, caps.minSecondsLeft, caps.commandMaxAgeMs, caps.confirmBudgetMs)) {
    throw new Refusal('BAD_LIMITS', 'a money limit is not a number; type the limits again on the page');
  }
  if (!COINS.includes(req.coin)) throw new Refusal('BAD_REQUEST', 'coin must be BTC, SOL or ETH');
  if (!SIDES.includes(req.side)) throw new Refusal('BAD_REQUEST', 'side must be UP or DOWN');
  if (typeof req.round !== 'string' || req.round === '') throw new Refusal('BAD_REQUEST', 'the round is missing');
  if (!STAKES.includes(req.stake)) throw new Refusal('BAD_STAKE', 'the stake must be $2, $5 or $10');
  if (!fin(now, req.createdAt) || !(now - req.createdAt <= caps.commandMaxAgeMs) || !(now >= req.createdAt - 5000)) {
    throw new Refusal('STALE_COMMAND', 'this buy was asked too long ago');
  }
  if (!(req.stake <= caps.perBetCap)) throw new Refusal('OVER_BET_CAP', `$${req.stake} is over the per-bet cap of $${caps.perBetCap}`);
  if (!(req.stake <= caps.maxStake)) throw new Refusal('STAKE_LOCKED', `only $${caps.maxStake} bets are unlocked`);
  const s = ledger.summary();
  if (s.damaged || !fin(s.spentToday, s.lossToday, s.openStakes, s.lossRun)) {
    throw new Refusal('LEDGER_DAMAGED', `${s.damaged || 'the money ledger does not add up to numbers'}: buying is stopped until it is repaired`);
  }
  if (!(s.spentToday + req.stake <= caps.dailyCap)) {
    throw new Refusal('OVER_DAILY_CAP', `$${s.spentToday} already bet today; $${req.stake} more is over the daily cap of $${caps.dailyCap}`);
  }
  if (!(s.lossToday + s.openStakes + req.stake <= caps.dailyLossLimit)) {
    const open = s.openStakes > 0 ? ` plus $${s.openStakes} in bets with no result recorded (oldest from ${s.openSince})` : '';
    throw new Refusal('DAILY_LOSS_STOP', `today's loss ($${s.lossToday})${open} leaves no room for $${req.stake} under the daily loss limit of $${caps.dailyLossLimit}`);
  }
  if (!(s.lossRun < caps.lossStop)) throw new Refusal('LOSS_RUN_STOP', `${s.lossRun} losses in a row: live buys are stopped`);
  const mine = s.unknown.filter((u) => String(u.udid).toLowerCase() === String(req.udid).toLowerCase());
  if (mine.length) throw new Refusal('UNKNOWN_OPEN', `an earlier bet on this phone has no known outcome (${mine[0].coin} ${mine[0].round})`);
  if (ledger.hasBet(req.udid, req.coin, req.round)) {
    throw new Refusal('DUPLICATE', `there is already a bet for ${req.coin} ${req.round} on this phone`);
  }
}

// --- the wallet profile ------------------------------------------------------------------

const CONFIRM_FIELDS = ['coin', 'side', 'stake', 'round', 'price', 'secondsLeft'];
const isRect = (r) => Array.isArray(r) && r.length === 4 && fin(...r) && r[2] > 0 && r[3] > 0;
const pattern = (src) => new RegExp(src, 'i');

// Every label pattern that marks a buy or confirm button: the one finger_buy presses, plus
// any others recorded. Patterns are regular expressions, matched without regard to case.
export function guardedPatterns(profile) {
  const list = [profile.confirm && profile.confirm.label, ...(profile.confirmLabels || [])];
  return list.filter((s) => typeof s === 'string' && s !== '').map(pattern);
}

// Refuses a profile finger cannot guard. The wallet's bundle id is always needed, so the
// wallet is recognised even before its screens are recorded. A profile marked readable must
// carry everything the buy and the guard use; a half-filled one does not load.
export function checkProfile(profile) {
  const bad = [];
  if (!profile || typeof profile !== 'object') throw new Error('the wallet profile is missing');
  if (typeof profile.bundleId !== 'string' || profile.bundleId === '') bad.push('bundleId');
  if (profile.readable === true) {
    const c = profile.confirm || {};
    try {
      if (guardedPatterns(profile).length === 0) bad.push('confirm.label / confirmLabels (nothing to guard)');
      if (typeof c.label !== 'string' || c.label === '') bad.push('confirm.label');
      for (const f of CONFIRM_FIELDS) if (!c.fields || typeof c.fields[f] !== 'string') bad.push(`confirm.fields.${f}`); else pattern(c.fields[f]);
      if (typeof profile.placed !== 'string') bad.push('placed'); else pattern(profile.placed);
    } catch (e) {
      bad.push(`a pattern that is not a regular expression (${e.message})`);
    }
    const s = profile.screen || {};
    if (!(fin(s.width, s.height) && s.width > 0 && s.height > 0)) bad.push('screen.width / screen.height');
    if (!Array.isArray(profile.guardRects) || profile.guardRects.length === 0 || !profile.guardRects.every(isRect)) bad.push('guardRects');
    const f = profile.flow || {};
    if (!f.side || typeof f.side.UP !== 'string' || typeof f.side.DOWN !== 'string' || !f.stake || typeof f.review !== 'string') bad.push('flow');
  }
  if (bad.length) throw new Error(`the wallet profile cannot be used: ${bad.join(', ')}`);
  return profile;
}

// --- finger_act inside the wallet ---------------------------------------------------------

const MARGIN = 8; // points around a guarded button that also count as touching it

function grow(r) { return { x0: r.x - MARGIN, y0: r.y - MARGIN, x1: r.x + r.w + MARGIN, y1: r.y + r.h + MARGIN }; }

function pointIn(b, p) { return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1; }

// Does the straight line from a to b cross the box? (Liang-Barsky clipping.)
function segmentIn(b, a, c) {
  const dx = c.x - a.x, dy = c.y - a.y;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.x - b.x0], [dx, b.x1 - a.x], [-dy, a.y - b.y0], [dy, b.y1 - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

const touches = (box, points) => (points.length === 1 ? pointIn(box, points[0]) : segmentIn(box, points[0], points[1]));

const inWallet = (profile, appBundleId) => Boolean(profile && profile.bundleId && appBundleId === profile.bundleId);

// The buy and confirm elements on the screen right now: every element, shown or hidden,
// whose label matches a guarded pattern.
export function confirmElements(elements, appBundleId, profile) {
  if (!inWallet(profile, appBundleId)) return [];
  const patterns = guardedPatterns(profile);
  return elements.filter((e) => patterns.some((re) => re.test(e.label)));
}

// The wallet is showing its confirm screen: the confirm button is in the tree, or every
// field of the confirm screen reads. (Provisional: settled against Phantom's tree at M4.)
export function isConfirmScreen(elements, profile) {
  const c = profile.confirm;
  if (!c) return false;
  const has = (src) => elements.some((e) => pattern(src).test(e.label));
  return has(c.label) || Object.values(c.fields || {}).every(has);
}

// finger_act may never press the buy button. Inside the wallet a tap, double tap, hold or
// swipe is refused when:
//   0. the wallet's screens are not recorded yet (unless Alex switched wallet setup on);
//   1. it touches a rectangle recorded in the profile as holding a buy or confirm button.
//      This is checked against fixed points, whatever the tree says, because the tree was
//      read BEFORE the tap is sent and the wallet may have moved on by the time it lands;
//   2. it touches an element whose label matches a guarded pattern, or the button around it;
//   3. the confirm screen is showing: then nothing on it is touched at all.
// points: one point, or the two ends of a swipe. windowSize: this phone's screen in points.
export function guardWalletGesture({ profile, appBundleId, elements, points, windowSize, walletSetup = false }) {
  if (!inWallet(profile, appBundleId)) return;
  if (profile.readable !== true) {
    if (walletSetup === true) return;
    throw new Refusal('WALLET_NOT_RECORDED', 'the wallet\'s screens are not recorded yet, so finger does not touch inside it. Looking is fine. (For setting up with an empty wallet, Alex switches "wallet setup" on, on the finger page.)');
  }
  const s = profile.screen;
  if (!windowSize || windowSize.width !== s.width || windowSize.height !== s.height) {
    throw new Refusal('WALLET_SCREEN_UNKNOWN', `the wallet was recorded on a ${s.width} x ${s.height} screen and this phone is not that size, so finger does not touch inside it`);
  }
  for (const [x, y, w, h] of profile.guardRects) {
    if (touches(grow({ x, y, w, h }), points)) throw new Refusal('TOUCHES_CONFIRM', 'that gesture touches the place where the wallet puts its buy or confirm button. Only finger_buy presses it.');
  }
  for (const el of confirmElements(elements, appBundleId, profile)) {
    if (touches(grow(el.rect), points) || touches(grow(el.box), points)) throw new Refusal('TOUCHES_CONFIRM', `that gesture touches "${el.label}". Only finger_buy presses it.`);
  }
  if (isConfirmScreen(elements, profile)) {
    throw new Refusal('CONFIRM_SCREEN', 'the wallet is showing its confirm screen, and finger_act does not touch that screen at all. Only finger_buy presses confirm.');
  }
}

// Inside the wallet app, typing is digits and a decimal point only (never a phrase or a PIN).
export function refuseSecretTyping({ text, appBundleId, profile }) {
  if (inWallet(profile, appBundleId) && !/^[0-9.]+$/.test(text)) {
    throw new Refusal('TYPE_BLOCKED', 'inside the wallet finger types digits and a decimal point only');
  }
}

// A pop-up inside the wallet may be the wallet asking to confirm a bet, so finger_act only
// ever dismisses it: no accept, and no button picked by name (WDA presses any button whose
// label is given: Commands/FBAlertViewCommands.m:65-91). To be looked at again at M4.
export function refuseWalletAlert({ step, appBundleId, profile }) {
  if (inWallet(profile, appBundleId) && (step.accept === true || typeof step.name === 'string')) {
    throw new Refusal('ALERT_BLOCKED', 'inside the wallet finger only dismisses a pop-up; it does not accept one or press a button by name');
  }
}
