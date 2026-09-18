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
import { eq, and } from "drizzle-orm";
import { resolveStore, loadProductPage } from "~/lib/store.server";
import { metaConfig, discounts } from "~/db/schema";
import { providerForStore } from "~/lib/payments.server";
import { paypalFor } from "~/lib/paypal.server";
import { pixelScript } from "~/lib/meta.server";
import { presenceScript, vitalsScript } from "~/lib/vitals";
import { liveReloadScript } from "~/lib/live-reload";
import { currentUser } from "~/lib/auth.server";
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
import { CeilingBuddyStorefront } from "~/storefronts/ceiling-buddy";
import ceilingBuddyThemeHref from "~/storefronts/ceiling-buddy/theme.css?url";
import reaperThemeHref from "~/storefronts/reaper/theme.css?url";
import { reaperBrand } from "~/storefronts/reaper/brand";

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

  /**
   * Two shapes of shop share this address.
   *
   * bodies sells one board in four colours, so the handle picks a *variant*
   * of a single page. Black Reaper sells seven different things, so the
   * handle picks the *page*. Everything below — pixel, tracking, headers,
   * payment keys — is the same either way, which is why this is one route
   * with two openings rather than two routes.
   */
  const perProduct = store.slug === "reaper";
  if (!perProduct && store.slug !== "bodies") {
    // Every other store keeps the old Shopify-shaped redirect to the root.
    return new Response(null, { status: 301, headers: { Location: `/${url.search}` } });
  }

  const page = await loadProductPage(context.db, store, perProduct ? { handle: params.handle } : {});
  if (!page) throw new Response("Not found", { status: 404 });
  const admin = await currentUser(context.db, request).catch(() => null);
  const liveReload = admin ? liveReloadScript() : null;

  const variant = perProduct
    ? (page.variants.find((v) => v.isDefault) ?? page.variants[0] ?? null)
    : page.variants.find((v) => slug(v.label) === params.handle);
  if (!variant) {
    // A renamed colourway keeps its old address alive.
    const renamed: Record<string, string> = { "lilac-heat": "strawberry-milk" };
    const to = renamed[params.handle ?? ""];
    if (to) return new Response(null, { status: 301, headers: { Location: `/products/${to}${url.search}` } });
    throw new Response("Not found", { status: 404 });
  }

  // The code the announcement rail is shouting about. It was only loaded on
  // the home route, so every product page — which is where people actually
  // land — ran the rail without it.
  const [offer] = await context.db
    .select({ code: discounts.code, kind: discounts.kind, value: discounts.value })
    .from(discounts)
    .where(and(eq(discounts.storeId, store.id), eq(discounts.active, true)))
    .limit(1);

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
    { store, page, variant, pixel, vitals, storeParam, favicon: store.faviconUrl, publishableKey, paypalClientId, liveReload, offer: offer ?? null },
    { headers },
  );
}

export default function BodiesColourway({ loaderData }: Route.ComponentProps) {
  const { page, variant, pixel, vitals, storeParam, favicon, publishableKey, paypalClientId, liveReload, offer } = loaderData;

  /**
   * Black Reaper sells seven things off one template, so a product page here
   * is the same page the home route renders — just loaded by handle. Nothing
   * about the chrome differs, which is why it reuses the component rather
   * than owning a second copy of it.
   */
  if (page.store.slug === "reaper") {
    return (
      <>
        <link rel="stylesheet" href={ceilingBuddyThemeHref} />
        <link rel="stylesheet" href={reaperThemeHref} />
        {favicon ? <link rel="icon" href={favicon} /> : null}
        {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
        {vitals ? <script dangerouslySetInnerHTML={{ __html: vitals }} /> : null}
        {liveReload ? <script dangerouslySetInnerHTML={{ __html: liveReload }} /> : null}
        <CeilingBuddyStorefront
          page={page}
          storeParam={storeParam}
          publishableKey={publishableKey}
          paypalClientId={paypalClientId}
          offer={offer}
          brand={reaperBrand(page)}
        />
      </>
    );
  }

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
