/**
 * panel.js — the board, inside the glass.
 *
 * One row per job on the shortlist: what it is, what it pays an hour, and the
 * reply Claude drafted for it. Take is a button, and it is the only way work
 * is ever accepted — nothing on this screen fires on its own. That is not a UI
 * preference, it is the line the whole app is built on: Fiverr bans automated
 * order fulfilment, so the accepting is a person tapping a thing.
 *
 * It computes nothing. Every value here is pushed by the brain, and a reload
 * starts again from whatever the brain says next. A panel that kept its own
 * copy of the board would eventually show a job that no longer exists and
 * offer a button that takes it.
 */
(function (root) {
  "use strict";
  var O = root.__cloneNS || (root.__cloneNS = {});
  if (O.panel) return;

  var ID = "__clone_panel";
  var Z = 2147483645;
  var node = null;
  var open = false;

  /** Exactly what the brain pushes. Nothing is stored and nothing is derived. */
  var state = {
    build: null,
    working: false,     // inside the seller's hours
    resting: null,      // why it is idle, in words, when it is
    doing: null,        // the one line under the title
    takenToday: 0,
    takeBudget: 0,
    board: [],          // [{id, title, buyer, why, label, wand, pays, reply, ready, questions}]
  };

  function send(message) {
    try { root.webkit.messageHandlers.clone.postMessage(message); } catch (e) {}
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function money(cents) {
    if (cents == null) return null;
    return "$" + (cents / 100).toFixed(cents % 100 ? 2 : 0);
  }

  function styles() {
    if (document.getElementById(ID + "_css")) return;
    var css = el("style");
    css.id = ID + "_css";
    css.textContent = [
      "#" + ID + "{position:fixed;left:0;right:0;bottom:0;z-index:" + Z + ";",
      "  font:13px/1.45 -apple-system,'SF Pro Text',system-ui,sans-serif;color:#0B0C0E;",
      "  background:rgba(252,252,253,.92);backdrop-filter:blur(30px) saturate(1.6);",
      "  -webkit-backdrop-filter:blur(30px) saturate(1.6);",
      "  border-top:1px solid rgba(11,12,14,.1);box-shadow:0 -14px 40px -24px rgba(11,12,14,.45);",
      "  transform:translateY(calc(100% - 46px));transition:transform .26s cubic-bezier(.2,.8,.3,1);}",
      "#" + ID + ".is-open{transform:translateY(0)}",
      "#" + ID + " .cl-bar{height:46px;display:flex;align-items:center;gap:10px;padding:0 16px;cursor:pointer;user-select:none}",
      "#" + ID + " .cl-dot{width:8px;height:8px;border-radius:50%;background:#C8CBD0;flex:none}",
      "#" + ID + " .cl-dot.on{background:#0F9D58}",
      "#" + ID + " .cl-name{font-weight:700;letter-spacing:-.01em}",
      "#" + ID + " .cl-doing{color:rgba(11,12,14,.55);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      "#" + ID + " .cl-count{font-variant-numeric:tabular-nums;color:rgba(11,12,14,.45)}",
      "#" + ID + " .cl-body{max-height:min(62vh,540px);overflow:auto;padding:4px 16px 18px}",
      "#" + ID + " .cl-rest{padding:10px 0 4px;color:rgba(11,12,14,.5)}",
      "#" + ID + " .cl-job{border-top:1px solid rgba(11,12,14,.09);padding:13px 0}",
      "#" + ID + " .cl-top{display:flex;align-items:baseline;gap:8px}",
      "#" + ID + " .cl-title{font-weight:650;flex:1;min-width:0}",
      "#" + ID + " .cl-pays{font-weight:700;font-variant-numeric:tabular-nums;flex:none}",
      "#" + ID + " .cl-why{color:rgba(11,12,14,.5);margin-top:2px}",
      "#" + ID + " .cl-tag{display:inline-block;margin-right:6px;padding:1px 7px;border-radius:999px;",
      "  background:rgba(11,12,14,.06);font-size:11px;font-weight:700;letter-spacing:.02em}",
      "#" + ID + " .cl-tag.wand{background:rgba(120,60,200,.12);color:#5B2CA8}",
      "#" + ID + " .cl-tag.ask{background:rgba(224,140,10,.14);color:#8A5300}",
      "#" + ID + " .cl-reply{margin-top:8px;padding:9px 11px;border-radius:10px;background:rgba(11,12,14,.04);",
      "  white-space:pre-wrap;max-height:120px;overflow:auto;color:rgba(11,12,14,.78)}",
      "#" + ID + " .cl-acts{display:flex;gap:8px;margin-top:9px}",
      "#" + ID + " button.cl-b{border:0;border-radius:9px;padding:8px 14px;font:inherit;font-weight:650;cursor:pointer}",
      "#" + ID + " .cl-take{background:#0B0C0E;color:#fff}",
      "#" + ID + " .cl-skip{background:rgba(11,12,14,.07);color:#0B0C0E}",
      "#" + ID + " .cl-empty{padding:18px 0;color:rgba(11,12,14,.45)}",
    ].join("");
    document.documentElement.appendChild(css);
  }

  function draw() {
    styles();
    if (!node || !node.isConnected) {
      node = el("div");
      node.id = ID;
      document.documentElement.appendChild(node);
    }
    node.textContent = "";
    node.className = open ? "is-open" : "";

    var bar = el("div", "cl-bar");
    var dot = el("span", "cl-dot" + (state.working ? " on" : ""));
    bar.appendChild(dot);
    bar.appendChild(el("span", "cl-name", "Clone Me"));
    bar.appendChild(el("span", "cl-doing", state.doing || (state.working ? "looking at the board" : "off the clock")));
    bar.appendChild(el("span", "cl-count", state.takenToday + "/" + state.takeBudget + " today"));
    bar.onclick = function () { open = !open; draw(); };
    node.appendChild(bar);

    var body = el("div", "cl-body");

    // Why it is doing nothing is more useful than a spinner. "Asleep until
    // 09:30" is an answer; a blank board is a bug report waiting to happen.
    if (state.resting) body.appendChild(el("div", "cl-rest", state.resting));

    if (!state.board.length) {
      body.appendChild(el("div", "cl-empty", state.working ? "Nothing on the board it can do." : "Not working right now."));
    }

    state.board.forEach(function (job) {
      var row = el("div", "cl-job");

      var top = el("div", "cl-top");
      top.appendChild(el("span", "cl-title", job.title || "(untitled)"));
      var pays = money(job.pays);
      if (pays) top.appendChild(el("span", "cl-pays", pays));
      row.appendChild(top);

      var why = el("div", "cl-why");
      if (job.wand) why.appendChild(el("span", "cl-tag wand", "WAND"));
      if (job.ready === false) why.appendChild(el("span", "cl-tag ask", "NEEDS AN ANSWER"));
      why.appendChild(document.createTextNode([job.label, job.why].filter(Boolean).join(" · ")));
      row.appendChild(why);

      // The drafted reply is shown in full before anything can be taken. A
      // Take button over a reply nobody read is the same as no button at all.
      if (job.reply) row.appendChild(el("div", "cl-reply", job.reply));
      if (job.questions && job.questions.length) {
        row.appendChild(el("div", "cl-reply", job.questions.map(function (q) { return "· " + q; }).join("\n")));
      }

      var acts = el("div", "cl-acts");
      var take = el("button", "cl-b cl-take", job.ready === false ? "Send the questions" : "Take it");
      take.onclick = function () { send({ t: "take", id: job.id }); };
      var skip = el("button", "cl-b cl-skip", "Skip");
      skip.onclick = function () { send({ t: "skip", id: job.id }); };
      acts.appendChild(take);
      acts.appendChild(skip);
      row.appendChild(acts);

      body.appendChild(row);
    });

    node.appendChild(body);
  }

  O.panel = {
    /** The brain pushes the whole state. The panel never patches its own. */
    set: function (next) {
      state = Object.assign({}, state, next || {});
      if (!Array.isArray(state.board)) state.board = [];
      draw();
    },
    open: function () { open = true; draw(); },
    close: function () { open = false; draw(); },
    mount: draw,
  };
})(window);
