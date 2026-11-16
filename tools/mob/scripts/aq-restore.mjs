// Put a daily Aquarius brain backup (R2 key aq-backup/<date>.json.gz) back into the database. DRY RUN unless --apply.
//   DATABASE_URL=... node tools/mob/scripts/aq-restore.mjs <file.json.gz> [--apply]
// Get the file from GET /api/aq/backup/<date> (admin session or bearer MOB_API_TOKEN), or from the R2 bucket.
// Only rows that are missing are added. Nothing is overwritten or deleted. The ledger tables (open positions, flows, wallet
// state) are restored only into an empty book, and then the cash is checked against the trades.
import { readFileSync } from "node:fs";
import { db } from "../src/db.mjs";
import { restore, gunzip } from "../src/aq/keeper.mjs";
import { reconcile } from "../src/aq/ledger.mjs";

export async function restoreFile(d, bytes, { apply = false, log = console.log } = {}) {
  const data = JSON.parse(await gunzip(bytes));
  log(`BACKUP  ${data.day} (written ${data.at}), ${Object.keys(data.tables).length} tables`);
  const r = await restore(d, data, { apply });
  for (const [t, x] of Object.entries(r.tables)) log(x.skipped ? `  ${t}: ${x.inBackup} in the backup, SKIPPED (${x.skipped})` : `  ${t}: ${x.inBackup} in the backup, ${x.alreadyThere} already there, ${x.missing} missing${apply ? `, ${x.added} added` : ""}`);
  if (!apply) log("DRY RUN: nothing was changed. Run again with --apply.");
  else { const rc = await reconcile(d); log(`LEDGER  cash ${rc.cashSol} SOL, expected ${rc.expectedSol}: ${rc.ok ? "reconciles" : "DOES NOT RECONCILE, look before trading"}`); r.ledger = rc; }
  return r;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error("usage: aq-restore.mjs <file.json.gz> [--apply]"); process.exit(1); }
  await restoreFile(db({ DATABASE_URL: process.env.DATABASE_URL }), readFileSync(file), { apply: process.argv.includes("--apply") });
}
