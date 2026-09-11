import type { Route } from "./+types/storefront";
import { data } from "react-router";
import { resolveStore, loadProductPage } from "~/lib/store.server";
import { currentUser } from "~/lib/auth.server";
import { pages, metaConfig, themes } from "~/db/schema";
import { passwordCookieValid } from "~/lib/password.server";
import { eq } from "drizzle-orm";
import { pixelScript, trackFunnelEvent } from "~/lib/meta.server";
import { vitalsScript } from "~/lib/vitals";
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
import { GardenKneelerStorefront } from "~/storefronts/garden-kneeler";
import themeHref from "~/storefronts/garden-kneeler/theme.css?url";
import { GardenBuddyStorefront } from "~/storefronts/garden-buddy";
import gardenBuddyThemeHref from "~/storefronts/garden-buddy/theme.css?url";

/**
 * Which theme a store gets. Design lives in code, one theme per store, so this
 * is the whole switch: a store with its own theme is named here, everything
 * else keeps the generic one.
 */
const GARDEN_BUDDY = "garden-buddy";

export function links() {
  return [
    // A favicon set in Preferences; the browser default otherwise.
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap",
    },
    { rel: "stylesheet", href: themeHref },
  ];
}

export function meta({ data: loaded }: Route.MetaArgs) {
  if (!loaded?.page) return [{ title: loaded?.store?.name ?? "Store" }];
  const { store, product } = loaded.page;
  // Settings → Online Store → Preferences win; the product is the fallback.
  const title = store.seoTitle || `${product.title} — ${store.name}`;
  const description = store.metaDescription || product.description.slice(0, 160);
  const tags: Record<string, string>[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "product" },
    { property: "og:site_name", content: store.name },
  ];
  if (store.socialImageUrl) tags.push({ property: "og:image", content: store.socialImageUrl });
  return tags;
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) {
    throw data("No store is configured for this domain yet.", { status: 404 });
  }

  // Two admin-only views of the storefront:
  //   ?preview=<pageId>  the theme editor's iframe, hidden sections included
  //   ?theme=<themeId>   a draft theme, for the Online Store thumbnails
  // A visitor always gets the live theme; these need a signed-in admin.
  const previewPageId = url.searchParams.get("preview");
  const previewThemeId = url.searchParams.get("theme");
  const isThumb = url.searchParams.has("thumb");
  let themeId: string | undefined;
  let includeHidden = false;
  const admin = previewPageId || previewThemeId ? await currentUser(context.db, request) : null;
  if (previewPageId && admin) {
    const [previewPage] = await context.db
      .select()
      .from(pages)
      .where(eq(pages.id, previewPageId))
      .limit(1);
    if (previewPage?.storeId === store.id && previewPage.themeId) {
      themeId = previewPage.themeId;
      includeHidden = true;
    }
  } else if (previewThemeId && admin) {
    const [draft] = await context.db.select().from(themes).where(eq(themes.id, previewThemeId)).limit(1);
    if (draft?.storeId === store.id) themeId = draft.id;
  }

  // Pre-launch password. Meta's crawler still gets through so the domain can
  // be verified; the admin's own previews are not gated either.
  if (store.passwordEnabled && !admin && !passwordCookieValid(request, store.passwordHash)) {
    const ua = request.headers.get("User-Agent") ?? "";
    const crawler = /facebookexternalhit|Facebot|Stripe|Twitterbot|LinkedInBot|Googlebot/i.test(ua);
    if (!crawler) {
      const next = new URL("/password", url.origin);
      next.searchParams.set("store", store.slug);
      throw new Response(null, { status: 302, headers: { Location: next.toString() } });
    }
  }

  const page = await loadProductPage(context.db, store, { themeId, includeHidden });

  // The browser pixel. Only rendered when this store actually has one, so a
  // store without Meta gets no third-party script at all.
  const [meta] = await context.db
    .select({ pixelId: metaConfig.pixelId })
    .from(metaConfig)
    .where(eq(metaConfig.storeId, store.id))
    .limit(1);
  const live = !previewPageId && !previewThemeId && !isThumb;
  let pixel = meta?.pixelId && live ? pixelScript(meta.pixelId) : null;

  // ViewContent. Someone looking at the product is the top of the funnel, and
  // it is the event Meta needs most after Purchase to find more people like
  // the ones who buy. Sent from the browser and the server with one shared id.
  if (pixel && page) {
    const shown = page.variants.find((v) => v.isDefault) ?? page.variants[0];
    if (shown) {
      const viewContent = await trackFunnelEvent(context.db, context.cloudflare.env, context.cloudflare.ctx, {
        storeId: store.id,
        pixelId: meta?.pixelId ?? null,
        request,
        url,
        name: "ViewContent",
        valueCents: shown.priceCents,
        currency: store.currency,
        contents: [{ id: shown.id, quantity: 1, itemPrice: shown.priceCents }],
      });
      if (viewContent) pixel = `${pixel}\n${viewContent}`;
    }
  }
  // Record the visit. This is what Live View and Analytics are made of.
  const headers = new Headers();
  if (shouldTrack(request, url) && !isThumb && !previewThemeId) {
    const sessionId = readVisitorSession(request) ?? newVisitorSession();
    headers.append("Set-Cookie", visitorCookie(sessionId, url));
    track(context.db, context.cloudflare.ctx, {
      storeId: store.id,
      sessionId,
      type: "view",
      path: url.pathname,
      geo: geoFromContext(context, request),
      device: deviceFromRequest(request),
      ...attribution(url),
    });
  }

  // Core Web Vitals, measured on this visit. Only on a real, tracked view —
  // a preview or a thumbnail render is not a visitor and must not move the
  // store's numbers.
  const vitals = shouldTrack(request, url) && !isThumb && !previewThemeId ? vitalsScript() : null;

  // On the built-in address the store is chosen by ?store=; carry it so an
  // internal link cannot wander into a different shop.
  const storeParam = url.searchParams.get("store") ? `?store=${store.slug}` : "";

  return withHeaders({ store, page: page ?? null, pixel, vitals, storeParam, favicon: store.faviconUrl }, { headers });
}

export default function Storefront({ loaderData }: Route.ComponentProps) {
  const { store, page, pixel, vitals, storeParam, favicon } = loaderData;

  if (!page) {
    return (
      <div className="gk">
        {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
        <header className="gk-header">
          <span className="gk-logo">{store.name}</span>
        </header>
        <div className="gk-wrap" style={{ padding: "80px 24px" }}>
          <div className="gk-empty">
            <h2 style={{ marginBottom: 10 }}>No product page yet</h2>
            <p style={{ margin: 0 }}>
              This store has no product page in the database. Seed it, then reload.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const head = (
    <>
      {favicon ? <link rel="icon" href={favicon} /> : null}
      {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
      {vitals ? <script dangerouslySetInnerHTML={{ __html: vitals }} /> : null}
    </>
  );

  if (store.slug === GARDEN_BUDDY) {
    return (
      <>
        <link rel="stylesheet" href={gardenBuddyThemeHref} />
        {head}
        <GardenBuddyStorefront page={page} storeParam={storeParam} />
      </>
    );
  }

  return (
    <div className="gk">
      {head}
      <GardenKneelerStorefront page={page} />
    </div>
  );
}
