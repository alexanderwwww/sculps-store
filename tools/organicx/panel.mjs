/**
 * The panel you actually see.
 *
 * The wand is fun because it is a wand — a cursor that flies to what it is
 * about to click and sparkles when it lands. That joke does not transfer.
 * OrganicX is not doing one cute thing; it is running thirteen people across
 * five accounts for ten days, and the question it has to answer at a glance
 * is *who is working, and on what*.
 *
 * So it is a floor plan rather than a wand. The crew are on it. Whoever is
 * working is lit; the rest are dim. Under the lit name, one line of plain
 * language. When something stops you get a name and a sentence, not an error
 * code.
 *
 * Everything here runs inside the page, not in node, and it is written
 * without a <style> element on purpose — these sites serve a content security
 * policy with a nonce on their styles, so an injected stylesheet is dropped
 * on the floor. It mounts, reports no error, and draws nothing. Every rule
 * below is written onto an element and every animation is a transition.
 *
 * It ships through the live-update channel, so the UI can be changed on the
 * spot without anybody downloading an app.
 */

/** The crew, in the order the work moves through them. */
export const CREW = [
  { key: "reyna", name: "Reyna", role: "research" },
  { key: "desmond", name: "Desmond", role: "validation" },
  { key: "nadia", name: "Nadia", role: "strategy" },
  { key: "kofi", name: "Kofi", role: "footage" },
  { key: "lena", name: "Lena", role: "editor" },
  { key: "marcus", name: "Marcus", role: "copy" },
  { key: "tomas", name: "Tomas", role: "sound" },
  { key: "yusuf", name: "Yusuf", role: "product" },
  { key: "carla", name: "Carla", role: "creative" },
  { key: "eli", name: "Eli", role: "provenance" },
  { key: "hana", name: "Hana", role: "brand" },
  { key: "ines", name: "Inés", role: "casting" },
  { key: "sam", name: "Sam", role: "operator" },
  { key: "bea", name: "Bea", role: "traffic" },
  { key: "theo", name: "Theo", role: "analyst" },
  { key: "rosa", name: "Rosa", role: "merchant" },
];

/**
 * The overlay, as source, injected into every page.
 *
 * Every backtick and every ${ inside this string — including in comments —
 * has to be escaped. `node --check` reports a line nowhere near the cause
 * when one is not, which is why the harness compiles it separately.
 */
export const PANEL = `(() => {
  if (window.__oxPanel) { try { window.__oxPanel.show(); } catch (e) {} return true; }

  var css = function (el, s) { for (var k in s) el.style[k] = s[k]; return el; };
  var TOP = "2147483646";
  var GREEN = "#39FF7A";
  var DIM = "rgba(236,238,240,.34)";

  /* ---- the glass ----------------------------------------------------- */
  /* No colour of its own. It takes what is behind it — a saturating,
     brightening blur, a hard light band across the top edge, a shadow pooled
     at the bottom, and the rim drawn from the inside on all four sides so it
     reads as thickness rather than a border. */
  var panel = css(document.createElement("div"), {
    position: "fixed", zIndex: TOP, right: "18px", bottom: "18px",
    /* border-box, so 306 means 306. Without it the padding is added on top
       and the panel is 334 wide, which is the kind of thing nobody notices
       until it overlaps something. */
    boxSizing: "border-box", width: "306px", padding: "14px 14px 12px",
    borderRadius: "18px",
    background: "rgba(16,17,19,.72)",
    backdropFilter: "blur(22px) saturate(1.7) brightness(1.06)",
    WebkitBackdropFilter: "blur(22px) saturate(1.7) brightness(1.06)",
    boxShadow: [
      "0 24px 60px rgba(0,0,0,.55)",
      "inset 0 1px 0 rgba(255,255,255,.16)",
      "inset 0 -1px 0 rgba(0,0,0,.4)",
      "inset 1px 0 0 rgba(255,255,255,.05)",
      "inset -1px 0 0 rgba(255,255,255,.05)",
      "inset 0 0 40px rgba(57,255,122,.05)"
    ].join(","),
    font: "13px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "rgba(236,238,240,.92)",
    /* Opens like liquid: a bead arrives, spreads wider and flatter than it
       will finish, then settles back as the blur clears. The clearing lags
       the shape on purpose — matching the durations turns it into a fade. */
    transform: "translateY(14px) scale(.94)",
    opacity: "0",
    transition: "transform .52s cubic-bezier(.16,1.1,.3,1), opacity .34s linear",
    userSelect: "none",
  });
  panel.id = "ox-panel";

  /* ---- the update bar ------------------------------------------------ */
  /* Across the top, inside the glass. It moves when real work happens and it
     finishes before it disappears — Apple's actual trick there is not the
     bar, it is that it never sits at 99%. */
  var barWrap = css(document.createElement("div"), {
    position: "absolute", left: "14px", right: "14px", top: "7px",
    height: "2px", borderRadius: "2px",
    background: "rgba(255,255,255,.09)",
    opacity: "0", transition: "opacity .25s linear",
    overflow: "hidden",
  });
  var bar = css(document.createElement("div"), {
    width: "0%", height: "100%", borderRadius: "2px",
    background: "linear-gradient(90deg, rgba(11,224,99,.5), " + GREEN + ")",
    boxShadow: "0 0 10px rgba(57,255,122,.85)",
    transition: "width .5s cubic-bezier(.3,.9,.3,1)",
  });
  barWrap.id = "ox-bar-track";
  bar.id = "ox-bar";
  barWrap.appendChild(bar);
  panel.appendChild(barWrap);

  /* ---- the header ---------------------------------------------------- */
  var head = css(document.createElement("div"), {
    display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px",
  });
  var pulse = css(document.createElement("div"), {
    width: "7px", height: "7px", borderRadius: "50%",
    background: GREEN, boxShadow: "0 0 10px " + GREEN,
    transition: "opacity 1.5s ease-in-out, background .3s linear, box-shadow .3s linear",
  });
  var title = css(document.createElement("div"), {
    fontWeight: "700", letterSpacing: ".02em", fontSize: "12.5px", flex: "1",
  });
  title.textContent = "OrganicX";
  var stateLabel = css(document.createElement("div"), {
    fontSize: "10.5px", letterSpacing: ".07em", textTransform: "uppercase",
    color: DIM, fontWeight: "600",
  });
  stateLabel.textContent = "idle";
  head.appendChild(pulse); head.appendChild(title); head.appendChild(stateLabel);
  panel.appendChild(head);

  /* ---- the connections ------------------------------------------------ */
  /* Live, and always on screen. Whether an account is actually signed in is
     the one thing that decides whether anything else can happen, so it is
     not a line that scrolls past in a log — it is a row that is either green
     or it is not, re-checked while the app runs. */
  var conns = css(document.createElement("div"), {
    display: "grid", gap: "3px", marginBottom: "10px",
    paddingBottom: "9px", borderBottom: "1px solid rgba(255,255,255,.08)",
  });
  conns.id = "ox-connections";
  var connRows = {};
  ["instagram", "tiktok", "youtube"].forEach(function (platform) {
    var row = css(document.createElement("div"), {
      display: "flex", alignItems: "center", gap: "7px", fontSize: "11.5px",
    });
    var dot = css(document.createElement("span"), {
      width: "6px", height: "6px", borderRadius: "50%", flex: "0 0 6px",
      background: "rgba(255,255,255,.18)",
      transition: "background .25s linear, box-shadow .25s linear",
    });
    var name = css(document.createElement("span"), {
      fontWeight: "600", minWidth: "62px", color: "rgba(236,238,240,.7)",
      textTransform: "capitalize",
    });
    name.textContent = platform;
    var who = css(document.createElement("span"), {
      flex: "1", minWidth: "0", color: DIM,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    });
    who.textContent = "not connected";
    row.id = "ox-conn-" + platform;
    dot.className = "ox-conn-dot";
    who.className = "ox-conn-who";
    row.appendChild(dot); row.appendChild(name); row.appendChild(who);
    connRows[platform] = { dot: dot, who: who };
    conns.appendChild(row);
  });
  panel.appendChild(conns);

  /* ---- the crew ------------------------------------------------------ */
  var list = css(document.createElement("div"), { display: "grid", gap: "1px" });
  var rows = {};
  var CREW = __CREW__;
  CREW.forEach(function (person) {
    var row = css(document.createElement("div"), {
      display: "flex", alignItems: "baseline", gap: "7px",
      padding: "3px 7px", borderRadius: "7px",
      transition: "background .22s linear, color .22s linear",
      color: DIM,
    });
    var name = css(document.createElement("span"), {
      fontWeight: "600", fontSize: "12px", minWidth: "54px",
    });
    name.textContent = person.name;
    var said = css(document.createElement("span"), {
      fontSize: "11.5px", flex: "1", minWidth: "0",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      opacity: ".85",
    });
    said.textContent = person.role;
    row.id = "ox-crew-" + person.key;
    name.className = "ox-crew-name";
    said.className = "ox-crew-said";
    row.appendChild(name); row.appendChild(said);
    rows[person.key] = { row: row, name: name, said: said };
    list.appendChild(row);
  });
  panel.appendChild(list);

  /* ---- the stop ------------------------------------------------------ */
  /* Always reachable, and it says what it does. An agent driving somebody's
     real accounts that cannot be stopped in one move is not one anybody
     should be asked to run. */
  var foot = css(document.createElement("div"), {
    display: "flex", alignItems: "center", gap: "8px",
    marginTop: "10px", paddingTop: "9px",
    borderTop: "1px solid rgba(255,255,255,.08)",
  });
  var stop = css(document.createElement("button"), {
    appearance: "none", border: "1px solid rgba(255,120,120,.34)",
    background: "rgba(255,90,90,.12)", color: "rgba(255,190,190,.95)",
    borderRadius: "8px", padding: "5px 12px", cursor: "pointer",
    font: "600 11.5px/1 -apple-system, BlinkMacSystemFont, sans-serif",
    letterSpacing: ".03em",
  });
  stop.id = "ox-stop";
  stop.textContent = "Stop";
  stop.onclick = function () { window.__oxPanel.stopped = true; stop.textContent = "Stopping…"; };
  var hint = css(document.createElement("div"), {
    fontSize: "10.5px", color: DIM, flex: "1", textAlign: "right",
  });
  hint.textContent = "or press Esc";
  foot.appendChild(stop); foot.appendChild(hint);
  panel.appendChild(foot);

  document.documentElement.appendChild(panel);
  requestAnimationFrame(function () {
    panel.style.transform = "translateY(0) scale(1)";
    panel.style.opacity = "1";
  });

  /* Escape stops it from anywhere, including mid-action. */
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { window.__oxPanel.stopped = true; stop.textContent = "Stopping…"; }
  }, true);

  /* Breathing, only while resting. A pulse that never stops is a spinner. */
  var breath = null;
  function breathe(on) {
    if (breath) { clearInterval(breath); breath = null; }
    if (!on) { pulse.style.opacity = "1"; return; }
    var up = false;
    breath = setInterval(function () { up = !up; pulse.style.opacity = up ? "1" : ".3"; }, 1500);
  }

  window.__oxPanel = {
    stopped: false,
    show: function () { panel.style.opacity = "1"; panel.style.transform = "translateY(0) scale(1)"; },
    hide: function () { panel.style.opacity = "0"; panel.style.transform = "translateY(14px) scale(.94)"; },
    /* Who is working, and what they are doing this second. */
    working: function (key, line) {
      Object.keys(rows).forEach(function (k) {
        var r = rows[k];
        var on = k === key;
        r.row.style.background = on ? "rgba(57,255,122,.10)" : "transparent";
        r.row.style.color = on ? "rgba(236,238,240,.96)" : DIM;
        r.name.style.color = on ? GREEN : "inherit";
        if (on && line) r.said.textContent = line;
      });
    },
    /*
     * One platform's live state.
     *
     * The state is one of: waiting (the login page is open), checking,
     * connected, or off. Connected is the only one that goes green, and it
     * carries the handle it actually read off the page rather than the one
     * anybody assumed.
     */
    connection: function (platform, state, handle) {
      var r = connRows[platform];
      if (!r) return;
      var colour = {
        connected: GREEN,
        checking: "#FFD36B",
        waiting: "#FFD36B",
        off: "rgba(255,255,255,.18)",
      }[state] || "rgba(255,255,255,.18)";
      r.dot.style.background = colour;
      r.dot.style.boxShadow = state === "connected" ? "0 0 8px " + GREEN : "none";
      r.who.textContent =
        state === "connected" ? (handle || "connected")
        : state === "waiting" ? "sign in — I am watching"
        : state === "checking" ? "checking…"
        : "not connected";
      r.who.style.color = state === "connected" ? "rgba(236,238,240,.9)" : DIM;
    },
    state: function (s) {
      stateLabel.textContent = s || "";
      var resting = s === "idle" || s === "resting";
      breathe(resting);
      pulse.style.background = s === "error" ? "#FF6B6B" : GREEN;
      pulse.style.boxShadow = "0 0 10px " + (s === "error" ? "#FF6B6B" : GREEN);
    },
    /* The update bar. Never sits at 99: it finishes, then it goes. */
    progress: function (pct, label) {
      if (pct == null) { barWrap.style.opacity = "0"; return; }
      barWrap.style.opacity = "1";
      bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
      if (label) stateLabel.textContent = label;
      if (pct >= 100) setTimeout(function () { barWrap.style.opacity = "0"; bar.style.width = "0%"; }, 420);
    },
  };
  window.__oxPanel.state("idle");
  return true;
})()`;

/** The overlay with the crew baked in, ready to inject. */
export function panelSource() {
  return PANEL.replace("__CREW__", JSON.stringify(CREW));
}
