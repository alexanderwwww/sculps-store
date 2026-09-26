/**
 * Fiverr, as the desk sees it.
 *
 * The other desks in this app are for spending money. This one is for earning
 * it, which changes almost nothing about how it is read and everything about
 * what it must never do.
 *
 * Fiverr bans fully automated order fulfilment, says so plainly, and looks for
 * it. So nothing here delivers an order, accepts one, or sends a message. It
 * reads: what is waiting, who is asking, what they asked for. The drafting
 * happens in the brain and the sending happens when Alex taps approve, on his
 * own machine, in his own session — which is him working quickly, not a bot
 * wearing his name. That distinction is the whole reason this file is a reader
 * and not a hand.
 *
 * Every selector here is a guess at somebody else's markup, so each reader
 * tries several and stops at the first that gives something defensible. When
 * none of them do the answer is null or [] — never a zero, never an invented
 * due date. A wrong deadline on this screen costs a late delivery and a rating.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  var S = O.sites || (O.sites = {});
  if (S.fiverr) return;

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

  /** "$45", "US$ 1,200.00" → 4500 / 120000. Null when there is no number. */
  function moneyCents(s) {
    var m = /(?:US)?\$\s*([\d,]+(?:\.\d{1,2})?)/.exec(String(s || ""));
    if (!m) return null;
    var n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }

  /**
   * "2 days left", "23 hours left", "Late" → minutes remaining, or null.
   *
   * Read rather than computed from a date, because Fiverr prints the countdown
   * and prints it in the buyer's terms. A negative number means late, and late
   * is said as late rather than rounded up to zero.
   */
  function minutesLeft(s) {
    var t = String(s || "").toLowerCase();
    if (/\blate\b|overdue/.test(t)) return -1;
    var d = /(\d+)\s*day/.exec(t);
    var h = /(\d+)\s*hour/.exec(t);
    var m = /(\d+)\s*min/.exec(t);
    if (!d && !h && !m) return null;
    return (d ? Number(d[1]) * 1440 : 0) + (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  }

  function isLoginPage() {
    if (/\/login|\/join|\/sign_?in/i.test(location.pathname)) return true;
    return !!one(['form[action*="login" i] input[type="password"]', 'input[name="password"]']);
  }

  S.fiverr = {
    match: function (host) {
      return /(^|\.)fiverr\.com$/.test(host);
    },

    site: function () { return "fiverr"; },

    isLoginPage: isLoginPage,

    /**
     * Signed in, in layers, because Fiverr serves a marketing header to a
     * stranger and an account header to a seller, and neither is labelled:
     *   1. a password box on screen — definitely not
     *   2. the seller's own menu (avatar, "Switch to Buying")
     *   3. a "Join"/"Sign in" pair with nothing beside them — definitely not
     * When none of it is on the page the answer is false, because "probably
     * signed in" is how an app posts as nobody.
     */
    signedIn: function () {
      if (isLoginPage()) return false;
      if (one(['[class*="avatar" i] img', '[data-testid*="user-menu" i]', 'a[href*="/users/"] img'])) return true;
      var switcher = all(['a, button']).filter(function (el) {
        return /switch to (buying|selling)/i.test(flat(el));
      });
      if (switcher.length) return true;
      return false;
    },

    /** The seller's own handle, when the page states it. Never invented. */
    who: function () {
      var a = one(['a[href^="/users/"]']);
      var m = a && /\/users\/([^/?#]+)/.exec(a.getAttribute("href") || "");
      return m ? "@" + m[1] : null;
    },

    statusUrl: "https://www.fiverr.com/seller_dashboard",

    /**
     * What is waiting for work, as rows.
     *
     * This is the list the desk actually plans from: an active order with a
     * countdown is the only thing on Fiverr that is already money. Briefs and
     * requests are possibilities; these are commitments.
     */
    results: function () {
      var rows = all([
        '[class*="order-row" i]',
        'table tbody tr',
        '[data-testid*="order" i]',
      ]);
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var line = flat(row);
        if (!line || line.length < 8) continue;
        var link = one(['a[href*="/orders/"]', 'a[href*="/inbox/"]'], row);
        var href = link ? abs(link.getAttribute("href")) : null;
        var due = minutesLeft(line);
        var cents = moneyCents(line);
        // A row that is neither money nor a deadline is chrome, not an order.
        if (due == null && cents == null) continue;
        out.push({
          url: href,
          title: link ? flat(link) : null,
          buyer: (function () {
            var b = one(['a[href^="/users/"]', '[class*="username" i]'], row);
            return b ? flat(b) : null;
          })(),
          dueInMinutes: due,
          late: due != null && due < 0,
          priceCents: cents,
          line: line.slice(0, 300),
        });
      }
      return out;
    },

    /** The inbox, as a list of conversations. */
    threads: function () {
      var rows = all([
        '[class*="conversation" i] li',
        '[data-testid*="conversation" i]',
        'ul[class*="inbox" i] li',
      ]);
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var line = flat(row);
        if (!line) continue;
        var who = one(['[class*="username" i]', 'a[href^="/users/"]', 'strong', 'b'], row);
        out.push({
          who: who ? flat(who) : null,
          preview: line.slice(0, 220),
          unread: /\bunread\b/i.test(row.className || "") || !!one(['[class*="unread" i]'], row),
          url: (function () {
            var a = one(['a[href*="/inbox/"]'], row);
            return a ? abs(a.getAttribute("href")) : null;
          })(),
        });
      }
      return out;
    },

    /**
     * The messages in whatever conversation is open.
     *
     * `mine` is left undefined rather than guessed when the page gives no
     * side: the brain writes a reply off this, and mistaking the buyer's words
     * for our own is how an app answers itself.
     */
    messages: function () {
      var rows = all([
        '[class*="message-row" i]',
        '[class*="bubble" i]',
        '[data-testid*="message" i]',
      ]);
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var body = one(['[class*="body" i]', '[class*="text" i]', 'p'], row) || row;
        var t = flat(body);
        if (!t) continue;
        var cls = String(row.className || "");
        var mine = /\b(mine|self|outgoing|sent)\b/i.test(cls)
          ? true
          : /\b(theirs|other|incoming|received)\b/i.test(cls)
            ? false
            : undefined;
        out.push({
          text: t.slice(0, 4000),
          mine: mine,
          at: (function () {
            var el = one(['time', '[class*="time" i]', '[class*="date" i]'], row);
            return el ? (el.getAttribute("datetime") || flat(el)) : null;
          })(),
        });
      }
      return out;
    },

    /** Open a named conversation. Reading only — it never types or sends. */
    openThread: function (who) {
      var want = String(who || "").replace(/^@/, "").toLowerCase();
      if (!want) return false;
      var links = all(['a[href*="/inbox/"]']);
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute("href") || "";
        if (href.toLowerCase().indexOf(want) >= 0 || flat(links[i]).toLowerCase().indexOf(want) >= 0) {
          links[i].click();
          return true;
        }
      }
      return false;
    },

    /**
     * How the shop is doing, when the dashboard says so.
     *
     * Every field is null until the page prints it. A rating this app invented
     * would end up in a decision about whether to take more work.
     */
    readStatus: function () {
      var page = flat(document.body).slice(0, 12000);
      function after(label) {
        var re = new RegExp(label + "\\s*[:\\n]?\\s*([\\d.,]+%?)", "i");
        var m = re.exec(page);
        return m ? m[1] : null;
      }
      return {
        rating: after("rating"),
        responseRate: after("response rate"),
        onTime: after("delivered on time|on-time delivery"),
        completion: after("order completion"),
      };
    },
  };

  // Exposed for the tests, which feed them strings rather than a page.
  S.fiverr.parse = { moneyCents: moneyCents, minutesLeft: minutesLeft };
})(window);
