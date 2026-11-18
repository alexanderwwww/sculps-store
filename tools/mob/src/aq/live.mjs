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
import { hardSafety, round } from "./logic.mjs";
import { FIB, entrySetup, manage, planOf } from "./chart.mjs";
import { AUDIT_RT } from "./council.mjs";

export const LIVE = {
  // ---- WHAT it trades: the chart trader in chart.mjs (Fibonacci pullback, chart stop, chart targets; no clock). UNPROVEN.
  // Which coins (the lesson numbers are in .claude/skills/aquarius-lessons):
  poolMinUsd: 100000,     // 3 PROVEN: thin pools cost four times more
  poolPreferMaxUsd: 500000, // 9 STRONG: mid-size pools are looked at first
  minAgeDays: 1,          // 7: established pairs only; same age line as the Council's tier B
  // 1 PROVEN: never chase. The only entry is a pullback into 50-61.8% that closes back up (chart.mjs entrySetup).
  // ---- how it executes (safety, not lessons)
  slippageBps: 100, exitSlippageBps: 150, maxImpactPct: 1, reserveSol: 0.01, feeBudgetLamports: 3500000, priorityMaxLamports: 500000,
  candidatesPerTick: 4, paperCoinsPerTick: 8, paperOpenMax: 40, confirmPolls: 6, confirmGapMs: 2500, maxSellFails: 5,
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
  return { ok: true, tx: r.j.swapTransaction, lastValidBlockHeight: Number(r.j.lastValidBlockHeight), priorityLamports: Number(r.j.prioritizationFeeLamports) || 0 };
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
export const upd = (d, id, f) => { const ks = Object.keys(f); return d.q(`UPDATE mob_aq_live_orders SET ${ks.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`, [id, ...ks.map((k) => f[k])]); };
// What actually happened, read from the confirmed transaction: SOL in or out of the wallet (fees included) and the tokens moved.
function fillOf(tx, address, mint) {
  const m = tx?.meta, keys = tx?.transaction?.message?.accountKeys || [];
  if (!m || !Array.isArray(m.preBalances) || (keys[0]?.pubkey ?? keys[0]) !== address) return null;
  const tok = (list) => (list || []).filter((b) => b.owner === address && b.mint === mint).reduce((a, b) => a + BigInt(b.uiTokenAmount?.amount || "0"), 0n);
  return { solLamports: m.postBalances[0] - m.preBalances[0], feeLamports: m.fee ?? 0, tokens: tok(m.postTokenBalances) - tok(m.preTokenBalances), err: m.err ?? null };
}
// Ask the chain about one sent order and write down the answer. Returns "confirmed" | "failed" | "pending".
export async function settle(env, o, { polls = 1 } = {}) {
  const d = db(env), address = o.wallet || (await get(d, "sol_wallet_key"))?.address;
  for (let i = 0; i < polls; i++) {
    if (i) await sleep(Number(env.AQ_LIVE_POLL_MS ?? LIVE.confirmGapMs));
    let st; try { st = (await solRpc(env, "getSignatureStatuses", [[o.signature], { searchTransactionHistory: true }])).value?.[0] ?? null; } catch { continue; }
    if (st && st.err) { await finish(d, o, "failed", { error: `the chain rejected it (${cut(JSON.stringify(st.err), 140)})` }); return "failed"; }
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      let tx = null; try { tx = await solRpc(env, "getTransaction", [o.signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]); } catch {}
      const payer = tx?.transaction?.message?.accountKeys?.[0];
      if (tx?.meta && payer && (payer.pubkey ?? payer) !== address) { await finish(d, o, "failed", { error: "that signature belongs to a different transaction, not to this order" }); return "failed"; }
      const f = fillOf(tx, address, o.mint);
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
export async function finish(d, o, status, { error = null, fill = null } = {}) {
  const won = await d.one(`UPDATE mob_aq_live_orders SET status = $2, error = coalesce($3, error), fill_sol = $4, fill_tokens = $5, fee_sol = $6, confirmed_at = CASE WHEN $2 = 'confirmed' THEN now() END, updated_at = now()
    WHERE id = $1 AND status IN ('requested','sent') RETURNING id`, [o.id, status, error, fill ? fill.solLamports / 1e9 : null, fill ? fill.tokens.toString() : null, fill ? fill.feeLamports / 1e9 : null]);
  if (!won) return;
  if (o.venue === "phantom") { if (status === "confirmed") await phantomApply(d, o, fill); return; }
  if (!o.position_id) return;
  if (o.side === "buy" && /\|add\|/.test(o.claim || "")) { // Alex's BUY MORE on an open position: tokens and cost add up (average cost), the plan stays
    if (status === "confirmed" && fill.tokens > 0n) {
      await d.q(`UPDATE mob_aq_live_positions SET tokens_raw = (tokens_raw::numeric + $2::numeric)::text, cost_sol = cost_sol + $3, fees_sol = fees_sol + $4 WHERE id = $1`, [o.position_id, fill.tokens.toString(), -fill.solLamports / 1e9, fill.feeLamports / 1e9]);
      await brain(d, `LIVE BUY MORE ${o.symbol} (manual: Alex): ${round(-fill.solLamports / 1e9, 6)} SOL added (${o.signature}).`);
    }
    return;
  }
  if (o.side === "buy") {
    if (status === "confirmed" && fill.tokens > 0n) await d.q(`UPDATE mob_aq_live_positions SET status = 'open', tokens_raw = $2, cost_sol = $3, fees_sol = fees_sol + $4, opened_at = now() WHERE id = $1 AND status = 'opening'`,
      [o.position_id, fill.tokens.toString(), -fill.solLamports / 1e9, fill.feeLamports / 1e9]);
    else await d.q(`UPDATE mob_aq_live_positions SET status = 'failed', closed_at = now(), exit_reason = $2 WHERE id = $1 AND status = 'opening'`, [o.position_id, cut(error || "the buy brought no tokens")]);
    if (status === "confirmed") await brain(d, `LIVE BUY ${o.symbol}: ${round(-fill.solLamports / 1e9, 6)} SOL from the Aquarius wallet (${o.signature}). Chart plan: stop ${o.plan_patch?.stop ?? "?"}, targets ${o.plan_patch?.t1 ?? "?"} / ${o.plan_patch?.t2 ?? "?"}.`);
    return;
  }
  if (status === "confirmed") {
    // a partial sale (target 1: half) keeps the position open with the plan's next step; selling what is left closes it
    const p = await d.one(`UPDATE mob_aq_live_positions SET tokens_raw = greatest(0, tokens_raw::numeric - $5::numeric)::text, proceeds_sol = coalesce(proceeds_sol, 0) + $2, fees_sol = fees_sol + $3,
        status = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 THEN 'closed' ELSE 'open' END, sell_fails = 0, closed_at = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 THEN now() END,
        pnl_sol = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 THEN coalesce(proceeds_sol, 0) + $2 - cost_sol END, exit_reason = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 THEN $4 ELSE exit_reason END,
        plan = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 THEN coalesce(plan, '{}'::jsonb) || jsonb_build_object('outcome', $4::text, 'closedAt', now()) ELSE coalesce(plan, '{}'::jsonb) || coalesce($6::jsonb, '{}'::jsonb) END
      WHERE id = $1 AND status = 'closing' RETURNING status, pnl_sol`, [o.position_id, fill.solLamports / 1e9, fill.feeLamports / 1e9, o.reason, (-fill.tokens).toString(), o.plan_patch ? JSON.stringify(o.plan_patch) : null]);
    if (p) { await brain(d, `LIVE SELL ${o.symbol} (${o.reason}): ${round(fill.solLamports / 1e9, 6)} SOL back${p.status === "closed" ? `, ${p.pnl_sol >= 0 ? "+" : ""}${round(p.pnl_sol, 6)} SOL on the trade` : ", the rest stays open"} (${o.signature}).`); if (p.status === "closed") await dailyLossCheck(d); }
  } else await d.q(`UPDATE mob_aq_live_positions SET status = CASE WHEN sell_fails + 1 >= $2 THEN 'stuck' ELSE 'open' END, sell_fails = sell_fails + 1 WHERE id = $1 AND status = 'closing'`, [o.position_id, LIVE.maxSellFails]);
}
// A confirmed trade Alex approved in Phantom: his position in that coin is opened, added to, reduced or closed. Runs once
// per order (only the caller that moved the order to "confirmed" gets here). Phantom positions are his own: Aquarius
// never sells them, it only tells him (SELL NOW) when the chart says so: stop, target or invalidation. Never a timer.
async function phantomApply(d, o, fill) {
  if (o.side === "buy" && fill.tokens > 0n) {
    // bought on a signal of the same coin: that signal's chart plan is the position's plan; bought on his own: no plan, no SELL NOW
    const sig = await get(d, "phantom_signal"), plan = sig && sig.mint === o.mint && sig.plan ? { ...sig.plan, entryT: Math.floor(Date.now() / 1000), since: Math.floor(Date.now() / 1000) } : null;
    await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, fees_sol, plan, opened_at)
      VALUES ('phantom',$1,$2,'open',$3,$4,$5,$6, now())
      ON CONFLICT (venue, mint) WHERE status IN ('opening','open','closing','stuck') DO UPDATE SET tokens_raw = (mob_aq_live_positions.tokens_raw::numeric + EXCLUDED.tokens_raw::numeric)::text,
        cost_sol = mob_aq_live_positions.cost_sol + EXCLUDED.cost_sol, fees_sol = mob_aq_live_positions.fees_sol + EXCLUDED.fees_sol`,
      [o.mint, o.symbol, fill.tokens.toString(), -fill.solLamports / 1e9, fill.feeLamports / 1e9, plan ? JSON.stringify(plan) : null]);
    await brain(d, `PHANTOM BUY ${o.symbol} by Alex: ${round(-fill.solLamports / 1e9, 6)} SOL from his Phantom wallet (${o.signature}).`);
  } else if (o.side === "sell" && fill.tokens < 0n) {
    // the share of the position that was sold takes the same share of its cost; all of it sold (or a 100% sell) closes it
    await d.q(`UPDATE mob_aq_live_positions p SET tokens_raw = greatest(0, p.tokens_raw::numeric - $2::numeric)::text, proceeds_sol = coalesce(p.proceeds_sol, 0) + $3, fees_sol = p.fees_sol + $4,
        pnl_sol = coalesce(p.pnl_sol, 0) + $3 - p.cost_sol * least(1, $2::numeric / nullif(p.tokens_raw::numeric, 0))::float8, cost_sol = p.cost_sol * (1 - least(1, $2::numeric / nullif(p.tokens_raw::numeric, 0))::float8),
        status = CASE WHEN $5 OR p.tokens_raw::numeric <= $2::numeric THEN 'closed' ELSE p.status END, closed_at = CASE WHEN $5 OR p.tokens_raw::numeric <= $2::numeric THEN now() END, exit_reason = $6,
        plan = CASE WHEN NOT ($5 OR p.tokens_raw::numeric <= $2::numeric) AND p.alert_action = 'sell_half' AND p.plan IS NOT NULL THEN p.plan || p.alert_patch ELSE p.plan END,
        alert = CASE WHEN p.alert_action = 'sell_half' THEN NULL ELSE p.alert END, alert_action = CASE WHEN p.alert_action = 'sell_half' THEN NULL ELSE p.alert_action END
      WHERE p.venue = 'phantom' AND p.mint = $1 AND p.status IN ('open','stuck')`, [o.mint, (-fill.tokens).toString(), fill.solLamports / 1e9, fill.feeLamports / 1e9, /100%/.test(o.reason || ""), o.reason]);
    await brain(d, `PHANTOM SELL ${o.symbol} by Alex (${o.reason}): ${round(fill.solLamports / 1e9, 6)} SOL back to his Phantom wallet (${o.signature}).`);
  }
}
// today's realized result, plus the marked loss of any 'stuck' position (a coin that cannot be sold still counts toward the daily limit)
export async function pnlToday(d) { return (await d.one(`SELECT (coalesce(sum(pnl_sol) FILTER (WHERE status = 'closed' AND closed_at >= ${TODAY}), 0)
  + coalesce(sum(least(0, coalesce(proceeds_sol, 0) + coalesce(last_value_sol, 0) - cost_sol)) FILTER (WHERE status = 'stuck' AND cost_sol IS NOT NULL), 0))::float8 s FROM mob_aq_live_positions WHERE venue = $1`, [VENUE])).s; }
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
async function execute(env, w, { side, c, positionId, inMint, outMint, amountRaw, slippageBps, reason, claim, q0 = null, patch = null }) {
  const d = db(env);
  let o;
  try { o = await d.one(`INSERT INTO mob_aq_live_orders (venue, side, mint, symbol, position_id, claim, reason, in_amount, slippage_bps, plan_patch) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [VENUE, side, c.mint, c.symbol, positionId, claim, reason, String(amountRaw), slippageBps, patch ? JSON.stringify(patch) : null]); }
  catch (e) { if (/duplicate key|unique constraint/i.test(String(e.message || e))) return { skipped: "this order was already made in this minute" }; return { skipped: `the order could not be written down (${cut(e.message || e, 120)}); nothing was sent`, noOrder: true }; }
  const fail = async (error) => { await finish(d, o, "failed", { error }); return { failed: error, orderId: o.id }; };
  try {
    const qr = q0 || (await quote(env, inMint, outMint, amountRaw, slippageBps));
    if (!qr.ok) return fail(qr.error);
    if (side === "buy" && qr.impactPct > LIVE.maxImpactPct) return fail(`price impact ${round(qr.impactPct, 2)}% is over the ${LIVE.maxImpactPct}% cap`);
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
// A Grok VETO: a war-room message or an evidence post from Grok in the last hour whose text is "VETO <exact mint>" (markup,
// quote marks and a colon allowed around the word). "VETO lifted on <mint>" or a mint named later in the text is not a veto.
export const isVeto = (text, mint) => new RegExp(`^[\\s>*_\`#~-]*VETO[\\s*_\`:~-]+${mint}(?![1-9A-HJ-NP-Za-km-z])`, "i").test(String(text || ""));
export async function vetoed(d, mint) {
  const rows = await d.q(`SELECT text FROM mob_aq_chat WHERE from_name = 'grok' AND at > now() - interval '1 hour' AND strpos(text, $1) > 0
    UNION ALL SELECT text FROM mob_aq_helpers WHERE from_helper = 'grok' AND at > now() - interval '1 hour' AND strpos(text, $1) > 0`, [mint]);
  return rows.some((r) => isVeto(r.text, mint));
}
// The pool's liquidity by exact mint, from Jupiter's lists WITHOUT the $100K entry filter, so a draining pool is still seen.
// Null when the coin is in none of the lists (the -30% exit then cannot be judged that minute; the chart stop still runs).
export async function liqOf(env, mint) {
  const top = await feeds.jupTop(env); const c = top.ok && Array.isArray(top.data) ? top.data.find((x) => x.mint === mint) : null;
  return c && Number.isFinite(c.liqUsd) ? c.liqUsd : null;
}
// The coins the chart trader may look at: established pairs with a deep enough pool, mid-size pools first.
export async function candidates(env) {
  const top = await feeds.jupTop(env), nowMs = Date.now();
  if (!top.ok || !Array.isArray(top.data)) return null;
  return top.data.filter((c) => c.quoteMint === SOL_MINT && c.liqUsd >= LIVE.poolMinUsd && c.createdAt && nowMs - new Date(c.createdAt).getTime() > LIVE.minAgeDays * 86400000)
    .sort((a, b) => (a.liqUsd <= LIVE.poolPreferMaxUsd ? 0 : 1) - (b.liqUsd <= LIVE.poolPreferMaxUsd ? 0 : 1) || b.liqUsd - a.liqUsd);
}
// Look for the setup among those coins. Returns {c, s} (the coin and the chart setup) for the first coin that passes every
// validation, or the last refusal (each written down under `venue`). `skip(mint, s)` = coins or legs not to take again.
export async function scanFib(env, venue, skip) {
  const d = db(env), list = await candidates(env), nowSec = Date.now() / 1000;
  if (!list) return { refusal: await refuse(d, venue, "no_market_data", "Jupiter's coin lists did not answer") };
  if (!list.length) return { refusal: await refuse(d, venue, "no_candidate", "No established coin with a pool of $100K or more right now") };
  let last = null, looked = 0;
  for (const c of list) {
    if (looked >= LIVE.candidatesPerTick) break;
    if (await skip(c.mint, null)) continue;
    looked++;
    const cs = await feeds.jupCandles(env, c.mint);
    if (!cs.ok) { last = await refuse(d, venue, "no_candles", "No one-minute candles for this coin", c); continue; }
    const s = entrySetup(cs.data, nowSec);
    if (!s.signal) { last = await refuse(d, venue, s.stale ? "stale_data" : "no_setup", s.why, c); continue; }
    if (await skip(c.mint, s)) { last = await refuse(d, venue, "same_leg", "This leg was already traded once", c); continue; }
    if (await vetoed(d, c.mint)) { last = await refuse(d, venue, "veto", "Grok vetoed this coin in the last hour", c); continue; }
    const hs = await safetyOf(env, c);
    if (!hs.ok) { last = await refuse(d, venue, "safety", hs.reason, c); continue; }
    return { c, s };
  }
  return { refusal: last || await refuse(d, venue, "no_setup", "No coin is in a Fibonacci pullback right now") };
}
// The hard safety check: RugCheck's report, or Jupiter's own audit when RugCheck does not answer. Unknown = not safe.
export async function safetyOf(env, c) {
  const rg = await feeds.rug(env, c.mint);
  return rg.ok ? hardSafety(rg.data) : c.audit && c.audit.mintOff && c.audit.freezeOff ? { ok: true } : { ok: false, reason: "safety unknown: no RugCheck report and no clean Jupiter audit" };
}
// A leg is traded once: after a stop, the same leg showing the same pocket again is not bought again.
const legTaken = async (d, venue, mint, s) => !!(await d.one(`SELECT 1 FROM mob_aq_live_positions WHERE venue = $1 AND mint = $2 AND (status IN ${ACTIVE} OR ($3::bigint IS NOT NULL AND (plan->'leg'->>'highT')::bigint = $3::bigint)) LIMIT 1`, [venue, mint, s ? s.leg.highT : null]));
async function tryBuy(env, g) {
  const d = db(env), minute = Math.floor(Date.now() / 60000);
  const found = await scanFib(env, VENUE, (mint, s) => legTaken(d, VENUE, mint, s));
  if (!found.c) return found.refusal;
  const { c, s } = found, size = g.lim.maxPerTradeSol, lamports = Math.round(size * 1e9);
  let bal; try { bal = (await solRpc(env, "getBalance", [g.w.address])).value; } catch (e) { return refuse(d, VENUE, "no_balance", cut(e.message)); }
  if (!(bal >= lamports + LIVE.feeBudgetLamports + LIVE.reserveSol * 1e9)) return refuse(d, VENUE, "reserve", `The wallet holds ${round(bal / 1e9, 6)} SOL: not enough for a ${size} SOL trade and the ${LIVE.reserveSol} SOL kept for fees`);
  const q = await quote(env, SOL_MINT, c.mint, lamports, LIVE.slippageBps);
  if (!q.ok) return refuse(d, VENUE, "no_quote", q.error, c);
  if (q.impactPct > LIVE.maxImpactPct) return refuse(d, VENUE, "price_impact", `Price impact ${round(q.impactPct, 2)}% is over the ${LIVE.maxImpactPct}% cap`, c);
  // cost first: the measured round trip (buy this size, sell what it buys) under 1%, and the way to target 1 at least 3x it
  const back = await quote(env, c.mint, SOL_MINT, q.q.outAmount, LIVE.exitSlippageBps);
  if (!back.ok) return refuse(d, VENUE, "no_quote", `no sell quote: ${back.error}`, c);
  const rtPct = round((1 - Number(back.q.outAmount) / lamports) * 100, 3), rewardPct = round(((s.t1 - s.entry) / s.entry) * 100, 3);
  if (rtPct >= FIB.maxRtPct) return refuse(d, VENUE, "cost", `The round trip costs ${rtPct}%, over ${FIB.maxRtPct}%`, c);
  if (rewardPct < FIB.minRewardRt * rtPct) return refuse(d, VENUE, "cost", `Target 1 is ${rewardPct}% away, under ${FIB.minRewardRt}x the ${rtPct}% round trip`, c);
  const plan = planOf(s, Math.floor(Date.now() / 1000), { liq: c.liqUsd, rtPct, rewardPct, sizeSol: size, validations: { ...s.validations, notVetoed: true, safety: true, cost: true, impact: true } });
  // the claim: one statement takes the coin's only active slot, under the open-position limit. A second caller gets nothing.
  const p = await d.one(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, stop_pct, pool_liq_usd, plan)
    SELECT $1,$2,$3,'opening',$4,$5,$6 WHERE (SELECT count(*) FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}) < $7::int ON CONFLICT DO NOTHING RETURNING id`,
    [VENUE, c.mint, c.symbol, round(((s.entry - s.stop) / s.entry) * 100, 3), c.liqUsd, JSON.stringify(plan), g.lim.maxOpenPositions]);
  if (!p) return refuse(d, VENUE, "claim_lost", "This coin or the last free slot was taken by another run", c);
  const r = await execute(env, g.w, { side: "buy", c, positionId: p.id, inMint: SOL_MINT, outMint: c.mint, amountRaw: lamports, slippageBps: LIVE.slippageBps, reason: s.why, claim: `${VENUE}|${c.mint}|buy|${minute}`, q0: q, patch: { stop: s.stop, t1: s.t1, t2: s.t2 } });
  if (r.skipped) await d.q(`UPDATE mob_aq_live_positions SET status = 'failed', closed_at = now(), exit_reason = $2 WHERE id = $1 AND status = 'opening'`, [p.id, r.noOrder ? cut(r.skipped) : "duplicate order"]);
  return { buy: c.symbol, ...r };
}
// Exits run whenever a live position is open, with auto trade on or off and with the kill switch on: a position is never left alone.
// `size(tokensRaw)` turns the tokens held AT THE CLAIM into the amount to sell (default: all of them), never a stale read.
async function sellPosition(env, w, p, reason, claimKey, { size = (t) => t, patch = null } = {}) {
  const d = db(env);
  const took = await d.one(`UPDATE mob_aq_live_positions SET status = 'closing' WHERE id = $1 AND status IN ('open','stuck') RETURNING id, status, tokens_raw`, [p.id]);
  if (!took) return { skipped: "already being sold" };
  let amountRaw = String(size(took.tokens_raw)); if (!/^\d+$/.test(amountRaw) || amountRaw === "0") amountRaw = took.tokens_raw;
  const r = await execute(env, w, { side: "sell", c: { mint: p.mint, symbol: p.symbol }, positionId: p.id, inMint: p.mint, outMint: SOL_MINT, amountRaw, slippageBps: LIVE.exitSlippageBps, reason, claim: `${VENUE}|${p.mint}|sell|${claimKey}`, patch });
  if (r.skipped) await d.q(`UPDATE mob_aq_live_positions SET status = CASE WHEN sell_fails >= $2 THEN 'stuck' ELSE 'open' END WHERE id = $1 AND status = 'closing'`, [p.id, LIVE.maxSellFails]);
  return { sell: p.symbol, reason, ...r };
}
// The chart decides every exit (chart.mjs manage). No data this minute = hold: missing data never forces a sale.
async function exits(env, w) {
  const d = db(env), out = [], minute = Math.floor(Date.now() / 60000), nowSec = Date.now() / 1000;
  // a 'stuck' position (5 failed sells in a row) is still managed and retried every minute: a coin is never left alone
  for (const p of await d.q(`SELECT * FROM mob_aq_live_positions WHERE venue = $1 AND status IN ('open','stuck') ORDER BY id`, [VENUE])) {
    const q = await quote(env, p.mint, SOL_MINT, p.tokens_raw, LIVE.exitSlippageBps);
    if (q.ok) await d.q(`UPDATE mob_aq_live_positions SET last_value_sol = $2, last_value_at = now() WHERE id = $1`, [p.id, Number(q.q.outAmount) / 1e9]);
    if (!p.plan) continue; // a position without a chart plan (none is opened that way) waits for SELL ALL LIVE
    const cs = await feeds.jupCandles(env, p.mint);
    const m = manage(p.plan, cs.ok ? cs.data : [], nowSec, { liqNow: await liqOf(env, p.mint), vetoed: await vetoed(d, p.mint) });
    // the panel's sparkline: the last closed 1-minute price, once a minute, the last 90 kept (display only; manage() never reads it)
    const lastPx = cs.ok ? cs.data.filter((c) => c.t + 60 <= nowSec).slice(-1)[0]?.c : null;
    if (Number.isFinite(lastPx)) await d.q(`UPDATE mob_aq_live_positions SET alert_patch = jsonb_build_object('spark', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(coalesce(alert_patch->'spark', '[]'::jsonb)) x OFFSET greatest(0, jsonb_array_length(coalesce(alert_patch->'spark', '[]'::jsonb)) - 89)) z) || jsonb_build_array($2::float8)) WHERE id = $1`, [p.id, lastPx]);
    if (m.action === "hold") { if (m.patch) await d.q(`UPDATE mob_aq_live_positions SET plan = plan || $2::jsonb WHERE id = $1 AND status = 'open'`, [p.id, JSON.stringify(m.patch)]); continue; }
    out.push(await sellPosition(env, w, p, m.reason, `${p.plan.phase ?? 0}-${minute}`, { size: m.action === "sell_half" ? (t) => (BigInt(t) / 2n).toString() : (t) => t, patch: m.action === "sell_half" ? m.patch : null }));
  }
  return out;
}
// ---------------------------------------------------------------- the paper mirror: the same chart trader on every candidate
// Not only the live slots: every established coin the scan can read, on paper, entry at the bounce close, exits by manage(),
// cost = the measured round trip of its liquidity tier. So the brain gets a large sample of this exact logic quickly.
const tierCost = (liq) => AUDIT_RT[liq >= 500000 ? "A" : liq >= 100000 ? "B" : "C"];
export async function paperTick(env) {
  const d = db(env), list = await candidates(env), nowSec = Date.now() / 1000, out = { opened: 0, closed: 0, halves: 0 };
  if (!list) return out;
  for (const t of await d.q(`SELECT * FROM mob_aq_chart_paper WHERE closed_at IS NULL ORDER BY id LIMIT $1`, [LIVE.paperOpenMax])) {
    const cs = await feeds.jupCandles(env, t.mint); if (!cs.ok) continue;
    const m = manage(t.plan, cs.data, nowSec, { liqNow: await liqOf(env, t.mint), vetoed: await vetoed(d, t.mint) });
    const px = cs.data.filter((c) => c.t + 60 <= nowSec).slice(-1)[0]?.c;
    if (m.action === "hold") { if (m.patch) await d.q(`UPDATE mob_aq_chart_paper SET plan = plan || $2::jsonb WHERE id = $1`, [t.id, JSON.stringify(m.patch)]); continue; }
    const legPct = ((px - t.entry_px) / t.entry_px) * 100;
    if (m.action === "sell_half") { await d.q(`UPDATE mob_aq_chart_paper SET plan = plan || $2::jsonb, half_pct = $3 WHERE id = $1 AND half_pct IS NULL`, [t.id, JSON.stringify(m.patch), round(legPct, 4)]); out.halves++; continue; }
    const gross = t.half_pct != null ? (t.half_pct + legPct) / 2 : legPct;
    await d.q(`UPDATE mob_aq_chart_paper SET closed_at = now(), exit_px = $2, gross_pct = $3, net_pct = $3 - cost_pct, outcome = $4 WHERE id = $1 AND closed_at IS NULL`, [t.id, px, round(gross, 4), m.reason]); out.closed++;
  }
  const open = new Set((await d.q(`SELECT mint FROM mob_aq_chart_paper WHERE closed_at IS NULL`)).map((r) => r.mint));
  for (const c of list.slice(0, LIVE.paperCoinsPerTick)) {
    if (open.has(c.mint)) continue;
    const cs = await feeds.jupCandles(env, c.mint); if (!cs.ok) continue;
    const s = entrySetup(cs.data, nowSec); if (!s.signal) continue;
    const plan = planOf(s, Math.floor(nowSec), { liq: c.liqUsd });
    const r = await d.one(`INSERT INTO mob_aq_chart_paper (mint, symbol, leg_high_t, entry_px, cost_pct, liq_usd, plan) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (mint, leg_high_t) DO NOTHING RETURNING id`,
      [c.mint, c.symbol, s.leg.highT, s.entry, tierCost(c.liqUsd), c.liqUsd, JSON.stringify(plan)]);
    if (r) out.opened++;
  }
  return out;
}
export async function paperStats(d) {
  const r = await d.one(`SELECT count(*) FILTER (WHERE closed_at IS NOT NULL)::int n, count(*) FILTER (WHERE closed_at IS NULL)::int open, count(*) FILTER (WHERE net_pct > 0)::int wins, avg(net_pct)::float8 avg_net, avg(gross_pct)::float8 avg_gross FROM mob_aq_chart_paper`);
  const by = await d.q(`SELECT split_part(outcome, ':', 1) k, count(*)::int n, avg(net_pct)::float8 avg FROM mob_aq_chart_paper WHERE closed_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`);
  return { closed: r.n, open: r.open, wins: r.wins, avgNetPct: r.avg_net == null ? null : round(r.avg_net, 3), avgGrossPct: r.avg_gross == null ? null : round(r.avg_gross, 3), byOutcome: by.map((x) => ({ outcome: x.k, n: x.n, avgNetPct: round(x.avg, 3) })) };
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
    try { const ph = await phantomWatch(env, g); if (ph) out.phantom = ph; } catch (e) { out.phantomError = cut(e.message || e); }
    try { const pp = await paperTick(env); if (pp.opened || pp.closed || pp.halves) out.paper = pp; } catch (e) { out.paperError = cut(e.message || e); }
    // twice an hour, a read-only question to each Jupiter host from this Worker, so "does Jupiter answer from production" is on record
    if (minute % 30 === 0) { const hosts = {}; for (const h of JUP_HOSTS) { try { const r = await fetch(`${h}/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=10000000&slippageBps=50`, { signal: AbortSignal.timeout(8000) }); hosts[h] = r.status; await r.body?.cancel(); } catch { hosts[h] = "no answer"; } } await set(d, "live_probe", { at: out.at, hosts }); }
  } catch (e) { out.error = cut(e.message || e); }
  finally {
    try { await set(d, "live_tick", out); } catch {}
    await d.q(`UPDATE mob_aq_state SET v = 'false'::jsonb, at = now() WHERE k = 'live_tick_lock' AND v = $1::jsonb`, [JSON.stringify({ owner })]);
  }
  return out;
}
// ---------------------------------------------------------------- Alex's own orders on a live position (SELL 25/50/ALL, BUY MORE)
// They skip the entry signal, never the safety: kill switch, simulation, impact cap, balance and fee reserve, the daily loss
// stop and the open-position limit (BUY MORE adds to a held coin, it never opens a new one). Same order/ledger/reconcile path
// as the trader (execute -> finish -> settle). Reason on record: "manual: Alex". One manual order at a time (the tick lock).
export const MANUAL_PCTS = [25, 50, 100];
async function manualCheck(env, b) {
  b = b && typeof b === "object" ? b : {};
  const d = db(env), S = Object.fromEntries((await d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('sol_wallet_key','sol_wallet_limits','kill')`)).map((r) => [r.k, r.v]));
  const w = S.sol_wallet_key, lim = { maxPerTradeSol: 0, maxDailyLossSol: 0, maxOpenPositions: 0, ...(S.sol_wallet_limits || {}) };
  if (!w?.address || !w.sealed) return { error: "The Aquarius wallet has not been created" };
  if (S.kill === true) return { error: "The kill switch is on: no order, manual or automatic" };
  const p = await d.one(`SELECT * FROM mob_aq_live_positions WHERE id = $1 AND venue = $2`, [Number(b?.positionId) || 0, VENUE]);
  if (!p || p.status !== "open") return { error: p ? `That position is ${p.status}, not open` : "No such live position" };
  if (b.side === "sell") {
    if (!MANUAL_PCTS.includes(Number(b.pct))) return { error: "Sell 25, 50 or 100 percent" };
    const amount = Number(b.pct) === 100 ? p.tokens_raw : ((BigInt(p.tokens_raw) * BigInt(b.pct)) / 100n).toString();
    if (amount === "0") return { error: "Nothing to sell" };
    return { d, w, lim, p, amount };
  }
  if (b.side !== "buy") return { error: "side must be buy or sell" };
  const sol = Number(b.sol ?? lim.maxPerTradeSol);
  if (!(sol > 0)) return { error: "Amount must be above zero" };
  if (lim.maxPerTradeSol > 0 && sol > lim.maxPerTradeSol) return { error: `${sol} SOL is over the ${lim.maxPerTradeSol} SOL per-trade limit` };
  const pnl = await pnlToday(d);
  if (lim.maxDailyLossSol > 0 && -pnl >= lim.maxDailyLossSol) return { error: `Today's live loss is ${round(-pnl, 6)} SOL, at the daily limit: no buying today` };
  const open = (await d.one(`SELECT count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}`, [VENUE])).n;
  if (lim.maxOpenPositions > 0 && open > lim.maxOpenPositions) return { error: `${open} positions open, over the limit of ${lim.maxOpenPositions}` };
  const lamports = Math.round(sol * 1e9); let bal;
  try { bal = (await solRpc(env, "getBalance", [w.address])).value; } catch (e) { return { error: `The balance could not be read: ${cut(e.message)}` }; }
  if (!(bal >= lamports + LIVE.feeBudgetLamports + LIVE.reserveSol * 1e9)) return { error: `The wallet holds ${round(bal / 1e9, 6)} SOL: not enough for ${sol} SOL and the ${LIVE.reserveSol} SOL kept for fees` };
  return { d, w, lim, p, sol, lamports, underwater: p.last_value_sol != null && p.last_value_sol < p.cost_sol };
}
// What the order would do, for the confirm dialog. Sends nothing.
export async function manualPreview(env, b) {
  b = b && typeof b === "object" ? b : {};
  const k = await manualCheck(env, b); if (k.error) return k;
  const { p } = k, q = b.side === "sell" ? await quote(env, p.mint, SOL_MINT, k.amount, LIVE.exitSlippageBps) : await quote(env, SOL_MINT, p.mint, k.lamports, LIVE.slippageBps);
  if (!q.ok) return { error: q.error };
  return { side: b.side, positionId: Number(p.id), symbol: p.symbol, mint: p.mint, pct: b.side === "sell" ? Number(b.pct) : null, sol: b.side === "buy" ? k.sol : null, tokensIn: b.side === "sell" ? k.amount : null,
    expectOut: q.q.outAmount, minOut: q.q.otherAmountThreshold, expectSol: b.side === "sell" ? Number(q.q.outAmount) / 1e9 : null, impactPct: round(q.impactPct, 3), overImpact: q.impactPct > LIVE.maxImpactPct,
    underwater: !!k.underwater, warning: k.underwater ? "Rulebook v2 rule 10: never add to a loser. Buy anyway?" : null };
}
export async function manualOrder(env, b) {
  b = b && typeof b === "object" ? b : {};
  const k = await manualCheck(env, b); if (k.error) return k;
  if (b.side === "buy" && k.underwater && b.force !== true) return { error: "Rulebook v2 rule 10: never add to a loser. Buy anyway?", underwater: true };
  const { d, w, p } = k, owner = crypto.randomUUID(), minute = Math.floor(Date.now() / 60000);
  const lock = await d.one(`INSERT INTO mob_aq_state (k, v, at) VALUES ('live_tick_lock', $1::jsonb, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = now()
    WHERE mob_aq_state.v = 'false'::jsonb OR mob_aq_state.at < now() - interval '100 seconds' RETURNING k`, [JSON.stringify({ owner })]);
  if (!lock) return { error: "Another order is being made right now: try again in a few seconds", busy: true };
  try {
    if ((await d.one(`SELECT count(*)::int n FROM mob_aq_live_orders WHERE venue = $1 AND status IN ('requested','sent')`, [VENUE])).n) return { error: "An earlier order is still being confirmed on the chain", busy: true };
    if (b.side === "sell") return await sellPosition(env, w, p, `manual: Alex (sell ${b.pct}%)`, `manual-${b.pct}-${minute}`, { amountRaw: k.amount });
    const q = await quote(env, SOL_MINT, p.mint, k.lamports, LIVE.slippageBps);
    if (!q.ok) return { error: q.error };
    if (q.impactPct > LIVE.maxImpactPct) return { error: `Price impact ${round(q.impactPct, 2)}% is over the ${LIVE.maxImpactPct}% cap` };
    const r = await execute(env, w, { side: "buy", c: { mint: p.mint, symbol: p.symbol }, positionId: p.id, inMint: SOL_MINT, outMint: p.mint, amountRaw: k.lamports, slippageBps: LIVE.slippageBps, reason: "manual: Alex (buy more)", claim: `${VENUE}|${p.mint}|add|${minute}`, q0: q });
    return { buyMore: p.symbol, ...r };
  } finally { await d.q(`UPDATE mob_aq_state SET v = 'false'::jsonb, at = now() WHERE k = 'live_tick_lock' AND v = $1::jsonb`, [JSON.stringify({ owner })]); }
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
    d.q(`SELECT id, mint, symbol, status, tokens_raw, cost_sol, stop_pct, last_value_sol, last_value_at, opened_at, plan, sell_fails, alert_patch FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE} ORDER BY id`, [venue]),
    d.q(`SELECT id, side, symbol, mint, status, reason, error, signature, fill_sol, fee_sol, requested_at FROM mob_aq_live_orders WHERE venue = $1 ORDER BY id DESC LIMIT 20`, [venue]),
    d.one(`SELECT gate, reason, symbol, n, at FROM mob_aq_live_refusals WHERE venue = $1 ORDER BY at DESC LIMIT 1`, [venue]),
    d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s, count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed' AND closed_at >= ${TODAY}`, [venue]),
    d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('live_tick','live_auto_off')`),
  ]);
  const st = Object.fromEntries(S.map((r) => [r.k, r.v]));
  const plan = (p) => (p.plan ? { stop: p.plan.phase === 2 ? Math.max(p.plan.stop, p.plan.trailStop ?? -Infinity) : p.plan.stop, t1: p.plan.t1, t2: p.plan.t2, t3: p.plan.t3, entry: p.plan.entry, phase: p.plan.phase, leg: p.plan.leg } : null);
  return { positions: pos.map((p) => ({ id: Number(p.id), symbol: p.symbol, mint: p.mint, status: p.status, costSol: p.cost_sol, valueSol: p.last_value_sol, valueAt: p.last_value_at, openedAt: p.opened_at, plan: plan(p), spark: Array.isArray(p.alert_patch?.spark) ? p.alert_patch.spark : [], pnlPct: p.last_value_sol != null && p.cost_sol > 0 ? round((p.last_value_sol / p.cost_sol - 1) * 100, 2) : null, underwater: p.last_value_sol != null && p.last_value_sol < p.cost_sol })),
    orders: ord.map((o) => ({ id: Number(o.id), side: o.side, symbol: o.symbol, status: o.status, reason: o.reason, error: o.error, signature: o.signature, sol: o.fill_sol, at: o.requested_at })),
    manualPcts: MANUAL_PCTS, pnlTodaySol: round(pnl.s, 6), closedToday: pnl.n, lastRefusal: ref ? { gate: ref.gate, reason: ref.reason, symbol: ref.symbol, times: ref.n, at: ref.at } : null,
    lastTickAt: st.live_tick?.at || null, autoOff: st.live_auto_off || null, paper: await paperStats(d),
    rule: "chart trader: Fibonacci pullback, chart stop, chart targets", proven: false,
    note: "Never tested in the training arena (it tested fixed holds): it starts unproven. The paper mirror below measures it on every coin." };
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

// ---------------------------------------------------------------- Phantom: signals only. Aquarius never signs for Phantom.
// While Alex's Phantom is connected and the panel was open in the last 3 minutes: the same dip scan, stored as a signal for
// the page to show (valid 3 minutes), and a fresh sell quote for each of his Phantom positions so the page can say SELL NOW.
export async function phantomWatch(env, g = null) {
  const d = db(env), ph = await get(d, "phantom");
  // a trade he approved whose outcome is not known yet is settled from the chain whether or not the page is still open
  for (const o of await d.q(`SELECT * FROM mob_aq_live_orders WHERE venue = 'phantom' AND status = 'sent' ORDER BY id LIMIT 5`)) await settle(env, o);
  if (!ph?.address || !ph.seenAt || Date.now() - new Date(ph.seenAt).getTime() > 180000) return null;
  const open = await d.q(`SELECT * FROM mob_aq_live_positions WHERE venue = 'phantom' AND status = 'open' ORDER BY id`), list = (await candidates(env)) || [], nowSec = Date.now() / 1000;
  for (const p of open.slice(0, 4)) {
    const q = await quote(env, p.mint, SOL_MINT, p.tokens_raw, LIVE.exitSlippageBps);
    if (q.ok) await d.q(`UPDATE mob_aq_live_positions SET last_value_sol = $2, last_value_at = now() WHERE id = $1`, [p.id, Number(q.q.outAmount) / 1e9]);
    if (!p.plan) continue;
    const cs = await feeds.jupCandles(env, p.mint), coin = list.find((c) => c.mint === p.mint);
    const m = manage(p.plan, cs.ok ? cs.data : [], nowSec, { liqNow: coin ? coin.liqUsd : null, vetoed: await vetoed(d, p.mint) });
    // he sells, never Aquarius: a trail update is applied, a sale is only told to him (SELL NOW), and the half sale's next step waits for his sale
    if (m.action === "hold") await d.q(`UPDATE mob_aq_live_positions SET plan = plan || coalesce($2::jsonb, '{}'::jsonb), alert = NULL, alert_action = NULL, alert_patch = NULL WHERE id = $1`, [p.id, m.patch ? JSON.stringify(m.patch) : null]);
    else await d.q(`UPDATE mob_aq_live_positions SET alert = $2, alert_action = $3, alert_patch = $4 WHERE id = $1`, [p.id, m.action === "sell_half" ? "target 1 reached: sell half (then the stop moves to your entry)" : m.reason, m.action, m.patch ? JSON.stringify(m.patch) : null]);
  }
  const found = await scanFib(env, "phantom", async (mint) => open.some((p) => p.mint === mint));
  if (found.c) { const s = found.s; await set(d, "phantom_signal", { mint: found.c.mint, symbol: found.c.symbol, at: new Date().toISOString(), why: s.why, zone: [s.levels.z618, s.levels.z50], entry: s.entry, stop: s.stop, t1: s.t1, t2: s.t2, t3: s.t3, liqUsd: found.c.liqUsd, plan: planOf(s, Math.floor(nowSec), { liq: found.c.liqUsd }) }); }
  return { marked: open.length, signal: found.c ? found.c.symbol : null };
}
