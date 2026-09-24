/**
 * Alibaba and 1688, as the desk sees them.
 *
 * One recipe for both because they are the same company and very nearly the
 * same page underneath: a supplier list, a product page, and a message
 * centre. 1688 is the Chinese domestic side — the prices Alex is actually
 * after — and it has no API at all, which is the whole reason this app is a
 * browser and not a fetch call.
 *
 * Alex signs into both himself. Nothing here types a password or reads one.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  var S = O.sites || (O.sites = {});
  if (S.alibaba) return;

  function text(el) {
    return el ? String(el.innerText || el.textContent || "").trim() : "";
  }

  function abs(href) {
    if (!href) return null;
    try { return new URL(href, location.href).href; } catch (e) { return null; }
  }

  /** "US $12.50 - 18.90" / "¥88.00" — whatever the row actually prints. */
  function priceIn(el) {
    var m = /(?:US\s*\$|\$|¥|￥)\s*([\d.,]+)(?:\s*[-~]\s*(?:US\s*\$|\$|¥|￥)?\s*([\d.,]+))?/.exec(text(el));
    if (!m) return null;
    var lo = Number(String(m[1]).replace(/,/g, ""));
    var hi = m[2] ? Number(String(m[2]).replace(/,/g, "")) : null;
    return Number.isFinite(lo) ? { low: lo, high: hi, currency: /[¥￥]/.test(m[0]) ? "CNY" : "USD" } : null;
  }

  S.alibaba = {
    match: function (host) {
      return /(^|\.)alibaba\.com$/.test(host) || /(^|\.)1688\.com$/.test(host);
    },

    site: function () {
      return /1688\.com$/.test(location.hostname) ? "1688" : "alibaba";
    },

    /** Signed in when the page offers an account rather than a sign-in link. */
    signedIn: function () {
      if (document.querySelector('a[href*="login"], .sign-in, #login-form')) {
        return Boolean(document.querySelector('[class*="member" i], [class*="account" i] [class*="name" i]'));
      }
      return true;
    },

    handle: function () {
      var el = document.querySelector('[class*="member" i] [class*="name" i], [class*="account" i] [class*="name" i]');
      var t = text(el);
      return t && t.length < 60 ? t : null;
    },

    /**
     * A search page's results: the product, the price the row shows, the
     * minimum order, and the supplier. Everything is read off the row — a
     * missing number stays null rather than becoming a zero.
     */
    results: function () {
      var cards = Array.prototype.slice.call(
        document.querySelectorAll(
          '[data-spm*="offer"], .organic-offer-wrapper, .list-no-v-tile, .J_offerCard, .offer-list-row, .space-offer-card-box',
        ),
      );
      if (!cards.length) {
        cards = Array.prototype.slice.call(document.querySelectorAll('a[href*="/product-detail/"], a[href*="offer/"]'))
          .map(function (a) { return a.closest("div") || a; });
      }
      var seen = Object.create(null);
      var out = [];
      for (var i = 0; i < cards.length && out.length < 40; i++) {
        var card = cards[i];
        var link = card.querySelector('a[href*="/product-detail/"], a[href*="offer/"], a[href]');
        var url = link ? abs(link.getAttribute("href")) : null;
        if (!url || seen[url]) continue;
        seen[url] = 1;
        var whole = text(card);
        var moqM = /(?:Min\.?\s*(?:Order|order)|起订量|最小起订量)\s*:?\s*([\d,]+)\s*([^\n]{0,14})/.exec(whole);
        out.push({
          url: url,
          title: (text(link) || whole).slice(0, 160),
          price: priceIn(card),
          moq: moqM ? { quantity: Number(moqM[1].replace(/,/g, "")), unit: (moqM[2] || "").trim() || null } : null,
          supplier: text(card.querySelector('[class*="supplier" i], [class*="company" i], [class*="seller" i]')) || null,
          years: (/(\d+)\s*(?:yrs|years|年)/.exec(whole) || [])[1] || null,
          site: S.alibaba.site(),
        });
      }
      return out;
    },

    /** The message centre's threads, when one is open on screen. */
    threads: function () {
      var rows = Array.prototype.slice.call(
        document.querySelectorAll('[class*="conversation" i] li, [class*="session-list" i] li, [class*="chat-list" i] li'),
      );
      var out = [];
      for (var i = 0; i < rows.length && out.length < 40; i++) {
        var lines = text(rows[i]).split("\n").filter(Boolean);
        if (!lines.length) continue;
        out.push({ who: lines[0].slice(0, 80), last: lines.length > 1 ? lines[1].slice(0, 200) : null, unread: 0 });
      }
      return out;
    },

    messages: function () {
      var rows = Array.prototype.slice.call(
        document.querySelectorAll('[class*="message-item" i], [class*="msg-item" i], [class*="chat-message" i]'),
      );
      var out = [];
      for (var i = Math.max(0, rows.length - 40); i < rows.length; i++) {
        var t = text(rows[i]);
        if (!t) continue;
        out.push({ mine: /self|right|mine|out/i.test(rows[i].className || ""), text: t.slice(0, 1200), at: null });
      }
      return out;
    },

    composer: function () {
      return document.querySelector(
        'textarea[class*="input" i], [contenteditable="true"][class*="editor" i], textarea[placeholder]',
      );
    },
  };
})(window);
