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
import { metaConfig, products, variants } from "~/db/schema";
import { and, eq } from "drizzle-orm";
import {
  readCartToken,
  newCartToken,
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
    .select({ id: variants.id, available: variants.available })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(variants.id, variantId), eq(products.storeId, store.id), eq(products.status, "active")))
    .limit(1);
  if (!sellable || sellable.available <= 0) {
    back.searchParams.set("unavailable", "1");
    return new Response(null, { status: 302, headers: { Location: back.toString() } });
  }

  const token = readCartToken(request) ?? newCartToken();
  // "Buy now" means this bundle and nothing else: the wallet sheet on the
  // product page shows one price, and the cart it pays for must be that.
  const replace = url.searchParams.get("replace") === "1";
  const lines = replace ? [] : await currentLines(context.db, store.id, token);
  await saveCart(context.db, store.id, token, addLine(lines, variantId, 1));

  const sessionId = readVisitorSession(request);
  if (sessionId) {
    track(context.db, context.cloudflare.ctx, {
      storeId: store.id,
      sessionId,
      type: "cart",
      path: "/cart/add",
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
      const { fbp, fbc } = readMetaCookies(request);
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
