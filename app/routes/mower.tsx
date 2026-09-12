/**
 * /mower — the robot mower's page.
 *
 * The store sells its main product from the root. This is the second product,
 * so it answers on its own address, with the same chrome, the same pixel and
 * the same visit tracking as every other page: a visitor here is a visitor,
 * and Live View has to see them.
 */
import type { Route } from "./+types/mower";
import { eq, and, asc } from "drizzle-orm";
import { resolveStore, loadProductPage } from "~/lib/store.server";
import { products, variants, metaConfig } from "~/db/schema";
import { providerForStore } from "~/lib/payments.server";
import { paypalFor } from "~/lib/paypal.server";
import { pixelScript } from "~/lib/meta.server";
import { presenceScript, vitalsScript } from "~/lib/vitals";
import {
  deviceFromRequest,
  geoFromContext,
  readVisitorSession,
  readVisitorHuman,
  newVisitorSession,
  visitorCookie,
  shouldTrack,
  track,
  attribution,
} from "~/lib/visitor.server";
import { data as withHeaders } from "react-router";
import { MowerPage } from "~/storefronts/garden-buddy/mower";
import gardenBuddyThemeHref from "~/storefronts/garden-buddy/theme.css?url";

/** The product this page sells, by its handle. */
const HANDLE = "garden-buddy-mower";

export function meta({ data: loaded }: Route.MetaArgs) {
  if (!loaded?.variant) return [{ title: "Not found" }];
  const title = `${loaded.variant.label} — ${loaded.store.name}`;
  const description =
    "The robot that cuts the grass so you do not have to. Quiet, cordless, and it puts itself away.";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "product" },
    ...(loaded.variant.imageUrl && loaded.store.domain
      ? [{ property: "og:image", content: `https://${loaded.store.domain}${loaded.variant.imageUrl}` }]
      : []),
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("Not found", { status: 404 });

  const [product] = await context.db
    .select()
    .from(products)
    .where(and(eq(products.storeId, store.id), eq(products.handle, HANDLE), eq(products.status, "active")))
    .limit(1);
  if (!product) throw new Response("Not found", { status: 404 });

  const [variant] = await context.db
    .select()
    .from(variants)
    .where(eq(variants.productId, product.id))
    .orderBy(asc(variants.position))
    .limit(1);
  if (!variant) throw new Response("Not found", { status: 404 });

  // The drawer is built around the store's product page; this page borrows it
  // so the cart behaves identically here.
  const page = await loadProductPage(context.db, store);
  if (!page) throw new Response("Not found", { status: 404 });

  const [meta] = await context.db
    .select({ pixelId: metaConfig.pixelId })
    .from(metaConfig)
    .where(eq(metaConfig.storeId, store.id))
    .limit(1);
  const pixel = meta?.pixelId ? pixelScript(meta.pixelId) : null;

  const headers = new Headers();
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
      human: readVisitorHuman(request),
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
    { store, page, variant, pixel, vitals, storeParam, favicon: store.faviconUrl, publishableKey, paypalClientId },
    { headers },
  );
}

export default function Mower({ loaderData }: Route.ComponentProps) {
  const { page, variant, pixel, vitals, storeParam, favicon, publishableKey, paypalClientId } = loaderData;
  return (
    <>
      <link rel="stylesheet" href={gardenBuddyThemeHref} />
      {favicon ? <link rel="icon" href={favicon} /> : null}
      {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
      {vitals ? <script dangerouslySetInnerHTML={{ __html: vitals }} /> : null}
      <MowerPage
        page={page}
        variant={variant}
        storeParam={storeParam}
        publishableKey={publishableKey}
        paypalClientId={paypalClientId}
      />
    </>
  );
}
