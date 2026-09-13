/**
 * Polled by the Studio while anything is still generating. Asks Higgsfield,
 * keeps finished files, and answers with the rows that changed.
 */
import type { Route } from "./+types/admin.studio.status";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { refreshPending, listGenerations } from "~/lib/studio.server";

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { rows: [], pending: 0 };
  try {
    await refreshPending(context.db, context.cloudflare.env, store.id);
  } catch {
    // A network blip: the next poll tries again. The rows below still answer.
  }
  const rows = await listGenerations(context.db, store.id);
  return { rows, pending: rows.filter((r) => r.status === "queued" || r.status === "in_progress").length };
}
