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

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("Not found", { status: 404 });

  // Every other store keeps the old Shopify-shaped redirect to the root.
  if (store.slug !== "bodies") {
    return new Response(null, { status: 301, headers: { Location: `/${url.search}` } });
  }

  const page = await loadProductPage(context.db, store);
  if (!page) throw new Response("Not found", { status: 404 });

  const variant = page.variants.find((v) => slug(v.label) === params.handle);
  if (!variant) throw new Response("Not found", { status: 404 });

  const [meta] = await context.db
    .select({ pixelId: metaConfig.pixelId })
    .from(metaConfig)
    .where(eq(metaConfig.storeId, store.id))
    .limit(1);
  const pixel = meta?.pixelId ? pixelScript(meta.pixelId) : null;

  const headers = new Headers();
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
    { store, page, variant, pixel, vitals, storeParam, favicon: store.faviconUrl, publishableKey, paypalClientId },
    { headers },
  );
}

export default function BodiesColourway({ loaderData }: Route.ComponentProps) {
  const { page, variant, pixel, vitals, storeParam, favicon, publishableKey, paypalClientId } = loaderData;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Instrument+Sans:wght@400;500;600&display=swap"
      />
      <link rel="stylesheet" href={bodiesThemeHref} />
      {favicon ? <link rel="icon" href={favicon} /> : null}
      {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
      {vitals ? <script dangerouslySetInnerHTML={{ __html: vitals }} /> : null}
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
