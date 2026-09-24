/**
 * read.js — reading the page for the crew.
 *
 * Everything here is found by role, aria-label and visible text. Never by a
 * generated class name, because those change weekly. When something is not
 * found this returns null or an empty list — it never guesses.
 *
 * It reads no input values at all. The one field the agent ever reads back is
 * the comment box hands.type() just wrote to, and that read lives there.
 *
 * The brain asks for exactly these: signedIn, handle, text, posts, tags, ads,
 * store.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  if (O.read) return;

  function text(el) {
    if (!el) return "";
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function platform() {
    var h = location.hostname || "";
    if (/instagram\./.test(h)) return "instagram";
    if (/tiktok\./.test(h)) return "tiktok";
    if (/youtube\./.test(h)) return "youtube";
    return "unknown";
  }

  /**
   * The desk's recipes say which host they are for, rather than being looked
   * up by a platform name — WhatsApp and Alibaba are not "platforms" in the
   * sense the rest of this file means.
   */
  function deskSite() {
    var host = location.hostname;
    var all = O.sites || {};
    for (var key in all) {
      if (all[key] && typeof all[key].match === "function" && all[key].match(host)) return all[key];
    }
    return null;
  }

  function site(which) {
    var p = which || platform();
    return (O.sites && O.sites[p]) || null;
  }

  /** Signed in when the platform recipe says so; unknown platform => false. */
  /**
   * The account's own id, from the cookie the site sets about itself.
   *
   * Proof that somebody is signed in, and a name to work under while the
   * real handle is still being asked for. A platform refusing to say WHO is
   * not a reason to stand still — it is a reason to keep asking.
   */
  function userId() {
    var m = /(^|;\s*)ds_user_id=(\d+)/.exec(document.cookie || "");
    return m ? m[2] : null;
  }

  function signedIn(which) {
    var s = site(which);
    if (!s) return false;
    if (s.isLoginPage()) return false;
    return !!s.signedIn();
  }

  /**
   * Our own handle as "@name", or null. A connection with no readable handle
   * is not a connection. Async, because Instagram's best answer is a fetch.
   */
  function handle(which) {
    var s = site(which);
    if (!s) return Promise.resolve(null);
    var got = s.handleAsync ? s.handleAsync() : Promise.resolve(s.handle());
    return Promise.resolve(got)
      .then(function (h) {
        if (!h) return null;
        h = String(h).trim().replace(/^@+/, "");
        // never an email address — that bug shipped once on YouTube
        if (!h || h.indexOf("@") >= 0 || /\.(com|net|org|co)$/i.test(h)) return null;
        if (!/^[A-Za-z0-9._-]{2,40}$/.test(h)) return null;
        return "@" + h;
      })
      .catch(function () {
        return null;
      });
  }

  /** The first ~4000 characters the page shows. The brain looks for friction. */
  function bodyText(max) {
    var b = document.body;
    if (!b) return "";
    var t = b.innerText || b.textContent || "";
    return t.slice(0, max || 4000);
  }

  var NUM = /([\d][\d.,]*)\s*([KMB])?\s*(likes?|views?|plays?|comments?)/i;

  function countsIn(el) {
    var out = {};
    var take = function (m) {
      if (!m) return;
      var n = parseFloat(m[1].replace(/,/g, ""));
      var mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] || 1;
      var kind = m[3].toLowerCase().replace(/s$/, "");
      if (kind === "play") kind = "view";
      if (out[kind] == null) out[kind] = Math.round(n * mult);
    };
    var re = new RegExp(NUM.source, "gi");
    var t = text(el);
    var m;
    while ((m = re.exec(t))) take(m);
    var labelled = el.querySelectorAll("[aria-label]");
    for (var i = 0; i < labelled.length; i++) take(NUM.exec(labelled[i].getAttribute("aria-label") || ""));
    return out;
  }

  function handleIn(el) {
    var links = el.querySelectorAll('a[href^="/@"], a[href*="/@"]');
    for (var i = 0; i < links.length; i++) {
      var m = /\/@([A-Za-z0-9._]+)/.exec(links[i].getAttribute("href") || "");
      if (m) return "@" + m[1];
    }
    var m2 = /@([A-Za-z0-9._]{2,30})/.exec(text(el));
    if (m2) return "@" + m2[1];
    var byRole = el.querySelector("a[href]");
    if (byRole) {
      var m3 = /^\/([A-Za-z0-9._]{2,30})\/?$/.exec(byRole.getAttribute("href") || "");
      if (m3) return "@" + m3[1];
    }
    return null;
  }

  function abs(href) {
    try {
      return new URL(href, location.href).href;
    } catch (e) {
      return href || null;
    }
  }

  function urlIn(el) {
    var a =
      el.querySelector('a[href*="/reel/"], a[href*="/p/"], a[href*="/video/"], a[href*="/shorts/"]') ||
      el.querySelector("a[href]");
    return a ? abs(a.getAttribute("href")) : null;
  }

  /** Posts on screen: {url, handle, views, ...}. Deduped by url, at most 40. */
  function posts() {
    var s = site();
    var nodes = (s && s.postNodes && s.postNodes()) || [];
    if (!nodes.length) nodes = Array.prototype.slice.call(document.querySelectorAll("article"));
    if (!nodes.length)
      nodes = Array.prototype.slice.call(document.querySelectorAll('[role="article"]'));
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < nodes.length && out.length < 40; i++) {
      var el = nodes[i];
      var c = countsIn(el);
      var url = urlIn(el);
      var h = handleIn(el);
      var key = url || (h || "") + "#" + i;
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({
        url: url,
        handle: h,
        views: c.view == null ? null : c.view,
        likes: c.like == null ? null : c.like,
        comments: c.comment == null ? null : c.comment,
        caption: captionOf(el),
      });
    }
    return out;
  }

  /**
   * The hashtags this page carries: the ones the platform itself links
   * (/explore/tags/x/, /tag/x) plus #word in the captions. Most-seen first,
   * at most 20.
   */
  function tags(scope) {
    var root_ = scope || document.body || document.documentElement;
    if (!root_) return [];
    var count = Object.create(null);
    var order = [];
    var push = function (t) {
      var v = "#" + String(t).replace(/^#/, "").toLowerCase();
      if (!/^#[a-z0-9_]{2,60}$/.test(v)) return;
      if (count[v] == null) {
        count[v] = 0;
        order.push(v);
      }
      count[v]++;
    };
    var links = root_.querySelectorAll('a[href*="/explore/tags/"], a[href*="/tag/"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      var m = /\/(?:explore\/tags|tag)\/([^/?#]+)/.exec(href);
      if (m) push(decodeURIComponent(m[1]));
      else {
        var t = text(links[i]);
        if (/^#/.test(t)) push(t);
      }
    }
    var re = /#[A-Za-z0-9_]{2,60}/g;
    var body = text(root_);
    var mm;
    while ((mm = re.exec(body))) push(mm[0]);
    order.sort(function (a, b) {
      return count[b] - count[a];
    });
    return order.slice(0, 20);
  }

  /** The caption of a post element: the recipe knows, otherwise longest text. */
  function captionOf(el) {
    if (!el) return null;
    var s = site();
    if (s && s.captionOf) {
      var viaSite = s.captionOf(el);
      if (viaSite != null) return viaSite;
    }
    var best = null;
    var cands = el.querySelectorAll("p, h1, h2, span, div");
    for (var i = 0; i < cands.length; i++) {
      if (cands[i].children.length) continue; // leaves only
      var t = text(cands[i]);
      if (t.length < 8) continue;
      if (NUM.test(t)) continue;
      if (!best || t.length > best.length) best = t;
    }
    return best;
  }

  /**
   * The Meta Ad Library, read off the visible cards.
   * `started` is the date exactly as printed ("Started running on Aug 2, 2026"
   * gives "Aug 2, 2026"). A card with no advertiser is skipped rather than
   * guessed at.
   */
  function ads() {
    var cards = Array.prototype.slice.call(
      document.querySelectorAll('[role="article"], article, [data-testid*="ad" i]'),
    );
    if (!cards.length) {
      // the library also renders each result as a plain block with the
      // "Library ID" line in it; take those blocks' nearest sized ancestor
      var ids = Array.prototype.slice.call(document.querySelectorAll("div,section")).filter(function (n) {
        return !n.querySelector("div,section") && /Library ID/i.test(text(n));
      });
      cards = ids
        .map(function (n) {
          var p = n;
          for (var i = 0; i < 4 && p.parentElement; i++) p = p.parentElement;
          return p;
        })
        .filter(Boolean);
    }
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < cards.length && out.length < 40; i++) {
      var el = cards[i];
      var t = text(el);
      if (!/Library ID|Started running|Sponsored/i.test(t)) continue;
      var startedM = /Started running on\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/.exec(t);
      var link = el.querySelector('a[href*="http"], a[href^="/"]');
      var name = null;
      var nameEl = el.querySelector("a[href] span, a[href] strong, a[href]");
      if (nameEl) name = text(nameEl);
      if (!name) {
        var m = /Sponsored\s*·?\s*([^\n·]{2,60})/.exec(t);
        if (m) name = m[1].trim();
      }
      if (!name) continue; // no advertiser: skip, do not guess
      var body = t
        .replace(/Started running on\s+[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}/i, " ")
        .replace(/Library ID:?\s*\d+/i, " ")
        .replace(/Sponsored/i, " ")
        .replace(name, " ")
        .replace(/\s+/g, " ")
        .trim();
      var url = link ? abs(link.getAttribute("href")) : null;
      var key = name + "|" + (startedM ? startedM[1] : "") + "|" + body.slice(0, 60);
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({
        advertiser: name,
        started: startedM ? startedM[1] : null,
        text: body.slice(0, 600),
        url: url,
      });
    }
    return out;
  }

  /**
   * Our own storefront, walked the way a visitor walks it — the logic that
   * used to live in worker/store.mjs, moved in here because the page is the
   * only thing with a browser now.
   *
   * Same origin only: the agent can fetch the store's own pages when the web
   * view is already on the store (the brain sends `goto` first). From another
   * origin the browser would refuse the fetch, so this says so plainly rather
   * than returning an empty shop.
   *
   * The dedupe trap from store.mjs is kept: ?variant=… is the same product in
   * another colour, so links are keyed by pathname with search and hash gone.
   */
  var PRODUCT_PATH = /\/(products?|product|item|items|p|shop)\/[^/?#]+/i;
  var LISTING_PATH = /\/(collections?|categories?|category|shop|products|all)(\/[^/?#]+)?\/?$/i;

  function linksIn(doc, base) {
    var here = new URL(base).host;
    var seen = Object.create(null);
    var products = [];
    var listings = [];
    var as = doc.querySelectorAll("a[href]");
    for (var i = 0; i < as.length; i++) {
      var u;
      try {
        u = new URL(as[i].getAttribute("href"), base);
      } catch (e) {
        continue;
      }
      if (u.host !== here) continue;
      u.hash = "";
      u.search = "";
      if (seen[u.href]) continue;
      seen[u.href] = 1;
      if (PRODUCT_PATH.test(u.pathname)) products.push(u.href);
      else if (LISTING_PATH.test(u.pathname)) listings.push(u.href);
    }
    return { products: products, listings: listings };
  }

  function productFrom(doc, url) {
    var meta = function (sel) {
      var n = doc.querySelector(sel);
      var v = n && n.getAttribute("content");
      return v ? v.trim() : null;
    };
    var title = meta('meta[property="og:title"]');
    if (!title) {
      var h1 = doc.querySelector("h1");
      title = h1 ? text(h1) : null;
    }
    if (!title) title = doc.title || null;
    var image = meta('meta[property="og:image"]');
    if (!image) {
      var img = doc.querySelector("main img, img");
      image = img ? abs(img.getAttribute("src")) : null;
    }
    var price =
      meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]');
    if (!price) {
      var ip = doc.querySelector('[itemprop="price"]');
      price = (ip && (ip.getAttribute("content") || text(ip))) || null;
    }
    if (!price) {
      var scope = doc.body || doc.documentElement;
      var pm = /(?:[$€£]\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*(?:\.\d{2})?\s?(?:USD|EUR|GBP))/.exec(
        text(scope),
      );
      price = pm ? pm[0] : null;
    }
    return {
      url: url,
      title: title ? String(title).trim() : null,
      price: price ? String(price).trim() : null,
      image: image,
    };
  }

  function fetchDoc(url) {
    return root
      .fetch(url, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.text();
      })
      .then(function (html) {
        return new root.DOMParser().parseFromString(html, "text/html");
      });
  }

  function store(url, opts) {
    opts = opts || {};
    var limit = opts.limit || 30;
    if (!url) return Promise.resolve({ products: [], stopped: "no store url" });
    var base;
    try {
      base = new URL(url, location.href);
    } catch (e) {
      return Promise.resolve({ products: [], stopped: "the store url is not a url" });
    }
    if (base.origin !== location.origin)
      return Promise.resolve({
        products: [],
        stopped: "not on the store — open " + base.origin + " first",
      });

    return fetchDoc(base.href)
      .then(function (doc) {
        var found = linksIn(doc, base.href);
        var chain = Promise.resolve(found.products.slice());
        found.listings.slice(0, 3).forEach(function (listing) {
          chain = chain.then(function (acc) {
            if (acc.length >= limit) return acc;
            return fetchDoc(listing)
              .then(function (d2) {
                var more = linksIn(d2, listing).products;
                more.forEach(function (p) {
                  if (acc.indexOf(p) < 0) acc.push(p);
                });
                return acc;
              })
              .catch(function () {
                return acc;
              });
          });
        });
        return chain;
      })
      .then(function (links) {
        links = links.slice(0, limit);
        var products = [];
        var chain = Promise.resolve();
        links.forEach(function (link) {
          chain = chain.then(function () {
            return fetchDoc(link)
              .then(function (d) {
                var p = productFrom(d, link);
                if (p.title) products.push(p);
              })
              .catch(function () {});
          });
        });
        return chain.then(function () {
          if (!products.length)
            return {
              products: products,
              stopped: links.length
                ? "the product pages did not read"
                : "no products found on the store",
            };
          return { products: products, stopped: null };
        });
      })
      .catch(function (e) {
        return { products: [], stopped: "the store did not open: " + ((e && e.message) || e) };
      });
  }

  O.read = {
    platform: platform,
    signedIn: signedIn,
    userId: userId,
    accountStatus: function () {
      var site = O.sites && O.sites.instagram;
      return site && site.readStatus ? site.readStatus() : null;
    },
    accountStatusUrl: function () {
      var site = O.sites && O.sites.instagram;
      return site ? site.statusUrl : null;
    },
    /* ------------------------------------------------- the supplier desk */

    /** Whoever the site on screen says its conversations are with. */
    threads: function () {
      var site = deskSite();
      return site && site.threads ? site.threads() : [];
    },

    /** The open conversation, oldest last. */
    messages: function () {
      var site = deskSite();
      return site && site.messages ? site.messages() : [];
    },

    /** What a search page on Alibaba or 1688 is showing. */
    results: function () {
      var site = O.sites && O.sites.alibaba;
      return site && site.results ? site.results() : [];
    },

    /**
     * The company or product page on screen, as printed: who they are, how
     * long they say they have traded, how fast they answer, what they have
     * sold, what certificates they list, whether they say OEM/ODM, and the
     * quantity -> price ladder when the page shows one. null when the page on
     * screen is not one of those.
     */
    supplier: function () {
      var site = O.sites && O.sites.alibaba;
      if (!site || !site.supplier || !site.match(location.hostname)) return null;
      return site.supplier();
    },

    handle: handle,
    bodyText: bodyText,
    posts: posts,
    tags: tags,
    ads: ads,
    store: store,
    captionOf: captionOf,
    text: text,
  };
})(window);
