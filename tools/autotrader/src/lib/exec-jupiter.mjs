// Ultra trades from its OWN wallet, straight through Jupiter. No API keys, no whitelist, nothing to copy.
// Same promises as the GMGN executor: caps, halt, never Kimchi; every send is journalled by the engine first.
import { signSwapTransaction, buildCloseAccountTx } from "./solana.mjs";
import { KIMCHI, CAPS as BASE } from "./exec-gmgn.mjs";
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const PLUG_CAPS_EXTRA = { fixedSol: 0.01618, perHour: 200, perDay: 2000, floorFrac: 0.05, reserveSol: 0.004 };
export const CAPS = { ...BASE, reserveSol: 0.006, maxImpact: 0.06, buySlippageBps: 2000, sellSlippageBps: 3500, maxFeeLamports: 150000, confirmMs: 45000, pollMs: 1500 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function jupiterExec({ wallet, rpc, jupiter, cfg, caps = CAPS, now = Date.now, wait = sleep, startSol = null }) {
  const stamps = [], pending = new Map();                  // signature -> what we expect, for recheck()
  const state = { startSol, halted: null };
  const exec = {
    name: "live", state, caps, source: "own",
    safety: "the position is still in the wallet: press Sell everything",
    async balance() { return rpc.solBalance(wallet.address); },
    async sizeSol() {
      const bal = await exec.balance();
      if (state.startSol == null) state.startSol = bal;
      const spendable = Math.max(0, bal - caps.reserveSol);
      if (caps.fixedSol) return { bal, sol: spendable >= caps.fixedSol ? caps.fixedSol : 0 };   // the same 0.01618 SOL every buy (Alex)
      return { bal, sol: Math.min(caps.maxSolPerTrade, +(spendable * cfg.stakeFrac).toFixed(4)) };
    },
    gate(mint, bal) {
      if (state.halted) return state.halted;
      if (mint === KIMCHI) return "Kimchi is never bought";
      if (state.startSol != null && bal < state.startSol * caps.floorFrac) { state.halted = `wallet is ${((1 - bal / state.startSol) * 100).toFixed(0)}% down: trading halted`; return state.halted; }
      const t = now();
      if (stamps.filter((x) => t - x < 3600e3).length >= caps.perHour) return `${caps.perHour} buys in the last hour`;
      if (stamps.filter((x) => t - x < 86400e3).length >= caps.perDay) return `${caps.perDay} buys in the last day`;
      return null;
    },
    async land(base64, expect) {
      const { tx, signature } = signSwapTransaction(base64, wallet);
      const h = await rpc.latestBlockhash().catch(() => null);
      try { await rpc.send(tx); } catch (e) { return { ok: false, why: `send: ${e.message.slice(0, 140)}`, signature, rejected: !/timeout|fetch|unreachable/i.test(e.message) }; }
      pending.set(signature, expect);
      const t0 = now();
      for (;;) {
        const st = await rpc.status(signature).catch(() => ({ state: "pending" }));
        if (st.state === "confirmed") return { ok: true, signature };
        if (st.state === "failed") return { ok: false, why: `the chain rejected it: ${st.err}`, signature, sent: true };
        if (now() - t0 > caps.confirmMs) return { ok: false, why: `not confirmed after ${Math.round(caps.confirmMs / 1000)} s`, signature, sent: true, unknown: true };
        await wait(caps.pollMs);
      }
    },
    async buy({ mint }) {
      const { bal, sol } = await exec.sizeSol();
      const why = exec.gate(mint, bal);
      if (why) return { ok: false, why };
      if (!(sol >= 0.005)) return { ok: false, why: `stake ${sol} SOL is too small to trade (wallet ${bal.toFixed(4)} SOL, ${caps.reserveSol} kept for fees)` };
      const lamports = Math.round(sol * 1e9);
      let q, s;
      try {
        q = await jupiter.quote({ input: SOL_MINT, output: mint, amount: lamports, slippageBps: caps.buySlippageBps });
        if (!q.outAmount || !(Number(q.outAmount) > 0)) return { ok: false, why: "no route" };
        if (Math.abs(Number(q.priceImpactPct || 0)) > caps.maxImpact) return { ok: false, why: `price impact ${(Number(q.priceImpactPct) * 100).toFixed(1)}%` };
        s = await jupiter.swap({ quote: q, user: wallet.address, maxFeeLamports: caps.maxFeeLamports });
      } catch (e) { return { ok: false, why: `route: ${e.message.slice(0, 120)}` }; }
      stamps.push(now());
      const r = await exec.land(s.swapTransaction, { kind: "buy", mint, sol, inAmount: String(lamports), outAmount: q.outAmount });
      if (!r.ok) return { ...r, orderId: r.signature };
      let out = q.outAmount;
      try { const accts = await rpc.tokenAccounts(wallet.address, mint); const held = accts.reduce((a, x) => a + x.raw, 0n); if (held > 0n) out = held.toString(); } catch { /* the quote's number stands */ }
      return { ok: true, orderId: r.signature, hash: r.signature, sol, inAmount: String(lamports), outAmount: out, quoteOut: q.outAmount };
    },
    /** One look at a sent order. */
    async recheck(orderId) {
      const st = await rpc.status(orderId).catch(() => ({ state: "pending" }));
      const e = pending.get(orderId) || {};
      if (st.state === "confirmed") return { status: "confirmed", hash: orderId, inAmount: e.inAmount ?? null, outAmount: e.outAmount ?? null };
      if (st.state === "failed") return { status: "failed", why: `the chain rejected it: ${st.err}` };
      return { status: "pending" };
    },
    async sell({ mint }) {
      let accts;
      try { accts = (await rpc.tokenAccounts(wallet.address, mint)).filter((a) => a.raw > 0n); } catch (e) { return { ok: false, why: `balance: ${e.message.slice(0, 100)}` }; }
      if (!accts.length) return { ok: false, why: "the token is not in the wallet", noBalance: true };
      const amount = accts.reduce((a, x) => a + x.raw, 0n).toString();
      let q, s;
      try {
        q = await jupiter.quote({ input: mint, output: SOL_MINT, amount, slippageBps: caps.sellSlippageBps });
        if (!q.outAmount) return { ok: false, why: "no route to sell" };
        s = await jupiter.swap({ quote: q, user: wallet.address, maxFeeLamports: caps.maxFeeLamports });
      } catch (e) { return { ok: false, why: `route: ${e.message.slice(0, 120)}` }; }
      const r = await exec.land(s.swapTransaction, { kind: "sell", mint });
      if (!r.ok) return { ...r, orderId: r.signature };
      // give the rent of the emptied token accounts back (about 0.002 SOL each) so the balance reflects real money
      let rent = 0;
      try {
        const left = (await rpc.tokenAccounts(wallet.address, mint)).filter((a) => a.raw === 0n);
        for (const a of left) {
          const { blockhash } = await rpc.latestBlockhash();
          const c = buildCloseAccountTx({ wallet, tokenAccount: a.pubkey, tokenProgram: a.program, blockhash });
          await rpc.send(c.tx); rent++;
        }
      } catch { /* the proceeds are in; rent is reclaimed on a later sale */ }
      let out = q.outAmount;                                   // the quote, if the chain cannot tell us
      const net = await rpc.netLamports(r.signature).catch(() => null);
      if (net != null) out = String(Math.max(0, net));
      return { ok: true, orderId: r.signature, hash: r.signature, inAmount: amount, outAmount: out, closed: rent };
    },
  };
  return exec;
}
