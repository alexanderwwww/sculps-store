/**
 * Add to cart.
 *
 * Accepts both the POST from the buy box and the GET links further down the
 * page, because the storefront uses both.
 */
import type { Route } from "./+types/cart.add";
import { resolveStore } from "~/lib/store.server";
import { geoFromRequest, readVisitorSession, track } from "~/lib/visitor.server";
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

  if (!variantId) {
    return new Response(null, { status: 302, headers: { Location: back.toString() } });
  }

  const token = readCartToken(request) ?? newCartToken();
  const lines = await currentLines(context.db, store.id, token);
  await saveCart(context.db, store.id, token, addLine(lines, variantId, 1));

  const sessionId = readVisitorSession(request);
  if (sessionId) {
    track(context.db, context.cloudflare.ctx, {
      storeId: store.id,
      sessionId,
      type: "cart",
      path: "/cart/add",
      geo: geoFromRequest(request),
    });
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
