/**
 * Visitor tracking for Live View and Analytics.
 *
 * One row per visitor action in the `events` table. Location comes from
 * Cloudflare's own view of the request (city, region, country, lat/lon),
 * which is what puts a dot on the globe without asking the visitor anything.
 *
 * Recording never blocks the page. It is handed to `ctx.waitUntil`, so a slow
 * database write cannot make a customer wait, and a failed one is lost rather
 * than surfaced — a missing dot on the globe is the acceptable failure here.
 */
import type { DB } from "~/db/client";
import { events } from "~/db/schema";

const SESSION_COOKIE = "kerberos_visit";
const SESSION_DAYS = 30;

export interface Geo {
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
}

/** Reads the geolocation Cloudflare attaches to every request at the edge. */
export function geoFromRequest(request: Request): Geo {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};
  const num = (value: unknown) => {
    const n = typeof value === "string" ? Number(value) : (value as number);
    return Number.isFinite(n) ? n : null;
  };
  return {
    city: (cf.city as string) ?? null,
    region: (cf.region as string) ?? (cf.regionCode as string) ?? null,
    country: (cf.country as string) ?? null,
    lat: num(cf.latitude),
    lon: num(cf.longitude),
  };
}

export function readVisitorSession(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function newVisitorSession(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function visitorCookie(sessionId: string, url: URL): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

/** Bots and the admin's own preview must not show up as customers. */
export function shouldTrack(request: Request, url: URL): boolean {
  if (url.searchParams.has("preview")) return false;
  const ua = request.headers.get("User-Agent") ?? "";
  if (!ua || /bot|crawl|spider|slurp|preview|lighthouse|headless/i.test(ua)) return false;
  return true;
}

/**
 * Desktop, mobile or tablet, from the user agent.
 *
 * Shopify splits sessions this way on the Online Store screen, and an ad
 * account that cannot see its mobile share is flying blind. The test is the
 * conservative one: anything that says it is a tablet is a tablet, anything
 * that says it is a phone is mobile, everything else is desktop.
 */
export function deviceFromRequest(request: Request): "desktop" | "mobile" | "tablet" {
  const ua = request.headers.get("User-Agent") ?? "";
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) return "mobile";
  return "desktop";
}

export interface TrackInput {
  storeId: string;
  sessionId: string;
  type: "view" | "cart" | "checkout" | "purchase" | "leave";
  path: string;
  geo: Geo;
  source?: string | null;
  campaign?: string | null;
  amountCents?: number | null;
  orderId?: string | null;
  device?: "desktop" | "mobile" | "tablet" | null;
}

export function track(db: DB, ctx: ExecutionContext, input: TrackInput): void {
  const write = db
    .insert(events)
    .values({
      storeId: input.storeId,
      type: input.type,
      sessionId: input.sessionId,
      path: input.path,
      city: input.geo.city,
      region: input.geo.region,
      country: input.geo.country,
      lat: input.geo.lat,
      lon: input.geo.lon,
      source: input.source ?? null,
      campaign: input.campaign ?? null,
      device: input.device ?? null,
      amountCents: input.amountCents ?? null,
      orderId: input.orderId ?? null,
    })
    .catch(() => undefined);
  ctx.waitUntil(write);
}

/** Pulls the ad attribution out of the URL the visitor landed on. */
export function attribution(url: URL): { source: string | null; campaign: string | null } {
  return {
    source: url.searchParams.get("utm_source") || (url.searchParams.get("fbclid") ? "facebook" : null),
    campaign: url.searchParams.get("utm_campaign"),
  };
}
