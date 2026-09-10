import { createRequestHandler } from "react-router";
import { eq } from "drizzle-orm";
import { makeDb } from "../app/db/client";
import { domains, stores } from "../app/db/schema";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: { env: Env; ctx: ExecutionContext };
    db: ReturnType<typeof makeDb>;
    /** hostname the visitor arrived on — decides which store we serve */
    hostname: string;
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const db = makeDb(env.DATABASE_URL);

    // One store, one address. Every other hostname connected to a store — the
    // www form, an old domain, a subdomain — permanently redirects to the
    // primary one, which is what Shopify does and what stops the same page
    // being indexed twice. The admin is never redirected: it lives on its own
    // address and must stay reachable however he arrives.
    if (!url.pathname.startsWith("/admin") && !url.pathname.startsWith("/webhooks")) {
      const primary = await primaryFor(db, url.hostname);
      if (primary && primary !== url.hostname) {
        url.hostname = primary;
        return Response.redirect(url.toString(), 301);
      }
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
      db,
      hostname: url.hostname,
    });
  },
} satisfies ExportedHandler<Env>;

/**
 * The primary hostname for whichever store answers on this one, or null when
 * this hostname is not a connected store domain at all (workers.dev, a preview
 * address, localhost) — those are left exactly as they are.
 */
async function primaryFor(
  db: ReturnType<typeof makeDb>,
  hostname: string,
): Promise<string | null> {
  const [row] = await db
    .select({ primary: stores.domain })
    .from(domains)
    .innerJoin(stores, eq(stores.id, domains.storeId))
    .where(eq(domains.hostname, hostname))
    .limit(1);
  return row?.primary ?? null;
}
