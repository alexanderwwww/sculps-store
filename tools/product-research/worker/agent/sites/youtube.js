/**
 * sites/youtube.js — only as much as the brain asks for: is this account
 * signed in, and what is its handle.
 *
 * The handle is a channel handle and NEVER an email address. That bug shipped
 * once: the account page prints "Signed in as alex@gmail.com" right next to
 * the channel name, and the reader took the mailbox. Anything with an "@"
 * inside it, or a mail-shaped ending, is refused here and again in read.js.
 *
 * WHEN A SELECTOR IS NOT FOUND: null. No fallback guess.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  O.sites = O.sites || {};
  if (O.sites.youtube) return;
  var F = O.find;

  var MAILISH = /@|\.(com|net|org|co)$/i;

  O.sites.youtube = {
    name: "youtube",

    likeButton: function (scope) {
      var el = F.oneByLabel(/^(like this video|like|unlike)/i, scope);
      return el ? F.clickable(el) : null;
    },

    liked: function (scope) {
      var el = F.oneByLabel(/^(unlike|like this video)/i, scope);
      return !!(el && el.getAttribute("aria-pressed") === "true");
    },

    commentBox: function (scope) {
      return F.field(/comment/i, scope);
    },

    openReel: function () {
      var a = F.all('a[href*="/shorts/"]').filter(F.visible)[0];
      return a || null;
    },

    nextReel: function () {
      return { kind: "scroll", px: root.innerHeight || 844 };
    },

    profileUrl: function () {
      var h = this.handle();
      return h ? "https://www.youtube.com/@" + h : null;
    },

    profileLink: function () {
      var el = F.oneByLabel(/^(your channel|account menu|avatar)/i);
      return el ? F.clickable(el) : null;
    },

    isLoginPage: function () {
      if (/accounts\.google\./.test(location.hostname)) return true;
      var pw = document.querySelector('input[type="password"]');
      if (pw && F.visible(pw)) return true;
      return !!F.byText("link", /^sign in$/i);
    },

    signedIn: function () {
      if (this.isLoginPage()) return false;
      return !!(
        F.oneByLabel(/^(account menu|your channel|create)/i) ||
        document.querySelector("#avatar-btn")
      );
    },

    handle: function () {
      var a = F.all('a[href^="/@"], a[href*="youtube.com/@"]').filter(function (n) {
        return /\/@[A-Za-z0-9._-]{2,30}\/?$/.test(n.getAttribute("href") || "");
      })[0];
      if (a) {
        var m = /\/@([A-Za-z0-9._-]{2,30})/.exec(a.getAttribute("href"));
        if (m && !MAILISH.test(m[1])) return m[1];
      }
      var t = (document.body && (document.body.innerText || "")) || "";
      var h = /(^|\s)@([A-Za-z0-9._-]{3,30})(\s|$)/.exec(t);
      if (h && !MAILISH.test(h[2])) return h[2];
      return null; // a mailbox is not a handle
    },

    postNodes: function () {
      return F.all('ytd-rich-item-renderer, [role="article"], article').filter(F.visible);
    },

    captionOf: function (el) {
      var n = el.querySelector("#video-title, h3, a[title]");
      if (!n) return null;
      return (n.getAttribute("title") || n.innerText || n.textContent || "").replace(/\s+/g, " ").trim();
    },
  };
})(window);
