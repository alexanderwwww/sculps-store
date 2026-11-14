// Neon over HTTP (@neondatabase/serverless, same driver as Kerberos). Each sql.query() is its own
// transaction, which is what the atomic claim (UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING) needs.
import { neon } from "@neondatabase/serverless";
import { SCHEMA } from "./schema.mjs";

const TABLES = /\bmob_(accounts|clips|posts|campaigns|submissions|oauth_state|login_fail|posts_due|login_fail_ip)\b/g;

export function db(env) {
  if (env.__db) return env.__db;
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const sql = neon(env.DATABASE_URL);
  // MOB_SCHEMA is only for tests (a throwaway schema); production uses public.
  const schema = env.MOB_SCHEMA && /^[a-z0-9_]+$/.test(env.MOB_SCHEMA) ? env.MOB_SCHEMA : null;
  const fix = (text) => (schema ? text.replace(TABLES, (m) => (m === "mob_posts_due" || m === "mob_login_fail_ip" ? m : `${schema}.${m}`)) : text);
  const q = (text, params = []) => sql.query(fix(text), params);
  const one = async (text, params) => (await q(text, params))[0] || null;
  env.__db = { q, one, schema };
  return env.__db;
}

export async function migrate(env) {
  const d = db(env);
  if (d.schema) await d.q(`CREATE SCHEMA IF NOT EXISTS ${d.schema}`);
  for (const stmt of SCHEMA.split(/;\s*\n/)) if (stmt.trim()) await d.q(stmt);
  return true;
}
