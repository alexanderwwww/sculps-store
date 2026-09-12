/**
 * The storefront's heartbeat.
 *
 * A browser posts here once on arrival and then every twenty seconds while
 * the tab is visible. Two things come of it, and neither can be faked by
 * something that does not run JavaScript:
 *
 *   1. The visit is confirmed human, so the traffic numbers count people
 *      rather than the scanners that hit a public domain all night.
 *   2. A presence row is kept warm, which is what the globe draws. When the
 *      tab closes the beating stops and the dot goes out by itself.
 *
 * It answers 204 and never blocks: a failed heartbeat costs a dot, nothing
 * more, and is not worth an error on a customer's screen.
 */
import { and, eq, lt } from "drizzle-orm";
import type { Route } from "./+types/seen";
import { events, presence } from "~/db/schema";
import { resolveStore } from "~/lib/store.server";
import {
  deviceFromRequest,
  geoFromContext,
  humanCookie,
  readVisitorHuman,
  readVisitorSession,
} from "~/lib/visitor.server";

const NO_CONTENT = { status: 204 } as const;

/** Where the visitor is, for the dot's colour. */
function stageOf(path: string): "view" | "cart" | "checkout" {
  if (path.startsWith("/checkout")) return "checkout";
  if (path.startsWith("/cart")) return "cart";
  return "view";
}

export async function action({ context, request }: Route.ActionArgs) {
  const url = new URL(request.url);
  const sessionId = readVisitorSession(request);
  if (!sessionId) return new Response(null, NO_CONTENT);

  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) return new Response(null, NO_CONTENT);

  let path = "/";
  try {
    const body = (await request.json()) as { path?: unknown };
    if (typeof body?.path === "string" && body.path.startsWith("/")) path = body.path.slice(0, 256);
  } catch {
    /* a beacon with no body still counts as presence */
  }

  const geo = geoFromContext(context, request);
  const now = new Date();
  const row = {
    sessionId,
    storeId: store.id,
    stage: stageOf(path),
    path,
    city: geo.city,
    region: geo.region,
    country: geo.country,
    lat: geo.lat,
    lon: geo.lon,
    device: deviceFromRequest(request),
    lastSeen: now,
  };

  const work = (async () => {
    await context.db
      .insert(presence)
      .values(row)
      .onConflictDoUpdate({
        target: presence.sessionId,
        set: {
          storeId: row.storeId,
          stage: row.stage,
          path: row.path,
          city: row.city,
          region: row.region,
          country: row.country,
          lat: row.lat,
          lon: row.lon,
          device: row.device,
          lastSeen: now,
        },
      });

    // The first beat of a session vouches for the rows already written for
    // it. After that the cookie says so on the way in and there is nothing
    // to update.
    if (!readVisitorHuman(request)) {
      await context.db
        .update(events)
        .set({ human: true })
        .where(and(eq(events.sessionId, sessionId), eq(events.human, false)));
    }

    // Anyone who stopped beating five minutes ago is gone. Cleaning here
    // keeps the table the size of the crowd instead of the size of history,
    // with no cron to own.
    await context.db
      .delete(presence)
      .where(lt(presence.lastSeen, new Date(Date.now() - 5 * 60_000)));
  })();

  context.cloudflare.ctx.waitUntil(work.catch(() => undefined));

  return new Response(null, {
    ...NO_CONTENT,
    headers: readVisitorHuman(request) ? undefined : { "Set-Cookie": humanCookie(url) },
  });
}

/** Nothing to GET. */
export async function loader() {
  return new Response(null, { status: 405 });
}
