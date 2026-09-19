/**
 * The map an engine reads before it starts crawling.
 *
 * Without one, a shop with seven product pages and five policy pages relies
 * on the crawler finding every link by itself and coming back often enough to
 * notice the ones that changed. That is slow in the week a seasonal shop has,
 * and it is free to fix.
 *
 * It is built from the database rather than a list kept by hand, so a product
 * added in the admin is in the sitemap the moment it is visible and a hidden
 * page is never advertised.
 */
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/sitemap[.]xml";
import { resolveStore } from "~/lib/store.server";
import { products, pages } from "~/db/schema";

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store?.domain) throw new Response("Not found", { status: 404 });

  const origin = `https://${store.domain}`;

  const productRows = await context.db
    .select({ handle: products.handle, createdAt: products.createdAt })
    .from(products)
    .where(eq(products.storeId, store.id));

  const pageRows = await context.db
    .select({ handle: pages.handle, updatedAt: pages.updatedAt })
    .from(pages)
    .where(and(eq(pages.storeId, store.id), eq(pages.kind, "standalone"), eq(pages.visible, true)));

  const day = (value: unknown) => {
    const date = value instanceof Date ? value : value ? new Date(String(value)) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  };

  const entries: { loc: string; lastmod: string | null; priority: string }[] = [
    { loc: `${origin}/`, lastmod: null, priority: "1.0" },
    ...productRows.map((row) => ({
      loc: `${origin}/products/${row.handle}`,
      lastmod: day(row.createdAt),
      priority: "0.9",
    })),
    ...pageRows.map((row) => ({
      loc: `${origin}/pages/${row.handle}`,
      lastmod: day(row.updatedAt),
      priority: "0.3",
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) =>
      `  <url>\n    <loc>${escape(entry.loc)}</loc>\n${entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>\n` : ""}    <priority>${entry.priority}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Long enough that a crawler is not re-fetching it constantly, short
      // enough that a product added this morning is listed this afternoon.
      "cache-control": "public, max-age=3600",
    },
  });
}
