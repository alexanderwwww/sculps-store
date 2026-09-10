/**
 * A standalone page on the storefront: shipping, returns, privacy, contact.
 *
 * It wears the store's own theme — the same header, the same navigation, the
 * same footer as every other page. A policy page with no way back to the shop
 * is a dead end, and a customer who reaches one has left the store.
 *
 * Only pages on the live theme that are marked visible render. An unpublished
 * page is a 404, not a blank one: Stripe and Meta both check these links, and
 * a blank page reads as missing.
 */
import { Link } from "react-router";
import type { Route } from "./+types/pages.$handle";
import { and, eq } from "drizzle-orm";
import { resolveStore, storeNav } from "~/lib/store.server";
import { liveTheme } from "~/lib/admin.server";
import { pages } from "~/db/schema";
import { Header, Footer } from "~/storefronts/garden-buddy";
import kneelerHref from "~/storefronts/garden-kneeler/theme.css?url";
import buddyHref from "~/storefronts/garden-buddy/theme.css?url";

const GARDEN_BUDDY = "garden-buddy";

export function links() {
  return [
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap",
    },
    { rel: "stylesheet", href: kneelerHref },
  ];
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `${data.page.title} — ${data.store.name}` : "Page" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });

  const theme = await liveTheme(context.db, store.id);
  const [page] = theme
    ? await context.db
        .select()
        .from(pages)
        .where(and(eq(pages.themeId, theme.id), eq(pages.handle, params.handle), eq(pages.kind, "standalone")))
        .limit(1)
    : [];

  if (!page || !page.visible) throw new Response("Page not found.", { status: 404 });

  const nav = await storeNav(context.db, store.id);

  return {
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      domain: store.domain,
      currency: store.currency,
      contactEmail: store.contactEmail,
      logoUrl: store.logoUrl,
    },
    nav,
    page: { title: page.title, body: page.body, updatedAt: page.updatedAt },
    storeParam: url.searchParams.get("store") ? `?store=${store.slug}` : "",
  };
}

/**
 * The body is written in the admin, by the person who owns the store, and it
 * is kept as the markup it was written in. It is our own content out of our
 * own database — never anything a visitor can put there.
 */
function Body({ body }: { body: string }) {
  if (!body.trim()) return <p className="gb-page__empty">This page has not been written yet.</p>;
  // Already markup: render it. Otherwise it is plain text, so keep the breaks.
  if (/<\/?(p|h[1-6]|ul|ol|li|br|strong|em|a)\b/i.test(body)) {
    return <div className="gb-page__body" dangerouslySetInnerHTML={{ __html: body }} />;
  }
  return (
    <div className="gb-page__body">
      {body
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block, index) => (
          <p key={index} style={{ whiteSpace: "pre-line" }}>
            {block}
          </p>
        ))}
    </div>
  );
}

export default function StandalonePage({ loaderData }: Route.ComponentProps) {
  const { store, nav, page, storeParam } = loaderData;
  const updated = new Date(page.updatedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (store.slug === GARDEN_BUDDY) {
    const chrome = { store, nav } as Parameters<typeof Header>[0]["page"];
    return (
      <>
        <link rel="stylesheet" href={buddyHref} />
        <Header page={chrome} storeParam={storeParam} />
        <div className="gb gb-page-sec">
          <article className="gb-wrap gb-page">
            <h1 className="gb-page__title">{page.title}</h1>
            <Body body={page.body} />
            <p className="gb-page__meta">
              Last updated {updated}
              {store.contactEmail ? ` · Questions: ${store.contactEmail}` : ""}
            </p>
          </article>
        </div>
        <Footer page={chrome} storeParam={storeParam} />
      </>
    );
  }

  return (
    <div className="gk">
      <header className="gk-header">
        <Link className="gk-logo" to={`/${storeParam}`} style={{ textDecoration: "none" }}>
          {store.name}
        </Link>
      </header>
      <div className="gk-shell" style={{ maxWidth: 760 }}>
        <h1 style={{ marginTop: 0 }}>{page.title}</h1>
        <Body body={page.body} />
        <p className="gk-quiet" style={{ marginTop: 32 }}>
          Last updated {updated}
          {store.contactEmail ? ` · Questions: ${store.contactEmail}` : ""}
        </p>
      </div>
    </div>
  );
}
