/**
 * The event ladder's one endpoint.
 *
 * The storefront reports what the visitor actually did — touched a bundle,
 * opened a photo, expanded an answer, started a video, started typing a card.
 * This route decides whether that act is worth an event, and it is the server
 * that decides, not the page:
 *
 *   - "once per session" is kept in a first-party cookie the browser cannot
 *     usefully forge, not in the tab's memory;
 *   - the Considered gate is read from the `visits` row that the /seen
 *     heartbeat writes, so the seconds and the scroll depth are the ones this
 *     Worker recorded rather than numbers a script handed us;
 *   - the value on the event is the price in our own variants table, never a
 *     price posted from the page.
 *
 * It answers with the event name and the id the server half used. The browser
 * then fires the same custom event with the same id, which is the same
 * deduplication PageView and ViewContent already rely on. There is no second
 * mechanism.
 *
 * A store with no pixel gets `{ fire: false }` and nothing else happens.
 */
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/rung";
import { metaConfig, products, variants } from "~/db/schema";
import { resolveStore } from "~/lib/store.server";
import { readVisitorSession, shouldTrack } from "~/lib/visitor.server";
import { visits } from "~/db/schema";
import { metaCustomData, pixelVerb, trackFunnelEvent } from "~/lib/meta.server";
import { decideRung, isLadderRung, parseRungCookie, rungCookie } from "~/lib/meta.signals";
import { priceCart, readCartToken } from "~/lib/cart.server";

interface VariantPick {
  id: string;
  priceCents: number;
  isDefault: boolean;
  position: number;
}

const NO = (reason: string) => Response.json({ fire: false, reason });

export async function action({ request, context }: Route.ActionArgs) {
  const url = new URL(request.url);

  let body: { rung?: unknown; variantId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NO("no body");
  }
  const rung = body?.rung;
  if (!isLadderRung(rung)) return NO("unknown rung");

  const sessionId = readVisitorSession(request);
  if (!sessionId) return NO("no session");
  if (!shouldTrack(request, url)) return NO("not tracked");

  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) return NO("no store");

  // Per-store, and only when that store has Meta set up. A store without a
  // pixel behaves exactly as it did before this route existed.
  const [meta] = await context.db
    .select({ pixelId: metaConfig.pixelId })
    .from(metaConfig)
    .where(eq(metaConfig.storeId, store.id))
    .limit(1);
  if (!meta?.pixelId) return NO("no pixel");

  const already = parseRungCookie(request.headers.get("Cookie"));

  // The attention numbers, as this Worker recorded them.
  const [visit] = await context.db
    .select({ seconds: visits.seconds, scrollMax: visits.scrollMax })
    .from(visits)
    .where(and(eq(visits.storeId, store.id), eq(visits.sessionId, sessionId)))
    .limit(1);

  const decision = decideRung({
    rung,
    already,
    seconds: visit?.seconds ?? 0,
    scrollMax: visit?.scrollMax ?? 0,
  });
  if (!decision.send) return NO(decision.reason);

  /*
   * What the rung is worth.
   *
   * Engaged and Considered are worth the bundle the visitor was looking at —
   * priced from our own table, by id, and only if that variant belongs to this
   * store's product. Anything unrecognised falls back to the default bundle
   * rather than to zero, because an event with no value is an event Meta's
   * value optimisation cannot use.
   *
   * HotLead and CardStarted are worth the cart, which is a real basket.
   */
  const currency = store.currency;
  let contents: { id: string; quantity: number; itemPrice: number }[] = [];
  let valueCents = 0;

  if (rung === "HotLead" || rung === "CardStarted") {
    const cart = await priceCart(context.db, store, readCartToken(request));
    contents = cart.lines.map((line) => ({
      id: line.variantId,
      quantity: line.quantity,
      itemPrice: line.unitPriceCents,
    }));
    valueCents = cart.totalCents;
  }

  if (!contents.length) {
    const wanted = typeof body.variantId === "string" ? body.variantId : null;
    const rows = await context.db
      .select({
        id: variants.id,
        priceCents: variants.priceCents,
        isDefault: variants.isDefault,
        position: variants.position,
      })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(eq(products.storeId, store.id)) as VariantPick[];
    const chosen =
      (wanted ? rows.find((row: VariantPick) => row.id === wanted) : undefined) ??
      rows.find((row: VariantPick) => row.isDefault) ??
      [...rows].sort((a, b) => a.position - b.position)[0];
    if (chosen) {
      contents = [{ id: chosen.id, quantity: 1, itemPrice: chosen.priceCents }];
      valueCents = chosen.priceCents;
    }
  }

  // The server half. Same function every other funnel event uses, so the
  // dedup key, the hashing and the bot filter are all the existing ones.
  const eventId = crypto.randomUUID();
  await trackFunnelEvent(context.db, context.cloudflare.env, context.cloudflare.ctx, {
    storeId: store.id,
    pixelId: meta.pixelId,
    request,
    url,
    name: rung,
    valueCents,
    currency,
    contents,
    identity: { externalId: sessionId },
    eventId,
  });

  already.add(rung);
  return Response.json(
    {
      fire: true,
      verb: pixelVerb(rung),
      name: rung,
      eventId,
      data: metaCustomData({ valueCents, currency, contents }),
    },
    { headers: { "Set-Cookie": rungCookie(already, url.protocol === "https:") } },
  );
}

/** Nothing to GET. */
export function loader() {
  return new Response(null, { status: 405 });
}
