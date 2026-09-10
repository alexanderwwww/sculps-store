import type { Route } from "./+types/storefront";
import { data } from "react-router";
import { resolveStore, loadProductPage } from "~/lib/store.server";
import { currentUser } from "~/lib/auth.server";
import { pages, metaConfig } from "~/db/schema";
import { eq } from "drizzle-orm";
import { pixelScript } from "~/lib/meta.server";
import {
  geoFromRequest,
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

export function links() {
  return [
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
  if (!loaded?.page) return [{ title: "Store" }];
  const { store, product } = loaded.page;
  return [
    { title: `${product.title} — ${store.name}` },
    { name: "description", content: product.description.slice(0, 160) },
  ];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) {
    throw data("No store is configured for this domain yet.", { status: 404 });
  }

  // The theme editor previews a specific page in an iframe, hidden sections
  // included so the section list and the page agree. Only a signed-in admin
  // gets that view; a visitor always sees the live theme.
  const previewPageId = url.searchParams.get("preview");
  let themeId: string | undefined;
  let includeHidden = false;
  if (previewPageId && (await currentUser(context.db, request))) {
    const [previewPage] = await context.db
      .select()
      .from(pages)
      .where(eq(pages.id, previewPageId))
      .limit(1);
    if (previewPage?.storeId === store.id && previewPage.themeId) {
      themeId = previewPage.themeId;
      includeHidden = true;
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
  const pixel = meta?.pixelId && !previewPageId ? pixelScript(meta.pixelId) : null;
  // Record the visit. This is what Live View and Analytics are made of.
  const headers = new Headers();
  if (shouldTrack(request, url)) {
    const sessionId = readVisitorSession(request) ?? newVisitorSession();
    headers.append("Set-Cookie", visitorCookie(sessionId, url));
    track(context.db, context.cloudflare.ctx, {
      storeId: store.id,
      sessionId,
      type: "view",
      path: url.pathname,
      geo: geoFromRequest(request),
      ...attribution(url),
    });
  }

  return withHeaders({ store, page: page ?? null, pixel }, { headers });
}

export default function Storefront({ loaderData }: Route.ComponentProps) {
  const { store, page, pixel } = loaderData;

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

  return (
    <div className="gk">
      {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
      <GardenKneelerStorefront page={page} />
    </div>
  );
}
