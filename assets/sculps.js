(function () {
  'use strict';

  /* =========================================================
     Helpers
  ========================================================= */

  function formatPrice(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function qs(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function qsa(sel, ctx) {
    return Array.from((ctx || document).querySelectorAll(sel));
  }

  function postJSON(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  /* =========================================================
     1. Mobile Nav Toggle
  ========================================================= */

  function initMobileNav() {
    var hamBtn  = qs('#sculps-hamBtn');
    var mobNav  = qs('#sculps-mobNav');
    var mobClose = qs('#sculps-mobClose');

    if (!hamBtn || !mobNav) return;

    function openNav() {
      mobNav.classList.add('open');
      hamBtn.setAttribute('aria-expanded', 'true');
    }

    function closeNav() {
      mobNav.classList.remove('open');
      hamBtn.setAttribute('aria-expanded', 'false');
    }

    hamBtn.addEventListener('click', openNav);

    if (mobClose) mobClose.addEventListener('click', closeNav);

    qsa('#sculps-mobNav a').forEach(function (link) {
      link.addEventListener('click', closeNav);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobNav.classList.contains('open')) closeNav();
    });
  }

  /* =========================================================
     2. Cart Drawer
  ========================================================= */

  var cartDrawer  = null;
  var cartOverlay = null;
  var cartBody    = null;
  var cartFoot    = null;
  var cartCount   = null;
  var cartSubtotal = null;

  function openCartDrawer() {
    if (cartDrawer)  cartDrawer.classList.add('open');
    if (cartOverlay) cartOverlay.classList.add('open');
  }

  function closeCartDrawer() {
    if (cartDrawer)  cartDrawer.classList.remove('open');
    if (cartOverlay) cartOverlay.classList.remove('open');
  }

  function loadCart() {
    return fetch('/cart.js', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        renderCart(cart);
      })
      .catch(function (err) {
        console.error('SCULPS: loadCart error', err);
      });
  }

  function renderCart(cart) {
    // Update badge
    if (cartCount) {
      if (cart.item_count > 0) {
        cartCount.textContent = cart.item_count;
        cartCount.style.display = '';
      } else {
        cartCount.style.display = 'none';
      }
    }

    // Update subtotal
    if (cartSubtotal) {
      cartSubtotal.textContent = formatPrice(cart.total_price);
    }

    if (!cartBody) return;

    if (cart.items && cart.items.length > 0) {
      cartBody.innerHTML = cart.items.map(function (item) {
        var imgSrc = item.image ? item.image : '';
        var variantTitle = (item.variant_title && item.variant_title !== 'Default Title')
          ? item.variant_title : '';
        return (
          '<div class="sp-cart-item" data-key="' + item.key + '">' +
            '<img class="sp-cart-item-img" src="' + imgSrc + '" alt="' + escapeHtml(item.title) + '">' +
            '<div class="sp-cart-item-info">' +
              '<div class="sp-cart-item-name">' + escapeHtml(item.title) + '</div>' +
              '<div class="sp-cart-item-opts">' + escapeHtml(variantTitle) + '</div>' +
              '<div class="sp-cart-item-price">' + formatPrice(item.line_price) + '</div>' +
              '<div class="sp-cart-item-bottom">' +
                '<div class="sp-cart-item-qty">' +
                  '<button class="sp-cart-qty-btn" data-key="' + item.key + '" data-qty="' + item.quantity + '" data-delta="-1">&#8722;</button>' +
                  '<span class="sp-cart-qty-val">' + item.quantity + '</span>' +
                  '<button class="sp-cart-qty-btn" data-key="' + item.key + '" data-qty="' + item.quantity + '" data-delta="1">+</button>' +
                '</div>' +
                '<button class="sp-cart-item-remove" data-key="' + item.key + '">Remove</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      if (cartFoot) cartFoot.style.display = '';
    } else {
      cartBody.innerHTML = (
        '<div class="sp-cart-empty">' +
          '<div class="sp-cart-empty-h">Your bag is empty</div>' +
          '<p>Add something beautiful.</p>' +
        '</div>'
      );
      if (cartFoot) cartFoot.style.display = 'none';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initCartDrawer() {
    cartDrawer  = qs('#sculps-cartDrawer');
    cartOverlay = qs('#sculps-cartOverlay');
    cartBody    = qs('#sculps-cartBody');
    cartFoot    = qs('#sculps-cartFoot');
    cartCount   = qs('#sculps-cartCount');
    cartSubtotal = qs('#sculps-cartSubtotal');

    var cartBtn   = qs('#sculps-cartBtn');
    var cartClose = qs('#sculps-cartClose');

    if (cartBtn) {
      cartBtn.addEventListener('click', function () {
        loadCart().then(openCartDrawer);
      });
    }

    if (cartClose) cartClose.addEventListener('click', closeCartDrawer);
    if (cartOverlay) cartOverlay.addEventListener('click', closeCartDrawer);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && cartDrawer && cartDrawer.classList.contains('open')) {
        closeCartDrawer();
      }
    });

    // Load initial cart count on page load
    loadCart();
  }

  /* =========================================================
     3. Add to Cart (Global)
  ========================================================= */

  function addToCart(variantId, quantity, buttonEl) {
    var qty = quantity || 1;
    var btn = buttonEl || null;
    var originalText = btn ? btn.textContent : '';

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Adding...';
    }

    return postJSON('/cart/add.js', { id: parseInt(variantId, 10), quantity: qty })
      .then(function (r) {
        if (!r.ok) throw new Error('not ok');
        return r.json();
      })
      .then(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalText;
        }
        return loadCart();
      })
      .then(function () {
        openCartDrawer();
      })
      .catch(function (err) {
        console.error('SCULPS: addToCart error', err);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Out of stock';
          setTimeout(function () {
            btn.textContent = originalText;
          }, 2000);
        }
      });
  }

  function initAddToCart() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.sp-atc-btn');
      if (!btn) return;

      var variantId = btn.getAttribute('data-variant-id');
      if (!variantId) {
        // Try to get from hidden input
        var selected = qs('#sculps-selected-variant');
        if (selected) variantId = selected.value;
      }
      if (!variantId) return;

      var qty = parseInt(btn.getAttribute('data-quantity') || '1', 10);
      addToCart(variantId, qty, btn);
    });
  }

  /* =========================================================
     4. Cart Item Quantity Change
  ========================================================= */

  function initCartItemControls() {
    document.addEventListener('click', function (e) {
      // Quantity buttons
      var qtyBtn = e.target.closest('.sp-cart-qty-btn');
      if (qtyBtn && cartBody && cartBody.contains(qtyBtn)) {
        var key = qtyBtn.getAttribute('data-key');
        var delta = parseInt(qtyBtn.getAttribute('data-delta'), 10);
        var currentQty = parseInt(qtyBtn.getAttribute('data-qty'), 10);
        var newQty = Math.max(0, currentQty + delta);

        postJSON('/cart/change.js', { id: key, quantity: newQty })
          .then(function () { return loadCart(); })
          .catch(function (err) { console.error('SCULPS: qty change error', err); });
        return;
      }

      // Remove button
      var removeBtn = e.target.closest('.sp-cart-item-remove');
      if (removeBtn && cartBody && cartBody.contains(removeBtn)) {
        var removeKey = removeBtn.getAttribute('data-key');
        postJSON('/cart/change.js', { id: removeKey, quantity: 0 })
          .then(function () { return loadCart(); })
          .catch(function (err) { console.error('SCULPS: remove error', err); });
      }
    });
  }

  /* =========================================================
     5. Sticky Header Shadow
  ========================================================= */

  function initStickyHeader() {
    var header = qs('#sculps-header');
    if (!header) return;

    window.addEventListener('scroll', function () {
      if (window.scrollY > 10) {
        header.style.boxShadow = '0 2px 24px rgba(26,20,16,.1)';
      } else {
        header.style.boxShadow = '';
      }
    }, { passive: true });
  }

  /* =========================================================
     6. Countdown Timer
  ========================================================= */

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function initCountdownTimers() {
    var bars = qsa('.sp-cdt-bar[data-end]');
    if (!bars.length) return;

    bars.forEach(function (bar) {
      var endTs = parseInt(bar.getAttribute('data-end'), 10);
      if (!endTs) return;

      var nums = qsa('.sp-cdt-num', bar);
      // Expected order: days, hours, mins, secs
      var idxDays  = 0;
      var idxHours = 1;
      var idxMins  = 2;
      var idxSecs  = 3;

      function tick() {
        var now = Math.floor(Date.now() / 1000);
        var diff = endTs - now;

        if (diff <= 0) {
          bar.style.display = 'none';
          return;
        }

        var days  = Math.floor(diff / 86400);
        var hours = Math.floor((diff % 86400) / 3600);
        var mins  = Math.floor((diff % 3600) / 60);
        var secs  = diff % 60;

        if (nums[idxDays])  nums[idxDays].textContent  = pad2(days);
        if (nums[idxHours]) nums[idxHours].textContent = pad2(hours);
        if (nums[idxMins])  nums[idxMins].textContent  = pad2(mins);
        if (nums[idxSecs])  nums[idxSecs].textContent  = pad2(secs);

        setTimeout(tick, 1000);
      }

      tick();
    });
  }

  /* =========================================================
     7. Before/After Slider
  ========================================================= */

  function initBeforeAfterSliders() {
    var wraps = qsa('.sp-ba-wrap');
    if (!wraps.length) return;

    wraps.forEach(function (wrap) {
      var afterEl   = qs('.sp-ba-after', wrap);
      var dividerEl = qs('.sp-ba-divider', wrap);
      var dragging  = false;

      function getPercent(clientX) {
        var rect = wrap.getBoundingClientRect();
        var x = clientX - rect.left;
        var pct = Math.min(100, Math.max(0, (x / rect.width) * 100));
        return pct;
      }

      function applyPercent(pct) {
        if (afterEl)   afterEl.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
        if (dividerEl) dividerEl.style.left   = pct + '%';
      }

      // Initialize at 50%
      applyPercent(50);

      function onStart(e) {
        dragging = true;
        e.preventDefault();
      }

      function onMove(e) {
        if (!dragging) return;
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        applyPercent(getPercent(clientX));
      }

      function onEnd() {
        dragging = false;
      }

      wrap.addEventListener('mousedown', onStart);
      wrap.addEventListener('touchstart', onStart, { passive: false });

      document.addEventListener('mousemove', onMove);
      document.addEventListener('touchmove', onMove, { passive: false });

      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchend', onEnd);
    });
  }

  /* =========================================================
     8. Sticky Add to Cart Bar (via IntersectionObserver)
  ========================================================= */

  function initStickyAtcBar() {
    var bars = qsa('.sp-satc[data-trigger]');
    if (!bars.length || !window.IntersectionObserver) return;

    bars.forEach(function (bar) {
      var triggerSel = bar.getAttribute('data-trigger');
      if (!triggerSel) return;
      var triggerEl = qs(triggerSel);
      if (!triggerEl) return;

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            bar.classList.remove('visible');
          } else {
            bar.classList.add('visible');
          }
        });
      }, { threshold: 0 });

      observer.observe(triggerEl);
    });
  }

  /* =========================================================
     9. Size Guide Modal
  ========================================================= */

  function initSizeGuide() {
    var overlay = qs('#sp-sg-overlay');
    if (!overlay) return;

    var closeBtn = qs('#sp-sg-close');

    function openModal() {
      overlay.classList.add('open');
    }

    function closeModal() {
      overlay.classList.remove('open');
    }

    qsa('[data-open-sg]').forEach(function (el) {
      el.addEventListener('click', openModal);
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
    });
  }

  /* =========================================================
     10. FAQ Accordion
  ========================================================= */

  function initFaqAccordion() {
    var lists = qsa('.sp-faq-list');
    if (!lists.length) return;

    lists.forEach(function (list) {
      list.addEventListener('click', function (e) {
        var qEl = e.target.closest('.sp-faq-q');
        if (!qEl) return;

        var item   = qEl.closest('.sp-faq-item');
        var ansEl  = qs('.sp-faq-a', item);
        var isOpen = item.classList.contains('open');

        // Close all items in this list
        qsa('.sp-faq-item', list).forEach(function (otherItem) {
          if (otherItem !== item) {
            otherItem.classList.remove('open');
            var otherAns = qs('.sp-faq-a', otherItem);
            if (otherAns) otherAns.style.maxHeight = '0';
          }
        });

        // Toggle clicked item
        if (isOpen) {
          item.classList.remove('open');
          if (ansEl) ansEl.style.maxHeight = '0';
        } else {
          item.classList.add('open');
          if (ansEl) ansEl.style.maxHeight = ansEl.scrollHeight + 'px';
        }
      });
    });
  }

  /* =========================================================
     11. Product Image Gallery (PDP)
  ========================================================= */

  function initProductGallery() {
    var thumbs  = qsa('.sp-pdp-thumb');
    var mainImg = qs('#sp-main-img');
    if (!thumbs.length || !mainImg) return;

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        // Remove active from all
        thumbs.forEach(function (t) { t.classList.remove('active'); });
        thumb.classList.add('active');

        var newSrc = thumb.getAttribute('data-src');
        if (newSrc) {
          mainImg.style.opacity = '0';
          setTimeout(function () {
            mainImg.src = newSrc;
            mainImg.style.opacity = '1';
          }, 150);
        }
      });
    });
  }

  /* =========================================================
     12. Variant Selection (PDP)
  ========================================================= */

  function initVariantSelection() {
    var selectedInput = qs('#sculps-selected-variant');
    var mainImg       = qs('#sp-main-img');

    // Color/tone circles
    qsa('.sp-variant-circle').forEach(function (circle) {
      circle.addEventListener('click', function () {
        // Remove active from siblings (same parent)
        var siblings = qsa('.sp-variant-circle', circle.parentElement);
        siblings.forEach(function (s) { s.classList.remove('active'); });
        circle.classList.add('active');

        var variantId = circle.getAttribute('data-variant-id');
        if (variantId && selectedInput) selectedInput.value = variantId;

        var imgSrc = circle.getAttribute('data-image');
        if (imgSrc && mainImg) {
          mainImg.style.opacity = '0';
          setTimeout(function () {
            mainImg.src = imgSrc;
            mainImg.style.opacity = '1';
          }, 150);
        }

        var price = circle.getAttribute('data-price');
        if (price) updatePriceDisplay(parseInt(price, 10));

        updateStickyBar();
      });
    });

    // Size buttons
    qsa('.sp-size-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var container = btn.closest('.sp-size-btns');
        if (container) {
          qsa('.sp-size-btn', container).forEach(function (b) { b.classList.remove('active'); });
        }
        btn.classList.add('active');

        var variantId = btn.getAttribute('data-variant-id');
        if (variantId && selectedInput) selectedInput.value = variantId;

        var price = btn.getAttribute('data-price');
        if (price) updatePriceDisplay(parseInt(price, 10));

        updateStickyBar();
      });
    });
  }

  function updatePriceDisplay(cents) {
    var priceEl = qs('.sp-pdp-price') || qs('.sp-price');
    if (priceEl) priceEl.textContent = formatPrice(cents);
  }

  /* =========================================================
     13. Collection Filter
  ========================================================= */

  function initCollectionFilter() {
    var sizeFilters  = qsa('.sp-coll-filter-size');
    var colorFilters = qsa('.sp-coll-filter-circle');
    var cards        = qsa('.sp-coll-card');

    if (!cards.length) return;

    function getActiveFilters(els) {
      return els.filter(function (el) { return el.classList.contains('active'); })
                .map(function (el) { return el.getAttribute('data-value') || el.getAttribute('data-size') || el.getAttribute('data-tone') || el.getAttribute('data-color') || ''; });
    }

    function applyFilters() {
      var activeSizes  = getActiveFilters(sizeFilters);
      var activeTones  = getActiveFilters(colorFilters);

      cards.forEach(function (card) {
        var cardSizes  = (card.getAttribute('data-sizes')  || '').split(',').map(function (s) { return s.trim(); });
        var cardTones  = (card.getAttribute('data-tones')  || '').split(',').map(function (s) { return s.trim(); });
        var cardColors = (card.getAttribute('data-colors') || '').split(',').map(function (s) { return s.trim(); });

        var sizeMatch = !activeSizes.length || activeSizes.some(function (s) { return cardSizes.indexOf(s) !== -1; });
        var toneMatch = !activeTones.length || activeTones.some(function (t) {
          return cardTones.indexOf(t) !== -1 || cardColors.indexOf(t) !== -1;
        });

        if (sizeMatch && toneMatch) {
          card.classList.remove('sp-hidden');
          card.style.display = '';
        } else {
          card.classList.add('sp-hidden');
          card.style.display = 'none';
        }
      });
    }

    sizeFilters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.classList.toggle('active');
        applyFilters();
      });
    });

    colorFilters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.classList.toggle('active');
        applyFilters();
      });
    });
  }

  /* =========================================================
     14. Load More Button
  ========================================================= */

  function initLoadMore() {
    var loadMoreBtn = qs('#sp-load-more');
    if (!loadMoreBtn) return;

    var batchSize = parseInt(loadMoreBtn.getAttribute('data-batch') || '8', 10);

    function showNextBatch() {
      var hidden = qsa('.sp-coll-card.sp-hidden');
      var toShow = hidden.slice(0, batchSize);
      toShow.forEach(function (card) {
        card.classList.remove('sp-hidden');
        card.style.display = '';
      });

      // If no more hidden cards, hide the button
      var remaining = qsa('.sp-coll-card.sp-hidden');
      if (!remaining.length) {
        loadMoreBtn.style.display = 'none';
      }
    }

    loadMoreBtn.addEventListener('click', showNextBatch);
  }

  /* =========================================================
     15. Sticky ATC Bar – Mirror Selected Variant
  ========================================================= */

  function updateStickyBar() {
    var selectedInput = qs('#sculps-selected-variant');
    var satcBars      = qsa('.sp-satc');
    if (!satcBars.length) return;

    // Find the active variant title from size buttons or circles
    var activeSize = qs('.sp-size-btn.active');
    var activeTone = qs('.sp-variant-circle.active');

    satcBars.forEach(function (bar) {
      var nameEl  = qs('.sp-satc-name', bar);
      var priceEl = qs('.sp-satc-price', bar);

      if (nameEl) {
        var name = '';
        if (activeSize) name = activeSize.textContent.trim();
        else if (activeTone) name = activeTone.getAttribute('title') || activeTone.getAttribute('data-label') || '';
        if (name) nameEl.textContent = name;
      }

      if (priceEl) {
        var priceSource = activeSize || activeTone;
        if (priceSource) {
          var priceAttr = priceSource.getAttribute('data-price');
          if (priceAttr) priceEl.textContent = formatPrice(parseInt(priceAttr, 10));
        }
      }
    });
  }

  /* =========================================================
     16. Smooth Scroll for Anchor Links
  ========================================================= */

  function initSmoothScroll() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link) return;

      var href = link.getAttribute('href');
      if (!href || href === '#') return;

      var target = qs(href);
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* =========================================================
     17. Scroll-triggered Animations
  ========================================================= */

  function initScrollAnimations() {
    var els = qsa('[data-animate]');
    if (!els.length || !window.IntersectionObserver) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('sp-animated');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    els.forEach(function (el) { observer.observe(el); });
  }

  /* =========================================================
     Init
  ========================================================= */

  function init() {
    initMobileNav();
    initCartDrawer();
    initAddToCart();
    initCartItemControls();
    initStickyHeader();
    initCountdownTimers();
    initBeforeAfterSliders();
    initStickyAtcBar();
    initSizeGuide();
    initFaqAccordion();
    initProductGallery();
    initVariantSelection();
    initCollectionFilter();
    initLoadMore();
    initSmoothScroll();
    initScrollAnimations();
    initDataHrefLinks();
  }

  function initDataHrefLinks() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-href]');
      if (!el) return;
      var href = el.getAttribute('data-href');
      if (href) window.location.href = href;
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  /* =========================================================
     Public API
  ========================================================= */

  window.sculpsAddToCart = addToCart;

})();
