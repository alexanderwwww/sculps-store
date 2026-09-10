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

export interface PurchaseEvent {
  eventId: string;
  eventTime: number;
  sourceUrl: string;
  email: string;
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
 * Sends a Purchase to the Conversions API.
 *
 * Returns a reason rather than throwing: a failed ad event must never take
 * down a page the customer is looking at, and the failure belongs on the order
 * timeline where it can be seen.
 */
export async function sendPurchase(
  settings: MetaSettings,
  event: PurchaseEvent,
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
        event_name: "Purchase",
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

export function purchasePixelScript(input: {
  eventId: string;
  valueCents: number;
  currency: string;
}): string {
  return `if(window.fbq){fbq('track','Purchase',{value:${(input.valueCents / 100).toFixed(2)},currency:'${input.currency.toUpperCase()}'},{eventID:'${input.eventId}'});}`;
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
