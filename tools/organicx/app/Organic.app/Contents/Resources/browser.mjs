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
import { spawn } from "node:child_process";
import { keystrokes, frictionIn, between, around, chance } from "./human.mjs";
import { panelSource } from "./panel.mjs";

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

  /*
   * Where Chrome is.
   *
   * The default is where macOS puts it. OX_CHROME overrides it — for a Chrome
   * installed somewhere else, for Chromium, and for running this anywhere
   * that is not a Mac, which is the only way the whole daemon can be executed
   * before it is sent to one.
   */
  const bin = process.env.OX_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    // Without this the profile opens on a restore prompt that nothing clicks.
    "--hide-crash-restore-bubble",
    /*
     * Quiet. A fresh profile otherwise throws every first-run page it has —
     * "what's new", the privacy-sandbox dialog, the extensions and welcome
     * tabs, the sign-in-to-Chrome nudge — and Alex watched a browser open
     * four pages he never asked for before it did any work. None of that
     * is the job. It opens on a blank page and nothing else.
     */
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    "--disable-default-apps",
    "--disable-sync",
    "--no-service-autorun",
    "--password-store=basic",
    "--disable-features=ChromeWhatsNewUI,PrivacySandboxSettings4,PrivacySandboxSettings3,SidePanelPinning,OptimizationGuideModelDownloading",
    "--disable-search-engine-choice-screen",
    "--ash-no-nudges",
    "--no-default-browser-check",
    "about:blank",
    // Extra flags, for running this somewhere that is not a Mac — which is
    // the only way the whole daemon gets exercised before it is sent to one.
    ...(process.env.OX_CHROME_ARGS ? process.env.OX_CHROME_ARGS.split(" ").filter(Boolean) : []),
  ];

  /*
   * Why it failed, if it does.
   *
   * execFile with a callback that swallows everything meant a Chrome that
   * refused to start looked identical to one that was merely slow, and the
   * only symptom forty seconds later was "did not open a debugging port".
   */
  /*
   * spawn, not execFile. execFile buffers the child's output up to one
   * megabyte and then terminates the child — and Chrome writes to stderr
   * steadily, so after enough hours the browser was simply killed mid-session
   * with no relaunch. Only the first line of stderr is kept, for the error
   * message, and the rest is discarded as it arrives.
   */
  let why = null;
  const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"], detached: false });
  child.on("error", (error) => { why = error.message; });
  child.stderr?.once("data", (chunk) => { why = String(chunk).trim().split("\n")[0]; });
  child.stderr?.on("data", () => {}); // drain
  child.unref?.();

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
  throw new Error(
    `Chrome did not open a debugging port on ${port}. Tried: ${bin}` +
      (why ? ` — it said: ${why}` : ""),
  );
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/**
 * Every call into the page, with a deadline.
 *
 * page.evaluate has no timeout of its own. A tab that is still loading, or
 * one whose main thread is busy, makes it wait forever — and wrapping it in
 * .catch() does not help, because it never rejects, it simply never returns.
 *
 * That is exactly how the connect step hung: the goto was capped, so the next
 * suspect was the code that reads the page, and it was waiting on a tab that
 * had not settled. Nothing here is allowed to wait longer than it says.
 */
export async function ask(page, fn, arg, ms = 8000) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(fn, arg),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("the page did not answer")), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Put the cursor and the panel on the page, and keep them across navigations. */
export async function attach(page) {
  const panel = panelSource();
  await page.addInitScript(CURSOR).catch(() => {});
  await page.addInitScript(panel).catch(() => {});
  await ask(page, CURSOR);
  await ask(page, panel);
}

/**
 * Has anyone asked it to stop?
 *
 * Escape or the Stop button set a flag in the page; this is how it reaches
 * node. Checked between every action rather than only between jobs, so a stop
 * lands mid-scroll rather than at the end of the session.
 */
export async function stopRequested(page) {
  return (await ask(page, () => window.__oxPanel?.stopped === true, undefined, 3000)) === true;
}

/** Who is working, and what they are doing this second. */
export async function working(page, who, line) {
  await ask(page, ([w, l]) => window.__oxPanel?.working(w, l), [who, line], 3000);
}

/** Show one platform's live connection state on the panel. */
export async function connection(page, platform, state, handle) {
  await ask(page, ([p, s, h]) => window.__oxPanel?.connection(p, s, h), [platform, state, handle ?? null], 3000);
}

export async function panelState(page, state) {
  await ask(page, (s) => window.__oxPanel?.state(s), state, 3000);
}

export async function progress(page, pct, label) {
  await ask(page, ([p, l]) => window.__oxPanel?.progress(p, l), [pct, label], 3000);
}

export async function say(page, text) {
  await ask(page, (t) => window.__ox?.say(t), text, 3000);
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

  await ask(page, ([px, py]) => window.__ox?.to(px, py), [x, y], 3000);

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
  await ask(page, () => window.__ox?.tap(), undefined, 3000);
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
  const text = await ask(page, () => document.body?.innerText?.slice(0, 4000) ?? "", undefined, 6000);
  return frictionIn(text ?? "");
}

/* ------------------------------------------------------- is anyone home */

/**
 * Whether a platform is signed in, judged from the page rather than from a
 * cookie. A cookie that exists is not a session that works.
 */
const SIGNED_IN = {
  tiktok: {
    url: "https://www.tiktok.com/",
    /*
     * Not the upload link: a signed-out TikTok shows one too and prompts for
     * a login when it is clicked. Taking it as proof reported "connected as
     * @" — connected, with nobody's name on it — which is precisely the
     * failure that ends with the app posting into a logged-out browser.
     */
    in: ['[data-e2e="profile-icon"]', 'a[href^="/@"][data-e2e="nav-profile"]'],
    out: ['button:has-text("Log in")', 'a[href*="/login"]', '#login-modal'],
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
export async function signedIn(page, platform, { navigate = true } = {}) {
  const spec = SIGNED_IN[platform];
  if (!spec) throw new Error(`no such platform: ${platform}`);

  /*
   * Load the page once, then look at it repeatedly.
   *
   * This used to navigate on every check, which is both slow and rude: eight
   * checks meant eight full page loads of the same site in ninety seconds.
   * Worse, page.goto with no timeout waits Playwright's default thirty
   * seconds, so a slow or blocked load turned a ninety-second watch into five
   * minutes of apparently doing nothing.
   *
   * Once the tab is on the site, signing in happens in that tab — so the
   * check is just reading the DOM again.
   */
  if (navigate) {
    await page
      .goto(spec.url, { waitUntil: "domcontentloaded", timeout: 20000 })
      .catch(() => {});
    await attach(page);
    await sleep(between(2500, 4200));
  } else {
    await sleep(between(600, 1200));
  }
  await say(page, `checking whether you are signed in to ${platform}`);

  const friction = await checkFriction(page);
  // "Log in to continue" on a page we expected to be signed in is not
  // friction, it is simply not connected yet.
  if (friction && friction !== "logged out") return { connected: false, friction };

  /*
   * The login redirect, then the session cookie. Not the markup.
   *
   * The first version looked for elements — a Home icon, a profile button —
   * and on Alex's real, signed-in Instagram it found none of them and said
   * "could not tell". Markup is the least stable thing on these sites. The
   * address a platform bounces you to when you are signed out, and the cookie
   * it sets when you sign in, are the most stable.
   *
   *   out = on a login address. Decisive: the platform is saying plainly
   *         that nobody is signed in, and no other signal outweighs it.
   *   in  = the session cookie is present. Not proof on its own — a cookie
   *         that exists is not a session that works — which is why the caller
   *         still has to read the handle before anything counts as connected.
   */
  const here = page.url();
  if (/\/accounts\/login|\/login\b|accounts\.google\.com|ServiceLogin/i.test(here)) {
    return { connected: false, friction: null };
  }

  let cookies = [];
  try {
    cookies = await page.context().cookies();
  } catch {
    return { connected: false, friction: null }; // context mid-teardown: look again next time
  }
  const has = (name, host) =>
    cookies.some((c) => c.name === name && String(c.domain ?? "").includes(host) && String(c.value ?? "").length > 8);
  const session =
    platform === "instagram" ? has("sessionid", "instagram.com")
    : platform === "tiktok" ? has("sessionid", "tiktok.com") || has("sid_tt", "tiktok.com")
    : platform === "youtube" ? has("SAPISID", "google.com") || has("SAPISID", "youtube.com")
    : false;
  if (session) return { connected: true, friction: null };

  /*
   * No cookie, not on a login page — a landing page that has not asked yet,
   * usually. The markers are a second opinion. Wrapped, because they throw
   * when the tab navigates mid-call, which is exactly what submitting a login
   * form does; a throw here used to reach the top and exit the process while
   * Alex was typing a password.
   */
  let out = false, inn = false;
  try {
    for (const sel of spec.out) if (await page.$(sel)) { out = true; break; }
    if (!out) for (const sel of spec.in) if (await page.$(sel)) { inn = true; break; }
  } catch {
    return { connected: false, friction: null };
  }
  if (out) return { connected: false, friction: null };
  if (inn) return { connected: true, friction: null };

  // Still nothing. Guessing "connected" here is what puts the app in a
  // logged-out browser, so it says it does not know instead.
  return { connected: false, friction: "could not tell — the page did not look like either state" };
}

/** The handle the account is actually signed in as, or null. */
export async function whoAmI(page, platform) {
  try {
    if (platform === "instagram") {
      /*
       * Not /accounts/edit/ any more: that page now bounces to Meta's Accounts
       * Center on a different origin, and the username field never appears.
       * Ask what the web app itself asks — the current-user endpoint, from
       * instagram.com, with the session cookies the tab already holds. If
       * that is refused, the home page embeds the viewer in its JSON and the
       * profile link in the left rail points at the account's own page.
       */
      if (!/instagram\.com/.test(page.url())) {
        await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      }
      await sleep(1500);
      const found = await ask(page, async () => {
        try {
          const r = await fetch("/api/v1/accounts/current_user/?edit=true", {
            credentials: "include",
            headers: { "x-ig-app-id": "936619743392459", "x-requested-with": "XMLHttpRequest" },
          });
          if (r.ok) {
            const j = await r.json();
            const u = j?.user?.username;
            if (u) return { via: "api", handle: u };
          }
        } catch {}
        const html = document.documentElement.innerHTML;
        const m = /"viewer"\s*:\s*\{[^{}]*?"username"\s*:\s*"([\w.]+)"/.exec(html);
        if (m) return { via: "viewer", handle: m[1] };
        const link = document.querySelector('a[href^="/"] img[alt$="profile picture" i]')?.closest("a");
        const h = link?.getAttribute("href")?.replace(/^\/|\/$/g, "");
        if (h && !h.includes("/")) return { via: "rail", handle: h };
        return null;
      }, undefined, 12000);
      return found?.handle ? `@${found.handle}` : null;
    }
    if (platform === "tiktok") {
      /*
       * Not a[href^="/@"]: that matches every creator link in the feed, and
       * the first one found would have been recorded as our own handle.
       * /profile redirects a signed-in account to its own /@handle, and the
       * URL cannot be somebody else's.
       */
      await page.goto("https://www.tiktok.com/profile", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      await sleep(1500);
      const m = /tiktok\.com\/(@[\w.-]+)/.exec(page.url());
      return m ? m[1] : null;
    }
    if (platform === "youtube") {
      /*
       * The account page shows exactly one channel — the signed-in one — so
       * a handle found anywhere in its text is ours. The element ids come
       * and go; the text does not.
       */
      await page.goto("https://www.youtube.com/account", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      await sleep(2500);
      const found = await ask(page, () => {
        const el = document.querySelector("#channel-handle, yt-formatted-string#handle");
        const t = el?.textContent?.trim();
        if (t && t.startsWith("@")) return t;
        /*
         * The account page also prints the Google address, and "alex@gmail.com"
         * contains "@gmail.com" — which was recorded as the channel handle
         * once. A handle stands on its own: nothing before the @, and it is
         * never a mailbox domain. No channel yet means no handle, and that
         * is the truth to report rather than the nearest @-shaped string.
         */
        const text = document.body?.innerText ?? "";
        const re = /(?<![\w.@-])(@[\w.-]{3,30})/g;
        let m;
        while ((m = re.exec(text))) {
          const h = m[1];
          if (/^@(gmail|googlemail|icloud|me|yahoo|hotmail|outlook|live|proton|protonmail|mail)\./i.test(h)) continue;
          if (/\.(com|net|org|edu|gov)$/i.test(h)) continue;
          return h;
        }
        return null;
      }, undefined, 8000);
      return found || null;
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
    await ask(page, () => window.__ox?.rest(), undefined, 3000);
    await sleep(around(2600, 1200, 800, 7000));
  }
  await sleep(around(700, 400, 150, 2600));
}
