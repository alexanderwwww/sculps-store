/**
 * The hands, and the cursor that lets you watch them.
 *
 * Everything that touches a real page goes through here. `human.mjs` decides
 * what a person would do; this does it, at human speed, with a visible cursor
 * so Alex can see where it went. That visibility is not decoration — the wand
 * earned its trust by being watchable, and an agent driving your logged-in
 * accounts invisibly is a thing nobody should be asked to trust.
 *
 * Two rules hold everywhere in this file:
 *
 *   Nothing logs in. Chrome is started with its own profile and Alex signs in
 *   himself. No password is typed by this code, stored by it, or read by it.
 *
 *   Friction stops the account. A captcha, a verification prompt, an action
 *   block — the account is parked for the day and the reason is written down.
 *   There is no retry, because retrying is how accounts are lost.
 */
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { keystrokes, frictionIn, between, around, chance } from "./human.mjs";

const run = promisify(execFile);

/* ----------------------------------------------------------- the overlay */

/**
 * The cursor, injected into every page.
 *
 * Written the way the wand's is and for the same reason: these sites ship a
 * content security policy with a nonce on their styles, so an injected
 * <style> element is dropped on the floor — it mounts, reports no error, and
 * draws absolutely nothing. Inline style properties set from script are not
 * covered by that rule, so every rule here is written onto an element and
 * every animation is a transition.
 *
 * Green rather than the wand's sparkle, because it is a different app doing a
 * different job on somebody's real account.
 */
export const CURSOR = `(() => {
  if (window.__ox) return true;
  const css = (el, s) => { for (const k in s) el.style[k] = s[k]; return el; };
  const TOP = "2147483647";
  const GREEN = "#39FF7A";

  const dot = css(document.createElement("div"), {
    position: "fixed", zIndex: TOP, pointerEvents: "none",
    left: "0", top: "0", width: "18px", height: "18px", margin: "-9px 0 0 -9px",
    borderRadius: "50%",
    background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,.95), " + GREEN + " 45%, rgba(11,224,99,.25) 70%, transparent 72%)",
    boxShadow: "0 0 14px rgba(57,255,122,.75), 0 2px 8px rgba(0,0,0,.45)",
    transition: "transform .38s cubic-bezier(.22,.8,.28,1), opacity .2s linear",
    opacity: "0",
  });
  dot.id = "ox-cursor";
  document.documentElement.appendChild(dot);

  const label = css(document.createElement("div"), {
    position: "fixed", zIndex: TOP, pointerEvents: "none",
    left: "50%", top: "14px", transform: "translateX(-50%)",
    padding: "7px 14px", borderRadius: "10px",
    font: "600 13px/1.25 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "rgba(255,255,255,.96)",
    background: "rgba(14,14,16,.82)",
    border: "1px solid rgba(57,255,122,.34)",
    boxShadow: "0 8px 30px rgba(0,0,0,.5), inset 0 0 22px rgba(57,255,122,.07)",
    opacity: "0", transition: "opacity .22s linear",
    maxWidth: "62vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  });
  label.id = "ox-label";
  document.documentElement.appendChild(label);

  window.__ox = {
    to(x, y) { dot.style.opacity = "1"; dot.style.transform = "translate(" + x + "px," + y + "px)"; },
    say(text) { label.textContent = text || ""; label.style.opacity = text ? "1" : "0"; },
    tap() {
      // A ring that expands and fades where the click landed.
      const r = css(document.createElement("div"), {
        position: "fixed", zIndex: TOP, pointerEvents: "none",
        left: dot.style.transform ? "0" : "0", top: "0",
        width: "18px", height: "18px", margin: "-9px 0 0 -9px", borderRadius: "50%",
        border: "2px solid " + GREEN, transform: dot.style.transform,
        transition: "transform .45s ease-out, opacity .45s ease-out", opacity: ".9",
      });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => {
        r.style.transform = dot.style.transform + " scale(3.2)";
        r.style.opacity = "0";
      });
      setTimeout(() => r.remove(), 520);
    },
    rest() { dot.style.opacity = ".35"; },
  };
  return true;
})()`;

/* ------------------------------------------------------------- the browser */

/**
 * Its own Chrome, with its own profile.
 *
 * Separate from Alex's everyday Chrome on purpose: his tabs, his history and
 * his sessions are not touched, and the accounts this drives are not sitting
 * in the browser he uses for everything else.
 */
export async function openChrome({ port = 9333, profile }) {
  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    return { browser, started: false };
  } catch {
    /* Nothing listening yet — start one. */
  }

  const bin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    // Without this the profile opens on a restore prompt that nothing clicks.
    "--hide-crash-restore-bubble",
  ];
  execFile(bin, args, () => {});

  // It takes a moment to listen. Racing it prints "nothing on port 9333",
  // which reads like a missing Chrome rather than an impatient caller.
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      return { browser, started: true };
    } catch {
      /* keep waiting */
    }
  }
  throw new Error("Chrome did not open a debugging port. Is Google Chrome installed?");
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** Put the cursor on the page, and keep it there across navigations. */
export async function attach(page) {
  await page.addInitScript(CURSOR);
  await page.evaluate(CURSOR).catch(() => {});
}

export async function say(page, text) {
  await page.evaluate((t) => window.__ox?.say(t), text).catch(() => {});
}

/* --------------------------------------------------------------- the hands */

/**
 * Move to an element the way a hand does: an arc rather than a jump, a small
 * overshoot, and a settle. Straight-line instant movement between two exact
 * centre points is one of the cheapest automation tells there is.
 */
export async function moveTo(page, target) {
  const box = await target.boundingBox();
  if (!box) return null;

  // Not the exact centre. People do not click the centre.
  const x = box.x + box.width * between(0.32, 0.68);
  const y = box.y + box.height * between(0.32, 0.68);

  await page.evaluate(([px, py]) => window.__ox?.to(px, py), [x, y]).catch(() => {});

  // A couple of waypoints, so the pointer arcs.
  const from = page.__oxAt ?? { x: x - between(120, 380), y: y - between(80, 260) };
  const steps = Math.round(between(8, 18));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t * t * (3 - 2 * t);
    const wobble = Math.sin(t * Math.PI) * between(-14, 14);
    await page.mouse.move(
      from.x + (x - from.x) * ease + wobble,
      from.y + (y - from.y) * ease + wobble * 0.6,
    );
    await sleep(between(6, 22));
  }
  page.__oxAt = { x, y };
  await sleep(around(180, 90, 60, 600));
  return { x, y };
}

export async function click(page, target) {
  const at = await moveTo(page, target);
  if (!at) return false;
  await page.evaluate(() => window.__ox?.tap()).catch(() => {});
  await page.mouse.click(at.x, at.y, { delay: Math.round(between(40, 130)) });
  return true;
}

/**
 * Type the way a person types, including the typos they leave standing.
 *
 * The keystrokes come from `human.mjs` so the behaviour can be tested without
 * a browser; this only plays them back.
 */
export async function type(page, text, persona) {
  for (const { key, delayMs } of keystrokes(text, persona)) {
    await sleep(delayMs);
    if (!key) continue; // a pause to think
    if (key === "Backspace") await page.keyboard.press("Backspace");
    else await page.keyboard.type(key);
  }
}

/**
 * Scroll a feed the way a thumb does, and sometimes stop dead.
 *
 * Returns when the requested distance is covered or the caller's `until`
 * says to stop.
 */
export async function scroll(page, { absorbed = false } = {}) {
  const distance = Math.round(around(absorbed ? 520 : 900, 260, 180, 1600));
  const steps = Math.round(between(3, 9));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps);
    await sleep(between(18, 70));
  }
}

/* ------------------------------------------------------------- the brakes */

/**
 * Look at the page and decide whether to stop.
 *
 * Reads the visible text rather than a status code, because none of these
 * arrive as an error — they arrive as a polite sentence in the middle of the
 * page, and the account keeps working right up until it does not.
 */
export async function checkFriction(page) {
  const text = await page
    .evaluate(() => document.body?.innerText?.slice(0, 4000) ?? "")
    .catch(() => "");
  return frictionIn(text);
}

/* ------------------------------------------------------- is anyone home */

/**
 * Whether a platform is signed in, judged from the page rather than from a
 * cookie. A cookie that exists is not a session that works.
 */
const SIGNED_IN = {
  tiktok: {
    url: "https://www.tiktok.com/",
    // The upload entry point only exists for a signed-in account.
    in: ['a[href*="/upload"]', '[data-e2e="profile-icon"]'],
    out: ['button:has-text("Log in")', 'a[href*="/login"]'],
  },
  instagram: {
    url: "https://www.instagram.com/",
    in: ['svg[aria-label="Home"]', 'a[href="/accounts/edit/"]', '[aria-label="New post"]'],
    out: ['input[name="username"]', 'button:has-text("Log In")'],
  },
  youtube: {
    url: "https://www.youtube.com/",
    in: ["#avatar-btn", 'button[aria-label*="Account"]'],
    out: ['a[href*="accounts.google.com/ServiceLogin"]', 'tp-yt-paper-button:has-text("Sign in")'],
  },
};

/**
 * Open a platform and report whether Alex is signed in.
 *
 * This is the whole of the connect flow's detection. It never types anything
 * into a login form — it opens the page, waits, and looks.
 */
export async function signedIn(page, platform) {
  const spec = SIGNED_IN[platform];
  if (!spec) throw new Error(`no such platform: ${platform}`);

  await page.goto(spec.url, { waitUntil: "domcontentloaded" }).catch(() => {});
  await attach(page);
  await say(page, `checking whether you are signed in to ${platform}`);
  await sleep(between(2500, 4200));

  const friction = await checkFriction(page);
  // "Log in to continue" on a page we expected to be signed in is not
  // friction, it is simply not connected yet.
  if (friction && friction !== "logged out") return { connected: false, friction };

  for (const sel of spec.in) {
    if (await page.$(sel)) return { connected: true, friction: null };
  }
  for (const sel of spec.out) {
    if (await page.$(sel)) return { connected: false, friction: null };
  }
  // Neither marker found: the page changed, and guessing "connected" here
  // would have the app posting into a logged-out browser.
  return { connected: false, friction: "could not tell — the page did not look like either state" };
}

/** The handle the account is actually signed in as, or null. */
export async function whoAmI(page, platform) {
  try {
    if (platform === "instagram") {
      await page.goto("https://www.instagram.com/accounts/edit/", { waitUntil: "domcontentloaded" });
      await sleep(2200);
      const v = await page.inputValue('input[name="username"]').catch(() => null);
      return v ? `@${v}` : null;
    }
    if (platform === "tiktok") {
      const href = await page.getAttribute('[data-e2e="profile-icon"] a, a[href^="/@"]', "href").catch(() => null);
      return href?.startsWith("/@") ? href.slice(1) : null;
    }
    if (platform === "youtube") {
      await page.goto("https://www.youtube.com/account", { waitUntil: "domcontentloaded" });
      await sleep(2000);
      const t = await page.textContent("#channel-handle, yt-formatted-string#handle").catch(() => null);
      return t?.trim() || null;
    }
  } catch {
    /* A handle we could not read is not a reason to stop. */
  }
  return null;
}

/**
 * Idle the way a person does between actions — and occasionally do nothing
 * at all for a beat, which is the cheapest thing on this list and the least
 * imitated.
 */
export async function beat(page) {
  if (chance(0.07)) {
    await page.evaluate(() => window.__ox?.rest()).catch(() => {});
    await sleep(around(2600, 1200, 800, 7000));
  }
  await sleep(around(700, 400, 150, 2600));
}
