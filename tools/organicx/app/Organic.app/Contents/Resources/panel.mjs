/**
 * The panel you actually see.
 *
 * The wand is fun because it is a wand — a cursor that flies to what it is
 * about to click and sparkles when it lands. That joke does not transfer.
 * OrganicX is not doing one cute thing; it is running thirteen people across
 * five accounts for ten days, and the question it has to answer at a glance
 * is *who is working, and on what*.
 *
 * So it is a control bar rather than a wand: a pill, centred, small. Who is
 * working and what they are doing on one line, the three connections as three
 * dots, and a stop. Nothing else, because nothing else needs to be on screen
 * while it works — the full record is in the ticker, which is read elsewhere.
 *
 * It was a 306px panel listing all sixteen of the crew down the right-hand
 * side. That is a dashboard, and a dashboard is for reading. This is for
 * glancing at.
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
  var DIM = "rgba(236,238,240,.42)";
  var CREW = __CREW__;
  var byKey = {};
  CREW.forEach(function (p) { byKey[p.key] = p; });

  /* ---- the pill ------------------------------------------------------ */
  /* Glass with no colour of its own: it takes what is behind it. A hard
     light band across the top edge, a shadow pooled under it, and the rim
     drawn from the inside so it reads as thickness rather than a border. */
  var pill = css(document.createElement("div"), {
    position: "fixed", zIndex: TOP,
    left: "50%", bottom: "26px", transform: "translateX(-50%) translateY(16px) scale(.96)",
    boxSizing: "border-box", maxWidth: "min(620px, 92vw)",
    display: "flex", alignItems: "center", gap: "12px",
    padding: "9px 10px 9px 15px",
    borderRadius: "999px",
    background: "rgba(16,17,19,.74)",
    backdropFilter: "blur(24px) saturate(1.7) brightness(1.06)",
    WebkitBackdropFilter: "blur(24px) saturate(1.7) brightness(1.06)",
    boxShadow: [
      "0 18px 50px rgba(0,0,0,.5)",
      "inset 0 1px 0 rgba(255,255,255,.17)",
      "inset 0 -1px 0 rgba(0,0,0,.42)",
      "inset 0 0 34px rgba(57,255,122,.06)"
    ].join(","),
    font: "13px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "rgba(236,238,240,.94)",
    opacity: "0",
    transition: "transform .5s cubic-bezier(.16,1.1,.3,1), opacity .3s linear",
    userSelect: "none", overflow: "hidden",
  });
  pill.id = "ox-panel";

  /* The update bar, hairline across the very top of the pill. */
  var barWrap = css(document.createElement("div"), {
    position: "absolute", left: "0", right: "0", top: "0", height: "2px",
    background: "rgba(255,255,255,.08)", opacity: "0",
    transition: "opacity .25s linear", overflow: "hidden",
  });
  var bar = css(document.createElement("div"), {
    width: "0%", height: "100%",
    background: "linear-gradient(90deg, rgba(11,224,99,.5), " + GREEN + ")",
    boxShadow: "0 0 10px rgba(57,255,122,.85)",
    transition: "width .5s cubic-bezier(.3,.9,.3,1)",
  });
  barWrap.id = "ox-bar-track"; bar.id = "ox-bar";
  barWrap.appendChild(bar); pill.appendChild(barWrap);

  /* Breathing when resting, steady when working. */
  var pulse = css(document.createElement("div"), {
    width: "7px", height: "7px", borderRadius: "50%", flex: "0 0 7px",
    background: GREEN, boxShadow: "0 0 9px " + GREEN,
    transition: "opacity 1.5s ease-in-out, background .3s linear, box-shadow .3s linear",
  });
  pulse.id = "ox-pulse";
  pill.appendChild(pulse);

  /* Who is working, and what they are doing — the only text that matters. */
  var line = css(document.createElement("div"), {
    flex: "1 1 auto", minWidth: "0",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  });
  var whoEl = css(document.createElement("span"), { fontWeight: "700", color: GREEN });
  var didEl = css(document.createElement("span"), { color: "rgba(236,238,240,.8)" });
  whoEl.id = "ox-who"; didEl.id = "ox-did";
  whoEl.textContent = "OrganicX";
  didEl.textContent = " · starting";
  line.appendChild(whoEl); line.appendChild(didEl);
  pill.appendChild(line);

  /* The three connections, as three dots. Hover says which is which. */
  var conns = css(document.createElement("div"), {
    display: "flex", alignItems: "center", gap: "5px", flex: "0 0 auto",
    paddingLeft: "10px", marginLeft: "2px",
    borderLeft: "1px solid rgba(255,255,255,.1)",
  });
  conns.id = "ox-connections";
  var connDots = {};
  ["instagram", "tiktok", "youtube"].forEach(function (platform) {
    var dot = css(document.createElement("span"), {
      width: "7px", height: "7px", borderRadius: "50%",
      background: "rgba(255,255,255,.16)",
      transition: "background .25s linear, box-shadow .25s linear",
    });
    dot.id = "ox-conn-" + platform;
    dot.className = "ox-conn-dot";
    dot.title = platform + ": not connected";
    connDots[platform] = dot;
    conns.appendChild(dot);
  });
  pill.appendChild(conns);

  var stop = css(document.createElement("button"), {
    appearance: "none", border: "1px solid rgba(255,120,120,.3)",
    background: "rgba(255,90,90,.12)", color: "rgba(255,195,195,.95)",
    borderRadius: "999px", padding: "5px 13px", cursor: "pointer", flex: "0 0 auto",
    font: "600 11.5px/1 -apple-system, BlinkMacSystemFont, sans-serif",
  });
  stop.id = "ox-stop";
  stop.title = "or press Esc";
  stop.textContent = "Stop";
  stop.onclick = function () { window.__oxPanel.stopped = true; stop.textContent = "Stopping…"; };
  pill.appendChild(stop);

  document.documentElement.appendChild(pill);
  requestAnimationFrame(function () {
    pill.style.transform = "translateX(-50%) translateY(0) scale(1)";
    pill.style.opacity = "1";
  });

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { window.__oxPanel.stopped = true; stop.textContent = "Stopping…"; }
  }, true);

  var breath = null;
  function breathe(on) {
    if (breath) { clearInterval(breath); breath = null; }
    if (!on) { pulse.style.opacity = "1"; return; }
    var up = false;
    breath = setInterval(function () { up = !up; pulse.style.opacity = up ? "1" : ".3"; }, 1500);
  }

  window.__oxPanel = {
    stopped: false,
    show: function () { pill.style.opacity = "1"; pill.style.transform = "translateX(-50%) translateY(0) scale(1)"; },
    hide: function () { pill.style.opacity = "0"; pill.style.transform = "translateX(-50%) translateY(16px) scale(.96)"; },
    working: function (key, said) {
      var person = byKey[key];
      whoEl.textContent = person ? person.name : (key || "OrganicX");
      didEl.textContent = said ? " · " + said : (person ? " · " + person.role : "");
    },
    connection: function (platform, state, handle) {
      var dot = connDots[platform];
      if (!dot) return;
      var colour = {
        connected: GREEN,
        checking: "#FFD36B",
        waiting: "#FFD36B",
        off: "rgba(255,255,255,.16)",
      }[state] || "rgba(255,255,255,.16)";
      dot.style.background = colour;
      dot.style.boxShadow = state === "connected" ? "0 0 8px " + GREEN : "none";
      dot.title = platform + ": " + (
        state === "connected" ? (handle || "connected")
        : state === "waiting" ? "sign in — I am watching"
        : state === "checking" ? "checking…"
        : "not connected"
      );
    },
    state: function (s) {
      var resting = s === "idle" || s === "resting";
      breathe(resting);
      pulse.style.background = s === "error" ? "#FF6B6B" : GREEN;
      pulse.style.boxShadow = "0 0 9px " + (s === "error" ? "#FF6B6B" : GREEN);
    },
    progress: function (pct, label) {
      if (pct == null) { barWrap.style.opacity = "0"; return; }
      barWrap.style.opacity = "1";
      bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
      if (label) didEl.textContent = " · " + label;
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
