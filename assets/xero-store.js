/* XERO Chiron — storefront controller.
   Ports the design's logic class to vanilla JS. Everything the design animated through
   CSS custom properties still does; the cart is now Shopify's.

   - Day/night token crossfade  -> paints CSS vars on <html>, on demand only
   - Cart                       -> Shopify AJAX Cart API (/cart/add.js, change.js, cart.js)
   - Checkout                   -> Shopify checkout. No demo sheet.
   - Intro screen               -> once per session, sessionStorage-gated
   All handlers are delegated from data-act attributes, so section reordering in the
   theme editor never breaks a binding. */
(function () {
  'use strict';

  var EASE = 'cubic-bezier(.28,.11,.32,1)';
  var R = window.XERO_ROUTES || {};
  var CFG = window.XERO_SETTINGS || {};

  /* ── design tokens: the two palettes the hero crossfades between ────────────── */
  var TOK = {
    day: {
      pg: [238,238,239,1], glass: [245,245,247,.90], 'glass-b': [0,0,0,.055], solid: [247,247,249,1],
      pill: [255,255,255,.82], 'pill-b': [0,0,0,.05], knob: [255,255,255,1],
      chip: [255,255,255,.92], txt: [14,14,14,1], txt2: [85,86,92,1], txt3: [183,184,189,1],
      acc: [0,93,249,1], 'acc-fill': [58,130,251,1], hair: [0,0,0,.075],
      card: [255,255,255,.74], sub: [255,255,255,.46], ok: [47,177,78,1],
      shadow: [0,0,0,.10], vsel: [255,255,255,.66], vidle: [255,255,255,.5], vb: [0,0,0,.06],
      sheen: [255,255,255,.88], gloss: [255,255,255,.46], glow: [255,255,255,.22],
      liq1: [255,255,255,.85], liq2: [180,205,255,.55],
      stickybg: [255,255,255,.18], stickyrim: [255,255,255,.58],
      pg2: [232,232,236,1], rvb: [0,0,0,.06]
    },
    night: {
      pg: [26,27,31,1], glass: [13,13,15,.88], 'glass-b': [255,255,255,.075], solid: [20,20,23,1],
      pill: [30,31,36,.80], 'pill-b': [255,255,255,.08], knob: [46,47,55,1],
      chip: [30,31,37,.88], txt: [244,244,246,1], txt2: [169,170,177,1], txt3: [116,117,124,1],
      acc: [10,132,255,1], 'acc-fill': [64,156,255,1], hair: [255,255,255,.085],
      card: [26,27,32,.74], sub: [255,255,255,.05], ok: [52,208,88,1],
      shadow: [0,0,0,.45], vsel: [255,255,255,.045], vidle: [255,255,255,.035], vb: [255,255,255,.08],
      sheen: [255,255,255,.17], gloss: [255,255,255,.09], glow: [255,255,255,.04],
      liq1: [255,255,255,.10], liq2: [150,190,255,.14],
      stickybg: [20,20,24,.14], stickyrim: [255,255,255,.15],
      pg2: [16,16,19,1], rvb: [255,255,255,.08]
    }
  };

  function mix(a, b, t) {
    var o = [], i;
    for (i = 0; i < 3; i++) o.push(Math.round(a[i] + (b[i] - a[i]) * t));
    var al = (a[3] + (b[3] - a[3]) * t);
    return 'rgba(' + o[0] + ',' + o[1] + ',' + o[2] + ',' + al.toFixed(4) + ')';
  }
  function money(cents) {
    var f = window.XERO_MONEY_FORMAT || '${{amount}}';
    var v = (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var noDec = (cents / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return f.replace(/\{\{\s*amount\s*\}\}/g, v)
            .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, noDec)
            .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, v)
            .replace(/\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/g, noDec)
            .replace(/<[^>]*>/g, '');
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ── controller ─────────────────────────────────────────────────────────────── */
  var S = {
    world: 'studio', mode: 'night', view: '3d',
    variant: 0, addons: {}, focus: null, thumb: 0, app: 0,
    cart: { items: [], total: 0, count: 0 },
    cartOpen: false, menuOpen: false, mini: false, sticky: false,
    splash: false, spin: false
  };
  var nite = 1, niteT = 1, raf = 0, vars = {};
  var root = document.documentElement;
  var stage = null;

  function P() {
    return window.XERO_PRODUCT || { title: 'XERO Chiron', variants: [{ id: 0, title: 'Default', price: 499900 }] };
  }
  function addons() { return window.XERO_ADDONS || []; }
  function variants() { return (P().variants || []); }
  function currentVariant() { return variants()[S.variant] || variants()[0] || { price: 0, title: '' }; }

  function set(k, v) { if (vars[k] !== v) { vars[k] = v; root.style.setProperty(k, v); } }

  function paint() {
    var e = nite, D = TOK.day, N = TOK.night, k;
    for (k in D) set('--' + k, mix(D[k], N[k], e));
    set('--nite', e.toFixed(4));

    // stage + control state
    set('--seg-view', S.view === '3d' ? '0' : '1');
    set('--seg-mode', S.mode === 'day' ? '0' : '1');
    set('--seg-world', String(['studio', 'city', 'mars'].indexOf(S.world)));
    set('--drag', S.view === '3d' ? '1' : '0');
    var ph = S.view === 'photos' ? 1 : 0;
    set('--photoview', String(ph));
    set('--photoview-pe', ph ? 'auto' : 'none');
    for (var i = 0; i < 6; i++) {
      set('--ph' + i, i === S.thumb ? '1' : '0');
      set('--tb' + i, i === S.thumb ? mix(D.acc, N.acc, e) : mix(D.vb, N.vb, e));
    }
    // variant cards
    for (var v = 0; v < 2; v++) {
      var on = S.variant === v;
      set('--vb' + v, on ? mix(D.acc, N.acc, e) : mix(D.vb, N.vb, e));
      set('--vbg' + v, on ? mix(D.vsel, N.vsel, e) : mix(D.vidle, N.vidle, e));
      set('--vp' + v, on ? mix(D.acc, N.acc, e) : mix(D.txt, N.txt, e));
      set('--vr' + v, on ? mix(D.acc, N.acc, e) : mix(D.txt3, N.txt3, e));
      set('--vd' + v, on ? mix(D.acc, N.acc, e) : 'rgba(0,0,0,0)');
      set('--vs' + v, on ? '1' : '0');
    }
    // add-on switches
    var anyAddon = false;
    addons().forEach(function (a, i) {
      var on = !!S.addons[a.id];
      if (on) anyAddon = true;
      set('--sw' + i, on ? mix(D.acc, N.acc, e) : 'rgba(120,120,128,.22)');
      set('--swx' + i, on ? '1' : '0');
    });
    // Express checkout can only carry one variant. With add-ons selected it would quietly
    // under-charge and under-ship, so it steps aside and hands off to Buy now.
    set('--xpay-pe', anyAddon ? 'none' : 'auto');
    var payWrap = document.querySelector('[data-m="paybtn"]');
    if (payWrap) payWrap.style.opacity = anyAddon ? '.32' : '1';
    var note = document.querySelector('[data-ref="payNote"]');
    if (note) note.hidden = !anyAddon;
    // overlays
    set('--cart', S.cartOpen ? '1' : '0');
    set('--cart-pe', S.cartOpen ? 'auto' : 'none');
    set('--menu', S.menuOpen ? '1' : '0');
    set('--menu-pe', S.menuOpen ? 'auto' : 'none');
    var scrim = (S.cartOpen || S.menuOpen) ? 1 : 0;
    set('--scrim', String(scrim));
    set('--scrim-pe', scrim ? 'auto' : 'none');
    set('--mini', S.mini ? '1' : '0');
    set('--mini-pe', S.mini ? 'auto' : 'none');
    var stick = S.sticky && !S.cartOpen && !S.splash;
    set('--sticky', stick ? '1' : '0');
    set('--sticky-pe', stick ? 'auto' : 'none');
    set('--stickyb', stick ? '28px' : '0px');
    set('--stickys', stick ? '2.1' : '1');
    set('--stickybr', stick ? '1.06' : '1');
    set('--badge', S.cart.count ? '1' : '0');
    set('--splash', S.splash ? '1' : '0');
    set('--splash-vis', S.splash ? 'visible' : 'hidden');
    set('--splash-pe', S.splash ? 'auto' : 'none');
    set('--hot', (S.world === 'studio' && S.view === '3d' && !S.focus) ? '1' : '0');
    set('--spin', S.spin ? '1' : '0');

    // iOS app section: the selected row drives which screen the phone shows
    for (var p = 0; p < 5; p++) {
      var sel = p === S.app;
      set('--app' + p, sel ? '1' : '0');
      set('--apbg' + p, sel ? mix(D.vsel, N.vsel, e) : 'rgba(0,0,0,0)');
      set('--apb' + p, sel ? mix(D.acc, N.acc, e) : mix(D.vb, N.vb, e));
      set('--apn' + p, sel ? mix(D.acc, N.acc, e) : mix(D.txt3, N.txt3, e));
    }

    text('cartCount', String(S.cart.count));
    text('cartTotalText', money(S.cart.total));
    text('selectedTitle', currentVariant().title === 'Default Title' ? P().title : currentVariant().title);
    text('selectedPriceText', money(checkoutTotal()));
    text('focusLabel', S.focus || 'Drag to rotate');
  }

  function checkoutTotal() {
    var t = currentVariant().price || 0;
    addons().forEach(function (a) { if (S.addons[a.id]) t += a.price; });
    return t;
  }

  function text(name, val) {
    var n = document.querySelectorAll('[data-bind="' + name + '"]');
    for (var i = 0; i < n.length; i++) if (n[i].textContent !== val) n[i].textContent = val;
  }

  // the token crossfade only ticks while it is actually moving
  function wake() {
    niteT = S.mode === 'night' ? 1 : 0;
    if (raf) return;
    var last = performance.now();
    var loop = function (t) {
      var dt = Math.min(0.05, (t - last) / 1000); last = t;
      var dir = niteT > nite ? 1 : -1;
      nite = clamp(nite + dir * dt / 0.50, 0, 1);
      if ((dir > 0 && nite > niteT) || (dir < 0 && nite < niteT)) nite = niteT;
      paint();
      raf = nite === niteT ? 0 : requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  /* ── cart: Shopify AJAX API ─────────────────────────────────────────────────── */
  function readCart(data) {
    S.cart = {
      items: (data.items || []).map(function (i) {
        return { key: i.key, id: i.variant_id, title: i.product_title, variant: i.variant_title,
                 qty: i.quantity, line: i.line_price, img: i.image };
      }),
      total: data.total_price || 0,
      count: data.item_count || 0
    };
    renderCart();
    paint();
  }

  function fetchCart() {
    return fetch(R.cart, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); }).then(readCart)
      .catch(function (e) { console.warn('[xero] cart read failed', e); });
  }

  function addToCart() {
    var items = [{ id: currentVariant().id, quantity: 1 }];
    addons().forEach(function (a) { if (S.addons[a.id]) items.push({ id: a.id, quantity: 1 }); });
    if (!items[0].id) { console.warn('[xero] no variant id — assign a product to the stage section'); return; }
    flyToCart();
    fetch(R.cartAdd, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (r) { return r.json(); })
      .then(function () { return fetchCart(); })
      .then(function () { S.cartOpen = true; paint(); })
      .catch(function (e) { console.warn('[xero] add failed', e); });
  }

  function changeLine(key, qty) {
    fetch(R.cartChange, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ id: key, quantity: qty })
    }).then(function (r) { return r.json(); }).then(readCart)
      .catch(function (e) { console.warn('[xero] change failed', e); });
  }

  function buyNow() {
    var items = [{ id: currentVariant().id, quantity: 1 }];
    addons().forEach(function (a) { if (S.addons[a.id]) items.push({ id: a.id, quantity: 1 }); });
    fetch(R.cartAdd, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (r) {
      if (!r.ok) throw new Error('cart/add failed: ' + r.status);
      location.href = R.checkout;
    })
      /* Previously this navigated to checkout from the .catch as well, so a failed
         cart/add sent the buyer to an empty or stale checkout with no idea their item
         had not been added. On a $4,999 order that is the worst possible silent failure. */
      .catch(function (err) {
        console.error('[xero] could not start checkout', err);
        alert('Sorry - we could not start your checkout just then. Please try again, or email us and we will take the order by hand.');
      });
  }

  function renderCart() {
    var host = document.querySelector('[data-list="cartLines"]');
    var tpl = document.querySelector('[data-tpl="cartLine"]');
    var empty = document.querySelector('[data-when="cartEmpty"]');
    if (empty) empty.hidden = S.cart.count > 0;
    if (!host || !tpl) return;
    host.textContent = '';
    S.cart.items.forEach(function (line) {
      var el = tpl.content ? tpl.content.firstElementChild.cloneNode(true)
                           : tpl.firstElementChild.cloneNode(true);
      var q = function (n) { return el.querySelector('[data-line="' + n + '"]'); };
      if (q('title')) q('title').textContent = line.title;
      if (q('meta')) q('meta').textContent = line.variant && line.variant !== 'Default Title' ? line.variant : '';
      if (q('qty')) q('qty').textContent = String(line.qty);
      if (q('total')) q('total').textContent = money(line.line);
      var img = el.querySelector('img');
      if (img && line.img) { img.src = line.img; img.style.opacity = '1'; img.style.objectFit = 'cover'; img.style.inset = '0'; img.style.width = '100%'; img.style.height = '100%'; }
      el.querySelectorAll('[data-line-act]').forEach(function (b) {
        var act = b.getAttribute('data-line-act');
        b.addEventListener('click', function () {
          if (act === 'inc') changeLine(line.key, line.qty + 1);
          else if (act === 'dec') changeLine(line.key, Math.max(0, line.qty - 1));
          else if (act === 'remove') changeLine(line.key, 0);
        });
      });
      host.appendChild(el);
    });
  }

  function flyToCart() {
    var src = document.querySelector('[data-m="stage"]');
    var dst = document.querySelector('[data-ref="cartBtnRef"]');
    if (!src || !dst || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
    var dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;left:' + (a.left + a.width * .4) + 'px;top:' + (a.top + a.height * .5) +
      'px;width:1.1rem;height:1.1rem;border-radius:50%;background:var(--acc);z-index:120;pointer-events:none;' +
      'transition:transform .62s ' + EASE + ',opacity .62s ' + EASE + ';';
    document.body.appendChild(dot);
    requestAnimationFrame(function () {
      dot.style.transform = 'translate(' + (b.left + b.width / 2 - a.left - a.width * .4) + 'px,' +
        (b.top + b.height / 2 - a.top - a.height * .5) + 'px) scale(.3)';
      dot.style.opacity = '0';
    });
    setTimeout(function () { dot.remove(); }, 700);
  }

  /* ── performance: nothing animates off-screen ────────────────────────────────
     The review coaster is 26 cards each running a 24s transform loop, and the footer
     ticker runs forever. Left alone they composite continuously even when scrolled
     far out of view, which is what makes the page feel heavy. One IntersectionObserver
     parks every [data-anim] element the moment it leaves the viewport and restarts it
     on the way back in — the animation keeps its phase, so nothing jumps. */
  function idleAnimations() {
    var targets = document.querySelectorAll('[data-anim], [data-m="rvcard"]');
    if (!targets.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        e.target.style.animationPlayState = e.isIntersecting ? 'running' : 'paused';
      }
    }, { rootMargin: '200px 0px' });
    for (var i = 0; i < targets.length; i++) {
      targets[i].style.animationPlayState = 'paused';
      io.observe(targets[i]);
    }
  }

  /* The hero stage is the single most expensive thing on the page. Once it is scrolled
     away there is no reason for it to hold a live world layer or respond to anything. */
  function idleStage() {
    var hero = document.querySelector('[data-m="stage"]');
    if (!hero || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      var vis = entries[0].isIntersecting;
      hero.style.visibility = vis ? '' : 'hidden';   // drops it from the compositor
      if (stage && stage.setActive) stage.setActive(vis);
    }, { rootMargin: '120px 0px' });
    io.observe(hero);
  }

  /* ── review coaster: drag to scrub, with momentum ────────────────────────────
     The row auto-scrolls on a CSS marquee. A running animation outranks inline styles
     in the cascade, so dragging can't just write a transform — on grab we detach the
     animation entirely and take over, then on settle re-attach it with a negative
     animation-delay computed from where the row actually is, so it resumes seamlessly
     instead of snapping back. One rAF, only while the row is being thrown. */
  function coasterDrag() {
    var row = document.querySelector('[data-anim][style*="xmarq"]');
    if (!row) return;
    var wrap = row.parentElement;
    var DUR = 72;                                     // must match xmarqA in the CSS
    var off = 0, vel = 0, drag = null, raf2 = 0, half = 1;

    var measure = function () { half = (row.scrollWidth / 2) || 1; };
    measure();
    window.addEventListener('resize', measure);

    var apply = function () {
      off = ((off % half) + half) % half;
      row.style.transform = 'translate3d(' + (-off).toFixed(2) + 'px,0,0)';
    };
    // give the marquee back, phase-matched to the current offset
    var reattach = function () {
      row.style.animation = '';
      row.style.transform = '';
      row.style.animationDelay = (-(off / half) * DUR).toFixed(3) + 's';
      row.style.animationPlayState = 'running';
    };
    var spin = function () {
      if (drag) { raf2 = requestAnimationFrame(spin); return; }
      vel *= 0.94;
      off += vel;
      apply();
      if (Math.abs(vel) > 0.08) raf2 = requestAnimationFrame(spin);
      else { raf2 = 0; reattach(); }
    };

    wrap.style.cursor = 'grab';
    wrap.style.touchAction = 'pan-y';
    wrap.addEventListener('pointerdown', function (e) {
      measure();
      var m = new DOMMatrixReadOnly(getComputedStyle(row).transform);
      off = -m.m41;                                   // freeze exactly where it is
      row.style.animation = 'none';                   // detach so inline transform wins
      apply();
      drag = { x: e.clientX, moved: false };
      vel = 0;
      wrap.setPointerCapture(e.pointerId);
      wrap.style.cursor = 'grabbing';
    });
    wrap.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      drag.x = e.clientX;
      if (Math.abs(dx) > 1) drag.moved = true;
      off -= dx;
      vel = -dx;
      apply();
    });
    var release = function (e) {
      if (!drag) return;
      var moved = drag.moved;
      drag = null;
      wrap.style.cursor = 'grab';
      try { wrap.releasePointerCapture(e.pointerId); } catch (err) {}
      if (!raf2) raf2 = requestAnimationFrame(spin);
      if (moved) {                                    // a drag must not also click through
        var kill = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
        wrap.addEventListener('click', kill, { capture: true, once: true });
      }
    };
    wrap.addEventListener('pointerup', release);
    wrap.addEventListener('pointercancel', release);
  }

  /* ── actions ────────────────────────────────────────────────────────────────── */
  var ACT = {
    setView3d:     function () { S.view = '3d'; S.focus = null; if (stage) stage.setView('3d'); paint(); },
    setViewPhotos: function () { goPhotos(); },
    setDay:      function () { if (S.mode === 'day') return; S.mode = 'day'; if (stage) stage.setMode('day'); wake(); },
    setNight:    function () { if (S.mode === 'night') return; S.mode = 'night'; if (stage) stage.setMode('night'); wake(); },
    setStudio:   function () { setWorld('studio'); },
    setCity:     function () { setWorld('city'); },
    setMars:     function () { setWorld('mars'); },
    prevAngle:   function () { if (stage) stage.nudge(-1); },
    nextAngle:   function () { if (stage) stage.nudge(1); },
    resetView:   function () { S.focus = null; S.spin = false; if (stage) { stage.reset(); if (stage.setSpin) stage.setSpin(false); } paint(); },
    toggleSpin:  function () { S.spin = !S.spin; if (stage && stage.setSpin) stage.setSpin(S.spin); paint(); },
    addToCart:   addToCart,
    buyNow:      buyNow,
    payNow:      buyNow,          // accelerated checkout — Shopify owns the payment sheet
    toggleCart:  function () { S.cartOpen = !S.cartOpen; S.menuOpen = false; paint(); },
    toggleMenu:  function () { S.menuOpen = !S.menuOpen; S.cartOpen = false; paint(); },
    closeAll:    function () { S.cartOpen = false; S.menuOpen = false; paint(); },
    skipSplash:  closeSplash,
    goFilm:      function () { scrollTo('#film'); scrollTo('[data-sec="film"]'); },
    /* xero-breakdown.liquid renders data-sec="motion", not "breakdown", so this selector
       never matched anything and the Specs link silently did nothing. It now targets the
       explicit #specs anchor on that section, with the real data-sec as the fallback. */
    goSpecs:     function () { scrollTo('#specs') || scrollTo('[data-sec="motion"]'); }
  };
  // studio hotspots
  [['hotSeat','seat','Seat'],['hotTank','tank','Tank'],['hotPlate','plate','Front plate'],
   ['hotFork','fork','Fork'],['hotPanel','panel','Side panel'],['hotPeg','peg','Footpeg']]
    .forEach(function (h) {
      ACT[h[0]] = function () {
        S.focus = S.focus === h[2] ? null : h[2];
        if (stage) stage.focus(S.focus ? h[1] : null);
        paint();
      };
    });
  for (var t = 0; t < 6; t++) (function (i) { ACT['thumb' + i] = function () { setThumb(i); }; })(t);
  for (var p = 0; p < 5; p++) (function (i) { ACT['app' + i] = function () { S.app = i; paint(); }; })(p);
  for (var v = 0; v < 4; v++) (function (i) {
    ACT['pickVariant' + i] = function () {
      S.variant = i;
      // keep Shopify's accelerated checkout button on the same variant
      var hid = document.querySelector('[data-ref="payVariant"]');
      if (hid && currentVariant().id) hid.value = currentVariant().id;
      paint();
    };
  })(v);
  ACT.toggleKey = function () { toggleAddon(0); };
  ACT.toggleCharger = function () { toggleAddon(1); };

  function toggleAddon(i) {    var a = addons()[i]; if (!a) return;
    S.addons[a.id] = !S.addons[a.id];
    paint();
  }
  function setWorld(w) {
    if (w === S.world) return;
    S.world = w; S.focus = null;
    if (stage) { stage.setWorld(w); stage.reset(); }
    paint();
  }
  // The photo view is a white studio plate, so the world behind it switches to Studio
  // automatically — a city or mars panorama bleeding around a product shot looks wrong.
  function goPhotos() {
    S.view = 'photos'; S.focus = null; S.spin = false;
    if (S.world !== 'studio') { S.world = 'studio'; if (stage) stage.setWorld('studio'); }
    if (stage) { stage.setView('photos'); if (stage.setSpin) stage.setSpin(false); stage.reset(); }
    paint();
  }

  function setThumb(i) {
    S.thumb = i;
    goPhotos();
  }
  function scrollTo(sel) {
    var el = document.querySelector(sel); if (!el) return false;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 40, behavior: 'smooth' });
    return true;
  }
  function closeSplash() {
    if (!S.splash) return;
    S.splash = false; paint();
  }

  /* ── warm the panoramas ──────────────────────────────────────────────────────
     Studio is drawn as geometry and needs no download, but City and Mars are real
     images. Fetched on demand they leave the stage blank for as long as the download
     takes, which reads as "the world switcher is broken". So once the page is idle we
     pull them in the background, cheapest first: the 900px pair for every world (a few
     tens of KB, enough to paint instantly), then the full-size pair for whichever world
     the visitor is most likely to open next. Purely opportunistic — it never blocks
     first paint and never runs during a transition. */
  function warmWorlds() {
    if (!stage || !stage.prefetch) return;
    var run = function () {
      ['city', 'mars'].forEach(function (w) {
        ['day', 'night'].forEach(function (m) { stage.prefetch(w, m); });
      });
    };
    (window.requestIdleCallback || function (f) { setTimeout(f, 1200); })(run, { timeout: 2500 });
  }

  /* ── boot ───────────────────────────────────────────────────────────────────── */
  /* Pointer-tracking specular. The highlight follows the cursor across the glass and
     fades back when the pointer leaves — one custom property per move, no layout, no rAF. */
  function glassSheen() {
    var el = document.querySelector('[data-ref="stickyGlass"]');
    if (!el) return;
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--sx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
      el.style.setProperty('--sy', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
      el.style.setProperty('--spec', '.72');
    });
    el.addEventListener('pointerleave', function () {
      el.style.setProperty('--spec', '.34');
      el.style.setProperty('--sx', '50%');
      el.style.setProperty('--sy', '0%');
    });
  }

  function boot() {
    stage = window.XeroStage || null;

    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var fn = ACT[el.getAttribute('data-act')];
      if (fn) { if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href')[0] === '#') e.preventDefault(); fn(); }
    });

    // once-per-session intro
    var wants = CFG.splash !== false;
    var seen = false;
    try { seen = !!sessionStorage.getItem('xero.splash.v1'); } catch (e) { seen = true; }
    if (wants && !seen) {
      S.splash = true;
      try { sessionStorage.setItem('xero.splash.v1', '1'); } catch (e) {}
      setTimeout(closeSplash, CFG.splashMs || 3000);
    }

    var onScroll = function () {
      var narrow = window.innerWidth <= 900;
      var mini = narrow && window.scrollY > window.innerHeight * 0.62;
      var stick = !narrow && window.scrollY > window.innerHeight * 0.88;
      if (mini !== S.mini || stick !== S.sticky) { S.mini = mini; S.sticky = stick; paint(); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    paint();
    fetchCart();
    idleAnimations();
    idleStage();
    coasterDrag();
    glassSheen();
    if (stage) { stage.setWorld(S.world); stage.setMode(S.mode); }
    warmWorlds();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
