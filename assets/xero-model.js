/* XERO - 3D model activation, framing and a FREE turntable.
   Loaded after xero-stage.js and xero-store.js. Patches, never forks, the stage.

   ==========================================================================
   SKIN: the GLB's own emissive atlas, or an edited version of it.
   ==========================================================================
   The GLB carries its colour atlas in the EMISSIVE slot (mis-tagged by the
   exporter). window.XERO_TEXTURE_URL is an edited version of that exact atlas,
   painted over the same UV layout, and retexture() rebinds it onto emissiveMap -
   same look as the pure GLB, just the edited pixels. Leave XERO_TEXTURE_URL ""
   and the baked map is used untouched. It NEVER stacks a base-colour overlay on
   top the way the old broken build did.

   ==========================================================================
   THE ORBIT IS HORIZONTAL 360 ONLY. Elevation is LOCKED.
   ==========================================================================
     - yaw:   unlimited, wraps - a clean turntable.
     - pitch: fixed at PITCH_HOME. No tilt up or down, so the camera can never
              show the top or the underside (which read as broken).

   AUTOROTATE: on by default, a steady turntable, until the visitor GRABS the
   bike (pointerdown) - then it holds where they leave it. The round autorotate
   button (data-act="toggleSpin", re-shown in xero-fix.css) turns it back on.

   ROOT-CAUSE NOTES kept from before:
     - normalise() undoes the stage's TALL-model Y-up heuristic (a bike is longer
       than tall) and re-fits to 1.89 m, centred and grounded.
     - guardContext() handles WebGL context loss/restore so the canvas can rebuild. */
(function () {
  'use strict';

  /* ---- framing ---- */
  var FRAME_X = 0.191;    // shift subject left of the buy box on desktop
  var FRAME_Y = -0.03;
  var DIST = 5.10;        // camera distance in metres
  var TARGET_Y = 0.56;
  var BIKE_LEN = 1.89;
  var FLIP_Y = 0;
  var NARROW = 900;

  /* ---- orbit ---- */
  var YAW_HOME = 0.62;              // resting angle (front three-quarter)
  var PITCH_HOME = 1.38;            // fixed elevation (just above the horizon)
  var PITCH_MIN = 1.38;            // elevation is LOCKED: horizontal 360 only.
  var PITCH_MAX = 1.38;            // no tilt up or down, so the top/underside never show.
  var YAW_SENS = 0.0085;           // radians per px, horizontal drag

  /* ---- autorotate ---- */
  var SPIN_SPEED = 0.42;           // radians / second (~15s per full turn)

  var MODEL_URL = 'https://cdn.shopify.com/3d/models/o/ffa775409b18ef79/XERO_Chiron.glb';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clampPitch(p) { return clamp(p, PITCH_MIN, PITCH_MAX); }

  /* ---- THREE-free world-space bounds ---- */
  function worldBounds(root) {
    var min = { x: Infinity, y: Infinity, z: Infinity };
    var max = { x: -Infinity, y: -Infinity, z: -Infinity };
    root.updateMatrixWorld(true);
    root.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      var g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      var bb = g.boundingBox;
      if (!bb) return;
      var e = o.matrixWorld.elements;
      for (var i = 0; i < 8; i++) {
        var x = (i & 1) ? bb.max.x : bb.min.x;
        var y = (i & 2) ? bb.max.y : bb.min.y;
        var z = (i & 4) ? bb.max.z : bb.min.z;
        var wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        var wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        var wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (wx < min.x) min.x = wx; if (wx > max.x) max.x = wx;
        if (wy < min.y) min.y = wy; if (wy > max.y) max.y = wy;
        if (wz < min.z) min.z = wz; if (wz > max.z) max.z = wz;
      }
    });
    return (min.x === Infinity) ? null : { min: min, max: max };
  }

  function normalise(S) {
    var e = S.el, m = e && e.model;
    if (!m) return;
    try {
      m.rotation.x = 0;
      m.rotation.z = 0;
      m.rotation.y = FLIP_Y;

      var b = worldBounds(m);
      if (!b) return;
      var span = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      if (span > 0.001) m.scale.multiplyScalar(BIKE_LEN / span);

      b = worldBounds(m);
      if (!b) return;
      m.position.x -= (b.min.x + b.max.x) / 2;
      m.position.z -= (b.min.z + b.max.z) / 2;
      m.position.y -= b.min.y;
      m.updateMatrixWorld(true);
    } catch (err) {
      console.warn('[xero] model normalise skipped', err);
    }
  }

  function hideSprite(e) {
    [e.iDay, e.iNight, e.iSeam].forEach(function (i) { if (i) { i.style.display = 'none'; i.style.opacity = '0'; } });
  }

  /* ==========================================================================
     RETEXTURE - swap the EMISSIVE (skin) map at runtime.
     ==========================================================================
     The GLB's colour atlas is carried in its EMISSIVE slot (mis-tagged by the
     exporter), which is why the bike self-illuminates. window.XERO_TEXTURE_URL is
     an edited version of that exact atlas, painted over the same UV layout. We
     rebind it onto emissiveMap so the look is identical to the pure GLB, just with
     the edited pixels. Leave XERO_TEXTURE_URL "" to fall back to the baked map.

     flipY=false      glTF UV origin is opposite three.js's default; true = upside down.
     colorSpace sRGB  the atlas is authored sRGB; linear renders washed out.
     emissive factor  left as the GLB set it, so brightness matches the baked look. */
  function retexture(S) {
    var e = S.el;
    var url = window.XERO_TEXTURE_URL;
    var T = e && e.THREE;
    if (!url || !T || !e.model) return;

    var loader = new T.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url, function (tex) {
      tex.flipY = false;
      if ('colorSpace' in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      else if ('encoding' in tex && T.sRGBEncoding) tex.encoding = T.sRGBEncoding;   // pre-r152
      tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
      tex.generateMipmaps = true;
      if (e.renderer && e.renderer.capabilities) {
        tex.anisotropy = Math.min(8, e.renderer.capabilities.getMaxAnisotropy());
      }
      tex.needsUpdate = true;

      var n = 0;
      e.model.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) {
          if (!m || !('emissiveMap' in m)) return;
          m.emissiveMap = tex;
          // if the export shipped a black emissive factor the map would be invisible;
          // only then force it to white so the skin actually shows.
          if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) === 0 && m.emissive.setRGB) m.emissive.setRGB(1, 1, 1);
          if ('emissiveIntensity' in m && !m.emissiveIntensity) m.emissiveIntensity = 1;
          m.needsUpdate = true;
          n++;
        });
      });
      if (e.renderer) e._frame();
      console.info('[xero] edited skin applied to ' + n + ' emissive material(s)');
    }, undefined, function (err) {
      console.error('[xero] skin texture failed to load, keeping the GLB original:', url, err);
    });
  }

  /* ---- WebGL context lifecycle ---- */
  function guardContext(S) {
    var e = S.el;
    var c = e && e.canvas;
    if (!c || c._xeroGuarded) return;
    c._xeroGuarded = true;

    var rebuilding = false;
    var rebuild = function () {
      if (rebuilding) return;
      rebuilding = true;
      try {
        var old = e.canvas;
        if (old && old.parentNode) old.parentNode.removeChild(old);
        e.canvas = null; e.renderer = null; e.scene = null; e.cam = null;

        if (!S.useModel(true)) { console.error('[xero] could not rebuild the 3D context'); return; }
        hideSprite(e);
        e.setAttribute('data-model', 'on');
        guardContext(S);
        if (e._frame) e._frame();
        console.info('[xero] WebGL context restored - viewer rebuilt');
      } catch (err) {
        console.error('[xero] context rebuild failed', err);
      }
    };

    c.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      console.warn('[xero] WebGL context lost - attempting recovery');
      setTimeout(function () { if (!e.renderer || !e.canvas) return; rebuild(); }, 1200);
    }, false);
    c.addEventListener('webglcontextrestored', rebuild, false);
  }

  /* ---- patches on the element class ----
     _render3D is the free-orbit camera: full yaw, tilt clamped off the poles. */
  function patchClass() {
    var Stage = window.customElements && customElements.get('xero-stage');
    if (!Stage) return false;
    if (Stage.prototype._xeroOrbit) return true;
    Stage.prototype._xeroOrbit = true;

    var origPaint = Stage.prototype._paintCube;
    Stage.prototype._paintCube = function () {
      origPaint.call(this);
      hideSprite(this);
    };

    Stage.prototype._render3D = function () {
      var g = this.geom;
      if (!g || !this.renderer || !this.cam) return;

      this.renderer.setSize(g.W, g.H, false);
      this.cam.aspect = g.W / g.H;

      var wide = window.innerWidth > NARROW;
      this.cam.setViewOffset(g.W, g.H, wide ? g.W * FRAME_X : 0, g.H * FRAME_Y, g.W, g.H);
      this.cam.updateProjectionMatrix();

      if (this._yaw == null) this._yaw = YAW_HOME;
      if (this._pitch == null) this._pitch = PITCH_HOME;

      var yaw = this._yaw;
      var pitch = clampPitch(this._pitch);

      this.cam.position.set(
        Math.sin(yaw) * Math.sin(pitch) * DIST,
        TARGET_Y + Math.cos(pitch) * DIST,
        Math.cos(yaw) * Math.sin(pitch) * DIST
      );
      this.cam.lookAt(0, TARGET_Y, 0);
      this.renderer.render(this.scene, this.cam);
    };
    return true;
  }

  /* ---- drag: free orbit, yaw + pitch. Pauses the autorotate. --------------- */
  function bindOrbit(S) {
    var e = S.el;
    if (!e || e._xeroOrbitBound) return;
    e._xeroOrbitBound = true;
    if (e._yaw == null) e._yaw = YAW_HOME;
    if (e._pitch == null) e._pitch = PITCH_HOME;

    var drag = null;

    e.addEventListener('pointerdown', function (ev) {
      if (e.state.view !== '3d' || !e.model) return;
      e._autoRotate = false;                 // grab holds the bike where it is
      drag = { x: ev.clientX, y: ev.clientY };
    });

    e.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      // horizontal only - yaw spins a full 360; elevation is locked (no top/underside).
      e._yaw = e._yaw - (ev.clientX - drag.x) * YAW_SENS;
      drag.x = ev.clientX; drag.y = ev.clientY;
      if (e.renderer) e._frame();
    });

    var release = function () { drag = null; };
    e.addEventListener('pointerup', release);
    e.addEventListener('pointercancel', release);
    window.addEventListener('resize', function () { if (e.renderer) e._frame(); });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && e.renderer) e._frame();
    });

    var origReset = S.reset;
    S.reset = function () {
      e._yaw = YAW_HOME;
      e._pitch = PITCH_HOME;
      origReset.call(S);
      if (e.renderer) e._frame();
    };

    var origNudge = S.nudge;
    S.nudge = function (dir) {
      if (e.model && e.renderer) { e._autoRotate = false; e._yaw = e._yaw - dir * Math.PI / 5; e._frame(); }
      else origNudge.call(S, dir);
    };
  }

  /* ---- autorotate -----------------------------------------------------------
     A steady full turntable, on by default. Owns its own rAF so it is reliable on
     mobile (the stage's own spin path bailed on _inactive). The round autorotate
     button calls stage.setSpin(bool) via store.js; we route that to _autoRotate. */
  function autoRotate(S) {
    var e = S.el;
    if (!e || e._xeroSpin) return;
    e._xeroSpin = true;

    e._autoRotate = !REDUCED;                 // ON by default
    e.spin = false; e.spinDeg = 0;            // keep the stage's sprite-spin out of it

    var last = null, raf = 0;

    function tick(now) {
      raf = 0;
      if (last === null) last = now;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (e._autoRotate && !document.hidden && e.renderer && e.state && e.state.view === '3d') {
        e._yaw += SPIN_SPEED * dt;
        e._frame();
      }
      // keep the loop alive so the button can resume without a re-kick
      raf = requestAnimationFrame(tick);
    }
    function kick() { if (!raf) { last = null; raf = requestAnimationFrame(tick); } }

    // route the on-page autorotate button (store.js -> stage.setSpin) to us
    var origSetSpin = S.setSpin;
    S.setSpin = function (on) {
      e._autoRotate = !!on && !REDUCED;
      if (e._autoRotate) kick();
      if (origSetSpin) try { origSetSpin.call(S, false); } catch (err) {}  // never let the sprite spin
    };

    document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[entries.length - 1].isIntersecting) kick();
      }, { rootMargin: '10% 0px' }).observe(e);
    }
    kick();
  }

  /* ---- view tagging ---- */
  function tagView(S) {
    var e = S.el; if (!e) return;
    var v = (e.state && e.state.view) || '3d';
    e.setAttribute('data-view', v);
    document.documentElement.setAttribute('data-xero-view', v);
  }

  function patchView(S) {
    if (S._viewTagged) return;
    S._viewTagged = true;
    var orig = S.setView;
    S.setView = function (v) { orig.call(S, v); tagView(S); };
    tagView(S);
  }

  /* ---- boot ---- */
  function mount() {
    var S = window.XeroStage;
    if (!S || !S.loadModel) { console.warn('[xero] stage not ready, keeping sprite'); return; }
    var url = window.XERO_MODEL_URL || MODEL_URL;

    patchClass();
    patchView(S);
    hideSprite(S.el);

    S.loadModel(url).then(function () {
      if (S.el && S.el.modelSeam) { S.el.modelSeam.visible = false; if (S.el.modelSeam.parent) S.el.modelSeam.parent.remove(S.el.modelSeam); }
      normalise(S);
      S.useModel(true);
      S.el.setAttribute('data-model', 'on');
      guardContext(S);
      retexture(S);              // rebinds edited emissive skin if XERO_TEXTURE_URL is set
      bindOrbit(S);
      tagView(S);
      autoRotate(S);
      if (S.el.renderer) S.el._frame();
      console.info('[xero] 3D live - free orbit, autorotate on, edited skin');
    }).catch(function (err) {
      console.error('[xero] model load failed', err);
    });
  }

  if (window.XeroStage) mount();
  else document.addEventListener('stage-ready', mount, { once: true });
})();
