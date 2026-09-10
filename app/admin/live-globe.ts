/**
 * The design's own globe renderer.
 *
 * This is a transliteration of `design/port/globe-renderer.js`, which was cut
 * verbatim out of `design/prototype/Shop Admin.dc.html`. Every numeric
 * constant, colour string, gradient stop, alpha and multiplier in the draw
 * loop is copied character for character from that file. Nothing here was
 * chosen; if a number looks arbitrary it is because it is the design's number.
 *
 * What changed, and only this:
 *   - `this.globeRef.current` becomes the canvas passed to `mountLiveGlobe`.
 *   - `this.state.visitors` becomes `this.visitors`, fed by `push()` from the
 *     route's real database feed. No simulated traffic exists in this file.
 *   - `this.state.route.screen !== 'live'` is dropped: this module is mounted
 *     only while the Live View screen is on screen, and `destroy()` stops it.
 *   - `this.isAll()` / `this.state.storeId` scoping is dropped: the route
 *     mounts one globe per store and only pushes that store's events, so the
 *     scope filter would always pass.
 *
 * `window.ShopGlobe.isLand` (from `public/shop-globe.js`) is still used —
 * `buildTiles` depends on it and that land raster is verified Natural Earth
 * data its own header says never to regenerate. The vendor globe itself is no
 * longer mounted.
 */

export interface GlobeEvent {
  type: "visitor" | "cart" | "checkout" | "order" | "leave";
  id: string;
  lat?: number | null;
  lon?: number | null;
  city?: string;
  amount?: number;
}

export interface GlobeTip {
  label: string;
  amount: string;
  x: number;
  y: number;
}

export interface LiveGlobeHandle {
  push(event: GlobeEvent): void;
  reset(): void;
  clear(): void;
  lookAt(lat: number, lon: number): void;
  setZoom(zoom: number): void;
  destroy(): void;
  readonly zoom: number;
}

export interface LiveGlobeOptions {
  /** Hover hit-testing feeds the design's tooltip through this. */
  onTip?: (tip: GlobeTip | null) => void;
}

declare global {
  interface Window {
    ShopGlobe?: { isLand?(lat: number, lon: number): boolean };
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

/** `[city, region, lon, lat]` — the design's own city tuple shape. */
type City = [string, string, number, number];

type Stage = "view" | "cart" | "checkout" | "purchase" | "leaving";

interface Visitor {
  id: string;
  city: City;
  stage: Stage;
  at: number;
  ti?: number;
  ph?: number;
}

interface Tile { lon: number; lat: number; land: boolean }
interface Wave { lon: number; lat: number; col: string; dur: number; max: number; born: number }
interface Arc { lon1: number; lat1: number; lon2: number; lat2: number; born: number; dur: number }
interface Pulse { lon: number; lat: number; born: number; dur: number }
interface Ring { lon: number; lat: number; color: string; born: number; dur: number; max: number; w: number }
interface Hit { x: number; y: number; r: number; city: City; stage: Stage }
interface GlassCard { id: string; title: string; sub: string; tone?: string; email?: string }

class LiveGlobe {
  canvas: HTMLCanvasElement;
  onTip: (tip: GlobeTip | null) => void;

  rot = { lam: 98, phi: 38 };
  zoom = 1;
  dragging = false;

  visitors: Visitor[] = [];
  glassCards: GlassCard[] = [];
  waves: Wave[] = [];
  tileHits: { lon: number; lat: number; born: number }[] = [];
  arcs: Arc[] = [];
  pulses: Pulse[] = [];
  rings: Ring[] = [];
  ringQ: Ring[] = [];
  hit: Hit[] = [];
  lastAmount = "";

  tiles: Tile[] | null = null;
  dotPts: Tile[] | null = null;
  tvec: number[][] | null = null;
  sprites: { land: HTMLCanvasElement[]; sea: HTMLCanvasElement[] } | null = null;
  spriteHr = 0;

  private tip: GlobeTip | null = null;
  private _raf = 0;
  private _slow: ReturnType<typeof setTimeout> | null = null;
  private _lastFrame = 0;
  private _stopped = false;
  private _timers: ReturnType<typeof setTimeout>[] = [];
  private _release: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, options: LiveGlobeOptions) {
    this.canvas = canvas;
    this.onTip = options.onTip ?? (() => undefined);
    this.bindPointer();
    this.startGlobe();
  }

  reduced() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } }

  // ---------------------------------------------------------------- source

  glass(lon: number, lat: number, title: string, sub: string, tone?: string, email?: string) {
    const id = "gc" + Date.now() + Math.random();
    this.glassCards = [...this.glassCards.slice(-2), { id, title, sub, tone, email }];
    this._timers.push(setTimeout(() => { this.glassCards = this.glassCards.filter(c => c.id !== id); }, 3600));
  }

  wave(lon: number, lat: number, col: string, dur: number, max: number) { if (this.reduced()) return; this.waves = this.waves || []; if (this.waves.length > 5) this.waves.shift(); this.waves.push({ lon, lat, col, dur, max, born: performance.now() }); }

  tileFlash(city: City) { this.tileHits = this.tileHits || []; this.tileHits.push({ lon: city[2], lat: city[3], born: performance.now() }); }

  buildTiles(stepDeg: number): Tile[] {
    const pts: Tile[] = [];
    for (let lat = -78; lat <= 78; lat += stepDeg) {
      const circ = Math.cos(lat * Math.PI / 180);
      const n = Math.max(6, Math.round((360 / stepDeg) * circ));
      const off = (Math.round((lat + 78) / stepDeg) % 2) ? (360 / n) / 2 : 0;
      for (let k = 0; k < n; k++) {
        const lon = -180 + off + k * (360 / n);
        const land = (window.ShopGlobe && window.ShopGlobe.isLand) ? !!window.ShopGlobe.isLand(lat, lon) : false;
        pts.push({ lon, lat, land });
      }
    }
    return pts;
  }

  startGlobe() {
    const draw = () => {
      const cv0 = this.canvas;
      if (this._stopped) return;
      if (!cv0 || !cv0.isConnected) { this._slow = setTimeout(draw, 400); return; }
      this._raf = requestAnimationFrame(draw);
      const tNow = performance.now();
      if (this._lastFrame && tNow - this._lastFrame < 30) return;
      this._lastFrame = tNow;
      const cv = cv0;
      if (!this.tiles) { if (!(window.ShopGlobe && window.ShopGlobe.isLand)) return; this.tiles = this.buildTiles(1.25); this.dotPts = this.tiles; }
      const tiles = this.tiles;
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const red = this.reduced();
      if (!this.dragging && !red) this.rot.lam -= 0.03;
      const R = Math.min(w, h) * 0.46 * this.zoom, cx = w * 0.52, cy = h / 2;
      const D = Math.PI / 180, t = this.rot.phi * D, ct = Math.cos(t), stt = Math.sin(t);
      const proj = (lon: number, lat: number) => { const lamR = (lon + this.rot.lam) * D, phiR = lat * D;
        const x1 = Math.cos(phiR) * Math.sin(lamR), y1 = Math.sin(phiR), z1 = Math.cos(phiR) * Math.cos(lamR);
        return { x: cx + x1 * R, y: cy - (y1 * ct - z1 * stt) * R, z: y1 * stt + z1 * ct }; };
      // soft purple bloom on the white page
      const bloom = g.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.30);
      bloom.addColorStop(0, "rgba(109,61,245,.20)"); bloom.addColorStop(.5, "rgba(109,61,245,.07)"); bloom.addColorStop(1, "rgba(109,61,245,0)");
      g.fillStyle = bloom; g.beginPath(); g.arc(cx, cy, R * 1.30, 0, 6.284); g.fill();
      // dark violet glass body, lit upper-left
      const body = g.createRadialGradient(cx - R * .40, cy - R * .44, R * .04, cx + R * .26, cy + R * .34, R * 1.32);
      body.addColorStop(0, "#5A4699"); body.addColorStop(.16, "#43336F"); body.addColorStop(.34, "#2A2052");
      body.addColorStop(.5, "#34285F"); body.addColorStop(.66, "#1D1439"); body.addColorStop(.84, "#221845"); body.addColorStop(1, "#0A0618");
      g.fillStyle = body; g.beginPath(); g.arc(cx, cy, R, 0, 6.284); g.fill();
      const sheen = g.createLinearGradient(cx - R * .7, cy - R * .7, cx + R * .5, cy + R * .8);
      sheen.addColorStop(0, "rgba(255,255,255,.10)"); sheen.addColorStop(.28, "rgba(255,255,255,.02)");
      sheen.addColorStop(.55, "rgba(190,170,255,.06)"); sheen.addColorStop(.8, "rgba(255,255,255,0)");
      g.fillStyle = sheen; g.beginPath(); g.arc(cx, cy, R, 0, 6.284); g.fill();
      // glass rim light + inner shadow
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 6.284); g.clip();
      const rim = g.createRadialGradient(cx, cy, R * 0.86, cx, cy, R);
      rim.addColorStop(0, "rgba(167,139,250,0)"); rim.addColorStop(.82, "rgba(167,139,250,.16)"); rim.addColorStop(1, "rgba(214,199,255,.55)");
      g.fillStyle = rim; g.beginPath(); g.arc(cx, cy, R, 0, 6.284); g.fill();
      g.restore();
      // faint graticule
      g.strokeStyle = "rgba(196,181,253,.10)"; g.lineWidth = 1;
      for (let lat = -60; lat <= 60; lat += 30) { g.beginPath(); let on = false;
        for (let lon = -180; lon <= 180; lon += 4) { const p = proj(lon, lat); if (p.z > 0) { on ? g.lineTo(p.x, p.y) : (g.moveTo(p.x, p.y), on = true); } else on = false; } g.stroke(); }
      for (let lon = -180; lon < 180; lon += 30) { g.beginPath(); let on = false;
        for (let lat = -78; lat <= 78; lat += 4) { const p = proj(lon, lat); if (p.z > 0) { on ? g.lineTo(p.x, p.y) : (g.moveTo(p.x, p.y), on = true); } else on = false; } g.stroke(); }
      const now = performance.now();
      this.tileHits = (this.tileHits || []).filter(x => now - x.born < 320);
      const hr = R * 0.0122;
      if (!this.sprites || Math.abs((this.spriteHr || 0) - hr) > 0.25) {
        this.spriteHr = hr; this.sprites = { land: [], sea: [] };
        const mk = (rgb: string, alpha: number) => { const size = Math.max(4, Math.ceil(hr * 2.6)), cvs = document.createElement("canvas");
          cvs.width = size; cvs.height = size; const c2 = cvs.getContext("2d")!; const cc = size / 2, rad = hr;
          c2.beginPath(); for (let k = 0; k < 6; k++) { const ang = k * 1.0471976 + 0.5236, px = cc + rad * Math.cos(ang), py = cc + rad * Math.sin(ang); k ? c2.lineTo(px, py) : c2.moveTo(px, py); }
          c2.closePath(); c2.fillStyle = "rgba(" + rgb + "," + alpha.toFixed(3) + ")"; c2.fill(); return cvs; };
        for (let b = 0; b < 10; b++) { this.sprites.land.push(mk("226,220,255", 0.28 + b * 0.072)); this.sprites.sea.push(mk("150,135,215", 0.05 + b * 0.011)); }
      }
      const sprites = this.sprites;
      const spr = (set: HTMLCanvasElement[], bucket: number, x: number, y: number, scl: number) => { const img = set[bucket], sz = Math.max(2, hr * 2.6 * scl);
        g.drawImage(img, x - sz / 2, y - sz / 2, sz, sz); };
      const hex = (x: number, y: number, rad: number) => { g.beginPath();
        for (let k = 0; k < 6; k++) { const a = k * 1.0471976 + 0.5236, px = x + rad * Math.cos(a), py = y + rad * Math.sin(a); k ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.closePath(); };
      // unit vectors once, so event maths is cheap
      if (!this.tvec) { const DD = Math.PI / 180;
        this.tvec = tiles.map(p => { const la = p.lat * DD, lo = p.lon * DD, cl = Math.cos(la);
          return [cl * Math.cos(lo), Math.sin(la), cl * Math.sin(lo)]; }); }
      const tvec = this.tvec;
      const vec = (lon: number, lat: number) => { const DD = Math.PI / 180, la = lat * DD, lo = lon * DD, cl = Math.cos(la); return [cl * Math.cos(lo), Math.sin(la), cl * Math.sin(lo)]; };
      const SC = { view: [77, 163, 255], cart: [255, 154, 224], checkout: [255, 87, 200], purchase: [255, 47, 185] };
      void SC;
      // one owner tile per marker
      const owners: Visitor[] = [];
      this.visitors.forEach(vv => {
        if (vv.ti == null) { const t2 = vec(vv.city[2], vv.city[3]); let bi = -1, bd = -2;
          for (let i = 0; i < tvec.length; i++) { if (!tiles[i].land) continue;
            const d = tvec[i][0] * t2[0] + tvec[i][1] * t2[1] + tvec[i][2] * t2[2];
            if (d > bd) { bd = d; bi = i; } }
          vv.ti = bi; }
        owners.push(vv); });
      const ownerOf: Record<number, Visitor> = {}; owners.forEach(vv => { if (vv.ti! >= 0) ownerOf[vv.ti!] = vv; });
      // hex ripples: a wave of lit tiles spreading out from an event
      this.waves = (this.waves || []).filter(x => now - x.born < x.dur);
      // liquid swell: a soft dome of light that rises and settles — no shockwave band
      const waves = this.waves.map(x => { const k = Math.min(1, (now - x.born) / x.dur);
        const rise = k < 0.22 ? k / 0.22 : 1, settle = k < 0.22 ? 1 : 1 - (k - 0.22) / 0.78;
        const ease = Math.sin(Math.min(1, rise) * Math.PI / 2) * (settle * settle);
        return { v: vec(x.lon, x.lat), cosR: Math.cos((x.max * (0.35 + 0.65 * rise)) * Math.PI / 180), amp: ease, col: x.col }; });
      void waves;
      const MRGB: Record<string, string> = { view: "96,190,255", leaving: "96,190,255", cart: "255,105,205", checkout: "255,87,200", purchase: "255,20,170" };
      const picked: Record<number, { rgb: string; amp: number; stage: Stage }> = {};
      this.visitors.forEach(vv => {
        if (vv.ti == null) { const t2 = vec(vv.city[2], vv.city[3]); let bi = -1, bd = -2;
          for (let i2 = 0; i2 < tvec.length; i2++) { if (!tiles[i2].land) continue;
            const d = tvec[i2][0] * t2[0] + tvec[i2][1] * t2[1] + tvec[i2][2] * t2[2];
            if (d > bd) { bd = d; bi = i2; } }
          vv.ti = bi; }
        if (vv.ti! < 0) return;
        const age = now - (vv.at || now);
        let amp = 1;
        if (vv.stage === "view") amp = 0.8 + 0.2 * (0.5 - 0.5 * Math.cos((now / 1600) + (vv.ph || (vv.ph = Math.random() * 6))));
        else if (vv.stage === "purchase") { const k = Math.min(1, age / 2400); amp = 0.55 + 0.45 * Math.abs(Math.cos(k * Math.PI * 2.5)) * (1 - k); }
        else if (vv.stage === "leaving") amp = Math.max(0, 1 - age / 400);
        picked[vv.ti!] = { rgb: MRGB[vv.stage] || MRGB.view, amp, stage: vv.stage }; });
      for (let i = 0; i < tiles.length; i++) {
        const p = tiles[i], q = proj(p.lon, p.lat);
        if (q.z <= 0.02) continue;
        const depth = 0.45 + 0.55 * q.z;
        void depth;
        const scale = (0.65 + 0.35 * q.z) * 0.86;
        const pk = picked[i];
        if (pk) {
          g.shadowColor = "rgba(" + pk.rgb + "," + (0.5 + 0.45 * pk.amp).toFixed(2) + ")";
          g.shadowBlur = (pk.stage === "purchase" ? 13 : 7) * (0.55 + 0.45 * pk.amp);
          g.fillStyle = "rgba(" + pk.rgb + "," + Math.min(1, 0.72 + 0.28 * q.z).toFixed(3) + ")";
          hex(q.x, q.y, hr * scale * 1.3); g.fill(); g.shadowBlur = 0;
          g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 0.9; g.stroke();
          continue;
        }
        const bk = Math.max(0, Math.min(9, Math.round(q.z * 9)));
        if (p.land) spr(sprites.land, bk, q.x, q.y, scale);
        else spr(sprites.sea, bk, q.x, q.y, scale * 0.92);
      }
      // specular highlight (glass)
      const spec = g.createRadialGradient(cx - R * .42, cy - R * .46, 0, cx - R * .42, cy - R * .46, R * .62);
      spec.addColorStop(0, "rgba(255,255,255,.20)"); spec.addColorStop(.45, "rgba(255,255,255,.06)"); spec.addColorStop(1, "rgba(255,255,255,0)");
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 6.284); g.clip(); g.fillStyle = spec; g.fillRect(cx - R, cy - R, R * 2, R * 2); g.restore();
      // rings
      this.rings = (this.rings || []).filter(r => now - r.born < r.dur);
      this.ringQ = this.ringQ || [];
      while (this.rings.filter(r => r.born <= now).length < 4 && this.ringQ.length) { const it = this.ringQ.shift()!; it.born = now; this.rings.push(it); }
      // one hairline glass ring that opens slowly and dissolves — nothing else

      // glowing arc: purchase city → the store in New York
      this.arcs = (this.arcs || []).filter(a => now - a.born < a.dur + 700);
      this.pulses = (this.pulses || []).filter(p2 => now - p2.born < p2.dur);
      // crisp celestial glow above the point of sale — drawn over the sphere, never on the tiles
      this.pulses.forEach(pu => { const q = proj(pu.lon, pu.lat); if (q.z <= 0.02) return;
        const k = Math.min(1, (now - pu.born) / pu.dur);
        const grow = 1 - Math.pow(1 - k, 3), fade = k < .1 ? k / .1 : 1 - (k - .1) / .9;
        const rad = 3 + grow * 26, al = Math.max(0, fade);
        const gl = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad * 1.5);
        gl.addColorStop(0, "rgba(255,255,255," + (0.5 * al).toFixed(3) + ")");
        gl.addColorStop(.35, "rgba(255,20,170," + (0.22 * al).toFixed(3) + ")");
        gl.addColorStop(1, "rgba(255,20,170,0)");
        g.fillStyle = gl; g.beginPath(); g.arc(q.x, q.y, rad * 1.5, 0, 6.284); g.fill();
        g.strokeStyle = "rgba(255,255,255," + (0.8 * al).toFixed(3) + ")"; g.lineWidth = 1.1;
        g.shadowColor = "rgba(255,20,170,.9)"; g.shadowBlur = 10 * al;
        g.beginPath(); g.arc(q.x, q.y, rad, 0, 6.284); g.stroke(); g.shadowBlur = 0; });
      this.arcs.forEach(a => {
        const k = Math.min(1, (now - a.born) / a.dur), tail = Math.max(0, k - 0.26);
        const gc = (t2: number) => { // great-circle interpolation, lifted off the surface
          const p1 = vec(a.lon1, a.lat1), p2 = vec(a.lon2, a.lat2);
          const dot = Math.max(-1, Math.min(1, p1[0]*p2[0] + p1[1]*p2[1] + p1[2]*p2[2])), om = Math.acos(dot);
          const s1 = Math.sin((1 - t2) * om) / (Math.sin(om) || 1), s2 = Math.sin(t2 * om) / (Math.sin(om) || 1);
          const x = p1[0]*s1 + p2[0]*s2, y = p1[1]*s1 + p2[1]*s2, z = p1[2]*s1 + p2[2]*s2;
          const len = Math.hypot(x, y, z) || 1, lift = 1 + 0.17 * Math.sin(t2 * Math.PI);
          const lamR = Math.atan2(z / len, x / len) * 180 / Math.PI, phiR = Math.asin(y / len) * 180 / Math.PI;
          const q2 = proj(lamR - this.rot.lam, phiR);
          return { x: cx + (q2.x - cx) * lift, y: cy + (q2.y - cy) * lift, z: q2.z };
        };
        const N = 44, pts: { x: number; y: number; z: number }[] = [];
        for (let i2 = 0; i2 <= N; i2++) { const t2 = tail + (k - tail) * (i2 / N); if (t2 < 0) continue; pts.push(gc(t2)); }
        if (pts.length < 2) return;
        const fade = now - a.born > a.dur ? Math.max(0, 1 - (now - a.born - a.dur) / 700) : 1;
        for (let pass = 0; pass < 2; pass++) {
          g.beginPath(); let started = false;
          pts.forEach(p2 => { if (p2.z <= -0.25) { started = false; return; } if (!started) { g.moveTo(p2.x, p2.y); started = true; } else g.lineTo(p2.x, p2.y); });
          g.strokeStyle = pass === 0 ? "rgba(255,20,170," + (0.22 * fade).toFixed(3) + ")" : "rgba(255,140,225," + (0.95 * fade).toFixed(3) + ")";
          g.lineWidth = pass === 0 ? 7 : 1.8; g.lineCap = "round";
          if (pass === 0) { g.shadowColor = "rgba(255,20,170,.85)"; g.shadowBlur = 16; } else g.shadowBlur = 0;
          g.stroke(); g.shadowBlur = 0;
        }
        const head = pts[pts.length - 1], prev = pts[pts.length - 2];
        if (head && prev && head.z > -0.25) {
          const ang = Math.atan2(head.y - prev.y, head.x - prev.x);
          g.save(); g.translate(head.x, head.y); g.rotate(ang);
          g.fillStyle = "rgba(255,255,255," + fade.toFixed(2) + ")";
          g.shadowColor = "rgba(255,20,170,.9)"; g.shadowBlur = 12;
          g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, 3.2); g.lineTo(-2, 0); g.lineTo(-4, -3.2); g.closePath(); g.fill();
          g.restore(); g.shadowBlur = 0;
        }
      });

      this.hit = [];
      const M: Record<string, string> = { view: "#0EA5E9", leaving: "#0EA5E9", cart: "#FF9AE0", checkout: "#FF57C8", purchase: "#FF2FB9" };
      this.visitors.forEach(vv => {
        const q = proj(vv.city[2], vv.city[3]); if (q.z <= 0.02) return;
        const age = now - (vv.at || now), col = M[vv.stage] || M.view;
        void col;
        let rr = vv.stage === "purchase" ? (age < 200 ? 7 - 1.5 * (age / 200) : 5.5) : vv.stage === "checkout" ? 6 : 4;
        let op = 1;
        if (vv.stage === "leaving") { const k = Math.min(1, age / 400); rr = 4 * (1 - k); op = 1 - k; }
        else if (age < 250) op = age / 250;
        void op;
        if (rr <= 0.2) return;
        if (!red && vv.stage === "checkout") { g.save(); g.translate(q.x, q.y); g.rotate((now / 3000) * 6.283);
          g.strokeStyle = "rgba(255,87,200,.95)"; g.lineWidth = 1.4; g.setLineDash([3, 4]);
          g.beginPath(); for (let k2 = 0; k2 < 6; k2++) { const ang = k2 * 1.0471976 + 0.5236, rad = hr * 2.1; const px = rad * Math.cos(ang), py = rad * Math.sin(ang); k2 ? g.lineTo(px, py) : g.moveTo(px, py); }
          g.closePath(); g.stroke(); g.setLineDash([]); g.restore(); }

        this.hit.push({ x: q.x, y: q.y, r: Math.max(9, rr + 5), city: vv.city, stage: vv.stage });
      });
    };
    cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(draw);
  }

  // ------------------------------------------------------- input, as wired
  // in `design/port/live.html`: globeDown / globeMove / globeLeave /
  // globeWheel / globeReset, with the design's own constants.

  private bindPointer() {
    const cv = this.canvas;

    const down = (e: MouseEvent) => { this.dragging = true; const sx = e.clientX, sy = e.clientY, l0 = this.rot.lam, p0 = this.rot.phi;
      const mv = (ev: MouseEvent) => { ev.preventDefault(); this.rot.lam = l0 + (ev.clientX - sx) * 0.24; this.rot.phi = Math.max(-72, Math.min(72, p0 + (ev.clientY - sy) * 0.18)); };
      const up = () => { this.dragging = false; window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
      this._release.push(up); };

    const move = (e: MouseEvent) => { const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const hitList = this.hit || []; let found: Hit | null = null;
      for (let i = 0; i < hitList.length; i++) { const hh = hitList[i];
        if ((hh.x - mx) * (hh.x - mx) + (hh.y - my) * (hh.y - my) <= hh.r * hh.r) { found = hh; break; } }
      const cur = this.tip;
      if (!found) { if (cur) { this.tip = null; this.onTip(null); } return; }
      const label = found.city[0] + (found.city[1] ? ", " + found.city[1] : "");
      const amt = found.stage === "purchase" ? (this.lastAmount || "") : "";
      if (!cur || cur.label !== label || cur.x !== Math.round(found.x)) { this.tip = { label, amount: amt, x: Math.round(found.x), y: Math.round(found.y) }; this.onTip(this.tip); } };

    const leave = () => { if (this.tip) { this.tip = null; this.onTip(null); } };

    const wheel = (e: WheelEvent) => { e.preventDefault(); this.zoom = Math.max(0.7, Math.min(2.6, this.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); };

    const dbl = () => { this.rot = { lam: 98, phi: 38 }; this.zoom = 1; };

    cv.addEventListener("mousedown", down);
    cv.addEventListener("mousemove", move);
    cv.addEventListener("mouseleave", leave);
    cv.addEventListener("wheel", wheel, { passive: false });
    cv.addEventListener("dblclick", dbl);
    this._release.push(() => {
      cv.removeEventListener("mousedown", down);
      cv.removeEventListener("mousemove", move);
      cv.removeEventListener("mouseleave", leave);
      cv.removeEventListener("wheel", wheel);
      cv.removeEventListener("dblclick", dbl);
    });
  }

  // ------------------------------------------------------------- the feed
  // Real database events only. There is no simulator in this file.

  private cityOf(event: GlobeEvent): City {
    const parts = String(event.city || "").split(",");
    return [(parts[0] || "").trim(), (parts[1] || "").trim(), event.lon ?? 0, event.lat ?? 0];
  }

  private find(id: string) { return this.visitors.find(v => v.id === id); }

  push(event: GlobeEvent) {
    const now = performance.now();
    if (event.type === "visitor") {
      const existing = this.find(event.id);
      if (existing) { existing.stage = "view"; existing.at = now; return; }
      this.visitors.push({ id: event.id, city: this.cityOf(event), stage: "view", at: now });
      return;
    }
    if (event.type === "leave") {
      const v = this.find(event.id);
      if (!v) return;
      v.stage = "leaving"; v.at = now;
      this._timers.push(setTimeout(() => { this.visitors = this.visitors.filter(x => x.id !== v.id); }, 420));
      return;
    }
    if (event.type === "cart" || event.type === "checkout") {
      const v = this.find(event.id);
      if (v) { v.stage = event.type; v.at = now; return; }
      this.visitors.push({ id: event.id, city: this.cityOf(event), stage: event.type, at: now });
      return;
    }
    // order — the design's landOrder effects, unchanged
    const city = this.cityOf(event);
    let v = this.find(event.id);
    if (v) { v.stage = "purchase"; v.at = now; }
    else { v = { id: event.id, city, stage: "purchase", at: now }; this.visitors.push(v); }
    const target = v;
    this._timers.push(setTimeout(() => { if (target.stage === "purchase") { target.stage = "view"; target.at = performance.now(); } }, 8000));
    this.pulses = (this.pulses || []).slice(-3);
    this.pulses.push({ lon: target.city[2], lat: target.city[3], born: performance.now(), dur: 1400 });
    this.arcs = (this.arcs || []).slice(-3);
    this.arcs.push({ lon1: target.city[2], lat1: target.city[3], lon2: -74.006, lat2: 40.7128, born: performance.now(), dur: 1500 });
  }

  /** The design's `globeReset`. */
  reset() { this.rot = { lam: 98, phi: 38 }; this.zoom = 1; }

  /** Drop every marker and effect; the earth keeps rendering. */
  clear() { this.visitors = []; this.pulses = []; this.arcs = []; this.waves = []; this.tileHits = []; this.hit = []; this.tip = null; this.onTip(null); }

  /** The design's `locKey`: centre on a place and zoom to 1.6. */
  lookAt(lat: number, lon: number) { this.rot = { lam: -lon, phi: lat }; }

  setZoom(zoom: number) { this.zoom = Math.max(0.7, Math.min(2.6, zoom)); }

  destroy() {
    this._stopped = true;
    cancelAnimationFrame(this._raf);
    if (this._slow) clearTimeout(this._slow);
    this._timers.forEach(clearTimeout); this._timers = [];
    this._release.forEach(fn => fn()); this._release = [];
    this.tiles = null; this.tvec = null; this.sprites = null;
  }
}

function loadLandRaster(): Promise<void> {
  if (window.ShopGlobe && window.ShopGlobe.isLand) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-shop-globe]");
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
 * Mounts the design's globe on `canvas`. `public/shop-globe.js` is loaded for
 * `window.ShopGlobe.isLand` only — the vendor globe is never mounted.
 */
export async function mountLiveGlobe(canvas: HTMLCanvasElement, options: LiveGlobeOptions = {}): Promise<LiveGlobeHandle> {
  await loadLandRaster();
  return new LiveGlobe(canvas, options);
}
