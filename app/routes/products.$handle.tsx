/**
 * Old Shopify product links.
 *
 * A store that moves off Shopify keeps its old URLs alive in Google's index,
 * in every ad, in every message a customer ever sent a friend. Shopify's
 * shape is /products/<handle>; ours sells from the root, because these are
 * one-product stores. So this is a permanent redirect, which is also what
 * tells Google the page moved rather than vanished.
 *
 * The handle is not checked against the product on purpose: any old link,
 * right handle or wrong, is better sent to the shop than to a dead end.
 */
import type { Route } from "./+types/products.$handle";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  // Everything after the ? comes along: fbclid, utm_*, ?store=. An ad click
  // that lands here and loses its parameters is a sale nobody can attribute.
  const to = `/${url.search}`;
  return new Response(null, { status: 301, headers: { Location: to } });
}
