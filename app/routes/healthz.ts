import { sql } from "drizzle-orm";
import type { Route } from "./+types/healthz";

/** Cheap check that the Worker is up and the database answers. */
export async function loader({ context }: Route.LoaderArgs) {
  const started = Date.now();
  try {
    await context.db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "up", ms: Date.now() - started });
  } catch (error) {
    return Response.json(
      { ok: false, db: "down", error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
