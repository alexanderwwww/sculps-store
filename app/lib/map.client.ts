/**
 * One small map with one pin, for the checkout and the thank-you page.
 *
 * Vector tiles from OpenFreeMap: no API key, no watermark, no per-view bill,
 * and the "positron" style is the clean pale look the shop wanted. MapLibre
 * is loaded on demand so nobody pays for it until an address exists.
 */
export type PinMap = {
  setPoint(lat: number, lon: number, zoom?: number): void;
  onDrag(cb: (lat: number, lon: number) => void): void;
  destroy(): void;
};

// The worker is a separate file MapLibre finds next to itself; the bundler
// only ships it when asked, so it is imported as an asset and handed over.
import workerHref from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export async function mountPinMap(
  el: HTMLElement,
  lat: number,
  lon: number,
  opts: { draggable?: boolean; interactive?: boolean; zoom?: number } = {},
): Promise<PinMap> {
  const maplibre = await import("maplibre-gl");
  maplibre.setWorkerUrl(workerHref);
  const map = new maplibre.Map({
    container: el,
    style: MAP_STYLE,
    center: [lon, lat],
    zoom: opts.zoom ?? 15.5,
    interactive: opts.interactive ?? true,
    attributionControl: { compact: true },
    scrollZoom: false,
    dragRotate: false,
    pitchWithRotate: false,
  });
  // MapLibre positions the marker element with its own transform, so the
  // rotated dot lives inside a plain wrapper it can move freely.
  // The credit starts unfolded across the map; fold it to its "i" once the
  // map is up. It is still one tap away, which is what the licence asks.
  map.once("load", () => el.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
  const pin = document.createElement("div");
  pin.className = "gb-map__pin";
  pin.innerHTML = '<span class="gb-map__dot"></span>';
  const marker = new maplibre.Marker({ element: pin, anchor: "bottom", draggable: opts.draggable ?? false })
    .setLngLat([lon, lat])
    .addTo(map);
  return {
    setPoint(la, lo, zoom) {
      marker.setLngLat([lo, la]);
      map.easeTo({ center: [lo, la], zoom: zoom ?? map.getZoom() });
    },
    onDrag(cb) {
      marker.on("dragend", () => { const p = marker.getLngLat(); cb(p.lat, p.lng); });
    },
    destroy() { map.remove(); },
  };
}
