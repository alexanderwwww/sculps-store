// Scorecard: every 5- and 15-minute call is logged and marked hit/miss when its window closes.
export const athensDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

// One call per coin per horizon per window: a 5m call at :00 :05 :10 …, a 15m call at :00 :15 :30 :45 (bar close times).
export function shouldLog(log, coin, h, tClose) {
  if (Math.round(tClose / 60) % h !== 0) return false;
  return !log.some((c) => c.coin === coin && c.h === h && c.t0 === tClose);
}

export function makeCall(coin, read, tClose, extra = {}) {
  return { id: `${coin}-${read.h}-${tClose}`, coin, h: read.h, t0: tClose, tEnd: tClose + read.h * 60, p0: read.price, side: read.side,
    conf: +read.conf.toFixed(4), edge: !!read.edge, status: "open", ...extra };
}

// bars: closed 1m bars of that coin; the price at tEnd is the close of the bar that ends at tEnd.
export function settle(call, bars) {
  if (call.status !== "open") return call;
  const b = bars.find((x) => x.t + 60 === call.tEnd);
  if (!b) return call;
  const moved = b.c - call.p0;
  const status = moved === 0 ? "flat" : (moved > 0) === (call.side === "up") ? "hit" : "miss";
  return { ...call, status, p1: b.c };
}

export function tally(log, nowMs = Date.now(), filter = () => true) {
  const today = athensDay(nowMs), res = {};
  for (const scope of ["today", "all"]) for (const h of [5, 15]) {
    const s = log.filter((c) => c.h === h && filter(c) && (scope === "all" || athensDay(c.t0 * 1000) === today));
    const hit = s.filter((c) => c.status === "hit").length, miss = s.filter((c) => c.status === "miss").length;
    res[`${scope}${h}`] = { hit, miss, open: s.filter((c) => c.status === "open").length, rate: hit + miss ? hit / (hit + miss) : null };
  }
  return res;
}

export const prune = (log, keep = 5000) => (log.length > keep ? log.slice(log.length - keep) : log);
