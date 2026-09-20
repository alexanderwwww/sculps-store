/**
 * Address suggestions as the street is typed, the way Shopify's checkout
 * offers them. Photon (komoot) answers from OpenStreetMap: no key, no bill,
 * house numbers for US streets. Proxied through the Worker so the browser
 * never talks to a third party, cached at the edge per query.
 */
export interface AddressSuggestion {
  address1: string;
  city: string;
  /** a region code where the form uses a select (US states, CA provinces), else the name */
  region: string;
  postalCode: string;
  country: string;
  lat: number;
  lon: number;
  /** one line for the list */
  label: string;
}

const US_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE",
  nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};
const CA_CODES: Record<string, string> = {
  alberta: "AB", "british columbia": "BC", manitoba: "MB", "new brunswick": "NB", "newfoundland and labrador": "NL",
  "nova scotia": "NS", ontario: "ON", "prince edward island": "PE", quebec: "QC", québec: "QC", saskatchewan: "SK",
  "northwest territories": "NT", nunavut: "NU", yukon: "YT",
};

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    housenumber?: string; street?: string; name?: string; city?: string; town?: string; village?: string;
    state?: string; postcode?: string; countrycode?: string; osm_key?: string; osm_value?: string;
  };
}

export async function suggestAddress(query: string, country: string): Promise<AddressSuggestion[]> {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 4) return [];
  const cc = (country || "US").toUpperCase();
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`;

  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(`https://suggest.kerberos.internal/${cc}/${encodeURIComponent(q.toLowerCase())}`);
  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) return (await hit.json()) as AddressSuggestion[];
  }

  let out: AddressSuggestion[] = [];
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const body = (await res.json()) as { features?: PhotonFeature[] };
      const seen = new Set<string>();
      for (const f of body.features ?? []) {
        const p = f.properties;
        const fc = (p.countrycode ?? "").toUpperCase();
        // Only the country the customer chose: a street in another one is noise.
        if (fc !== cc) continue;
        const street = p.street ?? (p.osm_key === "highway" ? p.name : undefined);
        if (!street) continue;
        const address1 = [p.housenumber, street].filter(Boolean).join(" ");
        const city = p.city ?? p.town ?? p.village ?? "";
        const stateName = (p.state ?? "").toLowerCase();
        const region = cc === "US" ? US_CODES[stateName] ?? p.state ?? "" : cc === "CA" ? CA_CODES[stateName] ?? p.state ?? "" : p.state ?? "";
        const postalCode = p.postcode ?? "";
        const label = [address1, city, region, postalCode].filter(Boolean).join(", ");
        if (seen.has(label)) continue;
        seen.add(label);
        out.push({ address1, city, region, postalCode, country: cc, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label });
        if (out.length >= 5) break;
      }
    }
  } catch {
    out = [];
  }
  if (cache) {
    await cache
      .put(key, new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": `max-age=${out.length ? 60 * 60 * 24 * 7 : 60 * 10}` } }))
      .catch(() => undefined);
  }
  return out;
}
