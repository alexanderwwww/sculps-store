/**
 * Where the storefront's Web Vitals land.
 *
 * Accepts only the three metrics the Online Store screen reports, only from a
 * session this store already knows about, and never more than one report per
 * page view — anything else is somebody writing rows into another store's
 * numbers.
 */
import type { Route } from "./+types/vitals";
import { resolveStore } from "~/lib/store.server";
import { webVitals } from "~/db/schema";
import { deviceFromRequest, readVisitorSession, shouldTrack } from "~/lib/visitor.server";

const ALLOWED = new Set(["LCP", "INP", "CLS"]);
/** A metric worse than this is a broken clock, not a slow page. */
const CEILING = 120_000;

export async function action({ request, context }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) return new Response(null, { status: 204 });

  const sessionId = readVisitorSession(request);
  if (!sessionId || !shouldTrack(request, url)) return new Response(null, { status: 204 });

  let payload: { path?: unknown; metrics?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return new Response(null, { status: 204 });
  }

  const metrics = Array.isArray(payload.metrics) ? payload.metrics.slice(0, 3) : [];
  const rows = metrics
    .filter(
      (m): m is { metric: string; value: number } =>
        !!m &&
        typeof (m as any).metric === "string" &&
        ALLOWED.has((m as any).metric) &&
        Number.isFinite((m as any).value) &&
        (m as any).value >= 0 &&
        (m as any).value <= CEILING,
    )
    .map((m) => ({
      storeId: store.id,
      sessionId,
      metric: m.metric,
      value: Math.round(m.value),
      path: typeof payload.path === "string" ? payload.path.slice(0, 200) : null,
      device: deviceFromRequest(request),
    }));

  if (rows.length) {
    context.cloudflare.ctx.waitUntil(
      context.db.insert(webVitals).values(rows).then(() => undefined, () => undefined),
    );
  }
  return new Response(null, { status: 204 });
}
