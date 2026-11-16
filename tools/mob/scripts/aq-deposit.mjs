// A recorded CEO deposit into the Aquarius PAPER wallet, plus the position size. Idempotent: the deposit id can be applied once.
//   DATABASE_URL=... node tools/mob/scripts/aq-deposit.mjs <id> <walletTargetSol> <positionSol> [--apply]
// Example (Alex, 2026-11-16 "10 sol paper first, bigger"): aq-deposit.mjs ceo-2026-11-16-10sol 10 2.6 --apply
// The deposit is the difference between the target and the wallet base today. Cash and the base rise together in one
// statement, so equity steps up and P&L does not move. Dry run without --apply.
import { db } from "../src/db.mjs";
import { reconcile, deposit } from "../src/aq/ledger.mjs";

export async function ceoDeposit(d, { id, target, positionSol, apply = false, log = console.log }) {
  const before = await reconcile(d), add = Math.round((target - before.baseSol) * 1e9) / 1e9;
  log(`BEFORE  wallet base ${before.baseSol} SOL, cash ${before.cashSol}, reconciles ${before.ok}`);
  log(`PLAN    deposit ${add} SOL (id ${id}) -> wallet base ${target} SOL; position size ${positionSol} SOL`);
  if (!apply) { log("DRY RUN: nothing was changed. Run again with --apply."); return { applied: false, before, add }; }
  let res = { applied: false };
  if (add > 0) res = await deposit(d, { id, sol: add, note: `CEO deposit: paper wallet to ${target} SOL` });
  await d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('position_sol', $1, now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [JSON.stringify(positionSol)]);
  const after = await reconcile(d);
  log(`AFTER   wallet base ${after.baseSol} SOL, cash ${after.cashSol}, reconciles ${after.ok}${res.applied ? "" : "  (deposit already applied or not needed: not repeated)"}`);
  if (res.applied) await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('risk','tournament',$1,$2)`, [
    `PARAMETER CHANGE BY THE CEO (Alex, 2026-11-16: "10 sol paper first, bigger"), not a learned result: a DEPOSIT of ${add} SOL takes the paper wallet base from ${before.baseSol} to ${after.baseSol} SOL (equity steps up, profit and loss do not move; health is measured against the new base). Every paper position is now ${positionSol} SOL (was a 0.05 SOL cap), EXPLORE-WEAK half, 3 open at most, cut only by a survival stage, by cash, or to stay under 1% of a pool's liquidity; round trips are quoted at that real size.`,
    JSON.stringify({ id, add, before, after, positionSol })]);
  return { applied: res.applied, before, after, add };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [id, target, pos] = process.argv.slice(2);
  if (!process.env.DATABASE_URL || !id || !(Number(target) > 0) || !(Number(pos) > 0)) { console.error("usage: DATABASE_URL=... aq-deposit.mjs <id> <walletTargetSol> <positionSol> [--apply]"); process.exit(1); }
  const r = await ceoDeposit(db({ DATABASE_URL: process.env.DATABASE_URL, MOB_SCHEMA: process.env.MOB_SCHEMA }), { id, target: Number(target), positionSol: Number(pos), apply: process.argv.includes("--apply") });
  process.exit(r.after && !r.after.ok ? 2 : 0);
}
