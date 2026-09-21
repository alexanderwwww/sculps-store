/**
 * The home screen: every platform on one page, live.
 *
 * Alex saw a mock — a grid of dark screens with the pill over them — and said
 * that was the thing he wanted. So it is real now. The app keeps one tab per
 * platform, and this page shows a live picture of each of those tabs,
 * refreshed every few seconds, with the ticker underneath. The pill sits on
 * it like it sits on every page.
 *
 * It is the app's own page, served from a data URL, which means no content
 * security policy and no site to break: everything on it is ours. The app
 * opens it first and comes back to it whenever it is between jobs, so what
 * you see when you look at the browser is the whole operation, not whichever
 * feed it happened to be scrolling.
 */

const GREEN = "#39FF7A";

const PLATFORMS = ["instagram", "tiktok", "youtube"];

/** The page itself. Static; everything live is pushed into it afterwards. */
export function homeHtml() {
  const tiles = PLATFORMS.map(
    (p) => `
      <div class="tile" id="tile-${p}">
        <div class="shot"><img id="shot-${p}" alt=""></div>
        <div class="foot">
          <span class="dot" id="dot-${p}"></span>
          <span class="name">${p}</span>
          <span class="who" id="who-${p}">not connected</span>
        </div>
      </div>`,
  ).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>OrganicX</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0b0b0d; color: rgba(236,238,240,.92);
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow: hidden; }
  .wrap { display: grid; grid-template-rows: 1fr auto; height: 100%; padding: 18px 18px 84px; box-sizing: border-box; gap: 14px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; min-height: 0; }
  .tile { display: grid; grid-template-rows: 1fr auto; min-height: 0; border-radius: 14px; overflow: hidden;
    background: linear-gradient(160deg, #173420, #0d1a12 55%, #0b0b0d);
    box-shadow: inset 0 0 0 1px rgba(57,255,122,.08), inset 0 0 60px rgba(57,255,122,.04); }
  .shot { min-height: 0; background: #0b0b0d; display: grid; place-items: center; }
  .shot img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; opacity: 0; transition: opacity .4s; }
  .shot img[src] { opacity: 1; }
  .foot { display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: rgba(16,17,19,.7); font-size: 12px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,.16); transition: background .25s; }
  .dot.on { background: ${GREEN}; box-shadow: 0 0 8px ${GREEN}; }
  .dot.wait { background: #FFD36B; }
  .name { font-weight: 700; text-transform: capitalize; color: rgba(236,238,240,.8); }
  .who { color: rgba(236,238,240,.45); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who.on { color: rgba(236,238,240,.9); }
  .ticker { max-height: 132px; overflow: hidden; display: grid; gap: 3px; align-content: end;
    padding: 10px 14px; border-radius: 12px; background: rgba(16,17,19,.6);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.05); font-size: 12px; }
  .line { display: flex; gap: 8px; color: rgba(236,238,240,.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .line b { color: ${GREEN}; font-weight: 700; min-width: 60px; }
  .line:last-child { color: rgba(236,238,240,.92); }
</style></head>
<body><div class="wrap">
  <div class="grid">${tiles}</div>
  <div class="ticker" id="ticker"></div>
</div>
<script>
  window.__oxHome = {
    shot(p, dataUrl) { var el = document.getElementById("shot-" + p); if (el && dataUrl) el.src = dataUrl; },
    connection(p, state, handle) {
      var d = document.getElementById("dot-" + p), w = document.getElementById("who-" + p);
      if (!d || !w) return;
      d.className = "dot " + (state === "connected" ? "on" : (state === "waiting" || state === "checking") ? "wait" : "");
      w.className = "who " + (state === "connected" ? "on" : "");
      w.textContent = state === "connected" ? (handle || "connected")
        : state === "waiting" ? "sign in in its tab" : state === "checking" ? "checking…" : "not connected";
    },
    ticker(lines) {
      var t = document.getElementById("ticker"); if (!t) return;
      t.innerHTML = "";
      (lines || []).slice(-7).forEach(function (l) {
        var row = document.createElement("div"); row.className = "line";
        var b = document.createElement("b"); b.textContent = l.who || "";
        var s = document.createElement("span"); s.textContent = l.did || "";
        row.appendChild(b); row.appendChild(s); t.appendChild(row);
      });
    },
  };
</script></body></html>`;
}

export function homeUrl() {
  return "data:text/html;charset=utf-8," + encodeURIComponent(homeHtml());
}

/**
 * Push the live state into the home page.
 *
 * A JPEG of each platform tab at low quality — it is a thumbnail, not a
 * record — and the last few ticker lines. Cheap enough to run every few
 * seconds, and Playwright captures a tab that is not in front, so the
 * browser does not have to flip between them to draw this.
 */
export async function refreshHome(home, tabs, { connections = {}, ticker = [] } = {}) {
  if (!home || home.isClosed()) return;
  for (const platform of PLATFORMS) {
    const page = tabs.get(platform);
    if (page && !page.isClosed()) {
      const shot = await page
        .screenshot({ type: "jpeg", quality: 45, timeout: 4000 })
        .then((b) => "data:image/jpeg;base64," + b.toString("base64"))
        .catch(() => null);
      if (shot) await home.evaluate(([p, d]) => window.__oxHome?.shot(p, d), [platform, shot]).catch(() => {});
    }
    const c = connections[platform];
    if (c) await home.evaluate(([p, st, h]) => window.__oxHome?.connection(p, st, h), [platform, c.state, c.handle ?? null]).catch(() => {});
  }
  await home.evaluate((lines) => window.__oxHome?.ticker(lines), ticker.slice(-7)).catch(() => {});
}
