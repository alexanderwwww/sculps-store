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
import ceilingBuddyHref from "~/storefronts/ceiling-buddy/theme.css?url";
import reaperHref from "~/storefronts/reaper/theme.css?url";

const GARDEN_BUDDY = "garden-buddy";
const REAPER = "reaper";

/*
 * No links() export here on purpose.
 *
 * It used to return the fallback layout's font and stylesheet for every
 * store, while each branch below also rendered its own theme with a
 * precedence. Those are two different mechanisms writing to the same <head>:
 * React hoists the precedence ones to the top on the server and re-orders
 * them on the client, so the head the browser was handed never matched the
 * head React wanted, and every policy page of every store threw a hydration
 * error and rebuilt itself on load.
 *
 * Each branch now declares exactly the stylesheets it uses, through one
 * mechanism, in the order it wants them. A shop also stops paying to
 * download another shop's theme.
 */
const KNEELER_FONT =
  "https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: "Page" }];
  const plain = data.page.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const tags: Record<string, string>[] = [
    { title: `${data.page.title} — ${data.store.name}` },
    { name: "description", content: plain.slice(0, 160) || `${data.page.title} — ${data.store.name}` },
  ];
  if (data.store.domain) {
    tags.push({ tagName: "link", rel: "canonical", href: `https://${data.store.domain}/pages/${data.handle}` });
  }
  return tags;
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
      faviconUrl: store.faviconUrl,
    },
    nav,
    page: { title: page.title, body: page.body, updatedAt: page.updatedAt },
    handle: page.handle,
    storeParam: url.searchParams.get("store") ? `?store=${store.slug}` : "",
  };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "September 19, 2026", spelled out by hand.
 *
 * toLocaleDateString was doing this, and on the Workers runtime it returned
 * an empty string: the server sent "Last updated " with no date, the browser
 * filled one in, and React threw a hydration error on every policy page of
 * every store. Worse than the error, the date was missing from the HTML a
 * crawler reads — and "when was this last changed" is the one fact a policy
 * page exists to carry.
 *
 * Read in UTC on both sides, so the string cannot drift with the reader's
 * clock either.
 */
function longDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
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
  const updated = longDate(page.updatedAt);

  if (store.slug === GARDEN_BUDDY) {
    const chrome = { store, nav } as Parameters<typeof Header>[0]["page"];
    return (
      <>
        {store.faviconUrl ? <link rel="icon" href={store.faviconUrl} /> : null}
        <link rel="stylesheet" href={buddyHref} precedence="theme" />
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

  /*
   * Black Reaper wears its own shop.
   *
   * These pages used to fall through to the plain fallback below, which is
   * the right thing for a store with no theme of its own and the wrong thing
   * here: a customer clicking Returns from a black Halloween storefront landed
   * on a cream page in a serif face with unstyled blue links and no way back
   * except the wordmark. Stripe and Meta both open these links while they are
   * deciding whether the shop is real, and so does anybody about to spend
   * three hundred dollars.
   *
   * It borrows the shop's own header and footer classes rather than inventing
   * a second set, so it keeps matching when the theme changes.
   */
  if (store.slug === REAPER) {
    const home = `/${storeParam}`;
    return (
      <>
        {store.faviconUrl ? <link rel="icon" href={store.faviconUrl} /> : null}
        <link rel="stylesheet" href={ceilingBuddyHref} precedence="theme" />
        <link rel="stylesheet" href={reaperHref} precedence="theme-over" />
        <div className="cb">
          <header className="cb-header">
            <div className="cb-wrap cb-header__in">
              <a className="cb-logo" href={home} aria-label={store.name}>
                {store.logoUrl ? <img src={store.logoUrl} alt={store.name} /> : <b>{store.name}</b>}
              </a>
              <nav className="cb-nav">
                {nav.main.map((l) => (
                  <a key={l.href + l.label} href={`${l.href}${storeParam}`}>{l.label}</a>
                ))}
              </nav>
            </div>
          </header>

          <article className="cb-wrap cb-legal">
            <h1>{page.title}</h1>
            <Body body={page.body} />
            <p className="cb-legal__meta">
              Last updated {updated}
              {store.contactEmail ? ` · Questions: ${store.contactEmail}` : ""}
            </p>
          </article>

          <footer className="cb-footer">
            <div className="cb-wrap cb-footer__cols">
              <div className="cb-footer__brand">
                {store.logoUrl ? <img src={store.logoUrl} alt={store.name} /> : <b className="cb-h3">{store.name}</b>}
              </div>
              {nav.footer.length ? (
                <nav className="cb-footer__col" aria-label="Footer">
                  <h3>Help</h3>
                  <ul>
                    {nav.footer.map((l) => (
                      <li key={l.href + l.label}><a href={`${l.href}${storeParam}`}>{l.label}</a></li>
                    ))}
                  </ul>
                </nav>
              ) : null}
              <div className="cb-footer__col">
                <h3>The store</h3>
                <ul>
                  {nav.main.map((l) => (
                    <li key={l.href + l.label}><a href={`${l.href}${storeParam}`}>{l.label}</a></li>
                  ))}
                </ul>
              </div>
              {store.contactEmail ? (
                <div className="cb-footer__col">
                  <h3>Talk to a person</h3>
                  <ul>
                    <li><a href={`mailto:${store.contactEmail}`}>{store.contactEmail}</a></li>
                    <li>Same-day replies, most days</li>
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="cb-wrap cb-footer__bar">
              <span>© 2026 {store.name}</span>
            </div>
          </footer>
        </div>
      </>
    );
  }

  return (
    <>
      <link rel="stylesheet" href={KNEELER_FONT} precedence="theme" />
      <link rel="stylesheet" href={kneelerHref} precedence="theme-over" />
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
    </>
  );
}
