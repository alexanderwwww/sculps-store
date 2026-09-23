/**
 * bezel.js — the phone drawn over the page.
 *
 * A fixed rounded frame with an inner shadow ring and a 1px light rim, the
 * Dynamic Island as a black pill at the top, and the home indicator bar at the
 * bottom. Everything here is pointer-events:none and lives at the top of the
 * stack, so it cannot block a scroll or a click anywhere on the real page.
 *
 * Sites rewrite their own DOM constantly. A MutationObserver re-attaches the
 * bezel if it is removed, throttled to at most once a second so a busy feed
 * cannot turn this into a re-render loop.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  if (O.bezel) return;

  var ID = "__organic_bezel";
  var Z = 2147483640; // just under the cursor, which must sit over everything
  var node = null;
  var lastAttach = 0;
  var observer = null;

  function css() {
    return (
      "#" + ID + "{position:fixed;inset:0;z-index:" + Z + ";pointer-events:none;" +
      "contain:strict;}" +
      "#" + ID + " .frame{position:absolute;inset:0;border-radius:46px;" +
      "box-shadow:inset 0 0 0 1px rgba(255,255,255,.28)," +
      "inset 0 0 0 3px rgba(0,0,0,.92)," +
      "inset 0 0 22px 6px rgba(0,0,0,.45);}" +
      "#" + ID + " .island{position:absolute;top:10px;left:50%;" +
      "transform:translateX(-50%);width:104px;height:31px;border-radius:18px;" +
      "background:#000;box-shadow:0 0 0 1px rgba(255,255,255,.06);}" +
      "#" + ID + " .home{position:absolute;bottom:7px;left:50%;" +
      "transform:translateX(-50%);width:134px;height:5px;border-radius:3px;" +
      "background:rgba(0,0,0,.72);box-shadow:0 0 0 1px rgba(255,255,255,.18);}"
    );
  }

  function build() {
    var el = document.createElement("div");
    el.id = ID;
    el.setAttribute("aria-hidden", "true");
    var style = document.createElement("style");
    style.textContent = css();
    el.appendChild(style);
    ["frame", "island", "home"].forEach(function (name) {
      var part = document.createElement("div");
      part.className = name;
      el.appendChild(part);
    });
    return el;
  }

  function attach() {
    var host = document.body || document.documentElement;
    if (!host) return;
    if (node && node.isConnected) return;
    node = build();
    host.appendChild(node);
    lastAttach = Date.now();
  }

  function watch() {
    if (observer || !root.MutationObserver) return;
    observer = new root.MutationObserver(function () {
      if (node && node.isConnected) return;
      if (Date.now() - lastAttach < 1000) return; // at most once a second
      attach();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  O.bezel = {
    mount: function () {
      if (document.body) {
        attach();
        watch();
      } else {
        document.addEventListener("DOMContentLoaded", function () {
          attach();
          watch();
        });
      }
      return true;
    },
    /** The home bar's hit box, so the panel's grabber can sit exactly on it. */
    homeRect: function () {
      var bar = node && node.querySelector(".home");
      return bar ? bar.getBoundingClientRect() : null;
    },
    el: function () {
      return node;
    },
  };
})(window);
