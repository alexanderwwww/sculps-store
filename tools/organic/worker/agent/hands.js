/**
 * hands.js — scroll, tap, type, dwell.
 *
 * Nothing in this file decides WHEN to act. The brain decides; the hands
 * execute. Every action moves the cursor to the target first and waits a beat,
 * because that beat is the whole point: Alex is watching the wand move.
 *
 * Honest note about taps: events synthesised from a script always carry
 * isTrusted === false. There is no way to forge that from page JS — only the
 * user or the browser engine can. React and most sites listen for the event
 * pair anyway, so the sequence below works; where a site checks isTrusted, the
 * tap will not take, and tapEl reports back that nothing changed instead of
 * pretending it worked. el.click() is kept as a fallback for exactly that case
 * — see sig() for why it is not fired unconditionally.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  if (O.hands) return;

  var stopped = false;
  var sleep = function (ms) {
    return new Promise(function (r) {
      root.setTimeout(r, ms);
    });
  };

  function centerOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function inView(el) {
    var r = el.getBoundingClientRect();
    var h = root.innerHeight || 844;
    return r.bottom > 8 && r.top < h - 8;
  }

  /**
   * scroll(px, {pace}) — human bursts with pauses, window.scrollBy in small
   * steps. Never scrollTo, never one jump.
   */
  function scroll(px, opts) {
    opts = opts || {};
    // the brain's paces: "read" is a slow browse, "skim" is a fast flick
    var pace = opts.pace || "easy";
    var perStep = pace === "skim" || pace === "fast" ? 34 : pace === "read" || pace === "slow" ? 12 : 22;
    var burst = pace === "skim" || pace === "fast" ? 9 : pace === "read" || pace === "slow" ? 4 : 6;
    var dir = px < 0 ? -1 : 1;
    var left = Math.abs(px);
    var steps = 0;
    return new Promise(function (done) {
      (function bursts() {
        if (stopped || left <= 0) return done({ moved: true, steps: steps });
        var n = 0;
        (function step() {
          if (stopped || left <= 0 || n >= burst) {
            if (stopped || left <= 0) return done({ moved: true, steps: steps });
            return sleep(160 + Math.random() * 260).then(bursts);
          }
          var amt = Math.min(left, perStep + Math.round(Math.random() * 8));
          root.scrollBy(0, dir * amt);
          left -= amt;
          n++;
          steps++;
          root.setTimeout(step, 16);
        })();
      })();
    });
  }

  function fire(el, type, pt, extra) {
    var Ctor =
      type.indexOf("pointer") === 0 && root.PointerEvent ? root.PointerEvent : root.MouseEvent;
    var init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: root,
      clientX: pt.x,
      clientY: pt.y,
      screenX: pt.x,
      screenY: pt.y,
      button: 0,
      buttons: type === "pointerdown" || type === "mousedown" ? 1 : 0,
      detail: 1,
    };
    if (Ctor === root.PointerEvent) {
      init.pointerId = 1;
      init.pointerType = "touch";
      init.isPrimary = true;
      init.width = 1;
      init.height = 1;
      init.pressure = init.buttons ? 0.5 : 0;
    }
    if (extra) for (var k in extra) init[k] = extra[k];
    try {
      el.dispatchEvent(new Ctor(type, init));
    } catch (e) {
      /* a page that has broken the constructor is not worth crashing over */
    }
  }

  /**
   * A cheap signature of "did this control change state". Dispatching the
   * sequence AND calling el.click() would press a toggle twice — like, then
   * unlike — so el.click() is the fallback only: it runs when the dispatched
   * click changed nothing, which is the case on a site that ignores untrusted
   * events, and is skipped when the sequence already took.
   */
  function sig(el) {
    if (!el || !el.isConnected) return null;
    return (
      (el.getAttribute("aria-label") || "") +
      "|" + (el.getAttribute("aria-pressed") || "") +
      "|" + (el.getAttribute("aria-selected") || "") +
      "|" + ((el.innerText || el.textContent || "").slice(0, 40))
    );
  }

  var SEQ = [
    "pointerover",
    "pointerenter",
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
  ];

  function tapAt(px, py, opts) {
    opts = opts || {};
    return O.cursor.moveTo(px, py, { ms: opts.ms || 480 }).then(function () {
      return sleep(90 + Math.random() * 180);
    }).then(function () {
      return O.cursor.press();
    }).then(function () {
      var pt = { x: px, y: py };
      var target = document.elementFromPoint(px, py) || document.body;
      var before = target ? target.getAttribute("aria-label") : null;
      var s0 = sig(target);
      SEQ.forEach(function (t) {
        fire(target, t, pt);
      });
      if (target && target.isConnected && sig(target) === s0 && typeof target.click === "function") {
        try {
          target.click();
        } catch (e) {
          /* ignore */
        }
      }
      return {
        hit: !!target,
        stillThere: !!(target && target.isConnected),
        labelBefore: before,
        labelAfter: target && target.isConnected ? target.getAttribute("aria-label") : null,
        changed: !!(target && target.isConnected && target.getAttribute("aria-label") !== before),
      };
    });
  }

  function tapEl(el, opts) {
    if (!el) return Promise.resolve({ hit: false, stillThere: false, changed: false });
    var pre = Promise.resolve();
    if (!inView(el)) {
      // bring it on screen the way a thumb would, not with scrollIntoView
      var r = el.getBoundingClientRect();
      pre = scroll(Math.round(r.top - (root.innerHeight || 844) * 0.45), { pace: "easy" });
    }
    return pre.then(function () {
      var c = centerOf(el);
      var before = el.getAttribute("aria-label");
      return O.cursor
        .moveTo(c.x, c.y, { ms: (opts && opts.ms) || 520 })
        .then(function () {
          return sleep(90 + Math.random() * 200);
        })
        .then(function () {
          return O.cursor.press();
        })
        .then(function () {
          var pt = centerOf(el);
          var under = document.elementFromPoint(pt.x, pt.y);
          var target = under && el.contains(under) ? under : el;
          var s0 = sig(el);
          SEQ.forEach(function (t) {
            fire(target, t, pt);
          });
          if (el.isConnected && sig(el) === s0 && typeof el.click === "function") {
            try {
              el.click();
            } catch (e) {
              /* ignore */
            }
          }
          return sleep(60);
        })
        .then(function () {
          var after = el.isConnected ? el.getAttribute("aria-label") : null;
          return {
            hit: true,
            stillThere: !!el.isConnected,
            labelBefore: before,
            labelAfter: after,
            changed: after !== before,
          };
        });
    });
  }

  /** The native value setter, so React's own onChange sees the write. */
  function setValue(el, v) {
    var proto =
      el instanceof root.HTMLTextAreaElement
        ? root.HTMLTextAreaElement.prototype
        : root.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, v);
    else el.value = v;
  }

  /**
   * type(text, {into, strokes, delays, typos})
   *
   * `strokes` is what the brain actually sends: [{key, delayMs}], where a key
   * of "\b" is a backspace. The strokes ARE the rhythm — they are played back
   * exactly, and nothing here invents timing of its own.
   * `delays` + `typos` are the older, simpler form and are turned into the
   * same strokes: one ms per character (a short array repeats its last value),
   * and {at, ch} for a wrong character typed at that index then backspaced.
   * The only field this ever reads back is the one it typed into.
   */
  function type(text, opts) {
    opts = opts || {};
    var el =
      opts.into && typeof opts.into === "string"
        ? document.querySelector(opts.into)
        : opts.into || document.activeElement;
    if (!el) return Promise.resolve({ ok: false, error: "no field" });
    text = String(text == null ? "" : text);
    var delays = Array.isArray(opts.delays) ? opts.delays : [];
    var typos = Array.isArray(opts.typos) ? opts.typos : [];
    var at = function (i) {
      if (!delays.length) return 55; // brain sent nothing: one flat fallback
      return delays[Math.min(i, delays.length - 1)];
    };
    var editable = el.isContentEditable && !("value" in el);

    // strokes win when they are there; otherwise the text + delays form
    var strokes = Array.isArray(opts.strokes) ? opts.strokes.slice() : null;
    if (!strokes) {
      strokes = [];
      for (var si = 0; si < text.length; si++) {
        for (var ti = 0; ti < typos.length; ti++)
          if (typos[ti].at === si) {
            strokes.push({ key: typos[ti].ch, delayMs: at(si) });
            strokes.push({ key: "\b", delayMs: typos[ti].pause || at(si) * 3 });
          }
        strokes.push({ key: text.charAt(si), delayMs: at(si) });
      }
    }

    var write = function (v) {
      if (editable) el.textContent = v;
      else setValue(el, v); // the native setter, so React notices
      el.dispatchEvent(new root.Event("input", { bubbles: true, composed: true }));
    };

    var c = centerOf(el);
    return O.cursor
      .moveTo(c.x, c.y, { ms: 460 })
      .then(function () {
        return O.cursor.press();
      })
      .then(function () {
        try {
          el.focus();
        } catch (e) {
          /* ignore */
        }
        var cur = "";
        var i = 0;
        return new Promise(function (done) {
          (function next() {
            if (stopped || i >= strokes.length) {
              el.dispatchEvent(new root.Event("change", { bubbles: true }));
              // the one field the agent ever reads: the box it just typed into
              return done({ ok: true, typed: editable ? el.textContent : el.value });
            }
            var st = strokes[i++] || {};
            var wait = st.delayMs == null ? 55 : st.delayMs;
            root.setTimeout(function () {
              if (st.key === "\b" || st.key === "Backspace") cur = cur.slice(0, -1);
              else cur += st.key == null ? "" : String(st.key);
              write(cur);
              next();
            }, wait);
          })();
        });
      });
  }

  function dwell(ms) {
    return O.cursor.breathe(Math.max(0, ms | 0)).then(function () {
      return { waited: ms | 0 };
    });
  }

  O.hands = {
    scroll: scroll,
    tapAt: tapAt,
    tapEl: tapEl,
    type: type,
    dwell: dwell,
    centerOf: centerOf,
    stop: function () {
      stopped = true;
    },
    resume: function () {
      stopped = false;
    },
    stopped: function () {
      return stopped;
    },
  };
})(window);
