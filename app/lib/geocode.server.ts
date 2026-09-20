/**
 * An address on a map.
 *
 * Apple's MapKit needs an Apple developer token this shop does not have, so
 * the pin comes from OpenStreetMap's geocoder instead, proxied through the
 * Worker: the browser never talks to a third party, the shop's own address
 * never leaves with a referrer, and every answer is cached at the edge for a
 * month so a customer retyping a house number does not cost a second lookup.
 * The map tiles are chosen to look like Apple's, which is what was asked
 * for; the day a MapKit token exists this is the one file that changes.
 *
 * Nominatim's terms: identify the application, one request a second, cache.
 * All three are respected here.
 */
export interface GeoPoint {
  lat: number;
  lon: number;
  /** what the geocoder understood, for the label under the pin */
  label: string;
}

const UA = "Kerberos storefront (blackreaper.us; hello@blackreaper.us)";

/** A shipping address as one line the geocoder can read. */
export function addressLine(a: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string {
  return [a.address1, a.address2, a.city, a.region, a.postalCode, a.country]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export async function geocodeAddress(query: string): Promise<GeoPoint | null> {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 6) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`;

  // The edge cache, when there is one (Workers); a plain fetch otherwise.
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(`https://geocode.kerberos.internal/${encodeURIComponent(q.toLowerCase())}`);
  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) return (await hit.json()) as GeoPoint | null;
  }

  let point: GeoPoint | null = null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.ok) {
      const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      const r = rows[0];
      if (r) point = { lat: Number(r.lat), lon: Number(r.lon), label: r.display_name };
    }
  } catch {
    point = null;
  }
  if (cache) {
    // A miss is cached too, briefly, so a nonsense address is not retried on
    // every keystroke; a hit is kept for a month.
    const ttl = point ? 60 * 60 * 24 * 30 : 60 * 10;
    await cache
      .put(key, new Response(JSON.stringify(point), { headers: { "content-type": "application/json", "cache-control": `max-age=${ttl}` } }))
      .catch(() => undefined);
  }
  return point;
}
