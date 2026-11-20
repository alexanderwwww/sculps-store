// The money ledger: one JSON row per line, only ever appended, flushed to disk before the
// call returns. Row types:
//   reservation {id, udid, coin, side, stake, round, read}   written before the confirm tap
//   outcome     {id, result: placed | not_placed | unknown}  written after it (the latest row per id counts)
//   settlement  {id, result: won | lost, pnl}                written when the round has settled
//   reset       {what: 'losses'}                             Alex cleared the loss stop on the page
// A reservation with no outcome row is UNKNOWN: finger died between the tap and the look.
import fs from 'node:fs';

// The calendar day in Athens, as YYYY-MM-DD. Daily numbers roll over at Athens midnight.
export function athensDate(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

export class Ledger {
  constructor({ file, now = Date.now }) {
    this.file = file;
    this.now = now;
  }

  rows() {
    if (!fs.existsSync(this.file)) return [];
    return fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }

  append(row) {
    const t = this.now();
    const full = { t, date: athensDate(t), ...row };
    const fd = fs.openSync(this.file, 'a');
    try {
      fs.writeSync(fd, JSON.stringify(full) + '\n');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return full;
  }

  // One entry per bet, with its latest outcome and its settlement.
  bets() {
    const byId = new Map();
    for (const r of this.rows()) {
      if (r.type === 'reservation') byId.set(r.id, { ...r, outcome: 'unknown', settled: null, pnl: 0 });
      const b = byId.get(r.id);
      if (!b) continue;
      if (r.type === 'outcome') b.outcome = r.result;
      if (r.type === 'settlement') { b.settled = r.result; b.pnl = r.pnl; b.settledAt = r.t; }
    }
    return [...byId.values()];
  }

  // Everything below is worked out from the rows each time, so a restart cannot lose it.
  summary() {
    const today = athensDate(this.now());
    const rows = this.rows();
    const bets = this.bets();
    const live = bets.filter((b) => b.outcome !== 'not_placed');
    const todays = live.filter((b) => b.date === today);
    const settledToday = bets.filter((b) => b.settled && athensDate(b.settledAt) === today);
    const lastReset = rows.filter((r) => r.type === 'reset' && r.what === 'losses').map((r) => r.t).pop() || 0;
    const settled = bets.filter((b) => b.settled && b.settledAt > lastReset).sort((a, b) => a.settledAt - b.settledAt);
    let lossRun = 0;
    for (let i = settled.length - 1; i >= 0 && settled[i].settled === 'lost'; i--) lossRun++;
    return {
      today,
      spentToday: todays.reduce((s, b) => s + b.stake, 0),
      // What today can still cost: money already lost today, less money won, plus every
      // stake that is placed (or unknown) and not settled yet.
      lossToday: -settledToday.reduce((s, b) => s + b.pnl, 0),
      atRiskToday: live.filter((b) => !b.settled).reduce((s, b) => s + b.stake, 0),
      lossRun,
      unknown: bets.filter((b) => b.outcome === 'unknown').map((b) => ({ id: b.id, udid: b.udid, coin: b.coin, round: b.round, stake: b.stake })),
    };
  }

  hasBet(udid, coin, round) {
    const u = String(udid).toLowerCase();
    return this.rows().some((r) => r.type === 'reservation' && String(r.udid).toLowerCase() === u && r.coin === coin && r.round === round);
  }
}
