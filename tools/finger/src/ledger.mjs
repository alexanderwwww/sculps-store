// The money ledger: one JSON row per line, only ever appended, flushed to disk before the
// call returns. Row types:
//   reservation {id, udid, coin, side, stake, round, read}   written before the confirm tap
//   outcome     {id, result: placed | not_placed | unknown}  written after it (the latest row per id counts)
//   settlement  {id, result: won | lost, pnl}                written when the round has settled
//   reset       {what: 'losses'}                             Alex cleared the loss stop on the page
// A reservation with no outcome row is UNKNOWN: finger died between the tap and the look.
//
// Who writes what today: buy.mjs writes reservations and outcomes; the page writes resets and
// resolves an UNKNOWN bet (resolve). settle() is the one way a settlement row is written, and
// NOTHING calls it yet: reading a round's result off the wallet is not built, and live mode
// is blocked until it is (guard.mjs liveBlockers).
import { appendJsonl, readJsonl, repairTail } from './jsonl.mjs';
import { Refusal } from './guard.mjs';

// The calendar day in Athens, as YYYY-MM-DD. Daily numbers roll over at Athens midnight.
export function athensDate(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const text = (v) => typeof v === 'string' && v !== '';

// A row counts only when every field the sums use is the right kind of value.
function valid(r) {
  if (!fin(r.t)) return false;
  if (r.type === 'reservation') return text(r.id) && text(r.udid) && text(r.coin) && text(r.round) && fin(r.stake) && r.stake > 0 && text(r.date);
  if (r.type === 'outcome') return text(r.id) && ['placed', 'not_placed', 'unknown'].includes(r.result);
  if (r.type === 'settlement') return text(r.id) && ['won', 'lost'].includes(r.result) && fin(r.pnl);
  if (r.type === 'reset') return r.what === 'losses';
  return false;
}

export class Ledger {
  constructor({ file, now = Date.now }) {
    this.file = file;
    this.now = now;
    this.torn = repairTail(file) ? 1 : 0; // unfinished last rows set aside since finger started
  }

  // { rows, bad }: the rows that count, and how many lines had to be left out.
  read() {
    const { rows, bad } = readJsonl(this.file);
    const good = rows.filter(valid);
    return { rows: good, bad: bad.length + (rows.length - good.length) };
  }

  rows() { return this.read().rows; }

  append(row) {
    if (repairTail(this.file)) this.torn++;
    const t = this.now();
    const full = { t, date: athensDate(t), ...row };
    appendJsonl(this.file, full);
    return full;
  }

  // One entry per bet, with its latest outcome and its settlement.
  bets(rows = this.rows()) {
    const byId = new Map();
    for (const r of rows) {
      if (r.type === 'reservation') byId.set(r.id, { ...r, outcome: 'unknown', settled: null, pnl: 0 });
      const b = byId.get(r.id);
      if (!b) continue;
      if (r.type === 'outcome') b.outcome = r.result;
      if (r.type === 'settlement') { b.settled = r.result; b.pnl = r.pnl; b.settledAt = r.t; }
    }
    return [...byId.values()];
  }

  // Everything below is worked out from the rows each time, so a restart cannot lose it.
  // It never throws: a damaged file is reported in "damaged", and that stops buys (guard.mjs).
  summary() {
    const today = athensDate(this.now());
    const { rows, bad } = this.read();
    const bets = this.bets(rows);
    const live = bets.filter((b) => b.outcome !== 'not_placed');
    const todays = live.filter((b) => b.date === today);
    const settledToday = bets.filter((b) => b.settled && athensDate(b.settledAt) === today);
    const lastReset = rows.filter((r) => r.type === 'reset').map((r) => r.t).pop() || 0;
    const settled = bets.filter((b) => b.settled && b.settledAt > lastReset).sort((a, b) => a.settledAt - b.settledAt);
    let lossRun = 0;
    for (let i = settled.length - 1; i >= 0 && settled[i].settled === 'lost'; i--) lossRun++;
    const open = live.filter((b) => !b.settled);
    return {
      today,
      spentToday: todays.reduce((s, b) => s + b.stake, 0),
      // Money lost today, less money won today (by the day the result was recorded).
      lossToday: -settledToday.reduce((s, b) => s + b.pnl, 0),
      // Every stake that was placed (or is unknown) and has no result recorded, from ANY day:
      // until a result is recorded that money may still be lost.
      openStakes: open.reduce((s, b) => s + b.stake, 0),
      openSince: open.length ? open.map((b) => b.date).sort()[0] : null,
      openBets: open.filter((b) => b.outcome === 'placed').map((b) => ({ id: b.id, udid: b.udid, coin: b.coin, round: b.round, stake: b.stake, date: b.date })),
      lossRun,
      unknown: bets.filter((b) => b.outcome === 'unknown').map((b) => ({ id: b.id, udid: b.udid, coin: b.coin, round: b.round, stake: b.stake, date: b.date })),
      damaged: bad > 0 ? `${bad} line${bad === 1 ? '' : 's'} of the money ledger cannot be read` : null,
      torn: this.torn,
    };
  }

  hasBet(udid, coin, round) {
    const u = String(udid).toLowerCase();
    return this.rows().some((r) => r.type === 'reservation' && String(r.udid).toLowerCase() === u && r.coin === coin && r.round === round);
  }

  // Alex says on the page what happened to a bet finger could not read the outcome of.
  resolve(id, result) {
    if (!['placed', 'not_placed'].includes(result)) throw new Refusal('BAD_REQUEST', 'say placed or not_placed');
    const bet = this.bets().find((b) => b.id === id);
    if (!bet || bet.outcome !== 'unknown') throw new Refusal('NOT_UNKNOWN', 'there is no bet with an unknown outcome under that id');
    return this.append({ type: 'outcome', id, result, by: 'page' });
  }

  // Records how a placed bet ended. pnl is what the bet made (won, zero or more) or cost
  // (lost, zero down to minus the stake).
  settle(id, result, pnl) {
    const bet = this.bets().find((b) => b.id === id);
    if (!bet || bet.outcome !== 'placed') throw new Refusal('NOT_PLACED', 'there is no placed bet under that id');
    if (bet.settled) throw new Refusal('ALREADY_SETTLED', 'that bet already has a result');
    const ok = fin(pnl) && ((result === 'won' && pnl >= 0) || (result === 'lost' && pnl <= 0 && pnl >= -bet.stake));
    if (!ok) throw new Refusal('BAD_REQUEST', 'a result is won with a profit of zero or more, or lost with a loss of at most the stake');
    return this.append({ type: 'settlement', id, result, pnl });
  }
}
