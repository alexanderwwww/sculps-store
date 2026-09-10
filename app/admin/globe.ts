/**
 * Bridge between React and the approved globe (`public/shop-globe.js`).
 *
 * The globe file is signed off and is not edited. It defines `window.ShopGlobe`
 * only, has no destroy method, and keeps an animation loop running forever, so
 * one instance is kept for the life of the tab and re-pointed at whichever
 * canvas is on screen. Mounting twice would stack two loops.
 */

export interface GlobeEvent {
  type: "visitor" | "cart" | "checkout" | "order" | "leave";
  id: string;
  lat?: number | null;
  lon?: number | null;
  city?: string;
  amount?: number;
}

export interface GlobeInstance {
  push(event: GlobeEvent): void;
  stats(): { visitors: number; carts: number; checkout: number };
  setZoom(zoom: number): void;
  reset(): void;
  lookAt(lat: number, lon: number): void;
  zoom: number;
  markers: Map<string, unknown>;
  canvas: HTMLCanvasElement;
  _resize(): void;
}

declare global {
  interface Window {
    ShopGlobe?: {
      mount(canvas: HTMLCanvasElement, options: Record<string, unknown>): GlobeInstance;
    };
    __kerberosGlobe?: GlobeInstance;
  }
}

/** The DB event vocabulary is not the globe's. This is the only translation. */
export const GLOBE_TYPE: Record<string, GlobeEvent["type"]> = {
  view: "visitor",
  cart: "cart",
  checkout: "checkout",
  purchase: "order",
  leave: "leave",
};

function loadScript(): Promise<void> {
  if (window.ShopGlobe) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-shop-globe]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Globe script failed.")));
      return;
    }
    const script = document.createElement("script");
    script.src = "/shop-globe.js";
    script.async = true;
    script.dataset.shopGlobe = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Globe script failed."));
    document.head.appendChild(script);
  });
}

/**
 * Mounts the globe on the canvas, or reuses the existing instance.
 *
 * Reuse works by moving the canvas: the vendor instance holds a reference to
 * the canvas it was created with, so that canvas is kept alive and re-parented
 * into the new pane rather than creating a second instance.
 */
export async function mountGlobe(pane: HTMLElement): Promise<GlobeInstance> {
  await loadScript();

  let globe = window.__kerberosGlobe;
  if (!globe) {
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      width: "100%",
      height: "100%",
      display: "block",
      cursor: "grab",
      touchAction: "none",
    });
    pane.appendChild(canvas);
    globe = window.ShopGlobe!.mount(canvas, {
      // Sound is owned by React so mute and volume can be honoured.
      soundUrl: null,
    });
    window.__kerberosGlobe = globe;
  } else if (globe.canvas.parentElement !== pane) {
    pane.appendChild(globe.canvas);
  }

  // Back to the design's start position every time the screen is opened.
  // The instance is kept alive across visits and its idle spin never stops, so
  // without this the globe is showing whatever ocean it drifted to since the
  // last visit instead of the United States the design opens on.
  globe.reset();

  // The vendor file only listens to window resize.
  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  return globe;
}
