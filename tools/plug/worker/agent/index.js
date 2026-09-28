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
    if (O.panel && O.panel.tick) O.panel.tick(who, what);
    send({ t: "tick", who: who, what: what });
  }

  /** The named things the brain taps: like, comment, next, profile. */
  function targetEl(name, a) {
    if (a && a.selector) return document.querySelector(a.selector);
    /* The site by hostname, not by `platform()` — that function knows only the
       three social sites and answers "unknown" everywhere else, which on this
       app meant every lookup returned null and every type went nowhere while
       still reporting success. */
    var s = (O.read.deskSite && O.read.deskSite()) || O.sites[O.read.platform()];
    if (!s) return null;
    /* The one field this app types into. */
    /* Anything the desk names for itself, first — "refresh" lives on the
       Depop recipe and nowhere in this list, so it resolved to null and every
       refresh answered "not found" while being recorded as done. */
    if (name && typeof s[name] === "function") {
      try { return s[name](); } catch (e) { return null; }
    }
    if (name === "composer" || name === "reply") return s.composer ? s.composer() : null;
    if (name === "like") return s.likeButton();
    if (name === "comment") return s.commentBox();
    if (name === "profile") return s.profileLink ? s.profileLink() : null;
    if (name === "reel") return s.openReel();
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
    /**
     * Put a value in one named field of the sell form.
     *
     * Named rather than by selector, because the brain should say "price" and
     * not carry Depop's markup around. Everything it cannot find comes back
     * `found:false` — never a quiet success, which is the failure that told him
     * work was done that never happened.
     */
    fill: function (a) {
      var desk = O.read.deskSite && O.read.deskSite();
      if (!desk || !desk.sell) return { ok: false, found: false, error: "no sell form here" };
      var field = String(a.field || "");
      var value = a.value == null ? "" : String(a.value);

      if (field === "description" || field === "price") {
        var el = desk.sell[field]();
        if (!el) return { ok: false, found: false, field: field };
        return O.hands.type(value, { into: el, strokes: a.strokes }).then(function (r) {
          return { ok: true, found: true, field: field, typed: r && r.typed };
        });
      }

      /* A picker: open it, then choose the option by its own words. */
      var opener = desk.sell.picker(field);
      if (!opener) return { ok: false, found: false, field: field };
      return O.hands.tapEl(opener, {}).then(function () {
        return O.hands.dwell(420);
      }).then(function () {
        var option = desk.sell.option(value);
        if (!option) return { ok: false, found: false, field: field, opened: true, value: value };
        return O.hands.tapEl(option, {}).then(function () {
          return { ok: true, found: true, field: field, value: value };
        });
      });
    },

    /** Post the listing. The last button, and it is the app's now. */
    list: function () {
      var desk = O.read.deskSite && O.read.deskSite();
      var button = desk && desk.sell ? desk.sell.listButton() : null;
      if (!button) return { ok: false, found: false, error: "no list button" };
      return O.hands.tapEl(button, {}).then(function (r) {
        return { ok: true, found: true, changed: !!r.changed };
      });
    },

    tap: function (a) {
      if (a.x != null && a.y != null)
        return O.hands.tapAt(a.x, a.y, a).then(function (r) {
          return { found: !!r.hit, changed: !!r.changed };
        });
      var name = a.target || a.what || null;
      /* Somewhere to be first. The brain asks to refresh a listing by url and
         this ignored the url entirely, so the tap was attempted on whatever
         page happened to be open. Answering "elsewhere" lets the brain come
         back once the page has settled rather than pretending it worked. */
      if (a.url && String(a.url) !== location.href) {
        location.href = String(a.url);
        return { found: false, navigated: true, to: String(a.url) };
      }
      var site = O.sites[O.read.platform()];
      // "next" is not a button on mobile: a reel advances by one viewport.
      if (name === "next") {
        var how = site && site.nextReel ? site.nextReel() : null;
        if (!how) return { found: false, changed: false };
        var y0 = root.scrollY;
        return O.hands.scroll(how.px, { pace: "skim" }).then(function () {
          return { found: true, changed: root.scrollY !== y0 };
        });
      }
      var el = targetEl(name, a);
      if (!el) return { found: false, changed: false }; // never a guess
      return O.hands.tapEl(el, a).then(function (r) {
        return { found: true, changed: !!r.changed, stillThere: !!r.stillThere };
      });
    },

    type: function (a) {
      var into = a.selector || null;
      var name = a.into || a.what || "comment";
      if (!into) into = targetEl(name === "comment" ? "comment" : name, {});
      if (!into) return { ok: false, error: "no field: " + name };
      // The brain sends the rhythm as strokes; the hands only play it.
      return O.hands.type(a.text, {
        into: into,
        strokes: a.strokes,
        delays: a.delays,
        typos: a.typos,
      });
    },

    /**
     * Send a message in whatever conversation is open.
     *
     * Deliberately dumb about WHO: opening the right thread is a separate,
     * visible step, so a message can never land in the wrong conversation
     * because a name matched loosely. If no composer is on screen it says so
     * and sends nothing.
     *
     * The text is typed keystroke by keystroke at the brain's pace — never
     * pasted. A composer filled instantly is the loudest automation signal
     * there is, and this is his own account.
     */
    send: function (a) {
      var desk = null;
      var all = O.sites || {};
      for (var key in all) {
        if (all[key] && typeof all[key].match === "function" && all[key].match(location.hostname)) desk = all[key];
      }
      var box = desk && desk.composer ? desk.composer() : null;
      if (!box) return Promise.resolve({ ok: false, error: "no message box on this page" });
      var body = String(a.text == null ? "" : a.text);
      if (!body.trim()) return Promise.resolve({ ok: false, error: "nothing to say" });

      return O.hands.type(body, { into: box, strokes: a.strokes, delays: a.delays, typos: a.typos }).then(function (r) {
        if (!r || !r.ok) return { ok: false, error: (r && r.error) || "could not type" };
        if (a.hold) return { ok: true, typed: r.typed, sent: false };
        // Enter sends on both WhatsApp Web and the Alibaba message centre.
        ["keydown", "keypress", "keyup"].forEach(function (type) {
          box.dispatchEvent(
            new root.KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }),
          );
        });
        return { ok: true, typed: r.typed, sent: true };
      });
    },

    /**
     * Hand the page a picture — the product render, his WeChat QR.
     *
     * The file arrives from the app as a data URL already in the page; this
     * only attaches it to the site's own file input. If the message centre is
     * not open, or the paperclip has not been pressed and no input exists, it
     * says so and sends nothing.
     */
    sendFile: function (a) {
      return O.hands.sendFile({
        file: a.file || a.dataUrl || a.blob,
        name: a.name,
        selector: a.selector,
      });
    },

    /** Open a conversation by the exact name the list shows. */
    openThread: function (a) {
      var all = O.sites || {};
      for (var key in all) {
        var site = all[key];
        if (site && typeof site.match === "function" && site.match(location.hostname) && site.openThread) {
          return { ok: Boolean(site.openThread(String(a.who || ""))) };
        }
      }
      return { ok: false, error: "this page has no conversation list" };
    },

    dwell: function (a) {
      return O.hands.dwell(a.ms == null ? 800 : a.ms);
    },
    read: function (a) {
      var what = a.what || "page";
      if (what === "posts") return O.read.posts();
      if (what === "tags") return O.read.tags();
      if (what === "text") return O.read.bodyText(4000);
      if (what === "ads") return O.read.ads();
      if (what === "store") return O.read.store(a.url, a);
      if (what === "handle") return O.read.handle(a.platform);
      if (what === "signedIn") return O.read.signedIn(a.platform);
      if (what === "userId") return O.read.userId();
      if (what === "sellForm") {
        var desk = O.read.deskSite && O.read.deskSite();
        return desk && desk.sellForm ? desk.sellForm() : { ok: false, error: "no sell form here" };
      }
      if (what === "accountStatus") return O.read.accountStatus();
      if (what === "accountStatusUrl") return O.read.accountStatusUrl();
      if (what === "threads") return O.read.threads();
      if (what === "messages") return O.read.messages();
      if (what === "results") return O.read.results();

      /*
       * The desk's own vocabulary.
       *
       * The brain asks for "listings" and "thread"; the readers above produce
       * "results" and "messages" in the shapes the pages actually give. These
       * two lines are the seam between them, and they are a seam rather than
       * a rename because the shapes differ too: a listing needs a name to be
       * worth keeping, and a message needs a direction before anything it
       * says can be filed as a supplier's answer.
       */
      if (what === "listings") {
        /* No reshaping. The original needed a seam here because the page's
           supplier vocabulary and the brain's differed; this app's reader and
           this app's brain already agree on one shape, and translating between
           two identical shapes is exactly how buyer, price, due time and the
           brief all arrived as undefined. The row goes through as read. */
        return O.read.results();
      }
      if (what === "thread") {
        // Opening by the exact printed name first: reading the wrong
        // conversation is how a supplier's words get filed under another's.
        var site = null;
        var all = O.sites || {};
        for (var key in all) {
          if (all[key] && typeof all[key].match === "function" && all[key].match(location.hostname)) site = all[key];
        }
        if (a.who && site && site.openThread) site.openThread(String(a.who));
        return O.read.messages().map(function (m, i) {
          return {
            id: String(m.at || "") + "#" + i + "#" + String(m.text || "").slice(0, 24),
            // Unknown stays unknown: a message whose side the page did not
            // state is never filed as a supplier's reply.
            dir: m.mine === true ? "out" : m.mine === false ? "in" : "unknown",
            text: m.text != null ? m.text : m.line,
            at: m.at,
          };
        });
      }
      if (what === "supplier") return O.read.supplier();
      return O.read.handle(a.platform).then(function (h) {
        return {
          url: location.href,
          platform: O.read.platform(),
          signedIn: O.read.signedIn(),
          handle: h,
          posts: O.read.posts(),
          tags: O.read.tags(),
        };
      });
    },

    say: function (a) {
      tick(a.who || "crew", a.what || "");
      return { said: true };
    },
    cursor: function (a) {
      if (a.label || a.name) O.cursor.setName(a.label || a.name);
      if (a.press) return O.cursor.press();
      if (a.x != null && a.y != null) return O.cursor.moveTo(a.x, a.y, { ms: a.ms });
      return O.cursor.at();
    },
    panel: function (a) {
      /* The fields arrive flat. They used to be read off `a.set`, which meant
         the panel merged {t,id,act,set} into its own state and never saw
         board, doing or working at all — a screen that could not change.
         `set` is still honoured so an older worker keeps working. */
      var next = a && a.set && typeof a.set === "object" ? a.set : a;
      O.panel.set(next);
      /* And the glass. The orb is the whole app when the window is folded
         away, so the state has to reach it too — same words, same counts,
         sent through the one door into Swift. */
      try {
        window.webkit.messageHandlers.organic.postMessage({
          t: "window",
          do: "status",
          note: a.note || null,
          /* So the window knows whether to show the sign-in chips at all. */
          signedOut: next.signedOut === true,
          text: next.doing || next.resting || (next.working ? "on the board" : "resting"),
          dot: next.working ? "green" : "grey",
          taken: next.takenToday,
          budget: next.takeBudget,
        });
      } catch (e) {}
      if (a.show === true) O.panel.open();
      else if (a.show === false) O.panel.close();
      /* Guarded rather than assumed: this panel is not the research app's and
         does not carry every method that one does. Unguarded, this threw after
         set() had already run — so the one signal that would have exposed the
         bug above came back as a TypeError instead. */
      return { ok: true, open: O.panel.isOpen ? O.panel.isOpen() : null };
    },

    stop: function (a) {
      if (a.resume) {
        O.hands.resume();
        O.panel.set({ stopped: false, paused: false });
        return { stopped: false };
      }
      O.hands.stop();
      O.panel.set({ stopped: true });
      return { stopped: true };
    },
  };

  /*
   * The same acts, reachable without going through the message handler.
   *
   * The app talks to this page over its own bridge, but a test needs to drive
   * the very same dispatch table directly — and a test that calls something
   * else is not testing the app. So the table gets a front door, and every
   * recipe, reader and hand behind it is identical either way.
   */
  O.act = function (name, args) {
    var fn = ACTS[name];
    if (!fn) return Promise.reject(new Error("unknown act: " + name));
    return Promise.resolve().then(function () {
      return fn(args || {});
    });
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
    var base = {
      t: "hello",
      url: location.href,
      platform: O.read.platform(),
      signedIn: O.read.signedIn(),
    };
    return O.read
      .handle()
      .then(function (h) {
        base.handle = h;
        send(base);
        return base;
      })
      .catch(function () {
        base.handle = null;
        send(base);
        return base;
      });
  }

  /**
   * What the site answers when something fails.
   *
   * Alex saw Instagram's own "an unexpected error occurred" and asked whether
   * the log showed the response. It did not: the log carried what the crew
   * said and nothing the site said back. So the page watches its own network
   * now — only failures, only the status and the first words of the body,
   * never a form field and never anything he typed. A refused login is a
   * fact worth having; it is also usually not an account problem at all.
   */
  function watchNetwork() {
    if (root.__organicNetWatched) return;
    root.__organicNetWatched = true;
    var realFetch = root.fetch;
    if (typeof realFetch !== "function") return;
    root.fetch = function (input, init) {
      var url = "";
      try { url = typeof input === "string" ? input : (input && input.url) || ""; } catch (e) { url = ""; }
      return realFetch.apply(this, arguments).then(function (res) {
        try {
          var interesting = res && (res.status >= 400 || /login|challenge|checkpoint|accounts\/login/i.test(url));
          if (interesting && res.status >= 400) {
            var copy = res.clone();
            copy.text().then(function (body) {
              send({
                t: "trouble",
                what: "the site refused " + short(url) + " with " + res.status + (body ? ": " + String(body).slice(0, 180) : ""),
              });
            }).catch(function () {
              send({ t: "trouble", what: "the site refused " + short(url) + " with " + res.status });
            });
          }
        } catch (e) { /* watching must never break the page */ }
        return res;
      });
    };
  }

  function short(url) {
    try { var u = new URL(url, location.href); return u.hostname + u.pathname.slice(0, 60); } catch (e) { return String(url).slice(0, 60); }
  }

  watchNetwork();

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
