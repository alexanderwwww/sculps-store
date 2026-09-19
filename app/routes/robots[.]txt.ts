/**
 * What a crawler is allowed to walk, and where the map is.
 *
 * Until now this address fell through to the host's default, which said
 * nothing about this shop: no sitemap, and no word on the pages that should
 * never be indexed. A cart URL or a checkout in a search result is a dead
 * link for whoever clicks it and a wasted crawl for the engine.
 */
import type { Route } from "./+types/robots[.]txt";
import { resolveStore } from "~/lib/store.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);

  const lines = [
    "User-agent: *",
    "Allow: /",
    // Nothing here is a page anybody should land on from a search result.
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /admin",
    "Disallow: /wand",
    "",
  ];
  if (store?.domain) lines.push(`Sitemap: https://${store.domain}/sitemap.xml`, "");

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
