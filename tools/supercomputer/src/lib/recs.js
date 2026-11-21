// Recommendations: the scan's best trade now, and what its own track record teaches it.
// A recommendation exists only when the plan exists, and the plan exists only when the model's band
// passed out-of-sample after fees. Learning can only push a setup DOWN, never invent one.

export const keysOf = (r) => [`coin:${r.coin}`, ...(r.tags || []).map((t) => `tag:${t}`), `hour:${r.hourAthens}`, `side:${r.side}`];

// learned stats from settled recommendations: key -> { n, wins, R }
export function learn(recs) {
  const st = {};
  for (const r of recs) if (r.status === "win" || r.status === "loss" || r.status === "timeout") for (const k of keysOf(r)) {
    const s = (st[k] ||= { n: 0, wins: 0, R: 0 }); s.n++; if (r.R > 0) s.wins++; s.R += r.R;
  }
  return st;
}
// 1 = no knowledge; below 1 when a coin, setup, hour or side has lost on 8+ scored calls
export function weight(st, cand) {
  let w = 1; const why = [];
  for (const k of keysOf(cand)) { const s = st[k]; if (s && s.n >= 8 && s.R / s.n < 0) { w *= 0.5; why.push(`${k.split(":")[1]} lost ${s.n - s.wins} of ${s.n}`); } }
  return { w, why };
}

// cands: [{ coin, name, plan, read, tags, hourAthens }] -> ranked, only real plans
export function rank(cands, st) {
  return cands.filter((c) => c.plan && c.plan.ok).map((c) => {
    const lw = weight(st, { coin: c.coin, tags: c.tags, hourAthens: c.hourAthens, side: c.plan.side });
    const test = c.read.band.test.plan; // measured net % per trade for this band, unseen data, after fees
    return { ...c, score: (test.netPct + 0.01) * lw.w * (c.read.conf - 0.5 + 0.01), learned: lw };
  }).filter((c) => c.learned.w > 0.2).sort((a, b) => b.score - a.score);
}

export function makeRec(c, t0) {
  const p = c.plan;
  return { id: `${c.coin}-${p.side}-${t0}`, coin: c.coin, key: c.key, side: p.side, h: p.h, entry: p.entry, stop: p.stop, tp: p.tp, hold: p.holdMin, qty: p.qty,
    risk: p.risk, t0, tags: c.tags || [], hourAthens: c.hourAthens, status: "open" };
}

// Replays the plan on the bars that came after it: stop first if one bar touches both.
export function settleRec(rec, bars, feePerSide = 0.0004) {
  if (rec.status !== "open") return rec;
  const after = bars.filter((b) => b.t >= rec.t0);
  const end = rec.t0 + rec.hold * 60;
  if (!after.length || after[after.length - 1].t + 60 < Math.min(end, rec.t0 + 60)) return rec;
  const dir = rec.side === "up" ? 1 : -1;
  let exit = null, status = null;
  for (const b of after) {
    if (b.t >= end) break;
    if (dir > 0 ? b.l <= rec.stop : b.h >= rec.stop) { exit = rec.stop; status = "loss"; break; }
    if (dir > 0 ? b.h >= rec.tp : b.l <= rec.tp) { exit = rec.tp; status = "win"; break; }
  }
  if (!status) {
    const last = after.filter((b) => b.t + 60 <= end).pop();
    if (!last || last.t + 60 < end) return rec; // window still running
    exit = last.c; status = "timeout";
  }
  const riskPer = Math.abs(rec.entry - rec.stop) + feePerSide * (rec.entry + rec.stop);
  const pnlPer = dir * (exit - rec.entry) - feePerSide * (rec.entry + exit);
  return { ...rec, status, exit, R: pnlPer / riskPer };
}
