import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type DB = ReturnType<typeof makeDb>;

/**
 * One client per request. Workers have no long-lived process, so the Neon
 * HTTP driver is the right shape here — no pool to keep warm, no sockets to
 * leak between requests.
 */
export function makeDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema });
}

export { schema };
