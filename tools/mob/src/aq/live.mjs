// LIVE orders for the Aquarius Solana wallet: real SOL, real swaps through Jupiter. The real ledger (mob_aq_live_orders,
// mob_aq_live_positions, mob_aq_live_refusals) is separate from the paper book and never touches it.
//
// THE RULE IT TRADES IS UNPROVEN AFTER COSTS (lesson 17: no rule made money after costs on a meaningful count; the dip, the
// best one, lost 0.16% a trade). It is the only entry the lessons support, run inside the limits Alex sets. Small size.
//
// Read live on 2026-11-18, not from memory:
//  - Jupiter: GET {host}/swap/v1/quote and POST {host}/swap/v1/swap answer on api.jup.ag WITHOUT a key (docs: keyless 0.5
//    requests a second) and still on lite-api.jup.ag (docs: being phased out). Quote: inAmount, outAmount,
//    otherAmountThreshold, priceImpactPct (string), routePlan. Swap: swapTransaction (base64, version 0),
//    lastValidBlockHeight, prioritizationFeeLamports, simulationError. An optional JUP_API_KEY secret is sent as x-api-key.
//  - RPC: simulateTransaction {sigVerify:false, replaceRecentBlockhash:true, accounts:{addresses}} -> value.err,
//    value.accounts[0].lamports; getSignatureStatuses -> value[i] null | {confirmationStatus, err}; getBlockHeight -> number.
//  - getTransaction (meta.preBalances/postBalances/fee/pre+postTokenBalances) is the standard shape; the public RPC rate
//    limited it on the day, so it was matched against simulateTransaction's identical field names, not a live answer.
// Order of every order: the row is written, THEN the swap is built, simulated, signed and the signature stored, THEN it is
// sent. A send whose outcome is unknown is never sent again: the next tick asks the chain for that signature first.
import { db } from "../db.mjs";
import { unseal } from "../auth.mjs";
import { base58, unbase58, rpc as solRpc } from "./wallet.mjs";
import { feeds, SOL_MINT } from "./feeds.mjs";
import { atr5Pct, hardSafety, round } from "./logic.mjs";

export const LIVE = {
  // ---- what it trades (the number beside each line is the lesson in .claude/skills/aquarius-lessons)
  dipAtr: 1,              // 7 STRONG: buy dips on established coins. 10: deeper dips add nothing, so 1x ATR in 5 minutes
  //                         1 PROVEN: never breakout or momentum. There is no other entry in this file.
  minAtr5Pct: 2,          // 5 PROVEN + 13 LEAD: a coin moving under 2% in 5 minutes cannot pay the round trip
  poolMinUsd: 100000,     // 3 PROVEN: thin pools cost four times more
  poolPreferMaxUsd: 500000, // 9 STRONG: the dip's edge is on $100K-$500K pools; those are looked at first
  minAgeDays: 1,          // 7: established pairs only (dips lose on new pairs); same age line as the Council's tier B
  holdMin: 45,            // 8 STRONG: the dip's edge grew with the hold up to 45 minutes; it exits on the clock
  stopAtr: 3, stopMinPct: 6, stopMaxPct: 15, // 4 PROVEN: tight stops are a fee machine. Wide, protective only; not a tested result
  cooldownMin: 45,        // no second buy of a coin inside one hold
  // ---- how it executes (safety, not lessons)
  slippageBps: 100, exitSlippageBps: 150, maxImpactPct: 1, reserveSol: 0.01, feeBudgetLamports: 3500000, priorityMaxLamports: 500000,
  candidatesPerTick: 4, confirmPolls: 6, confirmGapMs: 2500, maxSellFails: 5, staleBarSec: 240,
};
const VENUE = "solana", ACTIVE = `('opening','open','closing','stuck')`;
const JUP_HOSTS = ["https://api.jup.ag", "https://lite-api.jup.ag"];
const enc = new TextEncoder();
const get = async (d, k, dflt = null) => (await d.one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? dflt;
const set = (d, k, v) => d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [k, JSON.stringify(v)]);
const brain = (d, text) => d.q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('execution','event',$1)`, [text]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cut = (s, n = 240) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
const TODAY = `(date_trunc('day', now() AT TIME ZONE 'Europe/Athens') AT TIME ZONE 'Europe/Athens')`; // Alex's day

// A refused trade is always written down: one row per gate, coin and ten minutes (a count, not a flood).
export async function refuse(d, venue, gate, reason, c = null) {
  await d.q(`INSERT INTO mob_aq_live_refusals (venue, gate, mint, symbol, reason, bucket) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (venue, gate, mint, bucket) DO UPDATE SET n = mob_aq_live_refusals.n + 1, reason = EXCLUDED.reason, at = now()`, [venue, gate, c?.mint || "", c?.symbol || null, cut(reason), Math.floor(Date.now() / 600000)]);
  return { refused: gate, reason };
}

// ---------------------------------------------------------------- Jupiter
let lastJup = 0;
async function jup(env, path, init = {}) {
  let last = null;
  for (const host of JUP_HOSTS) {
    const gap = Number(env.AQ_JUP_GAP_MS ?? (env.JUP_API_KEY ? 150 : 2100)), wait = lastJup + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastJup = Date.now();
    try {
      const r = await fetch(host + path, { ...init, headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...(env.JUP_API_KEY && host === JUP_HOSTS[0] ? { "x-api-key": env.JUP_API_KEY } : {}) }, signal: AbortSignal.timeout(12000) });
      const j = await r.json().catch(() => null);
      if (r.ok && j) return { ok: true, j, host };
      last = `Jupiter answered HTTP ${r.status}${j?.error ? ` (${cut(j.error, 100)})` : ""}`;
      if (r.status !== 429 && r.status < 500) break; // a real "no" (no route, bad amount): the other host would say the same
    } catch { last = "Jupiter did not answer"; }
  }
  return { ok: false, error: last };
}
export async function quote(env, inMint, outMint, amountRaw, slippageBps) {
  const r = await jup(env, `/swap/v1/quote?inputMint=${inMint}&outputMint=${outMint}&amount=${amountRaw}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`);
  if (!r.ok) return r;
  const q = r.j;
  if (!/^\d+$/.test(String(q.outAmount || "")) || !/^\d+$/.test(String(q.otherAmountThreshold || "")) || String(q.inAmount) !== String(amountRaw)) return { ok: false, error: "Jupiter's quote was not in the expected shape" };
  return { ok: true, q, impactPct: Math.abs(Number(q.priceImpactPct) * 100) };
}
export async function buildSwap(env, q, address) {
  const r = await jup(env, "/swap/v1/swap", { method: "POST", body: JSON.stringify({ quoteResponse: q, userPublicKey: address, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: LIVE.priorityMaxLamports, priorityLevel: "high" } } }) });
  if (!r.ok) return r;
  if (typeof r.j.swapTransaction !== "string" || !(Number(r.j.lastValidBlockHeight) > 0)) return { ok: false, error: "Jupiter's swap answer had no transaction in it" };
  if (r.j.simulationError) return { ok: false, error: `Jupiter's own simulation failed (${cut(JSON.stringify(r.j.simulationError), 160)})` };
  return { ok: true, tx: r.j.swapTransaction, lastValidBlockHeight: Number(r.j.lastValidBlockHeight) };
}

// ---------------------------------------------------------------- the transaction: read it, check it, sign it
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)), b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const shortvec = (b, o) => { let n = 0, shift = 0; for (;;) { const x = b[o++]; n |= (x & 0x7f) << shift; if (!(x & 0x80)) return [n, o]; shift += 7; if (shift > 21) throw new Error("bad length"); } };
// A serialized Solana transaction: [signature count][64 bytes each][message]. The message starts with an optional version
// byte, three header bytes (the first is how many signatures it needs), then the accounts; the first account pays and signs.
export function readTx(b64tx) {
  const bytes = unb64(b64tx); const [nsig, sigStart] = shortvec(bytes, 0); const msgStart = sigStart + 64 * nsig;
  let p = msgStart; if (bytes[p] & 0x80) p++;
  const required = bytes[p]; p += 3;
  const [nacc, a0] = shortvec(bytes, p);
  if (!(nacc >= 1) || a0 + 32 > bytes.length) throw new Error("transaction too short");
  return { bytes, nsig, sigStart, msgStart, required, payer: base58(bytes.subarray(a0, a0 + 32)) };
}
// The ONLY place a transaction is signed. It signs only a transaction that needs exactly one signature and is paid by the
// Aquarius wallet itself. The key is opened here, used once and dropped; it is never returned, stored or logged.
export async function signTx(env, wallet, b64tx) {
  const t = readTx(b64tx);
  if (t.nsig !== 1 || t.required !== 1 || t.payer !== wallet.address) throw new Error("the transaction is not a one-signature transaction of the Aquarius wallet; not signed");
  const key = await crypto.subtle.importKey("pkcs8", unb64(await unseal(env, wallet.sealed)), { name: "Ed25519" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, t.bytes.subarray(t.msgStart)));
  t.bytes.set(sig, t.sigStart);
  return { tx: b64(t.bytes), signature: base58(sig) };
}
// Before signing: run it on the chain's own simulator and look at what it does to the wallet's SOL. A buy may take the
// size plus a small fee budget and nothing more; a sell must bring back at least the quoted minimum less that budget.
export async function simulate(env, address, b64tx, { side, inLamports, minOutLamports }) {
  const pre = (await solRpc(env, "getBalance", [address])).value;
  const v = (await solRpc(env, "simulateTransaction", [b64tx, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed", accounts: { encoding: "base64", addresses: [address] } }])).value;
  if (v?.err) return { ok: false, error: `the simulation failed (${cut(JSON.stringify(v.err), 140)})` };
  const post = v?.accounts?.[0]?.lamports;
  if (typeof pre !== "number" || typeof post !== "number") return { ok: false, error: "the simulation did not show the wallet's balance" };
  const delta = post - pre;
  if (side === "buy" && -delta > inLamports + LIVE.feeBudgetLamports) return { ok: false, error: `the transaction would take ${round(-delta / 1e9, 6)} SOL, more than the ${round(inLamports / 1e9, 6)} SOL trade plus fees; not signed` };
  if (side === "sell" && delta < minOutLamports - LIVE.feeBudgetLamports) return { ok: false, error: `the transaction would bring back ${round(delta / 1e9, 6)} SOL, less than the quoted minimum; not signed` };
  return { ok: true, pre, delta };
}

// ---------------------------------------------------------------- one order, start to finish
const upd = (d, id, f) => { const ks = Object.keys(f); return d.q(`UPDATE mob_aq_live_orders SET ${ks.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`, [id, ...ks.map((k) => f[k])]); };
// What actually happened, read from the confirmed transaction: SOL in or out of the wallet (fees included) and the tokens moved.
function fillOf(tx, address, mint) {
  const m = tx?.meta, keys = tx?.transaction?.message?.accountKeys || [];
  if (!m || !Array.isArray(m.preBalances) || (keys[0]?.pubkey ?? keys[0]) !== address) return null;
  const tok = (list) => (list || []).filter((b) => b.owner === address && b.mint === mint).reduce((a, b) => a + BigInt(b.uiTokenAmount?.amount || "0"), 0n);
  return { solLamports: m.postBalances[0] - m.preBalances[0], feeLamports: m.fee ?? 0, tokens: tok(m.postTokenBalances) - tok(m.preTokenBalances), err: m.err ?? null };
}
// Ask the chain about one sent order and write down the answer. Returns "confirmed" | "failed" | "pending".
export async function settle(env, o, { polls = 1 } = {}) {
  const d = db(env), w = await get(d, "sol_wallet_key");
  for (let i = 0; i < polls; i++) {
    if (i) await sleep(Number(env.AQ_LIVE_POLL_MS ?? LIVE.confirmGapMs));
    let st; try { st = (await solRpc(env, "getSignatureStatuses", [[o.signature], { searchTransactionHistory: true }])).value?.[0] ?? null; } catch { continue; }
    if (st && st.err) { await finish(d, o, "failed", { error: `the chain rejected it (${cut(JSON.stringify(st.err), 140)})` }); return "failed"; }
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      let tx = null; try { tx = await solRpc(env, "getTransaction", [o.signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]); } catch {}
      const f = fillOf(tx, w.address, o.mint);
      if (!f) continue; // confirmed, but the details are not readable yet: asked again, never assumed
      if (f.err) { await finish(d, o, "failed", { error: "the chain rejected it" }); return "failed"; }
      await finish(d, o, "confirmed", { fill: f }); return "confirmed";
    }
    if (!st) { // not on chain. Only once its blockhash has expired is it certain it never will be.
      let h = null; try { h = await solRpc(env, "getBlockHeight", [{ commitment: "confirmed" }]); } catch {}
      if (typeof h === "number" && o.last_valid_height && h > Number(o.last_valid_height) + 5) { await finish(d, o, "failed", { error: "it never reached the chain (its time window passed); nothing was spent" }); return "failed"; }
    }
  }
  return "pending";
}
// The order's end, and its position's, in one statement each way. A row that is already finished is never finished twice.
async function finish(d, o, status, { error = null, fill = null } = {}) {
  const won = await d.one(`UPDATE mob_aq_live_orders SET status = $2, error = coalesce($3, error), fill_sol = $4, fill_tokens = $5, fee_sol = $6, confirmed_at = CASE WHEN $2 = 'confirmed' THEN now() END, updated_at = now()
    WHERE id = $1 AND status IN ('requested','sent') RETURNING id`, [o.id, status, error, fill ? fill.solLamports / 1e9 : null, fill ? fill.tokens.toString() : null, fill ? fill.feeLamports / 1e9 : null]);
  if (!won || !o.position_id) return;
  if (o.side === "buy") {
    if (status === "confirmed" && fill.tokens > 0n) await d.q(`UPDATE mob_aq_live_positions SET status = 'open', tokens_raw = $2, cost_sol = $3, fees_sol = fees_sol + $4, opened_at = now(), time_exit_at = now() + make_interval(mins => $5::int) WHERE id = $1 AND status = 'opening'`,
      [o.position_id, fill.tokens.toString(), -fill.solLamports / 1e9, fill.feeLamports / 1e9, LIVE.holdMin]);
    else await d.q(`UPDATE mob_aq_live_positions SET status = 'failed', closed_at = now(), exit_reason = $2 WHERE id = $1 AND status = 'opening'`, [o.position_id, cut(error || "the buy brought no tokens")]);
    if (status === "confirmed") await brain(d, `LIVE BUY ${o.symbol}: ${round(-fill.solLamports / 1e9, 6)} SOL from the Aquarius wallet (${o.signature}).`);
    return;
  }
  if (status === "confirmed") {
    const p = await d.one(`UPDATE mob_aq_live_positions SET status = 'closed', closed_at = now(), proceeds_sol = $2, fees_sol = fees_sol + $3, pnl_sol = $2 - cost_sol, exit_reason = $4 WHERE id = $1 AND status = 'closing' RETURNING pnl_sol, cost_sol`,
      [o.position_id, fill.solLamports / 1e9, fill.feeLamports / 1e9, o.reason]);
    if (p) { await brain(d, `LIVE SELL ${o.symbol} (${o.reason}): ${round(fill.solLamports / 1e9, 6)} SOL back, ${p.pnl_sol >= 0 ? "+" : ""}${round(p.pnl_sol, 6)} SOL on the trade (${o.signature}).`); await dailyLossCheck(d); }
  } else await d.q(`UPDATE mob_aq_live_positions SET status = CASE WHEN sell_fails + 1 >= $2 THEN 'stuck' ELSE 'open' END, sell_fails = sell_fails + 1 WHERE id = $1 AND status = 'closing'`, [o.position_id, LIVE.maxSellFails]);
}
export async function pnlToday(d) { return (await d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed' AND closed_at >= ${TODAY}`, [VENUE])).s; }
// The daily loss limit: when today's realized loss reaches it, auto trade switches itself OFF and says why.
async function dailyLossCheck(d) {
  const lim = await get(d, "sol_wallet_limits", {}), pnl = await pnlToday(d);
  if (!lim.autoTrade || !(lim.maxDailyLossSol > 0) || -pnl < lim.maxDailyLossSol) return false;
  await set(d, "sol_wallet_limits", { ...lim, autoTrade: false });
  const why = `Auto trade switched itself OFF: today's live loss is ${round(-pnl, 6)} SOL, at the daily limit of ${lim.maxDailyLossSol} SOL.`;
  await set(d, "live_auto_off", { why, at: new Date().toISOString() }); await brain(d, why); await refuse(d, VENUE, "daily_loss", why);
  return true;
}
// Build, check, sign, record, send, confirm. `claim` is the order's one-time key; the caller already holds the position row.
async function execute(env, w, { side, c, positionId, inMint, outMint, amountRaw, slippageBps, reason, claim, q0 = null }) {
  const d = db(env);
  let o;
  try { o = await d.one(`INSERT INTO mob_aq_live_orders (venue, side, mint, symbol, position_id, claim, reason, in_amount, slippage_bps) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [VENUE, side, c.mint, c.symbol, positionId, claim, reason, String(amountRaw), slippageBps]); }
  catch (e) { if (/duplicate key|unique constraint/i.test(String(e.message || e))) return { skipped: "this order was already made in this minute" }; throw e; }
  const fail = async (error) => { await finish(d, o, "failed", { error }); return { failed: error, orderId: o.id }; };
  try {
    const qr = q0 || (await quote(env, inMint, outMint, amountRaw, slippageBps));
    if (!qr.ok) return fail(qr.error);
    if (qr.impactPct > LIVE.maxImpactPct) return fail(`price impact ${round(qr.impactPct, 2)}% is over the ${LIVE.maxImpactPct}% cap`);
    await upd(d, o.id, { quote_out: qr.q.outAmount, min_out: qr.q.otherAmountThreshold, impact_pct: qr.impactPct, quote: JSON.stringify({ route: (qr.q.routePlan || []).map((r) => r.swapInfo?.label).filter(Boolean) }) });
    const sw = await buildSwap(env, qr.q, w.address);
    if (!sw.ok) return fail(sw.error);
    const sim = await simulate(env, w.address, sw.tx, { side, inLamports: side === "buy" ? Number(amountRaw) : 0, minOutLamports: side === "sell" ? Number(qr.q.otherAmountThreshold) : 0 });
    if (!sim.ok) return fail(sim.error);
    const signed = await signTx(env, w, sw.tx);
    // the signature is on record BEFORE the send: whatever happens next, the chain can be asked about this exact transaction
    await upd(d, o.id, { status: "sent", signature: signed.signature, last_valid_height: sw.lastValidBlockHeight, sent_at: new Date().toISOString() });
    o = { ...o, status: "sent", signature: signed.signature, last_valid_height: sw.lastValidBlockHeight };
    try { await solRpc(env, "sendTransaction", [signed.tx, { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 5 }]); }
    catch (e) { await upd(d, o.id, { error: cut(`send: ${e.message || e}`) }); } // unknown outcome: NOT failed, NOT sent again. The chain decides.
    const end = await settle(env, o, { polls: LIVE.confirmPolls });
    return { [end]: true, orderId: o.id, signature: o.signature };
  } catch (e) {
    if (o.status === "sent") return { pending: true, orderId: o.id, signature: o.signature, note: cut(e.message || e) };
    return fail(cut(e.message || e));
  }
}

// ---------------------------------------------------------------- gates (every one, on the server, before any order)
export async function gates(env) {
  const d = db(env);
  const S = Object.fromEntries((await d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('sol_wallet_key','sol_wallet_limits','kill')`)).map((r) => [r.k, r.v]));
  const w = S.sol_wallet_key, lim = { maxPerTradeSol: 0, maxDailyLossSol: 0, maxOpenPositions: 0, autoTrade: false, ...(S.sol_wallet_limits || {}) };
  const no = (gate, reason) => ({ ok: false, gate, reason, w, lim });
  if (!w?.address || !w.sealed) return no("no_wallet", "The Aquarius wallet has not been created");
  if (!lim.autoTrade) return no("auto_trade_off", "Auto trade is off");
  if (S.kill === true) return no("kill_switch", "The kill switch is on");
  if (!(lim.maxPerTradeSol > 0)) return no("limit_per_trade", "Most per trade is zero");
  if (!(lim.maxDailyLossSol > 0)) return no("limit_daily_loss", "Most lost in a day is zero");
  if (!(lim.maxOpenPositions > 0)) return no("limit_open", "Open positions at once is zero");
  const pnl = await pnlToday(d);
  if (-pnl >= lim.maxDailyLossSol) { await dailyLossCheck(d); return no("daily_loss", `Today's live loss is ${round(-pnl, 6)} SOL, at the daily limit of ${lim.maxDailyLossSol} SOL`); }
  const open = (await d.one(`SELECT count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}`, [VENUE])).n;
  if (open >= lim.maxOpenPositions) return no("max_open", `${open} live position(s) open, the limit is ${lim.maxOpenPositions}`);
  if ((await d.one(`SELECT count(*)::int n FROM mob_aq_live_orders WHERE venue = $1 AND status IN ('requested','sent')`, [VENUE])).n) return no("order_pending", "An earlier order is still being confirmed on the chain");
  return { ok: true, w, lim, open };
}
// The dip, exactly as the training arena measured it ("rev1"): the last 5 minutes fell by at least one 5-minute ATR.
export function dipSignal(candles, nowSec) {
  if (!Array.isArray(candles) || candles.length < 26) return { ok: false, why: "under 26 one-minute bars" };
  const cs = candles.slice(-25), last = cs[cs.length - 1];
  if (nowSec - last.t > LIVE.staleBarSec) return { ok: false, why: "the last bar is old" };
  const atr = atr5Pct(cs), ret5 = (last.c / candles[candles.length - 6].c - 1) * 100;
  if (atr == null) return { ok: false, why: "no ATR" };
  if (atr < LIVE.minAtr5Pct) return { ok: false, why: `ATR ${atr}% is under ${LIVE.minAtr5Pct}%`, atr };
  if (!(ret5 <= -LIVE.dipAtr * atr)) return { ok: false, why: `no dip (${round(ret5, 2)}% in 5 minutes against an ATR of ${atr}%)`, atr, ret5 };
  return { ok: true, atr, ret5: round(ret5, 3) };
}
async function tryBuy(env, g) {
  const d = db(env), nowMs = Date.now(), minute = Math.floor(nowMs / 60000);
  const top = await feeds.jupTop(env);
  if (!top.ok || !Array.isArray(top.data)) return refuse(d, VENUE, "no_market_data", "Jupiter's coin lists did not answer");
  const busy = new Set((await d.q(`SELECT mint FROM mob_aq_live_positions WHERE venue = $1 AND (status IN ${ACTIVE} OR created_at > now() - make_interval(mins => $2::int))`, [VENUE, LIVE.cooldownMin])).map((r) => r.mint));
  const pool = top.data.filter((c) => c.quoteMint === SOL_MINT && c.liqUsd >= LIVE.poolMinUsd && c.createdAt && nowMs - new Date(c.createdAt).getTime() > LIVE.minAgeDays * 86400000 && !busy.has(c.mint) && (c.ch5m == null || c.ch5m < 0))
    .sort((a, b) => (a.liqUsd <= LIVE.poolPreferMaxUsd ? 0 : 1) - (b.liqUsd <= LIVE.poolPreferMaxUsd ? 0 : 1) || (a.ch5m ?? 0) - (b.ch5m ?? 0));
  if (!pool.length) return refuse(d, VENUE, "no_candidate", "No established coin with a pool of $100K or more is falling right now");
  let last = null;
  for (const c of pool.slice(0, LIVE.candidatesPerTick)) {
    const cs = await feeds.jupCandles(env, c.mint);
    if (!cs.ok) { last = await refuse(d, VENUE, "no_candles", "No one-minute candles for this coin", c); continue; }
    const sig = dipSignal(cs.data, nowMs / 1000);
    if (!sig.ok) { last = await refuse(d, VENUE, "no_signal", sig.why, c); continue; }
    const rg = await feeds.rug(env, c.mint);
    const hs = rg.ok ? hardSafety(rg.data) : c.audit && c.audit.mintOff && c.audit.freezeOff ? { ok: true } : { ok: false, reason: "safety unknown: no RugCheck report and no clean Jupiter audit" };
    if (!hs.ok) { last = await refuse(d, VENUE, "safety", hs.reason, c); continue; }
    const size = g.lim.maxPerTradeSol, lamports = Math.round(size * 1e9);
    let bal; try { bal = (await solRpc(env, "getBalance", [g.w.address])).value; } catch (e) { return refuse(d, VENUE, "no_balance", cut(e.message)); }
    if (!(bal >= lamports + LIVE.feeBudgetLamports + LIVE.reserveSol * 1e9)) return refuse(d, VENUE, "reserve", `The wallet holds ${round(bal / 1e9, 6)} SOL: not enough for a ${size} SOL trade and the ${LIVE.reserveSol} SOL kept for fees`);
    const q = await quote(env, SOL_MINT, c.mint, lamports, LIVE.slippageBps);
    if (!q.ok) { last = await refuse(d, VENUE, "no_quote", q.error, c); continue; }
    if (q.impactPct > LIVE.maxImpactPct) { last = await refuse(d, VENUE, "price_impact", `Price impact ${round(q.impactPct, 2)}% is over the ${LIVE.maxImpactPct}% cap`, c); continue; }
    // the claim: one statement takes the coin's only active slot, under the open-position limit. A second caller gets nothing.
    const stopPct = Math.min(LIVE.stopMaxPct, Math.max(LIVE.stopMinPct, round(LIVE.stopAtr * sig.atr, 2)));
    const p = await d.one(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, stop_pct, atr5_pct, pool_liq_usd)
      SELECT $1,$2,$3,'opening',$4,$5,$6 WHERE (SELECT count(*) FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}) < $7::int ON CONFLICT DO NOTHING RETURNING id`, [VENUE, c.mint, c.symbol, stopPct, sig.atr, c.liqUsd, g.lim.maxOpenPositions]);
    if (!p) return refuse(d, VENUE, "claim_lost", "This coin or the last free slot was taken by another run", c);
    const r = await execute(env, g.w, { side: "buy", c, positionId: p.id, inMint: SOL_MINT, outMint: c.mint, amountRaw: lamports, slippageBps: LIVE.slippageBps, reason: `dip ${sig.ret5}% vs ATR ${sig.atr}%`, claim: `${VENUE}|${c.mint}|buy|${minute}`, q0: q });
    if (r.skipped) await d.q(`UPDATE mob_aq_live_positions SET status = 'failed', closed_at = now(), exit_reason = 'duplicate order' WHERE id = $1 AND status = 'opening'`, [p.id]);
    return { buy: c.symbol, ...r };
  }
  return last;
}
// Exits run whenever a live position is open, with auto trade on or off and with the kill switch on: a position is never left alone.
async function sellPosition(env, w, p, reason, claimKey) {
  const d = db(env);
  const took = await d.one(`UPDATE mob_aq_live_positions SET status = 'closing' WHERE id = $1 AND status IN ('open','stuck') RETURNING id`, [p.id]);
  if (!took) return { skipped: "already being sold" };
  const r = await execute(env, w, { side: "sell", c: { mint: p.mint, symbol: p.symbol }, positionId: p.id, inMint: p.mint, outMint: SOL_MINT, amountRaw: p.tokens_raw, slippageBps: LIVE.exitSlippageBps, reason, claim: `${VENUE}|${p.mint}|sell|${claimKey}` });
  if (r.skipped) await d.q(`UPDATE mob_aq_live_positions SET status = 'open' WHERE id = $1 AND status = 'closing'`, [p.id]);
  return { sell: p.symbol, reason, ...r };
}
async function exits(env, w) {
  const d = db(env), out = [], minute = Math.floor(Date.now() / 60000);
  for (const p of await d.q(`SELECT * FROM mob_aq_live_positions WHERE venue = $1 AND status = 'open' ORDER BY id`, [VENUE])) {
    if (new Date(p.time_exit_at).getTime() <= Date.now()) { out.push(await sellPosition(env, w, p, `time exit after ${LIVE.holdMin} minutes`, minute)); continue; }
    const q = await quote(env, p.mint, SOL_MINT, p.tokens_raw, LIVE.exitSlippageBps);
    if (!q.ok) continue; // no price this minute: the stop is checked again next minute, the clock exit does not need a price
    const value = Number(q.q.outAmount) / 1e9;
    await d.q(`UPDATE mob_aq_live_positions SET last_value_sol = $2, last_value_at = now() WHERE id = $1`, [p.id, value]);
    if (value <= p.cost_sol * (1 - p.stop_pct / 100)) out.push(await sellPosition(env, w, p, `protective stop (${p.stop_pct}% under cost)`, minute));
  }
  return out;
}

// ---------------------------------------------------------------- the tick, SELL ALL LIVE, and what the panel sees
export async function liveTick(env, { cron = null, minute = Math.floor(Date.now() / 60000) } = {}) {
  const d = db(env), owner = crypto.randomUUID();
  const lock = await d.one(`INSERT INTO mob_aq_state (k, v, at) VALUES ('live_tick_lock', $1::jsonb, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = now()
    WHERE mob_aq_state.v = 'false'::jsonb OR mob_aq_state.at < now() - interval '100 seconds' RETURNING k`, [JSON.stringify({ owner })]);
  if (!lock) return { skipped: "another live tick is running" };
  const out = { at: new Date().toISOString(), cron };
  try {
    const w = await get(d, "sol_wallet_key");
    // 1. anything sent and not yet known: ask the chain first
    for (const o of await d.q(`SELECT * FROM mob_aq_live_orders WHERE venue = $1 AND status = 'sent' ORDER BY id`, [VENUE])) (out.reconciled ||= []).push({ id: o.id, end: await settle(env, o) });
    // an order row that never got as far as a signature (the run died first): nothing was signed, so nothing was spent
    for (const o of await d.q(`SELECT * FROM mob_aq_live_orders WHERE venue = $1 AND status = 'requested' AND requested_at < now() - interval '3 minutes'`, [VENUE])) await finish(d, o, "failed", { error: "the run stopped before signing; nothing was sent" });
    // 2. exits for what is open
    if (w?.address) { const ex = await exits(env, w); if (ex.length) out.exits = ex; }
    // 3. one new buy at most, behind every gate
    const g = await gates(env);
    out.result = g.ok ? await tryBuy(env, g) : await refuse(d, VENUE, g.gate, g.reason);
    if (minute % 5 === 0) out.robinhood = await rhGate(env);
    // twice an hour, a read-only question to each Jupiter host from this Worker, so "does Jupiter answer from production" is on record
    if (minute % 30 === 0) { const hosts = {}; for (const h of JUP_HOSTS) { try { const r = await fetch(`${h}/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=10000000&slippageBps=50`, { signal: AbortSignal.timeout(8000) }); hosts[h] = r.status; await r.body?.cancel(); } catch { hosts[h] = "no answer"; } } await set(d, "live_probe", { at: out.at, hosts }); }
  } catch (e) { out.error = cut(e.message || e); }
  finally {
    try { await set(d, "live_tick", out); } catch {}
    await d.q(`UPDATE mob_aq_state SET v = 'false'::jsonb, at = now() WHERE k = 'live_tick_lock' AND v = $1::jsonb`, [JSON.stringify({ owner })]);
  }
  return out;
}
export async function sellAllLive(env) {
  const d = db(env), w = await get(d, "sol_wallet_key"), out = { sold: [], kept: [] };
  if (!w?.address) return out;
  for (const p of await d.q(`SELECT * FROM mob_aq_live_positions WHERE venue = $1 AND status IN ('open','stuck') ORDER BY id`, [VENUE])) {
    const r = await sellPosition(env, w, p, "SELL ALL LIVE (Alex)", `all-${Math.floor(Date.now() / 60000)}`);
    (r.confirmed ? out.sold : out.kept).push({ symbol: p.symbol, signature: r.signature || null, state: r.confirmed ? "sold" : r.pending ? "sent, being confirmed" : r.failed || r.skipped || "not sold" });
  }
  await brain(d, `SELL ALL LIVE by Alex: ${out.sold.length} sold, ${out.kept.length} not yet.`);
  return out;
}
export async function liveState(d, venue = VENUE) {
  const [pos, ord, ref, pnl, S] = await Promise.all([
    d.q(`SELECT id, mint, symbol, status, tokens_raw, cost_sol, stop_pct, last_value_sol, last_value_at, opened_at, time_exit_at, sell_fails FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE} ORDER BY id`, [venue]),
    d.q(`SELECT id, side, symbol, mint, status, reason, error, signature, fill_sol, fee_sol, requested_at FROM mob_aq_live_orders WHERE venue = $1 ORDER BY id DESC LIMIT 8`, [venue]),
    d.one(`SELECT gate, reason, symbol, n, at FROM mob_aq_live_refusals WHERE venue = $1 ORDER BY at DESC LIMIT 1`, [venue]),
    d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s, count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed' AND closed_at >= ${TODAY}`, [venue]),
    d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('live_tick','live_auto_off')`),
  ]);
  const st = Object.fromEntries(S.map((r) => [r.k, r.v]));
  return { positions: pos.map((p) => ({ id: Number(p.id), symbol: p.symbol, mint: p.mint, status: p.status, costSol: p.cost_sol, valueSol: p.last_value_sol, valueAt: p.last_value_at, stopPct: p.stop_pct, openedAt: p.opened_at, timeExitAt: p.time_exit_at })),
    orders: ord.map((o) => ({ id: Number(o.id), side: o.side, symbol: o.symbol, status: o.status, reason: o.reason, error: o.error, signature: o.signature, sol: o.fill_sol, at: o.requested_at })),
    pnlTodaySol: round(pnl.s, 6), closedToday: pnl.n, lastRefusal: ref ? { gate: ref.gate, reason: ref.reason, symbol: ref.symbol, times: ref.n, at: ref.at } : null,
    lastTickAt: st.live_tick?.at || null, autoOff: st.live_auto_off || null,
    rule: `dip of ${LIVE.dipAtr}x ATR on established coins (pool $${LIVE.poolMinUsd / 1000}K+, ATR ${LIVE.minAtr5Pct}%+), ${LIVE.holdMin} minute hold`, proven: false };
}

// ---------------------------------------------------------------- Robinhood: the same gates in USD. THE ORDER CALL IS NOT BUILT.
// Robinhood's order tool names and arguments have not been read (they are only visible after Alex signs in), so nothing
// here can place a stock order. This checks the gates and writes down the first one that stops a trade, the last being that.
export async function rhGate(env) {
  const d = db(env), S = Object.fromEntries((await d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('rh_tokens','rh_limits','rh_cache','kill')`)).map((r) => [r.k, r.v]));
  const lim = { maxPerTradeUsd: 0, maxDailyLossUsd: 0, maxOpenPositions: 0, allowStocks: false, allowCrypto: false, autoTrade: false, ...(S.rh_limits || {}) }, V = "robinhood";
  if (!S.rh_tokens?.sealed) return refuse(d, V, "not_connected", "Robinhood is not connected");
  if (!lim.autoTrade) return refuse(d, V, "auto_trade_off", "Auto trade is off");
  if (S.kill === true) return refuse(d, V, "kill_switch", "The kill switch is on");
  if (!(lim.maxPerTradeUsd > 0)) return refuse(d, V, "limit_per_trade", "Most per trade is zero");
  if (!(lim.maxDailyLossUsd > 0)) return refuse(d, V, "limit_daily_loss", "Most lost in a day is zero");
  if (!(lim.maxOpenPositions > 0)) return refuse(d, V, "limit_open", "Open positions at once is zero");
  if (!lim.allowStocks && !lim.allowCrypto) return refuse(d, V, "nothing_allowed", "Stocks and crypto are both off");
  const loss = -(await d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed' AND closed_at >= ${TODAY}`, [V])).s;
  if (loss >= lim.maxDailyLossUsd) return refuse(d, V, "daily_loss", `Today's loss is $${round(loss, 2)}, at the daily limit`);
  if ((await d.one(`SELECT count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}`, [V])).n >= lim.maxOpenPositions) return refuse(d, V, "max_open", "The open-position limit is reached");
  return refuse(d, V, "orders_not_built", S.rh_cache?.tools?.length ? "Stock orders are not built yet: Robinhood's tool list has been read and the order call is the next build" : "Stock orders are not built yet: Robinhood's tool list has not been read");
}
