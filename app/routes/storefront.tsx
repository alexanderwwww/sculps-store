import type { Route } from "./+types/storefront";
import { data } from "react-router";
import { resolveStore, loadProductPage } from "~/lib/store.server";
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

  const page = await loadProductPage(context.db, store);
  if (!page) {
    return { store, page: null };
  }
  return { store, page };
}

export default function Storefront({ loaderData }: Route.ComponentProps) {
  const { store, page } = loaderData;

  if (!page) {
    return (
      <div className="gk">
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
      <GardenKneelerStorefront page={page} />
    </div>
  );
}
