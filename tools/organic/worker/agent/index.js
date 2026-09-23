/**
 * index.js — the entry. Builds window.__organic, wires the bridge, boots the
 * pieces.
 *
 * This bundle is injected at document start into EVERY frame and on EVERY
 * navigation, so it must be idempotent twice over: it runs only in the top
 * frame, and a second run on the same window is a no-op.
 *
 * It stores nothing, logs nothing that came out of a field, and never reads an
 * input's value except the comment box hands.type() just wrote to.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});

  // Only the top frame. An iframe gets the script too and must stay silent.
  try {
    if (root.top !== root.self) return;
  } catch (e) {
    return; // cross-origin parent: not the top frame we own
  }
  if (root.__organic && root.__organic.__booted) return;

  /** Post to Swift. In a plain browser (and in the tests) there is no handler. */
  function send(msg) {
    var text;
    try {
      text = JSON.stringify(msg);
    } catch (e) {
      return false;
    }
    try {
      if (
        root.webkit &&
        root.webkit.messageHandlers &&
        root.webkit.messageHandlers.organic &&
        typeof root.webkit.messageHandlers.organic.postMessage === "function"
      ) {
        root.webkit.messageHandlers.organic.postMessage(text);
        return true;
      }
    } catch (e) {
      /* the handler can vanish mid-navigation; never let that throw */
    }
    (root.__organic.sent = root.__organic.sent || []).push(msg);
    if (root.__organic.sent.length > 200) root.__organic.sent.shift();
    return false;
  }
  O.send = send;

  function tick(who, what) {
    O.panel.tick(who, what);
    send({ t: "tick", who: who, what: what });
  }

  function elFor(a) {
    if (a.selector) return document.querySelector(a.selector);
    if (a.what) {
      var s = O.sites[O.read.platform()];
      if (!s) return null;
      if (a.what === "like") return s.likeButton();
      if (a.what === "comment") return s.commentBox();
      if (a.what === "reel") return s.openReel();
    }
    return null;
  }

  var ACTS = {
    goto: function (a) {
      if (!a.url) throw new Error("goto needs a url");
      location.assign(a.url);
      return { going: a.url };
    },
    scroll: function (a) {
      return O.hands.scroll(a.px == null ? root.innerHeight : a.px, { pace: a.pace });
    },
    tap: function (a) {
      if (a.x != null && a.y != null) return O.hands.tapAt(a.x, a.y, a);
      var el = elFor(a);
      if (!el) throw new Error("nothing to tap: " + (a.selector || a.what || "?"));
      return O.hands.tapEl(el, a);
    },
    type: function (a) {
      var into = a.selector || a.into || null;
      if (!into && a.what) into = elFor({ what: a.what });
      return O.hands.type(a.text, { into: into, delays: a.delays, typos: a.typos });
    },
    dwell: function (a) {
      return O.hands.dwell(a.ms == null ? 800 : a.ms);
    },
    read: function (a) {
      var what = a.what || "page";
      if (what === "posts") return { posts: O.read.posts() };
      if (what === "tags") return { tags: O.read.tags() };
      if (what === "handle") return { handle: O.read.handle() };
      if (what === "signedIn") return { signedIn: O.read.signedIn() };
      return {
        url: location.href,
        platform: O.read.platform(),
        signedIn: O.read.signedIn(),
        handle: O.read.handle(),
        posts: O.read.posts(),
        tags: O.read.tags(),
      };
    },
    say: function (a) {
      tick(a.who || "crew", a.what || "");
      return { said: true };
    },
    cursor: function (a) {
      if (a.name) O.cursor.setName(a.name);
      if (a.press) return O.cursor.press();
      if (a.x != null && a.y != null) return O.cursor.moveTo(a.x, a.y, { ms: a.ms });
      return O.cursor.at();
    },
    panel: function (a) {
      if (a.open != null) a.open ? O.panel.open() : O.panel.close();
      if (a.accounts || a.now != null || a.ticks || a.running != null) O.panel.set(a);
      return { open: O.panel.isOpen(), state: O.panel.state() };
    },
    stop: function (a) {
      if (a.resume) {
        O.hands.resume();
        O.panel.set({ running: true });
        return { running: true };
      }
      O.hands.stop();
      O.panel.set({ running: false, now: "stopped" });
      return { running: false };
    },
  };

  function fromApp(jsonText) {
    var msg;
    try {
      msg = typeof jsonText === "string" ? JSON.parse(jsonText) : jsonText;
    } catch (e) {
      return false;
    }
    if (!msg || msg.t !== "do") return false;
    var id = msg.id;
    var fn = ACTS[msg.act];
    if (!fn) {
      send({ t: "done", id: id, ok: false, result: null, error: "unknown act: " + msg.act });
      return false;
    }
    // `stop` must land even while something is in flight, so nothing is queued.
    Promise.resolve()
      .then(function () {
        return fn(msg);
      })
      .then(function (result) {
        send({ t: "done", id: id, ok: true, result: result == null ? null : result, error: null });
      })
      .catch(function (err) {
        send({
          t: "done",
          id: id,
          ok: false,
          result: null,
          error: (err && err.message) || String(err),
        });
      });
    return true;
  }

  function hello() {
    send({
      t: "hello",
      url: location.href,
      platform: O.read.platform(),
      signedIn: O.read.signedIn(),
      handle: O.read.handle(),
    });
  }

  root.__organic = {
    __booted: true,
    version: 1,
    fromApp: fromApp,
    send: send,
    ns: O,
    // handy for the app and the tests; none of these keep state anywhere
    cursor: O.cursor,
    hands: O.hands,
    read: O.read,
    panel: O.panel,
    sites: O.sites,
    find: O.find,
    bezel: O.bezel,
    hello: hello,
  };

  function boot() {
    O.bezel.mount();
    O.cursor.mount();
    O.panel.mount();
    hello();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})(window);
