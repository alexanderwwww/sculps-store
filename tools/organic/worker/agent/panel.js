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

  /**
   * Exactly the state the brain pushes. Nothing here is computed locally and
   * nothing is stored — a reload starts from this shape again.
   */
  var state = {
    phase: null,
    build: null,
    paused: false,
    stopped: false,
    doing: null,
    showing: null,
    mcp: null,
    accounts: [
      { platform: "instagram", state: "off", handle: null },
      { platform: "tiktok", state: "off", handle: null },
      { platform: "youtube", state: "off", handle: null },
    ],
    jobs: [],
    lines: [],
  };

  var LABEL = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };

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
      "#" + ID + " .row.here .grow{color:#39FF7A;}" +
      "#" + ID + " .what{display:block;font-size:12px;color:rgba(235,235,245,.55);" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
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
    (state.accounts || []).forEach(function (a) {
      var on = a.state === "on" || a.state === "connected" || a.state === true;
      var act = on ? "switch" : "connect";
      // The name line is the handle; underneath it, what that one is doing —
      // tap the row and the glass goes to it.
      var name = a.handle
        ? (a.handle.charAt(0) === "@" ? a.handle : "@" + a.handle)
        : a.label || LABEL[a.platform] || a.platform;
      var sub = on ? (a.doing || "") : "connect";
      if (a.mission === "recover") sub = "recovery · " + sub;
      h.push(
        '<div class="row' + (a.on ? " here" : "") + '" data-organic-do="' + act +
          '" data-organic-account="' + esc(a.id || "") +
          '" data-organic-platform="' + esc(a.platform) +
          '"><span class="dot' + (on ? " on" : "") + '"></span>' +
          '<span class="grow">' + esc(name) +
          '<span class="what">' + esc(sub) + "</span></span>" +
          '<span class="sub">' + esc(a.on ? "on screen" : on ? "watch" : "") + "</span></div>",
      );
    });

    h.push('<div class="hd">Now</div>');
    var now = state.stopped
      ? "stopped"
      : state.paused
        ? "paused"
        : state.doing || state.showing || state.phase || "idle";
    h.push('<div class="row"><span class="grow">' + esc(now) + "</span>" +
      (state.build ? '<span class="sub">' + esc(state.build) + "</span>" : "") + "</div>");
    if (state.mcp) h.push('<div class="tick">mcp: ' + esc(state.mcp) + "</div>");

    var jobs = (state.jobs || []).slice(-3);
    if (jobs.length) {
      h.push('<div class="hd">Jobs</div>');
      jobs.forEach(function (j) {
        h.push('<div class="tick">' + esc((j.who ? j.who + " — " : "") + (j.what || "")) +
          (j.state ? " (" + esc(j.state) + ")" : "") + "</div>");
      });
    }

    var lines = (state.lines || []).slice(-5);
    if (lines.length) {
      h.push('<div class="hd">Lately</div>');
      lines.forEach(function (l) {
        var t = typeof l === "string" ? l : (l.who ? l.who + ": " : "") + (l.what || "");
        h.push('<div class="tick">' + esc(t) + "</div>");
      });
    }

    h.push(
      '<div class="btns"><div class="btn stop" data-organic-do="stop">Stop</div>' +
        '<div class="btn go" data-organic-do="resume">Resume</div></div>',
    );
    h.push(
      '<div class="drag"><span class="move" data-organic-window="move">drag to move</span>' +
        '<span class="quit" data-organic-do="quit" data-organic-window="quit">Quit</span></div>',
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
      var hit = null;
      var n = ev.target;
      while (n && n !== sheet) {
        if (n.getAttribute && (n.getAttribute("data-organic-do") || n.getAttribute("data-organic-window"))) {
          hit = n;
          break;
        }
        n = n.parentNode;
      }
      if (!hit) return;
      var act = hit.getAttribute("data-organic-do");
      var platform = hit.getAttribute("data-organic-platform") || null;
      var account = hit.getAttribute("data-organic-account") || null;
      if (act) {
        // The panel only ever asks. The brain decides and pushes state back.
        send({ t: "asked", do: act, platform: platform, account: account });
        if (act === "quit") send({ t: "window", do: "quit" });
        if (act === "stop" || act === "resume") setOpen(false);
        return;
      }
      var win = hit.getAttribute("data-organic-window");
      if (win) send({ t: "window", do: win });
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
      [
        "phase", "build", "paused", "stopped", "doing", "showing", "mcp",
        "accounts", "jobs", "lines",
      ].forEach(function (k) {
        if (patch[k] !== undefined) state[k] = patch[k];
      });
      if (state.lines && state.lines.length > 20) state.lines = state.lines.slice(-20);
      render();
      return state;
    },
    tick: function (who, what) {
      state.lines = (state.lines || []).concat([{ who: who, what: what }]).slice(-20);
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
