/**
 * Is anyone home, and who.
 *
 * Two questions, asked of a page the caller owns. This file never opens a
 * page, never closes one, never types into a login form and never sees a
 * password. Alex signs in through the screen himself; this reads the result.
 *
 * Ported from organicx/browser.mjs, where both readers were proven on a real
 * Mac: Instagram answered "@blackreaper.us" through its current_user
 * endpoint, and the YouTube reader stopped recording a mailbox address as a
 * channel handle.
 *
 * Nothing here throws. A page that cannot be read is "not connected" or
 * "no handle", never a crash — a throw from here used to reach the top of the
 * old app and exit the process while Alex was typing a password.
 */
import { between, frictionIn } from "./human.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/**
 * Every call into the page, with a deadline.
 *
 * page.evaluate has no timeout of its own. A tab that is still loading, or
 * one whose main thread is busy, makes it wait forever — and .catch() does
 * not help, because it never rejects, it simply never returns. Nothing here
 * is allowed to wait longer than it says; on timeout the answer is null.
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

/** A navigation that gives up after 20 s rather than Playwright's 30, and never throws. */
export async function go(page, url, ms = 20000) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: ms });
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------- addresses */

const HOME = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/",
  youtube: "https://www.youtube.com/",
};

const LOGIN = {
  instagram: "https://www.instagram.com/accounts/login/",
  tiktok: "https://www.tiktok.com/login",
  youtube: "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/",
};

/** Where a platform's own sign-in page is — the screen is sent there, Alex does the rest. */
export function loginUrl(platform) {
  return LOGIN[platform] ?? null;
}

/** The platform's front page. */
export function homeUrl(platform) {
  return HOME[platform] ?? null;
}

export const PLATFORMS = Object.keys(HOME);

/* ------------------------------------------------------ is anyone home */

/**
 * DOM markers: the third opinion, after the address and the cookie.
 *
 * Markup is the least stable thing on these sites, which is why it is asked
 * last. Not TikTok's upload link: a signed-out TikTok shows one too.
 */
const MARKERS = {
  tiktok: {
    in: ['[data-e2e="profile-icon"]', 'a[href^="/@"][data-e2e="nav-profile"]'],
    out: ['button:has-text("Log in")', 'a[href*="/login"]', "#login-modal"],
  },
  instagram: {
    in: ['svg[aria-label="Home"]', 'a[href="/accounts/edit/"]', '[aria-label="New post"]'],
    out: ['input[name="username"]', 'button:has-text("Log In")'],
  },
  youtube: {
    in: ["#avatar-btn", 'button[aria-label*="Account"]'],
    out: ['a[href*="accounts.google.com/ServiceLogin"]', 'tp-yt-paper-button:has-text("Sign in")'],
  },
};

const LOGIN_URL = /\/accounts\/login|\/login\b|accounts\.google\.com|ServiceLogin/i;

/**
 * Whether a platform is signed in, on the page it is given.
 *
 *   1. The address. On a login page → not connected, decisively: the
 *      platform is saying plainly that nobody is signed in.
 *   2. The session cookie. Present → connected. Not proof on its own — a
 *      cookie that exists is not a session that works — which is why the
 *      caller still reads the handle before anything counts as connected.
 *   3. The markers, as a second opinion when there is no cookie.
 *   4. Otherwise "could not tell". Guessing "connected" here is what puts the
 *      app in a logged-out browser.
 *
 * `navigate: true` loads the platform's home first (20 s cap). The default
 * is not to: the setup screens sit on the site already and are polled every
 * few seconds, and eight page loads in ninety seconds is both slow and rude.
 */
export async function signedIn(page, platform, { navigate = false } = {}) {
  if (!HOME[platform]) return { connected: false, friction: `no such platform: ${platform}` };
  try {
    if (navigate) {
      await go(page, HOME[platform]);
      await sleep(between(2500, 4200));
    }

    const text = await ask(page, () => document.body?.innerText?.slice(0, 4000) ?? "", undefined, 6000);
    const friction = frictionIn(text ?? "");
    // "Log in to continue" on a page we expected to be signed in is not
    // friction, it is simply not connected yet.
    if (friction && friction !== "logged out") return { connected: false, friction };

    const here = String(page.url?.() ?? "");
    if (LOGIN_URL.test(here)) return { connected: false, friction: null };

    let cookies = [];
    try {
      cookies = await page.context().cookies();
    } catch {
      return { connected: false, friction: null }; // context mid-teardown: look again next time
    }
    const has = (name, host) =>
      cookies.some(
        (c) => c.name === name && String(c.domain ?? "").includes(host) && String(c.value ?? "").length > 8,
      );
    const session =
      platform === "instagram" ? has("sessionid", "instagram.com")
      : platform === "tiktok" ? has("sessionid", "tiktok.com") || has("sid_tt", "tiktok.com")
      : platform === "youtube" ? has("SAPISID", "google.com") || has("SAPISID", "youtube.com")
      : false;
    if (session) return { connected: true, friction: null };

    /*
     * No cookie, not on a login page — a landing page that has not asked
     * yet, usually. Wrapped, because page.$ throws when the tab navigates
     * mid-call, which is exactly what submitting a login form does.
     */
    const spec = MARKERS[platform];
    let out = false, inn = false;
    try {
      for (const sel of spec.out) if (await page.$(sel)) { out = true; break; }
      if (!out) for (const sel of spec.in) if (await page.$(sel)) { inn = true; break; }
    } catch {
      return { connected: false, friction: null };
    }
    if (out) return { connected: false, friction: null };
    if (inn) return { connected: true, friction: null };

    return { connected: false, friction: "could not tell — the page did not look like either state" };
  } catch {
    return { connected: false, friction: null };
  }
}

/* --------------------------------------------------------------- who */

/**
 * The handle the account is actually signed in as, or null.
 *
 * A connection with no readable handle is not a connection, so this is the
 * step that decides. It navigates within the platform (profile, account
 * page) and leaves the page there; the caller's screen stays on the site.
 */
export async function whoAmI(page, platform) {
  try {
    if (platform === "instagram") return await instagramHandle(page);
    if (platform === "tiktok") return await tiktokHandle(page);
    if (platform === "youtube") return await youtubeHandle(page);
  } catch {
    /* A handle we could not read is not a reason to stop. */
  }
  return null;
}

/**
 * Not /accounts/edit/: that page bounces to Meta's Accounts Center on a
 * different origin and the username field never appears. Ask what the web
 * app itself asks — the current-user endpoint, from instagram.com, with the
 * session cookies the tab already holds. If that is refused, the home page
 * embeds the viewer in its JSON, and the profile link in the left rail
 * points at the account's own page.
 */
async function instagramHandle(page) {
  if (!/instagram\.com/.test(String(page.url?.() ?? ""))) {
    await go(page, HOME.instagram);
  }
  await sleep(between(1200, 1900));
  const found = await ask(page, async () => {
    try {
      const r = await fetch("/api/v1/accounts/current_user/?edit=true", {
        credentials: "include",
        headers: { "x-ig-app-id": "936619743392459", "x-requested-with": "XMLHttpRequest" },
      });
      if (r.ok) {
        const j = await r.json();
        const u = j && j.user && j.user.username;
        if (u) return { via: "api", handle: u };
      }
    } catch {}
    const html = document.documentElement.innerHTML;
    const m = /"viewer"\s*:\s*\{[^{}]*?"username"\s*:\s*"([\w.]+)"/.exec(html);
    if (m) return { via: "viewer", handle: m[1] };
    const img = document.querySelector('a[href^="/"] img[alt$="profile picture" i]');
    const link = img && img.closest("a");
    const h = link && link.getAttribute("href") ? link.getAttribute("href").replace(/^\/|\/$/g, "") : null;
    if (h && !h.includes("/")) return { via: "rail", handle: h };
    return null;
  }, undefined, 12000);
  const handle = found && typeof found.handle === "string" ? found.handle.trim() : "";
  return /^[\w.]{1,40}$/.test(handle) ? `@${handle}` : null;
}

/**
 * Not a[href^="/@"]: that matches every creator link in the feed, and the
 * first one found would be recorded as our own handle. /profile redirects a
 * signed-in account to its own /@handle, and the URL cannot be somebody
 * else's.
 */
async function tiktokHandle(page) {
  await go(page, "https://www.tiktok.com/profile");
  await sleep(between(1200, 1900));
  const m = /tiktok\.com\/(@[\w.-]+)/.exec(String(page.url?.() ?? ""));
  return m ? m[1] : null;
}

/**
 * The account page shows exactly one channel — the signed-in one — so a
 * handle found anywhere in its text is ours. The element ids come and go;
 * the text does not.
 *
 * The page also prints the Google address, and "alex@gmail.com" contains
 * "@gmail.com" — which was recorded as the channel handle once. A handle
 * stands on its own: nothing before the @, and it is never a mailbox domain.
 * No channel yet means no handle, and that is the truth to report rather
 * than the nearest @-shaped string.
 */
async function youtubeHandle(page) {
  await go(page, "https://www.youtube.com/account");
  await sleep(between(2000, 3000));
  const found = await ask(page, () => {
    const el = document.querySelector("#channel-handle, yt-formatted-string#handle");
    const t = el && el.textContent ? el.textContent.trim() : "";
    if (t && t.startsWith("@") && !/@[\w.-]+@/.test(t)) return t;
    const text = (document.body && document.body.innerText) || "";
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
  if (typeof found !== "string") return null;
  const h = found.trim();
  // Belt and braces, outside the page: never an address, never a domain.
  if (!/^@[\w.-]{3,30}$/.test(h)) return null;
  if (/^@(gmail|googlemail|icloud|me|yahoo|hotmail|outlook|live|proton|protonmail|mail)\./i.test(h)) return null;
  if (/\.(com|net|org|edu|gov)$/i.test(h)) return null;
  return h;
}
