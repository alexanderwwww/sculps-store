/** The home-screen icon, at the two sizes iOS and Android ask for. */
import type { Route } from "./+types/m.icon.$";

export async function loader({ request, context }: Route.LoaderArgs) {
  const path = new URL(request.url).pathname;
  const key = path.endsWith("180.png") ? "sa-icon-180.png" : path.endsWith("512.png") ? "sa-icon-512.png" : null;
  if (!key) return new Response("no", { status: 404 });
  const obj = await context.cloudflare.env.MEDIA.get(key);
  if (!obj) return new Response("no", { status: 404 });
  return new Response(obj.body, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
  });
}
