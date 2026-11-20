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
  confirmBudgetMs: 2000, // from reading the confirm screen to tapping confirm
};

const NUMBER_FIELDS = ['perBetCap', 'dailyCap', 'dailyLossLimit', 'lossStop', 'minSecondsLeft'];

export class Refusal extends Error {
  constructor(code, message) { super(message); this.code = code; this.refused = true; }
}

export class Caps {
  constructor({ file }) { this.file = file; }

  read() {
    if (!fs.existsSync(this.file)) return { ...DEFAULT_CAPS };
    return { ...DEFAULT_CAPS, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
  }

  write(caps) {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(caps, null, 2));
    fs.renameSync(tmp, this.file);
    return caps;
  }

  // The numbers Alex types on the page. Blank clears a number.
  setNumbers(patch) {
    const caps = this.read();
    for (const k of NUMBER_FIELDS) {
      if (!(k in patch)) continue;
      const raw = patch[k];
      if (raw === '' || raw === null) { caps[k] = null; continue; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Refusal('BAD_NUMBER', `${k} must be a number above zero`);
      caps[k] = n;
    }
    if (caps.perBetCap === null || caps.perBetCap > 10) throw new Refusal('BAD_NUMBER', 'the per-bet cap cannot be blank or above $10');
    return this.write(caps);
  }

  // LIVE can be switched on only when every number is typed, the go-live gate is answered
  // and the confirm screen is known to be readable (decision 26).
  setMode(mode, profile) {
    const caps = this.read();
    if (mode === 'PAPER') { caps.mode = 'PAPER'; return this.write(caps); }
    if (mode !== 'LIVE') throw new Refusal('BAD_MODE', 'mode is PAPER or LIVE');
    const why = liveBlockers(caps, profile);
    if (why.length) throw new Refusal('LIVE_BLOCKED', `live mode stays off: ${why.join('; ')}`);
    caps.mode = 'LIVE';
    return this.write(caps);
  }
}

export function liveBlockers(caps, profile) {
  const why = [];
  if (!profile || profile.readable !== true) why.push('the confirm screen has not been read on the phone yet');
  if (caps.dailyCap === null) why.push('the daily cap is blank');
  if (caps.dailyLossLimit === null) why.push('the daily loss limit is blank');
  if (caps.lossStop === null) why.push('the losses-in-a-row stop is blank');
  if (caps.minSecondsLeft === null) why.push('the minimum time left is blank');
  if (!caps.gate) why.push('the go-live gate numbers are not set');
  return why;
}

// Step 1 of a buy, and again in the same tick as the reservation row is written.
// Throws a Refusal; returns nothing when the buy may go on.
export function checkBuy({ req, caps, profile, ledger, now }) {
  if (caps.mode !== 'LIVE') throw new Refusal('PAPER_MODE', 'mode is PAPER: no real bet is placed');
  const why = liveBlockers(caps, profile);
  if (why.length) throw new Refusal('LIVE_BLOCKED', `live mode cannot run: ${why.join('; ')}`);
  if (!COINS.includes(req.coin)) throw new Refusal('BAD_REQUEST', 'coin must be BTC, SOL or ETH');
  if (!SIDES.includes(req.side)) throw new Refusal('BAD_REQUEST', 'side must be UP or DOWN');
  if (typeof req.round !== 'string' || req.round === '') throw new Refusal('BAD_REQUEST', 'the round is missing');
  if (!STAKES.includes(req.stake)) throw new Refusal('BAD_STAKE', 'the stake must be $2, $5 or $10');
  if (!(now - req.createdAt <= caps.commandMaxAgeMs) || now < req.createdAt - 5000) {
    throw new Refusal('STALE_COMMAND', 'this buy was asked too long ago');
  }
  if (req.stake > caps.perBetCap) throw new Refusal('OVER_BET_CAP', `$${req.stake} is over the per-bet cap of $${caps.perBetCap}`);
  if (req.stake > caps.maxStake) throw new Refusal('STAKE_LOCKED', `only $${caps.maxStake} bets are unlocked`);
  const s = ledger.summary();
  if (s.spentToday + req.stake > caps.dailyCap) {
    throw new Refusal('OVER_DAILY_CAP', `$${s.spentToday} already bet today; $${req.stake} more is over the daily cap of $${caps.dailyCap}`);
  }
  if (s.lossToday + s.atRiskToday + req.stake > caps.dailyLossLimit) {
    throw new Refusal('DAILY_LOSS_STOP', `today's loss ($${s.lossToday}) plus money still in play ($${s.atRiskToday}) leaves no room under the daily loss limit of $${caps.dailyLossLimit}`);
  }
  if (s.lossRun >= caps.lossStop) throw new Refusal('LOSS_RUN_STOP', `${s.lossRun} losses in a row: live buys are stopped`);
  const mine = s.unknown.filter((u) => String(u.udid).toLowerCase() === String(req.udid).toLowerCase());
  if (mine.length) throw new Refusal('UNKNOWN_OPEN', `an earlier bet on this phone has no known outcome (${mine[0].coin} ${mine[0].round})`);
  if (ledger.hasBet(req.udid, req.coin, req.round)) {
    throw new Refusal('DUPLICATE', `there is already a bet for ${req.coin} ${req.round} on this phone`);
  }
}

// --- gestures near the buy button ---------------------------------------------------------

const MARGIN = 8; // points around the confirm element that also count as touching it

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

// The buy and confirm elements on the screen right now, by the labels recorded in the profile.
export function confirmElements(elements, appBundleId, profile) {
  if (!profile || !profile.bundleId || appBundleId !== profile.bundleId) return [];
  const labels = profile.confirmLabels || [];
  return elements.filter((e) => labels.includes(e.label.trim()));
}

// finger_act may never press the buy button: any gesture whose point or path touches it is refused.
export function refuseIfTouchesConfirm({ elements, appBundleId, profile, points }) {
  for (const el of confirmElements(elements, appBundleId, profile)) {
    const box = grow(el.rect);
    const hit = points.length === 1 ? pointIn(box, points[0]) : segmentIn(box, points[0], points[1]);
    if (hit) throw new Refusal('TOUCHES_CONFIRM', `that gesture touches "${el.label}". Only finger_buy presses it.`);
  }
}

// Inside the wallet app, typing is digits and a decimal point only (never a phrase or a PIN).
export function refuseSecretTyping({ text, appBundleId, profile }) {
  if (profile && profile.bundleId && appBundleId === profile.bundleId && !/^[0-9.]+$/.test(text)) {
    throw new Refusal('TYPE_BLOCKED', 'inside the wallet finger types digits and a decimal point only');
  }
}
