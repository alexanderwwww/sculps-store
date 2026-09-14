/**
 * "Download all" for a batch: every finished file of the batch, zipped in
 * the Worker (store-only, nothing to compress in PNGs and MP4s) and handed
 * to the browser. Posting to Instagram is v2 — it needs a Meta Business
 * account and the Content Publishing API (TODO) — so for now the owner
 * downloads and posts by hand.
 */
import { and, eq, sql } from "drizzle-orm";
import { zipSync } from "fflate";
import type { Route } from "./+types/admin.studio.batch";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { generations } from "~/db/schema";

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  const batchId = url.searchParams.get("batch") ?? "";
  if (!store || !batchId) throw new Response("Not found", { status: 404 });

  const rows = await context.db
    .select()
    .from(generations)
    .where(and(eq(generations.storeId, store.id), sql`${generations.params}->>'batchId' = ${batchId}`));
  const files: Record<string, Uint8Array> = {};
  let n = 0;
  for (const row of rows) {
    for (const key of [...(row.stillKey ? [row.stillKey] : []), ...row.outputKeys]) {
      const object = await context.cloudflare.env.MEDIA.get(key);
      if (!object) continue;
      n++;
      const label = String(row.params.label ?? row.prompt).slice(0, 40).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "clip";
      files[`${String(n).padStart(2, "0")}-${label}-${key}`] = new Uint8Array(await object.arrayBuffer());
    }
  }
  if (!n) throw new Response("Nothing finished in this batch yet.", { status: 404 });
  const zipped = zipSync(files, { level: 0 });
  return new Response(zipped, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="batch-${batchId.slice(0, 8)}.zip"`,
    },
  });
}
