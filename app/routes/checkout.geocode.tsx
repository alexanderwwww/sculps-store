import type { Route } from "./+types/checkout.geocode";
import { geocodeAddress } from "~/lib/geocode.server";

/**
 * GET /checkout/geocode?q=<address> → { lat, lon, label } | null
 *
 * The checkout page asks this as the address is typed, to put the pin on the
 * map card. It answers from the edge cache for anything seen before.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const point = await geocodeAddress(q);
  return Response.json(point, { headers: { "cache-control": "private, max-age=600" } });
}
