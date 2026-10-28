// Trades from the GMGN wallet that is already logged in on Alex's Chrome, the way ultracursor does: one click on a preset in
// GMGN's Instant-trade window to buy, one click on Sell 100% to sell. No keys, no API, no money moved. The wallet is read from the
// chain to prove each click did what it should: a buy is only a buy once the tokens are in the wallet.
import { KIMCHI, CAPS as BASE } from "./exec-gmgn.mjs";
export const WEB_CAPS = { ...BASE, preset: "0.01618", reserveSol: 0.004, settleMs: 30000, pollMs: 1000, recheckGiveUpMs: 180000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_OF = (mint) => `https://gmgn.ai/sol/token/${mint}`;

export function webExec({ panel, rpc, wallet, cfg, caps = WEB_CAPS, now = Date.now, wait = sleep, startSol = null }) {
  const stamps = [], pending = new Map();
  const state = { startSol, halted: null };
  let chain = Promise.resolve();                                            // one GMGN tab, one click flow at a time
  const turn = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };
  const held = async (mint) => (await rpc.tokenAccounts(wallet, mint)).reduce((a, x) => a + x.raw, 0n);
  const exec = {
    name: "live", state, caps, source: "web",
    safety: "the position is still in your GMGN wallet: press Sell everything",
    async balance() { return rpc.solBalance(wallet); },
    async sizeSol() { const bal = await exec.balance(); if (state.startSol == null) state.startSol = bal; return { bal, sol: bal >= Number(caps.preset) + caps.reserveSol ? Number(caps.preset) : 0 }; },
    gate(mint, bal) {
      if (state.halted) return state.halted;
      if (mint === KIMCHI) return "Kimchi is never bought";
      if (state.startSol != null && bal < state.startSol * caps.floorFrac) { state.halted = `wallet is ${((1 - bal / state.startSol) * 100).toFixed(0)}% down: trading halted`; return state.halted; }
      const t = now();
      if (stamps.filter((x) => t - x < 3600e3).length >= caps.perHour) return `${caps.perHour} buys in the last hour`;
      if (stamps.filter((x) => t - x < 86400e3).length >= caps.perDay) return `${caps.perDay} buys in the last day`;
      return null;
    },
    buy({ mint }) {
      return turn(async () => {
        const { bal, sol } = await exec.sizeSol();
        const why = exec.gate(mint, bal);
        if (why) return { ok: false, why };
        if (!(sol > 0)) return { ok: false, why: `the wallet has ${bal.toFixed(4)} SOL: a ${caps.preset} SOL buy plus fees needs ${(Number(caps.preset) + caps.reserveSol).toFixed(4)}` };
        let before; try { before = await held(mint); } catch (e) { return { ok: false, why: `wallet read: ${e.message.slice(0, 80)}` }; }
        const r = await panel.instantBuy({ stakeSol: sol }, { url: URL_OF(mint), preset: caps.preset, beforeClick: async () => { stamps.push(now()); } });
        if (!r.ok) return { ok: false, why: r.stale };
        const id = `web-${++exec.n}`; pending.set(id, { mint, before, sol, at: now() });
        const t0 = now();
        for (;;) {
          let h = before; try { h = await held(mint); } catch { /* keep looking */ }
          if (h > before) return { ok: true, orderId: id, hash: null, sol, inAmount: String(Math.round(sol * 1e9)), outAmount: String(h - before) };
          if (now() - t0 > caps.settleMs) return { ok: false, why: "the buy was clicked but the tokens are not in the wallet yet", unknown: true, sent: true, orderId: id };
          await wait(caps.pollMs);
        }
      });
    },
    n: 0,
    /** One look at a click whose result was not visible in time. */
    async recheck(orderId) {
      const e = pending.get(orderId); if (!e) return { status: "failed", why: "unknown order" };
      let h; try { h = await held(e.mint); } catch { return { status: "pending" }; }
      if (h > e.before) return { status: "confirmed", hash: null, inAmount: String(Math.round(e.sol * 1e9)), outAmount: String(h - e.before) };
      if (now() - e.at > caps.recheckGiveUpMs) return { status: "failed", why: "the tokens never arrived" };
      return { status: "pending" };
    },
    sell({ mint }) {
      return turn(async () => {
        let tokens; try { tokens = await held(mint); } catch (e) { return { ok: false, why: `wallet read: ${e.message.slice(0, 80)}` }; }
        if (tokens <= 0n) return { ok: false, why: "the token is not in the wallet", noBalance: true };
        const solBefore = await exec.balance().catch(() => null);
        const r = await panel.instantSell({}, { url: URL_OF(mint), beforeClick: async () => {} });
        if (!r.ok) return { ok: false, why: r.stale };
        const t0 = now();
        for (;;) {
          let h = tokens; try { h = await held(mint); } catch { /* keep looking */ }
          if (h === 0n) break;
          if (now() - t0 > caps.settleMs) return { ok: false, why: "Sell 100% was clicked but the tokens are still in the wallet", sent: true };
          await wait(caps.pollMs);
        }
        await wait(2000);
        const solAfter = await exec.balance().catch(() => null);
        const out = solBefore != null && solAfter != null ? Math.max(0, Math.round((solAfter - solBefore) * 1e9)) : null;
        return { ok: true, orderId: `web-sell-${++exec.n}`, inAmount: tokens.toString(), outAmount: out == null ? null : String(out) };
      });
    },
  };
  return exec;
}
