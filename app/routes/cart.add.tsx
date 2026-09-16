/**
 * Add to cart.
 *
 * Accepts both the POST from the buy box and the GET links further down the
 * page, because the storefront uses both.
 */
import type { Route } from "./+types/cart.add";
import { resolveStore } from "~/lib/store.server";
import { deviceFromRequest, geoFromContext, readVisitorSession, track } from "~/lib/visitor.server";
import { metaSettings, newMetaEventId, readMetaCookies, sendEvent } from "~/lib/meta.server";
import { metaConfig, products, variants, carts } from "~/db/schema";
import { and, eq } from "drizzle-orm";
import { BUNDLE_OFF_CENTS } from "~/lib/money";
import {
  readCartToken,
  cartTokenForStore,
  cartCookie,
  currentLines,
  addLine,
  saveCart,
} from "~/lib/cart.server";

async function add(request: Request, context: Route.LoaderArgs["context"], variantId: string) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });

  const back = new URL("/cart", url.origin);
  if (url.searchParams.get("store")) back.searchParams.set("store", url.searchParams.get("store")!);
  // "Buy now" skips the cart: the line goes in and the customer lands on the
  // checkout, where Apple Pay is the first thing on the screen.
  const wantsCheckout = url.searchParams.get("next") === "checkout";
  if (wantsCheckout) back.pathname = "/checkout";

  if (!variantId) {
    return new Response(null, { status: 302, headers: { Location: back.toString() } });
  }

  // Only a real variant of one of this store's live products, with stock,
  // goes in the cart. Anything else used to be written and then silently
  // dropped at pricing time, which left the drawer saying "empty" with no
  // explanation.
  const [sellable] = await context.db
    .select({ id: variants.id, available: variants.available, priceCents: variants.priceCents })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(variants.id, variantId), eq(products.storeId, store.id), eq(products.status, "active")))
    .limit(1);
  if (!sellable || sellable.available <= 0) {
    back.searchParams.set("unavailable", "1");
    return new Response(null, { status: 302, headers: { Location: back.toString() } });
  }

  // Not simply the cookie's token: it may belong to another store on this
  // same domain, and that collides on insert. See cartTokenForStore.
  const token = await cartTokenForStore(context.db, store.id, readCartToken(request));
  /**
   * `replace` and `bundle` are honoured on a POST and never on a GET.
   *
   * Both used to be read straight from the query string on either method, and
   * the cart cookie is SameSite=Lax, which a browser still sends on a
   * top-level link. So a link in an email or a comment was enough to do two
   * things to a stranger's cart:
   *
   *   /cart/add?variant=…&replace=1  threw away everything they had chosen
   *   /cart/add?variant=…&bundle=1   took the bundle discount off any variant
   *                                  in the shop, on demand, repeatedly
   *
   * Nothing in the shop links to either with a GET — the drawers and the buy
   * box post. Ignoring them on GET costs nothing and closes both.
   */
  const trusted = request.method.toUpperCase() === "POST";
  const replace = trusted && url.searchParams.get("replace") === "1";
  const lines = replace ? [] : await currentLines(context.db, store.id, token);
  const bundlePriceCents =
    trusted && url.searchParams.get("bundle") === "1"
      ? Math.max(0, sellable.priceCents - BUNDLE_OFF_CENTS)
      : undefined;
  await saveCart(context.db, store.id, token, addLine(lines, variantId, 1, bundlePriceCents));

  const sessionId = readVisitorSession(request);
  if (sessionId) {
    // The cart remembers which visitor it belongs to, so the behaviour page
    // can say who put what in a bag. The event path carries the variant.
    context.cloudflare.ctx.waitUntil(
      context.db.update(carts).set({ sessionId }).where(and(eq(carts.storeId, store.id), eq(carts.token, token))).catch(() => undefined),
    );
    track(context.db, context.cloudflare.ctx, {
      storeId: store.id,
      sessionId,
      type: "cart",
      path: `/cart/add/${variantId}`,
      geo: geoFromContext(context, request),
      device: deviceFromRequest(request),
      request,
    });
  }

  // AddToCart. The server half goes out now; the id travels on the redirect so
  // the cart page can fire the browser half with the same id and Meta merges
  // the two into one event.
  const [pixel] = await context.db
    .select({ pixelId: metaConfig.pixelId })
    .from(metaConfig)
    .where(eq(metaConfig.storeId, store.id))
    .limit(1);
  if (pixel?.pixelId) {
    const [variant] = await context.db.select().from(variants).where(eq(variants.id, variantId)).limit(1);
    if (variant) {
      const eventId = newMetaEventId();
      const { fbp, fbc } = readMetaCookies(request, url);
      context.cloudflare.ctx.waitUntil(
        (async () => {
          const settings = await metaSettings(context.db, context.cloudflare.env, store.id);
          if (!settings) return;
          await sendEvent(settings, "AddToCart", {
            eventId,
            eventTime: Math.floor(Date.now() / 1000),
            sourceUrl: url.toString(),
            valueCents: variant.priceCents,
            currency: store.currency,
            contents: [{ id: variant.id, quantity: 1, itemPrice: variant.priceCents }],
            externalId: sessionId,
            clientIp: request.headers.get("CF-Connecting-IP"),
            userAgent: request.headers.get("User-Agent"),
            fbp,
            fbc,
          });
        })(),
      );
      back.searchParams.set("fbe", eventId);
      back.searchParams.set("fbv", variant.id);
    }
  }

  return new Response(null, {
    status: 302,
    headers: { Location: back.toString(), "Set-Cookie": cartCookie(token, url) },
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  return add(request, context, String(form.get("variantId") || ""));
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return add(request, context, url.searchParams.get("variant") || "");
}
