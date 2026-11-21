// Trade plan and position size. The stop may cost at most the per-trade limit (default $10), fees
// included, and never more than what is left before the daily-loss or drawdown floor.

export const DEFAULTS = {
  accountSize: 5000,      // starting balance of the evaluation
  dayStartBalance: 5000,  // balance at 00:30 UTC (02:30 Athens in winter), Kraken Prop's daily-loss base
  equityNow: 5000,        // what the account shows now (typed by Alex: the extension never reads his account)
  dailyLossPct: 3,
  maxDrawdownPct: 3,      // static, from the starting balance (Kraken Prop program rules)
  targetPct: 9,
  maxLossPerTrade: 10,
  feePerSidePct: 0.04,    // Kraken Prop: 0.04% per side
  levBTC: 10, levETH: 5, levOther: 2, // Kraken Prop sets leverage per instrument; change if the ticket shows another
  minLiquidityUSD: 5_000_000, // movers: 24h USD volume a pair needs
  minRange24hPct: 1,          // movers: 24h high-low range a pair needs (drops pegged and dead coins)
  sessionFrom: "15:30", sessionTo: "23:00",
};

export function limits(s) {
  const dailyFloor = s.dayStartBalance * (1 - s.dailyLossPct / 100);
  const ddFloor = s.accountSize * (1 - s.maxDrawdownPct / 100);
  const remDaily = s.equityNow - dailyFloor, remDD = s.equityNow - ddFloor;
  const budget = Math.max(0, Math.min(s.maxLossPerTrade, remDaily, remDD));
  const target = s.accountSize * (1 + s.targetPct / 100);
  return { dailyFloor, ddFloor, remDaily, remDD, budget, target, toTarget: target - s.equityNow,
    blocked: budget < 1 ? (remDaily <= remDD ? "daily loss limit reached" : "drawdown limit reached") : null };
}

export function leverageFor(base, s) {
  const b = String(base || "").toUpperCase();
  if (b === "BTC" || b === "XBT") return s.levBTC;
  if (b === "ETH") return s.levETH;
  return s.levOther;
}

const floorTo = (x, inc) => (inc > 0 ? Math.floor(x / inc + 1e-9) * inc : x);
export const roundTo = (x, inc) => (inc > 0 ? Math.round(x / inc) * inc : x);

// qty so that (entry - stop) * qty + fees on both sides <= budget, then capped by margin.
export function size({ entry, stop, feePerSide, budget, equity, lev, qtyInc = 0, minQty = 0 }) {
  const perUnit = Math.abs(entry - stop) + feePerSide * (entry + stop);
  if (!(perUnit > 0) || !(budget > 0)) return { qty: 0, why: "no risk budget" };
  let qty = budget / perUnit, capped = false;
  const maxNotional = equity * lev;
  if (qty * entry > maxNotional) { qty = maxNotional / entry; capped = true; }
  qty = floorTo(qty, qtyInc);
  if (qty <= 0 || qty < minQty) return { qty: 0, why: `size under the pair minimum (${minQty})` };
  const notional = qty * entry;
  return { qty, notional, margin: notional / lev, risk: qty * perUnit, fees: feePerSide * qty * (entry + stop), capped };
}

// Aquarius lesson 1: never chase strength. Same guard for shorts into a flush.
export function chasing(f, side) {
  const [, z5, z15, , , , , , , , , , , pos60] = f.x;
  if (side === "up" && (z15 > 1.5 || (pos60 > 0.4 && z5 > 1))) return "price just ran up: buying here is chasing";
  if (side === "down" && (z15 < -1.5 || (pos60 < -0.4 && z5 < -1))) return "price just flushed: shorting here is chasing";
  return null;
}

export function stopPct(planP, f, h) { return Math.max(planP.minStopPct, Math.exp(planP.stopZ * f.s * Math.sqrt(h)) - 1); }

// read: model.read() result; inst: { base, tick, qtyInc, minQty }
export function plan(model, f, read, s, inst) {
  const out = { ok: false, side: read.side, h: read.h };
  const lim = limits(s); out.limits = lim;
  if (!read.edge) return { ...out, reason: "no edge: stand aside" };
  if (lim.blocked) return { ...out, reason: lim.blocked };
  const ch = chasing(f, read.side); if (ch) return { ...out, reason: ch };
  const pp = model.horizons[String(read.h)].plan;
  if (Math.exp(f.s * Math.sqrt(read.h)) - 1 < (pp.minSdPct || 0)) return { ...out, reason: "too quiet: the move would not pay the fees" };
  const dir = read.side === "up" ? 1 : -1, price = f.price, tick = inst.tick || 0;
  const sp = stopPct(pp, f, read.h);
  const entry = roundTo(price, tick);
  const pull = price * pp.entryPull * f.s * Math.sqrt(5);           // the zone reaches a little against the trade, never above for a long
  const zone = dir > 0 ? [roundTo(price - pull, tick), entry] : [entry, roundTo(price + pull, tick)];
  const stop = roundTo(entry * (1 - dir * sp), tick);
  const tp = roundTo(entry * (1 + dir * sp * pp.rr), tick);
  const lev = leverageFor(inst.base, s), fee = s.feePerSidePct / 100;
  const z = size({ entry, stop, feePerSide: fee, budget: lim.budget, equity: s.equityNow, lev, qtyInc: inst.qtyInc, minQty: inst.minQty });
  if (!z.qty) return { ...out, reason: z.why };
  const reward = Math.abs(tp - entry) * z.qty - fee * z.qty * (entry + tp);
  return { ...out, ok: true, entry, zone, stop, tp, qty: z.qty, notional: z.notional, margin: z.margin, lev, risk: z.risk, reward,
    fees: z.fees, capped: z.capped, holdMin: pp.hold, stopPct: sp, rr: pp.rr };
}
