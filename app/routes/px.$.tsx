/**
 * The first-party pixel.
 *
 * Meta's pixel normally loads from connect.facebook.net and reports to
 * www.facebook.com/tr. Both are on every blocklist that ships with an ad
 * blocker, and Safari's ITP treats them as third-party storage. The usual
 * damage is twenty to thirty percent of events never arriving, which shows up
 * as a pixel that under-reports purchases and an algorithm optimising on a
 * biased sample.
 *
 * So this Worker serves the pixel from our own domain:
 *
 *   /px/fbevents.js   Meta's script, with the endpoints inside it rewritten
 *                     to point back here
 *   /px/tr            the pixel's own reports, forwarded to www.facebook.com/tr
 *   /px/<file>.js     anything else the script pulls from connect.facebook.net
 *
 * Nothing is invented and nothing is filtered on the way through: the bytes
 * Meta sent are the bytes the browser runs, and the request the browser made
 * is the request Meta receives, plus the real client IP and user agent so the
 * event is attributed to the visitor rather than to Cloudflare.
 *
 * It must be impossible for this to cost a sale, so every failure path leads
 * back to Meta's own address: an upstream error redirects there, and the
 * loader tag in meta.server.ts has an onerror that loads the original script.
 */
import type { Route } from "./+types/px.$";

const SCRIPT_HOST = "https://connect.facebook.net";
const REPORT_URL = "https://www.facebook.com/tr";

/** An hour in the browser, a day at the edge. Meta ships fbevents.js daily. */
const SCRIPT_CACHE = "public, max-age=3600, s-maxage=86400";

/**
 * Which paths we will fetch from connect.facebook.net on the visitor's behalf.
 *
 * The pixel does not only load fbevents.js: once running it asks the same host
 * for /signals/config/<pixelId>, which is what carries the account's settings.
 * Rejecting that left the pixel half-initialised and silent — it is how this
 * was first found. So anything with a plain, traversal-free path is forwarded,
 * and nothing else is.
 */
function scriptPath(raw: string): string | null {
  // The script builds some of its own URLs by concatenation and produces a
  // double slash; Meta serves those, so we normalise rather than 404.
  const rest = raw.replace(/^\/+/, "");
  if (!rest) return null;
  if (!/^[A-Za-z0-9_\-./]+$/.test(rest) || rest.includes("..")) return null;
  // The browser asks for /px/fbevents.js; Meta keeps it under a locale.
  if (rest === "fbevents.js") return "/en_US/fbevents.js";
  return `/${rest}`;
}

/**
 * Point the script at us instead of at Meta.
 *
 * Only the two hostnames are touched. The script's logic, its version, its
 * behaviour are Meta's — we are changing the address on the envelope, not the
 * letter.
 */
function firstParty(source: string, origin: string): string {
  return source
    .split("https://www.facebook.com/tr")
    .join(`${origin}/px/tr`)
    .split("https://connect.facebook.net")
    .join(`${origin}/px`);
}

function headersFrom(request: Request): HeadersInit {
  const ua = request.headers.get("User-Agent");
  const ip = request.headers.get("CF-Connecting-IP");
  const out: Record<string, string> = {};
  if (ua) out["User-Agent"] = ua;
  // Meta reads the forwarded address for geo and for its own bot handling.
  if (ip) {
    out["X-Forwarded-For"] = ip;
    out["X-Real-IP"] = ip;
  }
  const referer = request.headers.get("Referer");
  if (referer) out["Referer"] = referer;
  const lang = request.headers.get("Accept-Language");
  if (lang) out["Accept-Language"] = lang;
  return out;
}

/** A transparent 1×1, the same answer Meta's own endpoint gives. */
const GIF = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

function pixelGif(): Response {
  return new Response(GIF, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
  });
}

async function report(request: Request, url: URL): Promise<Response> {
  const target = `${REPORT_URL}${url.search}`;
  try {
    const init: RequestInit = {
      method: request.method,
      headers: headersFrom(request),
      ...(request.method === "POST" ? { body: await request.arrayBuffer() } : {}),
    };
    const upstream = await fetch(target, init);
    // The browser never reads this body; it only needs a 200 that is not an
    // error in the console. Meta has the event either way.
    if (!upstream.ok && upstream.status >= 500) return pixelGif();
    return pixelGif();
  } catch {
    // A failed forward loses one event. It must not throw at the visitor.
    return pixelGif();
  }
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const rest = params["*"] ?? "";

  if (rest === "tr" || rest === "tr/") return report(request, url);

  const path = scriptPath(rest);
  if (!path) return new Response("Not found", { status: 404 });

  const target = `${SCRIPT_HOST}${path}${url.search}`;
  try {
    const upstream = await fetch(target, {
      headers: headersFrom(request),
      // Cloudflare's own cache, so one origin fetch serves every visitor.
      cf: { cacheTtl: 3600, cacheEverything: true },
    } as RequestInit);
    if (!upstream.ok) {
      // Meta is having a bad day, or the file moved. Send the browser to the
      // real thing rather than handing it a broken script.
      return Response.redirect(target, 302);
    }
    const type = upstream.headers.get("Content-Type") ?? "application/javascript; charset=utf-8";
    const source = await upstream.text();
    // The account's config is per-visit; only the script itself is cacheable.
    const cache = path.includes("/signals/") ? "no-store" : SCRIPT_CACHE;
    return new Response(firstParty(source, url.origin), {
      headers: { "Content-Type": type, "Cache-Control": cache },
    });
  } catch {
    return Response.redirect(target, 302);
  }
}

/** The pixel POSTs its larger payloads. Same forward, same address. */
export async function action({ request }: Route.ActionArgs) {
  const url = new URL(request.url);
  return report(request, url);
}
