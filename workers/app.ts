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
    /**
     * Where the visitor is, read at the edge.
     *
     * Cloudflare attaches this to the request it hands the Worker, but the
     * request a loader receives is not always that same object — React Router
     * rebuilds it in places, and `cf` does not survive being rebuilt. Reading
     * it here, once, is the only place it is guaranteed to exist. Every event
     * written with no coordinates is a visitor the globe cannot draw, which is
     * exactly what was happening.
     */
    geo: {
      city: string | null;
      region: string | null;
      country: string | null;
      lat: number | null;
      lon: number | null;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /**
     * Nothing here is served over plain HTTP. Ever.
     *
     * The store was answering http:// with a 200, which is how an iPhone
     * ended up on "Not Secure — gardenbuddy.store" with Stripe refusing to
     * load ("Live Stripe.js integrations must use HTTPS") and no way to pay.
     * The same insecure origin also switches off service workers and push
     * notifications, so the phone could never have been notified either.
     *
     * This is the redirect Cloudflare's "Always Use HTTPS" would do, done
     * here so it cannot be switched off by accident and does not depend on a
     * dashboard setting nobody remembers.
     */
    const HSTS = "max-age=31536000; includeSubDomains";
    const redirect = (to: string) =>
      new Response(null, { status: 301, headers: { Location: to, "Strict-Transport-Security": HSTS } });

    if (url.protocol === "http:") {
      url.protocol = "https:";
      return redirect(url.toString());
    }

    const db = makeDb(env.DATABASE_URL);

    // One store, one address. Every other hostname connected to a store — the
    // www form, an old domain, a subdomain — permanently redirects to the
    // primary one, which is what Shopify does and what stops the same page
    // being indexed twice. The admin is never redirected: it lives on its own
    // address and must stay reachable however he arrives.
    // Pictures and scripts are served without asking the database which
    // store this is: that lookup was a round trip on every single image.
    const isAsset = url.pathname.startsWith("/media/") || url.pathname.startsWith("/assets/");
    if (!isAsset && !url.pathname.startsWith("/admin") && !url.pathname.startsWith("/webhooks")) {
      const primary = await primaryFor(db, url.hostname);
      if (primary && primary !== url.hostname) {
        url.hostname = primary;
        return redirect(url.toString());
      }
    }

    const response = await requestHandler(request, {
      cloudflare: { env, ctx },
      db,
      hostname: url.hostname,
      geo: edgeGeo(request),
    });

    /**
     * And tell the browser never to try HTTP again. A year, subdomains
     * included — after the first visit there is no insecure request left to
     * intercept, which is the point of the header.
     */
    const secured = new Response(response.body, response);
    secured.headers.set("Strict-Transport-Security", HSTS);
    return secured;
  },
} satisfies ExportedHandler<Env>;

/** Cloudflare's own geolocation, read from the request it actually gave us. */
function edgeGeo(request: Request) {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};
  const number = (value: unknown) => {
    const n = typeof value === "string" ? Number(value) : (value as number);
    return Number.isFinite(n) ? n : null;
  };
  return {
    city: (cf.city as string) ?? null,
    region: (cf.region as string) ?? (cf.regionCode as string) ?? null,
    // The header is there even when cf is not, so a country is almost always
    // knowable even if the precise point is not.
    country: (cf.country as string) ?? request.headers.get("CF-IPCountry") ?? null,
    lat: number(cf.latitude),
    lon: number(cf.longitude),
  };
}

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
