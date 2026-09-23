/**
 * sites/instagram.js — where things are on mobile Instagram.
 *
 * Found by aria-label, role and visible text only. Instagram's class names are
 * generated and change without notice, so none appear here.
 *
 * WHEN A SELECTOR IS NOT FOUND: every function below returns null (or false),
 * and returns it immediately rather than falling back to a guess. The brain
 * treats null as "the page is not what I thought" and either waits, re-reads,
 * or stops — it never presses something it did not identify.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  O.sites = O.sites || {};
  if (O.sites.instagram) return;
  var F = O.find;

  O.sites.instagram = {
    name: "instagram",

    /** The like control of a post (or of the post under the cursor). null if absent. */
    likeButton: function (scope) {
      var el = F.oneByLabel(/^like$/i, scope);
      if (!el) el = F.oneByLabel(/^unlike$/i, scope); // already liked: still the control
      return el ? F.clickable(el) : null;
    },

    liked: function (scope) {
      return !!F.oneByLabel(/^unlike$/i, scope);
    },

    /** The comment field. null when the composer is not open. */
    commentBox: function (scope) {
      return F.field(/comment/i, scope);
    },

    /** The first reel link on screen; null on a page with no reels. */
    openReel: function () {
      var a = F.all('a[href*="/reel/"]').filter(F.visible)[0];
      return a || null;
    },

    /** Mobile reels advance by scrolling one viewport. Nothing to click. */
    nextReel: function () {
      return { kind: "scroll", px: root.innerHeight || 844 };
    },

    /** Our own profile URL, from the handle. null when the handle is unreadable. */
    profileUrl: function () {
      var h = this.handle();
      return h ? "https://www.instagram.com/" + h + "/" : null;
    },

    /** The thing to press to get to our own profile. null when not on screen. */
    profileLink: function () {
      var el = O.find.oneByLabel(/^profile$/i);
      return el ? O.find.clickable(el) : null;
    },

    isLoginPage: function () {
      if (/\/accounts\/(login|emailsignup)/.test(location.pathname)) return true;
      var pw = document.querySelector('input[type="password"]');
      if (pw && F.visible(pw)) return true;
      return !!F.byText("button", /^log in$/i);
    },

    signedIn: function () {
      if (this.isLoginPage()) return false;
      return !!(
        F.oneByLabel(/^(home|profile|new post|search)$/i) ||
        document.querySelector('a[href="/direct/inbox/"]')
      );
    },

    /**
     * The signed-in handle, asked of Instagram itself: the current-user
     * endpoint first, then the viewer JSON the page embeds, then the profile
     * link in the tab bar. Every step returns null rather than a guess, and
     * the whole chain resolves null off instagram.com (the fetch is
     * same-origin only).
     */
    handleAsync: function () {
      var self = this;
      var viaDom = function () {
        return self.handle();
      };
      if (!/instagram\./.test(location.hostname) || typeof fetch !== "function")
        return Promise.resolve(viaDom());
      return fetch("/api/v1/accounts/current_user/?edit=true", {
        credentials: "include",
        headers: { "x-ig-app-id": "936619743392459" },
      })
        .then(function (r) {
          if (!r.ok) throw new Error("http " + r.status);
          return r.json();
        })
        .then(function (j) {
          var u = j && j.user && j.user.username;
          if (u) return u;
          throw new Error("no username");
        })
        .catch(function () {
          // the viewer blob the page ships with, when the endpoint says no
          var m = /"viewer":\{[^}]*?"username":"([A-Za-z0-9._]{2,30})"/.exec(
            document.documentElement.innerHTML,
          );
          return m ? m[1] : viaDom();
        });
    },

    /** The handle as the DOM shows it: the profile link in the tab bar. */
    handle: function () {
      var prof = F.oneByLabel(/^profile$/i);
      var a = prof && (prof.tagName === "A" ? prof : prof.closest && prof.closest("a[href]"));
      if (a) {
        var m = /^\/([A-Za-z0-9._]{2,30})\/?$/.exec(a.getAttribute("href") || "");
        if (m) return m[1];
      }
      var m2 = /^\/([A-Za-z0-9._]{2,30})\/?$/.exec(location.pathname);
      if (m2 && document.querySelector('[aria-label="Edit profile"], a[href*="/accounts/edit"]'))
        return m2[1];
      return null;
    },

    postNodes: function () {
      return F.all("article").filter(F.visible);
    },

    captionOf: function (el) {
      // a caption is a leaf, or a paragraph whose only children are its own
      // hashtag links — anything deeper is layout, not words
      var spans = F.all("h1, h2, span, p", el).filter(function (n) {
        if (!n.children.length) return true;
        for (var i = 0; i < n.children.length; i++)
          if (n.children[i].tagName !== "A") return false;
        return true;
      });
      var best = null;
      for (var i = 0; i < spans.length; i++) {
        var t = (spans[i].innerText || spans[i].textContent || "").replace(/\s+/g, " ").trim();
        if (t.length < 8) continue;
        if (/^\d[\d.,]*\s*[KMB]?\s*(likes?|views?|comments?)$/i.test(t)) continue;
        if (!best || t.length > best.length) best = t;
      }
      return best;
    },
  };
})(window);
