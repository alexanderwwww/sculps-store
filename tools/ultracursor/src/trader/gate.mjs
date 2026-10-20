/*
 * Gate G of the gmgn-fib plan, on GMGN's own data. Each check says whether it
 * passed, the value it saw and whether GMGN's data can actually prove it
 * ("real") or only approximates it ("approx"). A check whose data is missing
 * FAILS: paper trading must never count a trade the plan would not take.
 *
 * Field names come from responses recorded on 2026-10-19 (test/fixtures/gmgn/).
 */

const num = (x) => (x === null || x === undefined || x === "" ? null : Number(x));

/** Cheap pre-filter on one row of rrs/api/v1/trending_multichain (abbreviated keys). */
export function prefilter(row, nowSec) {
  const created = num(row.ct) || num(row.ot);
  const age = created ? nowSec - created : null;
  if (age === null || age < 8 * 60 || age > 6 * 3600) return { ok: false, why: "age" };
  if (!(num(row.lq) >= 13_000)) return { ok: false, why: "liquidity" };
  if (!(num(row.t10) < 0.25)) return { ok: false, why: "top10" };
  if ((num(row.smt) || 0) + (num(row.kol) || 0) < 2) return { ok: false, why: "smart" };
  return { ok: true };
}

/** Sum of volume over the last n closed 1m candles vs the n before. */
export function volumeRising(candles, n = 15) {
  if (candles.length < 2 * n) return { ok: false, value: `only ${candles.length} candles` };
  const v = (a) => a.reduce((s, c) => s + c.v, 0);
  const now = v(candles.slice(-n)), before = v(candles.slice(-2 * n, -n));
  return { ok: now > before, value: `${Math.round(now)} vs ${Math.round(before)} (last 15m vs prior 15m)` };
}

/** Did the creator sell? From api/v1/tokens/top_buyers holderInfo, or null if not visible. */
export function devSold(topBuyers, creator) {
  const info = topBuyers?.holders?.holderInfo || [];
  const me = info.find((h) => h.wallet_address === creator);
  if (!me) return null;
  return me.status === "sold" || me.status === "sold_part" || me.status === "transfered";
}

/**
 * full: one item of mrwapi/v1/multi_token_full_info; topBuyers: data of
 * api/v1/tokens/top_buyers; candles: closed 1m candles.
 */
export function gate({ full, topBuyers, candles, nowSec }) {
  const sec = full.security || {};
  const ts = full.trade_stat || {};
  const checks = [];
  const add = (name, ok, value, kind = "real") => checks.push({ name, ok: !!ok, value, kind });

  const age = nowSec - (num(full.creation_timestamp) || num(full.open_timestamp) || nowSec);
  add("age 8m-6h", age >= 480 && age <= 21600, `${Math.round(age / 60)} min`);

  const liq = num(full.liquidity);
  add("liquidity >= $13k", liq >= 13_000, liq === null ? "missing" : `$${Math.round(liq)}`);
  const burned = sec.burn_status === "burn" || sec.lock_summary?.is_locked === true;
  add("LP burned or locked", burned, `burn_status=${sec.burn_status ?? "?"} locked=${sec.lock_summary?.is_locked ?? "?"}`);

  const t10 = num(full.top_10_holder_rate ?? sec.top_10_holder_rate);
  add("top10 < 25%", t10 !== null && t10 < 0.25, t10 === null ? "missing" : `${(t10 * 100).toFixed(1)}%`);

  const dev = num(full.creator_hold_rate);
  add("dev holds < 5%", dev !== null && dev < 0.05, dev === null ? "missing" : `${(dev * 100).toFixed(2)}%`);
  const sold = devSold(topBuyers, full.creator_address);
  add("dev has not sold", sold !== true, sold === null ? "creator not among first 70 buyers: unknown" : sold ? "sold" : "holding");

  add("mint renounced", sec.renounced_mint === true, String(sec.renounced_mint));
  add("freeze renounced", sec.renounced_freeze_account === true, String(sec.renounced_freeze_account));
  // GMGN returns is_honeypot=null on Solana; can_not_sell and is_show_alert are what it does set.
  add("no sell block / alert", sec.is_honeypot !== true && num(sec.can_not_sell) !== 1 && sec.is_show_alert !== true,
    `can_not_sell=${sec.can_not_sell} alert=${sec.is_show_alert} honeypot=${sec.is_honeypot} rug_ratio=${full.rug?.rug_ratio ?? full.rug_ratio}`, "approx");

  const vr = volumeRising(candles);
  add("15m volume rising", vr.ok, vr.value);

  const smart = (num(ts.smart_wallets) || 0) + (num(ts.renowned_wallets) || 0);
  add(">= 2 smart/KOL buyers", smart >= 2, `smart=${ts.smart_wallets ?? "?"} kol=${ts.renowned_wallets ?? "?"} (lifetime, token <= 6h old)`, "approx");

  return { pass: checks.every((c) => c.ok), checks, failed: checks.filter((c) => !c.ok).map((c) => c.name) };
}
