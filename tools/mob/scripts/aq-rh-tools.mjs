// Prints Robinhood's own tool list as the Aquarius server stored it after Alex connected (state row rh_cache):
// every tool's name, description, input schema and annotations. The stock order call is built from THIS, never from a guess.
// Run from tools/mob with DATABASE_URL set:  node scripts/aq-rh-tools.mjs [--json]
import { neon } from "@neondatabase/serverless";
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set"); process.exit(1); }
const row = (await neon(process.env.DATABASE_URL).query(`SELECT v, at FROM mob_aq_state WHERE k = 'rh_cache'`))[0];
if (!row?.v?.tools?.length) { console.log("No tool list stored yet: Robinhood is not connected, or the first read has not run (it runs within 5 minutes of connecting)."); process.exit(0); }
if (process.argv.includes("--json")) { console.log(JSON.stringify(row.v.tools, null, 2)); process.exit(0); }
console.log(`Robinhood tools, read ${new Date(row.v.at).toLocaleString("en-GB", { timeZone: "Europe/Athens" })} Athens time (${row.v.tools.length}):\n`);
for (const t of row.v.tools) {
  console.log(`== ${t.name}${t.read ? "   [on the Aquarius read list]" : ""}`);
  console.log(`   ${t.fullDescription || t.description || "(no description)"}`);
  console.log(`   annotations: ${JSON.stringify(t.annotations ?? { readOnlyHint: t.readOnlyHint, destructiveHint: t.destructiveHint })}`);
  console.log(`   input: ${JSON.stringify(t.inputSchema ?? { required: t.required })}\n`);
}
