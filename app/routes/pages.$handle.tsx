/**
 * A standalone page on the storefront: refund policy, privacy, contact.
 *
 * Only pages on the store's live theme that are marked visible render. An
 * unpublished page is a 404, not a blank page — Stripe and Meta both check
 * these links exist, and a blank one reads as missing.
 */
import { Link } from "react-router";
import type { Route } from "./+types/pages.$handle";
import { and, eq } from "drizzle-orm";
import { resolveStore } from "~/lib/store.server";
import { liveTheme } from "~/lib/admin.server";
import { pages } from "~/db/schema";
import themeHref from "~/storefronts/garden-kneeler/theme.css?url";

export function links() {
  return [
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap",
    },
    { rel: "stylesheet", href: themeHref },
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

  return {
    store: { name: store.name, slug: store.slug, contactEmail: store.contactEmail },
    page: { title: page.title, body: page.body, updatedAt: page.updatedAt },
  };
}

/** Plain paragraphs. The body is text he typed, never HTML from anywhere. */
function paragraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export default function StandalonePage({ loaderData }: Route.ComponentProps) {
  const { store, page } = loaderData;
  const blocks = paragraphs(page.body);

  return (
    <div className="gk">
      <header className="gk-header">
        <Link className="gk-logo" to={`/?store=${store.slug}`} style={{ textDecoration: "none" }}>
          {store.name}
        </Link>
      </header>
      <div className="gk-shell" style={{ maxWidth: 760 }}>
        <h1 style={{ marginTop: 0 }}>{page.title}</h1>
        {blocks.length === 0 ? (
          <p className="gk-quiet">This page has not been written yet.</p>
        ) : (
          blocks.map((block, index) => (
            <p key={index} style={{ fontSize: 18, lineHeight: 1.6, whiteSpace: "pre-line" }}>
              {block}
            </p>
          ))
        )}
        <p className="gk-quiet" style={{ marginTop: 32 }}>
          Last updated {new Date(page.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          {store.contactEmail ? ` · Questions: ${store.contactEmail}` : ""}
        </p>
      </div>
    </div>
  );
}
