/**
 * Old Shopify collection links — /collections/all and friends.
 *
 * Same reasoning as the product redirect: there is one product, so every
 * collection is the shop. A permanent redirect keeps the link equity and
 * keeps a customer moving.
 */
import type { Route } from "./+types/collections.$handle";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = url.searchParams.get("store");
  const to = store ? `/?store=${encodeURIComponent(store)}` : "/";
  return new Response(null, { status: 301, headers: { Location: to } });
}
