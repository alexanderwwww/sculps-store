/**
 * The overlay you actually see: a wand that flies to whatever is about to be
 * clicked, sparkles where it lands, a panel naming the job in flight, and
 * Escape to stop.
 *
 * Everything here runs inside the page, not in node.
 *
 * It is built without a <style> element and without @keyframes, which looks
 * like the long way round and is the only way that works. Gemini serves a
 * content security policy with a nonce on its styles, so an injected
 * stylesheet is dropped on the floor — the first version of this mounted
 * fine, reported no error, and drew absolutely nothing. Inline style
 * properties set from script are not covered by that rule, so every rule here
 * is written straight onto an element and every animation is a transition or
 * a timer.
 */

/** Injected on every page load. Calling it twice is a no-op. */
export const OVERLAY = `(() => {
  if (window.__wand) return true;

  const css = (el, s) => { for (const k in s) el.style[k] = s[k]; return el; };
  const root = document.documentElement;
  const TOP = "2147483647";

  // The wand. A transition on transform is what makes it travel rather than
  // jump, and travel is the whole point — you are meant to see where it went.
  const cursor = css(document.createElement("div"), {
    position: "fixed", zIndex: TOP, pointerEvents: "none",
    left: "0", top: "0", width: "46px", height: "46px", margin: "-23px 0 0 -23px",
    fontSize: "36px", lineHeight: "46px", textAlign: "center",
    transition: "transform .45s cubic-bezier(.22,.8,.28,1)",
    filter: "drop-shadow(0 4px 12px rgba(0,0,0,.55))",
    willChange: "transform",
  });
  cursor.textContent = "\\u{1FA84}";
  root.appendChild(cursor);

  const hud = css(document.createElement("div"), {
    position: "fixed", zIndex: TOP, right: "18px", bottom: "18px",
    maxWidth: "340px", padding: "13px 15px", borderRadius: "14px",
    background: "rgba(12,12,14,.94)", color: "#F7F2E7", pointerEvents: "none",
    font: '500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxShadow: "0 10px 40px -12px rgba(0,0,0,.75)",
  });
  const title = css(document.createElement("div"), {
    fontSize: "12px", letterSpacing: ".04em", textTransform: "uppercase",
    color: "#C9A0FF", marginBottom: "5px", fontWeight: "700",
  });
  const body = css(document.createElement("div"), { opacity: ".9" });
  const hint = css(document.createElement("div"), {
    marginTop: "8px", opacity: ".5", fontSize: "11.5px",
  });
  title.textContent = "Ready";
  body.textContent = "Waiting.";
  hint.textContent = "Press Esc to stop";
  hud.append(title, body, hint);
  root.appendChild(hud);

  const state = { stopped: false };

  // Captured on the way down, so a page that swallows keys can't eat it.
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || state.stopped) return;
    state.stopped = true;
    css(title, { color: "#FF6B5A" });
    title.textContent = "Stopped";
    body.textContent = "You pressed Escape. Nothing more will be typed.";
    hint.textContent = "Close the Terminal window, or start it again.";
    css(cursor, { opacity: ".25" });
  }, true);

  function spark(x, y) {
    const s = css(document.createElement("div"), {
      position: "fixed", zIndex: String(Number(TOP) - 1), pointerEvents: "none",
      left: x + "px", top: y + "px", width: "18px", height: "18px",
      margin: "-9px 0 0 -9px", borderRadius: "50%",
      background: "radial-gradient(circle, #FFFFFF 0%, #C9A0FF 45%, rgba(201,160,255,0) 70%)",
      transition: "transform .55s ease-out, opacity .55s ease-out",
      transform: "scale(.4)", opacity: "1",
    });
    root.appendChild(s);
    // Two frames, so the browser has a start value to transition away from.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      css(s, { transform: "scale(2.1)", opacity: "0" });
    }));
    setTimeout(() => s.remove(), 700);
  }

  window.__wand = {
    stopped: () => state.stopped,
    to(x, y, act) {
      // Re-attach if the page's own rendering swept the overlay away.
      if (!cursor.isConnected) root.appendChild(cursor);
      if (!hud.isConnected) root.appendChild(hud);
      cursor.style.transform = "translate(" + x + "px, " + y + "px)";
      if (!act) return;
      spark(x, y);
      // A quick pulse on top of the travel, done with a timer because a
      // keyframe animation would need a stylesheet.
      cursor.style.transition = "transform .12s ease";
      cursor.style.transform = "translate(" + x + "px, " + y + "px) scale(1.25)";
      setTimeout(() => {
        cursor.style.transform = "translate(" + x + "px, " + y + "px) scale(1)";
        setTimeout(() => { cursor.style.transition = "transform .45s cubic-bezier(.22,.8,.28,1)"; }, 140);
      }, 130);
    },
    say(t, b) {
      if (state.stopped) return;
      if (!hud.isConnected) root.appendChild(hud);
      title.textContent = t;
      body.textContent = b;
    },
  };
  return true;
})()`;

/**
 * Mounts the overlay and hands back the three things the runner needs. It
 * reports whether the overlay is really there, because one that silently
 * fails to draw is worse than none — the run looks broken when it isn't.
 */
export async function attachWand(page) {
  await page.addInitScript(OVERLAY).catch(() => {});
  let mounted = false;
  try {
    mounted = Boolean(await page.evaluate(OVERLAY));
  } catch (e) {
    console.log(`  (the on-screen wand couldn't be drawn on this page: ${String(e).split("\n")[0]})`);
  }
  if (!mounted) {
    console.log("  (no on-screen wand here — the typing still works, you just won't see the cursor)");
  }

  const safe = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };

  return {
    mounted,
    stopped: () => safe(() => page.evaluate(() => window.__wand?.stopped() ?? false), false),
    say: (t, b) => safe(() => page.evaluate(([a, c]) => window.__wand?.say(a, c), [t, b])),
    point: async (locator, act = true) => {
      const box = await safe(() => locator.boundingBox(), null);
      if (!box) return;
      const x = box.x + box.width / 2;
      const y = box.y + Math.min(box.height / 2, 40);
      await safe(() => page.evaluate(([a, b, c]) => window.__wand?.to(a, b, c), [x, y, act]));
      // Long enough that the travel reads as movement rather than a jump.
      await page.waitForTimeout(act ? 540 : 260);
    },
    reattach: () => safe(() => page.evaluate(OVERLAY)),
  };
}
