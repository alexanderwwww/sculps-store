/**
 * read.js — reading the page for the crew.
 *
 * Everything here is found by role, aria-label and visible text. Never by a
 * generated class name, because those change weekly. When something is not
 * found this returns null or an empty list — it never guesses.
 *
 * It reads no input values at all. The one field the agent ever reads back is
 * the comment box it just typed into, and that read lives in hands.type().
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
    if (/instagram\.com$/.test(h) || /(^|\.)instagram\./.test(h)) return "instagram";
    if (/tiktok\.com$/.test(h) || /(^|\.)tiktok\./.test(h)) return "tiktok";
    if (/youtube\.com$/.test(h) || /(^|\.)youtube\./.test(h)) return "youtube";
    return "unknown";
  }

  function site() {
    var p = platform();
    return (O.sites && O.sites[p]) || null;
  }

  /** Signed in when the platform recipe says so; unknown platform => false. */
  function signedIn() {
    var s = site();
    if (!s) return false;
    if (s.isLoginPage()) return false;
    return !!s.signedIn();
  }

  /** Our own handle, or null. A connection with no readable handle is none. */
  function handle() {
    var s = site();
    if (!s) return null;
    var h = s.handle();
    return h ? String(h).replace(/^@+/, "") : null;
  }

  var NUM = /([\d][\d.,]*)\s*([KMB])?\s*(likes?|views?|plays?|comments?)/i;

  function countsIn(el) {
    var out = {};
    var t = text(el);
    var re = new RegExp(NUM.source, "gi");
    var m;
    while ((m = re.exec(t))) {
      var n = parseFloat(m[1].replace(/,/g, ""));
      var mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] || 1;
      var kind = m[3].toLowerCase().replace(/s$/, "");
      if (kind === "play") kind = "view";
      out[kind] = Math.round(n * mult);
    }
    // aria-labels carry the same numbers on both sites
    var labelled = el.querySelectorAll("[aria-label]");
    for (var i = 0; i < labelled.length; i++) {
      var lm = NUM.exec(labelled[i].getAttribute("aria-label") || "");
      if (!lm) continue;
      var ln = parseFloat(lm[1].replace(/,/g, ""));
      var lmult = { K: 1e3, M: 1e6, B: 1e9 }[(lm[2] || "").toUpperCase()] || 1;
      var lk = lm[3].toLowerCase().replace(/s$/, "");
      if (lk === "play") lk = "view";
      if (out[lk] == null) out[lk] = Math.round(ln * lmult);
    }
    return out;
  }

  function handleIn(el) {
    var links = el.querySelectorAll('a[href^="/@"], a[href*="/@"]');
    for (var i = 0; i < links.length; i++) {
      var m = /\/@([A-Za-z0-9._]+)/.exec(links[i].getAttribute("href") || "");
      if (m) return m[1];
    }
    var m2 = /@([A-Za-z0-9._]{2,30})/.exec(text(el));
    if (m2) return m2[1];
    var byRole = el.querySelector('[role="link"][href]');
    if (byRole) {
      var m3 = /^\/([A-Za-z0-9._]{2,30})\/?$/.exec(byRole.getAttribute("href") || "");
      if (m3) return m3[1];
    }
    return null;
  }

  function urlIn(el) {
    var a =
      el.querySelector('a[href*="/reel/"], a[href*="/p/"], a[href*="/video/"]') ||
      el.querySelector("a[href]");
    if (!a) return null;
    try {
      return new URL(a.getAttribute("href"), location.href).href;
    } catch (e) {
      return a.getAttribute("href");
    }
  }

  /** Posts on screen: articles, or whatever the recipe says stands for one. */
  function posts() {
    var s = site();
    var nodes = (s && s.postNodes && s.postNodes()) || [];
    if (!nodes.length) nodes = Array.prototype.slice.call(document.querySelectorAll("article"));
    if (!nodes.length)
      nodes = Array.prototype.slice.call(document.querySelectorAll('[role="article"]'));
    return nodes.map(function (el) {
      var c = countsIn(el);
      return {
        url: urlIn(el),
        handle: handleIn(el),
        views: c.view == null ? null : c.view,
        likes: c.like == null ? null : c.like,
        comments: c.comment == null ? null : c.comment,
        caption: captionOf(el),
      };
    });
  }

  /** Every hashtag visible on the page, deduped, in document order. */
  function tags(scope) {
    var root_ = scope || document.body || document.documentElement;
    if (!root_) return [];
    var seen = Object.create(null);
    var out = [];
    var push = function (t) {
      var v = t.toLowerCase();
      if (seen[v]) return;
      seen[v] = 1;
      out.push(t);
    };
    var links = root_.querySelectorAll('a[href*="/tag/"], a[href*="/explore/tags/"]');
    for (var i = 0; i < links.length; i++) {
      var t = text(links[i]);
      if (/^#/.test(t)) push(t);
    }
    var re = /#[A-Za-z0-9_]{2,60}/g;
    var m;
    var body = text(root_);
    while ((m = re.exec(body))) push(m[0]);
    return out;
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

  O.read = {
    platform: platform,
    signedIn: signedIn,
    handle: handle,
    posts: posts,
    tags: tags,
    captionOf: captionOf,
    text: text,
  };
})(window);
