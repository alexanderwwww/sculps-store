/**
 * Meta: the browser pixel and the server Conversions API.
 *
 * Both send the same event with the same event ID, which is what makes Meta
 * merge them into one conversion instead of counting the purchase twice. That
 * shared id is generated once at checkout and stored on the order.
 *
 * Personal data is hashed before it leaves this Worker, as Meta requires — a
 * plain email address is never sent.
 */
import { eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import { metaConfig, clientEvents } from "~/db/schema";
import { decryptSecret } from "./crypto.server";

async function hash(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const normalised = value.trim().toLowerCase();
  if (!normalised) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalised));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The four events an ad account actually optimises on. Meta learns from the
 * whole funnel, not just the sale — a pixel that only ever reports Purchase
 * gives the algorithm almost nothing to work with.
 */
export type MetaEventName =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Lead"
  | "Purchase";

/** What is known about the person, sent hashed on every event that has it. */
export interface MetaIdentity {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  /** our own visitor id — ties the whole visit to one person for Meta */
  externalId?: string | null;
}

export interface MetaEvent {
  eventId: string;
  eventTime: number;
  sourceUrl: string;
  /** absent before checkout — the earlier events have no customer yet */
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  externalId?: string | null;
  valueCents: number;
  currency: string;
  contents: { id: string; quantity: number; itemPrice: number }[];
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

/** A Purchase always knows who bought. */
export interface PurchaseEvent extends MetaEvent {
  email: string;
}

export interface MetaSettings {
  pixelId: string;
  token: string;
  testEventCode: string | null;
}

export async function metaSettings(
  db: DB,
  env: Env,
  storeId: string,
): Promise<MetaSettings | null> {
  const [row] = await db.select().from(metaConfig).where(eq(metaConfig.storeId, storeId)).limit(1);
  if (!row?.pixelId) return null;

  const token = await decryptSecret(env, row.capiTokenEnc);
  if (!token) return null;

  return { pixelId: row.pixelId, token, testEventCode: row.testEventCode };
}

/**
 * Sends one event to the Conversions API.
 *
 * Returns a reason rather than throwing: a failed ad event must never take
 * down a page the customer is looking at, and the failure belongs on the order
 * timeline where it can be seen.
 */
export async function sendEvent(
  settings: MetaSettings,
  name: MetaEventName,
  event: MetaEvent,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [em, ph, fn, ln, ct, st, zp, country, externalId] = await Promise.all([
    hash(event.email),
    hash(event.phone?.replace(/[^0-9]/g, "")),
    hash(event.firstName),
    hash(event.lastName),
    hash(event.city?.replace(/\s/g, "")),
    hash(event.region),
    hash(event.postalCode),
    hash(event.country),
    hash(event.externalId),
  ]);

  const userData: Record<string, unknown> = {};
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (fn) userData.fn = [fn];
  if (ln) userData.ln = [ln];
  if (ct) userData.ct = [ct];
  if (st) userData.st = [st];
  if (zp) userData.zp = [zp];
  if (country) userData.country = [country];
  if (externalId) userData.external_id = [externalId];
  if (event.clientIp) userData.client_ip_address = event.clientIp;
  if (event.userAgent) userData.client_user_agent = event.userAgent;
  if (event.fbp) userData.fbp = event.fbp;
  if (event.fbc) userData.fbc = event.fbc;

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: name,
        event_time: event.eventTime,
        // The same id the browser pixel used. This is the deduplication.
        event_id: event.eventId,
        event_source_url: event.sourceUrl,
        action_source: "website",
        user_data: userData,
        ...(event.contents.length
          ? {
              custom_data: {
                currency: event.currency.toUpperCase(),
                value: (event.valueCents / 100).toFixed(2),
                contents: event.contents.map((item) => ({
                  id: item.id,
                  quantity: item.quantity,
                  item_price: (item.itemPrice / 100).toFixed(2),
                })),
                content_type: "product",
                content_ids: event.contents.map((item) => item.id),
                num_items: event.contents.reduce((sum, item) => sum + item.quantity, 0),
              },
            }
          : {}),
      },
    ],
  };
  if (settings.testEventCode) body.test_event_code = settings.testEventCode;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${settings.pixelId}/events?access_token=${encodeURIComponent(settings.token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    const payload = (await response.json()) as any;
    if (!response.ok) {
      return { ok: false, reason: payload?.error?.message ?? `Meta refused it (${response.status}).` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Unknown error." };
  }
}

/** Purchase, the event the whole funnel is pointed at. */
export function sendPurchase(settings: MetaSettings, event: PurchaseEvent) {
  return sendEvent(settings, "Purchase", event);
}

/**
 * The browser half. Emits the same event id as the server call above.
 *
 * Returned as a string of JavaScript for the storefront to inline, so there is
 * one place that decides what the pixel does.
 */
/**
 * The pixel bootstrap.
 *
 * `match` is Meta's advanced matching: whatever we know about the person is
 * handed to the pixel in the clear and it hashes it in the browser. Our own
 * visitor id goes as external_id on every page, the email once checkout has
 * it. `pageViewEventId` is shared with the server-side PageView so Meta
 * counts one view, not two.
 */
export function pixelScript(
  pixelId: string,
  options: { match?: MetaIdentity | null; pageViewEventId?: string | null } = {},
): string {
  const match: Record<string, string> = {};
  const m = options.match;
  if (m?.externalId) match.external_id = m.externalId;
  if (m?.email) match.em = m.email.trim().toLowerCase();
  if (m?.phone) match.ph = m.phone.replace(/[^0-9]/g, "");
  if (m?.firstName) match.fn = m.firstName.trim().toLowerCase();
  if (m?.lastName) match.ln = m.lastName.trim().toLowerCase();
  if (m?.city) match.ct = m.city.replace(/\s/g, "").toLowerCase();
  if (m?.region) match.st = m.region.trim().toLowerCase();
  if (m?.postalCode) match.zp = m.postalCode.trim();
  if (m?.country) match.country = m.country.trim().toLowerCase();
  const init = Object.keys(match).length ? `fbq('init','${pixelId}',${JSON.stringify(match)});` : `fbq('init','${pixelId}');`;
  const view = options.pageViewEventId
    ? `fbq('track','PageView',{},{eventID:${JSON.stringify(options.pageViewEventId)}});`
    : `fbq('track','PageView');`;
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
${init}${view}`;
}

/**
 * The browser half of any of the four events.
 *
 * It sends the same custom_data the server sends — same contents, same ids,
 * same count. When the two halves of a deduplicated pair disagree, Meta keeps
 * one of them and the match quality of the event drops; sending the same thing
 * twice is the whole point.
 */
export function eventPixelScript(input: {
  name: MetaEventName;
  eventId: string;
  valueCents: number;
  currency: string;
  contents: { id: string; quantity: number; itemPrice: number }[];
}): string {
  if (!input.contents.length) {
    return `if(window.fbq){fbq('track',${JSON.stringify(input.name)},{},{eventID:${JSON.stringify(input.eventId)}});}`;
  }
  const customData = {
    value: Number((input.valueCents / 100).toFixed(2)),
    currency: input.currency.toUpperCase(),
    content_type: "product",
    content_ids: input.contents.map((item) => item.id),
    contents: input.contents.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      item_price: Number((item.itemPrice / 100).toFixed(2)),
    })),
    num_items: input.contents.reduce((sum, item) => sum + item.quantity, 0),
  };
  return `if(window.fbq){fbq('track',${JSON.stringify(input.name)},${JSON.stringify(customData)},{eventID:${JSON.stringify(input.eventId)}});}`;
}

export function purchasePixelScript(input: {
  eventId: string;
  valueCents: number;
  currency: string;
  contents: { id: string; quantity: number; itemPrice: number }[];
}): string {
  return eventPixelScript({ ...input, name: "Purchase" });
}

/** A fresh id for one event, shared by the browser and server halves. */
export function newMetaEventId(): string {
  return crypto.randomUUID();
}

/** Reads the pixel's own cookies, which improve Meta's match rate. */
/**
 * The pixel's two cookies, with two of our own on top.
 *
 * Safari caps a script-set cookie at 7 days and sometimes blocks it; a cookie
 * set by the server on our own domain lives as long as we say. So on every
 * tracked page the server writes `_fbp` (if the pixel has not yet) and `_fbc`
 * (built from the fbclid on the ad click) for 90 days, in Meta's own format,
 * which the pixel then reuses instead of minting its own. Attribution survives
 * the week.
 */
export function metaCookieHeaders(request: Request, url: URL): string[] {
  const have = readMetaCookies(request);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const ninetyDays = 90 * 86400;
  const out: string[] = [];
  const fbclid = url.searchParams.get("fbclid");
  if (fbclid && !have.fbc) {
    out.push(`_fbc=fb.1.${Date.now()}.${encodeURIComponent(fbclid)}; Path=/; SameSite=Lax; Max-Age=${ninetyDays}${secure}`);
  } else if (have.fbc) {
    out.push(`_fbc=${have.fbc}; Path=/; SameSite=Lax; Max-Age=${ninetyDays}${secure}`);
  }
  if (have.fbp) {
    out.push(`_fbp=${have.fbp}; Path=/; SameSite=Lax; Max-Age=${ninetyDays}${secure}`);
  } else {
    const random = Math.floor(Math.random() * 1e10);
    out.push(`_fbp=fb.1.${Date.now()}.${random}; Path=/; SameSite=Lax; Max-Age=${ninetyDays}${secure}`);
  }
  return out;
}

export function readMetaCookies(request: Request, url?: URL): { fbp: string | null; fbc: string | null } {
  const header = request.headers.get("Cookie");
  const fbclid = url?.searchParams.get("fbclid") ?? null;
  const fromClick = fbclid ? `fb.1.${Date.now()}.${fbclid}` : null;
  if (!header) return { fbp: null, fbc: fromClick };

  let fbp: string | null = null;
  let fbc: string | null = null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    const value = rest.join("=");
    if (key === "_fbp") fbp = value;
    if (key === "_fbc") fbc = value;
  }
  return { fbp, fbc: fbc ?? fromClick };
}

/**
 * One funnel event, both halves.
 *
 * Fires the server-side Conversions API call in the background and returns the
 * browser script for the same event, carrying the same id so Meta merges them.
 * The server half never blocks the page: an ad event is not worth a slow
 * storefront, so it goes out through waitUntil and its failure is silent to
 * the customer.
 *
 * Before checkout there is no customer, so the only identity we can send is
 * what the pixel's own cookies and the request give us — fbp, fbc, IP and user
 * agent. That is what Meta expects for these events; nothing is invented.
 */

/**
 * A refused server event is written down, so the Meta page can say so
 * instead of the failure vanishing into a background task.
 */
async function noteFailure(db: DB, storeId: string, name: MetaEventName, reason: string): Promise<void> {
  try {
    await db.insert(clientEvents).values({ storeId, kind: "meta-capi-failed", detail: `${name}: ${reason}`.slice(0, 500) });
  } catch {
    /* the log must never break the page */
  }
}

export async function trackFunnelEvent(
  db: DB,
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  input: {
    storeId: string;
    pixelId: string | null;
    request: Request;
    url: URL;
    name: MetaEventName;
    valueCents: number;
    currency: string;
    contents: { id: string; quantity: number; itemPrice: number }[];
    /** whatever is known about the person — visitor id always, email once typed */
    identity?: MetaIdentity | null;
    /** when the browser half was already written with an id (PageView) */
    eventId?: string;
  },
): Promise<string | null> {
  if (!input.pixelId) return null;
  if (!input.contents.length && input.name !== "PageView") return null;

  const eventId = input.eventId ?? newMetaEventId();
  const script = eventPixelScript({
    name: input.name,
    eventId,
    valueCents: input.valueCents,
    currency: input.currency,
    contents: input.contents,
  });

  const { fbp, fbc } = readMetaCookies(input.request, input.url);
  ctx.waitUntil(
    (async () => {
      const settings = await metaSettings(db, env, input.storeId);
      if (!settings) return;
      const result = await sendEvent(settings, input.name, {
        eventId,
        eventTime: Math.floor(Date.now() / 1000),
        sourceUrl: input.url.toString(),
        ...(input.identity ?? {}),
        valueCents: input.valueCents,
        currency: input.currency,
        contents: input.contents,
        clientIp: input.request.headers.get("CF-Connecting-IP"),
        userAgent: input.request.headers.get("User-Agent"),
        fbp,
        fbc,
      });
      if (!result.ok) await noteFailure(db, input.storeId, input.name, result.reason);
    })(),
  );

  return script;
}

/**
 * A server-only event: Lead when an email lands, AddPaymentInfo when the
 * order is placed. Nothing to deduplicate against, so no browser half.
 */
export function sendServerEvent(
  db: DB,
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  input: {
    storeId: string;
    request: Request;
    url: URL;
    name: MetaEventName;
    identity: MetaIdentity;
    valueCents?: number;
    currency?: string;
    contents?: { id: string; quantity: number; itemPrice: number }[];
  },
): void {
  const { fbp, fbc } = readMetaCookies(input.request, input.url);
  ctx.waitUntil(
    (async () => {
      const settings = await metaSettings(db, env, input.storeId);
      if (!settings) return;
      const result = await sendEvent(settings, input.name, {
        eventId: newMetaEventId(),
        eventTime: Math.floor(Date.now() / 1000),
        sourceUrl: input.url.toString(),
        ...input.identity,
        valueCents: input.valueCents ?? 0,
        currency: input.currency ?? "USD",
        contents: input.contents ?? [],
        clientIp: input.request.headers.get("CF-Connecting-IP"),
        userAgent: input.request.headers.get("User-Agent"),
        fbp,
        fbc,
      });
      if (!result.ok) await noteFailure(db, input.storeId, input.name, result.reason);
    })(),
  );
}
