/**
 * Its own Chrome, headless, with its own profile.
 *
 * Real Google Chrome rather than Playwright's Chromium, because the accounts
 * are real and the sites look at the browser. Headless, because the window is
 * the Swift shell's — the pages are shown as live screens of themselves and
 * Chrome never gets a window of its own. If a platform refuses headless,
 * ORGANIC_HEADED=1 runs it headed with its window parked off-screen: still
 * one visible window.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

export const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export function chromePath() {
  return process.env.ORGANIC_CHROME || process.env.OX_CHROME || MAC_CHROME;
}

export function chromeArgs({ port, profile, headed = process.env.ORGANIC_HEADED === "1" }) {
  return [
    ...(headed ? ["--window-position=-4000,-4000"] : ["--headless=new"]),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
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
    "--window-size=1280,900",
    ...(process.env.ORGANIC_CHROME_ARGS ? process.env.ORGANIC_CHROME_ARGS.split(" ").filter(Boolean) : []),
    "about:blank",
  ];
}

/**
 * Connect to the Chrome on `port`, starting one if nothing answers.
 *
 * A Chrome that is already there — from before a self-update restart — is
 * attached to, tabs and sessions intact. Exactly one context is ever used;
 * pages are created only by Screens.
 */
export async function openChrome({ port = 9444, profile } = {}) {
  if (!profile) throw new Error("openChrome needs a profile directory");
  const endpoint = `http://127.0.0.1:${port}`;
  try {
    const browser = await chromium.connectOverCDP(endpoint, { timeout: 4000 });
    return { browser, started: false, child: null };
  } catch {
    /* nothing listening yet — start one */
  }

  const bin = chromePath();
  const args = chromeArgs({ port, profile });

  /*
   * spawn, not execFile: execFile buffers stderr up to a megabyte and then
   * kills the child, and Chrome writes to stderr steadily. Only the first
   * line is kept, for the error message; the rest is drained.
   */
  let why = null;
  let exited = false;
  const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"], detached: false });
  child.on("error", (error) => { why = error.message; exited = true; });
  child.on("exit", (code) => { exited = true; if (!why) why = `exited with ${code}`; });
  child.stderr?.once("data", (chunk) => { why = String(chunk).trim().split("\n")[0]; });
  child.stderr?.on("data", () => {});
  child.unref?.();

  for (let i = 0; i < 60; i++) {
    await sleep(250);
    if (exited && child.exitCode !== null) break;
    try {
      const browser = await chromium.connectOverCDP(endpoint, { timeout: 3000 });
      return { browser, started: true, child };
    } catch {
      /* keep waiting */
    }
  }
  throw new Error(
    `Chrome did not open a debugging port on ${port}. Tried: ${bin}` + (why ? ` — it said: ${why}` : ""),
  );
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
