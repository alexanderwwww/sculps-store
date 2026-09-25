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
import {
  LADDER_RUNGS,
  type LadderRung,
  cleanFbclid,
  isValidFbc,
  isValidFbp,
  newFbc,
  newFbp,
  shouldSendToCapi,
} from "./meta.signals";

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

/**
 * The custom rungs. Meta calls these "custom events": same API, same
 * deduplication, `trackCustom` instead of `track` in the browser. They are
 * what teaches the algorithm the difference between somebody who loaded the
 * page and somebody who was nearly out their card.
 */
export type MetaTrackName = MetaEventName | LadderRung;

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
  name: MetaTrackName,
  event: MetaEvent,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  /*
   * The bot filter. A crawler that renders JavaScript still tells us what it
   * is in its user agent, and an event with no user agent at all came from no
   * browser. Both are dropped before they can teach Meta to go and find more
   * of them. Purchase is never dropped — a card was charged, so a person was
   * there, whatever the header said.
   */
  if (!shouldSendToCapi(name, event.userAgent)) {
    return { ok: false, reason: "not a person: bot or missing user agent" };
  }
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

  /*
   * The PageView waits for a person.
   *
   * A pixel that fires on load fires for everything that runs JavaScript —
   * scrapers, preview crawlers, headless browsers — and Meta learns from that
   * pool: it goes looking for more of whoever it saw. Alex's call, 25 Sep
   * 2026, and he is right about the trade: a visitor who never scrolls, never
   * moves, never touches the screen was never going to buy, so teaching Meta
   * to find more of them is worse than not counting them at all.
   *
   * What counts as a person: a scroll, a pointer that moves, a touch, a key,
   * or a click. Touch is in there because most of this traffic is a phone,
   * where nothing moves a mouse and a scroll is the first thing that happens.
   *
   * `autoConfig` off first, or Meta's own automatic events fire before this
   * gate and defeat the whole thing.
   *
   * Two deliberate exceptions. A confirmation page fires at once — somebody
   * who has just paid is not in question, and waiting for them to wiggle the
   * mouse would lose the most valuable view on the site. And every other
   * event — AddToCart, InitiateCheckout, Purchase — is ungated everywhere,
   * because each one already required a human act to happen at all.
   */
  const gate = `(function(){var done=false,off=[];
function fire(){if(done)return;done=true;for(var i=0;i<off.length;i++){try{off[i]()}catch(e){}}${view}}
var paid=/thank|order-confirm|confirmation|success/i.test(location.pathname);
if(paid){fire();return}
var evs=['scroll','pointermove','pointerdown','touchstart','keydown','click','wheel'];
for(var i=0;i<evs.length;i++){(function(n){var h=function(){fire()};
window.addEventListener(n,h,{passive:true,once:true});
off.push(function(){window.removeEventListener(n,h,{passive:true})})})(evs[i])}})();`;

  /*
   * The loader, pointed at our own domain first.
   *
   * `/px/fbevents.js` is this Worker proxying Meta's script and rewriting the
   * endpoints inside it, so to the browser the whole pixel is first-party: no
   * third-party request to block, no seven-day cap on what it stores. Roughly
   * a fifth to a third of events were being lost to blockers before this.
   *
   * It has to be impossible for that proxy to cost a sale, so the tag carries
   * its own fallback: if our copy 404s, errors or is blocked, `onerror` loads
   * Meta's original from connect.facebook.net and the pixel behaves exactly as
   * it did before. The proxy route itself redirects to Meta on an upstream
   * failure, so there are two ways back to the old behaviour and none to a
   * broken page.
   */
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;t.onerror=function(){var r=b.createElement(e);r.async=!0;
r.src='https://connect.facebook.net/en_US/fbevents.js';
s.parentNode.insertBefore(r,s)};s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,
document,'script','/px/fbevents.js');
fbq('set','autoConfig',false,'${pixelId}');
${init}${gate}`;
}

/**
 * The browser half of any of the four events.
 *
 * It sends the same custom_data the server sends — same contents, same ids,
 * same count. When the two halves of a deduplicated pair disagree, Meta keeps
 * one of them and the match quality of the event drops; sending the same thing
 * twice is the whole point.
 */
export function metaCustomData(input: {
  valueCents: number;
  currency: string;
  contents: { id: string; quantity: number; itemPrice: number }[];
}): Record<string, unknown> {
  if (!input.contents.length) return {};
  return {
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
}

/**
 * Standard events go through `track`; the four custom rungs go through
 * `trackCustom`, which is the only difference Meta's pixel makes between them.
 * Sending a custom name through `track` gets it silently ignored.
 */
export function pixelVerb(name: MetaTrackName): "track" | "trackCustom" {
  return (LADDER_RUNGS as readonly string[]).includes(name) ? "trackCustom" : "track";
}

export function eventPixelScript(input: {
  name: MetaTrackName;
  eventId: string;
  valueCents: number;
  currency: string;
  contents: { id: string; quantity: number; itemPrice: number }[];
}): string {
  const customData = metaCustomData(input);
  return `if(window.fbq){fbq(${JSON.stringify(pixelVerb(input.name))},${JSON.stringify(input.name)},${JSON.stringify(customData)},{eventID:${JSON.stringify(input.eventId)}});}`;
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
  const now = Date.now();
  const out: string[] = [];

  // _fbc first: a click id in the URL always wins, because it is the freshest
  // proof of which ad this visit came from. Otherwise a valid existing cookie
  // is refreshed so its ninety days start again from today; an existing value
  // that is not in Meta's format is dropped rather than re-sent.
  const fbclid = cleanFbclid(url.searchParams.get("fbclid"));
  const fbc = fbclid ? newFbc(fbclid, now) : isValidFbc(have.fbc) ? have.fbc : null;
  if (fbc) out.push(`_fbc=${fbc}; Path=/; SameSite=Lax; Max-Age=${ninetyDays}${secure}`);

  // _fbp: ours if it is well formed, a new one if it is missing or mangled.
  const fbp = isValidFbp(have.fbp) ? have.fbp! : newFbp(now);
  out.push(`_fbp=${fbp}; Path=/; SameSite=Lax; Max-Age=${ninetyDays}${secure}`);

  return out;
}

/**
 * What the request carries. Anything that is not in Meta's format is treated
 * as absent — the Conversions API would rather have nothing than a value it
 * cannot parse, and a bad one drags the whole user_data block down with it.
 */
export function readMetaCookies(request: Request, url?: URL): { fbp: string | null; fbc: string | null } {
  const header = request.headers.get("Cookie");
  const fbclid = cleanFbclid(url?.searchParams.get("fbclid"));
  const fromClick = fbclid ? newFbc(fbclid) : null;

  let fbp: string | null = null;
  let fbc: string | null = null;
  if (header) {
    for (const part of header.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      const value = rest.join("=");
      if (key === "_fbp") fbp = value;
      if (key === "_fbc") fbc = value;
    }
  }
  // A click id on this very request is newer than a cookie from a past one.
  const resolvedFbc = fromClick ?? (isValidFbc(fbc) ? fbc : null);
  return { fbp: isValidFbp(fbp) ? fbp : null, fbc: resolvedFbc };
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
async function noteFailure(db: DB, storeId: string, name: MetaTrackName, reason: string): Promise<void> {
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
    name: MetaTrackName;
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
  // PageView has no contents by nature, and a ladder rung can legitimately
  // have none either (an Engaged signal away from the bundle box). Everything
  // else without contents would be a valueless event, which Meta cannot
  // optimise on.
  const contentless = input.name === "PageView" || (LADDER_RUNGS as readonly string[]).includes(input.name);
  if (!input.contents.length && !contentless) return null;

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
    name: MetaTrackName;
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
