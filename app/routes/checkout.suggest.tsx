import type { Route } from "./+types/checkout.suggest";
import { suggestAddress } from "~/lib/suggest.server";

/**
 * GET /checkout/suggest?q=<street so far>&country=US → AddressSuggestion[]
 *
 * The address box asks this as it is typed and offers the answers underneath.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const list = await suggestAddress(url.searchParams.get("q") ?? "", url.searchParams.get("country") ?? "US");
  return Response.json(list, { headers: { "cache-control": "private, max-age=600" } });
}
