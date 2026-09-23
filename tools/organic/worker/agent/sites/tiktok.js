/**
 * sites/tiktok.js — where things are on mobile TikTok.
 *
 * Role, aria-label and visible text only. TikTok's data-e2e hooks are stable
 * enough to use as a second opinion, but never a generated class name.
 *
 * WHEN A SELECTOR IS NOT FOUND: null, immediately, with no fallback guess. The
 * brain decides what to do with a null — it is never treated as "press the
 * nearest thing".
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  O.sites = O.sites || {};
  if (O.sites.tiktok) return;
  var F = O.find;

  O.sites.tiktok = {
    name: "tiktok",

    likeButton: function (scope) {
      var el = F.oneByLabel(/^(like|unlike)$/i, scope);
      if (!el) el = F.byText("button", /^like$/i, scope);
      if (!el) {
        var hook = (scope || document).querySelector('[data-e2e="like-icon"]');
        if (hook && F.visible(hook)) el = hook;
      }
      return el ? F.clickable(el) : null;
    },

    liked: function (scope) {
      var el = F.oneByLabel(/^unlike$/i, scope);
      return !!el;
    },

    commentBox: function (scope) {
      return F.field(/(add comment|comment)/i, scope);
    },

    /** The video under the cursor; on the For You page there is always one. */
    openReel: function () {
      var a = F.all('a[href*="/video/"]').filter(F.visible)[0];
      return a || null;
    },

    nextReel: function () {
      return { kind: "scroll", px: root.innerHeight || 844 };
    },

    profileUrl: function () {
      var h = this.handle();
      return h ? "https://www.tiktok.com/@" + h : null;
    },

    isLoginPage: function () {
      if (/\/login/.test(location.pathname)) return true;
      var pw = document.querySelector('input[type="password"]');
      if (pw && F.visible(pw)) return true;
      return !!F.byText("button", /^log in$/i);
    },

    signedIn: function () {
      if (this.isLoginPage()) return false;
      return !!(
        document.querySelector('[data-e2e="profile-icon"]') ||
        F.oneByLabel(/^(profile|inbox|upload)$/i)
      );
    },

    handle: function () {
      var a = F.all('a[href^="/@"]').filter(function (n) {
        return /^\/@[A-Za-z0-9._]{2,30}\/?$/.test(n.getAttribute("href") || "");
      })[0];
      if (a) return a.getAttribute("href").slice(2).replace(/\/$/, "");
      var m = /^\/@([A-Za-z0-9._]{2,30})/.exec(location.pathname);
      if (m && document.querySelector('[data-e2e="edit-profile"], [aria-label="Edit profile"]'))
        return m[1];
      return null;
    },

    postNodes: function () {
      var byHook = F.all('[data-e2e="recommend-list-item-container"]').filter(F.visible);
      if (byHook.length) return byHook;
      return F.all('article, [role="article"]').filter(F.visible);
    },

    captionOf: function (el) {
      var n = el.querySelector('[data-e2e="video-desc"]');
      if (n) return (n.innerText || n.textContent || "").replace(/\s+/g, " ").trim();
      return null; // not found: let read.js fall back, or report nothing
    },
  };
})(window);
