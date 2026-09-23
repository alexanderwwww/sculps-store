/**
 * The phone page's manifest: the admin's own name and the admin's own icons,
 * with one difference — it opens on /m rather than the full admin, because
 * that is what he installed.
 *
 * A route with no component, so React Router hands back exactly this.
 */
import type { Route } from "./+types/m.manifest";

export function loader(_: Route.LoaderArgs) {
  return new Response(
    JSON.stringify({
      name: "Shop Admin",
      short_name: "Shop Admin",
      description: "Live traffic and today's sales.",
      start_url: "/m",
      scope: "/",
      display: "standalone",
      background_color: "#0b0b0d",
      theme_color: "#0b0b0d",
      icons: [
        { src: "/icon-512-v2.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/apple-touch-icon-v2.png", sizes: "180x180", type: "image/png" },
      ],
    }),
    { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } },
  );
}
