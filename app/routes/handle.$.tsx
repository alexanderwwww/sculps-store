/**
 * A bare product handle, sent to the product.
 *
 * Ads, link-in-bios and pasted links get typed as `/black-reaper` about as
 * often as `/products/black-reaper`, and every one of those was a 404 on a
 * click somebody had already paid for. If the first path segment names a
 * live product here, this moves it permanently to the real address, query
 * string and all. Anything else is still a 404, because pretending a page
 * exists is worse than saying it does not.
 */
import { eq, and } from "drizzle-orm";
import type { Route } from "./+types/handle.$";
import { resolveStore } from "~/lib/store.server";
import { products } from "~/db/schema";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const handle = (params["*"] ?? "").split("/")[0]?.trim().toLowerCase() ?? "";
  if (!handle) throw new Response("Not found", { status: 404 });

  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("Not found", { status: 404 });

  const [hit] = await context.db
    .select({ handle: products.handle })
    .from(products)
    .where(
      and(
        eq(products.storeId, store.id),
        eq(products.handle, handle),
        eq(products.status, "active"),
      ),
    )
    .limit(1);
  if (!hit) throw new Response("Not found", { status: 404 });

  return new Response(null, {
    status: 301,
    headers: { Location: `/products/${hit.handle}${url.search}` },
  });
}
