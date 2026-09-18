/**
 * The overlay you actually see.
 *
 * Everything in here is injected into the page and runs in the browser, not in
 * node. It draws a wand where the automation is about to act, a small panel
 * saying what it is doing, and it listens for Escape.
 *
 * Why a visible cursor at all: a script that silently types into your browser
 * is indistinguishable from something going wrong. A wand that travels to the
 * box before the text appears makes every action something you watched happen,
 * and the panel means you can walk away and still know where it got to.
 *
 * Escape is handled in the page rather than in node because that is where your
 * keyboard is. It sets a flag the runner checks between every step, so a stop
 * lands at a step boundary instead of halfway through a sentence.
 */

/** Injected once per page. Safe to call again — it no-ops if it's already up. */
export const OVERLAY = `(() => {
  if (window.__wand) return;

  const css = \`
    @keyframes wand-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.18) } }
    @keyframes wand-spark { 0% { opacity: 1; transform: scale(.4) rotate(0deg) } 100% { opacity: 0; transform: scale(1.8) rotate(90deg) } }
    #wand-cursor {
      position: fixed; z-index: 2147483647; pointer-events: none;
      width: 44px; height: 44px; left: 0; top: 0; margin: -22px 0 0 -22px;
      transition: transform .45s cubic-bezier(.22,.8,.28,1);
      font-size: 34px; line-height: 44px; text-align: center;
      filter: drop-shadow(0 4px 10px rgba(0,0,0,.45));
    }
    #wand-cursor.is-act { animation: wand-pulse .45s ease }
    .wand-spark {
      position: fixed; z-index: 2147483646; pointer-events: none;
      width: 16px; height: 16px; margin: -8px 0 0 -8px;
      background: radial-gradient(circle, #FFD76B 0%, #F5821F 55%, transparent 70%);
      border-radius: 50%; animation: wand-spark .6s ease-out forwards;
    }
    #wand-hud {
      position: fixed; z-index: 2147483647; right: 18px; bottom: 18px;
      max-width: 340px; padding: 13px 15px; border-radius: 14px;
      background: rgba(12,12,14,.93); color: #F7F2E7; pointer-events: none;
      font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 10px 40px -12px rgba(0,0,0,.7);
      backdrop-filter: blur(10px);
    }
    #wand-hud b { display: block; font-size: 12px; letter-spacing: .04em;
      text-transform: uppercase; color: #F5821F; margin-bottom: 5px }
    #wand-hud p { margin: 0; opacity: .88 }
    #wand-hud small { display: block; margin-top: 8px; opacity: .5; font-size: 11.5px }
    #wand-hud.is-stop b { color: #FF6B5A }
  \`;

  const style = document.createElement("style");
  style.textContent = css;
  document.documentElement.appendChild(style);

  const cursor = document.createElement("div");
  cursor.id = "wand-cursor";
  cursor.textContent = "\\u{1FA84}";
  document.documentElement.appendChild(cursor);

  const hud = document.createElement("div");
  hud.id = "wand-hud";
  hud.innerHTML = '<b>Ready</b><p>Waiting.</p><small>Press Esc to stop</small>';
  document.documentElement.appendChild(hud);

  const state = { stopped: false };

  // Escape is the whole contract: one key, and nothing further is typed.
  // Captured on the way down so a page that swallows keys can't eat it.
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || state.stopped) return;
    state.stopped = true;
    hud.classList.add("is-stop");
    hud.querySelector("b").textContent = "Stopped";
    hud.querySelector("p").textContent = "You pressed Escape. Nothing more will be typed.";
    hud.querySelector("small").textContent = "Close this tab, or run the command again.";
    cursor.style.opacity = "0.25";
  }, true);

  window.__wand = {
    stopped: () => state.stopped,
    /** Move the wand to a point and leave a spark where it lands. */
    to(x, y, act) {
      cursor.style.transform = \`translate(\${x}px, \${y}px)\`;
      if (!act) return;
      cursor.classList.remove("is-act");
      void cursor.offsetWidth;
      cursor.classList.add("is-act");
      const s = document.createElement("div");
      s.className = "wand-spark";
      s.style.left = x + "px";
      s.style.top = y + "px";
      document.documentElement.appendChild(s);
      setTimeout(() => s.remove(), 620);
    },
    say(title, body) {
      if (state.stopped) return;
      hud.querySelector("b").textContent = title;
      hud.querySelector("p").textContent = body;
    },
  };
})()`;

/**
 * Re-injects the overlay after any navigation and gives the caller the three
 * things the runner needs: move the wand, update the panel, and ask whether
 * Escape has been pressed.
 */
export async function attachWand(page) {
  // addInitScript covers pages loaded later; the eval covers the one already open.
  await page.addInitScript(OVERLAY).catch(() => {});
  await page.evaluate(OVERLAY).catch(() => {});

  const alive = async (fn, fallback) => {
    try { return await fn(); } catch { return fallback; }
  };

  return {
    /** True once the person has pressed Escape in the browser window. */
    stopped: () => alive(() => page.evaluate(() => window.__wand?.stopped() ?? false), false),

    say: (title, body) =>
      alive(() => page.evaluate(([t, b]) => window.__wand?.say(t, b), [title, body])),

    /** Fly the wand to an element and spark on it. */
    point: async (locator, act = true) => {
      const box = await alive(() => locator.boundingBox(), null);
      if (!box) return;
      const x = box.x + box.width / 2;
      const y = box.y + Math.min(box.height / 2, 40);
      await alive(() => page.evaluate(([a, b, c]) => window.__wand?.to(a, b, c), [x, y, act]));
      // Long enough for the travel animation to read as movement, not a jump.
      await page.waitForTimeout(act ? 520 : 260);
    },

    /** Put it back after a navigation blew the overlay away. */
    reattach: () => alive(() => page.evaluate(OVERLAY)),
  };
}
