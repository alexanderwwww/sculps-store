/**
 * Depop, as the shop sees it.
 *
 * This is the one that earns, so the rule from the Fiverr desk carries over
 * unchanged and for a stronger reason: Depop does not permit third-party
 * automation and enforces it on BEHAVIOUR rather than tooling. Shops die from
 * rhythm — bot-speed following, refreshing hundreds of times an hour, blast
 * messaging — so nothing here sends, sells, follows or mass-anything. It reads
 * what is on the shop floor and it types where Alex tells it to. The pressing
 * is his.
 *
 * Every selector below is a guess at somebody else's markup, and Depop rewrites
 * its front end often. So each reader tries several and stops at the first that
 * gives something defensible; when none do, the answer is null or [] and never
 * a zero, a made-up price, or an invented date. A wrong price on this screen is
 * a real item sold for real money at the wrong number.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  var S = O.sites || (O.sites = {});
  if (S.depop) return;

  function text(el) {
    return el ? String(el.innerText || el.textContent || "").trim() : "";
  }
  function flat(el) {
    return text(el).replace(/\s+/g, " ");
  }
  function abs(href) {
    if (!href) return null;
    try { return new URL(href, location.href).href; } catch (e) { return null; }
  }
  function one(sels, scope) {
    for (var i = 0; i < sels.length; i++) {
      var el;
      try { el = (scope || document).querySelector(sels[i]); } catch (e) { continue; }
      if (el) return el;
    }
    return null;
  }
  function all(sels, scope) {
    var out = [], seen = [];
    for (var i = 0; i < sels.length; i++) {
      var hits;
      try { hits = (scope || document).querySelectorAll(sels[i]); } catch (e) { continue; }
      for (var j = 0; j < hits.length; j++) {
        if (seen.indexOf(hits[j]) >= 0) continue;
        seen.push(hits[j]); out.push(hits[j]);
      }
    }
    return out;
  }

  /**
   * "£45", "$1,200.00", "€38,50" → cents. Null when there is no number.
   *
   * Depop shows the viewer's own currency and European pages use a comma for
   * the decimal, so both separators are handled — and when a string carries
   * both, the LAST one is the decimal. Getting this wrong turns £1,200 into
   * £1.20, which is the worst bug this file could have.
   */
  function moneyCents(s) {
    var m = /([\d.,]+)/.exec(String(s || "").replace(/\s/g, ""));
    if (!m) return null;
    var raw = m[1];
    var lastDot = raw.lastIndexOf("."), lastComma = raw.lastIndexOf(",");
    var cut = Math.max(lastDot, lastComma);
    var whole, frac = "";
    if (cut >= 0 && raw.length - cut - 1 <= 2 && raw.length - cut - 1 > 0) {
      whole = raw.slice(0, cut).replace(/[.,]/g, "");
      frac = raw.slice(cut + 1);
    } else {
      whole = raw.replace(/[.,]/g, "");
    }
    if (!/^\d+$/.test(whole)) return null;
    var cents = parseInt(whole, 10) * 100 + (frac ? parseInt((frac + "0").slice(0, 2), 10) : 0);
    return Number.isFinite(cents) ? cents : null;
  }

  /** The currency as shown, so nothing is ever converted silently. */
  function currency(s) {
    var m = /(£|\$|€)/.exec(String(s || ""));
    return m ? m[1] : null;
  }

  /** "2 weeks ago", "3d", "yesterday" → minutes, best effort, else null. */
  function agoMinutes(s) {
    var t = String(s || "").toLowerCase().trim();
    if (!t) return null;
    if (/just now|now$/.test(t)) return 0;
    if (/yesterday/.test(t)) return 1440;
    var m = /(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|week|weeks|mo|month|months|y|year|years)\b/.exec(t);
    if (!m) return null;
    var n = parseInt(m[1], 10), unit = m[2][0];
    if (unit === "m" && /^mo/.test(m[2])) return n * 43200;
    if (unit === "m") return n;
    if (unit === "h") return n * 60;
    if (unit === "d") return n * 1440;
    if (unit === "w") return n * 10080;
    if (unit === "y") return n * 525600;
    return null;
  }

  function isLoginPage() {
    if (/\/login|\/signup/.test(location.pathname)) return true;
    return !!one(['input[type="password"]']);
  }

  S.depop = {
    match: function (host) {
      return /(^|\.)depop\.com$/.test(host);
    },

    site: function () { return "depop"; },

    isLoginPage: isLoginPage,

    /**
     * Signed in, in layers, because Depop serves a shop page to a stranger and
     * to its owner with much of the same furniture:
     *   1. a password box on screen — definitely not
     *   2. the account menu, the sell button, or a link to /messages
     *   3. otherwise false, because "probably signed in" is how a shop posts
     *      as nobody.
     */
    signedIn: function () {
      if (isLoginPage()) return false;
      if (one([
        'a[href*="/messages"]',
        'a[href="/sell/"]',
        '[data-testid*="account" i]',
        '[aria-label*="account" i]',
        'button[aria-label*="profile" i]',
      ])) return true;
      return false;
    },

    /** The shop's own handle, when the page states it. Never invented. */
    who: function () {
      var a = one(['a[href^="/"][data-testid*="profile" i]', 'header a[href^="/"][href$="/"]']);
      var href = a && a.getAttribute("href");
      var m = href && /^\/([A-Za-z0-9_.-]{2,})\/?$/.exec(href);
      return m ? "@" + m[1] : null;
    },

    statusUrl: "https://www.depop.com/messages/",

    /** Where the composer is, per screen, so the hands know what to open. */
    composer: function () {
      return one([
        'textarea[placeholder*="message" i]',
        'textarea[name="message"]',
        '[contenteditable="true"][role="textbox"]',
        'textarea',
      ]);
    },

    /**
     * What the shop needs, as rows.
     *
     * Three kinds, and the reader says which is which rather than leaving the
     * brain to guess from shape:
     *   message — a buyer said something and nobody has answered
     *   listing — something live, with how long it has sat and how many likes
     *   draft   — an item with no listing yet
     *
     * A row without a usable id is dropped. An id is how everything else in
     * this app refers to a thing, and a row nobody can act on is noise on his
     * screen.
     */
    results: function () {
      var rows = [];
      var path = location.pathname;

      /* The inbox. Unread first — those are the ones that cost ranking. */
      if (/\/messages/.test(path)) {
        var threads = all([
          '[data-testid*="conversation" i]',
          'a[href*="/messages/"]',
          'li[class*="conversation" i]',
        ]);
        for (var i = 0; i < threads.length; i++) {
          var el = threads[i];
          var href = abs(el.getAttribute && el.getAttribute("href"));
          var line = flat(el);
          if (!href && !line) continue;
          var who = flat(one(['[class*="username" i]', '[data-testid*="username" i]', 'strong', 'h3'], el));
          var when = flat(one(['time', '[class*="time" i]', '[class*="date" i]'], el));
          rows.push({
            kind: "message",
            id: href || ("thread-" + i),
            url: href,
            buyer: who || null,
            line: line || null,
            waitingMinutes: agoMinutes(when),
            // Depop marks unread differently across builds; when nothing says
            // so the answer is null rather than a cheerful false.
            unread: /unread/i.test(el.className || "") ? true : null,
          });
        }
        return rows;
      }

      /* The shop floor: what is live, what it costs, what it has attracted. */
      var cards = all([
        '[data-testid*="product" i]',
        'li[class*="styles__ProductCard" i]',
        'a[href*="/products/"]',
      ]);
      for (var j = 0; j < cards.length; j++) {
        var card = cards[j];
        var link = card.matches && card.matches('a[href*="/products/"]')
          ? card
          : one(['a[href*="/products/"]'], card);
        var url = abs(link && link.getAttribute("href"));
        if (!url) continue;
        var priceText = flat(one([
          '[data-testid*="price" i]', '[class*="price" i]', 'p[aria-label*="price" i]',
        ], card));
        var likesText = flat(one(['[data-testid*="like" i]', '[class*="like" i]'], card));
        var likes = /(\d+)/.exec(likesText);
        var sold = /sold/i.test(flat(card));
        rows.push({
          kind: "listing",
          id: url,
          url: url,
          title: flat(one(['h2', 'h3', '[class*="title" i]', 'img[alt]'], card)) ||
                 (one(['img[alt]'], card) || {}).alt || null,
          priceCents: moneyCents(priceText),
          currency: currency(priceText),
          likes: likes ? parseInt(likes[1], 10) : null,
          sold: sold,
          // Depop does not print an age on a card. Null, and the brain works
          // it out from its own history rather than from a guess made here.
          listedMinutesAgo: null,
        });
      }
      return rows;
    },

    /** One conversation, as messages, oldest first. */
    messages: function () {
      var out = [];
      var items = all([
        '[data-testid*="message" i]',
        '[class*="MessageBubble" i]',
        '[class*="message" i] p',
      ]);
      for (var i = 0; i < items.length; i++) {
        var line = flat(items[i]);
        if (!line) continue;
        out.push({
          line: line,
          // Whose it is, when the markup says so. Guessing this puts words in
          // the buyer's mouth, so it stays null when unknown.
          mine: /own|outgoing|sent/i.test(items[i].className || "") ? true : null,
        });
      }
      return out;
    },

    /** Open a conversation by its url, without leaving the app. */
    openThread: function (url) {
      var target = abs(url);
      if (!target) return { ok: false, error: "no url" };
      location.href = target;
      return { ok: true, url: target };
    },

    /** Enough to say on the glass what the shop is doing. */
    readStatus: function () {
      return {
        site: "depop",
        signedIn: S.depop.signedIn(),
        who: S.depop.who(),
        where: location.pathname,
      };
    },

    /** Exposed so the numbers can be tested away from a live page. */
    parse: { moneyCents: moneyCents, agoMinutes: agoMinutes, currency: currency },
  };
})(window);
