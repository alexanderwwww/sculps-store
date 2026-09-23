/**
 * The numbers, on their own, for the page's ten-second refresh.
 *
 * Its own route so the phone re-fetches a few hundred bytes of JSON rather
 * than a document, which on mobile data is the whole difference.
 */
import type { Route } from "./+types/m.data";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, liveBoard } from "~/lib/admin.server";
import { phoneNumbers } from "~/lib/phone-board.server";

export async function loader({ context, request }: Route.LoaderArgs) {
  const user = await requireUser(context.db, request).catch(() => null);
  if (!user) return new Response(JSON.stringify({ signedOut: true }), { status: 401, headers: { "content-type": "application/json" } });
  const url = new URL(request.url);
  const { store, all } = await resolveAdminStore(context.db, url);
  if (!store) return Response.json({ store: null, stores: [], numbers: null, at: Date.now() });
  const board = await liveBoard(context.db, store.id, store.timezone);
  return Response.json({
    store: { slug: store.slug, name: store.name, currency: store.currency },
    stores: all.map((s) => ({ slug: s.slug, name: s.name })),
    numbers: phoneNumbers(board, store.currency),
    at: Date.now(),
  });
}
