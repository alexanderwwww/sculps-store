/**
 * Its own browser, its own folder, no ports.
 *
 * This used to launch the Google Chrome on the Mac with a debugging port and
 * attach to it. On Alex's machine that failed every single time with "Chrome
 * did not open a debugging port on 9444" — because his own Chrome was already
 * open, and macOS hands a second launch of the same app to the copy that is
 * already running, which throws our flags away. Nothing in this file could
 * fix that: it was a fight with the browser he uses all day.
 *
 * So the app brings its own. Playwright's Chromium, started directly into a
 * persistent profile of its own — no debugging port to be taken, no singleton
 * lock to collide with, and his Chrome is never touched. It costs a download
 * the first time the app opens.
 *
 * Every page in it is an iPhone: 390x844 at three times the pixels, touch,
 * iPhone user agent. Instagram and TikTok then serve their mobile site, which
 * is lighter to paint, quicker to stream, and the shape Alex asked to look at.
 * The market screen is put back to a desktop in Screens, because the Ad
 * Library is a desktop page.
 */
import { chromium } from "playwright";
import { rm } from "node:fs/promises";
import { join } from "node:path";

/** What a current iPhone says it is. */
export const IPHONE = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

/**
 * Remove the singleton files a dead browser left in a profile.
 *
 * Kept because the profile is still a Chromium profile: killed mid-run it
 * leaves the same lock, and the next start would die on it.
 */
export async function clearStaleLocks(profile) {
  const cleared = [];
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    try {
      await rm(join(profile, name), { force: true, recursive: true });
      cleared.push(name);
    } catch {
      /* not there, or not ours to remove */
    }
  }
  return cleared;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export function chromePath() {
  return process.env.ORGANIC_CHROME || process.env.OX_CHROME || MAC_CHROME;
}

/*
 * Headed, off-screen, by default.
 *
 * Headless Chrome on macOS paints in software: no GPU, every frame composited
 * on the CPU. On a site as heavy as Instagram that is the difference between
 * a live picture and a slideshow — and a slideshow makes clicking feel broken,
 * because the click lands and the proof of it arrives a second later.
 *
 * A headed Chrome gets the GPU. Parked at -4000,-4000 it is never on a screen
 * Alex looks at, and the app's own window is still the only thing he sees.
 * ORGANIC_HEADLESS=1 forces the old behaviour; the Linux tests set it.
 */
export function chromeArgs({ headed = process.env.ORGANIC_HEADLESS !== "1" } = {}) {
  return [
    /*
     * Headed, but parked where no screen is.
     *
     * Headless paints in software on macOS: no GPU, every frame composited on
     * the CPU, and a heavy feed turns into a slideshow. Headed at -4000,-4000
     * gets the GPU and is still never on a display Alex looks at — the app's
     * own window stays the only thing he sees.
     */
    ...(headed
      ? ["--window-position=-4000,-4000", "--disable-backgrounding-occluded-windows",
         "--disable-renderer-backgrounding", "--disable-features=CalculateNativeWinOcclusion"]
      : []),
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-crash-restore-bubble",
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    "--disable-default-apps",
    "--disable-sync",
    "--no-service-autorun",
    "--password-store=basic",
    "--disable-search-engine-choice-screen",
    "--disable-features=ChromeWhatsNewUI,PrivacySandboxSettings4,PrivacySandboxSettings3,SidePanelPinning,OptimizationGuideModelDownloading",
    ...(process.env.ORGANIC_CHROME_ARGS ? process.env.ORGANIC_CHROME_ARGS.split(" ").filter(Boolean) : []),
  ];
}

/**
 * A persistent context is not a Browser, and the rest of the app holds a
 * Browser. This is the two lines of difference, in one place: the context is
 * the only context, closing the app closes it, and "disconnected" is the
 * context closing.
 */
function asBrowser(context) {
  return {
    contexts: () => [context],
    newContext: async () => context,
    on: (event, handler) => context.on(event === "disconnected" ? "close" : event, handler),
    close: () => context.close(),
    isConnected: () => true,
    __context: context,
  };
}

/**
 * Start the app's own browser on its own profile.
 *
 * No port and no attach step: nothing else can be holding this profile, so
 * there is nothing to connect to. A lock from a browser that was killed is
 * cleared first — the only thing that survives from the old way.
 */
export async function openChrome({ profile, phone = true } = {}) {
  if (!profile) throw new Error("openChrome needs a profile directory");
  await clearStaleLocks(profile);

  const options = {
    headless: process.env.ORGANIC_HEADLESS === "1",
    args: chromeArgs(),
    ignoreDefaultArgs: ["--enable-automation"],
    ...(phone ? IPHONE : { viewport: { width: 1280, height: 900 } }),
    locale: "en-US",
    ...(process.env.ORGANIC_CHROME || process.env.OX_CHROME
      ? { executablePath: process.env.ORGANIC_CHROME || process.env.OX_CHROME }
      : {}),
  };

  let context;
  try {
    context = await chromium.launchPersistentContext(profile, options);
  } catch (error) {
    /*
     * Said in the words of what to do about it. The usual cause on a first
     * run is the browser not being downloaded yet, which the launcher does —
     * so this is what a half-finished install looks like.
     */
    const why = String(error?.message ?? error).split("\n")[0];
    throw new Error(`the browser would not start: ${why}`);
  }
  return { browser: asBrowser(context), context, started: true, child: null };
}

/**
 * Every call into a page, with a deadline. page.evaluate has no timeout of
 * its own and a page whose main thread is busy makes it wait forever.
 * Returns null on any failure — nothing here is allowed to throw at the
 * caller for a page that did not answer.
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
