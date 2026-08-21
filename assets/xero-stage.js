/* XERO — stage.js
   Static world backdrops + a bike that turns. No 3D world, no idle render loop.

   - Each world/mode state is ONE static image layer (background-size: cover, anchored to
     the ground line). It never moves, never parallaxes, never reacts to drag.
   - Only the bike responds to input. Drag = limited parallax arc with momentum.
   - Day<->Night and world switches are pure CSS opacity crossfades (compositor only).
   - rAF runs ONLY while the bike is settling. Idle cost is zero.
   - GLB path stays wired: loadModel() parses the file with no WebGL context; a renderer
     is created lazily, on demand, only if useModel(true) is ever called.
   Exposes an imperative API on window.XeroStage. */
(function () {
  'use strict';

  var SW = 674, SH = 564;                    // bike sprite pixel size
  var BIKE_LEN = 1.89;                       // metres — used only by the GLB auto-fit
  var A = window.XERO_ASSETS || {};
  var TEX = { day: A.bikeDay || 'bike-day.png', night: A.bikeNight || 'bike-night.png', seam: A.bikeSeam || 'bike-seam.png' };

  function worldSrc(world, mode) {
    if (world === 'studio') return null;
    var pack = (A.worlds || {})[world + '-' + mode];
    if (!pack) return null;
    var w = (window.innerWidth <= 900 || window.innerWidth * (window.devicePixelRatio || 1) < 1500) ? '900' : '1600';
    return pack[w] || pack['1600'] || null;
  }

  // per-world ground/contact shadow tint
  var SHADOW = {
    'studio-day':  'rgba(60,62,70,0.30)',
    'studio-night':'rgba(0,0,0,0.55)',
    'city-day':    'rgba(28,30,36,0.46)',
    'city-night':  'rgba(0,0,0,0.60)',
    'mars-day':    'rgba(78,34,16,0.44)',
    'mars-night':  'rgba(8,4,10,0.58)'
  };
  var HOTSPOT_UV = {
    seat: [0.240, 0.195], tank: [0.620, 0.140], plate: [0.700, 0.250],
    fork: [0.843, 0.388], panel: [0.452, 0.418], peg: [0.352, 0.814]
  };
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'cubic-bezier(.28,.11,.32,1)';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function damp(cur, target, k, dt) { return cur + (target - cur) * (1 - Math.exp(-k * dt)); }

  function el(tag, css) { var d = document.createElement(tag); d.style.cssText = css; return d; }

  class XeroStage extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      this.style.cssText = 'display:block;position:relative;width:100%;height:100%;overflow:hidden;touch-action:pan-y;cursor:grab;';

      this.state = { world: 'studio', mode: 'day', view: '3d' };
      this.anim = { az: 0, azT: 0, zoom: 1, zoomT: 1, px: 0, pxT: 0, py: 0, pyT: 0 };
      this.focused = null;

      // --- two world layers, crossfaded
      var base = 'position:absolute;inset:0;background-position:50% 50%;background-size:cover;background-repeat:no-repeat;';
      this.wA = el('div', base + 'opacity:1;transition:opacity .5s ' + EASE + ';');
      this.wB = el('div', base + 'opacity:0;transition:opacity .5s ' + EASE + ';');
      this.appendChild(this.wA); this.appendChild(this.wB);

      // --- studio geometry (only shown for the studio world)
      this.studio = el('div', 'position:absolute;inset:0;opacity:0;transition:opacity .5s ' + EASE + ';');
      this.pedestal = el('div', 'position:absolute;left:50%;border-radius:50%;transform:translateX(-50%);');
      this.spot = el('div', 'position:absolute;left:50%;border-radius:50%;transform:translateX(-50%);');
      this.studio.appendChild(this.spot); this.studio.appendChild(this.pedestal);
      this.appendChild(this.studio);

      // --- static contact shadow
      this.shadow = el('div', 'position:absolute;border-radius:50%;pointer-events:none;');
      this.appendChild(this.shadow);

      // --- bike
      this.bike = el('div', 'position:absolute;left:0;top:0;transform-origin:50% 100%;');
      var img = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;-webkit-user-drag:none;';
      this.iDay = el('img', img + 'opacity:1;transition:opacity .5s ' + EASE + ';');
      this.iNight = el('img', img + 'opacity:0;transition:opacity .5s ' + EASE + ';');
      this.iSeam = el('img', img + 'opacity:0;mix-blend-mode:screen;transition:opacity .5s ' + EASE + ';');
      this.iDay.src = TEX.day; this.iNight.src = TEX.night; this.iSeam.src = TEX.seam;
      [this.iDay, this.iNight, this.iSeam].forEach(function (i) { i.alt = ''; i.decoding = 'async'; });
      this.bike.appendChild(this.iDay); this.bike.appendChild(this.iNight); this.bike.appendChild(this.iSeam);
      this.appendChild(this.bike);

      this.iDay.addEventListener('error', function () { console.error('[stage] bike sprite failed to load:', TEX.day); });

      // --- reference cube: a readable stand-in for the real 3D model's rotation
      this.cubeWrap = el('div', 'position:absolute;left:0;top:0;perspective:1400px;pointer-events:none;');
      this.cube = el('div', 'position:absolute;inset:0;transform-style:preserve-3d;');
      this.cubeWrap.appendChild(this.cube);
      this.faces = {};
      [['FRONT', 0, 0], ['RIGHT', 90, 0], ['BACK', 180, 0], ['LEFT', 270, 0], ['TOP', 0, 90], ['BOTTOM', 0, -90]].forEach(function (f) {
        var d = el('div', 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
          'font:600 .78rem/1 system-ui,-apple-system,sans-serif;letter-spacing:.16em;backface-visibility:visible;');
        d.textContent = f[0];
        d.dataset.rot = f[1] + ',' + f[2];
        this.cube.appendChild(d);
        this.faces[f[0]] = d;
      }, this);
      this.appendChild(this.cubeWrap);
      this.refCube = false;

      window.XeroStage = api(this);
      this._bind();
      this._ro = new ResizeObserver(this._layout.bind(this));
      this._ro.observe(this);
      this._applyWorld(this.state.world, this.state.mode, true);
      this._layout();
      this.dispatchEvent(new CustomEvent('stage-ready', { bubbles: true }));
    }
    disconnectedCallback() { this._dead = true; if (this._ro) this._ro.disconnect(); }
  }

  /* ------------------------------------------------------------------ layout */

  XeroStage.prototype._layout = function () {
    var W = this.clientWidth || 1, H = this.clientHeight || 1;
    // Bike is the hero but sits calmer now: ~46% of stage height, wheels on the ground line.
    var bh = H * 0.46, bw = bh * (SW / SH);
    if (bw > W * 0.62) { bw = W * 0.62; bh = bw * (SH / SW); }
    var cx = W * 0.395, groundY = H * 0.745;
    this.geom = { W: W, H: H, bw: bw, bh: bh, cx: cx, groundY: groundY };

    this.bike.style.width = bw + 'px';
    this.bike.style.height = bh + 'px';
    this.bike.style.left = (cx - bw / 2) + 'px';
    this.bike.style.top = (groundY - bh) + 'px';

    var sw = bw * 0.92, sh = bh * 0.13;
    this.shadow.style.width = sw + 'px';
    this.shadow.style.height = sh + 'px';
    this.shadow.style.left = (cx - sw / 2) + 'px';
    this.shadow.style.top = (groundY - sh * 0.52) + 'px';

    var pw = bw * 1.42, ph = pw * 0.30;
    this.pedestal.style.width = pw + 'px'; this.pedestal.style.height = ph + 'px';
    this.pedestal.style.top = (groundY - ph * 0.62) + 'px';
    var lw = bw * 2.1, lh = lw * 0.34;
    this.spot.style.width = lw + 'px'; this.spot.style.height = lh + 'px';
    this.spot.style.top = (groundY - lh * 0.52) + 'px';

    var S = Math.min(H * 0.34, W * 0.30);
    this.geom.S = S;
    this.cubeWrap.style.width = S + 'px';
    this.cubeWrap.style.height = S + 'px';
    this.cubeWrap.style.left = (cx - S / 2) + 'px';
    this.cubeWrap.style.top = (groundY - S * 1.125) + 'px';
    var self = this;
    Object.keys(this.faces).forEach(function (k) {
      var f = self.faces[k], r = f.dataset.rot.split(',');
      f.style.transform = 'rotateY(' + r[0] + 'deg) rotateX(' + r[1] + 'deg) translateZ(' + (S / 2) + 'px)';
    });
    this._paintCube();

    this._frame();
  };

  /* ------------------------------------------------------------- world swap  */

  XeroStage.prototype.prefetch = function (world, mode) {
    var src = worldSrc(world, mode);
    if (!src || this['_pf' + src]) return;
    this['_pf' + src] = true;
    var i = new Image(); i.decoding = 'async'; i.src = src;
  };

  XeroStage.prototype._applyWorld = function (world, mode, immediate) {
    var self = this, key = world + '-' + mode;
    var src = worldSrc(world, mode);
    this.shadow.style.background = 'radial-gradient(50% 50% at 50% 50%, ' + (SHADOW[key] || SHADOW['studio-day']) +
      ' 0%, rgba(0,0,0,0) 72%)';

    var night = mode === 'night';
    this.studio.style.opacity = world === 'studio' ? '1' : '0';
    if (world === 'studio') {
      this.studio.style.background = night
        ? 'radial-gradient(72% 58% at 42% 74%, #26272f 0%, #131419 46%, #08080b 100%)'
        : 'radial-gradient(78% 62% at 44% 70%, #ffffff 0%, #f4f4f7 46%, #e4e4ea 100%)';
      this.pedestal.style.opacity = night ? '0' : '1';
      this.pedestal.style.background = 'radial-gradient(50% 50% at 50% 46%, #fdfdfe 0%, #f4f4f7 62%, rgba(228,228,234,0) 100%)';
      this.pedestal.style.boxShadow = night ? 'none' : '0 2px 18px rgba(0,0,0,.06)';
      this.spot.style.opacity = night ? '1' : '0';
      this.spot.style.background = 'radial-gradient(50% 50% at 50% 50%, rgba(214,224,255,.34) 0%, rgba(120,136,190,.12) 44%, rgba(0,0,0,0) 76%)';
    }

    var target = this._front === this.wA ? this.wB : this.wA;
    var other = this._front === this.wA ? this.wA : this.wB;
    if (!this._front) { target = this.wA; other = this.wB; }

    var show = function () {
      target.style.backgroundImage = src ? 'url("' + src + '")' : 'none';
      target.style.backgroundColor = src ? 'transparent' : 'transparent';
      if (immediate || REDUCED) {
        target.style.transition = 'none'; other.style.transition = 'none';
        target.style.opacity = '1'; other.style.opacity = '0';
        void target.offsetWidth;
        target.style.transition = 'opacity .5s ' + EASE;
        other.style.transition = 'opacity .5s ' + EASE;
      } else {
        void target.offsetWidth;
        target.style.opacity = '1'; other.style.opacity = '0';
      }
      self._front = target;
    };

    if (src) {
      var im = new Image();
      im.decoding = 'async';
      im.onload = show;
      im.onerror = function () {
        console.error('[stage] world image failed to load:', src);
        show();
      };
      im.src = src;
    } else { show(); }

    this.iNight.style.opacity = night ? '1' : '0';
    this.iDay.style.opacity = night ? '0' : '1';
    this.iSeam.style.opacity = night ? '0.62' : '0';
    this.state.world = world; this.state.mode = mode;
    this._paintCube();
    this._envFor(world, mode);
  };

  /* Lighting: one tiny environment map per world-state, derived ONCE and cached.
     Only consumed by the GLB path; never rebuilt per frame. */
  XeroStage.prototype._envFor = function (world, mode) {
    var key = world + '-' + mode;
    this._env = this._env || {};
    if (this._env[key] || world === 'studio') return;
    var src = worldSrc(world, mode); if (!src) return;
    var self = this;
    var run = function () {
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function () {
        var c = document.createElement('canvas'); c.width = 256; c.height = 128;
        var x = c.getContext('2d');
        x.filter = 'blur(6px)';
        x.drawImage(im, 0, 0, 256, 128);
        self._env[key] = c;                       // PMREM is generated from this on first GLB use
      };
      im.src = src;
    };
    (window.requestIdleCallback || function (f) { setTimeout(f, 600); })(run);
  };

  /* ------------------------------------------------------- on-demand frames  */

  /* One tiny per-world light rig for the 3D object only: a key tint, a fill tint and a
     rim value sampled to match each world's dominant light. Values are constants — the
     cube repaints on world/mode change and never per frame, so this costs nothing. */
  var LIGHT = {
    'studio-day':   { key: '255,255,255', fill: '232,236,245', rim: '30,36,60', ka: .30, fa: .20, ra: .62 },
    'studio-night': { key: '206,220,255', fill: '92,104,150',  rim: '196,210,255', ka: .16, fa: .10, ra: .70 },
    'city-day':     { key: '255,250,238', fill: '206,220,242', rim: '26,32,52', ka: .26, fa: .22, ra: .58 },
    'city-night':   { key: '150,190,255', fill: '58,70,110',   rim: '168,200,255', ka: .18, fa: .12, ra: .72 },
    'mars-day':     { key: '255,226,196', fill: '236,186,150', rim: '78,34,16', ka: .30, fa: .24, ra: .56 },
    'mars-night':   { key: '186,166,255', fill: '64,52,92',    rim: '196,180,255', ka: .17, fa: .11, ra: .70 }
  };

  XeroStage.prototype._paintCube = function () {
    var night = this.state.mode === 'night', self = this;
    var L = LIGHT[this.state.world + '-' + this.state.mode] || LIGHT['studio-day'];
    var edge = 'rgba(' + L.rim + ',' + L.ra + ')';
    var txt = night ? 'rgba(226,232,255,.86)' : 'rgba(24,26,34,.72)';
    // face normals: FRONT/BACK face the camera, RIGHT catches the key, LEFT the fill,
    // TOP the sky, BOTTOM the bounce. One flat tint each — no shaders, no per-frame work.
    var lit = {
      FRONT:  'rgba(' + L.key + ',' + (L.ka * 0.62).toFixed(3) + ')',
      RIGHT:  'rgba(' + L.key + ',' + L.ka.toFixed(3) + ')',
      BACK:   'rgba(' + L.fill + ',' + (L.fa * 0.7).toFixed(3) + ')',
      LEFT:   'rgba(' + L.fill + ',' + L.fa.toFixed(3) + ')',
      TOP:    'rgba(' + L.key + ',' + (L.ka * 1.25).toFixed(3) + ')',
      BOTTOM: 'rgba(' + L.fill + ',' + (L.fa * 0.45).toFixed(3) + ')'
    };
    Object.keys(this.faces).forEach(function (k) {
      var fc = self.faces[k];
      var accent = k === 'FRONT';
      fc.style.background = accent
        ? 'linear-gradient(160deg,' + lit[k] + ',' + (night ? 'rgba(126,87,250,.20)' : 'rgba(0,93,249,.13)') + ')'
        : lit[k];
      fc.style.border = '1.5px solid ' + (accent ? (night ? 'rgba(150,120,255,.85)' : 'rgba(0,93,249,.7)') : edge);
      fc.style.color = txt;
      fc.style.boxShadow = 'inset 0 0 2.4rem rgba(' + L.key + ',' + (L.ka * 0.5).toFixed(3) + ')';
      fc.style.transition = 'background .5s cubic-bezier(.28,.11,.32,1),border-color .5s,box-shadow .5s';
    });
    var showCube = this.refCube && this.state.view !== 'photos';
    this.cubeWrap.style.display = showCube ? 'block' : 'none';
    var showSprite = !this.refCube && this.state.view !== 'photos';
    [this.iDay, this.iNight, this.iSeam].forEach(function (i) { i.style.display = showSprite ? '' : 'none'; });
    // the ground contact belongs to the object, so it leaves with it
    this.shadow.style.display = this.state.view === 'photos' ? 'none' : '';
  };

  XeroStage.prototype._wake = function () {
    if (this._running || this._dead || this._inactive) return;
    this._running = true;
    this._last = performance.now();
    var self = this;
    var loop = function (t) {
      if (self._dead) { self._running = false; return; }
      var dt = Math.min(0.05, (t - self._last) / 1000); self._last = t;
      var a = self.anim, settled = true;
      if (self.spin) { self.spinDeg = (self.spinDeg || 0) + dt * 42; settled = false; }
      ['az', 'zoom', 'px', 'py'].forEach(function (k) {
        var to = a[k + 'T'];
        a[k] = damp(a[k], to, k === 'az' ? 7.5 : 6.5, dt);
        if (Math.abs(to - a[k]) > 0.0006) settled = false;
      });
      if (settled) { ['az', 'zoom', 'px', 'py'].forEach(function (k) { a[k] = a[k + 'T']; }); }
      self._frame();
      if (settled && !self._dragging) { self._running = false; return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  XeroStage.prototype._frame = function () {
    var g = this.geom; if (!g) return;
    var a = this.anim;
    // limited parallax arc — the sprite shifts, squeezes and leans; the world stays put
    var tx = -a.az * g.bw * 0.075 + a.px;
    if (this.spin && !this.refCube) tx += Math.sin((this.spinDeg || 0) * Math.PI / 180) * g.bw * 0.075;
    var ty = a.py;
    var sx = 1 - Math.abs(a.az) * 0.085;
    if (this.spin && !this.refCube) sx *= 1 - Math.abs(Math.sin((this.spinDeg || 0) * Math.PI / 180)) * 0.085;
    this.bike.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' +
      a.zoom.toFixed(4) + ') scaleX(' + sx.toFixed(4) + ') rotate(' + (a.az * 0.7).toFixed(3) + 'deg)';
    this.shadow.style.transform = 'translate3d(' + (tx * 0.72).toFixed(2) + 'px,0,0) scaleX(' +
      (sx * (1 + (a.zoom - 1) * 0.6)).toFixed(4) + ')';
    this.shadow.style.opacity = String(clamp(1 - Math.abs(a.py) / (g.H * 0.4), 0.15, 1));

    var s = this.geom.bw / SW * a.zoom;
    var cx = g.cx + tx, by = g.groundY + ty;
    if (this.refCube) {
      this.cube.style.transform = 'translate3d(' + (tx * 0.9).toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' +
        a.zoom.toFixed(4) + ') rotateX(-14deg) rotateY(' + (a.az * 82 + (this.spinDeg || 0)).toFixed(2) + 'deg)';
    }
    var d = document.documentElement.style;
    d.setProperty('--bx', cx.toFixed(1) + 'px');
    d.setProperty('--by', by.toFixed(1) + 'px');
    d.setProperty('--bs', s.toFixed(4));
    if (this.renderer) this._render3D();
  };

  /* ---------------------------------------------------------------- pointer  */

  XeroStage.prototype._bind = function () {
    var self = this, drag = null;
    this.addEventListener('pointerdown', function (e) {
      if (self.state.view !== '3d') return;
      drag = { last: e.clientX, v: 0 };
      self.spin = false;
      self._dragging = true;
      self.setPointerCapture(e.pointerId);
      self.style.cursor = 'grabbing';
      self._wake();
    });
    this.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.last; drag.last = e.clientX; drag.v = dx;
      self.anim.azT = clamp(self.anim.azT - dx * 0.0072, -1, 1);
      self._wake();
    });
    var end = function (e) {
      if (!drag) return;
      self.anim.azT = clamp(self.anim.azT - drag.v * 0.034, -1, 1);
      drag = null; self._dragging = false; self.style.cursor = 'grab';
      try { self.releasePointerCapture(e.pointerId); } catch (err) {}
      self._wake();
    };
    this.addEventListener('pointerup', end);
    this.addEventListener('pointercancel', end);
    this.addEventListener('wheel', function (e) {
      // the page must always be able to scroll past the stage — zoom only on a
      // deliberate pinch (ctrlKey) or a horizontal wheel
      if (self.state.view !== '3d') return;
      var pinch = e.ctrlKey, lateral = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!pinch && !lateral) return;
      e.preventDefault();
      self.anim.zoomT = clamp(self.anim.zoomT - (pinch ? e.deltaY : e.deltaX) * 0.0011, 0.86, 1.7);
      self._wake();
    }, { passive: false });
    var lastTap = 0;
    this.addEventListener('click', function () {
      var n = performance.now();
      if (n - lastTap < 320) { self.anim.zoomT = self.anim.zoomT > 1.12 ? 1 : 1.45; self._wake(); }
      lastTap = n;
    });
  };

  /* -------------------------------------------------------------------- API  */

  function api(el) {
    return {
      el: el,
      setWorld: function (world) {
        if (world === el.state.world) return;
        el._applyWorld(world, el.state.mode);
      },
      setMode: function (mode) {
        if (mode === el.state.mode) return;
        el._applyWorld(el.state.world, mode);
      },
      setView: function (v) {
        el.state.view = v;
        el.style.cursor = v === '3d' ? 'grab' : 'default';
        if (v === 'photos') { el.anim.azT = 0; el.anim.zoomT = 1.08; el.anim.pxT = 0; el.anim.pyT = 0; }
        else { el.anim.zoomT = 1; }
        el._paintCube();
        el._wake();
      },
      setAccent: function () { /* the seam reads as the world's own light, not the UI accent */ },
      setAngle: function (i) {
        var arc = [-0.8, 0, 0.8];
        el.anim.azT = arc[i] != null ? arc[i] : 0;
        el.anim.zoomT = 1; el.anim.pxT = 0; el.anim.pyT = 0;
        el.focused = null; el._wake();
      },
      nudge: function (dir) { el.anim.azT = clamp(el.anim.azT + dir * 0.5, -1, 1); el._wake(); },
      reset: function () {
        el.anim.azT = 0; el.anim.zoomT = 1; el.anim.pxT = 0; el.anim.pyT = 0;
        el.spin = false; el.spinDeg = 0;
        el.focused = null; el._wake();
      },
      setSpin: function (on) {
        el.spin = !!on && !REDUCED;
        if (el.spin) el._wake();
      },
      spinning: function () { return !!el.spin; },
      focus: function (id) {
        if (!id) { this.reset(); return; }
        var uv = HOTSPOT_UV[id], g = el.geom; if (!uv || !g) return;
        el.focused = id;
        var z = 2.05;
        el.anim.zoomT = z;
        el.anim.pxT = -(uv[0] - 0.5) * g.bw * (z - 1) / z * 1.25;
        el.anim.pyT = ((1 - uv[1]) * g.bh - g.bh * 0.5) * (z - 1) / z * 1.15;
        el._wake();
      },
      prefetch: function (w, m) { el.prefetch(w, m); },
      // Scrolled out of view the stage has nothing to do — drop its work to zero.
      setActive: function (on) {
        el._inactive = !on;
        if (on) el._wake();
      },
      // reference cube stands in for the model until chiron.glb lands
      useReferenceCube: function (on) { el.refCube = !!on; el._paintCube(); el._wake(); },
      usingReferenceCube: function () { return !!el.refCube; },

      /* ============================================================
         THE MESHY DROP-IN.  When assets/chiron.glb arrives:
             await XeroStage.loadModel('assets/chiron.glb');
             XeroStage.useModel(true);
         loadModel parses with NO WebGL context (zero GPU cost) — the
         renderer is created only on the first useModel(true).
         Auto-centres, auto-scales to a 1.89 m bounding box, fixes Y-up,
         and adds an emissive seam if the export has none.
         ============================================================ */
      loadModel: async function (url) {
        var GLTF = (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader;
        var DRACO = (await import('three/addons/loaders/DRACOLoader.js')).DRACOLoader;
        var T = await import('three');
        el.THREE = T;
        var l = new GLTF();
        var d = new DRACO(); d.setDecoderPath('https://unpkg.com/three@0.169.0/examples/jsm/libs/draco/');
        l.setDRACOLoader(d);
        var gltf = await l.loadAsync(url);
        var root = gltf.scene;

        var box = new T.Box3().setFromObject(root), size = box.getSize(new T.Vector3());
        if (size.z > size.y * 1.35) {                       // Y-up fix (Meshy sometimes exports Z-up)
          root.rotation.x = -Math.PI / 2; root.updateMatrixWorld(true);
          box.setFromObject(root); box.getSize(size);
        }
        root.scale.multiplyScalar(BIKE_LEN / Math.max(size.x, size.z));
        root.updateMatrixWorld(true);
        box.setFromObject(root);
        var c = box.getCenter(new T.Vector3());
        root.position.sub(new T.Vector3(c.x, box.min.y, c.z));

        var hasEmissive = false;
        root.traverse(function (o) {
          if (!o.isMesh) return;
          var m = o.material;
          if (m && m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.02) hasEmissive = true;
          if (m) m.envMapIntensity = 1.15;
        });
        if (!hasEmissive) {
          var seam = new T.Mesh(new T.TorusGeometry(BIKE_LEN * 0.22, 0.008, 8, 96),
            new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
          seam.name = 'ChironSeamFallback';
          seam.position.set(0, BIKE_LEN * 0.34, 0.16);
          seam.rotation.set(0.1, 0, 0.22);
          root.add(seam);
          el.modelSeam = seam;
        }
        el.model = root;
        console.info('[stage] GLB path verified —', url, '· fitted to', BIKE_LEN + 'm · no WebGL context created');
        return root;
      },

      useModel: function (on) {
        if (!el.model || !el.THREE) return false;
        if (on && !el.renderer) el._init3D();
        if (el.canvas) el.canvas.style.display = on ? 'block' : 'none';
        [el.iDay, el.iNight, el.iSeam].forEach(function (i) { i.style.display = on ? 'none' : ''; });
        if (on) el._wake();
        return true;
      },
      hasModel: function () { return !!el.model; },
      is3D: function () { return !!el.renderer; }
    };
  }

  /* -------- WebGL is created lazily and ONLY for a real model ---------------- */

  XeroStage.prototype._init3D = function () {
    var T = this.THREE, g = this.geom;
    var canvas = el('canvas', 'position:absolute;inset:0;width:100%;height:100%;display:block;');
    this.insertBefore(canvas, this.bike);
    this.canvas = canvas;
    var r = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping;
    this.renderer = r;
    var scene = new T.Scene(); this.scene = scene;
    scene.add(this.model);
    var key = new T.DirectionalLight(0xffffff, 2.2); key.position.set(2.4, 3.4, 2.6); scene.add(key);
    scene.add(new T.HemisphereLight(0xdfe6ff, 0x3a2f2a, 0.9));
    this.cam = new T.PerspectiveCamera(33, (g ? g.W / g.H : 1.6), 0.1, 60);
    var envKey = this.state.world + '-' + this.state.mode;
    if (this._env && this._env[envKey]) {
      var pm = new T.PMREMGenerator(r);
      var tex = new T.CanvasTexture(this._env[envKey]);
      tex.mapping = T.EquirectangularReflectionMapping;
      scene.environment = pm.fromEquirectangular(tex).texture;   // built once, cached
    }
  };

  XeroStage.prototype._render3D = function () {
    var g = this.geom, a = this.anim, T = this.THREE;
    this.renderer.setSize(g.W, g.H, false);
    this.cam.aspect = g.W / g.H; this.cam.updateProjectionMatrix();
    var d = 4.0 / a.zoom, az = a.az * 0.55, polar = 1.495;
    this.cam.position.set(Math.sin(az) * Math.sin(polar) * d, 0.62 + Math.cos(polar) * d, Math.cos(az) * Math.sin(polar) * d);
    this.cam.lookAt(0.38, 0.62, 0);
    this.renderer.render(this.scene, this.cam);
  };

  if (!customElements.get('xero-stage')) customElements.define('xero-stage', XeroStage);
})();
