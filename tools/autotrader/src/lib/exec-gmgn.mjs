// Real trades through GMGN's own API, on Alex's GMGN wallet. Standing rule (AGENTS.md rule 26): inside these caps a buy
// goes through with no card. Above them, or on Kimchi, it never does.
import { SOL_MINT } from "./gmgn.mjs";
export const KIMCHI = "CSocnzcRpgSCr1naKcNTieWZUxb6rABe45j844m7pump";
export const CAPS = { maxSolPerTrade: 0.05, perHour: 10, perDay: 40, floorFrac: 0.7, slippagePct: 20, priorityFeeSol: "0.0005", pollMs: 5000, pollTries: 8 };
const LAMPORTS = 1e9;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function gmgnExec({ client, wallet, balanceSol, caps = CAPS, cfg, now = Date.now, wait = sleep, startSol = null }) {
  const stamps = [];
  const state = { startSol, halted: null };
  const exec = {
    name: "live",
    state,
    caps,
    /** SOL to spend: the strategy's equity fraction of the wallet, never above the per-trade cap. */
    async sizeSol() {
      const bal = await balanceSol();
      if (state.startSol == null) state.startSol = bal;
      return { bal, sol: Math.min(caps.maxSolPerTrade, +(bal * cfg.stakeFrac).toFixed(4)) };
    },
    gate(mint, bal) {
      if (state.halted) return state.halted;
      if (mint === KIMCHI) return "Kimchi is never bought";
      if (state.startSol != null && bal < state.startSol * caps.floorFrac) { state.halted = `wallet is ${((1 - bal / state.startSol) * 100).toFixed(0)}% down: trading halted`; return state.halted; }
      const t = now();
      const hour = stamps.filter((x) => t - x < 3600e3).length, day = stamps.filter((x) => t - x < 86400e3).length;
      if (hour >= caps.perHour) return `${caps.perHour} buys in the last hour`;
      if (day >= caps.perDay) return `${caps.perDay} buys in the last day`;
      return null;
    },
    async buy({ mint }) {
      const { bal, sol } = await exec.sizeSol();
      const why = exec.gate(mint, bal);
      if (why) return { ok: false, why };
      if (!(sol >= 0.005)) return { ok: false, why: `stake ${sol} SOL is too small to trade` };
      const lamports = Math.round(sol * LAMPORTS);
      let q;
      try { q = await client.quote({ from: wallet, input: SOL_MINT, output: mint, amount: lamports, slippage: caps.slippagePct }); }
      catch (e) { return { ok: false, why: `quote: ${e.message.slice(0, 100)}` }; }
      if (!q || !q.output_amount || !(Number(q.output_amount) > 0)) return { ok: false, why: "quote returned no output" };
      stamps.push(now());                                                       // counted when the order is SENT, even if it fails later
      let r;
      try {
        r = await client.swap({
          from_address: wallet, input_token: SOL_MINT, output_token: mint, input_amount: String(lamports),
          slippage: caps.slippagePct, is_anti_mev: true, priority_fee: caps.priorityFeeSol,
          // GMGN-side safety net: sells even if this app is closed. The engine's own exits normally fire first.
          condition_orders: [
            { order_type: "loss_stop", side: "sell", price_scale: String(Math.round(Math.abs(cfg.sl) * 100) + 10), sell_ratio: "100" },
            { order_type: "profit_stop", side: "sell", price_scale: String(Math.round(cfg.tp * 100) + 25), sell_ratio: "100" },
          ],
          sell_ratio_type: "hold_amount",
        });
      } catch (e) { return { ok: false, why: `swap: ${e.message.slice(0, 120)}`, sent: true }; }
      const done = await settle(r);
      return done.ok ? { ...done, sol, quoteOut: q.output_amount, strategyOrderId: r.strategy_order_id || null } : done;
    },
    /** One look at an order that was still pending when polling stopped. -> {status:'confirmed'|'failed'|'pending', ...fill} */
    async recheck(orderId) {
      let o; try { o = await client.order(orderId); } catch (e) { return { status: "pending", why: e.message.slice(0, 80) }; }
      if (o.status === "confirmed") { const rep = o.report || {}; return { status: "confirmed", hash: o.hash || null, inAmount: rep.input_amount ?? null, outAmount: rep.output_amount ?? null }; }
      if (o.status === "failed" || o.status === "expired") return { status: "failed", why: `${o.status}: ${o.error_status || o.error_code || ""}` };
      return { status: "pending" };
    },
    async sell({ mint, orderTag }) {
      let r;
      try {
        r = await client.swap({ from_address: wallet, input_token: mint, output_token: SOL_MINT, input_amount: "0", input_amount_bps: "10000",
          slippage: caps.slippagePct, is_anti_mev: true, priority_fee: caps.priorityFeeSol });
      } catch (e) { return { ok: false, why: `sell: ${e.message.slice(0, 120)}`, noBalance: /balance|insufficient|not enough|no token/i.test(e.message) }; }
      return settle(r);
    },
  };
  async function settle(r) {
    if (!r || !r.order_id) return { ok: false, why: `swap gave no order_id: ${JSON.stringify(r).slice(0, 100)}`, sent: true };
    let last = r;
    for (let i = 0; i < caps.pollTries; i++) {
      if (last.status === "confirmed") break;
      if (last.status === "failed" || last.status === "expired") return { ok: false, why: `order ${last.status}: ${last.error_status || last.error_code || ""}`.trim(), orderId: r.order_id, sent: true };
      await wait(caps.pollMs);
      try { last = await client.order(r.order_id); } catch (e) { last = { status: "pending", err: e.message }; }
    }
    if (last.status !== "confirmed") return { ok: false, why: `order ${r.order_id} not confirmed after polling (${last.status})`, orderId: r.order_id, sent: true, unknown: true };
    const rep = last.report || {};
    return { ok: true, orderId: r.order_id, hash: last.hash || r.hash || null, inAmount: rep.input_amount ?? null, outAmount: rep.output_amount ?? null, priceUsd: rep.price_usd ?? null,
      inDecimals: rep.input_token_decimals, outDecimals: rep.output_token_decimals };
  }
  return exec;
}
