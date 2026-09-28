/**
 * Vestiaire Collective, as the shop sees it.
 *
 * This is the one that carries the high ticket. It exists in plug because of a
 * specific failure on Depop: a Rolex at €16,800 drew thousands of views and no
 * sales, and that was never a traffic problem. Nobody buys a watch at that
 * number from an account with no reviews, and Depop's buyer protection was not
 * built for it. Vestiaire's buyers already spend there, and its authentication
 * step answers the trust question without Alex having to earn it first.
 *
 * So the two sites are not interchangeable and this file must never be written
 * as a copy of depop.js with the words swapped. Three things are genuinely
 * different and each one changes what the app does:
 *
 *   1. A sale is not the end. Vestiaire routes the item through its own
 *      authentication: sold means SHIP TO VESTIAIRE, who check it and send it
 *      on. Anything here that reports a sale must make that leg visible, or the
 *      app will tell him a parcel is done when it has not left his hands.
 *   2. The money is not the same shape. Depop US is 0% to the seller; Vestiaire
 *      takes a commission and the buyer pays a fee on top, so the number a
 *      buyer sees and the number he receives are two different numbers. Never
 *      show one where the other belongs.
 *   3. The buyer negotiates differently. The offer ladder that works on a €200
 *      hoodie is not the ladder for a €9,000 bag.
 *
 * Every selector below is a guess at somebody else's markup until it has been
 * opened against the live site — and as of writing, NONE of them have been.
 * That is the honest state of this file. Each reader therefore tries several
 * and stops at the first that gives something defensible; when none do, the
 * answer is null or [] and never a zero, a made-up price or an invented date.
 * A wrong price on this screen is a real item sold for real money at the wrong
 * number, and here the numbers have four figures in them.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  var S = O.sites || (O.sites = {});
  if (S.vestiaire) return;

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
      var el = null;
      try { el = (scope || document).querySelector(sels[i]); } catch (e) { continue; }
      if (el) return el;
    }
    return null;
  }
  function all(sels, scope) {
    for (var i = 0; i < sels.length; i++) {
      var hits = null;
      try { hits = (scope || document).querySelectorAll(sels[i]); } catch (e) { continue; }
      if (hits && hits.length) return Array.prototype.slice.call(hits);
    }
    return [];
  }

  /**
   * A price, in cents, or null.
   *
   * Vestiaire is a European site and shows European numbers: "€1.200,50" is
   * twelve hundred euro, not a hundred and twenty thousand. It also shows
   * "$1,200.50" to a US buyer. The rule that separates them is which separator
   * comes LAST — that one is the decimal point, whatever it looks like.
   *
   * Anything it cannot read confidently is null. A price this file guesses at
   * is a four-figure item listed at the wrong number.
   */
  function moneyCents(raw) {
    if (!raw) return null;
    var t = String(raw).replace(/\s| /g, "");
    var m = /(\d[\d.,]*)/.exec(t);
    if (!m) return null;
    var n = m[1];
    var lastDot = n.lastIndexOf(".");
    var lastComma = n.lastIndexOf(",");
    var decimal = lastDot > lastComma ? lastDot : lastComma;
    var whole, frac = "00";
    if (decimal < 0) {
      whole = n.replace(/[.,]/g, "");
    } else {
      var tail = n.slice(decimal + 1);
      /* Three digits after the separator is a thousands group, not cents:
         "1.200" is twelve hundred, and reading it as 1.2 would price a bag at
         a euro twenty. */
      if (tail.length === 3 || tail.length === 0) {
        whole = n.replace(/[.,]/g, "");
      } else {
        whole = n.slice(0, decimal).replace(/[.,]/g, "");
        frac = (tail + "00").slice(0, 2);
      }
    }
    if (!/^\d+$/.test(whole)) return null;
    var cents = parseInt(whole, 10) * 100 + parseInt(frac, 10);
    return isFinite(cents) ? cents : null;
  }

  function isLoginPage() {
    if (/\/login|\/signup|\/connexion/.test(location.pathname)) return true;
    return !!one(['input[type="password"]']);
  }

  S.vestiaire = {
    match: function (host) {
      return /(^|\.)vestiairecollective\.com$/.test(host);
    },

    site: function () { return "vestiaire"; },

    isLoginPage: isLoginPage,

    /**
     * Signed in, in the same layers Depop needs and for the same reason: the
     * site serves much of the same furniture to a stranger and to a seller, so
     * "probably signed in" is how a shop reads a logged-out page and reports a
     * quiet day. A password box on screen is a definite no; a seller-only
     * control is a yes; anything else is false.
     */
    signedIn: function () {
      if (isLoginPage()) return false;
      if (one([
        'a[href*="/me/"]',
        'a[href*="/sell"]',
        'a[href*="/my-orders"]',
        '[data-testid*="account" i]',
        '[data-cy*="account" i]',
        'button[aria-label*="account" i]',
      ])) return true;
      return false;
    },

    /** His own handle, when the page states it. Never invented. */
    who: function () {
      var a = one([
        'a[href*="/me/"] [class*="name" i]',
        '[data-testid*="profile" i] [class*="name" i]',
        'header a[href*="/member/"]',
      ]);
      var name = flat(a);
      return name ? name : null;
    },

    statusUrl: "https://www.vestiairecollective.com/my-account/",

    /** Where a message is typed, per screen. */
    composer: function () {
      return one([
        'textarea[placeholder*="message" i]',
        'textarea[name*="message" i]',
        '[contenteditable="true"][role="textbox"]',
        'textarea',
      ]);
    },

    /**
     * What is on his shelf, and what it has attracted.
     *
     * Deduped by url rather than by element, because the selectors below match
     * different parts of the SAME card — the wrapper and the anchor inside it.
     * Counting both is how a board doubles, a per-pass cap halves, and one item
     * gets acted on twice in a single pass.
     */
    listings: function () {
      var cards = all([
        '[data-testid*="product-card" i]',
        '[class*="ProductCard" i]',
        'a[href*="/p/"]',
      ]);
      var seen = {};
      var rows = [];
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var link = card.matches && card.matches('a[href*="/p/"]')
          ? card
          : one(['a[href*="/p/"]'], card);
        var url = abs(link && link.getAttribute("href"));
        if (!url || seen[url]) continue;
        seen[url] = true;

        var priceText = flat(one([
          '[data-testid*="price" i]',
          '[class*="price" i]',
        ], card));
        var likesText = flat(one([
          '[data-testid*="like" i]',
          '[class*="like" i]',
          '[class*="favorite" i]',
        ], card));

        /*
         * Sold is a badge, never the word.
         *
         * "Sold out", "Sold by", "Recently sold" all contain it, and treating
         * the word as the signal marks live stock as gone — which on this site
         * means quietly withdrawing a four-figure listing.
         */
        var sold = !!one([
          '[data-testid*="sold" i]',
          '[class*="sold" i][class*="badge" i]',
          '[class*="Sold" i][class*="Tag" i]',
        ], card);

        rows.push({
          site: "vestiaire",
          url: url,
          title: flat(one(['h2', 'h3', '[class*="title" i]'], card))
                 || (one(['img[alt]'], card) || {}).alt || null,
          priceCents: moneyCents(priceText),
          priceText: priceText || null,
          likes: likesText ? (parseInt(likesText.replace(/\D/g, ""), 10) || null) : null,
          sold: sold,
        });
      }
      return rows;
    },

    /**
     * A sale here is not finished.
     *
     * Vestiaire puts its own authentication between him and the buyer, so a
     * sold item has a leg he still has to walk: print the label, ship it TO
     * Vestiaire, who check it and forward it. Reporting "sold" as done is how
     * the app tells him a parcel is handled while it is still on his table.
     *
     * This reads the state off an order screen and says which of the two it is
     * in. Anything it cannot place confidently comes back as null rather than
     * as a guess, because the wrong answer here loses a sale to a deadline.
     */
    orderStage: function (scope) {
      var body = flat(scope || document.body).toLowerCase();
      if (!body) return null;
      if (/ship (it )?to vestiaire|send (it )?to vestiaire|print your (shipping )?label|awaiting shipment/.test(body)) {
        return "ship-to-authentication";
      }
      if (/being authenticated|under authentication|quality control|in transit to the buyer/.test(body)) {
        return "with-authentication";
      }
      if (/delivered|order complete|payout/.test(body)) return "done";
      return null;
    },

    /**
     * What the sell form looks like, reported rather than assumed.
     *
     * None of the selectors in this file have been opened against the live
     * site. Rather than pretend otherwise, this says what it found, what it did
     * not, and everything on screen that it might have been — so one run on a
     * signed-in account corrects the whole file instead of a round of guessing
     * per field.
     */
    sellForm: function () {
      var want = {
        photos: ['input[type="file"][accept*="image" i]', 'input[type="file"]'],
        title: ['input[name*="title" i]', 'input[placeholder*="title" i]'],
        description: ['textarea[name*="descri" i]', 'textarea[placeholder*="descri" i]', 'textarea'],
        brand: ['input[name*="brand" i]', 'input[placeholder*="brand" i]'],
        category: ['[name*="categor" i]', '[data-testid*="categor" i]'],
        size: ['[name*="size" i]', '[data-testid*="size" i]'],
        condition: ['[name*="condition" i]', '[data-testid*="condition" i]'],
        price: ['input[name*="price" i]', 'input[placeholder*="price" i]'],
      };
      var found = { site: "vestiaire", url: location.href, has: {}, missing: [] };
      for (var key in want) {
        if (!Object.prototype.hasOwnProperty.call(want, key)) continue;
        var el = one(want[key]);
        if (el) {
          found.has[key] = (el.tagName || "").toLowerCase()
            + (el.name ? "[name=" + el.name + "]" : "")
            + (el.id ? "#" + el.id : "");
        } else {
          found.missing.push(key);
        }
      }
      found.sawInputs = all(['input', 'textarea', 'select']).slice(0, 40).map(function (el) {
        return (el.tagName || "").toLowerCase()
          + (el.type ? ":" + el.type : "")
          + (el.name ? "[name=" + el.name + "]" : "")
          + (el.placeholder ? " ph=" + el.placeholder : "");
      });
      found.sawButtons = all(['button', '[role="button"]']).slice(0, 40).map(function (el) {
        return flat(el).slice(0, 40);
      }).filter(Boolean);
      return found;
    },
  };
})(typeof window !== "undefined" ? window : this);
