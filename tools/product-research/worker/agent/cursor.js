/**
 * cursor.js — the green thing Alex watches.
 *
 * A #39FF7A dot with a soft halo, a ring that pulses outward, and a small name
 * label. moveTo() glides along a slightly curved path with eased, wobbly steps
 * at 60fps: never a jump, never a straight line. press() squashes the dot and
 * throws a ripple where it stands.
 *
 * Pointer-events none and the highest z-index there is, so it is visible over
 * the page and never in the way of it. Like the bezel it re-attaches itself if
 * the page throws it away.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  if (O.cursor) return;

  var ID = "__organic_cursor";
  var Z = 2147483647;
  var node = null;
  var dot = null;
  var label = null;
  var lastAttach = 0;
  var observer = null;
  var x = 0;
  var y = 0;
  var moving = null; // a token so a new move cancels the one in flight

  function css() {
    return (
      "#" + ID + "{position:fixed;left:0;top:0;z-index:" + Z + ";" +
      "pointer-events:none;will-change:transform;}" +
      "#" + ID + " .dot{position:absolute;left:-9px;top:-9px;width:18px;" +
      "height:18px;border-radius:50%;background:#39FF7A;" +
      "box-shadow:0 0 10px 3px rgba(57,255,122,.75),0 0 28px 12px rgba(57,255,122,.28);" +
      "transition:transform 90ms ease-out;}" +
      "#" + ID + " .ring{position:absolute;left:-9px;top:-9px;width:18px;" +
      "height:18px;border-radius:50%;border:2px solid rgba(57,255,122,.7);" +
      "animation:__organic_pulse 1.6s ease-out infinite;}" +
      "#" + ID + " .name{position:absolute;left:16px;top:8px;font:600 11px/1.4 " +
      "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;" +
      "color:#0b1b10;background:#39FF7A;padding:1px 6px;border-radius:7px;" +
      "white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,.35);}" +
      "#" + ID + " .ripple{position:absolute;left:-9px;top:-9px;width:18px;" +
      "height:18px;border-radius:50%;border:2px solid rgba(57,255,122,.9);" +
      "animation:__organic_ripple 420ms ease-out forwards;}" +
      "@keyframes __organic_pulse{0%{transform:scale(1);opacity:.85}" +
      "100%{transform:scale(2.6);opacity:0}}" +
      "@keyframes __organic_ripple{0%{transform:scale(1);opacity:.9}" +
      "100%{transform:scale(3.4);opacity:0}}"
    );
  }

  function build() {
    var el = document.createElement("div");
    el.id = ID;
    el.setAttribute("aria-hidden", "true");
    var style = document.createElement("style");
    style.textContent = css();
    el.appendChild(style);
    var ring = document.createElement("div");
    ring.className = "ring";
    dot = document.createElement("div");
    dot.className = "dot";
    label = document.createElement("div");
    label.className = "name";
    label.textContent = O.cursorName || "Bea";
    el.appendChild(ring);
    el.appendChild(dot);
    el.appendChild(label);
    return el;
  }

  function attach() {
    var host = document.body || document.documentElement;
    if (!host) return;
    if (node && node.isConnected) return;
    node = build();
    host.appendChild(node);
    place();
    lastAttach = Date.now();
  }

  function watch() {
    if (observer || !root.MutationObserver) return;
    observer = new root.MutationObserver(function () {
      if (node && node.isConnected) return;
      if (Date.now() - lastAttach < 1000) return;
      attach();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function place() {
    if (node) node.style.transform = "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0)";
  }

  var easeInOut = function (t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  };

  function moveTo(tx, ty, opts) {
    opts = opts || {};
    attach();
    var ms = Math.max(120, opts.ms || 520);
    var sx = x;
    var sy = y;
    var dx = tx - sx;
    var dy = ty - sy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    // One control point off to the side gives the arc; the side flips at random
    // so two moves in a row never trace the same line.
    var bow = (dist * 0.18 + 8) * (Math.random() < 0.5 ? -1 : 1);
    var cx = sx + dx / 2 - (dy / (dist || 1)) * bow;
    var cy = sy + dy / 2 + (dx / (dist || 1)) * bow;
    var token = {};
    moving = token;
    var t0 = 0;
    return new Promise(function (done) {
      function frame(now) {
        if (moving !== token) return done(false);
        if (!t0) t0 = now;
        var p = Math.min(1, (now - t0) / ms);
        var e = easeInOut(p);
        var inv = 1 - e;
        // quadratic bezier through the control point
        var px = inv * inv * sx + 2 * inv * e * cx + e * e * tx;
        var py = inv * inv * sy + 2 * inv * e * cy + e * e * ty;
        // a little hand-shake, fading out as it lands
        var wob = (1 - e) * 1.6;
        x = px + (Math.random() - 0.5) * wob;
        y = py + (Math.random() - 0.5) * wob;
        place();
        if (p < 1) return root.requestAnimationFrame(frame);
        x = tx;
        y = ty;
        place();
        moving = null;
        done(true);
      }
      root.requestAnimationFrame(frame);
    });
  }

  function press() {
    attach();
    if (dot) {
      dot.style.transform = "scale(.62)";
      root.setTimeout(function () {
        if (dot) dot.style.transform = "scale(1)";
      }, 110);
    }
    if (node) {
      var r = document.createElement("div");
      r.className = "ripple";
      node.appendChild(r);
      root.setTimeout(function () {
        if (r.parentNode) r.parentNode.removeChild(r);
      }, 450);
    }
    return Promise.resolve(true);
  }

  /** dwell keeps it alive: a tiny drift so it never looks frozen. */
  function breathe(ms) {
    var t0 = Date.now();
    return new Promise(function (done) {
      (function step() {
        if (Date.now() - t0 >= ms) return done(true);
        x += (Math.random() - 0.5) * 0.7;
        y += (Math.random() - 0.5) * 0.7;
        place();
        root.setTimeout(step, 90);
      })();
    });
  }

  O.cursor = {
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
      if (!x && !y) {
        x = Math.round((root.innerWidth || 390) / 2);
        y = Math.round((root.innerHeight || 844) * 0.62);
        place();
      }
      return true;
    },
    moveTo: moveTo,
    press: press,
    breathe: breathe,
    at: function () {
      return { x: x, y: y };
    },
    setName: function (n) {
      O.cursorName = String(n || "Bea");
      if (label) label.textContent = O.cursorName;
    },
    el: function () {
      return node;
    },
  };
})(window);
