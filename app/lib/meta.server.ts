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
import { metaConfig } from "~/db/schema";
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
export type MetaEventName = "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase";

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
  const [em, ph, fn, ln, ct, st, zp, country] = await Promise.all([
    hash(event.email),
    hash(event.phone?.replace(/[^0-9]/g, "")),
    hash(event.firstName),
    hash(event.lastName),
    hash(event.city?.replace(/\s/g, "")),
    hash(event.region),
    hash(event.postalCode),
    hash(event.country),
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
export function pixelScript(pixelId: string): string {
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');fbq('track','PageView');`;
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
export function readMetaCookies(request: Request): { fbp: string | null; fbc: string | null } {
  const header = request.headers.get("Cookie");
  if (!header) return { fbp: null, fbc: null };

  let fbp: string | null = null;
  let fbc: string | null = null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    const value = rest.join("=");
    if (key === "_fbp") fbp = value;
    if (key === "_fbc") fbc = value;
  }
  return { fbp, fbc };
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
  },
): Promise<string | null> {
  if (!input.pixelId || !input.contents.length) return null;

  const eventId = newMetaEventId();
  const script = eventPixelScript({
    name: input.name,
    eventId,
    valueCents: input.valueCents,
    currency: input.currency,
    contents: input.contents,
  });

  const { fbp, fbc } = readMetaCookies(input.request);
  ctx.waitUntil(
    (async () => {
      const settings = await metaSettings(db, env, input.storeId);
      if (!settings) return;
      await sendEvent(settings, input.name, {
        eventId,
        eventTime: Math.floor(Date.now() / 1000),
        sourceUrl: input.url.toString(),
        valueCents: input.valueCents,
        currency: input.currency,
        contents: input.contents,
        clientIp: input.request.headers.get("CF-Connecting-IP"),
        userAgent: input.request.headers.get("User-Agent"),
        fbp,
        fbc,
      });
    })(),
  );

  return script;
}
