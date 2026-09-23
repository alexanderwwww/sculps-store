/**
 * panel.js — the sheet inside the glass.
 *
 * Slides up from the home bar when you tap it (or the small grabber above it).
 * Shows the three platforms with a dot and a handle each, what the crew is
 * doing right now, the last few ticker lines, and Stop / Resume.
 *
 * It never acts on its own. Every press sends {t:"asked", ...} to the brain and
 * waits; the brain sends state back. The drag handle and the quit button send
 * {t:"window", ...}, which Swift handles because only Swift can.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  if (O.panel) return;

  var ID = "__organic_panel";
  var Z = 2147483645;
  var node = null;
  var sheet = null;
  var open = false;
  var lastAttach = 0;
  var observer = null;

  var state = {
    accounts: [
      { platform: "instagram", label: "Instagram", handle: null, on: false },
      { platform: "tiktok", label: "TikTok", handle: null, on: false },
      { platform: "youtube", label: "YouTube", handle: null, on: false },
    ],
    now: "idle",
    ticks: [],
    running: true,
  };

  var FONT =
    "-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',system-ui,sans-serif";

  function css() {
    return (
      "#" + ID + "{position:fixed;inset:0;z-index:" + Z + ";pointer-events:none;font-family:" +
      FONT + ";}" +
      "#" + ID + " .scrim{position:absolute;inset:0;background:rgba(0,0,0,0);" +
      "transition:background 220ms ease;pointer-events:none;}" +
      "#" + ID + ".on .scrim{background:rgba(0,0,0,.34);pointer-events:auto;}" +
      "#" + ID + " .grab{position:absolute;bottom:0;left:50%;transform:translateX(-50%);" +
      "width:170px;height:26px;pointer-events:auto;}" +
      "#" + ID + " .sheet{position:absolute;left:8px;right:8px;bottom:8px;" +
      "border-radius:26px;background:rgba(28,28,30,.82);" +
      "-webkit-backdrop-filter:blur(26px) saturate(180%);" +
      "backdrop-filter:blur(26px) saturate(180%);color:#fff;" +
      "box-shadow:0 -8px 40px rgba(0,0,0,.5),inset 0 0 0 .5px rgba(255,255,255,.14);" +
      "transform:translateY(112%);transition:transform 300ms cubic-bezier(.22,1,.36,1);" +
      "pointer-events:auto;padding:8px 0 14px;}" +
      "#" + ID + ".on .sheet{transform:translateY(0);}" +
      "#" + ID + " .bar{width:36px;height:5px;border-radius:3px;margin:0 auto 10px;" +
      "background:rgba(255,255,255,.3);}" +
      "#" + ID + " .row{display:flex;align-items:center;gap:10px;padding:9px 16px;" +
      "font-size:15px;line-height:20px;}" +
      "#" + ID + " .row+.row{box-shadow:inset 0 .5px 0 rgba(255,255,255,.1);}" +
      "#" + ID + " .row .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;" +
      "white-space:nowrap;}" +
      "#" + ID + " .dot{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.22);}" +
      "#" + ID + " .dot.on{background:#39FF7A;box-shadow:0 0 8px rgba(57,255,122,.8);}" +
      "#" + ID + " .sub{font-size:13px;color:rgba(235,235,245,.6);}" +
      "#" + ID + " .hd{font-size:12px;letter-spacing:.06em;text-transform:uppercase;" +
      "color:rgba(235,235,245,.5);padding:12px 16px 4px;}" +
      "#" + ID + " .tick{font-size:12px;color:rgba(235,235,245,.66);padding:2px 16px;" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      "#" + ID + " .btns{display:flex;gap:8px;padding:12px 16px 2px;}" +
      "#" + ID + " .btn{flex:1;text-align:center;padding:11px 0;border-radius:14px;" +
      "font-size:15px;font-weight:600;background:rgba(120,120,128,.32);color:#fff;}" +
      "#" + ID + " .btn.stop{background:rgba(255,69,58,.9);}" +
      "#" + ID + " .btn.go{background:rgba(57,255,122,.9);color:#08210f;}" +
      "#" + ID + " .drag{padding:0 16px 2px;display:flex;align-items:center;gap:10px;" +
      "font-size:12px;color:rgba(235,235,245,.5);}" +
      "#" + ID + " .drag .move{flex:1;height:18px;}" +
      "#" + ID + " .quit{color:rgba(255,105,97,.95);font-weight:600;}"
    );
  }

  function send(msg) {
    if (O.send) O.send(msg);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function render() {
    if (!sheet) return;
    var h = ['<div class="bar"></div>'];
    h.push('<div class="hd">Accounts</div>');
    state.accounts.forEach(function (a) {
      h.push(
        '<div class="row" data-organic-act="' +
          (a.on ? "switch" : "connect") +
          '" data-organic-platform="' +
          esc(a.platform) +
          '"><span class="dot' +
          (a.on ? " on" : "") +
          '"></span><span class="grow">' +
          esc(a.label) +
          '</span><span class="sub">' +
          esc(a.handle ? "@" + a.handle : a.on ? "connected" : "connect") +
          "</span></div>",
      );
    });
    h.push('<div class="hd">Now</div>');
    h.push('<div class="row"><span class="grow">' + esc(state.now) + "</span></div>");
    if (state.ticks.length) {
      h.push('<div class="hd">Lately</div>');
      state.ticks.slice(-5).forEach(function (t) {
        h.push('<div class="tick">' + esc(t) + "</div>");
      });
    }
    h.push(
      '<div class="btns"><div class="btn stop" data-organic-act="stop">Stop</div>' +
        '<div class="btn go" data-organic-act="resume">Resume</div></div>',
    );
    h.push(
      '<div class="drag"><span class="move" data-organic-window="move">drag to move</span>' +
        '<span class="quit" data-organic-window="quit">Quit</span></div>',
    );
    sheet.innerHTML = h.join("");
  }

  function build() {
    var el = document.createElement("div");
    el.id = ID;
    var style = document.createElement("style");
    style.textContent = css();
    el.appendChild(style);
    var scrim = document.createElement("div");
    scrim.className = "scrim";
    var grab = document.createElement("div");
    grab.className = "grab";
    sheet = document.createElement("div");
    sheet.className = "sheet";
    el.appendChild(scrim);
    el.appendChild(grab);
    el.appendChild(sheet);

    scrim.addEventListener("click", function () {
      setOpen(false);
    });
    grab.addEventListener("click", function () {
      setOpen(true);
    });

    sheet.addEventListener("click", function (ev) {
      var t = ev.target;
      while (t && t !== sheet && !t.getAttribute) t = t.parentNode;
      var hit = null;
      var n = ev.target;
      while (n && n !== sheet) {
        if (n.getAttribute && (n.getAttribute("data-organic-act") || n.getAttribute("data-organic-window"))) {
          hit = n;
          break;
        }
        n = n.parentNode;
      }
      if (!hit) return;
      var win = hit.getAttribute("data-organic-window");
      if (win) {
        send({ t: "window", do: win });
        return;
      }
      var act = hit.getAttribute("data-organic-act");
      var platform = hit.getAttribute("data-organic-platform") || null;
      send({ t: "asked", what: act, platform: platform });
      if (act === "stop" || act === "resume") setOpen(false);
    });

    // dragging the move strip asks Swift to move the window
    var last = null;
    var strip = function () {
      return sheet.querySelector('[data-organic-window="move"]');
    };
    sheet.addEventListener("pointerdown", function (ev) {
      if (ev.target === strip()) last = { x: ev.screenX, y: ev.screenY };
    });
    root.addEventListener("pointermove", function (ev) {
      if (!last) return;
      var dx = ev.screenX - last.x;
      var dy = ev.screenY - last.y;
      if (!dx && !dy) return;
      last = { x: ev.screenX, y: ev.screenY };
      send({ t: "window", do: "move", dx: dx, dy: dy });
    });
    root.addEventListener("pointerup", function () {
      last = null;
    });

    render();
    return el;
  }

  function attach() {
    var host = document.body || document.documentElement;
    if (!host) return;
    if (node && node.isConnected) return;
    node = build();
    host.appendChild(node);
    if (open) node.classList.add("on");
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

  function setOpen(v) {
    attach();
    open = !!v;
    if (node) node.classList.toggle("on", open);
    return open;
  }

  O.panel = {
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
    open: function () {
      return setOpen(true);
    },
    close: function () {
      return setOpen(false);
    },
    toggle: function () {
      return setOpen(!open);
    },
    isOpen: function () {
      return open;
    },
    /** The brain owns the contents. This only draws what it is given. */
    set: function (patch) {
      if (!patch) return state;
      if (patch.accounts) state.accounts = patch.accounts;
      if (patch.now != null) state.now = patch.now;
      if (patch.running != null) state.running = !!patch.running;
      if (patch.ticks) state.ticks = patch.ticks.slice(-20);
      render();
      return state;
    },
    tick: function (who, what) {
      state.ticks.push((who ? who + ": " : "") + what);
      if (state.ticks.length > 20) state.ticks = state.ticks.slice(-20);
      render();
    },
    state: function () {
      return state;
    },
    el: function () {
      return node;
    },
  };
})(window);
