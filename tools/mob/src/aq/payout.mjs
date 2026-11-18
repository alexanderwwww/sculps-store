// The way OUT of the Aquarius wallet: SOL to ONE saved address, chosen by Alex. And the way BACK for the key: a restore
// from the second sealed copy. SOL only: coins are sold with SELL ALL LIVE first.
//  - The destination is never taken from a withdrawal request. It is the saved payout address, and changing that address
//    locks withdrawals for 24 hours (a stolen session cannot point it somewhere else and empty the wallet at once).
//  - The transfer is one System Program instruction built here byte by byte, simulated on the chain first (the wallet must
//    lose exactly the amount plus the fee, the destination must gain exactly the amount), signed by live.mjs's signer (one
//    signature, paid by the Aquarius wallet, nothing else), recorded with its signature BEFORE it is sent, and an unknown
//    send is never repeated: the chain is asked for that signature (here, and by the live tick every minute).
// RPC shapes read live on 2026-11-18: getLatestBlockhash -> value.{blockhash,lastValidBlockHeight}; getFeeForMessage ->
// value (lamports); getMinimumBalanceForRentExemption(0) -> number; getAccountInfo -> value null | {owner, lamports}.
import { db } from "../db.mjs";
import { unbase58, base58, proves, rpc } from "./wallet.mjs";
import { LIVE, signTx, settle, upd, finish, takeLock, dropLock } from "./live.mjs";

const VENUE = "solana", LOCK_MS = 0, SYSTEM = "11111111111111111111111111111111"; // LOCK_MS 0: Alex 2026-11-18, no lock, any payout address he sets can receive right away
// addresses that are programs or system accounts, never a person's wallet
const NOT_A_WALLET = new Set([SYSTEM, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", "So11111111111111111111111111111111111111112",
  "ComputeBudget111111111111111111111111111111", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", "Stake11111111111111111111111111111111111111", "Vote111111111111111111111111111111111111111", "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "SysvarRent111111111111111111111111111111111", "SysvarC1ock11111111111111111111111111111111", "Sysvar1nstructions1111111111111111111111111", "SysvarRecentB1ockHashes11111111111111111111", "1nc1nerator11111111111111111111111111111111"]);
const get = async (d, k, dflt = null) => (await d.one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? dflt;
const set = (d, k, v) => d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [k, JSON.stringify(v)]);
const brain = (d, text) => d.q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('execution','event',$1)`, [text]);
const cut = (s, n = 240) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
const athens = (ms) => new Date(ms).toLocaleString("en-GB", { timeZone: "Europe/Athens", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const solOf = (lamports) => Number(lamports) / 1e9;

// ---------------------------------------------------------------- the payout address
export function checkAddress(address, own) {
  if (typeof address !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim())) return "That is not a Solana address";
  address = address.trim();
  let b; try { b = unbase58(address); } catch { return "That is not a Solana address"; }
  if (b.length !== 32 || base58(b) !== address) return "That is not a Solana address (it must be 32 bytes)";
  if (address === own) return "That is the Aquarius wallet's own address";
  if (NOT_A_WALLET.has(address) || /^Sysvar/.test(address)) return "That address is a Solana program, not a wallet";
  return null;
}
// On the chain: an address that already holds a token account or a program is refused; one that does not exist yet is a new wallet.
async function notAWalletOnChain(env, address) {
  const a = (await rpc(env, "getAccountInfo", [address, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }])).value;
  if (a && a.owner !== SYSTEM) return "That address is a token account or a program, not a wallet. Use your wallet's main address";
  if (a && a.executable) return "That address is a program, not a wallet";
  return null;
}
export async function savePayout(env, body) {
  const d = db(env), w = await get(d, "sol_wallet_key"), cur = await get(d, "sol_payout");
  if (!w?.address) return { error: "Create the wallet first" };
  if (!body || typeof body !== "object" || Object.keys(body).some((k) => k !== "address")) return { error: "Send only the address" };
  const bad = checkAddress(body.address, w.address);
  if (bad) return { error: bad };
  const address = body.address.trim();
  if (cur?.address === address) return { payout: publicPayout(cur) };
  let chain; try { chain = await notAWalletOnChain(env, address); } catch (e) { return { error: `The address could not be checked on the chain (${cut(e.message, 120)}). Nothing was saved` }; }
  if (chain) return { error: chain };
  const now = Date.now(), next = { address, setAt: new Date(now).toISOString(), lockedUntil: cur?.address ? new Date(now + LOCK_MS).toISOString() : null, previous: cur?.address || null };
  await set(d, "sol_payout", next);
  await brain(d, cur?.address ? `Payout address CHANGED by Alex to ${address} (was ${cur.address}). Withdrawals are locked until ${athens(now + LOCK_MS)} Athens time.` : `Payout address set by Alex: ${address}.`);
  return { payout: publicPayout(next) };
}
export const publicPayout = (p) => (p?.address ? { address: p.address, setAt: p.setAt, lockedUntil: p.lockedUntil && new Date(p.lockedUntil).getTime() > Date.now() ? p.lockedUntil : null } : null);

// ---------------------------------------------------------------- the transfer, byte by byte
// Legacy transaction: [1 signature slot][message]. Message: header (1 signer, 0 read-only signers, 1 read-only other),
// 3 accounts [wallet, destination, System Program], the recent blockhash, one instruction: System Program, accounts
// [0, 1], data = u32 2 ("transfer") + u64 lamports, both little-endian.
export function transferTx(from, to, lamports, blockhash) {
  const n = BigInt(lamports); if (n <= 0n || n > 0xffffffffffffffffn) throw new Error("bad amount");
  const msg = new Uint8Array(3 + 1 + 96 + 32 + 1 + 1 + 1 + 2 + 1 + 12), v = new DataView(msg.buffer);
  msg.set([1, 0, 1, 3], 0); msg.set(unbase58(from), 4); msg.set(unbase58(to), 36); /* System Program = 32 zero bytes at 68 */ msg.set(unbase58(blockhash), 100);
  msg.set([1, 2, 2, 0, 1, 12], 132); v.setUint32(138, 2, true); v.setBigUint64(142, n, true);
  const tx = new Uint8Array(1 + 64 + msg.length); tx[0] = 1; tx.set(msg, 65);
  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  return { tx: b64(tx), message: b64(msg) };
}
// What a withdrawal of `sol` (a number, or "all") would do right now, or why it is refused. Sends nothing.
export async function plan(env, sol) {
  const d = db(env), w = await get(d, "sol_wallet_key"), p = await get(d, "sol_payout");
  if (!w?.address || !w.sealed) return { error: "The Aquarius wallet has not been created" };
  if (!p?.address) return { error: "Save a payout address first" };
  if (checkAddress(p.address, w.address)) return { error: "The saved payout address is not valid. Save it again" };
  if (p.lockedUntil && new Date(p.lockedUntil).getTime() > Date.now()) return { error: `The payout address was changed. Withdrawals open again on ${athens(new Date(p.lockedUntil).getTime())} Athens time`, lockedUntil: p.lockedUntil };
  if (sol !== "all" && !(typeof sol === "number" && isFinite(sol) && sol > 0)) return { error: "Type an amount in SOL, or press All" };
  const [bal, rentMin, bh, open] = [(await rpc(env, "getBalance", [w.address])).value, await rpc(env, "getMinimumBalanceForRentExemption", [0]), (await rpc(env, "getLatestBlockhash", [{ commitment: "confirmed" }])).value,
    (await d.one(`SELECT count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status IN ('opening','open','closing','stuck')`, [VENUE])).n];
  if (typeof bal !== "number" || typeof rentMin !== "number" || !bh?.blockhash || !(bh.lastValidBlockHeight > 0)) return { error: "The chain did not answer in the expected shape. Nothing was sent" };
  const fee = (await rpc(env, "getFeeForMessage", [transferTx(w.address, p.address, 1, bh.blockhash).message, { commitment: "confirmed" }])).value;
  if (typeof fee !== "number") return { error: "The chain did not give the fee. Nothing was sent" };
  // open live positions need SOL to be sold later: each one's reserve stays in the wallet (a sale and its retries per position)
  const keep = open * (Math.round(LIVE.reserveSol * 1e9) + LIVE.feeBudgetLamports);
  const lamports = sol === "all" ? bal - fee - keep : Math.round(sol * 1e9), left = bal - fee - lamports;
  const base = { destination: p.address, balanceSol: solOf(bal), feeSol: solOf(fee), keepSol: solOf(keep), openPositions: open };
  if (!(lamports > 0)) return { ...base, error: open ? `There is nothing to withdraw: ${solOf(keep)} SOL stays in the wallet to sell the ${open} open live position(s)` : "There is no SOL to withdraw" };
  if (left < 0) return { ...base, error: `The wallet holds ${solOf(bal)} SOL: not enough for ${solOf(lamports)} SOL and the fee` };
  if (open && left < keep) return { ...base, error: `That would leave too little to sell the ${open} open live position(s). ${solOf(keep)} SOL must stay: the most you can withdraw now is ${solOf(Math.max(0, bal - fee - keep))} SOL, or press SELL ALL LIVE first` };
  if (left > 0 && left < rentMin) return { ...base, error: `That would leave ${solOf(left)} SOL, less than Solana lets a wallet hold (${solOf(rentMin)}). Press All, or leave at least ${solOf(rentMin)} SOL` };
  const dest = (await rpc(env, "getAccountInfo", [p.address, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }])).value;
  if (dest && dest.owner !== SYSTEM) return { ...base, error: "The payout address is a token account or a program, not a wallet. Save your wallet's main address" };
  if (!dest && lamports < rentMin) return { ...base, error: `The payout address is new and empty: the first transfer to it must be at least ${solOf(rentMin)} SOL` };
  return { ...base, ok: true, lamports, sol: solOf(lamports), leavesSol: solOf(left), w, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight, pre: bal, destPre: dest?.lamports ?? 0, fee };
}
const pub = ({ w, blockhash, lastValidBlockHeight, pre, destPre, fee, lamports, ...rest }) => rest; // what a route may show of a plan
export const preview = async (env, sol) => { try { return pub(await plan(env, sol)); } catch (e) { return { error: `The chain could not be read (${cut(e.message, 120)}). Nothing was sent` }; } };

// ---------------------------------------------------------------- withdraw
export async function withdraw(env, body) {
  const d = db(env);
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Send the amount" };
  // the destination is the saved payout address and nothing else: a request that tries to name one is refused outright
  if (Object.keys(body).some((k) => k !== "sol")) return { error: "A withdrawal takes only the amount. It always goes to the saved payout address" };
  // one money run at a time: a withdrawal never runs beside the trader's tick, a manual order or SELL ALL LIVE
  const owner = await takeLock(d);
  if (!owner) return { error: "The trader is in the middle of a run. Try again in a few seconds", pending: true };
  try { return await withdrawLocked(env, d, body); } finally { await dropLock(d, owner); }
}
async function withdrawLocked(env, d, body) {
  // an earlier withdrawal or order whose outcome is not known yet: the chain is asked first, nothing new is sent meanwhile
  for (const o of await d.q(`SELECT * FROM mob_aq_live_orders WHERE venue = $1 AND side = 'withdraw' AND status = 'sent' ORDER BY id`, [VENUE])) await settle(env, o, { polls: 2 });
  if ((await d.one(`SELECT count(*)::int n FROM mob_aq_live_orders WHERE venue = $1 AND status IN ('requested','sent')`, [VENUE])).n) return { error: "An earlier withdrawal or trade is still being confirmed on the chain. Try again in a minute", pending: true };
  let pl; try { pl = await plan(env, body.sol); } catch (e) { return { error: `The chain could not be read (${cut(e.message, 120)}). Nothing was sent` }; }
  if (!pl.ok) return pub(pl);
  let o;
  try { o = await d.one(`INSERT INTO mob_aq_live_orders (venue, side, symbol, claim, reason, in_amount, dest) VALUES ($1,'withdraw','SOL',$2,$3,$4,$5) RETURNING *`, [VENUE, `${VENUE}|withdraw|${crypto.randomUUID()}`, body.sol === "all" ? "withdraw all" : "withdraw", String(pl.lamports), pl.destination]); }
  catch (e) { if (/duplicate key|unique constraint/i.test(String(e.message || e))) return { error: "A withdrawal is already being sent. Nothing new was sent", pending: true }; throw e; }
  const fail = async (error) => { await finish(d, o, "failed", { error }); return { error, orderId: Number(o.id) }; };
  try {
    const t = transferTx(pl.w.address, pl.destination, pl.lamports, pl.blockhash);
    const v = (await rpc(env, "simulateTransaction", [t.tx, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: false, commitment: "confirmed", accounts: { encoding: "base64", addresses: [pl.w.address, pl.destination] } }])).value;
    if (v?.err) return fail(`the simulation failed (${cut(JSON.stringify(v.err), 140)}); nothing was sent`);
    const post = v?.accounts?.[0]?.lamports ?? (v?.accounts?.[0] === null ? 0 : undefined), dpost = v?.accounts?.[1]?.lamports;
    if (post !== pl.pre - pl.lamports - pl.fee || dpost !== pl.destPre + pl.lamports) return fail("the simulation did not show exactly the amount leaving the wallet and arriving at the payout address; nothing was signed");
    const signed = await signTx(env, pl.w, t.tx);
    await upd(d, o.id, { status: "sent", signature: signed.signature, last_valid_height: pl.lastValidBlockHeight, sent_at: new Date().toISOString() });
    o = { ...o, status: "sent", signature: signed.signature, last_valid_height: pl.lastValidBlockHeight };
    try { await rpc(env, "sendTransaction", [signed.tx, { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 5 }]); }
    catch (e) { await upd(d, o.id, { error: cut(`send: ${e.message || e}`) }); } // unknown outcome: not failed, not sent again
    const end = await settle(env, o, { polls: LIVE.confirmPolls });
    if (end === "confirmed") await brain(d, `WITHDRAWAL by Alex: ${pl.sol} SOL from the Aquarius wallet to ${pl.destination} (${o.signature}).`);
    if (end === "failed") return { error: (await d.one(`SELECT error FROM mob_aq_live_orders WHERE id = $1`, [o.id]))?.error || "the withdrawal failed", orderId: Number(o.id), signature: o.signature };
    return { [end]: true, orderId: Number(o.id), signature: o.signature, sol: pl.sol, destination: pl.destination };
  } catch (e) {
    if (o.status === "sent") return { pending: true, orderId: Number(o.id), signature: o.signature, sol: pl.sol, destination: pl.destination };
    return fail(cut(e.message || e));
  }
}
export async function withdrawals(d) {
  return (await d.q(`SELECT id, status, in_amount, dest, signature, error, fill_sol, requested_at FROM mob_aq_live_orders WHERE venue = $1 AND side = 'withdraw' ORDER BY id DESC LIMIT 5`, [VENUE]))
    .map((o) => ({ id: Number(o.id), status: o.status, sol: solOf(o.in_amount), destination: o.dest, signature: o.signature, error: o.error, at: o.requested_at }));
}

// ---------------------------------------------------------------- the key's second copy
// AQ_WALLET_BACKUP is a Worker secret holding the wallet row as JSON ({address, sealed, createdAt}); the key inside is
// still sealed with MOB_ENC_KEY. Read it, and prove the sealed key really is the key of the address it names.
async function readBackup(env) {
  const raw = env.AQ_WALLET_BACKUP;
  if (!raw) return { error: "There is no second copy of the wallet key on the server" };
  let j; try { j = JSON.parse(raw); } catch { return { error: "The second copy is not readable" }; }
  if (!j || typeof j.address !== "string" || typeof j.sealed !== "string" || unbase58(j.address).length !== 32) return { error: "The second copy is not a wallet" };
  if (!(await proves(env, j.sealed, j.address))) return { error: "The second copy does not open to the key of the address it names. Nothing was restored" };
  return { row: { address: j.address, sealed: j.sealed, createdAt: j.createdAt || null } };
}
// Only when the wallet row is missing. One statement: a row that is there is never replaced. Never returns key material.
export async function restoreWallet(env) {
  const d = db(env), have = await get(d, "sol_wallet_key");
  if (have?.address) return { error: "The wallet is there. Nothing to restore", exists: true };
  const b = await readBackup(env);
  if (b.error) return b;
  const won = await d.one(`INSERT INTO mob_aq_state (k, v, at) VALUES ('sol_wallet_key', $1, now()) ON CONFLICT (k) DO NOTHING RETURNING k`, [JSON.stringify({ ...b.row, restoredAt: new Date().toISOString() })]);
  if (!won) return { error: "The wallet is there. Nothing to restore", exists: true };
  await brain(d, `Aquarius wallet key restored from the second copy: ${b.row.address}.`);
  return { restored: true, address: b.row.address };
}
// For the panel: is there a second copy, and does it match the wallet in use? Checked by the 5-minute timer, never shown.
export async function backupCheck(env) {
  const d = db(env), w = await get(d, "sol_wallet_key"), prev = await get(d, "sol_wallet_backup");
  if (prev && prev.address === (w?.address || null) && Date.now() - new Date(prev.at).getTime() < 6 * 3600000 && prev.present === !!env.AQ_WALLET_BACKUP) return prev;
  const b = env.AQ_WALLET_BACKUP ? await readBackup(env).catch(() => ({ error: "The second copy is not readable" })) : null;
  const out = { at: new Date().toISOString(), address: w?.address || null, present: !!env.AQ_WALLET_BACKUP, ok: !!b?.row && (!w?.address || b.row.address === w.address), note: !b ? "no second copy on the server" : b.error ? b.error : w?.address && b.row.address !== w.address ? "the second copy is of a different wallet" : "second copy checked" };
  await set(d, "sol_wallet_backup", out);
  return out;
}
