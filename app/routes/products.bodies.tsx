/**
 * /products/:handle for the bodies store — one page per colourway.
 *
 * The shop sells one board in four colours, so each colour gets its own
 * address rather than living only inside a picker. Same chrome, same pixel,
 * same visit tracking as every other page.
 *
 * Any other store keeps the old behaviour: its /products/* links are Shopify
 * history and redirect to the root.
 */
import type { Route } from "./+types/products.bodies";
import { eq } from "drizzle-orm";
import { resolveStore, loadProductPage } from "~/lib/store.server";
import { metaConfig } from "~/db/schema";
import { providerForStore } from "~/lib/payments.server";
import { paypalFor } from "~/lib/paypal.server";
import { pixelScript } from "~/lib/meta.server";
import { presenceScript, vitalsScript } from "~/lib/vitals";
import { liveReloadScript } from "~/lib/live-reload";
import { currentUser } from "~/lib/auth.server";
import { withSamples } from "~/storefronts/bodies/samples.server";
import {
  deviceFromRequest,
  geoFromContext,
  readVisitorSession,
  newVisitorSession,
  visitorCookie,
  shouldTrack,
  track,
  attribution,
} from "~/lib/visitor.server";
import { data as withHeaders } from "react-router";
import { BodiesProduct, slug } from "~/storefronts/bodies";
import bodiesThemeHref from "~/storefronts/bodies/theme.css?url";

export function meta({ data: loaded }: Route.MetaArgs) {
  if (!loaded?.variant) return [{ title: "Not found" }];
  const title = `${loaded.variant.label} — ${loaded.store.name}`;
  const description = loaded.variant.sublabel ?? "Pilates at home.";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "product" },
  ];
}

/** Forward the loader's headers (no-store, cookies) onto the document response. */
export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  return loaderHeaders;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("Not found", { status: 404 });

  // Every other store keeps the old Shopify-shaped redirect to the root.
  if (store.slug !== "bodies") {
    return new Response(null, { status: 301, headers: { Location: `/${url.search}` } });
  }

  let page = await loadProductPage(context.db, store);
  if (!page) throw new Response("Not found", { status: 404 });
  // Signed-in admins get a live-reloading page, and ?samples=1 fills the
  // data-only sections with clearly stamped placeholders.
  const admin = await currentUser(context.db, request).catch(() => null);
  const samples = Boolean(admin && url.searchParams.get("samples") !== "0");
  if (samples) page = withSamples(page);
  const liveReload = admin ? liveReloadScript() : null;

  const variant = page.variants.find((v) => slug(v.label) === params.handle);
  if (!variant) {
    // A renamed colourway keeps its old address alive.
    const renamed: Record<string, string> = { "lilac-heat": "strawberry-milk" };
    const to = renamed[params.handle ?? ""];
    if (to) return new Response(null, { status: 301, headers: { Location: `/products/${to}${url.search}` } });
    throw new Response("Not found", { status: 404 });
  }

  const [meta] = await context.db
    .select({ pixelId: metaConfig.pixelId })
    .from(metaConfig)
    .where(eq(metaConfig.storeId, store.id))
    .limit(1);
  const pixel = meta?.pixelId ? pixelScript(meta.pixelId, { match: { externalId: readVisitorSession(request) } }) : null;

  const headers = new Headers();
  // Never let a browser, a home-screen app or a proxy keep an old copy of the page.
  headers.set("Cache-Control", "no-store, must-revalidate");
  const tracked = shouldTrack(request, url);
  if (tracked) {
    const sessionId = readVisitorSession(request) ?? newVisitorSession();
    headers.append("Set-Cookie", visitorCookie(sessionId, url));
    track(context.db, context.cloudflare.ctx, {
      storeId: store.id,
      sessionId,
      type: "view",
      path: url.pathname,
      geo: geoFromContext(context, request),
      device: deviceFromRequest(request),
      request,
      ...attribution(url),
    });
  }
  const vitals = tracked ? `${vitalsScript()}\n${presenceScript()}` : null;
  const storeParam = url.searchParams.get("store") ? `?store=${store.slug}` : "";

  let publishableKey: string | null = null;
  try {
    publishableKey = (await providerForStore(context.db, context.cloudflare.env, store.id)).publishableKey ?? null;
  } catch {
    publishableKey = null;
  }
  const paypalClientId = await paypalFor(context.db, context.cloudflare.env, store.id)
    .then((client) => client?.clientId ?? null)
    .catch(() => null);

  return withHeaders(
    { store, page, variant, pixel, vitals, storeParam, favicon: store.faviconUrl, publishableKey, paypalClientId, liveReload, samples },
    { headers },
  );
}

export default function BodiesColourway({ loaderData }: Route.ComponentProps) {
  const { page, variant, pixel, vitals, storeParam, favicon, publishableKey, paypalClientId, liveReload, samples } = loaderData;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,600..800&family=Instrument+Sans:wght@400;500;600&family=Jost:wght@800&display=swap"
      />
      <link rel="stylesheet" href={bodiesThemeHref} />
      {favicon ? <link rel="icon" href={favicon} /> : null}
      {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
      {vitals ? <script dangerouslySetInnerHTML={{ __html: vitals }} /> : null}
      {liveReload ? <script dangerouslySetInnerHTML={{ __html: liveReload }} /> : null}
      {samples ? (
        <a href="?samples=0" style={{ position: "fixed", left: 12, bottom: 12, zIndex: 60, background: "#0B0C0E", color: "#C6FF3D", font: "700 10px/1 Archivo, sans-serif", letterSpacing: ".12em", textTransform: "uppercase", padding: "8px 11px", borderRadius: 999, textDecoration: "none", boxShadow: "0 6px 20px rgba(0,0,0,.25)" }} title="You see SAMPLE cards because you are signed in. Shoppers see real data only. Click to view as a shopper.">
          Sample cards · admin view
        </a>
      ) : null}
      <BodiesProduct
        page={page}
        variant={variant}
        storeParam={storeParam}
        publishableKey={publishableKey}
        paypalClientId={paypalClientId}
      />
    </>
  );
}
