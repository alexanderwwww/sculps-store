/*
 * Fee engine (knowledge-base.md section 2): the real cost of each simulated
 * fill, never an invented number. Every input comes from a live response:
 *
 *  - Jupiter public quote API (lite-api.jup.ag/swap/v1/quote, reachable from
 *    here without a key, proven 2026-10-19): a BUY quote SOL -> coin for the
 *    trade's size, then a SELL quote coin -> SOL for exactly what the buy
 *    returned. 1 - sellOut/buyIn is the real round trip through the best route,
 *    pool fees and price impact included.
 *  - GMGN token_fee_info: the pool's fee_ratio and the token's buy/sell tax.
 *  - Network cost per transaction: the median gas_native (SOL) that the last
 *    50 trades on this coin actually paid (GMGN token_trades), i.e. what lands
 *    now; GMGN's own "auto" priority suggestion (gas_price_list) is logged
 *    beside it. SOL in USD from GMGN major_coin_prices.
 *
 * Routes compared: "jupiter" (fully priced by its quotes) and "gmgn" (pool fee
 * + network, but GMGN's own swap fee is not exposed by any read endpoint, so
 * the GMGN route is UNPRICED and never chosen on a guess). The cheapest priced
 * route wins. Skips: no priced route, price impact over the 2.36% cap, and the
 * payoff rule W >= 3|Λ| failing after the real costs (fib.mjs payoff).
 */
import { V2, payoff } from "./fib.mjs";
import { WSOL } from "./gmgn.mjs";

const JUP = () => process.env.ULTRA_JUPITER || "https://lite-api.jup.ag/swap/v1/quote";
const median = (a) => { const s = a.filter((x) => x > 0).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

// Jupiter's keyless lite API rate-limits bursts: calls start at least gapMs apart.
let nextSlot = 0;
const JUP_GAP = () => Number(process.env.ULTRA_JUP_GAP_MS ?? 1500);
export async function jupQuote(inputMint, outputMint, amount, { fetchImpl = fetch, slippageBps = 236 } = {}) {
  const slot = Math.max(Date.now(), nextSlot);
  nextSlot = slot + JUP_GAP();
  if (slot > Date.now()) await new Promise((ok) => setTimeout(ok, slot - Date.now()));
  const url = `${JUP()}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${Math.floor(amount)}&slippageBps=${slippageBps}`;
  const t0 = Date.now();
  let r = await fetchImpl(url);
  // Jupiter's keyless API answers 429 "[API Gateway] Too many requests" even at 1.1 s spacing (2026-10-19): back off 1.5 / 3 / 6 s
  for (let i = 0, wait = 1500; r.status === 429 && i < 3; i++, wait *= 2) { await new Promise((ok) => setTimeout(ok, wait)); nextSlot = Date.now() + JUP_GAP(); r = await fetchImpl(url); }
  const j = await r.json().catch(() => null);
  if (r.status !== 200 || !j || !j.outAmount) throw new Error(`jupiter ${r.status} ${JSON.stringify(j)?.slice(0, 120)}`);
  return { ms: Date.now() - t0, inAmount: Number(j.inAmount), outAmount: Number(j.outAmount), impact: Number(j.priceImpactPct) || 0, route: (j.routePlan || []).map((p) => p.swapInfo?.label).filter(Boolean) };
}

/**
 * Cost of one round trip of `notionalUsd` into `mint`.
 * gm: {feeInfo, trades, gas, solUsd}. Returns per-side cost (fraction) of the chosen route.
 */
export async function quoteCosts({ mint, notionalUsd, gm, fetchImpl = fetch, onCall = () => {} }) {
  const solUsd = Number(gm.solUsd);
  if (!(solUsd > 0)) return { ok: false, why: "SOL price missing" };
  const netSol = median((gm.trades || []).map((t) => Number(t.gas_native)));
  if (netSol === null) return { ok: false, why: "network cost missing (no recent trades with gas_native)" };
  const netUsdSide = netSol * solUsd;
  const sec = gm.feeInfo?.security || {};
  const buyTax = Number(sec.buy_tax) || 0, sellTax = Number(sec.sell_tax) || 0;
  const pool = (gm.feeInfo?.pool_fee_info_list || []).slice().sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0))[0] || null;
  const routes = [];

  // Jupiter: buy, then sell what the buy returned
  try {
    const lamports = (notionalUsd / solUsd) * 1e9;
    const buy = await jupQuote(WSOL, mint, lamports, { fetchImpl });
    onCall({ tool: "jup.ag quote", ms: buy.ms, ok: true });
    const sell = await jupQuote(mint, WSOL, buy.outAmount, { fetchImpl });
    onCall({ tool: "jup.ag quote", ms: sell.ms, ok: true });
    // Measured 2026-10-19: on memecoins the price moves in the 1.5 s between two quotes, so one
    // round trip came out BELOW the pool's own fee and a size-reference quote "showed" 4.76% impact.
    // Jupiter's priceImpactPct barely moved between $2.36 and $100, so it is not used either.
    // Conservative, every term real: per side = max(round trip / 2, pool fee) + tax + network;
    // impact = the round-trip loss the fees do not explain.
    const rt = 1 - sell.outAmount / buy.inAmount;
    const poolFee = pool ? Number(pool.fee_ratio) : 0;
    const swapSide = Math.max(rt / 2, poolFee);
    const side = swapSide + (buyTax + sellTax) / 2 + netUsdSide / notionalUsd;
    const impact = Math.max(0, rt / 2 - poolFee - (buyTax + sellTax) / 2);
    routes.push({ route: "jupiter", priced: true, costSide: side, rtSwap: rt, swapSide, impact, jupImpactPct: buy.impact, path: buy.route, buyOut: buy.outAmount, sellOut: sell.outAmount });
  } catch (e) {
    onCall({ tool: "jup.ag quote", ms: 0, ok: false, error: String(e.message).slice(0, 120) });
    routes.push({ route: "jupiter", priced: false, why: String(e.message).slice(0, 120) });
  }
  // GMGN: what is known, and what is not
  routes.push({
    route: "gmgn", priced: false, poolFee: pool ? Number(pool.fee_ratio) : null, exchange: pool?.exchange || null,
    autoPrioritySol: gm.gas ? Number(gm.gas.auto) : null,
    why: "GMGN's own swap fee is not exposed by any read endpoint: unpriced, not chosen",
  });

  const priced = routes.filter((r) => r.priced).sort((a, b) => a.costSide - b.costSide);
  const best = priced[0] || null;
  const base = { solUsd, netSol, netUsdSide: +netUsdSide.toFixed(5), buyTax, sellTax, poolFee: pool ? Number(pool.fee_ratio) : null, routes };
  if (!best) return { ok: false, why: "no priced route", ...base };
  if (best.impact > V2.slippageCap) return { ok: false, why: `price impact ${(best.impact * 100).toFixed(2)}% over the 2.36% cap`, route: best.route, costSide: best.costSide, ...base };
  return { ok: true, route: best.route, costSide: +best.costSide.toFixed(6), costRt: +(2 * best.costSide).toFixed(6), ...base };
}

/** The payoff rule after the real round-trip cost: W >= 3|Λ| on this swing. */
export function costRule(swing, costRt) {
  const p = payoff(swing.low, swing.high, costRt);
  return { ok: p.ok, W: +p.W.toFixed(4), Lam: +p.Lam.toFixed(4), need: +p.need.toFixed(4), why: p.ok ? `W ${p.W.toFixed(3)} >= 3|Λ| ${p.need.toFixed(3)}` : `costs break the payoff: W ${p.W.toFixed(3)} < 3|Λ| ${p.need.toFixed(3)} at ${(costRt * 100).toFixed(2)}% round trip` };
}
