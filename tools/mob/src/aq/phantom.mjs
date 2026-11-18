// Alex's own Phantom wallet on the Aquarius panel. The server knows ONLY its public address. It builds transactions for
// that address and hands them over UNSIGNED; Alex approves each one in Phantom's own window and Phantom sends it. There is
// no key of his here and nothing in this file can sign: it never imports the signer, and no route takes a key or a phrase.
// Phantom's provider as documented on docs.phantom.com/solana (read 2026-11-18): window.phantom.solana.isPhantom,
// connect() -> {publicKey}, signAndSendTransaction(transaction) -> {signature}, events connect/disconnect/accountChanged,
// error code 4001 when he says no. The page does that part (aq/phantom.js); it never calls Jupiter or an RPC itself.
import { db } from "../db.mjs";
import { unbase58, base58, readBalances, rpc } from "./wallet.mjs";
import { LIVE, quote, buildSwap, safetyOf, readTx, settle } from "./live.mjs";
import { transferTx, checkAddress } from "./payout.mjs";
import { feeds, SOL_MINT } from "./feeds.mjs";
import { GTA6_MINT } from "./seed.mjs";

export const GTA6_MAIN_MINT = "4kjruqGHDsSqkMdFfCjV7Vb62HPFhtXyWc2t6JpQzDnz"; // the main GTA6 coin, by its exact address (Alex, 2026-11-18)
const SELL_PCTS = [25, 50, 100], REFUSE_IMPACT_PCT = 10, CACHE_MS = 30000, STALE_MIN = 10;
const get = async (d, k, dflt = null) => (await d.one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? dflt;
const set = (d, k, v) => d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [k, JSON.stringify(v)]);
const brain = (d, text) => d.q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('execution','event',$1)`, [text]);
const cut = (s, n = 200) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
const short = (m) => (m && m.length > 12 ? `${m.slice(0, 4)}…${m.slice(-4)}` : m);
const isMint = (m) => { try { return typeof m === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m) && unbase58(m).length === 32; } catch { return false; } };

// ---------------------------------------------------------------- never a key, never a phrase
// Anything that looks like a private key or a recovery phrase is refused before it is looked at any further, and it is
// never stored, logged or echoed back. (A transaction signature is also 64 bytes: the one field that carries one is
// checked against the chain instead, see `sent`.)
export function looksSecret(v) {
  if (Array.isArray(v)) return v.length >= 32 && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 255) ? "a private key (a list of bytes)" : v.map(looksSecret).find(Boolean) || null;
  if (v && typeof v === "object") return Object.values(v).map(looksSecret).find(Boolean) || null;
  if (typeof v !== "string") return null;
  const t = v.trim(), words = t.split(/\s+/);
  if (words.length >= 12 && words.length <= 24 && words.every((w) => /^[a-zA-Z]{3,8}$/.test(w))) return "a recovery phrase";
  if (/^\[?\s*\d{1,3}(\s*,\s*\d{1,3}){31,}\s*\]?$/.test(t)) return "a private key (a list of bytes)";
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(t) || /^(0x)?[0-9a-fA-F]{128}$/.test(t)) return "a private key";
  if (/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(t)) { try { if (unbase58(t).length === 64) return "a private key"; } catch {} }
  return null;
}
const SECRET_MSG = (what) => `That looks like ${what}. Aquarius never takes one: it was not saved. Never type or paste it anywhere but Phantom itself. Only the public address is needed`;

// ---------------------------------------------------------------- connect / disconnect / what the card shows
export async function connect(env, body) {
  const d = db(env), sec = looksSecret(body);
  if (sec) return { error: SECRET_MSG(sec), secret: true };
  if (!body || typeof body !== "object" || Object.keys(body).some((k) => k !== "address")) return { error: "Send only the public address" };
  const aq = (await get(d, "sol_wallet_key"))?.address || null, bad = checkAddress(body.address, aq);
  if (bad) return { error: bad === "That is the Aquarius wallet's own address" ? "That is the Aquarius wallet's address, not your Phantom" : bad };
  const address = body.address.trim(), cur = await get(d, "phantom"), now = new Date().toISOString();
  if (cur?.address && cur.address !== address) await d.q(`UPDATE mob_aq_live_positions SET status = 'closed', closed_at = now(), exit_reason = 'another Phantom account was connected' WHERE venue = 'phantom' AND status IN ('opening','open','closing','stuck')`);
  await set(d, "phantom", { address, connectedAt: cur?.address === address ? cur.connectedAt : now, seenAt: now });
  if (cur?.address !== address) { await d.q(`DELETE FROM mob_aq_state WHERE k IN ('phantom_cache','phantom_signal')`); await brain(d, `Phantom connected by Alex: ${address} (public address only).`); }
  return { connected: true, address };
}
export async function disconnect(env) {
  await db(env).q(`DELETE FROM mob_aq_state WHERE k IN ('phantom','phantom_cache','phantom_signal')`);
  return { connected: false };
}
const tokenBalance = async (env, address, mint) => { let n = 0n, decimals = null; for (const a of (await rpc(env, "getTokenAccountsByOwner", [address, { mint }, { encoding: "jsonParsed" }])).value || []) { const t = a?.account?.data?.parsed?.info?.tokenAmount; if (t) { n += BigInt(t.amount || "0"); decimals = t.decimals; } } return { raw: n, decimals }; };
// The coins the BUY box offers: the main GTA6 coin first, then what Aquarius is looking at.
async function coins(d, S) {
  const out = new Map([[GTA6_MAIN_MINT, { mint: GTA6_MAIN_MINT, symbol: S.gta6_list?.tokens?.[GTA6_MAIN_MINT]?.symbol || "GTA6", from: "GTA6 main coin" }]]);
  const add = (mint, symbol, from) => { if (isMint(mint) && mint !== SOL_MINT && !out.has(mint)) out.set(mint, { mint, symbol: symbol || short(mint), from }); };
  if (S.phantom_signal) add(S.phantom_signal.mint, S.phantom_signal.symbol, "signal");
  if (S.tape?.mint) add(S.tape.mint, S.tape.symbol, "on the tape");
  for (const p of await d.q(`SELECT mint, symbol FROM mob_aq_live_positions WHERE status = 'open' ORDER BY id DESC LIMIT 10`)) add(p.mint, p.symbol, "live position");
  for (const p of await d.q(`SELECT mint, symbol FROM mob_aq_positions ORDER BY id DESC LIMIT 10`)) add(p.mint, p.symbol, "paper position");
  const top = (await d.one(`SELECT data FROM mob_aq_market WHERE k = 'jup:top' AND ok`))?.data;
  for (const c of (Array.isArray(top) ? top : []).filter((c) => c.liqUsd >= LIVE.poolMinUsd).sort((a, b) => b.liqUsd - a.liqUsd).slice(0, 15)) add(c.mint, c.symbol, "candidate");
  return [...out.values()];
}
const STATE_KEYS = ["phantom", "phantom_cache", "phantom_signal", "tape", "gta6_list", "sol_wallet_key"];
export async function phantomState(d, S0 = null) {
  const S = S0 || Object.fromEntries((await d.q(`SELECT k, v FROM mob_aq_state WHERE k = ANY($1::text[])`, [STATE_KEYS])).map((r) => [r.k, r.v]));
  const ph = S.phantom || null, honest = "Trades from Phantom need your approval in Phantom each time and only happen while this page is open. Fully automatic trading while you are away only works from the Aquarius wallet.";
  if (!ph?.address) return { connected: false, note: honest };
  const [pos, ord, pnl, tot] = await Promise.all([
    d.q(`SELECT id, mint, symbol, status, tokens_raw, cost_sol, stop_pct, last_value_sol, last_value_at, opened_at, plan, alert FROM mob_aq_live_positions WHERE venue = 'phantom' AND status IN ('open','stuck') ORDER BY id`),
    d.q(`SELECT id, side, symbol, mint, status, reason, error, signature, fill_sol, in_amount, requested_at FROM mob_aq_live_orders WHERE venue = 'phantom' ORDER BY id DESC LIMIT 8`),
    d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s FROM mob_aq_live_positions WHERE venue = 'phantom' AND pnl_sol IS NOT NULL AND (status IN ('open','stuck') OR closed_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Athens') AT TIME ZONE 'Europe/Athens'))`),
    d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s FROM mob_aq_live_positions WHERE venue = 'phantom' AND pnl_sol IS NOT NULL`),
  ]);
  const c = S.phantom_cache?.address === ph.address ? S.phantom_cache : null, sig = S.phantom_signal, held = new Set(pos.map((p) => p.mint)), now = Date.now();
  return { connected: true, address: ph.address, connectedAt: ph.connectedAt, sol: c?.sol ?? null, tokens: c?.tokens ?? null, checkedAt: c?.at ?? null, lastError: c?.error ?? null,
    positions: pos.map((p) => ({ id: Number(p.id), mint: p.mint, symbol: p.symbol, costSol: p.cost_sol, valueSol: p.last_value_sol, valueAt: p.last_value_at, openedAt: p.opened_at,
      plan: p.plan ? { stop: p.plan.phase === 2 ? Math.max(p.plan.stop, p.plan.trailStop ?? -Infinity) : p.plan.stop, t1: p.plan.t1, t2: p.plan.t2, phase: p.plan.phase } : null, sellNow: p.alert || null })),
    orders: ord.map((o) => ({ id: Number(o.id), side: o.side, symbol: o.symbol, status: o.status, reason: o.reason, error: o.error, signature: o.signature, sol: o.fill_sol ?? (o.side === "sell" ? null : -Number(o.in_amount) / 1e9), at: o.requested_at })),
    pnlSol: Math.round(pnl.s * 1e6) / 1e6, pnlTotalSol: Math.round((tot?.s ?? 0) * 1e6) / 1e6,
    signal: sig && now - new Date(sig.at).getTime() < 180000 && !held.has(sig.mint) ? { mint: sig.mint, symbol: sig.symbol, at: sig.at, why: sig.why, zone: sig.zone, entry: sig.entry, stop: sig.stop, t1: sig.t1, t2: sig.t2 } : null,
    coins: await coins(d, S), aquariusAddress: S.sol_wallet_key?.address || null, sellPcts: SELL_PCTS, note: honest, rule: "chart trader: Fibonacci pullback, chart stop, chart targets. Unproven: small size only" };
}
// The card's own poll: marks the page as open (signals are only looked for then), refreshes the balances twice a minute,
// closes orders he never approved, and asks the chain about any he did.
export async function status(env) {
  const d = db(env), ph = await get(d, "phantom");
  if (!ph?.address) return phantomState(d);
  if (!ph.seenAt || Date.now() - new Date(ph.seenAt).getTime() > 20000) await set(d, "phantom", { ...ph, seenAt: new Date().toISOString() });
  const c = await get(d, "phantom_cache");
  if (!c || c.address !== ph.address || Date.now() - new Date(c.at).getTime() > CACHE_MS) {
    try { await set(d, "phantom_cache", { address: ph.address, at: new Date().toISOString(), ...(await readBalances(env, ph.address)) }); }
    catch (e) { await set(d, "phantom_cache", { ...(c?.address === ph.address ? c : { address: ph.address }), at: new Date().toISOString(), error: cut(e.message || e) }); }
  }
  await d.q(`UPDATE mob_aq_live_orders SET status = 'failed', error = 'not approved in Phantom', updated_at = now() WHERE venue = 'phantom' AND status = 'requested' AND requested_at < now() - make_interval(mins => $1::int)`, [STALE_MIN]);
  for (const o of await d.q(`SELECT * FROM mob_aq_live_orders WHERE venue = 'phantom' AND status = 'sent' ORDER BY id LIMIT 3`)) await settle(env, o);
  return phantomState(d);
}

// ---------------------------------------------------------------- build a trade for him to approve (UNSIGNED)
const row = (d, f) => d.one(`INSERT INTO mob_aq_live_orders (venue, side, mint, symbol, claim, reason, in_amount, quote_out, min_out, impact_pct, slippage_bps, last_valid_height, wallet, dest)
  VALUES ('phantom',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [f.side, f.mint ?? null, f.symbol, `phantom|${crypto.randomUUID()}`, f.reason, String(f.inAmount), f.quoteOut ?? null, f.minOut ?? null, f.impact ?? null, f.slippage ?? null, f.lastValid, f.wallet, f.dest ?? null]);
const unsigned = (tx, address) => { const t = readTx(tx); if (t.nsig !== 1 || t.required !== 1 || t.payer !== address) throw new Error("the transaction is not a one-signature transaction of your Phantom wallet"); if (t.bytes.subarray(t.sigStart, t.sigStart + 64).some((b) => b !== 0)) throw new Error("the transaction came back already signed"); };
export async function buildTrade(env, body) {
  const d = db(env), sec = looksSecret(body);
  if (sec) return { error: SECRET_MSG(sec), secret: true };
  const ph = await get(d, "phantom");
  if (!ph?.address) return { error: "Connect Phantom first" };
  if (!body || typeof body !== "object" || Object.keys(body).some((k) => !["mint", "side", "sol", "pct"].includes(k))) return { error: "Send the coin, buy or sell, and the amount" };
  const { mint, side } = body;
  if (!isMint(mint) || mint === SOL_MINT) return { error: "That is not a coin address" };
  if (side !== "buy" && side !== "sell") return { error: "Choose buy or sell" };
  try {
    const top = await feeds.jupTop(env), c = (top.ok && Array.isArray(top.data) ? top.data : []).find((x) => x.mint === mint) || null;
    const symbol = c?.symbol || (mint === GTA6_MAIN_MINT || mint === GTA6_MINT ? "GTA6" : short(mint)), warnings = [];
    let amountRaw, pct = null, decimals = c?.audit?.decimals ?? null;
    if (side === "buy") {
      if (!(typeof body.sol === "number" && isFinite(body.sol) && body.sol > 0)) return { error: "Type how much SOL to spend" };
      amountRaw = String(Math.round(body.sol * 1e9));
      const bal = (await rpc(env, "getBalance", [ph.address])).value;
      if (!(bal >= Number(amountRaw) + LIVE.feeBudgetLamports)) return { error: `Your Phantom holds ${bal / 1e9} SOL: not enough for ${body.sol} SOL and the fees` };
      if (!c) warnings.push("This coin is not on Jupiter's lists: its pool size is unknown."); else if (c.liqUsd < LIVE.poolMinUsd) warnings.push(`Thin pool: about $${Math.round(c.liqUsd).toLocaleString("en-US")}, under $${LIVE.poolMinUsd / 1000}K. Thin pools cost more to get in and out of.`);
      const hs = await safetyOf(env, c || { mint });
      if (!hs.ok) warnings.push(`Safety check: ${hs.reason}.`);
      if (decimals == null) { try { decimals = (await rpc(env, "getTokenSupply", [mint])).value?.decimals ?? null; } catch {} }
    } else {
      pct = body.pct; if (!SELL_PCTS.includes(pct)) return { error: "Sell 25, 50 or 100 percent" };
      const tb = await tokenBalance(env, ph.address, mint); decimals = tb.decimals ?? decimals;
      if (!(tb.raw > 0n)) return { error: "Your Phantom does not hold this coin" };
      amountRaw = (pct === 100 ? tb.raw : (tb.raw * BigInt(pct)) / 100n).toString();
    }
    const q = await quote(env, side === "buy" ? SOL_MINT : mint, side === "buy" ? mint : SOL_MINT, amountRaw, side === "buy" ? LIVE.slippageBps : LIVE.exitSlippageBps);
    if (!q.ok) return { error: q.error };
    if (side === "buy" && q.impactPct > REFUSE_IMPACT_PCT) return { error: `This buy would move the price ${Math.round(q.impactPct * 10) / 10}%: the pool is too small for that amount. Try less` };
    if (q.impactPct > LIVE.maxImpactPct) warnings.push(`Price impact ${Math.round(q.impactPct * 100) / 100}%: this trade moves the price against you.`);
    const sw = await buildSwap(env, q.q, ph.address);
    if (!sw.ok) return { error: sw.error };
    unsigned(sw.tx, ph.address);
    const o = await row(d, { side, mint, symbol, reason: side === "buy" ? "buy (Alex, Phantom)" : `sell ${pct}% (Alex, Phantom)`, inAmount: amountRaw, quoteOut: q.q.outAmount, minOut: q.q.otherAmountThreshold, impact: q.impactPct, slippage: q.q.slippageBps ?? null, lastValid: sw.lastValidBlockHeight, wallet: ph.address });
    const units = (raw) => (decimals != null ? Number(raw) / 10 ** decimals : null);
    return { orderId: Number(o.id), tx: sw.tx, side, symbol, mint, pct, decimals,
      solIn: side === "buy" ? Number(amountRaw) / 1e9 : null, tokensIn: side === "sell" ? units(amountRaw) : null, tokensInRaw: side === "sell" ? amountRaw : null,
      expectOut: side === "buy" ? units(q.q.outAmount) : Number(q.q.outAmount) / 1e9, minOut: side === "buy" ? units(q.q.otherAmountThreshold) : Number(q.q.otherAmountThreshold) / 1e9, expectOutRaw: q.q.outAmount,
      impactPct: Math.round(q.impactPct * 1000) / 1000, feeSol: (sw.priorityLamports + 5000) / 1e9, route: (q.q.routePlan || []).map((r) => r.swapInfo?.label).filter(Boolean), warnings, wallet: ph.address };
  } catch (e) { return { error: cut(e.message || e) }; }
}
// FUND AQUARIUS WALLET: a plain SOL transfer from his Phantom to the Aquarius wallet's address, for him to approve.
export async function buildFund(env, body) {
  const d = db(env), sec = looksSecret(body);
  if (sec) return { error: SECRET_MSG(sec), secret: true };
  const ph = await get(d, "phantom"), aq = (await get(d, "sol_wallet_key"))?.address;
  if (!ph?.address) return { error: "Connect Phantom first" };
  if (!aq) return { error: "Create the Aquarius wallet first" };
  if (!body || typeof body !== "object" || Object.keys(body).some((k) => k !== "sol")) return { error: "Send only the amount. It always goes to the Aquarius wallet" };
  if (!(typeof body.sol === "number" && isFinite(body.sol) && body.sol > 0)) return { error: "Type how much SOL to send" };
  try {
    const lamports = Math.round(body.sol * 1e9), bh = (await rpc(env, "getLatestBlockhash", [{ commitment: "confirmed" }])).value, t = transferTx(ph.address, aq, lamports, bh.blockhash);
    const v = (await rpc(env, "simulateTransaction", [t.tx, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: false, commitment: "confirmed" }])).value;
    if (v?.err) return { error: v.err === "AccountNotFound" ? "Your Phantom has no SOL" : /InsufficientFundsForRent/.test(JSON.stringify(v.err)) ? "That amount is too small for Solana to accept, or it would leave your Phantom with too little" : `Your Phantom cannot send that (${cut(JSON.stringify(v.err), 100)})` };
    unsigned(t.tx, ph.address);
    const o = await row(d, { side: "fund", symbol: "SOL", reason: "fund the Aquarius wallet (Alex, Phantom)", inAmount: lamports, lastValid: bh.lastValidBlockHeight, wallet: ph.address, dest: aq });
    return { orderId: Number(o.id), tx: t.tx, side: "fund", sol: lamports / 1e9, destination: aq, feeSol: 0.000005, wallet: ph.address };
  } catch (e) { return { error: cut(e.message || e) }; }
}
// He approved it in Phantom and Phantom sent it: the page reports the signature. Nothing is recorded on the page's word:
// the chain must know that signature first, and the transaction behind it must be paid by his Phantom address.
export async function sent(env, body) {
  const d = db(env);
  if (!body || typeof body !== "object" || Object.keys(body).some((k) => !["orderId", "signature"].includes(k)) || !Number.isInteger(body.orderId)) return { error: "Send the order and its signature" };
  let ok = false; try { ok = typeof body.signature === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(body.signature) && unbase58(body.signature).length === 64; } catch {}
  if (!ok) { const sec = looksSecret(body.signature); return sec ? { error: SECRET_MSG(sec), secret: true } : { error: "That is not a transaction signature" }; }
  let o = await d.one(`SELECT * FROM mob_aq_live_orders WHERE id = $1 AND venue = 'phantom'`, [body.orderId]);
  if (!o) return { error: "No such Phantom order", missing: true };
  if (o.signature) return o.signature === body.signature ? { status: o.status, orderId: Number(o.id), signature: o.signature, already: true } : { error: "This order already has a different signature" };
  if (o.status !== "requested") return { error: `This order is closed (${o.error || o.status})` };
  // is it a real transaction? Until the chain has seen it, nothing is written (so a made-up or mistyped value is never stored)
  let seen = null;
  for (let i = 0; i < 4 && !seen; i++) { if (i) await new Promise((r) => setTimeout(r, Number(env.AQ_LIVE_POLL_MS ?? 1500))); try { seen = (await rpc(env, "getSignatureStatuses", [[body.signature], { searchTransactionHistory: true }])).value?.[0] ?? null; } catch {} }
  if (!seen) return { notSeenYet: true, orderId: Number(o.id) };
  try { o = await d.one(`UPDATE mob_aq_live_orders SET signature = $2, status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1 AND venue = 'phantom' AND status = 'requested' AND signature IS NULL RETURNING *`, [o.id, body.signature]); }
  catch (e) { if (/duplicate key|unique constraint/i.test(String(e.message || e))) return { error: "That signature is already recorded for another order" }; throw e; }
  if (!o) { const now = await d.one(`SELECT status, signature FROM mob_aq_live_orders WHERE id = $1`, [body.orderId]); return { status: now.status, orderId: body.orderId, signature: now.signature, already: true }; }
  const end = await settle(env, o, { polls: 3 });
  const fin = await d.one(`SELECT status, error, fill_sol FROM mob_aq_live_orders WHERE id = $1`, [o.id]);
  return { status: end === "pending" ? "sent" : fin.status, orderId: Number(o.id), signature: o.signature, reason: fin.status === "failed" ? fin.error || null : null, sol: fin.fill_sol };
}
// He closed the confirm or said no in Phantom: the order is closed at once instead of waiting ten minutes. Only an order
// that was never signed can be cancelled; one with a signature belongs to the chain.
export async function cancel(env, body) {
  if (!body || !Number.isInteger(body.orderId)) return { error: "Send the order" };
  const o = await db(env).one(`UPDATE mob_aq_live_orders SET status = 'failed', error = 'you said no in Phantom', updated_at = now() WHERE id = $1 AND venue = 'phantom' AND status = 'requested' AND signature IS NULL RETURNING id`, [body.orderId]);
  return { cancelled: !!o };
}
