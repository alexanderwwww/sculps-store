/* =============================================================================
   shop-globe.js — Live View globe for Shop Admin
   -----------------------------------------------------------------------------
   Drop-in, no dependencies, no network calls. One <canvas>, one mount call.

     const globe = ShopGlobe.mount(document.getElementById('globe'));
     globe.push({ type:'visitor', id:'v1', lat:36.15, lon:-95.99, city:'Tulsa, OK' });
     globe.push({ type:'cart',    id:'v1' });                       // same visitor, new state
     globe.push({ type:'order',   id:'v1', amount:129 });           // fires the sound
     globe.connect('/api/live');                                    // real traffic, SSE

   THE EARTH IS REAL. LAND_B64 below is Natural Earth 110m land, rasterised to a
   1-degree lat/lon grid (360x180), bit-packed row-major from +90 down to -90 and
   base64'd. It is verified against twelve known locations. Do not regenerate it,
   do not shorten it, do not hand-write coastlines — that is what kept producing
   an imaginary planet.

   Tiles sit on a Fibonacci sphere so spacing stays even everywhere. That is what
   removes the banding at the equator and the smear at the poles: there are no
   latitude rows to pile up.
   ============================================================================= */
(function (root) {
'use strict';

var LAND_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADf//8AAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB////D//////n/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/gf/x////////wAAAAAbgAAB4AAAAAAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAf//8A///////+AAAAB/ngAAAAAAAAAAH8AAAAAAAAAAAAAAAAAAAAAAAAcH3Hv/5////////8AAAAA/gAAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAcIAAQP/AH///////+AAAAAPCAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAADwDAc+f+AP///////4AAAAAAAAAAAAAB4AAAAB/8AAAAAAAAAAAAAAAAAAAAAH9wc374AAAf/////8AAAAAAAAAAAAH4AAAA////AAAB/gAAAAAAAAAAAAAAAAwAAA/QAAAH/////8AAAAAAAAAAAAOAAAAP///wAAAAAAAAAAAAAAAAAAAAP8AYe+c3AAAD/////4AAAAAAAAAAAA4AAAH////++HgAOAAAAAAAAAAAAAAAfv+4+w/4gAAB/////wAAAAAAAAAAADwAHgH///////4AfgAAAAAgAAAAAAAAPf/4O4//9AAB/////wAAAAAAAAAAADwAPb////////4m//gAAAAAAAf+AAAAAA/+A8f//4AB////8gAAAAAAA/gAAAAAfv/////////////8AAAAAB///+H//H/+PeDwf+AA3////AAAAAAA//4AAAA8fv///////////////P8gAf////////A4CPz4H8AAP///wAAAAAAD///wADH/n3/////////////////8AD////////////34Z/wA///4AAAAAAAP///+M////n/////////////////+4E/////////////gD/8Af//gAAAAAAAf//5+P////f/////////////////fw/////////////6AD8YAf/wAAf8AAAA/8f+D///////////////////////AgEf///////////zw7/AAP/gAAP4AAAB/4/+f//////////////////////8AMAf//////////+DIA/gAH/gAAAAAAAH/z/////////////////////////+AAH///////////8AwgOAAD+AAAAAAAA//H/////////////////////////6AAP///////////wAA/AAAB+AAAAAAAB/+H//////////////////////nP+AAAH//z////////wAA/wAAAOAAAAAAAB//D/////////////////////+A/4AAAA/zAD///////gAA/4wAAAAAAAAAAB//Ab///////////////////+eDgAAAAABwAA///////4AA/94AAAAAAAAAYA5+A///////////////////4AAHAAAAAADcAAD//////4AAf/8AAAAAAAAA8AC+C///////////////////wAAfgAAAAAMAAAA///////wAf/8AAAAAAAAA4AO8H///////////////////AAA/gAAAABgAAAA///////8A///AAAAAAAAA8ANwH//////////////////8AAB/AAAAAEAAAAAf///////z///4AAAAAAAHOAEDv//////////////////+AAA+AAAAAAAAAABH///////x///8AAAAAAAHHAf/////////////////////6AA8AAAAAAAAAAAD///////x///8AAAAAAAGPz//////////////////////6AAwAAAAAAAAAAAD///////9///6AAAAAAAAPj//////////////////////6AAQAAAAAAAAAAAC///////////MAAAAAAAAYf//////////////////////7AAAAAAAAAAAAAABv////////+MNAAAAAAAAD///////////////////////zAAAAAAAAAAAAAAAH////////7gfgAAAAAAAf///////////////////////yAAAAAAAAAAAAAAAL/////////gCgAAAAAAAH///////////////////////iAAAAAAAAAAAAAAAP/////////pAAAAAAAAAD/////uP/x//////////////DAAAAAAAAAAAAAAAP/////////+AAAAAAAAAB//v//Gf/B/////////////+AAAAAAAAAAAAAAAAP////////8wAAAAAAAAAB//H/+AP+P/////////////8CAAAAAAAAAAAAAAAP////////wAAAAAAAAADj/jz/8AD/H/////////////4HgAAAAAAAAAAAAAAP////////gAAAAAAAAAH/4Bw/8AA/B////////////+APAAAAAAAAAAAAAAAP////////gAAAAAAAAAH/wA8f8Ph/g////////////8AAAAAAAAAAAAAAAAAP///////8AAAAAAAAAAH/gMHfJ///x///////////v4AMAAAAAAAAAAAAAAAP///////8AAAAAAAAAAH/AMCOP///h//////////+JwAMAAAAAAAAAAAAAAAH///////4AAAAAAAAAAH/AAAHH///g//////////8BwAIAAAAAAAAAAAAAAAH///////wAAAAAAAAAAH+AAYGH///w//////////+w4A4AAAAAAAAAAAAAAAD///////wAAAAAAAAAAAgf+ACBs//////////////g4D4AAAAAAAAAAAAAAAB///////wAAAAAAAAAAAj/+AAAA//////////////AYf4AAAAAAAAAAAAAAAA///////gAAAAAAAAAAB//8AAAA//////////////Ah2AAAAAAAAAAAAAAAAAP/////+AAAAAAAAAAAD//+AAAB//////////////gDwAAAAAAAAAAAAAAAAAH/////8AAAAAAAAAAAH///4GAB//////////////gDAAAAAAAAAAAAAAAAAAG/////4AAAAAAAAAAAP///8P4h//////////////wCAAAAAAAAAAAAAAAAAACf////4AAAAAAAAAAAP////v////////////////gAAAAAAAAAAAAAAAAAAABP//hgYAAAAAAAAAAAP//////3//P///////////wAAAAAAAAAAAAAAAAAAAAv//AAYAAAAAAAAAAAf//////9//H///////////wAAAAAAAAAAAAAAAAAAAB3/+AAcAAAAAAAAAAB///////4//h///////////gAAAAAAAAAAAAAAAAAAAAR/+AANAAAAAAAAAAD///////8//wH//////////AAAAAAAAAAAAAAAAAAAAAJ/+AAEAAAAAAAAAAH///////+f/0B/////////+AAAAAAAAAAAAAAAAAAAAAI/8AAAAAAAAAAAAAH///////+f/44Af///////+QAAAAAAAAAAAAAAAAAAAAAf8AAAAAAAAAAAAAP////////H//+AP///////4gAAAAAAAAAAAAAAAAAAAAAP8AAuAAAAAAAAAAP////////H///AD///v///ggAAAAAAAAAAAAAAAAAAAAAH+AABgAAAAAAAAAf////////n//+AD//4P//YAAAAAAAAAAAAAAAAAAAAAAAP+A4AYAAAAAAAAAP////////j//+AAf/4H/+AAAAAAAAAAAAAAAAgAAAAAAAH/B4ABwAAAAAAAAP////////h//8AAf/gD/8YAAAAAAAAAAAAAAAAAAAAAAAD/nwAD9AAAAAAAAP////////x//4AAf/AD/8QAAAAAAAAAAAAAAAAAAAAAAAAf/wAAAAAAAAAAAP////////4//gAAf+AD/+AAwAAAAAAAAAAAAAAAAAAAAAAH/wAAAAAAAAAAAf////////4f+AAAf8AD//AAwAAAAAAAAAAAAAAAAAAAAAAAH/AAAAAAAAAAAf////////8f8AAAPwAAP/gAwAAAAAAAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAf////////+fgAAAPwAAP/gAwAAAAAAAAAAAAAAAAAAAAAAAA/AAAAAAAAAAAf/////////eAAAAHwAAP/gAMAAAAAAAAAAAAAAAAAAAAAAAAHgAAAAAAAAAAf/////////gAAAAHwAAM/gACAAAAAAAAAAAAAAAAAAAAAAAADABAAAAAAAAAP/////////gYAAADwAAEfgAJAAAAAAAAAAAAAAAAAAAAAAAADgPfKAAAAAAAH/////////34AAADwAAIOABAAAAAAAAAAAAAAAAAAAAAAAAAAyPf+AAAAAAAD//////////4AAADoAAIEACBAAAAAAAAAAAAAAAAAAAAAAAAA8///AAAAAAAB//////////wAAABIAAMAAAFAAAAAAAAAAAAAAAAAAAAAAAAAE///gAAAAAAB//////////wAAAAMAAEAAALgAAAAAAAAAAAAAAAAAAAAAAAAAf//wAAAAAAAf/////////gAAAAMAADAAMCAAAAAAAAAAAAAAAAAAAAAAAAAA////gAAAAAAP/B///////gAAAAAAADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAACAA///////AAAAAAAAxgA+AAAAAAAAAAAAAAAAAAAAAAAAAAAf///4AAAAAAAAAD/////+AAAAAAAAZgB4AAAAAAAAAAAAAAAAAAAAAAAAAAB////4AAAAAAAAAD/////8AAAAAAAAMwH8AAAAAAAAAAAAAAAAAAAAAAAAAAB////8AAAAAAAAAH/////4AAAAAAAAHQf8AIAAAAAAAAAAAAAAAAAAAAAAAAD////8AAAAAAAAAH/////gAAAAAAAAHgf88IAAAAAAAAAAAAAAAAAAAAAAAAD////+AAAAAAAAAH/////AAAAAAAAADwf8AAgAAAAAAAAAAAAAAAAAAAAAAAH/////4AAAAAAAAH/////AAAAAAAAABwP5wBwAAAAAAAAAAAAAAAAAAAAAAAH/////6AAAAAAAAD////+AAAAAAAAAB8P5wATwAAAAAAAAAAAAAAAAAAAAAAD//////4AAAAAAAB////8AAAAAAAAAA8AxQif+AAAAAAAAAAAAAAAAAAAAAAH//////8AAAAAAAB////4AAAAAAAAAAcAAIAD/gAAAAAAAAAAAAAAAAAAAAAH///////gAAAAAAA////4AAAAAAAAAAMAAIAI/ywAAAAAAAAAAAAAAAAAAAAH///////gAAAAAAA////4AAAAAAAAAADgAAAI/8BAAAAAAAAAAAAAAAAAAAAD///////gAAAAAAAf///4AAAAAAAAAAB+AAAA/4AIAAAAAAAAAAAAAAAAAAAB///////gAAAAAAAf///4AAAAAAAAAAAAmogAOMAAAAAAAAAAAAAAAAAAAAAB///////AAAAAAAAf///8AAAAAAAAAAAABCAAAGADAAAAAAAAAAAAAAAAAAAA///////AAAAAAAAf///8AAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAf/////+AAAAAAAAP///8AAAAAAAAAAAAAAAgCAAAAAAAAAAAAAAAAAAAAAAAf/////8AAAAAAAAf///+AQAAAAAAAAAAAAB+CAAAAAAAAAAAAAAAAAAAAAAAP/////4AAAAAAAAf///+AQAAAAAAAAAAAAD8DAAAAAAAAAAAAAAAAAAAAAAAP/////4AAAAAAAA////+AwAAAAAAAAAAAA38DgAAAAAAAAAAAAAAAAAAAAAAH/////4AAAAAAAA////8BwAAAAAAAAAAAD/8DgAAAAAAAAAAAAAAAAAAAAAAB/////4AAAAAAAA////8PwAAAAAAAAAAAD//HwAABABAAAAAAAAAAAAAAAAAAf////4AAAAAAAA////wPgAAAAAAAAAAAP//3wAAAACAAAAAAAAAAAAAAAAAAP////wAAAAAAAA////APgAAAAAAAAAAAP///wAAAAAAAAAAAAAAAAAAAAAAAP////wAAAAAAAAf//+APgAAAAAAAAAAAf///4AAAAAAAAAAAAAAAAAAAAAAAP////wAAAAAAAAf//+APgAAAAAAAAAAD////+AAIAAAAAAAAAAAAAAAAAAAAP////gAAAAAAAAP//+AfAAAAAAAAAAAf////+AAEAAAAAAAAAAAAAAAAAAAAP////AAAAAAAAAP///AfAAAAAAAAAAA//////AAAAAAAAAAAAAAAAAAAAAAAP///4AAAAAAAAAP//+APAAAAAAAAAAA//////gAAAAAAAAAAAAAAAAAAAAAAf///gAAAAAAAAAH//+AOAAAAAAAAAAB//////wAAAAAAAAAAAAAAAAAAAAAAf///AAAAAAAAAAH//4AEAAAAAAAAAAA//////4AAAAAAAAAAAAAAAAAAAAAAf//+AAAAAAAAAAH//4AAAAAAAAAAAAB//////4AAAAAAAAAAAAAAAAAAAAAAf//+AAAAAAAAAAH//4AAAAAAAAAAAAA//////4AAAAAAAAAAAAAAAAAAAAAAf//+AAAAAAAAAAD//wAAAAAAAAAAAAAf/////8AAAAAAAAAAAAAAAAAAAAAAf//8AAAAAAAAAAB//gAAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAAAAAA///8AAAAAAAAAAB//gAAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAAAAAA///4AAAAAAAAAAA//AAAAAAAAAAAAAAP/////4AAAAAAAAAAAAAAAAAAAAAAf//wAAAAAAAAAAA/+AAAAAAAAAAAAAAP/AP//wAAAAAAAAAAAAAAAAAAAAAA///gAAAAAAAAAAA/4AAAAAAAAAAAAAAf8AG//gAAAAAAAAAAAAAAAAAAAAAA//3AAAAAAAAAAAAYAAAAAAAAAAAAAAAOAAF//gAAAAAAAAAAAAAAAAAAAAAB//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//AAABAAAAAAAAAAAAAAAAAAB//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/AAAAgAAAAAAAAAAAAAAAAAD//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/AAAAQAAAAAAAAAAAAAAAAAB//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABYAAAAcAAAAAAAAAAAAAAAAAB/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAD/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAADQAAAAAAAAAAAAAAAAAD/4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAHAAAAAAAAAAAAAAAAAAB/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAOAAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAH+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAH+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAH/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8AAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAH4AAAAAAB4HgAD8AAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAA//AAAD//////////wAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAf///4Af///////////AAAAAAAAAAAAAAAAAAAAAAAz4AAAAAAAAAAAAAAAPz////8B/////////////wAAAAAAAAAAAAAAAAAAAAA78AAAAAAAAAAA8/8///////wf/////////////+AAAAAAAAAAAAAAAAAAAAH9+AAAAAAAAZ////////////w////////////////4AAAAAAAAAAAAAAAAAAAB+AAAAAAAB//////////////////////////////4AAAAAAAAABmAAB8f+HB/+AAAAAAAP//////////////////////////////gAAAAAAAAP/c/oAf/////4AAAAAAAP/////////////////////////////8AAAAAAAD/////////////gAAAAAAB//////////////////////////////wAAAAAAAD////////////wAAAAAAP///////////////////////////////wAAAAAD/////////////4AAAAAAD////////////////////////////////wAAAADh/////////////AAAAB8A/////////////////////////////////+AAAAA4Af///////////gAAAH+AA///////////////////////////////+AAAAAAAAH///////////+A/A/wAA///////////////////////////////8AAAAAAAf//////////////gAAAf////////////////////////////////+AAAAAAAH///////////////h////////////////////////////////////wAAAAAAP/////////////////////////////////////////////////////gA+/gAAH/////////////////////////////////////////////////////8/////v//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////";
var GW = 360, GH = 180;

var LAND = (function () {
  var bin = atob(LAND_B64), bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
})();

function isLand(lat, lon) {
  var j = Math.floor(89.5 - lat + 0.5), i = Math.floor(lon + 180);
  if (j < 0) j = 0; else if (j >= GH) j = GH - 1;
  i = ((i % GW) + GW) % GW;
  var idx = j * GW + i;
  return (LAND[idx >> 3] >> (7 - (idx & 7))) & 1;
}

var DEFAULTS = {
  tiles: 15000,          // Fibonacci points before the land test; ~30% survive
  sphereTop:    '#5B3FA8',
  sphereMid:    '#3B2273',
  sphereDeep:   '#241147',
  tileNear:     '#E6DFFA',
  tileFar:      '#6E5AA8',
  atmosphere:   '#8E6BFF',
  visitor:      '#4DA3FF',
  cart:         '#FFB020',
  checkout:     '#FF8A3D',
  order:        '#FF2FB9',   // neon pink — the money colour
  startLon:     -98,         // United States facing the viewer
  startLat:     18,
  spin:         0.00028,
  soundUrl:     null,        // purchase sound only; nothing else ever plays
  onEvent:      null         // callback so the sidebar cards can react in step
};

function ShopGlobe(canvas, opts) {
  var o = {}; for (var k in DEFAULTS) o[k] = DEFAULTS[k];
  for (var k2 in (opts || {})) o[k2] = opts[k2];
  this.o = o;
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.yaw = (90 - o.startLon) * Math.PI / 180;
  this.pitch = o.startLat * Math.PI / 180;
  this.zoom = 1;
  this.markers = new Map();     // id -> marker
  this.bursts = [];             // transient ring animations
  this.dragging = false;
  this.userSpun = false;
  this.hover = null;
  this.audio = o.soundUrl ? new Audio(o.soundUrl) : null;
  this.lastSound = 0;
  this._buildTiles();
  this._bind();
  this._resize();
  this._loop = this._loop.bind(this);
  requestAnimationFrame(this._loop);
}

/* --- tiles ---------------------------------------------------------------
   Fibonacci sphere: N points spiralling from pole to pole, each the same
   distance from its neighbours. Sample the land mask at each one and keep the
   hits. Even spacing everywhere, real coastlines, no rows to band. */
ShopGlobe.prototype._buildTiles = function () {
  var N = this.o.tiles, GA = Math.PI * (3 - Math.sqrt(5)), pts = [];
  for (var i = 0; i < N; i++) {
    var y = 1 - (i / (N - 1)) * 2;
    var r = Math.sqrt(Math.max(0, 1 - y * y));
    var th = GA * i;
    var x = Math.cos(th) * r, z = Math.sin(th) * r;
    var lat = Math.asin(y) * 180 / Math.PI;
    var lon = Math.atan2(z, x) * 180 / Math.PI;
    if (isLand(lat, lon)) pts.push(x, y, z);
  }
  this.tiles = new Float32Array(pts);
  this.tileCount = pts.length / 3;
};

/* --- geometry ------------------------------------------------------------ */
ShopGlobe.prototype._rot = function (x, y, z) {
  var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
  var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
  var x1 = x * cy - z * sy, z1 = x * sy + z * cy;
  return { x: x1, y: y * cp - z1 * sp, z: y * sp + z1 * cp };
};
ShopGlobe.prototype._project = function (lat, lon) {
  var la = lat * Math.PI / 180, lo = lon * Math.PI / 180, cl = Math.cos(la);
  var p = this._rot(cl * Math.cos(lo), Math.sin(la), cl * Math.sin(lo));
  return { x: this.cx + p.x * this.R, y: this.cy - p.y * this.R, z: p.z };
};

ShopGlobe.prototype._resize = function () {
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
  this.canvas.width = w * dpr; this.canvas.height = h * dpr;
  this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  this.W = w; this.H = h;
};

/* --- events in ----------------------------------------------------------- */
/* One visitor has one marker for their whole session. Their state changes as
   they move down the funnel, so the globe shows a life, not a pile of dots. */
ShopGlobe.prototype.push = function (e) {
  var now = performance.now();
  var id = e.id || ('anon' + now + Math.floor(performance.now() % 1000));
  var m = this.markers.get(id);

  if (e.type === 'leave') {
    if (m) { m.leaving = now; }
    if (this.o.onEvent) this.o.onEvent(e, this.stats());
    return;
  }
  if (!m) {
    m = { id: id, lat: e.lat, lon: e.lon, city: e.city || '', type: 'visitor',
          born: now, changed: now, amount: 0, leaving: 0 };
    this.markers.set(id, m);
  }
  if (e.lat != null) { m.lat = e.lat; m.lon = e.lon; }
  if (e.city) m.city = e.city;
  if (e.type !== m.type) { m.type = e.type; m.changed = now; }
  if (e.amount) m.amount = e.amount;

  if (e.type === 'cart' || e.type === 'checkout') {
    this.bursts.push({ lat: m.lat, lon: m.lon, born: now, color: this.o[e.type], rings: 1, max: 26 });
  }
  if (e.type === 'order') {
    this.bursts.push({ lat: m.lat, lon: m.lon, born: now, color: this.o.order, rings: 3, max: 62 });
    m.floatText = '+$' + Number(e.amount || 0).toFixed(2);
    m.floatBorn = now;
    this._playSound();                       // the ONLY event that makes a noise
    // after eight seconds a buyer is just a visitor again
    var self = this;
    setTimeout(function () { if (self.markers.get(id) === m && m.type === 'order') { m.type = 'visitor'; m.changed = performance.now(); } }, 8000);
  }
  if (this.o.onEvent) this.o.onEvent(e, this.stats());
};

ShopGlobe.prototype._playSound = function () {
  if (!this.audio) return;
  var now = performance.now();
  if (now - this.lastSound < 400) return;   // never two sounds on top of each other
  this.lastSound = now;
  try { this.audio.currentTime = 0; this.audio.play(); } catch (err) {}
};

ShopGlobe.prototype.stats = function () {
  var s = { visitors: 0, carts: 0, checkout: 0 };
  this.markers.forEach(function (m) {
    if (m.leaving) return;
    s.visitors++;
    if (m.type === 'cart') s.carts++;
    if (m.type === 'checkout') s.checkout++;
  });
  return s;
};

/* --- real traffic --------------------------------------------------------
   Point this at an endpoint that streams Server-Sent Events, one JSON object
   per event: {type, id, lat, lon, city, amount}. Types: visitor, cart,
   checkout, order, leave. Falls back to a WebSocket if the URL is ws:// or
   wss://. Reconnects on its own. */
ShopGlobe.prototype.connect = function (url) {
  var self = this;
  if (/^wss?:/.test(url)) {
    var open = function () {
      var ws = new WebSocket(url);
      ws.onmessage = function (ev) { try { self.push(JSON.parse(ev.data)); } catch (e) {} };
      ws.onclose = function () { setTimeout(open, 3000); };
    };
    open();
  } else {
    var es = new EventSource(url);
    es.onmessage = function (ev) { try { self.push(JSON.parse(ev.data)); } catch (e) {} };
    es.onerror = function () { es.close(); setTimeout(function () { self.connect(url); }, 3000); };
  }
};

/* --- interaction --------------------------------------------------------- */
ShopGlobe.prototype._bind = function () {
  var self = this, c = this.canvas, lx = 0, ly = 0;
  window.addEventListener('resize', function () { self._resize(); });
  c.addEventListener('pointerdown', function (e) { self.dragging = true; self.userSpun = true; lx = e.clientX; ly = e.clientY; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointerup', function () { self.dragging = false; });
  c.addEventListener('pointermove', function (e) {
    var r = c.getBoundingClientRect();
    self.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (!self.dragging) return;
    self.yaw += (e.clientX - lx) * 0.005;
    self.pitch = Math.max(-1.25, Math.min(1.25, self.pitch + (e.clientY - ly) * 0.005));
    lx = e.clientX; ly = e.clientY;
  });
  c.addEventListener('pointerleave', function () { self.mouse = null; });
  c.addEventListener('wheel', function (e) { e.preventDefault(); self.setZoom(self.zoom * (e.deltaY > 0 ? 0.93 : 1.07)); }, { passive: false });
  c.addEventListener('dblclick', function () { self.reset(); });
};
ShopGlobe.prototype.setZoom = function (z) { this.zoom = Math.max(0.7, Math.min(3.2, z)); };
ShopGlobe.prototype.reset = function () {
  this.yaw = (90 - this.o.startLon) * Math.PI / 180;
  this.pitch = this.o.startLat * Math.PI / 180;
  this.zoom = 1; this.userSpun = false;
};
/* Spin a named place to the front — wire this to the Search location field. */
ShopGlobe.prototype.lookAt = function (lat, lon) {
  this.yaw = (90 - lon) * Math.PI / 180;
  this.pitch = lat * Math.PI / 180;
  this.userSpun = true;
};

/* --- draw ---------------------------------------------------------------- */
function hexPath(ctx, x, y, r) {
  ctx.moveTo(x + r, y);
  for (var i = 1; i < 6; i++) {
    var a = i * Math.PI / 3;
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
}
function mix(a, b, t) {
  var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  var r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  var g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  var bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}
function ease(t) { return 1 - Math.pow(1 - t, 3); }   // ease-out cubic, Apple-ish

ShopGlobe.prototype._loop = function (now) {
  var ctx = this.ctx, o = this.o;
  if (!this.dragging && !this.userSpun) this.yaw += o.spin;
  var cx = this.cx = this.W / 2, cy = this.cy = this.H / 2;
  var R = this.R = Math.min(this.W, this.H) * 0.44 * this.zoom;
  ctx.clearRect(0, 0, this.W, this.H);

  // sphere, lit from the upper left
  var g = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.46, R * 0.06, cx, cy, R);
  g.addColorStop(0, o.sphereTop);
  g.addColorStop(0.55, o.sphereMid);
  g.addColorStop(1, o.sphereDeep);
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.fillStyle = g; ctx.fill();

  // atmosphere
  var a = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.12);
  a.addColorStop(0, 'rgba(142,107,255,0.28)');
  a.addColorStop(1, 'rgba(142,107,255,0)');
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, 6.2832); ctx.fillStyle = a; ctx.fill();

  // land tiles, in depth bands so the near side reads closer
  var cyaw = Math.cos(this.yaw), syaw = Math.sin(this.yaw);
  var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
  var base = R / 95, T = this.tiles;
  for (var band = 0; band < 4; band++) {
    var lo = band * 0.25, hi = lo + 0.25;
    ctx.beginPath();
    for (var p = 0; p < T.length; p += 3) {
      var x1 = T[p] * cyaw - T[p + 2] * syaw;
      var z1 = T[p] * syaw + T[p + 2] * cyaw;
      var y2 = T[p + 1] * cp - z1 * sp;
      var z2 = T[p + 1] * sp + z1 * cp;
      if (z2 <= lo || z2 > hi) continue;
      hexPath(ctx, cx + x1 * R, cy - y2 * R, base * (0.52 + 0.48 * z2));
    }
    var t = (lo + 0.125);
    ctx.fillStyle = mix(o.tileFar, o.tileNear, t);
    ctx.globalAlpha = 0.35 + 0.65 * t;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // bursts (rings) — capped so a flood of orders stays calm
  var live = 0;
  for (var b = this.bursts.length - 1; b >= 0; b--) {
    var bu = this.bursts[b], age = (now - bu.born) / 1000;
    if (age > 1.8) { this.bursts.splice(b, 1); continue; }
    if (live++ > 4) continue;
    var pr = this._project(bu.lat, bu.lon);
    if (pr.z <= 0.02) continue;
    for (var k = 0; k < bu.rings; k++) {
      var tt = (age - k * 0.28) / 1.5;
      if (tt <= 0 || tt >= 1) continue;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 5 + ease(tt) * bu.max, 0, 6.2832);
      ctx.strokeStyle = bu.color;
      ctx.globalAlpha = 0.55 * (1 - tt);
      ctx.lineWidth = 2 - tt; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // markers
  var self = this, hovered = null;
  this.markers.forEach(function (m, id) {
    if (m.leaving) {
      var la = (now - m.leaving) / 400;
      if (la >= 1) { self.markers.delete(id); return; }
    }
    var pr = self._project(m.lat, m.lon);
    if (pr.z <= 0.02) return;
    var col = o[m.type] || o.visitor;
    var age = (now - m.changed) / 1000;
    var shrink = m.leaving ? Math.max(0, 1 - (now - m.leaving) / 400) : 1;

    if (m.type === 'order') {
      // neon pink glow — the one loud moment in the whole product
      var pop = age < 0.2 ? 1 + (0.2 - age) * 2.2 : 1;
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 26;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 6.5 * pop * shrink, 0, 6.2832);
      ctx.fillStyle = col; ctx.fill();
      ctx.restore();
    } else {
      var pulse = 1 + 0.32 * Math.sin(age * 3.1);
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 10 * pulse * shrink, 0, 6.2832);
      ctx.fillStyle = col; ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 4.5 * shrink, 0, 6.2832);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // a slow dashed ring marks anyone sitting in checkout
    if (m.type === 'checkout') {
      ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(now / 3000);
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.2832);
      ctx.setLineDash([4, 5]); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }

    // the amount drifting up after a sale
    if (m.floatText) {
      var fa = (now - m.floatBorn) / 2400;
      if (fa < 1) {
        ctx.font = '650 13px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 1 - fa;
        ctx.fillStyle = o.order;
        ctx.fillText(m.floatText, pr.x, pr.y - 20 - fa * 42);
        ctx.globalAlpha = 1;
      } else m.floatText = null;
    }

    if (self.mouse) {
      var dx = self.mouse.x - pr.x, dy = self.mouse.y - pr.y;
      if (dx * dx + dy * dy < 190) hovered = { m: m, x: pr.x, y: pr.y };
    }
  });

  // hover tooltip
  if (hovered) {
    var label = hovered.m.city || 'Visitor';
    if (hovered.m.type === 'order' && hovered.m.amount) label += '  ·  $' + hovered.m.amount.toFixed(2);
    ctx.font = '550 12px Inter, system-ui, sans-serif';
    var w = ctx.measureText(label).width + 20;
    var bx = hovered.x - w / 2, by = hovered.y - 42;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, w, 26, 7); else ctx.rect(bx, by, w, 26);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.10)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#303030'; ctx.textAlign = 'center';
    ctx.fillText(label, hovered.x, by + 17);
  }

  requestAnimationFrame(this._loop);
};

root.ShopGlobe = {
  mount: function (canvas, opts) { return new ShopGlobe(canvas, opts); },
  isLand: isLand
};
})(window);
