/**
 * What makes the phone page installable.
 *
 * A route with no component: React Router hands back exactly this Response,
 * which a route that also renders a page cannot do — a document request there
 * renders the document, manifest or not.
 */
import type { Route } from "./+types/m.manifest";

export function loader(_: Route.LoaderArgs) {
  return new Response(
    JSON.stringify({
      name: "Shop Admin",
      short_name: "Shop",
      start_url: "/m",
      scope: "/m",
      display: "standalone",
      background_color: "#0b0b0f",
      theme_color: "#0b0b0f",
      icons: [
        { src: "/m/icon-180.png", sizes: "180x180", type: "image/png" },
        { src: "/m/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    }),
    { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } },
  );
}
